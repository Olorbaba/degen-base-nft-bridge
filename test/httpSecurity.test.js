import test from 'node:test';
import assert from 'node:assert/strict';
import { SECURITY_HEADERS, createRateLimiter, requestClientKey } from '../src/httpSecurity.js';

test('security policy blocks framing and remote scripts', () => {
  assert.match(SECURITY_HEADERS['content-security-policy'], /frame-ancestors 'none'/);
  assert.match(SECURITY_HEADERS['content-security-policy'], /script-src 'self'/);
  assert.equal(SECURITY_HEADERS['x-content-type-options'], 'nosniff');
  assert.equal(SECURITY_HEADERS['referrer-policy'], 'no-referrer');
});

test('client key uses the proxy-adjacent forwarded address', () => {
  const request = { headers: { 'x-forwarded-for': 'spoofed-client, trusted-proxy-client' }, socket: { remoteAddress: 'socket-address' } };
  assert.equal(requestClientKey(request), 'trusted-proxy-client');
});

test('rate limiter rejects requests beyond the configured window quota', () => {
  const allowed = createRateLimiter({ max: 2 });
  assert.equal(allowed('client'), true);
  assert.equal(allowed('client'), true);
  assert.equal(allowed('client'), false);
  assert.equal(allowed('other-client'), true);
});
