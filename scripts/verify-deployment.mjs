import fs from 'node:fs/promises';
import { createPublicClient, http } from 'viem';
import { mirrorAbi, sourceAbi } from '../src/abis.js';

const deployments = JSON.parse(await fs.readFile(new URL('../deployments.json', import.meta.url)));
const source = createPublicClient({ transport: http(process.env.SOURCE_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com', { retryCount: 5 }) });
const destination = createPublicClient({ transport: http(process.env.BASE_RPC_URL || 'https://base-sepolia-rpc.publicnode.com', { retryCount: 5 }) });
const mirrorChecksAbi = [
  ...mirrorAbi,
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'relayer', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'tokenURI', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'originOf', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'bytes32' }, { type: 'address' }, { type: 'uint256' }] }
];

const sourceCode = await source.getCode({ address: deployments.source.contract });
const destinationCode = await destination.getCode({ address: deployments.destination.contract });
if (!sourceCode || sourceCode === '0x') throw new Error('source contract has no runtime bytecode');
if (!destinationCode || destinationCode === '0x') throw new Error('destination contract has no runtime bytecode');

const [depositCount, owner, relayer, mirrorTokenId] = await Promise.all([
  source.readContract({ address: deployments.source.contract, abi: sourceAbi, functionName: 'depositCount' }),
  destination.readContract({ address: deployments.destination.contract, abi: mirrorChecksAbi, functionName: 'owner' }),
  destination.readContract({ address: deployments.destination.contract, abi: mirrorChecksAbi, functionName: 'relayer' }),
  destination.readContract({ address: deployments.destination.contract, abi: mirrorChecksAbi, functionName: 'tokenIdForBridgeId', args: [deployments.controlledTest.bridgeId] })
]);
if (owner.toLowerCase() !== deployments.destination.owner.toLowerCase()) throw new Error('destination owner mismatch');
if (relayer.toLowerCase() !== deployments.destination.relayer.toLowerCase()) throw new Error('destination relayer mismatch');
if (mirrorTokenId !== BigInt(deployments.controlledTest.destinationTokenId)) throw new Error('controlled test mirror token mismatch');

const [tokenOwner, tokenUri, origin] = await Promise.all([
  destination.readContract({ address: deployments.destination.contract, abi: mirrorChecksAbi, functionName: 'ownerOf', args: [mirrorTokenId] }),
  destination.readContract({ address: deployments.destination.contract, abi: mirrorChecksAbi, functionName: 'tokenURI', args: [mirrorTokenId] }),
  destination.readContract({ address: deployments.destination.contract, abi: mirrorChecksAbi, functionName: 'originOf', args: [mirrorTokenId] })
]);
if (origin[0].toLowerCase() !== deployments.controlledTest.bridgeId.toLowerCase()) throw new Error('bridge ID mismatch');
if (origin[1].toLowerCase() !== deployments.controlledTest.sourceCollection.toLowerCase()) throw new Error('source collection mismatch');
if (origin[2] !== BigInt(deployments.controlledTest.sourceTokenId)) throw new Error('source token ID mismatch');

console.log(JSON.stringify({
  verified: true,
  source: { contract: deployments.source.contract, depositCount: depositCount.toString() },
  destination: { contract: deployments.destination.contract, owner, relayer },
  controlledTest: { mirrorTokenId: mirrorTokenId.toString(), owner: tokenOwner, origin: { bridgeId: origin[0], collection: origin[1], tokenId: origin[2].toString() }, tokenUri }
}, null, 2));
