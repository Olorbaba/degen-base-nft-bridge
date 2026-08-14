import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, createWalletClient, defineChain, fallback, formatEther, http as viemHttp, parseAbiItem } from 'viem';
import { sourceAbi, mirrorAbi, erc721MetadataAbi, erc1155MetadataAbi } from './abis.js';
import { loadState, saveState } from './state.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(here, '../docs');
const n = (env, name, fallback) => env[name] === undefined ? fallback : Number(env[name]);
const bool = (env, name, fallback = false) => env[name] === undefined ? fallback : env[name] === 'true';
const uniqueUrls = values => [...new Set(values.flatMap(value => String(value || '').split(',')).map(value => value.trim()).filter(Boolean))];
const address = (value, name) => {
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${name} must be a 20-byte hex address`);
  return value;
};

export function readConfig(env = process.env) {
  const sourceRpcUrl = env.SOURCE_RPC_URL || env.DEGEN_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
  const destinationRpcUrl = env.BASE_RPC_URL || 'https://base-sepolia-rpc.publicnode.com';
  const sourceChainId = Number(env.SOURCE_CHAIN_ID || env.DEGEN_CHAIN_ID || 11155111);
  const destinationChainId = Number(env.BASE_CHAIN_ID || 84532);
  const destinationRpcUrls = uniqueUrls([
    env.BASE_RPC_URLS,
    destinationRpcUrl,
    destinationChainId === 84532 ? 'https://base-sepolia.drpc.org' : null,
    destinationChainId === 84532 ? 'https://sepolia.base.org' : null
  ]);
  const sourceIsDegen = sourceChainId === 666666666;
  const sourceSymbol = env.SOURCE_CURRENCY_SYMBOL || (sourceIsDegen ? 'DEGEN' : 'ETH');
  const sourceName = env.SOURCE_CHAIN_NAME || (sourceIsDegen ? 'Degen Chain' : sourceChainId === 11155111 ? 'Ethereum Sepolia' : `Source chain ${sourceChainId}`);
  const sourceChain = defineChain({ id: sourceChainId, name: sourceName, nativeCurrency: { name: sourceSymbol === 'ETH' ? 'Ether' : sourceSymbol, symbol: sourceSymbol, decimals: 18 }, rpcUrls: { default: { http: [sourceRpcUrl] } } });
  const destinationChain = defineChain({ id: destinationChainId, name: destinationChainId === 8453 ? 'Base' : 'Base Sepolia', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: destinationRpcUrls } } });
  const privateKey = env.RELAYER_PRIVATE_KEY && /^0x[0-9a-fA-F]{64}$/.test(env.RELAYER_PRIVATE_KEY) ? env.RELAYER_PRIVATE_KEY : null;
  const account = privateKey ? privateKeyToAccount(privateKey) : null;
  const relayerAddress = address(env.RELAYER_ADDRESS || account?.address, 'RELAYER_ADDRESS');
  if (account && account.address.toLowerCase() !== relayerAddress.toLowerCase()) throw new Error('RELAYER_ADDRESS does not match RELAYER_PRIVATE_KEY');

  const requestedRelay = bool(env, 'RELAY_ENABLED');
  const hybridRoute = sourceChainId === 666666666 && destinationChainId === 84532;
  const hybridAllowed = bool(env, 'ALLOW_HYBRID_BRIDGE');
  const degenMainnetAllowed = bool(env, 'ALLOW_DEGEN_MAINNET');
  const relayEnabled = requestedRelay
    && (!sourceIsDegen || degenMainnetAllowed)
    && (!hybridRoute || hybridAllowed);
  if (relayEnabled && !account) throw new Error('RELAYER_PRIVATE_KEY is required when RELAY_ENABLED=true');
  const safetyReason = relayEnabled
    ? null
    : hybridRoute && !hybridAllowed
      ? 'Degen mainnet → Base Sepolia is a proof route. Deposits are disabled to prevent locking real NFTs for testnet assets.'
      : sourceIsDegen && !degenMainnetAllowed
        ? 'Degen mainnet is safety locked until ALLOW_DEGEN_MAINNET=true is explicitly configured.'
      : 'Relaying is disabled by the operator.';

  return {
    sourceChain, destinationChain, sourceRpcUrl, destinationRpcUrl, destinationRpcUrls, account, relayerAddress,
    sourceVault: address(env.SOURCE_VAULT_ADDRESS, 'SOURCE_VAULT_ADDRESS'),
    mirror: address(env.BASE_MIRROR_ADDRESS, 'BASE_MIRROR_ADDRESS'),
    sourceStartBlock: BigInt(env.SOURCE_START_BLOCK || 0),
    sourceConfirmations: BigInt(n(env, 'SOURCE_CONFIRMATIONS', 5)),
    destinationConfirmations: BigInt(n(env, 'DESTINATION_CONFIRMATIONS', 5)),
    pollIntervalMs: n(env, 'POLL_INTERVAL_MS', 15_000),
    stateFile: env.STATE_FILE || './relayer-state.json',
    port: n(env, 'PORT', 8787),
    corsOrigin: env.CORS_ORIGIN || '*',
    publicAppUrl: env.PUBLIC_APP_URL || '',
    relayEnabled, requestedRelay, hybridRoute, degenMainnetAllowed, safetyReason
  };
}

const bridgeEvent = parseAbiItem('event NFTBridged(bytes32 indexed id,address indexed collection,uint256 indexed tokenId,address holder,uint8 tokenStandard,uint256 amount,string tokenUri,uint256 timestamp)');

export function createRpcTransport(urls, transportFactory = viemHttp) {
  return fallback(urls.map((url, index) => transportFactory(url, {
    key: `rpc-${index}`,
    name: `RPC ${index + 1}`,
    retryCount: 1,
    retryDelay: 500,
    timeout: 20_000
  })), { retryCount: 1, retryDelay: 750 });
}

export function createRelayer(config, clients = {}) {
  const destinationTransport = createRpcTransport(config.destinationRpcUrls || [config.destinationRpcUrl]);
  const source = clients.source || createPublicClient({ chain: config.sourceChain, transport: viemHttp(config.sourceRpcUrl, { retryCount: 5 }) });
  const destination = clients.destination || createPublicClient({ chain: config.destinationChain, transport: destinationTransport });
  const wallet = clients.wallet || (config.relayEnabled ? createWalletClient({ account: config.account, chain: config.destinationChain, transport: destinationTransport }) : null);
  let state;
  let running = false;
  let lastPollAt = null;
  let lastSuccessfulPollAt = null;
  let lastError = null;

  async function receiptStatus(hash) {
    const receipt = await destination.getTransactionReceipt({ hash });
    if (receipt.status === 'reverted') throw new Error(`destination transaction reverted: ${hash}`);
    const latest = await destination.getBlockNumber();
    const confirmations = latest >= receipt.blockNumber ? latest - receipt.blockNumber + 1n : 0n;
    if (confirmations < config.destinationConfirmations) return null;
    return receipt;
  }

  async function reconcilePending() {
    for (const transfer of Object.values(state.transfers)) {
      if (transfer.status !== 'submitted') continue;
      try {
        const receipt = await receiptStatus(transfer.destinationTxHash);
        if (!receipt) continue;
        transfer.status = 'completed';
        transfer.destinationBlock = receipt.blockNumber.toString();
        transfer.completedAt = new Date().toISOString();
      } catch (error) {
        if (String(error.message).includes('reverted')) {
          transfer.status = 'error';
          transfer.error = error.message;
        }
      }
    }
  }

  async function hydrateCompletedTransfers() {
    for (const transfer of Object.values(state.transfers)) {
      if (transfer.status !== 'completed' || transfer.mirrorTokenId) continue;
      try {
        const mirrorTokenId = await destination.readContract({ address: config.mirror, abi: mirrorAbi, functionName: 'tokenIdForBridgeId', args: [transfer.id] });
        if (mirrorTokenId !== 0n) transfer.mirrorTokenId = mirrorTokenId.toString();
      } catch { /* enrichment is retried on the next poll */ }
    }
  }

  async function processTransfer(log) {
    const args = log.args;
    const id = args.id;
    const existing = state.transfers[id];
    if (existing?.status === 'completed') return;
    const transfer = existing || (state.transfers[id] = {
      id,
      sourceCollection: args.collection,
      sourceTokenId: args.tokenId.toString(),
      holder: args.holder,
      tokenStandard: Number(args.tokenStandard),
      amount: args.amount.toString(),
      sourceBlock: log.blockNumber.toString(),
      sourceTxHash: log.transactionHash,
      status: 'discovered',
      discoveredAt: new Date().toISOString()
    });

    if (transfer.status === 'submitted') return;
    let uri = args.tokenUri;
    try {
      const metadataAbi = Number(args.tokenStandard) === 2 ? erc1155MetadataAbi : erc721MetadataAbi;
      const metadataFunction = Number(args.tokenStandard) === 2 ? 'uri' : 'tokenURI';
      uri = await source.readContract({ address: args.collection, abi: metadataAbi, functionName: metadataFunction, args: [args.tokenId], blockNumber: log.blockNumber });
    } catch { /* use the vault's event snapshot */ }
    transfer.tokenUri = uri;

    const alreadyMinted = await destination.readContract({ address: config.mirror, abi: mirrorAbi, functionName: 'tokenIdForBridgeId', args: [id] });
    if (alreadyMinted !== 0n) {
      transfer.status = 'completed';
      transfer.mirrorTokenId = alreadyMinted.toString();
      transfer.completedAt ||= new Date().toISOString();
      return;
    }
    if (!config.relayEnabled) return;

    const hash = await wallet.writeContract({ address: config.mirror, abi: mirrorAbi, functionName: 'mintFromDegen', args: [id, args.holder, args.collection, args.tokenId, uri] });
    transfer.destinationTxHash = hash;
    transfer.status = 'submitted';
    transfer.submittedAt = new Date().toISOString();
  }

  async function poll() {
    if (running) return;
    running = true;
    lastPollAt = new Date().toISOString();
    try {
      await reconcilePending();
      await hydrateCompletedTransfers();
      const latest = await source.getBlockNumber();
      const finalized = latest > config.sourceConfirmations ? latest - config.sourceConfirmations : 0n;
      let from = BigInt(state.nextBlock);
      if (from <= finalized) {
        const to = from + 1_999n < finalized ? from + 1_999n : finalized;
        const logs = await source.getLogs({ address: config.sourceVault, event: bridgeEvent, fromBlock: from, toBlock: to });
        for (const log of logs) await processTransfer(log);
        state.nextBlock = (to + 1n).toString();
      }
      await saveState(config.stateFile, state);
      lastSuccessfulPollAt = new Date().toISOString();
      lastError = null;
    } catch (error) {
      lastError = error.message;
      console.error(`[relayer] ${error.stack || error.message}`);
    } finally { running = false; }
  }

  async function start() {
    state = await loadState(config.stateFile, config.sourceStartBlock);
    await poll();
    const timer = setInterval(poll, config.pollIntervalMs);
    return () => clearInterval(timer);
  }

  function snapshot() { return state || { version: 1, nextBlock: config.sourceStartBlock.toString(), transfers: {} }; }
  function runtime() { return { running, lastPollAt, lastSuccessfulPollAt, lastError }; }
  return { start, poll, snapshot, runtime, processTransfer, clients: { source, destination } };
}

function transferList(snapshot) {
  return Object.values(snapshot.transfers).sort((a, b) => Number(BigInt(b.sourceBlock) - BigInt(a.sourceBlock)));
}

export function createStatusService(config, relayer) {
  async function publicConfig() {
    return {
      appName: 'Degen → Base NFT Bridge',
      bridgeEnabled: config.relayEnabled,
      safetyReason: config.safetyReason,
      routeMode: config.hybridRoute ? 'controlled-test' : 'production',
      source: { name: config.sourceChain.name, chainId: config.sourceChain.id, currency: config.sourceChain.nativeCurrency.symbol, rpcUrl: config.sourceRpcUrl, explorerUrl: config.sourceChain.id === 11155111 ? 'https://sepolia.etherscan.io' : 'https://explorer.degen.tips', vault: config.sourceVault, confirmations: config.sourceConfirmations.toString() },
      destination: { name: config.destinationChain.name, chainId: config.destinationChain.id, currency: 'ETH', rpcUrl: config.destinationRpcUrls?.[0] || config.destinationRpcUrl, rpcUrls: config.destinationRpcUrls || [config.destinationRpcUrl], explorerUrl: config.destinationChain.id === 8453 ? 'https://basescan.org' : 'https://sepolia.basescan.org', mirror: config.mirror, confirmations: config.destinationConfirmations.toString() },
      relayer: config.relayerAddress,
      publicAppUrl: config.publicAppUrl
    };
  }

  async function status() {
    const snapshot = relayer.snapshot();
    const transfers = transferList(snapshot);
    const counts = { discovered: 0, submitted: 0, completed: 0, error: 0 };
    for (const transfer of transfers) counts[transfer.status] = (counts[transfer.status] || 0) + 1;
    const checks = await Promise.allSettled([
      relayer.clients.source.getBalance({ address: config.relayerAddress }),
      relayer.clients.destination.getBalance({ address: config.relayerAddress }),
      relayer.clients.source.readContract({ address: config.sourceVault, abi: sourceAbi, functionName: 'depositCount' }),
      relayer.clients.source.getBlockNumber(),
      relayer.clients.destination.getBlockNumber()
    ]);
    const value = (index, fallback) => checks[index].status === 'fulfilled' ? checks[index].value : fallback;
    const sourceBalance = value(0, null);
    const destinationBalance = value(1, null);
    const depositCount = value(2, BigInt(transfers.length));
    const sourceBlock = value(3, null);
    const destinationBlock = value(4, null);
    const errors = checks.flatMap((check, index) => check.status === 'rejected' ? [{ check: ['sourceBalance', 'destinationBalance', 'depositCount', 'sourceBlock', 'destinationBlock'][index], message: check.reason?.message || String(check.reason) }] : []);
    const indexed = BigInt(transfers.length);
    const notIndexed = depositCount > indexed ? depositCount - indexed : 0n;
    return {
      ok: errors.length === 0,
      degraded: errors.length > 0,
      errors,
      relayEnabled: config.relayEnabled,
      safetyReason: config.safetyReason,
      queue: { waiting: counts.discovered + counts.error + Number(notIndexed), discovered: counts.discovered, submitted: counts.submitted, completed: counts.completed, failed: counts.error, notIndexed: Number(notIndexed), totalDeposits: depositCount.toString() },
      balances: { address: config.relayerAddress, degen: sourceBalance === null ? null : formatEther(sourceBalance), eth: destinationBalance === null ? null : formatEther(destinationBalance) },
      blocks: { source: sourceBlock?.toString() || null, destination: destinationBlock?.toString() || null, nextSourceBlock: snapshot.nextBlock },
      runtime: relayer.runtime(),
      updatedAt: new Date().toISOString()
    };
  }

  function transfers() { return transferList(relayer.snapshot()); }
  return { publicConfig, status, transfers };
}

const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };
function sendJson(response, status, value, corsOrigin) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': corsOrigin, 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function readJsonBody(request, maxBytes = 4096) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > maxBytes) throw new Error('request body too large');
  }
  return body ? JSON.parse(body) : {};
}

export async function relayById(relayer, statusService, bridgeId) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(bridgeId || '')) return { statusCode: 400, body: { error: 'invalid bridge ID' } };
  await relayer.poll();
  const transfer = statusService.transfers().find(item => item.id.toLowerCase() === bridgeId.toLowerCase());
  if (!transfer) return { statusCode: 202, body: { status: 'accepted', bridgeId, message: 'Waiting for source confirmations and the next relayer poll.' } };
  return {
    statusCode: transfer.status === 'completed' ? 200 : 202,
    body: {
      status: transfer.status,
      bridgeId,
      destinationTxHash: transfer.destinationTxHash || null,
      mirrorTokenId: transfer.mirrorTokenId || null
    }
  };
}

export function createHttpServer(relayer, config, statusService = createStatusService(config, relayer)) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'OPTIONS') {
        response.writeHead(204, { 'access-control-allow-origin': config.corsOrigin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' });
        response.end(); return;
      }
      if (request.method === 'POST' && url.pathname === '/api/relay') {
        const { bridgeId } = await readJsonBody(request);
        const result = await relayById(relayer, statusService, bridgeId);
        return sendJson(response, result.statusCode, result.body, config.corsOrigin);
      }
      if (request.method === 'GET' && url.pathname === '/healthz') return sendJson(response, 200, { ok: true, service: 'degen-base-nft-bridge', relayEnabled: config.relayEnabled }, config.corsOrigin);
      if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/api/status')) return sendJson(response, 200, await statusService.status(), config.corsOrigin);
      if (request.method === 'GET' && url.pathname === '/api/config') return sendJson(response, 200, await statusService.publicConfig(), config.corsOrigin);
      if (request.method === 'GET' && (url.pathname === '/transfers' || url.pathname === '/api/transfers')) return sendJson(response, 200, { transfers: statusService.transfers() }, config.corsOrigin);
      if (request.method === 'GET' && url.pathname.startsWith('/api/transfers/')) {
        const id = decodeURIComponent(url.pathname.slice('/api/transfers/'.length));
        const transfer = statusService.transfers().find(item => item.id.toLowerCase() === id.toLowerCase());
        return sendJson(response, transfer ? 200 : 404, transfer || { error: 'transfer not found' }, config.corsOrigin);
      }
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'method not allowed' }, config.corsOrigin);

      const requested = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
      const file = path.resolve(docsRoot, requested);
      if (!file.startsWith(`${docsRoot}${path.sep}`) && file !== path.join(docsRoot, 'index.html')) return sendJson(response, 403, { error: 'forbidden' }, config.corsOrigin);
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return sendJson(response, 404, { error: 'not found' }, config.corsOrigin);
      response.writeHead(200, { 'content-type': contentTypes[path.extname(file)] || 'application/octet-stream', 'cache-control': path.extname(file) === '.html' ? 'no-cache' : 'public, max-age=300' });
      fs.createReadStream(file).pipe(response);
    } catch (error) {
      sendJson(response, 500, { error: 'internal server error', message: error.message }, config.corsOrigin);
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const config = readConfig();
    const relayer = createRelayer(config);
    const server = createHttpServer(relayer, config);
    await relayer.start();
    server.listen(config.port, () => console.log(`Degen → Base service listening on :${config.port}; relaying ${config.relayEnabled ? 'enabled' : 'disabled'}; relayer ${config.relayerAddress}`));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
