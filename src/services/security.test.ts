import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateOpaqueRefreshToken,
  generateSixDigitOtp,
  hashRefreshToken,
  hashSecret,
  signAccessToken,
  signEmailConfirmToken,
  signGooglePendingToken,
  verifyAccessToken,
  verifyEmailConfirmToken,
  verifyGooglePendingToken,
  verifySecret,
} from './security';
import {
  buildConfirmEmailTemplate,
  buildLoginOtpEmailTemplate,
  buildWelcomeEmailTemplate,
  escapeHtml,
} from './emails';

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

test('JWT tokenType separation prevents cross-endpoint token confusion', () => {
  const accessToken = signAccessToken('user-1', 'sess-1', 'maya@couply.app', 900);
  const pendingToken = signGooglePendingToken('sub-1', 'maya@couply.app', 'Maya Lin');
  const confirmToken = signEmailConfirmToken('user-1', 'maya@couply.app', 600);

  assert.equal(verifyAccessToken(pendingToken), null);
  assert.equal(verifyAccessToken(confirmToken), null);
  assert.equal(verifyGooglePendingToken(accessToken), null);
  assert.equal(verifyGooglePendingToken(confirmToken), null);
  assert.equal(verifyEmailConfirmToken(accessToken), null);
  assert.equal(verifyEmailConfirmToken(pendingToken), null);

  const validConfirm = verifyEmailConfirmToken(confirmToken);
  assert.ok(validConfirm);
  assert.ok(validConfirm.jti);
  assert.equal(verifyEmailConfirmToken(signEmailConfirmToken('user-1', 'maya@couply.app', -5)), null);
});

test('opaque refresh token hashing is deterministic', () => {
  const raw = generateOpaqueRefreshToken();
  assert.ok(raw.length >= 32);
  assert.equal(hashRefreshToken(raw), hashRefreshToken(raw));
});

test('transactional email templates include expiry, ignore copy, creative copy, and HTML escaping', () => {
  const confirm = buildConfirmEmailTemplate({
    email: 'romeo@couply.app',
    partnerName: '<script>alert(1)</script>Juliet',
    code: '482910',
    confirmUrl: 'https://couply.app/?confirm=abc',
    expiryMinutes: 10,
  });
  assert.ok(confirm.html.includes('Confirm Email Address'));
  assert.ok(confirm.html.includes('482910'));
  assert.ok(confirm.html.includes('Expires in 10 minutes'));
  assert.ok(confirm.html.includes("If you didn&#39;t request this, you can safely ignore this email."));
  assert.equal(confirm.html.includes('<script>'), false);
  assert.ok(confirm.html.includes(escapeHtml('<script>alert(1)</script>Juliet')));

  const welcome = buildWelcomeEmailTemplate({
    fullName: 'Romeo Montague',
    partnerName: 'Juliet',
    appUrl: 'https://couply.app',
  });
  assert.ok(welcome.html.includes('Welcome, Romeo'));
  assert.ok(welcome.html.includes('Open Couply'));

  const loginOtp = buildLoginOtpEmailTemplate({
    email: 'romeo@couply.app',
    partnerName: 'Juliet',
    code: '910283',
    expiryMinutes: 10,
  });
  assert.ok(loginOtp.html.includes('910283'));
  assert.ok(loginOtp.html.includes('Expires in 10 minutes'));
  assert.ok(loginOtp.html.includes("not trying to log in right now, you can safely ignore this email"));
});
