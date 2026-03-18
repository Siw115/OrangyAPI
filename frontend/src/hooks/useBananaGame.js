import { useCallback, useEffect, useRef, useState } from "react";

const GAME_DURATION_SECONDS = 20;
const BANANA_MOVE_BASE_MS = 1100;
const HIT_COOLDOWN_MS = 90;

function randomBananaPosition() {
  return {
    left: Math.floor(Math.random() * 76) + 8,
    top: Math.floor(Math.random() * 66) + 12,
  };
}

export function useBananaGame(overlayVisible) {
  const [bananaScore, setBananaScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [misses, setMisses] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION_SECONDS);
  const [roundOver, setRoundOver] = useState(false);
  const [personalBest, setPersonalBest] = useState(0);
  const [bananaPosition, setBananaPosition] = useState(() => randomBananaPosition());
  const lastHitAtRef = useRef(0);

  const moveBanana = useCallback(() => {
    setBananaPosition(randomBananaPosition());
  }, []);

  const restartMiniGame = useCallback(() => {
    setBananaScore(0);
    setCombo(0);
    setBestCombo(0);
    setMisses(0);
    setTimeLeft(GAME_DURATION_SECONDS);
    setRoundOver(false);
    moveBanana();
  }, [moveBanana]);

  const onCatchBanana = useCallback((event) => {
    event.stopPropagation();
    event.preventDefault();

    if (roundOver) {
      return;
    }

    const now = Date.now();
    if (now - lastHitAtRef.current < HIT_COOLDOWN_MS) {
      return;
    }
    lastHitAtRef.current = now;

    setCombo((currentCombo) => {
      const nextCombo = currentCombo + 1;
      const comboBonus = Math.floor(nextCombo / 4);
      setBananaScore((score) => score + 1 + comboBonus);
      setBestCombo((best) => Math.max(best, nextCombo));
      return nextCombo;
    });
    moveBanana();
  }, [moveBanana, roundOver]);

  const onArenaMiss = useCallback((event) => {
    event.preventDefault();

    if (roundOver || event.target !== event.currentTarget) {
      return;
    }

    setMisses((value) => value + 1);
    setCombo(0);
    setBananaScore((score) => Math.max(0, score - 1));
  }, [roundOver]);

  useEffect(() => {
    if (overlayVisible) {
      restartMiniGame();
    }
  }, [overlayVisible, restartMiniGame]);

  useEffect(() => {
    if (!overlayVisible || roundOver) {
      return;
    }

    const timerId = window.setInterval(() => {
      setTimeLeft((remaining) => {
        if (remaining <= 1) {
          setRoundOver(true);
          return 0;
        }

        return remaining - 1;
      });
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [overlayVisible, roundOver]);

  useEffect(() => {
    if (!overlayVisible || roundOver) {
      return;
    }

    const speedStep = Math.min(combo * 70, 600);
    const moveDelay = Math.max(460, BANANA_MOVE_BASE_MS - speedStep);
    const moveId = window.setInterval(() => {
      moveBanana();
    }, moveDelay);

    return () => window.clearInterval(moveId);
  }, [combo, moveBanana, overlayVisible, roundOver]);

  useEffect(() => {
    if (roundOver) {
      setPersonalBest((best) => Math.max(best, bananaScore));
    }
  }, [bananaScore, roundOver]);

  return {
    bananaScore,
    combo,
    bestCombo,
    misses,
    timeLeft,
    roundOver,
    personalBest,
    bananaPosition,
    restartMiniGame,
    onCatchBanana,
    onArenaMiss,
  };
}
