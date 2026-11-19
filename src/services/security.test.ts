import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateOpaqueRefreshToken,
  generateSixDigitOtp,
  hashRefreshToken,
  hashSecret,
  signAccessToken,
  verifyAccessToken,
  verifySecret,
} from './security';

test('salted one-way password hashing verifies matches and rejects mismatches', () => {
  const hashA = hashSecret('CouplySecret123!');
  const hashB = hashSecret('CouplySecret123!');

  assert.notEqual(hashA, hashB); // Salted
  assert.equal(verifySecret('CouplySecret123!', hashA), true);
  assert.equal(verifySecret('WrongPassword!', hashA), false);
});

test('generateSixDigitOtp produces zero-padded 6-digit codes', () => {
  for (let i = 0; i < 20; i++) {
    const code = generateSixDigitOtp();
    assert.match(code, /^\d{6}$/);
  }
});

test('JWT access tokens sign, verify, and reject tampered or expired tokens', () => {
  const token = signAccessToken('user-1', 'sess-1', 'maya@couply.app', 900);
  const payload = verifyAccessToken(token);
  assert.ok(payload);
  assert.equal(payload.sub, 'user-1');
  assert.equal(payload.sessionId, 'sess-1');
  assert.equal(payload.email, 'maya@couply.app');

  // Tamper payload
  const [h, p, s] = token.split('.');
  const tampered = `${h}.${p}a.${s}`;
  assert.equal(verifyAccessToken(tampered), null);

  // Expired token
  const expired = signAccessToken('user-1', 'sess-1', 'maya@couply.app', -10);
  assert.equal(verifyAccessToken(expired), null);
});

test('opaque refresh token hashing is deterministic', () => {
  const raw = generateOpaqueRefreshToken();
  assert.ok(raw.length >= 32);
  assert.equal(hashRefreshToken(raw), hashRefreshToken(raw));
});
