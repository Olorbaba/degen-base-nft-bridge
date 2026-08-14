import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicClient, custom } from 'viem';
import { createRpcTransport, createStatusService, readConfig, relayById } from '../src/relayer.js';

const address = `0x${'11'.repeat(20)}`;
const config = {
  relayEnabled: false, safetyReason: 'Safety locked', hybridRoute: true,
  relayerAddress: address, sourceVault: address, mirror: `0x${'22'.repeat(20)}`,
  sourceConfirmations: 20n, destinationConfirmations: 10n, publicAppUrl: '',
  sourceChain: { id: 666666666, name: 'Degen Chain', nativeCurrency: { symbol: 'DEGEN' } },
  destinationChain: { id: 84532, name: 'Base Sepolia', nativeCurrency: { symbol: 'ETH' } },
  sourceRpcUrl: 'https://source.invalid', destinationRpcUrl: 'https://destination.invalid', corsOrigin: '*'
};
const transfer = { id: `0x${'33'.repeat(32)}`, sourceBlock: '10', sourceTokenId: '1', status: 'completed' };
const relayer = {
  poll: async () => {},
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

test('Railway relay endpoint logic returns indexed status', async () => {
  const result = await relayById(relayer, createStatusService(config, relayer), transfer.id);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, {
    status: 'completed', bridgeId: transfer.id, destinationTxHash: null, mirrorTokenId: null
  });
});

test('read-only hybrid API starts without a private key and keeps bridging disabled', () => {
  const result = readConfig({
    DEGEN_RPC_URL: 'https://rpc.degen.tips', DEGEN_CHAIN_ID: '666666666',
    BASE_RPC_URL: 'https://base-sepolia-rpc.publicnode.com', BASE_CHAIN_ID: '84532',
    SOURCE_VAULT_ADDRESS: address, BASE_MIRROR_ADDRESS: `0x${'22'.repeat(20)}`,
    RELAYER_ADDRESS: address, RELAY_ENABLED: 'false', ALLOW_HYBRID_BRIDGE: 'false'
  });
  assert.equal(result.account, null);
  assert.equal(result.relayEnabled, false);
  assert.match(result.safetyReason, /proof route/);
});

test('Degen mainnet requires an explicit production safety opt-in', () => {
  const result = readConfig({
    SOURCE_RPC_URL: 'https://rpc.degen.tips', SOURCE_CHAIN_ID: '666666666',
    BASE_RPC_URL: 'https://base-rpc.publicnode.com', BASE_CHAIN_ID: '8453',
    SOURCE_VAULT_ADDRESS: address, BASE_MIRROR_ADDRESS: `0x${'22'.repeat(20)}`,
    RELAYER_ADDRESS: address, RELAY_ENABLED: 'true', ALLOW_DEGEN_MAINNET: 'false'
  });
  assert.equal(result.relayEnabled, false);
  assert.match(result.safetyReason, /ALLOW_DEGEN_MAINNET/);
});

test('Ethereum Sepolia source configuration uses generic source variables', () => {
  const result = readConfig({
    SOURCE_RPC_URL: 'https://ethereum-sepolia-rpc.publicnode.com', SOURCE_CHAIN_ID: '11155111',
    SOURCE_CHAIN_NAME: 'Ethereum Sepolia', SOURCE_CURRENCY_SYMBOL: 'ETH',
    BASE_RPC_URL: 'https://base-sepolia-rpc.publicnode.com', BASE_CHAIN_ID: '84532',
    SOURCE_VAULT_ADDRESS: address, BASE_MIRROR_ADDRESS: `0x${'22'.repeat(20)}`,
    RELAYER_ADDRESS: address, RELAY_ENABLED: 'false'
  });
  assert.equal(result.sourceChain.id, 11155111);
  assert.equal(result.sourceChain.name, 'Ethereum Sepolia');
  assert.equal(result.sourceChain.nativeCurrency.symbol, 'ETH');
  assert.equal(result.hybridRoute, false);
  assert.deepEqual(result.destinationRpcUrls, [
    'https://base-sepolia-rpc.publicnode.com',
    'https://base-sepolia.drpc.org',
    'https://sepolia.base.org'
  ]);
});

test('destination RPC configuration is de-duplicated and keeps operator priority', () => {
  const result = readConfig({
    SOURCE_RPC_URL: 'https://source.invalid', SOURCE_CHAIN_ID: '11155111',
    BASE_RPC_URL: 'https://primary.invalid', BASE_RPC_URLS: 'https://primary.invalid, https://backup.invalid', BASE_CHAIN_ID: '84532',
    SOURCE_VAULT_ADDRESS: address, BASE_MIRROR_ADDRESS: `0x${'22'.repeat(20)}`,
    RELAYER_ADDRESS: address, RELAY_ENABLED: 'false'
  });
  assert.deepEqual(result.destinationRpcUrls.slice(0, 2), ['https://primary.invalid', 'https://backup.invalid']);
  assert.equal(new Set(result.destinationRpcUrls).size, result.destinationRpcUrls.length);
});

test('destination transport fails over after an HTTP 429', async () => {
  const calls = [];
  const transportFactory = url => custom({
    request: async ({ method }) => {
      calls.push({ url, method });
      if (url === 'primary') throw Object.assign(new Error('Request failed with status code 429'), { status: 429 });
      return '0x14a34';
    }
  });
  const client = createPublicClient({ transport: createRpcTransport(['primary', 'backup'], transportFactory) });
  assert.equal(await client.getChainId(), 84532);
  assert.deepEqual(calls.map(call => call.url), ['primary', 'backup']);
});
