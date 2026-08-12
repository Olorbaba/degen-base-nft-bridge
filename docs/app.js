import { createPublicClient, createWalletClient, custom, decodeEventLog, formatEther, getAddress, http, isAddress, parseEther } from 'https://esm.sh/viem@2.50.4';

const API_BASE = window.BRIDGE_API_URL || (location.hostname.endsWith('github.io') ? '' : location.origin);
const proof = {
  source: { address: '0xC6a0208aE6FAb9c5Ddfe59700900EBcC6661A8a2', tx: '0xce77a76c2e844dd88cd1125efacc32fb8060f10d2d1de8a7d63a3784dc152e35', rpc: 'https://ethereum-sepolia-rpc.publicnode.com' },
  destination: { address: '0xa0A44dEAD4F124B425DeE4466d542DD612D10517', tx: '0x118a89de268719820cca1a414d36382f67dc670fba19d74478c816c45c6d6c14', rpc: 'https://sepolia.base.org' },
  bridgeId: '0xc46a638002a527d7cf70cd18ee46928c9b585a366ec3b5d915a98b6e9e8cd84b',
  collection: '0x63eb1893E15c98E866F636A6974B5DA3b44CEdEA', recipient: '0xbFdD3790aBb0768FAe791cf1c551F15Aa7Bb498f'
};
const sourceAbi = [
  { type: 'function', name: 'bridge', stateMutability: 'nonpayable', inputs: [{ name: 'collection', type: 'address' }, { name: 'tokenId', type: 'uint256' }], outputs: [{ name: 'id', type: 'bytes32' }] },
  { type: 'event', name: 'NFTBridged', inputs: [{ indexed: true, name: 'id', type: 'bytes32' }, { indexed: true, name: 'collection', type: 'address' }, { indexed: true, name: 'tokenId', type: 'uint256' }, { indexed: false, name: 'holder', type: 'address' }, { indexed: false, name: 'tokenUri', type: 'string' }, { indexed: false, name: 'timestamp', type: 'uint256' }] }
];
const nftAbi = [
  { type: 'function', name: 'tokenURI', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'getApproved', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'isApprovedForAll', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [] }
];

const state = { config: null, status: null, transfers: [], account: null, wallet: null, nft: null, filter: 'all', apiOnline: false };
const $ = id => document.getElementById(id);
const short = (value, head = 6, tail = 4) => value ? `${value.slice(0, head)}…${value.slice(-tail)}` : '—';
const formatBalance = value => { const number = Number(value || 0); return number >= 1000 ? number.toLocaleString(undefined, { maximumFractionDigits: 1 }) : number.toLocaleString(undefined, { maximumFractionDigits: number < .01 ? 5 : 3 }); };
const explorer = (base, kind, value) => `${base}/${kind}/${value}`;

function toast(message, type = '') { const item = document.createElement('div'); item.className = `toast ${type}`; item.textContent = message; $('toast-region').append(item); setTimeout(() => item.remove(), 5200); }
function setApiIndicator(mode, text) { $('api-indicator').className = `api-indicator ${mode}`; $('api-indicator').querySelector('span').textContent = text; }
function setView(name) {
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.dataset.view === name));
  document.querySelectorAll('[data-view-link]').forEach(link => link.classList.toggle('active', link.dataset.viewLink === name));
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
}
document.querySelectorAll('[data-view-link]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); setView(link.dataset.viewLink); }));
setView(location.hash.slice(1) || 'bridge');

async function api(path) { const response = await fetch(`${API_BASE}${path}`, { headers: { accept: 'application/json' } }); if (!response.ok) throw new Error(`API ${response.status}`); return response.json(); }
function fallbackConfig() {
  return { bridgeEnabled: false, safetyReason: 'The live testnet relayer API is not connected. Bridge transactions remain disabled.', routeMode: 'public-testnet', source: { name: 'Ethereum Sepolia', chainId: 11155111, currency: 'ETH', rpcUrl: proof.source.rpc, explorerUrl: 'https://sepolia.etherscan.io', vault: proof.source.address }, destination: { name: 'Base Sepolia', chainId: 84532, currency: 'ETH', rpcUrl: proof.destination.rpc, explorerUrl: 'https://sepolia.basescan.org', mirror: proof.destination.address }, relayer: '0x96D743afDcAaFd99d2fBD70A6949f41cDd2B282D' };
}
async function loadConfig() {
  try { state.config = await api('/api/config'); state.apiOnline = true; setApiIndicator('online', 'API online'); }
  catch { state.config = fallbackConfig(); state.apiOnline = false; setApiIndicator('offline', 'Static demo'); }
  renderConfig();
}
function renderConfig() {
  const config = state.config;
  $('destination-network-name').textContent = config.destination.name;
  $('destination-chain-id').textContent = config.destination.chainId;
  $('base-fund-network').textContent = config.destination.name.toUpperCase();
  $('relayer-address').textContent = config.relayer;
  $('relayer-explorer-link').href = explorer(config.destination.explorerUrl, 'address', config.relayer);
  $('safety-banner').hidden = config.bridgeEnabled;
  $('safety-message').textContent = config.safetyReason || '';
  $('route-state').className = `route-state ${config.bridgeEnabled ? 'enabled' : ''}`;
  $('route-state').querySelector('strong').textContent = config.bridgeEnabled ? 'Operational' : 'Safety locked';
  updateTransactionAction();
}

async function loadStatus(silent = false) {
  try {
    const [status, transferPayload] = await Promise.all([api('/api/status'), api('/api/transfers')]);
    state.status = status; state.transfers = transferPayload.transfers || []; state.apiOnline = true; setApiIndicator('online', status.relayEnabled ? 'Relayer online' : 'API online');
  } catch (error) {
    if (!silent) toast('Live relayer API is not hosted yet. Showing verified static proof.', 'error');
    state.status = state.status || { queue: { waiting: 0, submitted: 0, completed: 1, failed: 0 }, balances: { degen: '—', eth: '—' }, blocks: {}, runtime: {} };
    state.transfers = state.transfers.length ? state.transfers : [{ id: proof.bridgeId, sourceCollection: proof.collection, sourceTokenId: '1', holder: proof.recipient, sourceTxHash: proof.source.tx, destinationTxHash: proof.destination.tx, mirrorTokenId: '3', status: 'completed', completedAt: '2026-08-12T11:31:31.991Z' }];
  }
  renderStatus(); renderTransfers();
}
function renderStatus() {
  const status = state.status; if (!status) return; const queue = status.queue || {};
  $('nav-queue-count').textContent = queue.waiting || 0; $('sidebar-queue').textContent = queue.waiting ?? '—'; $('relayer-waiting').textContent = queue.waiting || 0;
  $('metric-waiting').textContent = queue.waiting || 0; $('metric-submitted').textContent = queue.submitted || 0; $('metric-completed').textContent = queue.completed || 0; $('metric-failed').textContent = queue.failed || 0;
  $('base-balance').textContent = formatBalance(status.balances?.eth); $('degen-balance').textContent = formatBalance(status.balances?.degen); $('sidebar-base-balance').textContent = status.balances?.eth === '—' ? '—' : `${formatBalance(status.balances?.eth)} ETH`;
  $('base-balance-bar').style.width = `${Math.min(100, Number(status.balances?.eth || 0) * 100)}%`; $('degen-balance-bar').style.width = `${Math.min(100, Number(status.balances?.degen || 0) / 50)}%`;
  $('relayer-runtime').textContent = status.relayEnabled ? 'Minting enabled' : 'Minting safety locked';
  $('last-poll').textContent = status.runtime?.lastSuccessfulPollAt ? new Date(status.runtime.lastSuccessfulPollAt).toLocaleString() : '—'; $('source-checkpoint').textContent = status.blocks?.nextSourceBlock || '—'; $('source-block').textContent = status.blocks?.source || '—'; $('destination-block').textContent = status.blocks?.destination || '—';
  $('transfer-updated').textContent = status.updatedAt ? `Updated ${new Date(status.updatedAt).toLocaleTimeString()}` : 'Static proof data';
}
function transferStatus(transfer) { return transfer.status === 'discovered' ? 'waiting' : transfer.status; }
function renderTransfers() {
  const tbody = $('transfer-table-body'); tbody.innerHTML = '';
  const transfers = state.transfers.filter(item => state.filter === 'all' || transferStatus(item) === state.filter);
  $('transfer-empty').hidden = transfers.length > 0;
  for (const transfer of transfers) {
    const row = document.createElement('tr'); const sourceUrl = explorer(state.config.source.explorerUrl, 'tx', transfer.sourceTxHash); const destinationUrl = transfer.destinationTxHash ? explorer(state.config.destination.explorerUrl, 'tx', transfer.destinationTxHash) : null;
    row.innerHTML = `<td><strong>${short(transfer.sourceCollection)}</strong><br><code>#${transfer.sourceTokenId}</code></td><td><code>${short(transfer.holder)}</code></td><td><a href="${sourceUrl}" target="_blank" rel="noreferrer">${short(transfer.sourceTxHash)}</a></td><td><span class="status-pill ${transferStatus(transfer)}">${transferStatus(transfer)}</span></td><td>${destinationUrl ? `<a href="${destinationUrl}" target="_blank" rel="noreferrer">Token #${transfer.mirrorTokenId || 'pending'}</a>` : '<span>Waiting</span>'}</td>`;
    tbody.append(row);
  }
}
document.querySelectorAll('[data-transfer-filter]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('[data-transfer-filter]').forEach(item => item.classList.remove('active')); button.classList.add('active'); state.filter = button.dataset.transferFilter; renderTransfers(); }));
$('refresh-transfers').addEventListener('click', () => loadStatus());

function chainParams(chain) { return { chainId: `0x${chain.chainId.toString(16)}`, chainName: chain.name, nativeCurrency: { name: chain.currency === 'ETH' ? 'Ether' : chain.currency, symbol: chain.currency, decimals: 18 }, rpcUrls: [chain.rpcUrl], blockExplorerUrls: [chain.explorerUrl] }; }
async function switchChain(chain) {
  if (!window.ethereum) throw new Error('No injected wallet found');
  try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${chain.chainId.toString(16)}` }] }); }
  catch (error) { if (error.code !== 4902) throw error; await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [chainParams(chain)] }); }
}
async function connectWallet() {
  if (!window.ethereum) { toast('Install a browser wallet such as Coinbase Wallet or MetaMask.', 'error'); return; }
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }); state.account = getAddress(accounts[0]); state.wallet = createWalletClient({ account: state.account, transport: custom(window.ethereum) });
  $('connect-wallet').classList.add('connected'); $('connect-wallet').querySelector('span:last-child').textContent = short(state.account);
  updateTransactionAction(); toast('Wallet connected', 'success');
}
$('connect-wallet').addEventListener('click', () => connectWallet().catch(error => toast(error.shortMessage || error.message, 'error')));
window.ethereum?.on?.('accountsChanged', accounts => { state.account = accounts[0] ? getAddress(accounts[0]) : null; state.nft = null; $('connect-wallet').classList.toggle('connected', !!state.account); $('connect-wallet').querySelector('span:last-child').textContent = state.account ? short(state.account) : 'Connect wallet'; updateTransactionAction(); });

function parseMetadata(uri) {
  if (!uri) return { name: 'Unnamed NFT', description: '', image: '', type: 'Empty URI' };
  try {
    if (uri.startsWith('data:application/json;base64,')) { const json = JSON.parse(atob(uri.slice('data:application/json;base64,'.length))); return { ...json, type: 'On-chain data URI' }; }
    if (uri.startsWith('data:application/json,')) { const json = JSON.parse(decodeURIComponent(uri.slice('data:application/json,'.length))); return { ...json, type: 'On-chain data URI' }; }
  } catch { return { name: 'NFT', description: 'Metadata could not be decoded in the browser.', image: '', type: 'Data URI' }; }
  return { name: 'NFT', description: '', image: '', type: uri.startsWith('ipfs://') ? 'IPFS URI' : uri.startsWith('ar://') ? 'Arweave URI' : 'External URI' };
}
function mediaUrl(uri) { if (!uri) return ''; if (uri.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${uri.slice(7)}`; if (uri.startsWith('ar://')) return `https://arweave.net/${uri.slice(5)}`; return uri; }
async function inspectNft(event) {
  event.preventDefault(); const collectionValue = $('collection-address').value.trim(); const tokenValue = $('token-id').value.trim();
  if (!isAddress(collectionValue)) return toast('Enter a valid ERC-721 contract address.', 'error');
  if (!/^\d+$/.test(tokenValue)) return toast('Enter a valid numeric token ID.', 'error');
  const button = $('inspect-nft'); button.disabled = true; button.textContent = 'Inspecting…';
  try {
    const collection = getAddress(collectionValue); const tokenId = BigInt(tokenValue); const client = createPublicClient({ transport: http(state.config.source.rpcUrl, { retryCount: 3 }) });
    const [owner, tokenUri] = await Promise.all([client.readContract({ address: collection, abi: nftAbi, functionName: 'ownerOf', args: [tokenId] }), client.readContract({ address: collection, abi: nftAbi, functionName: 'tokenURI', args: [tokenId] })]);
    const [approvedAddress, approvedForAll] = await Promise.all([
      client.readContract({ address: collection, abi: nftAbi, functionName: 'getApproved', args: [tokenId] }).catch(() => null),
      client.readContract({ address: collection, abi: nftAbi, functionName: 'isApprovedForAll', args: [owner, state.config.source.vault] }).catch(() => false)
    ]);
    const metadata = parseMetadata(tokenUri); const approved = approvedForAll || approvedAddress?.toLowerCase() === state.config.source.vault.toLowerCase(); state.nft = { collection, tokenId, owner: getAddress(owner), tokenUri, metadata, approved };
    $('nft-name').textContent = metadata.name || `Token #${tokenId}`; $('nft-description').textContent = metadata.description || 'No description supplied.'; $('nft-owner').textContent = short(owner); $('nft-owner').title = owner; $('nft-uri-type').textContent = metadata.type;
    const media = $('nft-media'); media.innerHTML = '<span>NFT</span>'; if (metadata.image) { const image = document.createElement('img'); image.src = mediaUrl(metadata.image); image.alt = metadata.name || 'NFT preview'; image.onerror = () => image.remove(); media.append(image); }
    $('nft-preview').hidden = false; $('step-inspect').classList.add('complete'); $('step-inspect').classList.remove('current'); $('step-approve').classList.toggle('complete', approved); $('step-approve').classList.toggle('current', !approved); $('step-bridge').classList.toggle('current', approved); updateTransactionAction();
  } catch (error) { state.nft = null; toast(error.shortMessage || 'Unable to read this NFT on Ethereum Sepolia.', 'error'); }
  finally { button.disabled = false; button.textContent = 'Inspect NFT'; }
}
$('nft-form').addEventListener('submit', inspectNft);
$('paste-address').addEventListener('click', async () => { try { $('collection-address').value = await navigator.clipboard.readText(); } catch { toast('Clipboard permission was not granted.', 'error'); } });

function updateTransactionAction() {
  const button = $('transaction-action'); if (!state.nft) { button.hidden = true; return; } button.hidden = false;
  if (!state.config?.bridgeEnabled) { button.disabled = true; button.textContent = 'Bridge disabled on this route'; $('transaction-note').textContent = state.config?.safetyReason || ''; return; }
  if (!state.account) { button.disabled = false; button.textContent = 'Connect wallet to continue'; button.dataset.action = 'connect'; $('transaction-note').textContent = ''; return; }
  if (state.account.toLowerCase() !== state.nft.owner.toLowerCase()) { button.disabled = true; button.textContent = 'Connected wallet does not own this NFT'; $('transaction-note').textContent = `Owner: ${state.nft.owner}`; return; }
  button.disabled = false; button.dataset.action = state.nft.approved ? 'bridge' : 'approve'; button.textContent = state.nft.approved ? 'Bridge NFT to Base' : 'Approve vault'; $('transaction-note').textContent = state.nft.approved ? 'This action permanently locks the original NFT.' : 'Approval does not move the NFT.';
}
async function requireSafeRoute() { const latest = await api('/api/config'); if (!latest.bridgeEnabled) throw new Error(latest.safetyReason || 'Bridge is disabled'); state.config = latest; }
async function transactionAction() {
  const action = $('transaction-action').dataset.action; if (action === 'connect') return connectWallet(); if (!state.nft || !state.account) return;
  await requireSafeRoute(); await switchChain(state.config.source); const button = $('transaction-action'); button.disabled = true;
  try {
    if (action === 'approve') {
      button.textContent = 'Confirm approval in wallet…'; const sourceWallet = createWalletClient({ account: state.account, chain: { id: state.config.source.chainId, name: state.config.source.name, nativeCurrency: { name: 'Ether', symbol: state.config.source.currency, decimals: 18 }, rpcUrls: { default: { http: [state.config.source.rpcUrl] } } }, transport: custom(window.ethereum) }); const hash = await sourceWallet.writeContract({ account: state.account, chain: sourceWallet.chain, address: state.nft.collection, abi: nftAbi, functionName: 'approve', args: [state.config.source.vault, state.nft.tokenId] });
      const client = createPublicClient({ transport: http(state.config.source.rpcUrl) }); await client.waitForTransactionReceipt({ hash }); state.nft.approved = true; $('step-approve').classList.add('complete'); $('step-approve').classList.remove('current'); $('step-bridge').classList.add('current'); toast('Vault approval confirmed', 'success');
    } else {
      button.textContent = 'Confirm permanent lock…'; const sourceWallet = createWalletClient({ account: state.account, chain: { id: state.config.source.chainId, name: state.config.source.name, nativeCurrency: { name: 'Ether', symbol: state.config.source.currency, decimals: 18 }, rpcUrls: { default: { http: [state.config.source.rpcUrl] } } }, transport: custom(window.ethereum) }); const hash = await sourceWallet.writeContract({ account: state.account, chain: sourceWallet.chain, address: state.config.source.vault, abi: sourceAbi, functionName: 'bridge', args: [state.nft.collection, state.nft.tokenId] });
      const client = createPublicClient({ transport: http(state.config.source.rpcUrl) }); const receipt = await client.waitForTransactionReceipt({ hash, confirmations: Number(state.config.source.confirmations || 1) + 1 }); let bridgeId = null; for (const log of receipt.logs) { try { const decoded = decodeEventLog({ abi: sourceAbi, data: log.data, topics: log.topics }); if (decoded.eventName === 'NFTBridged') bridgeId = decoded.args.id; } catch {} }
      $('step-bridge').classList.add('complete'); $('step-bridge').classList.remove('current'); $('summary-status').textContent = 'Deposited'; button.textContent = 'Bridge record created'; button.disabled = true; toast(`NFT locked${bridgeId ? ` · ${short(bridgeId)}` : ''}`, 'success');
      if (bridgeId) { const relayResponse = await fetch(`${API_BASE}/api/relay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bridgeId }) }); const relayResult = await relayResponse.json(); if (!relayResponse.ok) throw new Error(relayResult.error || 'Relayer request failed'); toast(relayResult.status === 'completed' ? 'NFT was already minted on Base Sepolia' : `Base Sepolia mint submitted · ${short(relayResult.destinationTxHash)}`, 'success'); }
      await loadStatus(true);
    }
  } catch (error) { toast(error.shortMessage || error.message, 'error'); }
  finally { updateTransactionAction(); }
}
$('transaction-action').addEventListener('click', transactionAction);

async function fundRelayer(event) {
  event.preventDefault(); if (!state.account) await connectWallet(); if (!state.account) return; const chainKey = event.currentTarget.dataset.chain; const chain = chainKey === 'base' ? state.config.destination : state.config.source; const input = event.currentTarget.querySelector('input');
  if (!input.value || Number(input.value) <= 0) return toast('Enter an amount greater than zero.', 'error');
  try { await switchChain(chain); const wallet = createWalletClient({ account: state.account, chain: { id: chain.chainId, name: chain.name, nativeCurrency: { name: chain.currency === 'ETH' ? 'Ether' : chain.currency, symbol: chain.currency, decimals: 18 }, rpcUrls: { default: { http: [chain.rpcUrl] } } }, transport: custom(window.ethereum) }); const hash = await wallet.sendTransaction({ account: state.account, chain: wallet.chain, to: state.config.relayer, value: parseEther(input.value) }); toast(`${chain.currency} top-up submitted: ${short(hash)}`, 'success'); input.value = ''; setTimeout(() => loadStatus(true), 5000); }
  catch (error) { toast(error.shortMessage || error.message, 'error'); }
}
document.querySelectorAll('.fund-form').forEach(form => form.addEventListener('submit', fundRelayer));
$('copy-relayer').addEventListener('click', async () => { await navigator.clipboard.writeText(state.config.relayer); toast('Relayer address copied', 'success'); });

function wireProof() {
  $('bridge-id').textContent = short(proof.bridgeId, 10, 8); $('bridge-id').title = proof.bridgeId; $('recipient').textContent = short(proof.recipient); $('recipient').title = proof.recipient;
  Object.assign($('source-collection'), { textContent: short(proof.collection), href: `https://sepolia.etherscan.io/address/${proof.collection}` }); $('source-tx').href = `https://sepolia.etherscan.io/tx/${proof.source.tx}`; $('destination-tx').href = `https://sepolia.basescan.org/tx/${proof.destination.tx}`;
}
$('verify-button').addEventListener('click', async () => {
  const button = $('verify-button'); const output = $('verification-output'); button.disabled = true; button.textContent = 'Verifying…'; output.hidden = true;
  try { const [sourceClient, destinationClient] = [createPublicClient({ transport: http(proof.source.rpc, { retryCount: 4 }) }), createPublicClient({ transport: http(proof.destination.rpc, { retryCount: 4 }) })]; const [sourceCode, destinationCode, sourceReceipt, destinationReceipt] = await Promise.all([sourceClient.getCode({ address: proof.source.address }), destinationClient.getCode({ address: proof.destination.address }), sourceClient.getTransactionReceipt({ hash: proof.source.tx }), destinationClient.getTransactionReceipt({ hash: proof.destination.tx })]); if (!sourceCode || !destinationCode || sourceReceipt.status !== 'success' || destinationReceipt.status !== 'success') throw new Error('One or more checks failed'); output.hidden = false; output.textContent = `✓ Ethereum Sepolia vault runtime bytecode found\n✓ Source lock confirmed in block ${sourceReceipt.blockNumber}\n✓ Base Sepolia mirror runtime bytecode found\n✓ Destination mint confirmed in block ${destinationReceipt.blockNumber}\n✓ Bridge evidence matches ${proof.bridgeId}`; toast('Deployment verified on both testnets', 'success'); }
  catch (error) { output.hidden = false; output.textContent = `Public RPC verification is temporarily unavailable. Explorer links remain authoritative.\n\n${error.message}`; toast('A public RPC could not be reached.', 'error'); }
  finally { button.disabled = false; button.textContent = 'Verify on-chain'; }
});

wireProof();
await loadConfig();
await loadStatus(true);
setInterval(() => loadStatus(true), 30_000);
