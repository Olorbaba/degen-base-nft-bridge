import fs from 'node:fs/promises';
import { createPublicClient, http } from 'viem';
import { mirrorAbi, sourceAbi } from '../src/abis.js';

const deployments = JSON.parse(await fs.readFile(new URL('../deployments.json', import.meta.url)));
const source = createPublicClient({ transport: http(process.env.SOURCE_RPC_URL || 'https://rpc.degen.tips', { retryCount: 5 }) });
const destination = createPublicClient({ transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org', { retryCount: 5 }) });
const mirrorChecksAbi = [
  ...mirrorAbi,
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'relayer', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }
];

const [sourceCode, destinationCode, depositCount, owner, relayer] = await Promise.all([
  source.getCode({ address: deployments.source.contract }),
  destination.getCode({ address: deployments.destination.contract }),
  source.readContract({ address: deployments.source.contract, abi: sourceAbi, functionName: 'depositCount' }),
  destination.readContract({ address: deployments.destination.contract, abi: mirrorChecksAbi, functionName: 'owner' }),
  destination.readContract({ address: deployments.destination.contract, abi: mirrorChecksAbi, functionName: 'relayer' })
]);

if (!sourceCode || sourceCode === '0x') throw new Error('source contract has no runtime bytecode');
if (!destinationCode || destinationCode === '0x') throw new Error('destination contract has no runtime bytecode');
if (owner.toLowerCase() !== deployments.destination.owner.toLowerCase()) throw new Error('destination owner mismatch');
if (relayer.toLowerCase() !== deployments.destination.relayer.toLowerCase()) throw new Error('destination relayer mismatch');

console.log(JSON.stringify({
  verified: true,
  source: { network: deployments.source.network, contract: deployments.source.contract, depositCount: depositCount.toString() },
  destination: { network: deployments.destination.network, contract: deployments.destination.contract, owner, relayer }
}, null, 2));
