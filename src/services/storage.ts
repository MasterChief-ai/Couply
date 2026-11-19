import type { ActiveDeckThemeId, GenderTheme } from '../constants/theme';

export interface CouplyUser {
  id: string;
  fullName: string;
  username: string;
  email: string;
  country: string;
  partnerName: string;
  genderTheme: GenderTheme;
  activeDeckTheme: ActiveDeckThemeId;
  isVerified: boolean;
  lastSeenAt: string;
  createdAt: string;
}

const KEYS = {
  ACCESS_TOKEN: 'couply_access_token',
  REFRESH_TOKEN: 'couply_refresh_token',
  USER: 'couply_user',
  LOCKED_SPLASH: 'couply_locked_splash_gender',
  SAVED_CARDS_CACHE: 'couply_saved_cards_cache',
} as const;

export function getStoredAccessToken(): string | null {
  return localStorage.getItem(KEYS.ACCESS_TOKEN);
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem(KEYS.REFRESH_TOKEN);
}

export function getStoredUser(): CouplyUser | null {
  const raw = localStorage.getItem(KEYS.USER);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CouplyUser;
  } catch {
    return null;
  }
}

export function getLockedSplashGender(): GenderTheme {
  const stored = localStorage.getItem(KEYS.LOCKED_SPLASH);
  if (stored === 'male' || stored === 'female') {
    return stored;
  }
  const user = getStoredUser();
  if (user?.genderTheme === 'male' || user?.genderTheme === 'female') {
    return user.genderTheme;
  }
  return 'female';
}

export function saveAuthSession(params: {
  accessToken: string;
  refreshToken?: string;
  user: CouplyUser;
}): void {
  localStorage.setItem(KEYS.ACCESS_TOKEN, params.accessToken);
  if (params.refreshToken) {
    localStorage.setItem(KEYS.REFRESH_TOKEN, params.refreshToken);
  }
  localStorage.setItem(KEYS.USER, JSON.stringify(params.user));
  localStorage.setItem(KEYS.LOCKED_SPLASH, params.user.genderTheme);
}

export function updateStoredUser(user: CouplyUser): void {
  localStorage.setItem(KEYS.USER, JSON.stringify(user));
  localStorage.setItem(KEYS.LOCKED_SPLASH, user.genderTheme);
}

export function clearAuthSession(): void {
  localStorage.removeItem(KEYS.ACCESS_TOKEN);
  localStorage.removeItem(KEYS.REFRESH_TOKEN);
  localStorage.removeItem(KEYS.USER);
  // Note: LOCKED_SPLASH remains preserved on device for the locked gender boot splash aesthetic
}

export function getCachedSavedCardIds(): string[] {
  const raw = localStorage.getItem(KEYS.SAVED_CARDS_CACHE);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setCachedSavedCardIds(ids: string[]): void {
  localStorage.setItem(KEYS.SAVED_CARDS_CACHE, JSON.stringify(ids));
}
