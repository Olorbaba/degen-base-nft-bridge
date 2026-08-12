import 'dotenv/config';
import fs from 'node:fs';
import { createPublicClient, createWalletClient, defineChain, http, parseEventLogs } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sourceAbi } from '../src/abis.js';

const env = process.env;
const required = ['DEPLOYER_PRIVATE_KEY', 'SOURCE_VAULT_ADDRESS', 'TEST_NFT_OWNER'];
for (const name of required) if (!env[name]) throw new Error(`${name} is required`);
const sourceRpcUrl = env.SOURCE_RPC_URL || env.DEGEN_RPC_URL;
if (!sourceRpcUrl) throw new Error('SOURCE_RPC_URL is required');
const sourceChainId = Number(env.SOURCE_CHAIN_ID || env.DEGEN_CHAIN_ID || 11155111);
const destinationChainId = Number(env.BASE_CHAIN_ID || 84532);
if (sourceChainId === 666666666 && destinationChainId === 84532 && env.ALLOW_HYBRID_BRIDGE !== 'true') throw new Error('ALLOW_HYBRID_BRIDGE must be true for a Degen-mainnet → Base-Sepolia controlled test');

const account = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY);
if (account.address.toLowerCase() !== env.TEST_NFT_OWNER.toLowerCase()) {
  throw new Error('TEST_NFT_OWNER must match the deployer so it can approve the newly minted test NFT');
}

const chain = defineChain({
  id: sourceChainId,
  name: env.SOURCE_CHAIN_NAME || (sourceChainId === 11155111 ? 'Ethereum Sepolia' : 'Degen Chain'),
  nativeCurrency: { name: env.SOURCE_CURRENCY_SYMBOL === 'DEGEN' ? 'DEGEN' : 'Ether', symbol: env.SOURCE_CURRENCY_SYMBOL || (sourceChainId === 666666666 ? 'DEGEN' : 'ETH'), decimals: 18 },
  rpcUrls: { default: { http: [sourceRpcUrl] } }
});
const transport = http(sourceRpcUrl, { retryCount: 5, retryDelay: 1_000, timeout: 30_000 });
const client = createPublicClient({ chain, transport });
const wallet = createWalletClient({ account, chain, transport });
const artifact = JSON.parse(fs.readFileSync('./out/ControlledTestNft.sol/ControlledTestNft.json', 'utf8'));

console.log(`Controlled test sender: ${account.address}`);
const nftHash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, args: [account.address] });
console.log(`Test NFT deployment transaction: ${nftHash}`);
const nftReceipt = await client.waitForTransactionReceipt({ hash: nftHash, confirmations: 2 });
if (nftReceipt.status !== 'success' || !nftReceipt.contractAddress) throw new Error('test NFT deployment failed');
const nft = nftReceipt.contractAddress;
console.log(`Controlled test NFT: ${nft}`);

const approveHash = await wallet.writeContract({
  address: nft,
  abi: artifact.abi,
  functionName: 'approve',
  args: [env.SOURCE_VAULT_ADDRESS, 1n]
});
console.log(`Approval transaction: ${approveHash}`);
const approveReceipt = await client.waitForTransactionReceipt({ hash: approveHash, confirmations: 2 });
if (approveReceipt.status !== 'success') throw new Error('approval failed');

const bridgeHash = await wallet.writeContract({
  address: env.SOURCE_VAULT_ADDRESS,
  abi: [
    ...sourceAbi,
    { type: 'function', name: 'bridge', stateMutability: 'nonpayable', inputs: [{ name: 'collection', type: 'address' }, { name: 'tokenId', type: 'uint256' }], outputs: [{ name: 'id', type: 'bytes32' }] }
  ],
  functionName: 'bridge',
  args: [nft, 1n]
});
console.log(`Vault bridge transaction: ${bridgeHash}`);
const bridgeReceipt = await client.waitForTransactionReceipt({ hash: bridgeHash, confirmations: 2 });
if (bridgeReceipt.status !== 'success') throw new Error('vault bridge failed');
const logs = parseEventLogs({ abi: sourceAbi, eventName: 'NFTBridged', logs: bridgeReceipt.logs });
if (logs.length !== 1) throw new Error(`expected one NFTBridged event, found ${logs.length}`);
console.log(`Bridge ID: ${logs[0].args.id}`);
console.log(`Source block: ${bridgeReceipt.blockNumber}`);
