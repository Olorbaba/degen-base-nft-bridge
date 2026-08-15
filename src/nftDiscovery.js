const DEFAULT_EXPLORER_URL = 'https://explorer.degen.tips';
const SUPPORTED_SOURCE_CHAIN = 666666666;
const MAX_LIMIT = 50;
const CACHE_TTL_MS = 15_000;
const cache = new Map();

export class NftDiscoveryError extends Error {
  constructor(message, statusCode = 502, code = 'nft_discovery_unavailable') {
    super(message);
    this.name = 'NftDiscoveryError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function encodeCursor(value) {
  if (!value || typeof value !== 'object') return null;
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeCursor(value) {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
  } catch {
    throw new NftDiscoveryError('Invalid NFT discovery cursor.', 400, 'invalid_cursor');
  }
}

function normaliseItem(item) {
  const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const collection = item?.token?.address_hash || item?.token?.address || item?.address_hash;
  const tokenId = item?.id ?? item?.token_id ?? item?.tokenId;
  if (!/^0x[0-9a-fA-F]{40}$/.test(collection || '') || tokenId === undefined || tokenId === null) return null;
  const standard = String(item?.token_type || item?.token?.type || '').toUpperCase();
  if (standard !== 'ERC-721' && standard !== 'ERC-1155') return null;
  const amount = item?.value ?? (standard === 'ERC-1155' ? '0' : '1');
  const image = item?.image_url || item?.media_url || metadata.image || '';
  return {
    collection,
    tokenId: String(tokenId),
    standard: standard === 'ERC-1155' ? 'ERC-1155' : 'ERC-721',
    amount: String(amount),
    name: metadata.name || item?.token?.name || `Token #${tokenId}`,
    description: metadata.description || '',
    image: typeof image === 'string' ? image : '',
    collectionName: item?.token?.name || 'Unknown collection',
    symbol: item?.token?.symbol || ''
  };
}

export async function discoverOwnedNfts({ owner, sourceChainId, explorerUrl = DEFAULT_EXPLORER_URL, cursor, limit = 24 } = {}) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(owner || '')) throw new NftDiscoveryError('A valid wallet address is required.', 400, 'invalid_owner');
  if (Number(sourceChainId) !== SUPPORTED_SOURCE_CHAIN) {
    throw new NftDiscoveryError('NFT discovery is currently available for Degen Chain only.', 501, 'unsupported_chain');
  }
  const pageSize = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(limit, 10) || 24));
  const decodedCursor = decodeCursor(cursor);
  const base = String(explorerUrl || DEFAULT_EXPLORER_URL).replace(/\/$/, '');
  const query = new URLSearchParams();
  if (decodedCursor) {
    for (const [key, value] of Object.entries(decodedCursor)) query.set(key, String(value));
  } else {
    query.set('items_count', String(pageSize));
  }
  const url = `${base}/api/v2/addresses/${owner}/nft?${query.toString()}`;
  const cacheKey = `${owner.toLowerCase()}:${query.toString()}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let response;
  try {
    response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
  } catch {
    throw new NftDiscoveryError('Degen Explorer is temporarily unavailable.', 502);
  }
  if (!response.ok) throw new NftDiscoveryError(`Degen Explorer returned HTTP ${response.status}.`, 502);
  let payload;
  try { payload = await response.json(); } catch { throw new NftDiscoveryError('Degen Explorer returned invalid data.', 502); }
  const items = Array.isArray(payload?.items) ? payload.items.map(normaliseItem).filter(Boolean) : [];
  const value = { items, nextCursor: encodeCursor(payload?.next_page_params), source: 'degen-explorer' };
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  if (cache.size > 100) cache.delete(cache.keys().next().value);
  return value;
}
