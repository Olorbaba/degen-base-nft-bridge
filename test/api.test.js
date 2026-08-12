import test from 'node:test';
import assert from 'node:assert/strict';
import { createStatusService, readConfig } from '../src/relayer.js';

const address = `0x${'11'.repeat(20)}`;
const config = {
  relayEnabled: false, safetyReason: 'Safety locked', hybridRoute: true,
  relayerAddress: address, sourceVault: address, mirror: `0x${'22'.repeat(20)}`,
  sourceConfirmations: 20n, destinationConfirmations: 10n, publicAppUrl: '',
  sourceChain: { id: 666666666, name: 'Degen Chain', nativeCurrency: { symbol: 'DEGEN' } },
  destinationChain: { id: 84532, name: 'Base Sepolia', nativeCurrency: { symbol: 'ETH' } },
  sourceRpcUrl: 'https://source.invalid', destinationRpcUrl: 'https://destination.invalid'
};
const transfer = { id: `0x${'33'.repeat(32)}`, sourceBlock: '10', sourceTokenId: '1', status: 'completed' };
const relayer = {
  snapshot: () => ({ version: 1, nextBlock: '11', transfers: { bridge: transfer } }),
  runtime: () => ({ running: false, lastSuccessfulPollAt: '2026-01-01T00:00:00.000Z', lastError: null }),
  clients: {
    source: { getBalance: async () => 2n * 10n ** 18n, getBlockNumber: async () => 100n, readContract: async () => 1n },
    destination: { getBalance: async () => 3n * 10n ** 18n, getBlockNumber: async () => 200n }
  }
};

test('status service exposes safety, balances, queue, config, and transfers', async () => {
  const service = createStatusService(config, relayer);
  const publicConfig = await service.publicConfig();
  assert.equal(publicConfig.bridgeEnabled, false);
  assert.equal(publicConfig.safetyReason, 'Safety locked');
  assert.equal(publicConfig.relayer, address);

  const status = await service.status();
  assert.equal(status.balances.degen, '2');
  assert.equal(status.balances.eth, '3');
  assert.equal(status.queue.completed, 1);
  assert.equal(status.queue.waiting, 0);
  assert.deepEqual(service.transfers(), [transfer]);
});

test('read-only hybrid API starts without a private key and keeps bridging disabled', () => {
  const result = readConfig({
    DEGEN_RPC_URL: 'https://rpc.degen.tips', DEGEN_CHAIN_ID: '666666666',
    BASE_RPC_URL: 'https://sepolia.base.org', BASE_CHAIN_ID: '84532',
    SOURCE_VAULT_ADDRESS: address, BASE_MIRROR_ADDRESS: `0x${'22'.repeat(20)}`,
    RELAYER_ADDRESS: address, RELAY_ENABLED: 'false', ALLOW_HYBRID_BRIDGE: 'false'
  });
  assert.equal(result.account, null);
  assert.equal(result.relayEnabled, false);
  assert.match(result.safetyReason, /proof route/);
});
