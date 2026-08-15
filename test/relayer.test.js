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
const vault = `0x${'55'.repeat(20)}`;
const mirror = `0x${'66'.repeat(20)}`;

function relayerConfig(dir, overrides = {}) {
  return {
    sourceStartBlock: 10n, sourceConfirmations: 0n, destinationConfirmations: 2n,
    sourceVault: vault, mirror, stateFile: path.join(dir, 'state.json'), pollIntervalMs: 60_000,
    sourceChain: {}, destinationChain: {}, account: { address: holder }, relayEnabled: true,
    maxTokenUriBytes: 16_384n, maxMintGas: 8_000_000n,
    ...overrides
  };
}

test('relayer persists a mint and waits for destination confirmations', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-relayer-'));
  let destinationBlock = 50n;
  const log = { blockNumber: 10n, transactionHash: txHash, args: { id, collection, tokenId: 7n, holder, tokenStandard: 2, amount: 1n, tokenUri: 'ipfs://snapshot', timestamp: 1n } };
  const source = {
    getBlockNumber: async () => 10n,
    getLogs: async () => [log],
    readContract: async ({ functionName }) => functionName === 'balanceOf' ? 1n : null
  };
  const destination = {
    readContract: async () => 0n,
    getTransactionReceipt: async () => ({ status: 'success', blockNumber: 50n }),
    getBlockNumber: async () => destinationBlock
  };
  let writes = 0;
  const wallet = { writeContract: async () => { writes += 1; return txHash; } };
  const config = relayerConfig(dir);
  const relayer = createRelayer(config, { source, destination, wallet });
  const stop = await relayer.start();
  assert.equal(writes, 1);
  assert.equal(relayer.snapshot().transfers[id].status, 'submitted');
  assert.equal(relayer.snapshot().transfers[id].tokenStandard, 2);
  assert.equal(relayer.snapshot().transfers[id].amount, '1');
  assert.equal(relayer.snapshot().transfers[id].tokenUri, 'ipfs://snapshot');
  await relayer.poll();
  assert.equal(relayer.snapshot().transfers[id].status, 'submitted');
  destinationBlock = 51n;
  await relayer.poll();
  assert.equal(relayer.snapshot().transfers[id].status, 'completed');
  assert.equal(writes, 1);
  stop();
});

test('one rejected transfer does not halt later transfers or the checkpoint', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-isolation-'));
  const rejectedId = `0x${'12'.repeat(32)}`;
  const acceptedId = `0x${'13'.repeat(32)}`;
  const logs = [
    { blockNumber: 10n, transactionHash: txHash, args: { id: rejectedId, collection, tokenId: 1n, holder, tokenStandard: 2, amount: 1n, tokenUri: 'x'.repeat(33), timestamp: 1n } },
    { blockNumber: 10n, transactionHash: txHash, args: { id: acceptedId, collection, tokenId: 2n, holder, tokenStandard: 2, amount: 1n, tokenUri: 'ipfs://accepted', timestamp: 1n } }
  ];
  const source = { getBlockNumber: async () => 10n, getLogs: async () => logs, readContract: async () => 1n };
  const destination = { readContract: async () => 0n };
  let writes = 0;
  const wallet = { writeContract: async () => { writes += 1; return txHash; } };
  const relayer = createRelayer(relayerConfig(dir, { maxTokenUriBytes: 32n }), { source, destination, wallet });
  const stop = await relayer.start();
  assert.equal(relayer.snapshot().transfers[rejectedId].status, 'error');
  assert.equal(relayer.snapshot().transfers[rejectedId].errorCode, 'metadata_too_large');
  assert.equal(relayer.snapshot().transfers[acceptedId].status, 'submitted');
  assert.equal(relayer.snapshot().nextBlock, '11');
  assert.equal(writes, 1);
  stop();
});

test('relayer rejects a transfer when the source vault does not have custody', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-custody-'));
  const log = { blockNumber: 10n, transactionHash: txHash, args: { id, collection, tokenId: 7n, holder, tokenStandard: 1, amount: 1n, tokenUri: 'ipfs://snapshot', timestamp: 1n } };
  const source = { getBlockNumber: async () => 10n, getLogs: async () => [log], readContract: async ({ functionName }) => functionName === 'ownerOf' ? holder : null };
  const destination = { readContract: async () => 0n };
  let writes = 0;
  const wallet = { writeContract: async () => { writes += 1; return txHash; } };
  const relayer = createRelayer(relayerConfig(dir), { source, destination, wallet });
  const stop = await relayer.start();
  assert.equal(relayer.snapshot().transfers[id].status, 'error');
  assert.equal(relayer.snapshot().transfers[id].errorCode, 'source_custody_missing');
  assert.equal(writes, 0);
  stop();
});

test('relayer rejects a destination mint above the gas cap', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-gas-'));
  const log = { blockNumber: 10n, transactionHash: txHash, args: { id, collection, tokenId: 7n, holder, tokenStandard: 2, amount: 1n, tokenUri: 'ipfs://snapshot', timestamp: 1n } };
  const source = { getBlockNumber: async () => 10n, getLogs: async () => [log], readContract: async () => 1n };
  const destination = { readContract: async () => 0n, estimateContractGas: async () => 801n };
  let writes = 0;
  const wallet = { writeContract: async () => { writes += 1; return txHash; } };
  const relayer = createRelayer(relayerConfig(dir, { maxMintGas: 800n }), { source, destination, wallet });
  const stop = await relayer.start();
  assert.equal(relayer.snapshot().transfers[id].status, 'error');
  assert.equal(relayer.snapshot().transfers[id].errorCode, 'mint_gas_limit');
  assert.equal(writes, 0);
  stop();
});

test('relayer retries a stored error and mints the exact event URI', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-retry-'));
  const exactUri = 'data:application/json;base64,ZXhhY3Q=';
  const log = { blockNumber: 10n, transactionHash: txHash, args: { id, collection, tokenId: 7n, holder, tokenStandard: 1, amount: 1n, tokenUri: exactUri, timestamp: 1n } };
  let owner = holder;
  const source = { getBlockNumber: async () => 10n, getLogs: async () => [log], readContract: async ({ functionName }) => functionName === 'ownerOf' ? owner : null };
  const destination = { readContract: async () => 0n };
  let writeRequest;
  const wallet = { writeContract: async request => { writeRequest = request; return txHash; } };
  const relayer = createRelayer(relayerConfig(dir), { source, destination, wallet });
  const stop = await relayer.start();
  assert.equal(relayer.snapshot().transfers[id].status, 'error');
  owner = vault;
  const retried = await relayer.retry(id);
  assert.equal(retried.status, 'submitted');
  assert.equal(writeRequest.args[4], exactUri);
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
    sourceVault: vault, mirror,
    stateFile, pollIntervalMs: 60_000, sourceChain: {}, destinationChain: {}, relayEnabled: false
  };
  const relayer = createRelayer(config, { source, destination });
  const stop = await relayer.start();
  assert.equal(relayer.snapshot().transfers[id].mirrorTokenId, '9');
  stop();
});
