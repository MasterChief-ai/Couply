import React, { useCallback, useEffect, useState } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { HomeScreen } from './components/HomeScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { SplashScreen } from './components/SplashScreen';
import { StoryDeckScreen } from './components/StoryDeckScreen';
import type { GameDeck } from './constants/decks';
import {
  couplyApi,
  subscribeColdStart,
  subscribeSessionExpired,
} from './services/api';
import {
  clearAuthSession,
  getCachedSavedCardIds,
  getLockedSplashGender,
  getStoredAccessToken,
  getStoredUser,
  setCachedSavedCardIds,
  type CouplyUser,
} from './services/storage';

type AppRoute = 'splash' | 'auth' | 'home' | 'deck' | 'settings';

export default function App() {
  const isAutostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [route, setRoute] = useState<AppRoute>(isAutostart ? 'home' : 'splash');
  const [user, setUser] = useState<CouplyUser | null>(() => getStoredUser());
  const [lockedSplashGender, setLockedSplashGender] = useState(() =>
    getLockedSplashGender(),
  );
  const [activeDeck, setActiveDeck] = useState<{
    deck: GameDeck;
    initialIndex: number;
  } | null>(null);
  const [savedCardIds, setSavedCardIds] = useState<string[]>(() =>
    getCachedSavedCardIds(),
  );
  const [isColdStarting, setIsColdStarting] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const syncSavedCards = useCallback(async () => {
    try {
      const res = await couplyApi.getSavedCards();
      const ids = res.savedCards.map((c) => c.card_id);
      setSavedCardIds(ids);
      setCachedSavedCardIds(ids);
    } catch {
      // Offline-first: retain local saved card cache if backend is asleep
    }
  }, []);

  // Subscribe to >3s Render cold-start notice & 30-day session expiry
  useEffect(() => {
    const unsubCold = subscribeColdStart(setIsColdStarting);
    const unsubExpired = subscribeSessionExpired((reason) => {
      setUser(null);
      setAuthNotice(reason);
      setRoute('auth');
    });
    return () => {
      unsubCold();
      unsubExpired();
    };
  }, []);

  // Handle ?confirm=... email link, ?autostart=1, or verify existing session on mount
  useEffect(() => {
    let active = true;

    async function bootstrap() {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const confirmToken = params.get('confirm');
        if (confirmToken) {
          // Immediately scrub the token from URL / browser history to prevent referrer leaks
          params.delete('confirm');
          const cleanSearch = params.toString();
          const cleanUrl = `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}`;
          window.history.replaceState({}, '', cleanUrl);

          try {
            const session = await couplyApi.confirmEmailLink({ token: confirmToken });
            if (!active) return;
            setUser(session.user);
            setLockedSplashGender(session.user.genderTheme);
            setAuthNotice(null);
            setRoute('home');
            void syncSavedCards();
            return;
          } catch (err) {
            if (!active) return;
            setAuthNotice(
              err instanceof Error
                ? err.message
                : 'Confirmation link expired or already used. Please request a new code.',
            );
            setRoute('auth');
            return;
          }
        }
      }

      if (isAutostart && !getStoredAccessToken()) {
        try {
          const demo = await couplyApi.demoSignIn();
          if (!active) return;
          setUser(demo.user);
          setLockedSplashGender(demo.user.genderTheme);
          setRoute('home');
          void syncSavedCards();
          return;
        } catch {
          if (!active) return;
        }
      }

      if (getStoredAccessToken()) {
        try {
          const freshUser = await couplyApi.getMe();
          if (!active) return;
          setUser(freshUser);
          setLockedSplashGender(freshUser.genderTheme);
          void syncSavedCards();
        } catch {
          if (!active) return;
          if (!getStoredUser()) {
            clearAuthSession();
            setUser(null);
          }
        }
      }
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, [isAutostart, syncSavedCards]);

  // Foreground + 60-second heartbeat telemetry when authenticated
  useEffect(() => {
    if (!user) return;

    const sendPulse = () => {
      if (document.visibilityState === 'visible') {
        void couplyApi.sendHeartbeat().catch(() => {});
      }
    };

    sendPulse();
    const interval = window.setInterval(sendPulse, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        sendPulse();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user]);

  const handleSplashComplete = useCallback(() => {
    setRoute((current) => {
      if (current !== 'splash') return current;
      return user && getStoredAccessToken() ? 'home' : 'auth';
    });
  }, [user]);

  function handleAuthenticated(authedUser: CouplyUser) {
    setUser(authedUser);
    setLockedSplashGender(authedUser.genderTheme);
    setAuthNotice(null);
    setRoute('home');
    void syncSavedCards();
  }

  async function handleToggleSave(cardId: string) {
    const alreadySaved = savedCardIds.includes(cardId);
    const nextIds = alreadySaved
      ? savedCardIds.filter((id) => id !== cardId)
      : [cardId, ...savedCardIds];

    // Optimistic offline-first update
    setSavedCardIds(nextIds);
    setCachedSavedCardIds(nextIds);

    try {
      if (alreadySaved) {
        await couplyApi.unsaveCard(cardId);
      } else {
        await couplyApi.saveCard(cardId);
      }
    } catch {
      // Keep local cache intact during server sleep
    }
  }

  async function handleLogout() {
    try {
      await couplyApi.logout();
    } catch {
      clearAuthSession();
    }
    setUser(null);
    setActiveDeck(null);
    setRoute('auth');
  }

  return (
    <>
      {isColdStarting && (
        <div
          role="status"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full bg-[#1A1113] text-[#FAF8F5] text-[13px] font-medium"
        >
          Waking up Couply servers, hang tight...
        </div>
      )}

      {route === 'splash' && (
        <SplashScreen
          lockedGender={lockedSplashGender}
          onComplete={handleSplashComplete}
        />
      )}

      {route === 'auth' && (
        <AuthScreen
          initialNotice={authNotice}
          onAuthenticated={handleAuthenticated}
        />
      )}

      {route === 'home' && user && (
        <HomeScreen
          user={user}
          savedCount={savedCardIds.length}
          onSelectDeck={(deck) => {
            setActiveDeck({ deck, initialIndex: 0 });
            setRoute('deck');
          }}
          onOpenSettings={() => setRoute('settings')}
        />
      )}

      {route === 'deck' && activeDeck && user && (
        <StoryDeckScreen
          deck={activeDeck.deck}
          partnerName={user.partnerName}
          initialCardIndex={activeDeck.initialIndex}
          savedCardIds={savedCardIds}
          onToggleSave={handleToggleSave}
          onClose={() => {
            setActiveDeck(null);
            setRoute('home');
          }}
        />
      )}

      {route === 'settings' && user && (
        <SettingsScreen
          user={user}
          savedCardIds={savedCardIds}
          onUserUpdated={setUser}
          onToggleSave={handleToggleSave}
          onOpenSavedCard={(deck, cardIndex) => {
            setActiveDeck({ deck, initialIndex: cardIndex });
            setRoute('deck');
          }}
          onBack={() => setRoute('home')}
          onLogout={handleLogout}
        />
      )}
    </>
  );
}
