import { createPublicClient, defineChain, formatEther, http } from 'viem';
import { sourceAbi, mirrorAbi } from '../src/abis.js';

const DEFAULTS = {
  sourceRpcUrl: 'https://rpc.degen.tips',
  destinationRpcUrl: 'https://sepolia.base.org',
  sourceChainId: 666666666,
  destinationChainId: 84532,
  sourceVault: '0x7584A721bB18E1531694a0c88D56B55CCB70D06C',
  mirror: '0xa0A44dEAD4F124B425DeE4466d542DD612D10517',
  relayer: '0x96D743afDcAaFd99d2fBD70A6949f41cDd2B282D',
  sourceStartBlock: 26957825,
  sourceConfirmations: 20,
  destinationConfirmations: 10
};

const env = (key, fallback) => process.env[key] ?? fallback;
const config = {
  sourceRpcUrl: env('DEGEN_RPC_URL', DEFAULTS.sourceRpcUrl),
  destinationRpcUrl: env('BASE_RPC_URL', DEFAULTS.destinationRpcUrl),
  sourceChainId: Number(env('DEGEN_CHAIN_ID', DEFAULTS.sourceChainId)),
  destinationChainId: Number(env('BASE_CHAIN_ID', DEFAULTS.destinationChainId)),
  sourceVault: env('SOURCE_VAULT_ADDRESS', DEFAULTS.sourceVault),
  mirror: env('BASE_MIRROR_ADDRESS', DEFAULTS.mirror),
  relayer: env('RELAYER_ADDRESS', DEFAULTS.relayer),
  sourceStartBlock: Number(env('SOURCE_START_BLOCK', DEFAULTS.sourceStartBlock)),
  sourceConfirmations: Number(env('SOURCE_CONFIRMATIONS', DEFAULTS.sourceConfirmations)),
  destinationConfirmations: Number(env('DESTINATION_CONFIRMATIONS', DEFAULTS.destinationConfirmations))
};

const sourceChain = defineChain({
  id: config.sourceChainId,
  name: 'Degen Chain',
  nativeCurrency: { name: 'DEGEN', symbol: 'DEGEN', decimals: 18 },
  rpcUrls: { default: { http: [config.sourceRpcUrl] } }
});
const destinationChain = defineChain({
  id: config.destinationChainId,
  name: config.destinationChainId === 8453 ? 'Base' : 'Base Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [config.destinationRpcUrl] } }
});
const source = createPublicClient({ chain: sourceChain, transport: http(config.sourceRpcUrl, { retryCount: 2 }) });
const destination = createPublicClient({ chain: destinationChain, transport: http(config.destinationRpcUrl, { retryCount: 2 }) });

const proofTransfer = {
  id: '0x47cf81e47f03d6da07e39baf01139dbeb0dd821fee01512eff49e46b21751751',
  sourceCollection: '0x436e764419B7e0Ef0BFdf3D28f2faF1264810DCf',
  sourceTokenId: '1',
  holder: '0xbFdD3790aBb0768FAe791cf1c551F15Aa7Bb498f',
  sourceTxHash: '0x6c35817a2fc63db4a880925e06df460cf467f497f1a3350f9eee5e316dafdbd5',
  destinationTxHash: '0x927ed03498494d7baaabb719f63e2f28864c4c38e17ec9e73b0c4a963710046b',
  mirrorTokenId: '1',
  status: 'completed',
  sourceBlock: String(config.sourceStartBlock + 1),
  completedAt: '2026-08-12T03:51:56.313Z'
};

function publicConfig() {
  const hybrid = config.sourceChainId === 666666666 && config.destinationChainId === 84532;
  return {
    appName: 'Degen → Base NFT Bridge',
    bridgeEnabled: false,
    safetyReason: hybrid
      ? 'Degen mainnet → Base Sepolia is a proof route. Deposits are disabled to prevent locking real NFTs for testnet assets.'
      : 'Relaying is disabled by the operator.',
    routeMode: hybrid ? 'controlled-test' : 'production',
    source: { name: 'Degen Chain', chainId: config.sourceChainId, currency: 'DEGEN', rpcUrl: config.sourceRpcUrl, explorerUrl: 'https://explorer.degen.tips', vault: config.sourceVault, confirmations: String(config.sourceConfirmations) },
    destination: { name: destinationChain.name, chainId: config.destinationChainId, currency: 'ETH', rpcUrl: config.destinationRpcUrl, explorerUrl: config.destinationChainId === 8453 ? 'https://basescan.org' : 'https://sepolia.basescan.org', mirror: config.mirror, confirmations: String(config.destinationConfirmations) },
    relayer: config.relayer,
    publicAppUrl: env('PUBLIC_APP_URL', '')
  };
}

async function status() {
  const checks = await Promise.allSettled([
    source.getBalance({ address: config.relayer }),
    destination.getBalance({ address: config.relayer }),
    source.readContract({ address: config.sourceVault, abi: sourceAbi, functionName: 'depositCount' }),
    source.getBlockNumber(),
    destination.getBlockNumber(),
    destination.readContract({ address: config.mirror, abi: mirrorAbi, functionName: 'tokenIdForBridgeId', args: [proofTransfer.id] })
  ]);
  const value = (index, fallback) => checks[index].status === 'fulfilled' ? checks[index].value : fallback;
  const sourceBalance = value(0, null);
  const destinationBalance = value(1, null);
  const depositCount = value(2, 1n);
  const sourceBlock = value(3, null);
  const destinationBlock = value(4, null);
  const tokenId = value(5, 1n);
  const errors = checks.flatMap((check, index) => check.status === 'rejected' ? [{ check: ['sourceBalance', 'destinationBalance', 'depositCount', 'sourceBlock', 'destinationBlock', 'mirrorTokenId'][index], message: check.reason?.message || String(check.reason) }] : []);
  return {
    ok: errors.length === 0,
    degraded: errors.length > 0,
    errors,
    relayEnabled: false,
    safetyReason: publicConfig().safetyReason,
    queue: { waiting: Math.max(0, Number(depositCount) - 1), discovered: 0, submitted: 0, completed: 1, failed: 0, notIndexed: Math.max(0, Number(depositCount) - 1), totalDeposits: depositCount.toString() },
    balances: { address: config.relayer, degen: sourceBalance === null ? null : formatEther(sourceBalance), eth: destinationBalance === null ? null : formatEther(destinationBalance) },
    blocks: { source: sourceBlock?.toString() || null, destination: destinationBlock?.toString() || null, nextSourceBlock: String(config.sourceStartBlock) },
    runtime: { running: false, lastPollAt: null, lastSuccessfulPollAt: null, lastError: null },
    updatedAt: new Date().toISOString(),
    mirrorTokenId: tokenId.toString()
  };
}

function json(res, code, body) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' });
  const path = Array.isArray(req.query?.path)
    ? `/${req.query.path.join('/')}`
    : `/${String(req.query?.path || (req.url || '/').split('?')[0]).replace(/^\/?api\/?/, '').replace(/^\/+/, '')}`;
  try {
    if (path === '/api/config' || path === '/config') return json(res, 200, publicConfig());
    if (path === '/api/status' || path === '/status' || path === '/health' || path === '/healthz') return json(res, 200, await status());
    if (path === '/api/transfers' || path === '/transfers') return json(res, 200, { transfers: [proofTransfer] });
    if (path.startsWith('/transfers/')) {
      const id = decodeURIComponent(path.slice('/transfers/'.length));
      return json(res, id.toLowerCase() === proofTransfer.id.toLowerCase() ? 200 : 404, id.toLowerCase() === proofTransfer.id.toLowerCase() ? proofTransfer : { error: 'transfer not found' });
    }
    return json(res, 404, { error: 'not found' });
  } catch (error) {
    return json(res, 200, { ...(await status().catch(() => ({ ok: false, degraded: true }))), errors: [{ check: 'api', message: error.message }] });
  }
}
