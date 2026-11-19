import crypto from 'node:crypto';

const JWT_SECRET =
  process.env.JWT_SECRET ||
  crypto.createHash('sha256').update(`couply-dev-${process.cwd()}`).digest('hex');

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_TTL_DAYS = 30; // 30 days
export const OTP_TTL_MINUTES = 10; // 10 minutes

export function hashSecret(raw: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(raw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `${salt}:${derived}`;
}

export function verifySecret(raw: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, hashHex] = parts;
  if (!salt || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(raw, salt, 64, { N: 16384, r: 8, p: 1 });
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function generateSixDigitOtp(): string {
  const num = crypto.randomInt(0, 1_000_000);
  return num.toString().padStart(6, '0');
}

export function generateOpaqueRefreshToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface AccessTokenPayload {
  sub: string;
  sessionId: string;
  email: string;
  iat: number;
  exp: number;
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(normalized, 'base64').toString('utf8');
}

export function signAccessToken(
  userId: string,
  sessionId: string,
  email: string,
  ttlSeconds: number = ACCESS_TOKEN_TTL_SECONDS,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: userId,
      sessionId,
      email,
      iat: now,
      exp: now + ttlSeconds,
    } satisfies AccessTokenPayload),
  );
  const signature = base64UrlEncode(
    crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expectedSig = base64UrlEncode(
    crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest(),
  );
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const decoded = JSON.parse(base64UrlDecode(payload)) as AccessTokenPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!decoded.sub || !decoded.sessionId || decoded.exp <= now) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}
