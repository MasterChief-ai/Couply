import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatEndOfDeckCopy,
  getLockedSplashColor,
  getResendCooldownRemaining,
  isSessionInactiveExpired,
  lockOptionForPrivacyHandoff,
  nextCardIndex,
  prevCardIndex,
  THIRTY_DAYS_MS,
  validateSignupForm,
} from './gameLogic';
import { GAME_DECKS } from '../constants/decks';

test('validateSignupForm enforces all required fields and T&C checkbox', () => {
  const invalid = validateSignupForm({
    fullName: '',
    username: 'a',
    country: '',
    email: 'not-an-email',
    password: '123',
    confirmPassword: '456',
    genderTheme: null,
    acceptedTerms: false,
  });

  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.fullName);
  assert.ok(invalid.errors.username);
  assert.ok(invalid.errors.country);
  assert.ok(invalid.errors.email);
  assert.ok(invalid.errors.password);
  assert.ok(invalid.errors.confirmPassword);
  assert.ok(invalid.errors.genderTheme);
  assert.ok(invalid.errors.acceptedTerms);

  const valid = validateSignupForm({
    fullName: 'Maya Lin',
    username: 'maya_lin',
    country: 'Canada',
    email: 'maya@example.com',
    password: 'StrongPassword9!',
    confirmPassword: 'StrongPassword9!',
    genderTheme: 'female',
    acceptedTerms: true,
  });

  assert.equal(valid.valid, true);
  assert.deepEqual(valid.errors, {});
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
