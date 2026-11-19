import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { GameDeck } from '../constants/decks';
import {
  formatEndOfDeckCopy,
  lockOptionForPrivacyHandoff,
  nextCardIndex,
  prevCardIndex,
} from '../utils/gameLogic';
import { BackArrowIcon, CloseIcon, HeartIcon, NextArrowIcon, TimerIcon } from './Icons';

interface StoryDeckScreenProps {
  deck: GameDeck;
  partnerName: string;
  initialCardIndex?: number;
  savedCardIds: string[];
  onToggleSave: (cardId: string) => void;
  onClose: () => void;
}

type HandoffPhase = 'answering' | 'handoff' | 'revealed';

export function StoryDeckScreen({
  deck,
  partnerName,
  initialCardIndex = 0,
  savedCardIds,
  onToggleSave,
  onClose,
}: StoryDeckScreenProps) {
  const [cardIndex, setCardIndex] = useState(
    Math.min(Math.max(initialCardIndex, 0), Math.max(deck.cards.length - 1, 0)),
  );
  const [isCompleted, setIsCompleted] = useState(false);
  const [handoffPhase, setHandoffPhase] = useState<HandoffPhase>('answering');
  const [lockedOptionText, setLockedOptionText] = useState<string | null>(null);
  const [lockedOptionIdx, setLockedOptionIdx] = useState<number | null>(null);

  // Hot Seat countdown timer (for Deck 04)
  const [timerEnabled, setTimerEnabled] = useState(Boolean(deck.hasHotSeatTimer));
  const [secondsLeft, setSecondsLeft] = useState(15);

  const currentCard = deck.cards[cardIndex];
  const isSaved = currentCard ? savedCardIds.includes(currentCard.id) : false;
  const displayPartner = partnerName.trim() || 'Partner';

  useEffect(() => {
    setSecondsLeft(15);
  }, [cardIndex, deck.id]);

  useEffect(() => {
    if (!deck.hasHotSeatTimer || !timerEnabled || isCompleted || handoffPhase !== 'answering') {
      return;
    }
    if (secondsLeft <= 0) return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [deck.hasHotSeatTimer, timerEnabled, secondsLeft, isCompleted, handoffPhase]);

  function resetCardChoiceState() {
    setHandoffPhase('answering');
    setLockedOptionText(null);
    setLockedOptionIdx(null);
  }

  function handleNext() {
    const res = nextCardIndex(cardIndex, deck.cards.length);
    resetCardChoiceState();
    if (res.completed) {
      setIsCompleted(true);
    } else {
      setCardIndex(res.nextIndex);
    }
  }

  function handlePrev() {
    if (isCompleted) {
      setIsCompleted(false);
      return;
    }
    resetCardChoiceState();
    setCardIndex((prev) => prevCardIndex(prev));
  }

  function handleSelectOption(idx: number) {
    if (!currentCard) return;
    const locked = lockOptionForPrivacyHandoff(currentCard, idx);
    setLockedOptionIdx(locked.lockedOptionIndex);
    setLockedOptionText(locked.lockedOptionText);
    setHandoffPhase('handoff');
  }

  function handlePlayAgain() {
    setIsCompleted(false);
    setCardIndex(0);
    resetCardChoiceState();
  }

  return (
    <div
      data-testid="story-deck-screen"
      style={{ backgroundColor: deck.cardColor, color: deck.textColor }}
      className="min-h-screen w-full flex flex-col justify-between relative select-none overflow-hidden"
    >
      {/* Top Bar: Segmented 3px Story Progress Bars + Centered Deck Title */}
      <header className="w-full max-w-2xl mx-auto px-5 pt-5 z-20">
        <div className="flex items-center gap-1 w-full" aria-label="Deck progress">
          {deck.cards.map((card, idx) => {
            const isFilled = isCompleted || idx <= cardIndex;
            return (
              <div
                key={card.id}
                className="h-[3px] flex-1 rounded-full transition-colors duration-200"
                style={{
                  backgroundColor: isFilled
                    ? deck.progressFillColor
                    : deck.progressTrackColor,
                }}
              />
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 pt-4">
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handlePrev}
              disabled={cardIndex === 0 && !isCompleted}
              aria-label="Previous card"
              className="w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-25 active:scale-95 transition-transform"
            >
              <BackArrowIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 min-w-0 text-center px-1">
            <p className="font-display text-[13px] font-bold tracking-tight truncate">
              {deck.title}
            </p>
            <p
              className="text-[12px] tabular-nums"
              style={{ color: deck.mutedTextColor }}
            >
              {isCompleted
                ? `${deck.cards.length} of ${deck.cards.length}`
                : `Card ${cardIndex + 1} of ${deck.cards.length}`}
            </p>
          </div>

          <div className="flex items-center justify-end gap-1 shrink-0">
            {deck.hasHotSeatTimer && !isCompleted && (
              <button
                type="button"
                onClick={() => setTimerEnabled((prev) => !prev)}
                aria-label="Toggle Hot Seat timer"
                style={{ backgroundColor: deck.pillColor }}
                className="min-h-[38px] px-3 rounded-full flex items-center gap-1.5 text-[12px] font-medium tabular-nums"
              >
                <TimerIcon className="w-3.5 h-3.5" />
                <span>{timerEnabled ? `${secondsLeft}s` : 'Off'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to decks"
              className="w-11 h-11 rounded-full flex items-center justify-center active:scale-95 transition-transform"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Center Stage: Question Prompt / Privacy Handoff / End of Deck */}
      <main className="flex-1 w-full max-w-xl mx-auto px-7 py-6 flex flex-col justify-center z-10">
        <AnimatePresence mode="wait">
          {isCompleted ? (
            <motion.div
              key="end-of-deck"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="text-center space-y-8"
            >
              <div className="space-y-3">
                <p
                  className="text-[13px] font-medium"
                  style={{ color: deck.mutedTextColor }}
                >
                  Deck Complete
                </p>
                <h1 className="font-display text-[28px] sm:text-[32px] font-extrabold leading-[1.2] tracking-[-0.03em] [text-wrap:balance]">
                  {formatEndOfDeckCopy(deck.title, deck.cards.length)}
                </h1>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto">
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    backgroundColor: deck.progressFillColor,
                    color: deck.cardColor,
                  }}
                  className="flex-1 min-h-[52px] px-6 rounded-full font-display font-bold text-[15px] active:scale-[0.98] transition-transform"
                >
                  Back to Decks
                </button>
                <button
                  type="button"
                  onClick={handlePlayAgain}
                  style={{
                    backgroundColor: deck.pillColor,
                    color: deck.textColor,
                  }}
                  className="flex-1 min-h-[52px] px-6 rounded-full font-display font-bold text-[15px] active:scale-[0.98] transition-transform"
                >
                  Play Again
                </button>
              </div>
            </motion.div>
          ) : handoffPhase === 'handoff' ? (
            <motion.div
              key={`handoff-${currentCard.id}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="text-center space-y-8"
            >
              <div className="space-y-3">
                <p
                  className="text-[13px] font-medium"
                  style={{ color: deck.mutedTextColor }}
                >
                  Answer Locked
                </p>
                <h1 className="font-display text-[30px] sm:text-[34px] font-extrabold leading-[1.18] tracking-[-0.03em] [text-wrap:balance]">
                  Pass the phone to {displayPartner}
                </h1>
                <p className="text-[15px]" style={{ color: deck.mutedTextColor }}>
                  Guess your partner&apos;s answer out loud first, then tap below to reveal.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setHandoffPhase('revealed')}
                style={{
                  backgroundColor: deck.progressFillColor,
                  color: deck.cardColor,
                }}
                className="min-h-[54px] px-10 rounded-full font-display font-bold text-[16px] active:scale-[0.98] transition-transform"
              >
                Tap to Reveal
              </button>
            </motion.div>
          ) : (
            <motion.div
              key={`${currentCard.id}-${handoffPhase}`}
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              transition={{ type: 'spring', stiffness: 360, damping: 32 }}
              className="w-full"
            >
              <div className="text-center mb-8">
                {currentCard.tier ? (
                  <p
                    className="text-[13px] font-medium mb-3"
                    style={{ color: deck.mutedTextColor }}
                  >
                    Level {currentCard.tierLevel} · {currentCard.tier}
                  </p>
                ) : currentCard.kicker ? (
                  <p
                    className="text-[13px] font-medium mb-3"
                    style={{ color: deck.mutedTextColor }}
                  >
                    {currentCard.kicker}
                  </p>
                ) : null}

                <h1 className="font-display text-[28px] sm:text-[32px] font-extrabold leading-[1.22] tracking-[-0.03em] [text-wrap:balance]">
                  {currentCard.prompt}
                </h1>
              </div>

              {currentCard.options && currentCard.options.length > 0 && (
                <div className="space-y-3 w-full max-w-md mx-auto">
                  {currentCard.options.map((opt, idx) => {
                    const isLockedChoice = handoffPhase === 'revealed' && lockedOptionIdx === idx;
                    return (
                      <motion.button
                        key={opt}
                        type="button"
                        whileTap={{ scale: 0.985 }}
                        disabled={handoffPhase === 'revealed'}
                        onClick={() => handleSelectOption(idx)}
                        style={{
                          backgroundColor: isLockedChoice
                            ? deck.progressFillColor
                            : deck.pillColor,
                          color: isLockedChoice ? deck.cardColor : deck.textColor,
                        }}
                        className="w-full min-h-[54px] py-3.5 px-6 rounded-full text-center text-[15px] font-semibold leading-snug transition-colors cursor-pointer"
                      >
                        {opt}
                      </motion.button>
                    );
                  })}

                  {handoffPhase === 'revealed' && lockedOptionText && (
                    <p
                      className="text-center text-[14px] pt-2"
                      style={{ color: deck.mutedTextColor }}
                    >
                      Locked pick: {lockedOptionText}
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Bar: Strictly Two 1.75px Monochrome SVG Stroke Icons — Save/Heart and Next/Skip */}
      {!isCompleted ? (
        <footer className="w-full max-w-xs mx-auto pb-8 pt-4 px-8 z-20 flex items-center justify-between">
          <button
            type="button"
            onClick={() => currentCard && onToggleSave(currentCard.id)}
            aria-label={isSaved ? 'Remove card from saved' : 'Save card'}
            aria-pressed={isSaved}
            className="w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-transform"
          >
            <HeartIcon className="w-6 h-6" filled={isSaved} />
          </button>

          <button
            type="button"
            onClick={handleNext}
            aria-label="Next card"
            className="w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-transform"
          >
            <NextArrowIcon className="w-6 h-6" />
          </button>
        </footer>
      ) : (
        <div className="pb-10" />
      )}
    </div>
  );
}
