import { motion } from "framer-motion";
import Lottie from "lottie-react";
import bananaAnimationData from "../assets/banana-animation.json";

export function WarmupOverlay({ visible, prefersReducedMotion, warmupMessage, game }) {
  if (!visible) {
    return null;
  }

  return (
    <motion.section
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1 }}
      exit={prefersReducedMotion ? undefined : { opacity: 0 }}
      className="warmup-overlay"
      aria-live="polite"
    >
      <motion.div
        initial={prefersReducedMotion ? false : { scale: 0.96, y: 10, opacity: 0 }}
        animate={prefersReducedMotion ? undefined : { scale: 1, y: 0, opacity: 1 }}
        exit={prefersReducedMotion ? undefined : { scale: 0.98, y: 6, opacity: 0 }}
        className="warmup-card"
      >
        <p className="warmup-label">Mini-game</p>
        <h2 className="warmup-title">Catch the banana while OrangyAPI wakes up</h2>
        <p className="warmup-message">{warmupMessage}</p>

        <div className="warmup-stats">
          <div className="warmup-stat"><span>Time</span><strong>{game.timeLeft}s</strong></div>
          <div className="warmup-stat"><span>Score</span><strong>{game.bananaScore}</strong></div>
          <div className="warmup-stat"><span>Combo</span><strong>x{game.combo}</strong></div>
          <div className="warmup-stat"><span>Misses</span><strong>{game.misses}</strong></div>
        </div>

        <div
          className={`warmup-arena ${game.roundOver ? "is-finished" : ""}`}
          onPointerDown={game.onArenaMiss}
        >
          <motion.button
            type="button"
            className="banana-button"
            animate={{
              left: `${game.bananaPosition.left}%`,
              top: `${game.bananaPosition.top}%`,
            }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 380, damping: 26, mass: 0.35 }
            }
            onPointerDown={game.onCatchBanana}
            aria-label="Catch banana"
          >
            <Lottie
              animationData={bananaAnimationData}
              loop
              autoplay
              className="banana-lottie"
            />
          </motion.button>

          {game.roundOver && (
            <div className="warmup-round-over">
              <p className="warmup-round-title">Round complete</p>
              <p className="warmup-round-subtitle">
                Best combo x{game.bestCombo} - Personal best {game.personalBest}
              </p>
              <button type="button" className="warmup-restart" onClick={game.restartMiniGame}>
                Play again
              </button>
            </div>
          )}
        </div>

        <p className="warmup-score">Tip: hits increase speed. Misses cost 1 point.</p>
      </motion.div>
    </motion.section>
  );
}
