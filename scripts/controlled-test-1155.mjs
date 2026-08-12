import 'dotenv/config';
import fs from 'node:fs';
import { createPublicClient, createWalletClient, defineChain, http, parseEventLogs } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sourceAbi } from '../src/abis.js';

const env = process.env;
for (const name of ['DEPLOYER_PRIVATE_KEY', 'SOURCE_VAULT_ADDRESS', 'TEST_NFT_OWNER']) if (!env[name]) throw new Error(`${name} is required`);
const rpc = env.SOURCE_RPC_URL || env.DEGEN_RPC_URL;
if (!rpc) throw new Error('SOURCE_RPC_URL is required');
const account = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY);
if (account.address.toLowerCase() !== env.TEST_NFT_OWNER.toLowerCase()) throw new Error('TEST_NFT_OWNER must match deployer');
const chain = defineChain({ id: Number(env.SOURCE_CHAIN_ID || 11155111), name: env.SOURCE_CHAIN_NAME || 'Ethereum Sepolia', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const transport = http(rpc, { retryCount: 5, retryDelay: 1_000, timeout: 30_000 });
const client = createPublicClient({ chain, transport });
const wallet = createWalletClient({ account, chain, transport });
const artifact = JSON.parse(fs.readFileSync('./out/ControlledTest1155.sol/ControlledTest1155.json', 'utf8'));

const deployHash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, args: [account.address] });
console.log(`ERC1155 deployment transaction: ${deployHash}`);
const deployed = await client.waitForTransactionReceipt({ hash: deployHash, confirmations: 2 });
if (deployed.status !== 'success' || !deployed.contractAddress) throw new Error('ERC1155 deployment failed');
const collection = deployed.contractAddress;
console.log(`Controlled ERC1155: ${collection}`);

const approvalHash = await wallet.writeContract({ address: collection, abi: artifact.abi, functionName: 'setApprovalForAll', args: [env.SOURCE_VAULT_ADDRESS, true] });
console.log(`ERC1155 approval transaction: ${approvalHash}`);
await client.waitForTransactionReceipt({ hash: approvalHash, confirmations: 2 });

const bridgeHash = await wallet.writeContract({ address: env.SOURCE_VAULT_ADDRESS, abi: sourceAbi, functionName: 'bridge', args: [collection, 1n] });
console.log(`ERC1155 bridge transaction: ${bridgeHash}`);
const bridged = await client.waitForTransactionReceipt({ hash: bridgeHash, confirmations: 2 });
if (bridged.status !== 'success') throw new Error('ERC1155 bridge failed');
const logs = parseEventLogs({ abi: sourceAbi, eventName: 'NFTBridged', logs: bridged.logs });
if (logs.length !== 1 || Number(logs[0].args.tokenStandard) !== 2) throw new Error('expected one ERC1155 bridge event');
console.log(`Bridge ID: ${logs[0].args.id}`);
console.log(`Source block: ${bridged.blockNumber}`);
