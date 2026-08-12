import 'dotenv/config';
import http from 'node:http';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, createWalletClient, defineChain, http as viemHttp, parseAbiItem } from 'viem';
import { sourceAbi, mirrorAbi, erc721MetadataAbi } from './abis.js';
import { loadState, saveState } from './state.js';

const n = (env, name, fallback) => env[name] === undefined ? fallback : Number(env[name]);
const address = (value, name) => {
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${name} must be a 20-byte hex address`);
  return value;
};

export function readConfig(env = process.env) {
  const sourceRpcUrl = env.DEGEN_RPC_URL || 'https://rpc.degen.tips';
  const destinationRpcUrl = env.BASE_RPC_URL || 'https://sepolia.base.org';
  const sourceChain = defineChain({ id: Number(env.DEGEN_CHAIN_ID || 666666666), name: 'Degen', nativeCurrency: { name: 'DEGEN', symbol: 'DEGEN', decimals: 18 }, rpcUrls: { default: { http: [sourceRpcUrl] } } });
  const destinationChain = defineChain({ id: Number(env.BASE_CHAIN_ID || 84532), name: 'Base', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [destinationRpcUrl] } } });
  const key = env.RELAYER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('RELAYER_PRIVATE_KEY must be a 32-byte hex private key');
  const account = privateKeyToAccount(key);
  const sourceChainId = Number(env.DEGEN_CHAIN_ID || 666666666);
  const destinationChainId = Number(env.BASE_CHAIN_ID || 84532);
  if (sourceChainId === 666666666 && destinationChainId === 84532 && env.ALLOW_HYBRID_BRIDGE !== 'true') {
    throw new Error('Refusing Degen mainnet → Base Sepolia relaying. Set ALLOW_HYBRID_BRIDGE=true only for a controlled sacrificial-NFT test.');
  }
  return {
    sourceChain, destinationChain, account,
    sourceVault: address(env.SOURCE_VAULT_ADDRESS, 'SOURCE_VAULT_ADDRESS'),
    mirror: address(env.BASE_MIRROR_ADDRESS, 'BASE_MIRROR_ADDRESS'),
    sourceStartBlock: BigInt(env.SOURCE_START_BLOCK || 0),
    sourceConfirmations: BigInt(n(env, 'SOURCE_CONFIRMATIONS', 5)),
    destinationConfirmations: BigInt(n(env, 'DESTINATION_CONFIRMATIONS', 5)),
    pollIntervalMs: n(env, 'POLL_INTERVAL_MS', 15_000),
    stateFile: env.STATE_FILE || './relayer-state.json',
    port: n(env, 'PORT', 8787)
  };
}

const bridgeEvent = parseAbiItem('event NFTBridged(bytes32 indexed id,address indexed collection,uint256 indexed tokenId,address holder,string tokenUri,uint256 timestamp)');

export function createRelayer(config, clients = {}) {
  const source = clients.source || createPublicClient({ chain: config.sourceChain, transport: viemHttp() });
  const destination = clients.destination || createPublicClient({ chain: config.destinationChain, transport: viemHttp() });
  const wallet = clients.wallet || createWalletClient({ account: config.account, chain: config.destinationChain, transport: viemHttp() });
  let state;
  let running = false;

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
        transfer.completedAt = new Date().toISOString();
      } catch (error) {
        if (String(error.message).includes('reverted')) {
          transfer.status = 'error';
          transfer.error = error.message;
        }
      }
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
      sourceBlock: log.blockNumber.toString(),
      sourceTxHash: log.transactionHash,
      status: 'discovered',
      discoveredAt: new Date().toISOString()
    });

    if (transfer.status === 'submitted') return;
    let uri = args.tokenUri;
    try {
      // Read at the finalized source block. The vault also snapshots the URI,
      // so the event value remains a deterministic fallback for unusual NFTs.
      uri = await source.readContract({ address: args.collection, abi: erc721MetadataAbi, functionName: 'tokenURI', args: [args.tokenId], blockNumber: log.blockNumber });
    } catch { /* use the vault's event snapshot */ }
    transfer.tokenUri = uri;

    const alreadyMinted = await destination.readContract({ address: config.mirror, abi: mirrorAbi, functionName: 'tokenIdForBridgeId', args: [id] });
    if (alreadyMinted !== 0n) {
      transfer.status = 'completed';
      transfer.mirrorTokenId = alreadyMinted.toString();
      transfer.completedAt = new Date().toISOString();
      return;
    }
    const hash = await wallet.writeContract({ address: config.mirror, abi: mirrorAbi, functionName: 'mintFromDegen', args: [id, args.holder, args.collection, args.tokenId, uri] });
    transfer.destinationTxHash = hash;
    transfer.status = 'submitted';
    transfer.submittedAt = new Date().toISOString();
  }

  async function poll() {
    if (running) return;
    running = true;
    try {
      await reconcilePending();
      const latest = await source.getBlockNumber();
      const finalized = latest > config.sourceConfirmations ? latest - config.sourceConfirmations : 0n;
      let from = BigInt(state.nextBlock);
      if (from > finalized) return;
      // Keep RPC requests bounded; this also works with providers that cap log ranges.
      const to = from + 1_999n < finalized ? from + 1_999n : finalized;
      const logs = await source.getLogs({ address: config.sourceVault, event: bridgeEvent, fromBlock: from, toBlock: to });
      for (const log of logs) await processTransfer(log);
      state.nextBlock = (to + 1n).toString();
      await saveState(config.stateFile, state);
    } catch (error) {
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
  return { start, poll, snapshot, processTransfer };
}

export function createHttpServer(relayer) {
  return http.createServer((request, response) => {
    response.setHeader('content-type', 'application/json; charset=utf-8');
    if (request.url === '/health') { response.writeHead(200); response.end(JSON.stringify({ ok: true, ...relayer.snapshot() })); return; }
    if (request.url === '/transfers') { response.writeHead(200); response.end(JSON.stringify(relayer.snapshot().transfers)); return; }
    response.writeHead(404); response.end(JSON.stringify({ error: 'not found' }));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const config = readConfig();
    const relayer = createRelayer(config);
    const server = createHttpServer(relayer);
    await relayer.start();
    server.listen(config.port, () => console.log(`Degen → Base relayer listening on :${config.port} as ${config.account.address}`));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
