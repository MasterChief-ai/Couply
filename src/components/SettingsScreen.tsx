import React, { useEffect, useState } from 'react';
import { findCardById, type GameDeck } from '../constants/decks';
import {
  IN_APP_THEMES,
  LOCKED_SPLASH_TOKENS,
  resolveTheme,
  type ActiveDeckThemeId,
} from '../constants/theme';
import { couplyApi, type TelemetryStats } from '../services/api';
import type { CouplyUser } from '../services/storage';
import { BackArrowIcon, CheckIcon, HeartIcon, RefreshIcon } from './Icons';

interface SettingsScreenProps {
  user: CouplyUser;
  savedCardIds: string[];
  onUserUpdated: (user: CouplyUser) => void;
  onToggleSave: (cardId: string) => void;
  onOpenSavedCard: (deck: GameDeck, cardIndex: number) => void;
  onBack: () => void;
  onLogout: () => void;
}

export function SettingsScreen({
  user,
  savedCardIds,
  onUserUpdated,
  onToggleSave,
  onOpenSavedCard,
  onBack,
  onLogout,
}: SettingsScreenProps) {
  const theme = resolveTheme(user.activeDeckTheme);
  const lockedSplash = LOCKED_SPLASH_TOKENS[user.genderTheme];
  const [partnerDraft, setPartnerDraft] = useState(user.partnerName || 'Partner');
  const [savingPartner, setSavingPartner] = useState(false);
  const [stats, setStats] = useState<TelemetryStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  async function fetchStats() {
    setLoadingStats(true);
    try {
      const next = await couplyApi.getTelemetryStats();
      setStats(next);
    } catch {
      // Keep last known stats if offline
    } finally {
      setLoadingStats(false);
    }
  }

  useEffect(() => {
    void fetchStats();
  }, []);

  async function handleSelectTheme(themeId: ActiveDeckThemeId) {
    try {
      const updated = await couplyApi.updatePreferences({ activeDeckTheme: themeId });
      onUserUpdated(updated);
    } catch {
      onUserUpdated({ ...user, activeDeckTheme: themeId });
    }
  }

  async function handleSavePartner(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = partnerDraft.trim();
    if (!cleaned) return;
    setSavingPartner(true);
    try {
      const updated = await couplyApi.updatePreferences({ partnerName: cleaned });
      onUserUpdated(updated);
    } catch {
      onUserUpdated({ ...user, partnerName: cleaned });
    } finally {
      setSavingPartner(false);
    }
  }

  const themeChoices = Object.values(IN_APP_THEMES);

  return (
    <div
      data-testid="settings-screen"
      style={{ backgroundColor: theme.canvas, color: theme.primaryInk }}
      className="min-h-screen w-full transition-colors duration-200"
    >
      <div className="w-full max-w-4xl mx-auto px-6 py-6 md:py-10 space-y-10">
        {/* Top Bar */}
        <header className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 min-h-[44px] text-[15px] font-medium"
          >
            <BackArrowIcon className="w-5 h-5" />
            <span>Decks</span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            style={{ backgroundColor: theme.surface, color: theme.primaryInk }}
            className="min-h-[44px] px-5 rounded-full text-[14px] font-medium active:scale-95 transition-transform"
          >
            Log Out
          </button>
        </header>

        {/* Profile & Locked Boot Splash */}
        <section className="space-y-4">
          <h1 className="font-display text-[32px] font-extrabold tracking-[-0.03em]">
            Settings &amp; Saved Cards
          </h1>
          <p className="text-[14px]" style={{ color: theme.secondaryInk }}>
            Signed in as {user.fullName} (@{user.username}) · {user.email}
          </p>

          <div
            className="pt-4 pb-6 flex flex-wrap items-center justify-between gap-4"
            style={{ borderBottom: `1px solid ${theme.hairline}` }}
          >
            <div>
              <p className="font-display font-bold text-[16px]">Locked Boot Splash Color</p>
              <p className="text-[13px] mt-0.5" style={{ color: theme.secondaryInk }}>
                Permanently locked to your onboarding selection ({lockedSplash.label})
              </p>
            </div>
            <div
              data-testid="locked-splash-preview"
              style={{
                backgroundColor: lockedSplash.canvas,
                color: lockedSplash.primaryInk,
              }}
              className="px-5 py-2.5 rounded-full font-wordmark text-[22px] leading-none"
            >
              couply
            </div>
          </div>
        </section>

        {/* Partner Name */}
        <section
          className="pb-8 space-y-3"
          style={{ borderBottom: `1px solid ${theme.hairline}` }}
        >
          <h2 className="font-display text-[20px] font-bold tracking-tight">
            Pass-and-Play Partner Name
          </h2>
          <form onSubmit={handleSavePartner} className="flex flex-col sm:flex-row gap-3 max-w-md">
            <input
              type="text"
              aria-label="Partner name"
              value={partnerDraft}
              onChange={(e) => setPartnerDraft(e.target.value)}
              placeholder="Partner"
              style={{ backgroundColor: theme.surface, color: theme.primaryInk }}
              className="flex-1 min-h-[48px] rounded-[16px] px-4 text-[15px] focus:outline-2"
            />
            <button
              type="submit"
              disabled={savingPartner}
              style={{ backgroundColor: theme.primaryInk, color: theme.canvas }}
              className="min-h-[48px] px-6 rounded-full font-display font-bold text-[14px] active:scale-95 transition-transform"
            >
              {savingPartner ? 'Saving...' : 'Save Name'}
            </button>
          </form>
        </section>

        {/* Active Dashboard Theme Switcher */}
        <section
          className="pb-8 space-y-4"
          style={{ borderBottom: `1px solid ${theme.hairline}` }}
        >
          <div>
            <h2 className="font-display text-[20px] font-bold tracking-tight">
              Dashboard Theme
            </h2>
            <p className="text-[13px] mt-0.5" style={{ color: theme.secondaryInk }}>
              Changes your home &amp; settings palette without altering the locked boot splash.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {themeChoices.map((choice) => {
              const active = user.activeDeckTheme === choice.id;
              const matchesCanvas = choice.canvas === theme.canvas;
              return (
                <button
                  key={choice.id}
                  type="button"
                  data-testid={`theme-option-${choice.id}`}
                  aria-pressed={active}
                  onClick={() => handleSelectTheme(choice.id)}
                  style={{
                    backgroundColor: matchesCanvas ? choice.surface : choice.canvas,
                    color: choice.primaryInk,
                    outline: active ? `2px solid ${choice.primaryInk}` : 'none',
                    outlineOffset: '-2px',
                  }}
                  className="min-h-[56px] rounded-[20px] px-4 flex items-center justify-between font-display font-bold text-[14px] active:scale-[0.98] transition-transform"
                >
                  <span>{choice.label}</span>
                  {active && <CheckIcon className="w-4 h-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        </section>

        {/* Saved Cards */}
        <section
          className="pb-8 space-y-4"
          style={{ borderBottom: `1px solid ${theme.hairline}` }}
        >
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-[20px] font-bold tracking-tight">
              Saved Questions
            </h2>
            <span className="text-[13px] tabular-nums" style={{ color: theme.secondaryInk }}>
              {savedCardIds.length} saved
            </span>
          </div>

          {savedCardIds.length === 0 ? (
            <p
              data-testid="empty-saved-state"
              className="text-[15px] py-4"
              style={{ color: theme.secondaryInk }}
            >
              No saved questions yet. Tap the heart on any card during a game to keep it here.
            </p>
          ) : (
            <div className="divide-y" style={{ borderColor: theme.hairline }}>
              {savedCardIds.map((cardId) => {
                const match = findCardById(cardId);
                if (!match) return null;
                return (
                  <div
                    key={cardId}
                    className="py-4 flex items-center justify-between gap-4"
                    style={{ borderColor: theme.hairline }}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenSavedCard(match.deck, match.index)}
                      className="text-left flex-1 min-h-[44px] py-1"
                    >
                      <p className="text-[12px] font-medium" style={{ color: theme.secondaryInk }}>
                        {match.deck.indexNumber} · {match.deck.title}
                      </p>
                      <p className="font-display font-bold text-[17px] mt-0.5 leading-snug">
                        {match.card.prompt}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => onToggleSave(cardId)}
                      aria-label={`Remove saved question: ${match.card.prompt}`}
                      className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
                    >
                      <HeartIcon className="w-5 h-5" filled />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Live App Telemetry */}
        <section className="space-y-4 pb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-[20px] font-bold tracking-tight">
                Live App Telemetry
              </h2>
              <p className="text-[13px] mt-0.5" style={{ color: theme.secondaryInk }}>
                Updated via 60s foreground heartbeat and 30-day session activity window.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchStats}
              aria-label="Refresh telemetry"
              style={{ backgroundColor: theme.surface, color: theme.primaryInk }}
              className="w-11 h-11 rounded-full flex items-center justify-center active:scale-95 transition-transform"
            >
              <RefreshIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 max-w-md">
            <div style={{ backgroundColor: theme.surface }} className="rounded-[22px] p-5">
              <p className="text-[13px]" style={{ color: theme.secondaryInk }}>
                Currently Online
              </p>
              <p
                data-testid="telemetry-online"
                className="font-display text-[32px] font-extrabold tabular-nums mt-1"
              >
                {loadingStats && !stats ? '—' : stats?.currentlyOnline ?? 0}
              </p>
            </div>

            <div style={{ backgroundColor: theme.surface }} className="rounded-[22px] p-5">
              <p className="text-[13px]" style={{ color: theme.secondaryInk }}>
                Total Active Users
              </p>
              <p
                data-testid="telemetry-active"
                className="font-display text-[32px] font-extrabold tabular-nums mt-1"
              >
                {loadingStats && !stats ? '—' : stats?.totalActiveUsers ?? 0}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
