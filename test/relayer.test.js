import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRelayer } from '../src/relayer.js';

const id = `0x${'11'.repeat(32)}`;
const collection = `0x${'22'.repeat(20)}`;
const holder = `0x${'33'.repeat(20)}`;
const txHash = `0x${'44'.repeat(32)}`;

test('relayer persists a mint and waits for destination confirmations', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-relayer-'));
  let destinationBlock = 50n;
  const log = { blockNumber: 10n, transactionHash: txHash, args: { id, collection, tokenId: 7n, holder, tokenUri: 'ipfs://snapshot', timestamp: 1n } };
  const source = {
    getBlockNumber: async () => 10n,
    getLogs: async () => [log],
    readContract: async () => 'ipfs://chain-read'
  };
  const destination = {
    readContract: async () => 0n,
    getTransactionReceipt: async () => ({ status: 'success', blockNumber: 50n }),
    getBlockNumber: async () => destinationBlock
  };
  let writes = 0;
  const wallet = { writeContract: async () => { writes += 1; return txHash; } };
  const config = {
    sourceStartBlock: 10n, sourceConfirmations: 0n, destinationConfirmations: 2n,
    sourceVault: `0x${'55'.repeat(20)}`, mirror: `0x${'66'.repeat(20)}`,
    stateFile: path.join(dir, 'state.json'), pollIntervalMs: 60_000,
    sourceChain: {}, destinationChain: {}, account: {}, relayEnabled: true
  };
  const relayer = createRelayer(config, { source, destination, wallet });
  const stop = await relayer.start();
  assert.equal(writes, 1);
  assert.equal(relayer.snapshot().transfers[id].status, 'submitted');
  await relayer.poll();
  assert.equal(relayer.snapshot().transfers[id].status, 'submitted');
  destinationBlock = 51n;
  await relayer.poll();
  assert.equal(relayer.snapshot().transfers[id].status, 'completed');
  assert.equal(writes, 1);
  stop();
});

test('relayer hydrates a legacy completed transfer with its Base token ID', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-hydrate-'));
  const stateFile = path.join(dir, 'state.json');
  await fs.writeFile(stateFile, JSON.stringify({ version: 1, nextBlock: '12', transfers: { [id]: { id, sourceBlock: '10', status: 'completed' } } }));
  const source = { getBlockNumber: async () => 10n, getLogs: async () => [] };
  const destination = { readContract: async () => 9n };
  const config = {
    sourceStartBlock: 10n, sourceConfirmations: 0n, destinationConfirmations: 2n,
    sourceVault: `0x${'55'.repeat(20)}`, mirror: `0x${'66'.repeat(20)}`,
    stateFile, pollIntervalMs: 60_000, sourceChain: {}, destinationChain: {}, relayEnabled: false
  };
  const relayer = createRelayer(config, { source, destination });
  const stop = await relayer.start();
  assert.equal(relayer.snapshot().transfers[id].mirrorTokenId, '9');
  stop();
});
