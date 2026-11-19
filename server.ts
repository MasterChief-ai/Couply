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
  verifyAccessToken,
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
  MAX_OTP_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  THIRTY_DAYS_MS,
  isSessionInactiveExpired,
} from './src/utils/gameLogic';
import type { ActiveDeckThemeId, GenderTheme } from './src/constants/theme';

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

interface AuthedRequest extends Request {
  auth?: {
    userId: string;
    sessionId: string;
    email: string;
  };
}

function sanitizeUser(user: DbUser) {
  return {
    id: user.id,
    fullName: user.full_name,
    username: user.username,
    email: user.email,
    country: user.country,
    partnerName: user.partner_name,
    genderTheme: user.gender_theme,
    activeDeckTheme: user.active_deck_theme,
    isVerified: user.is_verified,
    lastSeenAt: user.last_seen_at,
    createdAt: user.created_at,
  };
}

async function sendOtpEmail(email: string, code: string, purpose: 'signup' | 'login'): Promise<{
  deliveredVia: 'resend' | 'preview';
  devOtpPreview?: string;
}> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.OTP_FROM_EMAIL?.trim() || 'Couply <onboarding@resend.dev>';

  if (resendKey && resendKey.startsWith('re_') && !resendKey.includes('xxxx')) {
    const subject =
      purpose === 'signup' ? 'Verify your Couply account' : 'Your Couply login code';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject,
        html: `<div style="font-family:sans-serif;padding:24px;color:#1A1113;">
          <h2 style="font-style:italic;font-size:28px;margin:0 0 12px;">Couply</h2>
          <p style="font-size:15px;margin:0 0 16px;">Your 6-digit verification code is:</p>
          <div style="font-size:32px;font-weight:700;letter-spacing:6px;margin:0 0 16px;">${code}</div>
          <p style="font-size:13px;color:#666;">Expires in ${OTP_TTL_MINUTES} minutes. Max 3 attempts.</p>
        </div>`,
      }),
    });

    if (response.ok) {
      return { deliveredVia: 'resend' };
    }
  }

  return { deliveredVia: 'preview', devOtpPreview: code };
}

function createOtpForEmail(email: string, purpose: 'signup' | 'login'): {
  code: string;
  cooldownRemaining: number;
} {
  const db = loadDatabase();
  const normalizedEmail = email.trim().toLowerCase();
  const now = Date.now();

  const latestOtp = [...db.otp_codes]
    .filter((o) => o.email === normalizedEmail)
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
  if (!session || session.revoked) {
    res.status(401).json({ error: 'Session has been revoked.' });
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
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'couply-api', timestamp: new Date().toISOString() });
  });

  // 1. Signup (handles unverified signup abandonment by overwriting unverified records)
  app.post('/api/auth/signup', async (req, res) => {
    const {
      fullName,
      username,
      country,
      email,
      password,
      confirmPassword,
      genderTheme,
      partnerName,
      acceptedTerms,
    } = req.body ?? {};

    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      res.status(400).json({ error: 'Full Name is required.' });
      return;
    }
    if (!username || typeof username !== 'string' || !/^[a-zA-Z0-9_]{3,24}$/.test(username.trim())) {
      res.status(400).json({ error: 'Username must be 3–24 letters, numbers, or underscores.' });
      return;
    }
    if (!country || typeof country !== 'string' || !country.trim()) {
      res.status(400).json({ error: 'Country is required.' });
      return;
    }
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      res.status(400).json({ error: 'Valid email is required.' });
      return;
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
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
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const existingVerifiedUsername = db.users.find(
      (u) => u.username.toLowerCase() === normalizedUsername && u.is_verified,
    );
    if (existingVerifiedUsername) {
      res.status(409).json({ error: 'That username is already taken.' });
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
      country: country.trim(),
      partner_name:
        typeof partnerName === 'string' && partnerName.trim() ? partnerName.trim() : 'Partner',
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

    const delivery = await sendOtpEmail(normalizedEmail, otpResult.code, 'signup');
    res.status(201).json({
      message: 'Verification code sent to your email.',
      email: normalizedEmail,
      purpose: 'signup',
      cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      deliveredVia: delivery.deliveredVia,
      ...(delivery.devOtpPreview ? { devOtpPreview: delivery.devOtpPreview } : {}),
    });
  });

  // 2. Login (Email + Password -> triggers 6-digit OTP)
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const db = loadDatabase();
    const user = db.users.find((u) => u.email === normalizedEmail);

    if (!user || !user.password_hash || !verifySecret(password, user.password_hash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const purpose = user.is_verified ? 'login' : 'signup';
    const otpResult = createOtpForEmail(normalizedEmail, purpose);
    if (otpResult.cooldownRemaining > 0) {
      res.status(429).json({
        error: `Please wait ${otpResult.cooldownRemaining}s before requesting another code.`,
        retryAfterSeconds: otpResult.cooldownRemaining,
      });
      return;
    }

    const delivery = await sendOtpEmail(normalizedEmail, otpResult.code, purpose);
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
    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'Email is required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const db = loadDatabase();
    const user = db.users.find((u) => u.email === normalizedEmail);
    if (!user) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }

    const resolvedPurpose: 'signup' | 'login' = purpose === 'signup' ? 'signup' : 'login';
    const otpResult = createOtpForEmail(normalizedEmail, resolvedPurpose);
    if (otpResult.cooldownRemaining > 0) {
      res.status(429).json({
        error: `Wait ${otpResult.cooldownRemaining}s before resending.`,
        retryAfterSeconds: otpResult.cooldownRemaining,
      });
      return;
    }

    const delivery = await sendOtpEmail(normalizedEmail, otpResult.code, resolvedPurpose);
    res.json({
      message: 'A new 6-digit code has been sent.',
      cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      deliveredVia: delivery.deliveredVia,
      ...(delivery.devOtpPreview ? { devOtpPreview: delivery.devOtpPreview } : {}),
    });
  });

  // 4. Verify OTP (max 3 attempts, 10-min expiry)
  app.post('/api/auth/verify-otp', (req, res) => {
    const { email, code } = req.body ?? {};
    if (!email || typeof email !== 'string' || !code || typeof code !== 'string') {
      res.status(400).json({ error: 'Email and 6-digit code are required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const cleanedCode = code.trim();
    if (!/^\d{6}$/.test(cleanedCode)) {
      res.status(400).json({ error: 'Code must be exactly 6 digits.' });
      return;
    }

    const db = loadDatabase();
    const otpRecord = [...db.otp_codes]
      .filter((o) => o.email === normalizedEmail && !o.used)
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

    user.is_verified = true;
    user.last_seen_at = new Date().toISOString();
    saveDatabase(db);

    const sessionBundle = issueSessionForUser(user);
    res.json(sessionBundle);
  });

  // 5. Google Sign-In Verification & Auto-Linking
  app.post('/api/auth/google', async (req, res) => {
    const { idToken, genderTheme } = req.body ?? {};
    const expectedClientId = process.env.GOOGLE_CLIENT_ID?.trim();

    if (!idToken || typeof idToken !== 'string') {
      res.status(400).json({
        error: expectedClientId
          ? 'Google ID token is required.'
          : 'Google Sign-In requires GOOGLE_CLIENT_ID configured in server environment secrets.',
      });
      return;
    }

    try {
      const verifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
      const googleRes = await fetch(verifyUrl);
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
      };

      if (expectedClientId && tokenInfo.aud !== expectedClientId) {
        res.status(401).json({ error: 'Google client audience mismatch.' });
        return;
      }

      if (!tokenInfo.email || tokenInfo.email_verified !== 'true' || !tokenInfo.sub) {
        res.status(401).json({ error: 'Verified Google email is required.' });
        return;
      }

      const normalizedEmail = tokenInfo.email.toLowerCase();
      const db = loadDatabase();
      let user = db.users.find(
        (u) => u.google_sub === tokenInfo.sub || u.email === normalizedEmail,
      );

      if (user) {
        // Seamless auto-linking of google_sub when email already exists
        user.google_sub = tokenInfo.sub;
        user.is_verified = true;
        user.last_seen_at = new Date().toISOString();
        saveDatabase(db);
      } else {
        const chosenGender: GenderTheme = genderTheme === 'male' ? 'male' : 'female';
        const baseHandle = normalizedEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 18);
        const now = new Date().toISOString();
        user = {
          id: crypto.randomUUID(),
          full_name: tokenInfo.name || baseHandle,
          username: `${baseHandle}_${crypto.randomInt(100, 999)}`,
          email: normalizedEmail,
          country: 'United States',
          partner_name: 'Partner',
          password_hash: null,
          google_sub: tokenInfo.sub,
          gender_theme: chosenGender,
          active_deck_theme: 'default',
          is_verified: true,
          last_seen_at: now,
          created_at: now,
        };
        db.users.push(user);
        saveDatabase(db);
      }

      const sessionBundle = issueSessionForUser(user);
      res.json(sessionBundle);
    } catch {
      res.status(502).json({ error: 'Unable to reach Google verification service.' });
    }
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

  // 7. Refresh Token with 30-Day Inactivity Revocation
  app.post('/api/auth/refresh', (req, res) => {
    const { refreshToken } = req.body ?? {};
    if (!refreshToken || typeof refreshToken !== 'string') {
      res.status(400).json({ error: 'Refresh token required.' });
      return;
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const db = loadDatabase();
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
    if (!user) {
      res.status(401).json({ error: 'User not found.' });
      return;
    }

    const nowIso = new Date().toISOString();
    session.last_active_at = nowIso;
    user.last_seen_at = nowIso;
    saveDatabase(db);

    const accessToken = signAccessToken(user.id, session.id, user.email, ACCESS_TOKEN_TTL_SECONDS);
    res.json({
      accessToken,
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

  // 10. Saved Cards CRUD
  app.get('/api/saved-cards', requireAuth, (req: AuthedRequest, res) => {
    const db = loadDatabase();
    const saved = db.saved_cards
      .filter((c) => c.user_id === req.auth?.userId)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    res.json({ savedCards: saved });
  });

  app.post('/api/saved-cards/:cardId', requireAuth, (req: AuthedRequest, res) => {
    const cardId = String(req.params.cardId || '').trim();
    if (!cardId) {
      res.status(400).json({ error: 'Card ID is required.' });
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
