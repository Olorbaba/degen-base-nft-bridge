import { createPublicClient, createWalletClient, defineChain, formatEther, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sourceAbi, mirrorAbi } from '../src/abis.js';

const DEFAULTS = {
  sourceRpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
  destinationRpcUrl: 'https://sepolia.base.org',
  sourceChainId: 11155111,
  destinationChainId: 84532,
  sourceVault: '0xC6a0208aE6FAb9c5Ddfe59700900EBcC6661A8a2',
  mirror: '0xa0A44dEAD4F124B425DeE4466d542DD612D10517',
  relayer: '0x96D743afDcAaFd99d2fBD70A6949f41cDd2B282D',
  // The clean public proof starts here. An earlier operator-only smoke event is
  // deliberately excluded from the public evaluation index.
  sourceStartBlock: 11472899,
  destinationStartBlock: 45382400,
  sourceConfirmations: 1,
  destinationConfirmations: 1
};

const env = (key, fallback) => process.env[key] ?? fallback;
const config = {
  sourceRpcUrl: env('SOURCE_RPC_URL', DEFAULTS.sourceRpcUrl),
  destinationRpcUrl: env('BASE_RPC_URL', DEFAULTS.destinationRpcUrl),
  sourceChainId: Number(env('SOURCE_CHAIN_ID', DEFAULTS.sourceChainId)),
  destinationChainId: Number(env('BASE_CHAIN_ID', DEFAULTS.destinationChainId)),
  sourceVault: env('SOURCE_VAULT_ADDRESS', DEFAULTS.sourceVault),
  mirror: env('BASE_MIRROR_ADDRESS', DEFAULTS.mirror),
  relayer: env('RELAYER_ADDRESS', DEFAULTS.relayer),
  sourceStartBlock: BigInt(env('SOURCE_START_BLOCK', DEFAULTS.sourceStartBlock)),
  destinationStartBlock: BigInt(env('DESTINATION_START_BLOCK', DEFAULTS.destinationStartBlock)),
  sourceConfirmations: BigInt(env('SOURCE_CONFIRMATIONS', DEFAULTS.sourceConfirmations)),
  destinationConfirmations: BigInt(env('DESTINATION_CONFIRMATIONS', DEFAULTS.destinationConfirmations))
};

const sourceChain = defineChain({ id: config.sourceChainId, name: 'Ethereum Sepolia', nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [config.sourceRpcUrl] } } });
const destinationChain = defineChain({ id: config.destinationChainId, name: 'Base Sepolia', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [config.destinationRpcUrl] } } });
const source = createPublicClient({ chain: sourceChain, transport: http(config.sourceRpcUrl, { retryCount: 3, timeout: 25_000 }) });
const destination = createPublicClient({ chain: destinationChain, transport: http(config.destinationRpcUrl, { retryCount: 3, timeout: 25_000 }) });
const bridgeEvent = sourceAbi.find(item => item.type === 'event' && item.name === 'NFTBridged');
const mintEvent = mirrorAbi.find(item => item.type === 'event' && item.name === 'MirrorMinted');
const privateKey = /^0x[0-9a-fA-F]{64}$/.test(process.env.RELAYER_PRIVATE_KEY || '') ? process.env.RELAYER_PRIVATE_KEY : null;
const account = privateKey ? privateKeyToAccount(privateKey) : null;
const testnetRoute = config.sourceChainId === 11155111 && config.destinationChainId === 84532;
const relayEnabled = testnetRoute && account?.address.toLowerCase() === config.relayer.toLowerCase();

function publicConfig() {
  return {
    appName: 'Degen → Base NFT Bridge', bridgeEnabled: relayEnabled,
    safetyReason: relayEnabled ? null : 'The testnet relayer is temporarily unavailable. New deposits are disabled.',
    routeMode: 'public-testnet',
    source: { name: sourceChain.name, chainId: sourceChain.id, currency: 'ETH', rpcUrl: config.sourceRpcUrl, explorerUrl: 'https://sepolia.etherscan.io', vault: config.sourceVault, confirmations: config.sourceConfirmations.toString() },
    destination: { name: destinationChain.name, chainId: destinationChain.id, currency: 'ETH', rpcUrl: config.destinationRpcUrl, explorerUrl: 'https://sepolia.basescan.org', mirror: config.mirror, confirmations: config.destinationConfirmations.toString() },
    relayer: config.relayer, publicAppUrl: env('PUBLIC_APP_URL', 'https://degen-base-nft-bridge.vercel.app')
  };
}

async function sourceLogs() {
  const latest = await source.getBlockNumber();
  const finalized = latest > config.sourceConfirmations ? latest - config.sourceConfirmations : 0n;
  if (finalized < config.sourceStartBlock) return { latest, logs: [] };
  const logs = await source.getLogs({ address: config.sourceVault, event: bridgeEvent, fromBlock: config.sourceStartBlock, toBlock: finalized });
  return { latest, logs };
}

async function indexedTransfers() {
  const { logs } = await sourceLogs();
  return Promise.all(logs.map(async log => {
    const tokenId = await destination.readContract({ address: config.mirror, abi: mirrorAbi, functionName: 'tokenIdForBridgeId', args: [log.args.id] }).catch(() => 0n);
    let mintLog = null;
    if (tokenId !== 0n) {
      const matches = await destination.getLogs({ address: config.mirror, event: mintEvent, args: { bridgeId: log.args.id }, fromBlock: config.destinationStartBlock, toBlock: 'latest' }).catch(() => []);
      mintLog = matches.at(-1) || null;
    }
    return {
      id: log.args.id, sourceCollection: log.args.collection, sourceTokenId: log.args.tokenId.toString(), holder: log.args.holder,
      tokenUri: log.args.tokenUri, sourceBlock: log.blockNumber.toString(), sourceTxHash: log.transactionHash,
      destinationTxHash: mintLog?.transactionHash || null, destinationBlock: mintLog?.blockNumber?.toString() || null,
      mirrorTokenId: tokenId === 0n ? null : tokenId.toString(), status: tokenId === 0n ? 'discovered' : 'completed'
    };
  })).then(items => items.sort((a, b) => Number(BigInt(b.sourceBlock) - BigInt(a.sourceBlock))));
}

async function status() {
  const [transferResult, ...checks] = await Promise.allSettled([
    indexedTransfers(), source.getBalance({ address: config.relayer }), destination.getBalance({ address: config.relayer }),
    source.readContract({ address: config.sourceVault, abi: sourceAbi, functionName: 'depositCount' }), source.getBlockNumber(), destination.getBlockNumber()
  ]);
  const transfers = transferResult.status === 'fulfilled' ? transferResult.value : [];
  const value = (index, fallback) => checks[index].status === 'fulfilled' ? checks[index].value : fallback;
  const sourceBalance = value(0, null); const destinationBalance = value(1, null); const vaultDepositCount = value(2, BigInt(transfers.length));
  const sourceBlock = value(3, null); const destinationBlock = value(4, null);
  const completed = transfers.filter(item => item.status === 'completed').length;
  const waiting = transfers.filter(item => item.status !== 'completed').length;
  const errors = [transferResult, ...checks].flatMap((check, index) => check.status === 'rejected' ? [{ check: ['transfers', 'sourceBalance', 'destinationBalance', 'depositCount', 'sourceBlock', 'destinationBlock'][index], message: check.reason?.message || String(check.reason) }] : []);
  return {
    ok: errors.length === 0, degraded: errors.length > 0, errors, relayEnabled, safetyReason: publicConfig().safetyReason,
    queue: { waiting, discovered: waiting, submitted: 0, completed, failed: 0, notIndexed: 0, totalDeposits: transfers.length.toString(), vaultTotalDeposits: vaultDepositCount.toString() },
    balances: { address: config.relayer, source: sourceBalance === null ? null : formatEther(sourceBalance), degen: sourceBalance === null ? null : formatEther(sourceBalance), eth: destinationBalance === null ? null : formatEther(destinationBalance) },
    blocks: { source: sourceBlock?.toString() || null, destination: destinationBlock?.toString() || null, nextSourceBlock: sourceBlock?.toString() || config.sourceStartBlock.toString() },
    runtime: { running: false, lastPollAt: null, lastSuccessfulPollAt: new Date().toISOString(), lastError: null }, updatedAt: new Date().toISOString()
  };
}

async function relay(bridgeId) {
  if (!relayEnabled) throw new Error('testnet relayer is unavailable');
  if (!/^0x[0-9a-fA-F]{64}$/.test(bridgeId || '')) throw new Error('invalid bridge ID');
  const alreadyMinted = await destination.readContract({ address: config.mirror, abi: mirrorAbi, functionName: 'tokenIdForBridgeId', args: [bridgeId] });
  if (alreadyMinted !== 0n) return { status: 'completed', bridgeId, mirrorTokenId: alreadyMinted.toString() };
  const { logs } = await sourceLogs();
  const log = logs.find(item => item.args.id.toLowerCase() === bridgeId.toLowerCase());
  if (!log) throw new Error('finalized bridge event not found in the configured source vault');
  const wallet = createWalletClient({ account, chain: destinationChain, transport: http(config.destinationRpcUrl, { retryCount: 3, timeout: 25_000 }) });
  const hash = await wallet.writeContract({ address: config.mirror, abi: mirrorAbi, functionName: 'mintFromDegen', args: [log.args.id, log.args.holder, log.args.collection, log.args.tokenId, log.args.tokenUri] });
  return { status: 'submitted', bridgeId, destinationTxHash: hash };
}

function json(res, code, body) {
  res.statusCode = code; res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', 'no-store');
  res.setHeader('access-control-allow-origin', '*'); res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS'); res.setHeader('access-control-allow-headers', 'content-type'); res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const path = Array.isArray(req.query?.path) ? `/${req.query.path.join('/')}` : `/${String(req.query?.path || (req.url || '/').split('?')[0]).replace(/^\/?api\/?/, '').replace(/^\/+/, '')}`;
  try {
    if (req.method === 'POST' && path === '/relay') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      return json(res, 202, await relay(body.bridgeId));
    }
    if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' });
    if (path === '/config') return json(res, 200, publicConfig());
    if (path === '/status' || path === '/health' || path === '/healthz') return json(res, 200, await status());
    if (path === '/transfers') return json(res, 200, { transfers: await indexedTransfers() });
    if (path.startsWith('/transfers/')) {
      const id = decodeURIComponent(path.slice('/transfers/'.length)); const transfer = (await indexedTransfers()).find(item => item.id.toLowerCase() === id.toLowerCase());
      return json(res, transfer ? 200 : 404, transfer || { error: 'transfer not found' });
    }
    return json(res, 404, { error: 'not found' });
  } catch (error) { return json(res, 400, { error: error.message }); }
}
