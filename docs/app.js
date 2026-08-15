import { createPublicClient, createWalletClient, custom, decodeEventLog, formatEther, getAddress, http, isAddress, parseEther } from './vendor/viem.js';

const API_BASE = window.BRIDGE_API_URL || (location.hostname.endsWith('github.io') ? '' : location.origin);
const proof = {
  source: { address: '0x22A3a63eB8276928Cb5D45f5e67533BCa7D859A6', tx: '0x860660d4bdd7681fcee1f1c931df861629c5f461133961d1fd4c73a6044e10c8', rpc: 'https://rpc.degen.tips' },
  destination: { address: '0xE08e1ae0e27300882CfF35534cfd5804BFa87697', tx: '0xd635263495bb1adb85ff4f9c59e2362e5b673c0391972c8376cedf604a047898', rpc: 'https://mainnet.base.org' },
  bridgeId: null,
  collection: '0x22A3a63eB8276928Cb5D45f5e67533BCa7D859A6', recipient: '0x96D743afDcAaFd99d2fBD70A6949f41cDd2B282D', standard: 'Vault deployment', sourceTokenId: '—', mirrorTokenId: '—'
};
const ALLOWED_ROUTES = [
  { sourceChainId: 666666666, sourceName: 'Degen Chain', sourceCurrency: 'DEGEN', sourceVault: '0x22A3a63eB8276928Cb5D45f5e67533BCa7D859A6', sourceRpcUrl: 'https://rpc.degen.tips', sourceExplorerUrl: 'https://explorer.degen.tips', destinationChainId: 8453, destinationName: 'Base', mirror: '0xE08e1ae0e27300882CfF35534cfd5804BFa87697', destinationRpcUrls: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.llamarpc.com'], destinationExplorerUrl: 'https://basescan.org', relayer: '0x96D743afDcAaFd99d2fBD70A6949f41cDd2B282D' },
  { sourceChainId: 11155111, sourceName: 'Ethereum Sepolia', sourceCurrency: 'ETH', sourceVault: '0x61e9c5A6f1f656806e201857B6c08e7a3c14818a', sourceRpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com', sourceExplorerUrl: 'https://sepolia.etherscan.io', destinationChainId: 84532, destinationName: 'Base Sepolia', mirror: '0xa0A44dEAD4F124B425DeE4466d542DD612D10517', destinationRpcUrls: ['https://base-sepolia-rpc.publicnode.com', 'https://base-sepolia.drpc.org', 'https://sepolia.base.org'], destinationExplorerUrl: 'https://sepolia.basescan.org', relayer: '0x96D743afDcAaFd99d2fBD70A6949f41cDd2B282D' }
];
const sourceAbi = [
  { type: 'function', name: 'bridge', stateMutability: 'nonpayable', inputs: [{ name: 'collection', type: 'address' }, { name: 'tokenId', type: 'uint256' }], outputs: [{ name: 'id', type: 'bytes32' }] },
  { type: 'event', name: 'NFTBridged', inputs: [{ indexed: true, name: 'id', type: 'bytes32' }, { indexed: true, name: 'collection', type: 'address' }, { indexed: true, name: 'tokenId', type: 'uint256' }, { indexed: false, name: 'holder', type: 'address' }, { indexed: false, name: 'tokenStandard', type: 'uint8' }, { indexed: false, name: 'amount', type: 'uint256' }, { indexed: false, name: 'tokenUri', type: 'string' }, { indexed: false, name: 'timestamp', type: 'uint256' }] }
];
const nftAbi = [
  { type: 'function', name: 'supportsInterface', stateMutability: 'view', inputs: [{ type: 'bytes4' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'tokenURI', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'uri', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getApproved', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'isApprovedForAll', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'setApprovalForAll', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'bool' }], outputs: [] }
];

const state = { config: null, status: null, transfers: [], account: null, wallet: null, provider: null, providerListener: null, providers: [], nft: null, nftPicker: { items: [], nextCursor: null, loading: false, loadedFor: null }, filter: 'all', apiOnline: false, routeTrusted: false };
const $ = id => document.getElementById(id);
const short = (value, head = 6, tail = 4) => value ? `${value.slice(0, head)}…${value.slice(-tail)}` : '—';
const formatBalance = value => {
  if (value === null || value === undefined || value === '' || value === '—') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number >= 1000 ? number.toLocaleString(undefined, { maximumFractionDigits: 1 }) : number.toLocaleString(undefined, { maximumFractionDigits: number < .01 ? 5 : 3 });
};
const explorer = (base, kind, value) => {
  try {
    const url = new URL(`${String(base || '').replace(/\/$/, '')}/${kind}/${encodeURIComponent(value)}`, location.origin);
    return url.protocol === 'https:' || url.origin === location.origin ? url.href : '#';
  } catch { return '#'; }
};

function providerLabel(provider, info = {}) {
  if (info.name) return info.name;
  if (provider?.isCoinbaseWallet) return 'Coinbase Wallet';
  if (provider?.isRabby) return 'Rabby';
  if (provider?.isBraveWallet) return 'Brave Wallet';
  if (provider?.isMetaMask) return 'MetaMask';
  return 'Browser wallet';
}
function registerProvider(provider, info = {}) {
  if (!provider || state.providers.some(item => item.provider === provider)) return;
  state.providers.push({ provider, info: { ...info, name: providerLabel(provider, info) } });
}
function activeProvider() {
  if (state.provider) return state.provider;
  if (state.providers[0]) return state.providers[0].provider;
  return window.ethereum || null;
}
function discoverWalletProviders() {
  const injected = window.ethereum;
  if (Array.isArray(injected?.providers)) injected.providers.forEach(provider => registerProvider(provider));
  else registerProvider(injected);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}
window.addEventListener('eip6963:announceProvider', event => registerProvider(event.detail?.provider, event.detail?.info));
discoverWalletProviders();

function toast(message, type = '') { const item = document.createElement('div'); item.className = `toast ${type}`; item.textContent = message; $('toast-region').append(item); setTimeout(() => item.remove(), 5200); }
function errorMessage(error, chain) {
  const message = error?.shortMessage || error?.message || String(error);
  if (/\b429\b|rate.?limit|too many requests/i.test(message)) {
    return `${chain?.name || 'Network'} is using a rate-limited wallet RPC. Open the RPC repair panel and replace RouteMe, then retry.`;
  }
  return message;
}
function setApiIndicator(mode, text) { $('api-indicator').className = `api-indicator ${mode}`; $('api-indicator').querySelector('span').textContent = text; }
function setView(name) {
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.dataset.view === name));
  document.querySelectorAll('[data-view-link]').forEach(link => link.classList.toggle('active', link.dataset.viewLink === name));
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
}
document.querySelectorAll('[data-view-link]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); setView(link.dataset.viewLink); }));
setView(location.hash.slice(1) || 'bridge');

async function api(path) {
  const response = await fetch(`${API_BASE}${path}`, { headers: { accept: 'application/json' } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || `API ${response.status}`);
  return payload;
}
function fallbackConfig() {
  return { bridgeEnabled: false, safetyReason: 'The production relayer API is not connected. Bridge transactions remain disabled until the operator verifies the service.', routeMode: 'production', source: { name: 'Degen Chain', chainId: 666666666, currency: 'DEGEN', rpcUrl: proof.source.rpc, explorerUrl: 'https://degen.tips', vault: proof.source.address, confirmations: '5' }, destination: { name: 'Base', chainId: 8453, currency: 'ETH', rpcUrl: proof.destination.rpc, rpcUrls: [proof.destination.rpc, 'https://base-rpc.publicnode.com', 'https://base.llamarpc.com'], explorerUrl: 'https://basescan.org', mirror: proof.destination.address, confirmations: '5' }, relayer: proof.recipient };
}
const sameAddress = (left, right) => typeof left === 'string' && typeof right === 'string' && left.toLowerCase() === right.toLowerCase();
function allowedRoute(config) {
  return ALLOWED_ROUTES.find(route => Number(config?.source?.chainId) === route.sourceChainId
    && sameAddress(config?.source?.vault, route.sourceVault)
    && Number(config?.destination?.chainId) === route.destinationChainId
    && sameAddress(config?.destination?.mirror, route.mirror)
    && sameAddress(config?.relayer, route.relayer));
}
const isAllowedRoute = config => !!allowedRoute(config);
function pinRoute(config) {
  const route = allowedRoute(config);
  state.routeTrusted = !!route;
  if (route) return {
    ...config,
    source: { ...config.source, name: route.sourceName, currency: route.sourceCurrency, chainId: route.sourceChainId, vault: route.sourceVault, rpcUrl: route.sourceRpcUrl, rpcUrls: [route.sourceRpcUrl], explorerUrl: route.sourceExplorerUrl },
    destination: { ...config.destination, name: route.destinationName, currency: 'ETH', chainId: route.destinationChainId, mirror: route.mirror, rpcUrl: route.destinationRpcUrls[0], rpcUrls: route.destinationRpcUrls, explorerUrl: route.destinationExplorerUrl },
    relayer: route.relayer
  };
  return { ...config, bridgeEnabled: false, safetyReason: 'The API returned an unrecognized bridge route. All wallet transactions are disabled.' };
}
async function loadConfig() {
  try { state.config = pinRoute(await api('/api/config')); state.apiOnline = true; setApiIndicator('online', 'API online'); }
  catch { state.config = pinRoute(fallbackConfig()); state.apiOnline = false; setApiIndicator('offline', 'Static demo'); }
  renderConfig();
}
function renderConfig() {
  const config = state.config;
  $('source-network-name').textContent = config.source.name;
  $('source-chain-id').textContent = config.source.chainId;
  $('destination-network-name').textContent = config.destination.name;
  $('destination-chain-id').textContent = config.destination.chainId;
  $('base-fund-network').textContent = config.destination.name.toUpperCase();
  $('preferred-base-rpc').textContent = config.destination.rpcUrls?.[0] || config.destination.rpcUrl;
  $('relayer-address').textContent = config.relayer;
  $('relayer-explorer-link').href = explorer(config.destination.explorerUrl, 'address', config.relayer);
  $('safety-banner').hidden = config.bridgeEnabled;
  $('safety-message').textContent = config.safetyReason || '';
  $('route-state').className = `route-state ${config.bridgeEnabled ? 'enabled' : ''}`;
  $('route-state').querySelector('strong').textContent = config.bridgeEnabled ? 'Operational' : 'Safety locked';
  updateTransactionAction();
}

async function loadStatus(silent = false) {
  const [statusResult, transferResult] = await Promise.allSettled([api('/api/status'), api('/api/transfers')]);
  if (statusResult.status === 'fulfilled') {
    state.status = statusResult.value;
    state.apiOnline = true;
    setApiIndicator('online', state.status.relayEnabled ? 'Relayer online' : 'API online');
    const hasBalance = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
    if (!hasBalance(state.status.balances?.degen) || !hasBalance(state.status.balances?.eth)) await loadPublicBalances();
  } else {
    state.status = state.status || { queue: { waiting: 0, submitted: 0, completed: 0, failed: 0 }, balances: { degen: null, eth: null }, blocks: {}, runtime: {} };
    await loadPublicBalances();
  }
  if (transferResult.status === 'fulfilled') state.transfers = transferResult.value.transfers || [];
  if (statusResult.status === 'rejected' && transferResult.status === 'rejected') {
    state.apiOnline = false;
    if (!silent) toast('The production relayer API is temporarily unavailable.', 'error');
  }
  renderStatus(); renderTransfers();
}
async function loadPublicBalances() {
  if (!state.config?.relayer) return;
  const [sourceResult, destinationResult] = await Promise.allSettled([
    createPublicClient({ transport: http(state.config.source.rpcUrl, { retryCount: 2, timeout: 10_000 }) }).getBalance({ address: state.config.relayer }),
    createPublicClient({ transport: http(state.config.destination.rpcUrl, { retryCount: 2, timeout: 10_000 }) }).getBalance({ address: state.config.relayer })
  ]);
  state.status.balances ||= {};
  if (sourceResult.status === 'fulfilled') state.status.balances.degen = formatEther(sourceResult.value);
  if (destinationResult.status === 'fulfilled') state.status.balances.eth = formatEther(destinationResult.value);
}
function renderStatus() {
  const status = state.status; if (!status) return; const queue = status.queue || {};
  $('nav-queue-count').textContent = queue.waiting || 0; $('sidebar-queue').textContent = queue.waiting ?? '—'; $('relayer-waiting').textContent = queue.waiting || 0;
  $('metric-waiting').textContent = queue.waiting || 0; $('metric-submitted').textContent = queue.submitted || 0; $('metric-completed').textContent = queue.completed || 0; $('metric-failed').textContent = queue.failed || 0;
  const ethDisplay = formatBalance(status.balances?.eth); const degenDisplay = formatBalance(status.balances?.degen); const ethNumber = Number(status.balances?.eth); const degenNumber = Number(status.balances?.degen);
  $('base-balance').textContent = ethDisplay; $('degen-balance').textContent = degenDisplay; $('sidebar-base-balance').textContent = ethDisplay === '—' ? '—' : `${ethDisplay} ETH`;
  $('base-balance-bar').style.width = `${Number.isFinite(ethNumber) ? Math.min(100, ethNumber * 100) : 0}%`; $('degen-balance-bar').style.width = `${Number.isFinite(degenNumber) ? Math.min(100, degenNumber / 50) : 0}%`;
  $('relayer-runtime').textContent = status.relayEnabled ? 'Minting enabled' : 'Minting safety locked';
  $('last-poll').textContent = status.runtime?.lastSuccessfulPollAt ? new Date(status.runtime.lastSuccessfulPollAt).toLocaleString() : '—'; $('source-checkpoint').textContent = status.blocks?.nextSourceBlock || '—'; $('source-block').textContent = status.blocks?.source || '—'; $('destination-block').textContent = status.blocks?.destination || '—';
  $('transfer-updated').textContent = status.updatedAt ? `Updated ${new Date(status.updatedAt).toLocaleTimeString()}` : 'Static proof data';
}
function transferStatus(transfer) { return transfer.status === 'discovered' ? 'waiting' : ['waiting', 'submitted', 'completed', 'error'].includes(transfer.status) ? transfer.status : 'error'; }
function renderTransfers() {
  const tbody = $('transfer-table-body'); tbody.innerHTML = '';
  const transfers = state.transfers.filter(item => state.filter === 'all' || transferStatus(item) === state.filter);
  $('transfer-empty').hidden = transfers.length > 0;
  for (const transfer of transfers) {
    const row = document.createElement('tr'); const sourceUrl = explorer(state.config.source.explorerUrl, 'tx', transfer.sourceTxHash); const destinationUrl = transfer.destinationTxHash ? explorer(state.config.destination.explorerUrl, 'tx', transfer.destinationTxHash) : null; const status = transferStatus(transfer);
    const nftCell = document.createElement('td'); const collection = document.createElement('strong'); collection.textContent = short(transfer.sourceCollection); const token = document.createElement('code'); token.textContent = `#${transfer.sourceTokenId}`; nftCell.append(collection, document.createElement('br'), token);
    const holderCell = document.createElement('td'); const holder = document.createElement('code'); holder.textContent = short(transfer.holder); holderCell.append(holder);
    const sourceCell = document.createElement('td'); const sourceLink = document.createElement('a'); sourceLink.href = sourceUrl; sourceLink.target = '_blank'; sourceLink.rel = 'noreferrer'; sourceLink.textContent = short(transfer.sourceTxHash); sourceCell.append(sourceLink);
    const statusCell = document.createElement('td'); const statusPill = document.createElement('span'); statusPill.className = `status-pill ${status}`; statusPill.textContent = status; statusCell.append(statusPill);
    const destinationCell = document.createElement('td'); if (destinationUrl) { const destinationLink = document.createElement('a'); destinationLink.href = destinationUrl; destinationLink.target = '_blank'; destinationLink.rel = 'noreferrer'; destinationLink.textContent = `Token #${transfer.mirrorTokenId || 'pending'}`; destinationCell.append(destinationLink); } else { const waiting = document.createElement('span'); waiting.textContent = 'Waiting'; destinationCell.append(waiting); }
    row.append(nftCell, holderCell, sourceCell, statusCell, destinationCell);
    tbody.append(row);
  }
}
document.querySelectorAll('[data-transfer-filter]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('[data-transfer-filter]').forEach(item => item.classList.remove('active')); button.classList.add('active'); state.filter = button.dataset.transferFilter; renderTransfers(); }));
$('refresh-transfers').addEventListener('click', () => loadStatus());

function chainParams(chain) { return { chainId: `0x${chain.chainId.toString(16)}`, chainName: chain.name, nativeCurrency: { name: chain.currency === 'ETH' ? 'Ether' : chain.currency, symbol: chain.currency, decimals: 18 }, rpcUrls: chain.rpcUrls?.length ? chain.rpcUrls : [chain.rpcUrl], blockExplorerUrls: [chain.explorerUrl] }; }
function isUnknownChainError(error) {
  const codes = [error?.code, error?.cause?.code, error?.data?.originalError?.code].map(Number);
  const message = [error?.shortMessage, error?.message, error?.details, error?.cause?.message]
    .filter(Boolean)
    .join(' ');
  return codes.includes(4902)
    || /unrecognized chain(?: id)?|unknown chain|chain (?:has )?not been added|add(?:ing)? the chain|wallet_addEthereumChain/i.test(message);
}
async function switchChain(chain) {
  const provider = activeProvider();
  if (!provider) throw new Error('No injected wallet found');
  const chainId = `0x${chain.chainId.toString(16)}`;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  } catch (error) {
    if (!isUnknownChainError(error)) throw error;
    await provider.request({ method: 'wallet_addEthereumChain', params: [chainParams(chain)] });
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  }
}
function bindProvider(provider) {
  if (state.provider && state.providerListener && state.provider.removeListener) state.provider.removeListener('accountsChanged', state.providerListener);
  state.provider = provider;
  state.providerListener = accounts => {
    if (!accounts?.[0]) return resetWalletState('Wallet disconnected in your wallet.');
    state.account = getAddress(accounts[0]); state.wallet = createWalletClient({ account: state.account, transport: custom(provider) }); state.nft = null;
    $('nft-preview').hidden = true; resetNftPicker(true); updateWalletUi(); updateTransactionAction(); toast('Wallet account changed', 'success');
  };
  provider.on?.('accountsChanged', state.providerListener);
}
async function connectWallet(provider = activeProvider()) {
  if (!provider) { toast('Install a browser wallet such as Coinbase Wallet or MetaMask.', 'error'); return; }
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  if (!accounts?.[0]) throw new Error('No wallet account was selected.');
  bindProvider(provider);
  state.account = getAddress(accounts[0]); state.wallet = createWalletClient({ account: state.account, transport: custom(provider) });
  resetNftPicker(true);
  updateWalletUi();
  updateTransactionAction(); toast('Wallet connected', 'success');
}
function updateWalletUi() {
  const connected = !!state.account;
  const button = $('connect-wallet');
  button.classList.toggle('connected', connected);
  button.querySelector('span:last-child').textContent = connected ? short(state.account) : 'Connect wallet';
  button.setAttribute('aria-expanded', connected && !$('wallet-menu').hidden ? 'true' : 'false');
  $('wallet-menu-account').textContent = connected ? state.account : '';
  if (!connected && $('wallet-provider-list').hidden) $('wallet-menu').hidden = true;
}
function resetWalletState(message = 'Wallet disconnected from this app.') {
  if (state.provider && state.providerListener && state.provider.removeListener) state.provider.removeListener('accountsChanged', state.providerListener);
  state.account = null;
  state.wallet = null;
  state.provider = null;
  state.providerListener = null;
  state.nft = null;
  resetNftPicker(true);
  $('wallet-provider-list').hidden = true;
  $('wallet-menu').hidden = true;
  $('nft-preview').hidden = true;
  $('step-inspect').classList.add('current');
  $('step-inspect').classList.remove('complete');
  $('step-approve').classList.remove('current', 'complete');
  $('step-bridge').classList.remove('current', 'complete');
  updateWalletUi();
  updateTransactionAction();
  toast(message, 'success');
}
function renderProviderList() {
  const list = $('wallet-provider-list');
  list.innerHTML = '';
  const providers = state.providers.length ? state.providers : (window.ethereum ? [{ provider: window.ethereum, info: { name: providerLabel(window.ethereum) } }] : []);
  for (const entry of providers) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'wallet-provider'; button.setAttribute('role', 'menuitem');
    if (entry.info.icon) { const image = document.createElement('img'); image.src = entry.info.icon; image.alt = ''; image.referrerPolicy = 'no-referrer'; button.append(image); }
    const label = document.createElement('span'); label.textContent = entry.info.name || providerLabel(entry.provider); button.append(label);
    button.addEventListener('click', () => connectWallet(entry.provider).then(() => { list.hidden = true; $('wallet-menu').hidden = true; updateWalletUi(); }).catch(error => toast(error.shortMessage || error.message, 'error')));
    list.append(button);
  }
  list.hidden = providers.length === 0;
}
function openWalletPicker(forceSwitch = false) {
  discoverWalletProviders();
  if (state.providers.length <= 1) return forceSwitch ? switchWalletPermission() : connectWallet(activeProvider());
  renderProviderList();
  $('wallet-provider-list').hidden = false;
  $('wallet-menu').hidden = false;
  updateWalletUi();
}
async function switchWalletPermission() {
  const provider = activeProvider();
  if (!provider) return connectWallet();
  try {
    await provider.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
  } catch (error) {
    const code = Number(error?.code);
    if (code !== -32601 && code !== -32602 && code !== 4200) throw error;
  }
  await connectWallet(provider);
}
async function switchWallet() {
  return openWalletPicker(true);
}
$('connect-wallet').addEventListener('click', () => {
  if (!state.account) return Promise.resolve(openWalletPicker()).catch(error => toast(error.shortMessage || error.message, 'error'));
  $('wallet-menu').hidden = !$('wallet-menu').hidden;
  $('wallet-provider-list').hidden = true;
  updateWalletUi();
});
$('switch-wallet').addEventListener('click', () => switchWallet().catch(error => toast(error.shortMessage || error.message, 'error')));
$('disconnect-wallet').addEventListener('click', () => resetWalletState());
document.addEventListener('click', event => {
  if (!event.target.closest('.wallet-control') && !$('wallet-menu').hidden) {
    $('wallet-menu').hidden = true;
    $('wallet-provider-list').hidden = true;
    updateWalletUi();
  }
});

function parseMetadata(uri) {
  if (!uri) return { name: 'Unnamed NFT', description: '', image: '', type: 'Empty URI' };
  try {
    if (uri.startsWith('data:application/json;base64,')) { const json = JSON.parse(atob(uri.slice('data:application/json;base64,'.length))); return { ...json, type: 'On-chain data URI' }; }
    if (uri.startsWith('data:application/json,')) { const json = JSON.parse(decodeURIComponent(uri.slice('data:application/json,'.length))); return { ...json, type: 'On-chain data URI' }; }
  } catch { return { name: 'NFT', description: 'Metadata could not be decoded in the browser.', image: '', type: 'Data URI' }; }
  return { name: 'NFT', description: '', image: '', type: uri.startsWith('ipfs://') ? 'IPFS URI' : uri.startsWith('ar://') ? 'Arweave URI' : 'External URI' };
}
function mediaUrl(uri) { if (!uri) return ''; if (uri.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${uri.slice(7)}`; if (uri.startsWith('ar://')) return `https://arweave.net/${uri.slice(5)}`; return uri; }

function resetNftPicker(close = false) {
  state.nftPicker = { items: [], nextCursor: null, loading: false, loadedFor: null };
  $('nft-picker-list').innerHTML = '';
  $('nft-picker-search').value = '';
  $('nft-picker-status').className = 'picker-status';
  $('nft-picker-status').textContent = state.account ? 'Open the picker to load this wallet’s NFTs.' : 'Connect a wallet to load NFTs.';
  $('load-more-nfts').hidden = true;
  if (close) {
    $('nft-picker-panel').hidden = true;
    $('toggle-nft-picker').setAttribute('aria-expanded', 'false');
  }
}

function pickerMatches(item, query) {
  if (!query) return true;
  return [item.name, item.collectionName, item.symbol, item.collection, item.tokenId].some(value => String(value || '').toLowerCase().includes(query));
}

function renderNftPicker() {
  const list = $('nft-picker-list');
  const query = $('nft-picker-search').value.trim().toLowerCase();
  const items = state.nftPicker.items.filter(item => pickerMatches(item, query));
  list.innerHTML = '';
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'nft-picker-card';
    const imageUrl = mediaUrl(item.image);
    if (imageUrl) {
      const image = document.createElement('img'); image.src = imageUrl; image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
      image.onerror = () => { const placeholder = document.createElement('span'); placeholder.className = 'nft-picker-placeholder'; placeholder.textContent = 'NFT'; image.replaceWith(placeholder); };
      button.append(image);
    } else {
      const placeholder = document.createElement('span'); placeholder.className = 'nft-picker-placeholder'; placeholder.textContent = 'NFT'; button.append(placeholder);
    }
    const details = document.createElement('span');
    const name = document.createElement('strong'); name.textContent = item.name || `Token #${item.tokenId}`;
    const collection = document.createElement('small'); collection.textContent = item.collectionName || short(item.collection);
    const identity = document.createElement('code'); identity.textContent = item.standard === 'ERC-1155' ? `${item.standard} · #${item.tokenId} · balance ${item.amount}` : `${item.standard} · #${item.tokenId}`;
    details.append(name, collection, identity); button.append(details);
    button.addEventListener('click', async () => {
      $('collection-address').value = item.collection;
      $('token-id').value = item.tokenId;
      $('nft-picker-panel').hidden = true;
      $('toggle-nft-picker').setAttribute('aria-expanded', 'false');
      toast('NFT selected. Verifying it directly on Degen Chain.', 'success');
      await inspectNft({ preventDefault() {} });
    });
    list.append(button);
  }
  if (!state.nftPicker.loading) {
    $('nft-picker-status').className = 'picker-status';
    if (query && !items.length) $('nft-picker-status').textContent = 'No loaded NFTs match this search.';
    else if (!state.nftPicker.items.length) $('nft-picker-status').textContent = 'No ERC-721 or ERC-1155 NFTs were found for this wallet.';
    else $('nft-picker-status').textContent = `${state.nftPicker.items.length} NFT${state.nftPicker.items.length === 1 ? '' : 's'} loaded. Select one to verify it.`;
  }
  $('load-more-nfts').hidden = !state.nftPicker.nextCursor || !!query;
}

async function loadOwnedNfts(append = false) {
  if (!state.account) return toast('Connect the wallet that owns the NFT first.', 'error');
  if (state.nftPicker.loading) return;
  const owner = state.account;
  state.nftPicker.loading = true;
  $('nft-picker-status').className = 'picker-status';
  $('nft-picker-status').textContent = append ? 'Loading more NFTs…' : 'Sending this public wallet address to Degen Explorer to find NFTs…';
  $('refresh-nft-picker').disabled = true; $('load-more-nfts').disabled = true;
  try {
    const cursor = append && state.nftPicker.nextCursor ? `&cursor=${encodeURIComponent(state.nftPicker.nextCursor)}` : '';
    const payload = await api(`/api/nfts?owner=${encodeURIComponent(owner)}&limit=24${cursor}`);
    if (state.account?.toLowerCase() !== owner.toLowerCase()) return;
    const incoming = Array.isArray(payload?.items) ? payload.items : [];
    const combined = append ? [...state.nftPicker.items, ...incoming] : incoming;
    const unique = new Map(combined.map(item => [`${item.collection.toLowerCase()}:${item.tokenId}`, item]));
    state.nftPicker.items = [...unique.values()]; state.nftPicker.nextCursor = payload?.nextCursor || null; state.nftPicker.loadedFor = owner;
  } catch (error) {
    $('nft-picker-status').className = 'picker-status error';
    $('nft-picker-status').textContent = `${error.message} Use manual contract and token ID entry above.`;
    state.nftPicker.nextCursor = null;
  } finally {
    state.nftPicker.loading = false;
    $('refresh-nft-picker').disabled = false; $('load-more-nfts').disabled = false;
    if (!$('nft-picker-status').classList.contains('error')) renderNftPicker();
  }
}

$('toggle-nft-picker').addEventListener('click', async () => {
  if (!state.account) {
    await Promise.resolve(openWalletPicker()).catch(error => toast(error.shortMessage || error.message, 'error'));
    if (!state.account) return;
  }
  const panel = $('nft-picker-panel'); panel.hidden = !panel.hidden;
  $('toggle-nft-picker').setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
  if (!panel.hidden && state.nftPicker.loadedFor?.toLowerCase() !== state.account.toLowerCase()) await loadOwnedNfts();
});
$('refresh-nft-picker').addEventListener('click', () => loadOwnedNfts());
$('load-more-nfts').addEventListener('click', () => loadOwnedNfts(true));
$('nft-picker-search').addEventListener('input', renderNftPicker);

async function inspectNft(event) {
  event.preventDefault(); const collectionValue = $('collection-address').value.trim(); const tokenValue = $('token-id').value.trim();
  if (!isAddress(collectionValue)) return toast('Enter a valid ERC-721 or ERC-1155 contract address.', 'error');
  if (!/^\d+$/.test(tokenValue)) return toast('Enter a valid numeric token ID.', 'error');
  const button = $('inspect-nft'); button.disabled = true; button.textContent = 'Inspecting…';
  try {
    const collection = getAddress(collectionValue); const tokenId = BigInt(tokenValue); const client = createPublicClient({ transport: http(state.config.source.rpcUrl, { retryCount: 3 }) });
    const [is721, is1155] = await Promise.all([
      client.readContract({ address: collection, abi: nftAbi, functionName: 'supportsInterface', args: ['0x80ac58cd'] }).catch(() => false),
      client.readContract({ address: collection, abi: nftAbi, functionName: 'supportsInterface', args: ['0xd9b67a26'] }).catch(() => false)
    ]);
    if (is721 === is1155) throw new Error('Collection must implement exactly one supported standard: ERC-721 or ERC-1155.');
    let owner; let tokenUri; let approved; let standard; let amount = 1n;
    if (is721) {
      standard = 'ERC-721';
      [owner, tokenUri] = await Promise.all([
        client.readContract({ address: collection, abi: nftAbi, functionName: 'ownerOf', args: [tokenId] }),
        client.readContract({ address: collection, abi: nftAbi, functionName: 'tokenURI', args: [tokenId] })
      ]);
      const [approvedAddress, approvedForAll] = await Promise.all([
        client.readContract({ address: collection, abi: nftAbi, functionName: 'getApproved', args: [tokenId] }).catch(() => null),
        client.readContract({ address: collection, abi: nftAbi, functionName: 'isApprovedForAll', args: [owner, state.config.source.vault] }).catch(() => false)
      ]);
      approved = approvedForAll || approvedAddress?.toLowerCase() === state.config.source.vault.toLowerCase();
    } else {
      standard = 'ERC-1155'; owner = state.account;
      if (!owner) throw new Error('Connect the wallet that holds this ERC-1155 token before inspecting it.');
      [amount, tokenUri, approved] = await Promise.all([
        client.readContract({ address: collection, abi: nftAbi, functionName: 'balanceOf', args: [owner, tokenId] }),
        client.readContract({ address: collection, abi: nftAbi, functionName: 'uri', args: [tokenId] }),
        client.readContract({ address: collection, abi: nftAbi, functionName: 'isApprovedForAll', args: [owner, state.config.source.vault] })
      ]);
      if (amount < 1n) throw new Error('Connected wallet has no balance for this ERC-1155 token ID.');
    }
    const metadata = parseMetadata(tokenUri); state.nft = { collection, tokenId, owner: getAddress(owner), tokenUri, metadata, approved, standard, amount };
    $('nft-name').textContent = metadata.name || `Token #${tokenId}`; $('nft-description').textContent = metadata.description || 'No description supplied.'; $('nft-owner').textContent = short(owner); $('nft-owner').title = owner; $('nft-uri-type').textContent = `${standard} · ${metadata.type}`;
    const media = $('nft-media'); media.innerHTML = '<span>NFT</span>'; if (metadata.image) { const image = document.createElement('img'); image.src = mediaUrl(metadata.image); image.alt = metadata.name || 'NFT preview'; image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer'; image.onerror = () => image.remove(); media.append(image); }
    $('nft-preview').hidden = false; $('step-inspect').classList.add('complete'); $('step-inspect').classList.remove('current'); $('step-approve').classList.toggle('complete', approved); $('step-approve').classList.toggle('current', !approved); $('step-bridge').classList.toggle('current', approved); updateTransactionAction();
  } catch (error) { state.nft = null; toast(error.shortMessage || error.message || `Unable to read this NFT on ${state.config?.source?.name || 'Degen Chain'}.`, 'error'); }
  finally { button.disabled = false; button.textContent = 'Inspect NFT'; }
}
$('nft-form').addEventListener('submit', inspectNft);
$('paste-address').addEventListener('click', async () => { try { $('collection-address').value = await navigator.clipboard.readText(); } catch { toast('Clipboard permission was not granted.', 'error'); } });

function updateTransactionAction() {
  const button = $('transaction-action'); if (!state.nft) { button.hidden = true; return; } button.hidden = false;
  if (!state.config?.bridgeEnabled) { button.disabled = true; button.textContent = 'Bridge disabled on this route'; $('transaction-note').textContent = state.config?.safetyReason || ''; return; }
  if (!state.account) { button.disabled = false; button.textContent = 'Connect wallet to continue'; button.dataset.action = 'connect'; $('transaction-note').textContent = ''; return; }
  if (state.account.toLowerCase() !== state.nft.owner.toLowerCase()) { button.disabled = true; button.textContent = 'Connected wallet does not own this NFT'; $('transaction-note').textContent = `Owner: ${state.nft.owner}`; return; }
  button.disabled = false; button.dataset.action = state.nft.approved ? 'bridge' : 'approve'; button.textContent = state.nft.approved ? 'Bridge NFT to Base' : 'Approve vault'; $('transaction-note').textContent = state.nft.approved ? 'This action permanently locks the original NFT.' : state.nft.standard === 'ERC-1155' ? 'ERC-1155 approval grants this vault access to every NFT in this collection. The bridge will lock one unit of the selected token ID.' : 'ERC-721 approval applies only to this token and does not move it.';
}
async function requireSafeRoute(requireBridgeEnabled = true) {
  const latest = await api('/api/config');
  if (!isAllowedRoute(latest)) throw new Error('The API returned an unrecognized transaction route. No wallet request was sent.');
  state.config = pinRoute(latest);
  if (requireBridgeEnabled && !latest.bridgeEnabled) throw new Error(latest.safetyReason || 'Bridge is disabled');
}
async function transactionAction() {
  const action = $('transaction-action').dataset.action; if (action === 'connect') return openWalletPicker(); if (!state.nft || !state.account) return;
  await requireSafeRoute(); await switchChain(state.config.source); const button = $('transaction-action'); button.disabled = true;
  try {
    if (action === 'approve') {
      button.textContent = 'Confirm approval in wallet…'; const sourceWallet = createWalletClient({ account: state.account, chain: { id: state.config.source.chainId, name: state.config.source.name, nativeCurrency: { name: 'Ether', symbol: state.config.source.currency, decimals: 18 }, rpcUrls: { default: { http: [state.config.source.rpcUrl] } } }, transport: custom(activeProvider()) }); const hash = await sourceWallet.writeContract({ account: state.account, chain: sourceWallet.chain, address: state.nft.collection, abi: nftAbi, functionName: state.nft.standard === 'ERC-1155' ? 'setApprovalForAll' : 'approve', args: state.nft.standard === 'ERC-1155' ? [state.config.source.vault, true] : [state.config.source.vault, state.nft.tokenId] });
      const client = createPublicClient({ transport: http(state.config.source.rpcUrl) }); await client.waitForTransactionReceipt({ hash }); state.nft.approved = true; $('step-approve').classList.add('complete'); $('step-approve').classList.remove('current'); $('step-bridge').classList.add('current'); toast('Vault approval confirmed', 'success');
    } else {
      button.textContent = 'Confirm permanent lock…'; const sourceWallet = createWalletClient({ account: state.account, chain: { id: state.config.source.chainId, name: state.config.source.name, nativeCurrency: { name: 'Ether', symbol: state.config.source.currency, decimals: 18 }, rpcUrls: { default: { http: [state.config.source.rpcUrl] } } }, transport: custom(activeProvider()) }); const hash = await sourceWallet.writeContract({ account: state.account, chain: sourceWallet.chain, address: state.config.source.vault, abi: sourceAbi, functionName: 'bridge', args: [state.nft.collection, state.nft.tokenId] });
      const client = createPublicClient({ transport: http(state.config.source.rpcUrl) }); const receipt = await client.waitForTransactionReceipt({ hash, confirmations: Number(state.config.source.confirmations || 1) + 1 }); let bridgeId = null; for (const log of receipt.logs) { try { const decoded = decodeEventLog({ abi: sourceAbi, data: log.data, topics: log.topics }); if (decoded.eventName === 'NFTBridged') bridgeId = decoded.args.id; } catch {} }
      $('step-bridge').classList.add('complete'); $('step-bridge').classList.remove('current'); $('summary-status').textContent = 'Deposited'; button.textContent = 'Bridge record created'; button.disabled = true; toast(`NFT locked${bridgeId ? ` · ${short(bridgeId)}` : ''}`, 'success');
      if (bridgeId) { const relayResponse = await fetch(`${API_BASE}/api/relay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bridgeId }) }); const relayResult = await relayResponse.json(); if (!relayResponse.ok) throw new Error(relayResult.error || 'Relayer request failed'); const destinationName = state.config.destination.name; const relayMessage = relayResult.status === 'completed' ? `NFT minted on ${destinationName}` : relayResult.destinationTxHash ? `${destinationName} mint submitted · ${short(relayResult.destinationTxHash)}` : `Bridge accepted · waiting for ${destinationName} mint`; toast(relayMessage, 'success'); }
      await loadStatus(true);
    }
  } catch (error) { toast(error.shortMessage || error.message, 'error'); }
  finally { updateTransactionAction(); }
}
$('transaction-action').addEventListener('click', transactionAction);

async function fundRelayer(event) {
  event.preventDefault(); if (!state.account) await connectWallet(); if (!state.account) return; const input = event.currentTarget.querySelector('input');
  if (!input.value || Number(input.value) <= 0) return toast('Enter an amount greater than zero.', 'error');
  let chain;
  try { await requireSafeRoute(false); const chainKey = event.currentTarget.dataset.chain; chain = chainKey === 'base' ? state.config.destination : state.config.source; await switchChain(chain); const wallet = createWalletClient({ account: state.account, chain: { id: chain.chainId, name: chain.name, nativeCurrency: { name: chain.currency === 'ETH' ? 'Ether' : chain.currency, symbol: chain.currency, decimals: 18 }, rpcUrls: { default: { http: chain.rpcUrls?.length ? chain.rpcUrls : [chain.rpcUrl] } } }, transport: custom(activeProvider()) }); const hash = await wallet.sendTransaction({ account: state.account, chain: wallet.chain, to: state.config.relayer, value: parseEther(input.value) }); toast(`${chain.currency} top-up submitted: ${short(hash)}`, 'success'); input.value = ''; setTimeout(() => loadStatus(true), 5000); }
  catch (error) { if (/\b429\b|rate.?limit|too many requests|routeme/i.test(error?.shortMessage || error?.message || String(error))) $('wallet-rpc-help').hidden = false; toast(errorMessage(error, chain), 'error'); }
}
document.querySelectorAll('.fund-form').forEach(form => form.addEventListener('submit', fundRelayer));
$('copy-relayer').addEventListener('click', async () => { await navigator.clipboard.writeText(state.config.relayer); toast('Relayer address copied', 'success'); });

async function copyPreferredBaseRpc() {
  const rpc = state.config?.destination?.rpcUrls?.[0] || state.config?.destination?.rpcUrl || proof.destination.rpc;
  await navigator.clipboard.writeText(rpc);
  toast('Stable Base RPC copied', 'success');
}
$('copy-base-rpc').addEventListener('click', () => copyPreferredBaseRpc().catch(() => toast('Copy the displayed RPC URL manually.', 'error')));
$('repair-base-rpc').addEventListener('click', async () => {
  const provider = activeProvider();
  if (!provider) return toast('Connect a browser wallet first.', 'error');
  const chain = state.config.destination;
  $('wallet-rpc-help').hidden = false;
  try {
    await provider.request({ method: 'wallet_addEthereumChain', params: [chainParams(chain)] });
    await switchChain(chain);
    toast('Base network submitted with the stable RPC. Retry the transfer.', 'success');
  } catch (error) {
    toast('Your wallet kept its existing RouteMe RPC. Replace it manually using the URL shown below.', 'error');
  }
});

function wireProof() {
  $('bridge-id').textContent = 'Deployment checkpoint'; $('bridge-id').title = 'Production contract deployment'; $('recipient').textContent = short(proof.recipient); $('recipient').title = proof.recipient;
  Object.assign($('source-collection'), { textContent: short(proof.collection), href: `https://degen.tips/address/${proof.collection}` }); $('source-tx').href = `https://degen.tips/tx/${proof.source.tx}`; $('destination-tx').href = `https://basescan.org/tx/${proof.destination.tx}`;
}
$('verify-button').addEventListener('click', async () => {
  const button = $('verify-button'); const output = $('verification-output'); button.disabled = true; button.textContent = 'Verifying…'; output.hidden = true;
  try { const [sourceClient, destinationClient] = [createPublicClient({ transport: http(proof.source.rpc, { retryCount: 4 }) }), createPublicClient({ transport: http(proof.destination.rpc, { retryCount: 4 }) })]; const [sourceCode, destinationCode, sourceReceipt, destinationReceipt] = await Promise.all([sourceClient.getCode({ address: proof.source.address }), destinationClient.getCode({ address: proof.destination.address }), sourceClient.getTransactionReceipt({ hash: proof.source.tx }), destinationClient.getTransactionReceipt({ hash: proof.destination.tx })]); if (!sourceCode || !destinationCode || sourceReceipt.status !== 'success' || destinationReceipt.status !== 'success') throw new Error('One or more checks failed'); output.hidden = false; output.textContent = `✓ Degen Chain vault runtime bytecode found\n✓ Degen deployment confirmed in block ${sourceReceipt.blockNumber}\n✓ Base mirror runtime bytecode found\n✓ Base deployment confirmed in block ${destinationReceipt.blockNumber}`; toast('Production contracts verified on-chain', 'success'); }
  catch (error) { output.hidden = false; output.textContent = `Public RPC verification is temporarily unavailable. Explorer links remain authoritative.\n\n${error.message}`; toast('A public RPC could not be reached.', 'error'); }
  finally { button.disabled = false; button.textContent = 'Verify on-chain'; }
});

wireProof();
await loadConfig();
await loadStatus(true);
setInterval(() => loadStatus(true), 30_000);
