import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  OTP_TTL_MINUTES,
  REFRESH_TOKEN_TTL_DAYS,
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
} from './src/services/security';
import {
  loadDatabase,
  saveDatabase,
  type DbOtpCode,
  type DbSession,
  type DbUser,
} from './src/services/store';
import {
  buildConfirmEmailTemplate,
  buildLoginOtpEmailTemplate,
  buildWelcomeEmailTemplate,
  dispatchTransactionalEmail,
} from './src/services/emails';
import {
  MAX_OTP_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  THIRTY_DAYS_MS,
  getPasswordErrorMessage,
  isSessionInactiveExpired,
  isValidDateOfBirth,
  isValidEmail,
} from './src/utils/gameLogic';
import { GAME_DECKS } from './src/constants/decks';
import type { ActiveDeckThemeId, GenderTheme } from './src/constants/theme';

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

const VALID_CARD_IDS = new Set<string>(
  GAME_DECKS.flatMap((deck) => deck.cards.map((card) => card.id)),
);

interface AuthedRequest extends Request {
  auth?: {
    userId: string;
    sessionId: string;
    email: string;
  };
}

function resolveAppUrl(): string {
  const configured = process.env.APP_URL?.trim();
  if (
    configured &&
    configured !== 'MY_APP_URL' &&
    (configured.startsWith('https://') || configured.startsWith('http://'))
  ) {
    return configured.replace(/\/+$/, '');
  }
  return `http://localhost:${PORT}`;
}

// Memory-bounded sliding-window rate limiter
function createRateLimiter(options: { windowMs: number; maxRequests: number; message: string }) {
  const hits = new Map<string, number[]>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const cutoff = now - options.windowMs;

    const recent = (hits.get(key) || []).filter((ts) => ts > cutoff);
    if (recent.length >= options.maxRequests) {
      const oldest = recent[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        error: options.message,
        retryAfterSeconds,
      });
      return;
    }

    recent.push(now);
    hits.set(key, recent);

    if (hits.size > 5000) {
      for (const [k, timestamps] of hits.entries()) {
        const filtered = timestamps.filter((ts) => ts > cutoff);
        if (filtered.length === 0) {
          hits.delete(k);
        } else {
          hits.set(k, filtered);
        }
      }
    }

    next();
  };
}

// Per-account failed password attempt lockout (5 wrong passwords -> 15-min cooldown)
const FAILED_LOGIN_MAX = 5;
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const failedLoginAttempts = new Map<string, { count: number; resetAt: number }>();

function getAccountLoginLockRemainingSeconds(email: string): number {
  const entry = failedLoginAttempts.get(email);
  if (!entry) return 0;
  if (Date.now() >= entry.resetAt) {
    failedLoginAttempts.delete(email);
    return 0;
  }
  if (entry.count >= FAILED_LOGIN_MAX) {
    return Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000));
  }
  return 0;
}

function recordFailedLoginAttempt(email: string): void {
  const now = Date.now();
  const existing = failedLoginAttempts.get(email);
  if (!existing || now >= existing.resetAt) {
    failedLoginAttempts.set(email, { count: 1, resetAt: now + FAILED_LOGIN_WINDOW_MS });
  } else {
    existing.count += 1;
    existing.resetAt = now + FAILED_LOGIN_WINDOW_MS;
  }
  if (failedLoginAttempts.size > 5000) {
    for (const [k, v] of failedLoginAttempts.entries()) {
      if (now >= v.resetAt) failedLoginAttempts.delete(k);
    }
  }
}

function clearFailedLoginAttempts(email: string): void {
  failedLoginAttempts.delete(email);
}

function sanitizeUser(user: DbUser) {
  return {
    id: user.id,
    fullName: user.full_name,
    username: user.username,
    email: user.email,
    country: user.country,
    dateOfBirth: user.date_of_birth,
    partnerName: user.partner_name,
    genderTheme: user.gender_theme,
    activeDeckTheme: user.active_deck_theme,
    isVerified: user.is_verified,
    lastSeenAt: user.last_seen_at,
    createdAt: user.created_at,
  };
}

async function sendOtpEmail(params: {
  userId: string;
  email: string;
  partnerName: string;
  code: string;
  purpose: 'signup' | 'login';
}): Promise<{
  deliveredVia: 'resend' | 'gmail' | 'preview';
  providerFailed?: boolean;
  providerError?: string;
  devOtpPreview?: string;
}> {
  const appUrl = resolveAppUrl();
  const template =
    params.purpose === 'signup'
      ? buildConfirmEmailTemplate({
          email: params.email,
          partnerName: params.partnerName,
          code: params.code,
          confirmUrl: `${appUrl}/?confirm=${encodeURIComponent(
            signEmailConfirmToken(params.userId, params.email, OTP_TTL_MINUTES * 60),
          )}`,
          expiryMinutes: OTP_TTL_MINUTES,
        })
      : buildLoginOtpEmailTemplate({
          email: params.email,
          partnerName: params.partnerName,
          code: params.code,
          expiryMinutes: OTP_TTL_MINUTES,
        });

  const dispatch = await dispatchTransactionalEmail({
    to: params.email,
    subject: template.subject,
    html: template.html,
  });

  if (dispatch.deliveredVia === 'resend' || dispatch.deliveredVia === 'gmail') {
    return { deliveredVia: dispatch.deliveredVia };
  }

  if (IS_PROD) {
    const detail = dispatch.providerMessage
      ? `Email delivery failed (${dispatch.providerMessage}).`
      : 'Email delivery is not configured (set GMAIL_SMTP_USER + GMAIL_SMTP_APP_PASSWORD, or RESEND_API_KEY + verified OTP_FROM_EMAIL).';
    return { deliveredVia: 'preview', providerFailed: true, providerError: detail };
  }

  // Only expose preview OTP in non-production dev/preview environments
  return {
    deliveredVia: 'preview',
    devOtpPreview: params.code,
    ...(dispatch.providerMessage ? { providerError: dispatch.providerMessage } : {}),
  };
}

async function sendWelcomeEmailForUser(user: DbUser): Promise<void> {
  const appUrl = resolveAppUrl();
  const template = buildWelcomeEmailTemplate({
    fullName: user.full_name,
    partnerName: user.partner_name,
    appUrl,
  });

  await dispatchTransactionalEmail({
    to: user.email,
    subject: template.subject,
    html: template.html,
  }).catch(() => {});
}

function createOtpForEmail(email: string, purpose: 'signup' | 'login'): {
  code: string;
  cooldownRemaining: number;
} {
  const db = loadDatabase();
  const normalizedEmail = email.trim().toLowerCase();
  const now = Date.now();

  const latestOtp = [...db.otp_codes]
    .filter((o) => o.email === normalizedEmail && o.purpose === purpose)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];

  if (latestOtp) {
    const elapsedSec = Math.floor((now - Date.parse(latestOtp.created_at)) / 1000);
    if (elapsedSec < OTP_RESEND_COOLDOWN_SECONDS) {
      return {
        code: '',
        cooldownRemaining: OTP_RESEND_COOLDOWN_SECONDS - elapsedSec,
      };
    }
  }

  // Invalidate prior unused OTPs for this email
  for (const row of db.otp_codes) {
    if (row.email === normalizedEmail && !row.used) {
      row.used = true;
    }
  }

  const code = generateSixDigitOtp();
  const record: DbOtpCode = {
    id: crypto.randomUUID(),
    email: normalizedEmail,
    code_hash: hashSecret(code),
    purpose,
    attempts: 0,
    expires_at: new Date(now + OTP_TTL_MINUTES * 60 * 1000).toISOString(),
    used: false,
    created_at: new Date(now).toISOString(),
  };

  db.otp_codes.push(record);
  saveDatabase(db);
  return { code, cooldownRemaining: 0 };
}

function issueSessionForUser(user: DbUser) {
  const db = loadDatabase();
  const now = new Date();
  const sessionId = crypto.randomUUID();
  const refreshToken = generateOpaqueRefreshToken();
  const expiresAt = new Date(
    now.getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const session: DbSession = {
    id: sessionId,
    user_id: user.id,
    refresh_token_hash: hashRefreshToken(refreshToken),
    last_active_at: now.toISOString(),
    expires_at: expiresAt,
    revoked: false,
  };

  const targetUser = db.users.find((u) => u.id === user.id);
  if (targetUser) {
    targetUser.last_seen_at = now.toISOString();
  }

  db.sessions.push(session);
  saveDatabase(db);

  const accessToken = signAccessToken(user.id, sessionId, user.email, ACCESS_TOKEN_TTL_SECONDS);
  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    user: sanitizeUser(targetUser || user),
  };
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const payload = verifyAccessToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired access token.' });
    return;
  }

  const db = loadDatabase();
  const session = db.sessions.find((s) => s.id === payload.sessionId);
  if (!session || session.revoked || session.user_id !== payload.sub) {
    res.status(401).json({ error: 'Session has been revoked.' });
    return;
  }

  const user = db.users.find((u) => u.id === payload.sub);
  if (!user || !user.is_verified) {
    res.status(401).json({ error: 'Account is not verified or no longer exists.' });
    return;
  }

  if (isSessionInactiveExpired(session.last_active_at) || Date.parse(session.expires_at) <= Date.now()) {
    session.revoked = true;
    saveDatabase(db);
    res.status(401).json({
      error: 'Signed out after 30 days of inactivity.',
      code: 'SESSION_EXPIRED_INACTIVITY',
    });
    return;
  }

  req.auth = {
    userId: payload.sub,
    sessionId: payload.sessionId,
    email: payload.email,
  };
  next();
}

async function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '32kb' }));

  // Security headers (iframe-compatible for AI Studio preview)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    if (IS_PROD) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
    }
    next();
  });

  const globalApiLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 120,
    message: 'Too many requests. Please slow down for a moment.',
  });

  const authRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 25,
    message: 'Too many authentication attempts. Please wait a few minutes and try again.',
  });

  app.use('/api', globalApiLimiter);
  app.use('/api/auth', authRateLimiter);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'couply-api', timestamp: new Date().toISOString() });
  });

  // 1. Signup (handles unverified signup abandonment by overwriting unverified records)
  app.post('/api/auth/signup', async (req, res) => {
    const {
      fullName,
      username,
      country,
      dateOfBirth,
      email,
      password,
      confirmPassword,
      genderTheme,
      partnerName,
      acceptedTerms,
    } = req.body ?? {};

    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.trim().length > 80) {
      res.status(400).json({ error: 'Full Name must be between 2 and 80 characters.' });
      return;
    }
    if (!username || typeof username !== 'string' || !/^[a-zA-Z0-9_]{3,24}$/.test(username.trim())) {
      res.status(400).json({ error: 'Username must be 3–24 letters, numbers, or underscores.' });
      return;
    }
    if (!partnerName || typeof partnerName !== 'string' || !partnerName.trim() || partnerName.trim().length > 40) {
      res.status(400).json({ error: "Partner's Name is required (max 40 characters)." });
      return;
    }
    const cleanCountry = typeof country === 'string' ? country.trim().slice(0, 80) : '';
    const cleanDob = typeof dateOfBirth === 'string' ? dateOfBirth.trim() : '';
    if (cleanDob && !isValidDateOfBirth(cleanDob)) {
      res.status(400).json({ error: 'Please enter a valid date of birth (13+).' });
      return;
    }
    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    const passwordError =
      typeof password === 'string' ? getPasswordErrorMessage(password) : 'Password is required.';
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }
    if (password.length > 128) {
      res.status(400).json({ error: 'Password must be 128 characters or fewer.' });
      return;
    }
    if (password !== confirmPassword) {
      res.status(400).json({ error: 'Passwords do not match.' });
      return;
    }
    if (genderTheme !== 'female' && genderTheme !== 'male') {
      res.status(400).json({ error: 'Please select Her or Him theme.' });
      return;
    }
    if (acceptedTerms !== true) {
      res.status(400).json({ error: 'You must agree to the Terms & Conditions.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim().toLowerCase();
    const db = loadDatabase();

    const existingVerifiedEmail = db.users.find(
      (u) => u.email === normalizedEmail && u.is_verified,
    );
    if (existingVerifiedEmail) {
      res.status(409).json({
        error: 'An account with this email already exists. Log in instead.',
        code: 'EMAIL_ALREADY_EXISTS',
      });
      return;
    }

    const existingVerifiedUsername = db.users.find(
      (u) => u.username.toLowerCase() === normalizedUsername && u.is_verified,
    );
    if (existingVerifiedUsername) {
      res.status(409).json({
        error: 'That username is already taken.',
        code: 'USERNAME_TAKEN',
      });
      return;
    }

    // Overwrite any unverified abandoned signup matching email or username
    db.users = db.users.filter(
      (u) =>
        u.is_verified ||
        (u.email !== normalizedEmail && u.username.toLowerCase() !== normalizedUsername),
    );

    const now = new Date().toISOString();
    const newUser: DbUser = {
      id: crypto.randomUUID(),
      full_name: fullName.trim(),
      username: username.trim(),
      email: normalizedEmail,
      country: cleanCountry,
      date_of_birth: cleanDob,
      partner_name: partnerName.trim(),
      password_hash: hashSecret(password),
      google_sub: null,
      gender_theme: genderTheme as GenderTheme,
      active_deck_theme: 'default',
      is_verified: false,
      last_seen_at: now,
      created_at: now,
    };

    db.users.push(newUser);
    saveDatabase(db);

    const otpResult = createOtpForEmail(normalizedEmail, 'signup');
    if (otpResult.cooldownRemaining > 0) {
      res.status(429).json({
        error: `Please wait ${otpResult.cooldownRemaining}s before requesting another code.`,
        retryAfterSeconds: otpResult.cooldownRemaining,
      });
      return;
    }

    const delivery = await sendOtpEmail({
      userId: newUser.id,
      email: normalizedEmail,
      partnerName: newUser.partner_name,
      code: otpResult.code,
      purpose: 'signup',
    });

    if (delivery.providerFailed) {
      res.status(502).json({
        error:
          delivery.providerError ||
          'Unable to send confirmation email right now. Please try again.',
      });
      return;
    }

    res.status(201).json({
      message: 'Confirmation email sent. Enter the 6-digit code or click the link in your inbox.',
      email: normalizedEmail,
      purpose: 'signup',
      cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      deliveredVia: delivery.deliveredVia,
      ...(delivery.devOtpPreview ? { devOtpPreview: delivery.devOtpPreview } : {}),
    });
  });

  // 2. Login (Checks if user exists first; non-existent accounts are pushed to Sign Up)
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (!password || typeof password !== 'string' || password.length > 128) {
      res.status(400).json({ error: 'Password is required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const lockRemaining = getAccountLoginLockRemainingSeconds(normalizedEmail);
    if (lockRemaining > 0) {
      res.status(429).json({
        error: `Too many incorrect password attempts. Try again in ${Math.ceil(lockRemaining / 60)} minute(s).`,
        retryAfterSeconds: lockRemaining,
      });
      return;
    }

    const db = loadDatabase();
    const user = db.users.find((u) => u.email === normalizedEmail);

    if (!user) {
      res.status(404).json({
        error: "No account found for that email. Let's get you signed up.",
        code: 'USER_NOT_FOUND',
      });
      return;
    }

    if (!user.password_hash) {
      res.status(400).json({
        error: 'This account uses Google Sign-In. Tap Continue with Google below.',
        code: 'GOOGLE_ONLY_ACCOUNT',
      });
      return;
    }

    if (!verifySecret(password, user.password_hash)) {
      recordFailedLoginAttempt(normalizedEmail);
      res.status(401).json({ error: 'Incorrect password. Please try again.' });
      return;
    }

    clearFailedLoginAttempts(normalizedEmail);

    const purpose = user.is_verified ? 'login' : 'signup';
    const otpResult = createOtpForEmail(normalizedEmail, purpose);
    if (otpResult.cooldownRemaining > 0) {
      res.status(429).json({
        error: `Please wait ${otpResult.cooldownRemaining}s before requesting another code.`,
        retryAfterSeconds: otpResult.cooldownRemaining,
      });
      return;
    }

    const delivery = await sendOtpEmail({
      userId: user.id,
      email: normalizedEmail,
      partnerName: user.partner_name,
      code: otpResult.code,
      purpose,
    });

    if (delivery.providerFailed) {
      res.status(502).json({
        error:
          delivery.providerError ||
          'Unable to send sign-in confirmation email right now.',
      });
      return;
    }

    res.json({
      message: 'Enter the 6-digit verification code sent to your email.',
      email: normalizedEmail,
      purpose,
      cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      deliveredVia: delivery.deliveredVia,
      ...(delivery.devOtpPreview ? { devOtpPreview: delivery.devOtpPreview } : {}),
    });
  });

  // 3. Resend OTP (60s cooldown)
  app.post('/api/auth/resend-otp', async (req, res) => {
    const { email, purpose } = req.body ?? {};
    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const db = loadDatabase();
    const user = db.users.find((u) => u.email === normalizedEmail);
    if (!user) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }

    const resolvedPurpose: 'signup' | 'login' =
      !user.is_verified || purpose === 'signup' ? 'signup' : 'login';
    const otpResult = createOtpForEmail(normalizedEmail, resolvedPurpose);
    if (otpResult.cooldownRemaining > 0) {
      res.status(429).json({
        error: `Wait ${otpResult.cooldownRemaining}s before resending.`,
        retryAfterSeconds: otpResult.cooldownRemaining,
      });
      return;
    }

    const delivery = await sendOtpEmail({
      userId: user.id,
      email: normalizedEmail,
      partnerName: user.partner_name,
      code: otpResult.code,
      purpose: resolvedPurpose,
    });

    if (delivery.providerFailed) {
      res.status(502).json({
        error:
          delivery.providerError ||
          'Unable to resend verification email right now.',
      });
      return;
    }

    res.json({
      message: 'A new 6-digit code has been sent.',
      cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      deliveredVia: delivery.deliveredVia,
      ...(delivery.devOtpPreview ? { devOtpPreview: delivery.devOtpPreview } : {}),
    });
  });

  // 4. Verify OTP (max 3 attempts, 10-min expiry, purpose-bound)
  app.post('/api/auth/verify-otp', async (req, res) => {
    const { email, code, purpose } = req.body ?? {};
    if (!email || typeof email !== 'string' || !isValidEmail(email) || !code || typeof code !== 'string') {
      res.status(400).json({ error: 'Valid email and 6-digit code are required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const cleanedCode = code.trim();
    if (!/^\d{6}$/.test(cleanedCode)) {
      res.status(400).json({ error: 'Code must be exactly 6 digits.' });
      return;
    }

    const db = loadDatabase();
    const expectedPurpose: 'signup' | 'login' | null =
      purpose === 'signup' || purpose === 'login' ? purpose : null;

    const otpRecord = [...db.otp_codes]
      .filter(
        (o) =>
          o.email === normalizedEmail &&
          !o.used &&
          (!expectedPurpose || o.purpose === expectedPurpose),
      )
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];

    if (!otpRecord) {
      res.status(400).json({ error: 'No active verification code found. Request a new code.' });
      return;
    }

    if (Date.parse(otpRecord.expires_at) <= Date.now()) {
      otpRecord.used = true;
      saveDatabase(db);
      res.status(400).json({ error: 'Verification code expired. Please resend a new code.' });
      return;
    }

    if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
      otpRecord.used = true;
      saveDatabase(db);
      res.status(429).json({ error: 'Maximum attempts reached. Request a new code.' });
      return;
    }

    const isMatch = verifySecret(cleanedCode, otpRecord.code_hash);
    if (!isMatch) {
      otpRecord.attempts += 1;
      if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
        otpRecord.used = true;
      }
      saveDatabase(db);
      const remaining = Math.max(0, MAX_OTP_ATTEMPTS - otpRecord.attempts);
      res.status(400).json({
        error:
          remaining > 0
            ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : 'Code invalidated after 3 failed attempts. Please request a new code.',
      });
      return;
    }

    otpRecord.used = true;
    const user = db.users.find((u) => u.email === normalizedEmail);
    if (!user) {
      saveDatabase(db);
      res.status(404).json({ error: 'User account not found.' });
      return;
    }

    const wasVerified = user.is_verified;
    user.is_verified = true;
    user.last_seen_at = new Date().toISOString();
    saveDatabase(db);

    if (!wasVerified && otpRecord.purpose === 'signup') {
      void sendWelcomeEmailForUser(user);
    }

    const sessionBundle = issueSessionForUser(user);
    res.json(sessionBundle);
  });

  // 4b. Confirm Email via Magic Button Link (10-min expiry, single-use jti)
  app.post('/api/auth/confirm-email-link', (req, res) => {
    const { token } = req.body ?? {};
    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'Confirmation token is required.' });
      return;
    }

    const payload = verifyEmailConfirmToken(token);
    if (!payload) {
      res.status(401).json({ error: 'This confirmation link has expired or is invalid.' });
      return;
    }

    const db = loadDatabase();
    const alreadyUsed = db.used_confirm_jtis.some((entry) => entry.jti === payload.jti);
    if (alreadyUsed) {
      res.status(401).json({ error: 'This confirmation link has already been used.' });
      return;
    }

    const user = db.users.find((u) => u.id === payload.sub && u.email === payload.email);
    if (!user) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }

    db.used_confirm_jtis.push({
      jti: payload.jti,
      expires_at: new Date(payload.exp * 1000).toISOString(),
    });

    for (const otp of db.otp_codes) {
      if (otp.email === user.email && !otp.used) {
        otp.used = true;
      }
    }

    const wasVerified = user.is_verified;
    user.is_verified = true;
    user.last_seen_at = new Date().toISOString();
    saveDatabase(db);

    if (!wasVerified) {
      void sendWelcomeEmailForUser(user);
    }

    const sessionBundle = issueSessionForUser(user);
    res.json(sessionBundle);
  });

  // 5. Google Sign-In Verification, Auto-Linking & New User Profile Completion Prompt
  app.post('/api/auth/google', async (req, res) => {
    const { idToken } = req.body ?? {};
    const expectedClientId = process.env.GOOGLE_CLIENT_ID?.trim();

    if (!expectedClientId) {
      res.status(503).json({
        error: 'Google Sign-In requires GOOGLE_CLIENT_ID configured on the server.',
      });
      return;
    }

    if (!idToken || typeof idToken !== 'string') {
      res.status(400).json({ error: 'Google ID token is required.' });
      return;
    }

    try {
      const verifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
      const googleRes = await fetch(verifyUrl, { signal: AbortSignal.timeout(8000) });
      if (!googleRes.ok) {
        res.status(401).json({ error: 'Google token verification failed.' });
        return;
      }
      const tokenInfo = (await googleRes.json()) as {
        sub?: string;
        email?: string;
        email_verified?: string;
        name?: string;
        aud?: string;
        iss?: string;
        exp?: string;
      };

      const validIssuer =
        tokenInfo.iss === 'accounts.google.com' ||
        tokenInfo.iss === 'https://accounts.google.com';
      const tokenExp = Number(tokenInfo.exp || 0);

      if (!validIssuer || tokenInfo.aud !== expectedClientId || tokenExp <= Math.floor(Date.now() / 1000)) {
        res.status(401).json({ error: 'Google token validation failed.' });
        return;
      }

      if (!tokenInfo.email || tokenInfo.email_verified !== 'true' || !tokenInfo.sub) {
        res.status(401).json({ error: 'Verified Google email is required.' });
        return;
      }

      const normalizedEmail = tokenInfo.email.toLowerCase();
      const db = loadDatabase();
      const existingUser = db.users.find(
        (u) => u.google_sub === tokenInfo.sub || u.email === normalizedEmail,
      );

      if (existingUser) {
        const wasVerified = existingUser.is_verified;
        existingUser.google_sub = tokenInfo.sub;
        existingUser.is_verified = true;
        existingUser.last_seen_at = new Date().toISOString();
        saveDatabase(db);
        if (!wasVerified) {
          void sendWelcomeEmailForUser(existingUser);
        }
        const sessionBundle = issueSessionForUser(existingUser);
        res.json(sessionBundle);
        return;
      }

      // New Google user -> prompt for chosen username, partner's name & theme
      const fullName =
        tokenInfo.name?.trim().slice(0, 80) ||
        normalizedEmail.split('@')[0].replace(/[^a-zA-Z0-9 ]/g, ' ');
      const pendingToken = signGooglePendingToken(tokenInfo.sub, normalizedEmail, fullName);
      res.json({
        needsProfileCompletion: true,
        pendingToken,
        prefill: {
          fullName,
          email: normalizedEmail,
        },
      });
    } catch {
      res.status(502).json({ error: 'Unable to reach Google verification service.' });
    }
  });

  // 5b. Complete Google Sign-Up (Username, Partner's Name, Optional DOB, Gender Theme, T&C)
  app.post('/api/auth/google/complete', (req, res) => {
    const {
      pendingToken,
      username,
      partnerName,
      dateOfBirth,
      country,
      genderTheme,
      acceptedTerms,
    } = req.body ?? {};

    if (!pendingToken || typeof pendingToken !== 'string') {
      res.status(400).json({ error: 'Google verification session expired. Please sign in again.' });
      return;
    }

    const googleData = verifyGooglePendingToken(pendingToken);
    if (!googleData) {
      res.status(401).json({ error: 'Google session expired. Please try Continue with Google again.' });
      return;
    }

    if (!username || typeof username !== 'string' || !/^[a-zA-Z0-9_]{3,24}$/.test(username.trim())) {
      res.status(400).json({ error: 'Username must be 3–24 letters, numbers, or underscores.' });
      return;
    }
    if (!partnerName || typeof partnerName !== 'string' || !partnerName.trim() || partnerName.trim().length > 40) {
      res.status(400).json({ error: "Please enter your partner's name (max 40 characters)." });
      return;
    }
    const cleanDob = typeof dateOfBirth === 'string' ? dateOfBirth.trim() : '';
    if (cleanDob && !isValidDateOfBirth(cleanDob)) {
      res.status(400).json({ error: 'Please enter a valid date of birth (13+).' });
      return;
    }
    if (genderTheme !== 'female' && genderTheme !== 'male') {
      res.status(400).json({ error: 'Please select Her or Him theme.' });
      return;
    }
    if (acceptedTerms !== true) {
      res.status(400).json({ error: 'You must agree to the Terms & Conditions.' });
      return;
    }

    const db = loadDatabase();
    const normalizedEmail = googleData.email.toLowerCase();
    const normalizedUsername = username.trim().toLowerCase();

    const emailExists = db.users.find((u) => u.email === normalizedEmail && u.is_verified);
    if (emailExists) {
      res.status(409).json({
        error: 'An account with this email already exists. Log in instead.',
        code: 'EMAIL_ALREADY_EXISTS',
      });
      return;
    }

    const usernameExists = db.users.find(
      (u) => u.username.toLowerCase() === normalizedUsername && u.is_verified,
    );
    if (usernameExists) {
      res.status(409).json({
        error: 'That username is already taken. Choose another one.',
        code: 'USERNAME_TAKEN',
      });
      return;
    }

    // Overwrite any unverified abandoned record if one existed
    db.users = db.users.filter(
      (u) =>
        u.is_verified ||
        (u.email !== normalizedEmail && u.username.toLowerCase() !== normalizedUsername),
    );

    const now = new Date().toISOString();
    const newUser: DbUser = {
      id: crypto.randomUUID(),
      full_name: googleData.fullName,
      username: username.trim(),
      email: normalizedEmail,
      country: typeof country === 'string' ? country.trim().slice(0, 80) : '',
      date_of_birth: cleanDob,
      partner_name: partnerName.trim(),
      password_hash: null,
      google_sub: googleData.googleSub,
      gender_theme: genderTheme as GenderTheme,
      active_deck_theme: 'default',
      is_verified: true,
      last_seen_at: now,
      created_at: now,
    };

    db.users.push(newUser);
    saveDatabase(db);

    void sendWelcomeEmailForUser(newUser);

    const sessionBundle = issueSessionForUser(newUser);
    res.status(201).json(sessionBundle);
  });

  // 6. Demo Couple Session (for immediate preview & ?autostart=1 verification)
  app.post('/api/auth/demo', (_req, res) => {
    const db = loadDatabase();
    const demoUser = db.users.find((u) => u.email === 'maya@couply.app') || db.users[0];
    if (!demoUser) {
      res.status(404).json({ error: 'Demo user unavailable.' });
      return;
    }
    const sessionBundle = issueSessionForUser(demoUser);
    res.json(sessionBundle);
  });

  // 7. Refresh Token with Rotation, Reuse Detection & 30-Day Inactivity Revocation
  app.post('/api/auth/refresh', (req, res) => {
    const { refreshToken } = req.body ?? {};
    if (!refreshToken || typeof refreshToken !== 'string') {
      res.status(400).json({ error: 'Refresh token required.' });
      return;
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const db = loadDatabase();

    // Reuse detection: if an already-rotated refresh token is replayed, revoke all user sessions
    const reused = db.rotated_refresh_hashes.find((entry) => entry.token_hash === tokenHash);
    if (reused) {
      for (const s of db.sessions) {
        if (s.user_id === reused.user_id) {
          s.revoked = true;
        }
      }
      saveDatabase(db);
      res.status(401).json({
        error: 'Session invalidated for your security. Please log in again.',
        code: 'REFRESH_TOKEN_REUSE_DETECTED',
      });
      return;
    }

    const session = db.sessions.find((s) => s.refresh_token_hash === tokenHash);
    if (!session || session.revoked) {
      res.status(401).json({ error: 'Session is invalid or revoked.' });
      return;
    }

    if (
      isSessionInactiveExpired(session.last_active_at) ||
      Date.parse(session.expires_at) <= Date.now()
    ) {
      session.revoked = true;
      saveDatabase(db);
      res.status(401).json({
        error: 'Signed out after 30 days of inactivity.',
        code: 'SESSION_EXPIRED_INACTIVITY',
      });
      return;
    }

    const user = db.users.find((u) => u.id === session.user_id);
    if (!user || !user.is_verified) {
      res.status(401).json({ error: 'User not found or unverified.' });
      return;
    }

    // Rotate refresh token on every refresh
    const nextRefreshToken = generateOpaqueRefreshToken();
    db.rotated_refresh_hashes.push({
      token_hash: tokenHash,
      user_id: user.id,
      expires_at: session.expires_at,
    });
    session.refresh_token_hash = hashRefreshToken(nextRefreshToken);

    const nowIso = new Date().toISOString();
    session.last_active_at = nowIso;
    user.last_seen_at = nowIso;
    saveDatabase(db);

    const accessToken = signAccessToken(user.id, session.id, user.email, ACCESS_TOKEN_TTL_SECONDS);
    res.json({
      accessToken,
      refreshToken: nextRefreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: sanitizeUser(user),
    });
  });

  // 8. Logout
  app.post('/api/auth/logout', requireAuth, (req: AuthedRequest, res) => {
    const db = loadDatabase();
    const session = db.sessions.find((s) => s.id === req.auth?.sessionId);
    if (session) {
      session.revoked = true;
      saveDatabase(db);
    }
    res.json({ ok: true });
  });

  // 9. Profile & Active Theme (never modifies locked gender_theme)
  app.get('/api/me', requireAuth, (req: AuthedRequest, res) => {
    const db = loadDatabase();
    const user = db.users.find((u) => u.id === req.auth?.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    res.json({ user: sanitizeUser(user) });
  });

  app.patch('/api/me', requireAuth, (req: AuthedRequest, res) => {
    const { activeDeckTheme, partnerName } = req.body ?? {};
    const allowedThemes: ActiveDeckThemeId[] = [
      'default',
      'obsidian',
      'terracotta',
      'olive',
      'mulberry',
      'female',
      'male',
    ];

    const db = loadDatabase();
    const user = db.users.find((u) => u.id === req.auth?.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (typeof activeDeckTheme === 'string' && allowedThemes.includes(activeDeckTheme as ActiveDeckThemeId)) {
      user.active_deck_theme = activeDeckTheme as ActiveDeckThemeId;
    }
    if (typeof partnerName === 'string' && partnerName.trim()) {
      user.partner_name = partnerName.trim().slice(0, 32);
    }

    saveDatabase(db);
    res.json({ user: sanitizeUser(user) });
  });

  // 10. Saved Cards CRUD (validated against real deck card IDs)
  app.get('/api/saved-cards', requireAuth, (req: AuthedRequest, res) => {
    const db = loadDatabase();
    const saved = db.saved_cards
      .filter((c) => c.user_id === req.auth?.userId)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    res.json({ savedCards: saved });
  });

  app.post('/api/saved-cards/:cardId', requireAuth, (req: AuthedRequest, res) => {
    const cardId = String(req.params.cardId || '').trim();
    if (!cardId || !VALID_CARD_IDS.has(cardId)) {
      res.status(400).json({ error: 'Invalid card ID.' });
      return;
    }
    const db = loadDatabase();
    const exists = db.saved_cards.some(
      (c) => c.user_id === req.auth?.userId && c.card_id === cardId,
    );
    if (!exists && req.auth?.userId) {
      db.saved_cards.push({
        user_id: req.auth.userId,
        card_id: cardId,
        created_at: new Date().toISOString(),
      });
      saveDatabase(db);
    }
    res.status(201).json({ cardId, saved: true });
  });

  app.delete('/api/saved-cards/:cardId', requireAuth, (req: AuthedRequest, res) => {
    const cardId = String(req.params.cardId || '').trim();
    if (!cardId || !VALID_CARD_IDS.has(cardId)) {
      res.status(400).json({ error: 'Invalid card ID.' });
      return;
    }
    const db = loadDatabase();
    db.saved_cards = db.saved_cards.filter(
      (c) => !(c.user_id === req.auth?.userId && c.card_id === cardId),
    );
    saveDatabase(db);
    res.json({ cardId, saved: false });
  });

  // 11. Live Telemetry Heartbeat & Stats
  app.post('/api/telemetry/heartbeat', requireAuth, (req: AuthedRequest, res) => {
    const db = loadDatabase();
    const nowIso = new Date().toISOString();
    const user = db.users.find((u) => u.id === req.auth?.userId);
    const session = db.sessions.find((s) => s.id === req.auth?.sessionId);
    if (user) {
      user.last_seen_at = nowIso;
    }
    if (session && !session.revoked) {
      session.last_active_at = nowIso;
    }
    saveDatabase(db);
    res.json({ ok: true, lastSeenAt: nowIso });
  });

  app.get('/api/telemetry/stats', requireAuth, (_req, res) => {
    const db = loadDatabase();
    const now = Date.now();
    const twoMinutesAgo = now - 2 * 60 * 1000;
    const thirtyDaysAgo = now - THIRTY_DAYS_MS;

    const currentlyOnline = db.users.filter(
      (u) => u.is_verified && Date.parse(u.last_seen_at) >= twoMinutesAgo,
    ).length;

    const activeUserIds = new Set(
      db.sessions
        .filter((s) => !s.revoked && Date.parse(s.last_active_at) >= thirtyDaysAgo)
        .map((s) => s.user_id),
    );

    res.json({
      currentlyOnline,
      totalActiveUsers: activeUserIds.size,
      windowMinutes: 2,
      inactivityLimitDays: 30,
    });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Couply server listening on http://localhost:${PORT}`);
  });
}

createApp().catch((err) => {
  console.error('Failed to start Couply server:', err);
  process.exit(1);
});
