import 'dotenv/config';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, defineChain, formatEther, http } from 'viem';

const env = process.env;
const sourceRpcUrl = env.SOURCE_RPC_URL || env.DEGEN_RPC_URL;
const required = ['BASE_RPC_URL', 'DEPLOYER_PRIVATE_KEY', 'RELAYER_PRIVATE_KEY', 'RELAYER_ADDRESS', 'MIRROR_OWNER'];
const missing = required.filter((name) => !env[name]);
if (!sourceRpcUrl) missing.unshift('SOURCE_RPC_URL');
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

function key(name) {
  const value = env[name];
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${name} must be a 32-byte 0x-prefixed private key`);
  return privateKeyToAccount(value);
}

function addr(name) {
  const value = env[name];
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${name} must be a 20-byte 0x-prefixed address`);
  return value;
}

const sourceId = Number(env.SOURCE_CHAIN_ID || env.DEGEN_CHAIN_ID || 11155111);
const baseId = Number(env.BASE_CHAIN_ID || 84532);
const sourceIsDegen = sourceId === 666666666;
const sourceSymbol = env.SOURCE_CURRENCY_SYMBOL || (sourceIsDegen ? 'DEGEN' : 'ETH');
const sourceName = env.SOURCE_CHAIN_NAME || (sourceIsDegen ? 'Degen Chain' : sourceId === 11155111 ? 'Ethereum Sepolia' : `Source chain ${sourceId}`);
const source = defineChain({ id: sourceId, name: sourceName, nativeCurrency: { name: sourceSymbol === 'ETH' ? 'Ether' : sourceSymbol, symbol: sourceSymbol, decimals: 18 }, rpcUrls: { default: { http: [sourceRpcUrl] } } });
const base = defineChain({ id: baseId, name: 'Base', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [env.BASE_RPC_URL] } } });
const deployer = key('DEPLOYER_PRIVATE_KEY');
const relayer = key('RELAYER_PRIVATE_KEY');
const configuredRelayer = addr('RELAYER_ADDRESS');
const owner = addr('MIRROR_OWNER');
const sourceClient = createPublicClient({ chain: source, transport: http(sourceRpcUrl) });
const baseClient = createPublicClient({ chain: base, transport: http(env.BASE_RPC_URL) });

async function check(client, chain, label, account) {
  const actual = await client.getChainId();
  if (actual !== chain.id) throw new Error(`${label} RPC chain ID is ${actual}, expected ${chain.id}`);
  const balance = await client.getBalance({ address: account.address });
  console.log(`${label}: chainId=${actual}, deployer=${account.address}, balance=${formatEther(balance)} ${chain.nativeCurrency.symbol}`);
  if (balance === 0n) console.warn(`WARNING: ${label} deployer has no native gas token`);
}

try {
  if (sourceId === 666666666 && env.ALLOW_DEGEN_MAINNET !== 'true') {
    throw new Error('Degen mainnet is blocked by default; set ALLOW_DEGEN_MAINNET=true only after an explicit real-asset go-live decision');
  }
  if (sourceId === 666666666 && baseId === 84532 && env.ALLOW_HYBRID_BRIDGE !== 'true') {
    console.warn('SAFETY LOCK: Degen mainnet → Base Sepolia relaying is disabled. Contracts may be verified, but the relayer must remain offline.');
  }
  if (configuredRelayer.toLowerCase() !== relayer.address.toLowerCase()) {
    throw new Error(`RELAYER_ADDRESS (${configuredRelayer}) does not match RELAYER_PRIVATE_KEY (${relayer.address})`);
  }
  await check(sourceClient, source, `${source.name} source`, deployer);
  await check(baseClient, base, 'Base destination', deployer);
  const relayerBalance = await baseClient.getBalance({ address: relayer.address });
  console.log(`Base relayer: ${relayer.address}, balance=${formatEther(relayerBalance)} ETH`);
  if (relayerBalance === 0n) console.warn('WARNING: Base relayer has no ETH for mint transactions');
  console.log(`Mirror owner: ${owner}`);
  console.log('Preflight passed. No transactions were broadcast.');
} catch (error) {
  console.error(`Preflight failed: ${error.shortMessage || error.message}`);
  process.exitCode = 1;
}
