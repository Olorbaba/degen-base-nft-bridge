import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const productionUrl = 'https://degen-base-nft-bridge-production.up.railway.app/';

test('Farcaster manifest points to the production bridge and local assets', async () => {
  const manifest = JSON.parse(await readFile('docs/.well-known/farcaster.json', 'utf8'));
  const associationHeader = JSON.parse(Buffer.from(manifest.accountAssociation.header, 'base64url').toString());
  const associationPayload = JSON.parse(Buffer.from(manifest.accountAssociation.payload, 'base64url').toString());
  assert.equal(associationHeader.fid, 212672);
  assert.equal(associationPayload.domain, new URL(productionUrl).hostname);
  assert.ok(manifest.accountAssociation.signature);
  assert.equal(manifest.miniapp.version, '1');
  assert.equal(manifest.miniapp.name, 'Degen NFT Bridge');
  assert.equal(manifest.miniapp.homeUrl, productionUrl);
  assert.match(manifest.miniapp.iconUrl, /\/assets\/miniapp-icon\.png$/);
  assert.match(manifest.miniapp.imageUrl, /\/assets\/miniapp-card\.png$/);
});

test('frontend publishes Mini App embeds and initializes the Farcaster wallet provider', async () => {
  const [html, app] = await Promise.all([
    readFile('docs/index.html', 'utf8'),
    readFile('docs/app.js', 'utf8')
  ]);
  assert.match(html, /name="fc:frame"/);
  assert.match(html, /name="fc:miniapp"/);
  assert.match(html, /launch_miniapp/);
  assert.match(html, /app\.js\?v=20260817\.2/);
  assert.match(app, /vendor\/viem\.js\?v=20260817\.2/);
  assert.match(app, /try { providers = injected\?\.providers; } catch/);
  assert.match(app, /try \{ discoverWalletProviders\(\); \} catch/);
  assert.match(app, /miniAppSdk\.wallet\.getEthereumProvider/);
  assert.match(app, /miniAppSdk\.actions\.ready/);
});

test('wallet chooser prioritizes mainstream wallets without blocking other providers', async () => {
  const app = await readFile('docs/app.js', 'utf8');
  assert.match(app, /Farcaster & recommended/);
  assert.match(app, /Other installed wallets/);
  assert.match(app, /metamask/);
  assert.match(app, /coinbase/);
  assert.match(app, /rabby/);
  assert.match(app, /uuid && item\.info\.uuid === uuid/);
  assert.match(app, /other\.forEach\(entry => wrapper\.append\(createProviderButton\(entry\)\)\)/);
  assert.doesNotMatch(app, /blockedWallet|providerDenylist|denylistedProvider/i);
});

test('batch bridge keeps the deployed contracts and creates independent bridge records', async () => {
  const [html, app, vault, mirror] = await Promise.all([
    readFile('docs/index.html', 'utf8'),
    readFile('docs/app.js', 'utf8'),
    readFile('src/DegenNftVault.sol', 'utf8'),
    readFile('src/BaseNftMirror.sol', 'utf8')
  ]);
  assert.match(html, /id="batch-mode"/);
  assert.match(html, /id="batch-panel"/);
  assert.match(app, /const MAX_BATCH_SIZE = 5/);
  assert.match(app, /wallet_sendCalls/);
  assert.match(app, /runSequentialBatch/);
  assert.match(app, /args\.collection\.toLowerCase\(\) === item\.collection\.toLowerCase\(\)/);
  assert.match(app, /item\.locked = true; item\.bridgeId = event\?\.id/);
  assert.match(vault, /function bridge\(address collection, uint256 tokenId\)/);
  assert.match(mirror, /mapping\(bytes32 => uint256\) public tokenIdForBridgeId/);
  assert.match(mirror, /require\(tokenIdForBridgeId\[bridgeId\] == 0, "already minted"\)/);
});
