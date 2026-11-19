import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ActiveDeckThemeId, GenderTheme } from '../constants/theme';
import { hashSecret } from './security';

export interface DbUser {
  id: string;
  full_name: string;
  username: string;
  email: string;
  country: string;
  date_of_birth: string;
  partner_name: string;
  password_hash: string | null;
  google_sub: string | null;
  gender_theme: GenderTheme;
  active_deck_theme: ActiveDeckThemeId;
  is_verified: boolean;
  last_seen_at: string;
  created_at: string;
}

export interface DbOtpCode {
  id: string;
  email: string;
  code_hash: string;
  purpose: 'signup' | 'login';
  attempts: number;
  expires_at: string;
  used: boolean;
  created_at: string;
}

export interface DbSession {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  last_active_at: string;
  expires_at: string;
  revoked: boolean;
}

export interface DbSavedCard {
  user_id: string;
  card_id: string;
  created_at: string;
}

export interface DbUsedConfirmJti {
  jti: string;
  expires_at: string;
}

export interface DbRotatedRefreshHash {
  token_hash: string;
  user_id: string;
  expires_at: string;
}

export interface CouplyDatabase {
  users: DbUser[];
  otp_codes: DbOtpCode[];
  sessions: DbSession[];
  saved_cards: DbSavedCard[];
  used_confirm_jtis: DbUsedConfirmJti[];
  rotated_refresh_hashes: DbRotatedRefreshHash[];
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_PATH = path.join(DATA_DIR, 'couply-db.json');

function createSeedDatabase(): CouplyDatabase {
  const now = new Date().toISOString();
  const demoUserId = '11111111-1111-4111-8111-111111111111';
  const partnerUserId = '22222222-2222-4222-8222-222222222222';
  const sessionExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  return {
    users: [
      {
        id: demoUserId,
        full_name: 'Maya Lin',
        username: 'maya_lin',
        email: 'maya@couply.app',
        country: 'United States',
        date_of_birth: '1999-05-14',
        partner_name: 'Julian',
        password_hash: hashSecret('CouplyDemo2026!'),
        google_sub: null,
        gender_theme: 'female',
        active_deck_theme: 'default',
        is_verified: true,
        last_seen_at: now,
        created_at: now,
      },
      {
        id: partnerUserId,
        full_name: 'Julian Vance',
        username: 'julian_v',
        email: 'julian@couply.app',
        country: 'United States',
        date_of_birth: '1998-09-22',
        partner_name: 'Maya',
        password_hash: hashSecret('CouplyDemo2026!'),
        google_sub: null,
        gender_theme: 'male',
        active_deck_theme: 'default',
        is_verified: true,
        last_seen_at: now,
        created_at: now,
      },
    ],
    otp_codes: [],
    sessions: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        user_id: partnerUserId,
        refresh_token_hash: crypto.createHash('sha256').update('seed-partner-session').digest('hex'),
        last_active_at: now,
        expires_at: sessionExpires,
        revoked: false,
      },
    ],
    saved_cards: [
      {
        user_id: demoUserId,
        card_id: 'dc-01',
        created_at: now,
      },
      {
        user_id: demoUserId,
        card_id: 'wnrs-12',
        created_at: now,
      },
    ],
    used_confirm_jtis: [],
    rotated_refresh_hashes: [],
  };
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

function writeDbAtomic(db: CouplyDatabase): void {
  ensureDataDir();
  const tempPath = path.join(DATA_DIR, `.couply-db.${process.pid}.${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(tempPath, JSON.stringify(db, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tempPath, DB_PATH);
}

export function loadDatabase(): CouplyDatabase {
  try {
    ensureDataDir();
    if (!fs.existsSync(DB_PATH)) {
      const seed = createSeedDatabase();
      writeDbAtomic(seed);
      return seed;
    }
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CouplyDatabase>;
    return {
      users: parsed.users || [],
      otp_codes: parsed.otp_codes || [],
      sessions: parsed.sessions || [],
      saved_cards: parsed.saved_cards || [],
      used_confirm_jtis: parsed.used_confirm_jtis || [],
      rotated_refresh_hashes: parsed.rotated_refresh_hashes || [],
    };
  } catch {
    return createSeedDatabase();
  }
}

export function saveDatabase(db: CouplyDatabase): void {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;

  // Prune expired single-use OTPs, used confirmation JTIs, and expired rotated refresh hashes
  db.otp_codes = db.otp_codes.filter((o) => {
    const exp = Date.parse(o.expires_at);
    return !o.used ? exp > now : exp > oneHourAgo;
  });
  db.used_confirm_jtis = (db.used_confirm_jtis || []).filter(
    (entry) => Date.parse(entry.expires_at) > now,
  );
  db.rotated_refresh_hashes = (db.rotated_refresh_hashes || []).filter(
    (entry) => Date.parse(entry.expires_at) > now,
  );

  writeDbAtomic(db);
}
