import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatEndOfDeckCopy,
  getLockedSplashColor,
  getResendCooldownRemaining,
  isSessionInactiveExpired,
  isStrongPassword,
  isValidEmail,
  lockOptionForPrivacyHandoff,
  nextCardIndex,
  prevCardIndex,
  THIRTY_DAYS_MS,
  validateSignupForm,
} from './gameLogic';
import { GAME_DECKS } from '../constants/decks';

test('isValidEmail validates proper email format and rejects arbitrary text', () => {
  assert.equal(isValidEmail('maya@couply.app'), true);
  assert.equal(isValidEmail('romeo.montague+1@sub.domain.co.uk'), true);
  assert.equal(isValidEmail('anything'), false);
  assert.equal(isValidEmail('maya@domain'), false);
  assert.equal(isValidEmail('maya@domain.c'), false);
  assert.equal(isValidEmail('maya@.com'), false);
  assert.equal(isValidEmail('.maya@couply.app'), false);
  assert.equal(isValidEmail('maya..lin@couply.app'), false);
});

test('isStrongPassword requires 8+ chars, uppercase, lowercase, number, and special character', () => {
  assert.equal(isStrongPassword('Verona1597!'), true);
  assert.equal(isStrongPassword('CouplyDemo2026!'), true);
  assert.equal(isStrongPassword('verona1597!'), false); // missing uppercase
  assert.equal(isStrongPassword('VERONA1597!'), false); // missing lowercase
  assert.equal(isStrongPassword('VeronaPass!'), false); // missing number
  assert.equal(isStrongPassword('Verona1597'), false); // missing special character
  assert.equal(isStrongPassword('Ve1!'), false); // under 8 chars
});

test('validateSignupForm enforces required fields (with optional country & DOB), strong password, email format, and T&C checkbox', () => {
  const invalid = validateSignupForm({
    fullName: '',
    username: 'a',
    country: '',
    partnerName: '',
    dateOfBirth: '2024-01-01',
    email: 'not-an-email',
    password: 'weakpassword',
    confirmPassword: '456',
    genderTheme: null,
    acceptedTerms: false,
  });

  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.fullName);
  assert.ok(invalid.errors.username);
  assert.ok(invalid.errors.partnerName);
  assert.equal(invalid.errors.country, undefined);
  assert.ok(invalid.errors.dateOfBirth);
  assert.ok(invalid.errors.email);
  assert.ok(invalid.errors.password);
  assert.ok(invalid.errors.confirmPassword);
  assert.ok(invalid.errors.genderTheme);
  assert.ok(invalid.errors.acceptedTerms);

  const validWithOptionalEmpty = validateSignupForm({
    fullName: 'Maya Lin',
    username: 'maya_lin',
    country: '',
    partnerName: 'Julian',
    dateOfBirth: '',
    email: 'maya@example.com',
    password: 'StrongPassword9!',
    confirmPassword: 'StrongPassword9!',
    genderTheme: 'female',
    acceptedTerms: true,
  });

  assert.equal(validWithOptionalEmpty.valid, true);
  assert.deepEqual(validWithOptionalEmpty.errors, {});
});

test('getLockedSplashColor returns exact locked hex for female and male', () => {
  assert.equal(getLockedSplashColor('female'), '#F4C2C2');
  assert.equal(getLockedSplashColor('male'), '#B8D0E8');
});

test('30-day inactivity check revokes sessions older than 30 days', () => {
  const now = Date.UTC(2026, 10, 18, 12, 0, 0);
  const withinLimit = new Date(now - THIRTY_DAYS_MS + 60_000).toISOString();
  const expired = new Date(now - THIRTY_DAYS_MS - 1_000).toISOString();

  assert.equal(isSessionInactiveExpired(withinLimit, now), false);
  assert.equal(isSessionInactiveExpired(expired, now), true);
});

test('OTP resend cooldown strictly enforces 60 seconds', () => {
  const sentAt = 1_000_000;
  assert.equal(getResendCooldownRemaining(sentAt, sentAt + 10_000), 50);
  assert.equal(getResendCooldownRemaining(sentAt, sentAt + 60_000), 0);
  assert.equal(getResendCooldownRemaining(null, sentAt), 0);
});

test('Pass-and-play card progression, option lock, and end-of-deck copy', () => {
  const deepDeck = GAME_DECKS[0];
  assert.equal(deepDeck.cards.length, 30);

  const multiCard = deepDeck.cards[0];
  const locked = lockOptionForPrivacyHandoff(multiCard, 2);
  assert.equal(locked.needsPrivacyHandoff, true);
  assert.equal(locked.lockedOptionIndex, 2);
  assert.equal(locked.lockedOptionText, multiCard.options?.[2]);

  assert.deepEqual(nextCardIndex(0, 30), { nextIndex: 1, completed: false });
  assert.deepEqual(nextCardIndex(29, 30), { nextIndex: 29, completed: true });
  assert.equal(prevCardIndex(0), 0);
  assert.equal(prevCardIndex(3), 2);
  assert.equal(
    formatEndOfDeckCopy(deepDeck.title, deepDeck.cards.length),
    'You finished all 30 cards in Deep Conversations. Play again or pick another deck.',
  );
});
