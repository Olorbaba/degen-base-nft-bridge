export const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; style-src-attr 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://rpc.degen.tips https://explorer.degen.tips https://mainnet.base.org https://base-rpc.publicnode.com https://base.llamarpc.com https://ethereum-sepolia-rpc.publicnode.com https://base-sepolia-rpc.publicnode.com https://base-sepolia.drpc.org https://sepolia.base.org",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'strict-transport-security': 'max-age=31536000; includeSubDomains'
};

export function applySecurityHeaders(setHeader) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) setHeader(name, value);
}

export function requestClientKey(request) {
  const header = name => request.headers?.[name] || request.headers?.get?.(name);
  const direct = header('x-vercel-forwarded-for') || header('cf-connecting-ip') || header('x-real-ip');
  const forwarded = String(header('x-forwarded-for') || '').split(',').map(value => value.trim()).filter(Boolean).at(-1);
  return String(direct || forwarded || request.socket?.remoteAddress || 'unknown').trim().slice(0, 128) || 'unknown';
}

export function createRateLimiter({ windowMs = 60_000, max = 60, maxKeys = 2_000 } = {}) {
  const buckets = new Map();
  return key => {
    const now = Date.now();
    const current = buckets.get(key);
    if (!current || current.expiresAt <= now) buckets.set(key, { count: 1, expiresAt: now + windowMs });
    else if (current.count >= max) return false;
    else current.count += 1;
    if (buckets.size > maxKeys) buckets.delete(buckets.keys().next().value);
    return true;
  };
}
