import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const productionUrl = 'https://degen-base-nft-bridge-production.up.railway.app/';

test('Farcaster manifest points to the production bridge and local assets', async () => {
  const manifest = JSON.parse(await readFile('docs/.well-known/farcaster.json', 'utf8'));
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
  assert.match(app, /miniAppSdk\.wallet\.ethProvider/);
  assert.match(app, /miniAppSdk\.actions\.ready/);
});
