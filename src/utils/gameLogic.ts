import type { GenderTheme } from '../constants/theme';
import { LOCKED_SPLASH_TOKENS } from '../constants/theme';
import type { StoryCard } from '../constants/decks';

export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const MAX_OTP_ATTEMPTS = 3;

export interface SignupFormValues {
  fullName: string;
  username: string;
  country: string;
  dateOfBirth: string;
  email: string;
  password: string;
  confirmPassword: string;
  genderTheme: GenderTheme | null;
  partnerName?: string;
  acceptedTerms: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function isValidDateOfBirth(dob: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob.trim())) {
    return false;
  }
  const parsed = new Date(`${dob.trim()}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  const now = new Date();
  const minAgeDate = new Date(Date.UTC(now.getUTCFullYear() - 13, now.getUTCMonth(), now.getUTCDate()));
  const oldestDate = new Date(Date.UTC(1900, 0, 1));
  return parsed <= minAgeDate && parsed >= oldestDate;
}

export const EMAIL_REGEX = /^[^\s@]+@(?:[^\s@.]+\.)+[a-zA-Z]{2,}$/;

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed || trimmed.length > 254 || trimmed.includes('..')) {
    return false;
  }
  const [localPart] = trimmed.split('@');
  if (!localPart || localPart.startsWith('.') || localPart.endsWith('.')) {
    return false;
  }
  return EMAIL_REGEX.test(trimmed);
}

export function getPasswordErrorMessage(password: string): string | null {
  const missing: string[] = [];
  if (!password || password.length < 8) {
    missing.push('8+ characters');
  }
  if (!/[A-Z]/.test(password)) {
    missing.push('1 uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    missing.push('1 lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    missing.push('1 number');
  }
  if (!/[^A-Za-z0-9\s]/.test(password)) {
    missing.push('1 special character');
  }
  if (missing.length === 0) {
    return null;
  }
  return `Password needs ${missing.join(', ')}.`;
}

export function isStrongPassword(password: string): boolean {
  return getPasswordErrorMessage(password) === null;
}

export function validateSignupForm(values: SignupFormValues): ValidationResult {
  const errors: Record<string, string> = {};

  if (!values.fullName.trim() || values.fullName.trim().length < 2) {
    errors.fullName = 'Please enter your full name.';
  }
  if (!values.username.trim() || !/^[a-zA-Z0-9_]{3,24}$/.test(values.username.trim())) {
    errors.username = 'Username must be 3–24 letters, numbers, or underscores.';
  }
  if (!values.partnerName || !values.partnerName.trim()) {
    errors.partnerName = "Please enter your partner's name.";
  }
  if (values.dateOfBirth.trim() && !isValidDateOfBirth(values.dateOfBirth)) {
    errors.dateOfBirth = 'Please enter a valid date of birth (13+).';
  }
  if (!isValidEmail(values.email)) {
    errors.email = 'Please enter a valid email address.';
  }
  const passwordError = getPasswordErrorMessage(values.password);
  if (passwordError) {
    errors.password = passwordError;
  }
  if (values.password !== values.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }
  if (values.genderTheme !== 'female' && values.genderTheme !== 'male') {
    errors.genderTheme = 'Select Her or Him to lock your splash color.';
  }
  if (!values.acceptedTerms) {
    errors.acceptedTerms = 'You must agree to the Terms & Conditions.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function getLockedSplashColor(genderTheme: GenderTheme): string {
  // Always resolves strictly from the user's locked onboarding gender selection,
  // independent of any active dashboard/card theme changed in Settings.
  return LOCKED_SPLASH_TOKENS[genderTheme].canvas;
}

export function isSessionInactiveExpired(
  lastActiveAtIso: string,
  nowMs: number = Date.now(),
): boolean {
  const lastActiveMs = Date.parse(lastActiveAtIso);
  if (Number.isNaN(lastActiveMs)) {
    return true;
  }
  return nowMs - lastActiveMs > THIRTY_DAYS_MS;
}

export function getResendCooldownRemaining(
  lastSentAtMs: number | null,
  nowMs: number = Date.now(),
): number {
  if (!lastSentAtMs) {
    return 0;
  }
  const elapsedSeconds = Math.floor((nowMs - lastSentAtMs) / 1000);
  const remaining = OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds;
  return remaining > 0 ? remaining : 0;
}

export interface GameplaySelectionResult {
  lockedOptionIndex: number;
  lockedOptionText: string;
  needsPrivacyHandoff: boolean;
}

export function lockOptionForPrivacyHandoff(
  card: StoryCard,
  optionIndex: number,
): GameplaySelectionResult {
  if (!card.options || optionIndex < 0 || optionIndex >= card.options.length) {
    throw new Error('Invalid option index for card');
  }
  return {
    lockedOptionIndex: optionIndex,
    lockedOptionText: card.options[optionIndex],
    needsPrivacyHandoff: true,
  };
}

export function nextCardIndex(currentIndex: number, totalCards: number): {
  nextIndex: number;
  completed: boolean;
} {
  if (totalCards <= 0) {
    return { nextIndex: 0, completed: true };
  }
  if (currentIndex + 1 >= totalCards) {
    return { nextIndex: currentIndex, completed: true };
  }
  return { nextIndex: currentIndex + 1, completed: false };
}

export function prevCardIndex(currentIndex: number): number {
  return currentIndex > 0 ? currentIndex - 1 : 0;
}

export function formatEndOfDeckCopy(deckTitle: string, totalCards: number): string {
  return `You finished all ${totalCards} cards in ${deckTitle}. Play again or pick another deck.`;
}
