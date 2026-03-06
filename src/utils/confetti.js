import confetti from 'canvas-confetti';

const COLORS = ['#f24e00', '#ff7c00', '#10b981', '#fbbf24', '#6366f1'];

/**
 * Trigger a premium confetti explosion for ~1.5 seconds.
 * Use when invoice status changes to Paid.
 */
export function runPaidConfetti() {
  // Initial burst from center
  confetti({
    particleCount: 80,
    spread: 100,
    origin: { y: 0.6 },
    colors: COLORS,
  });

  const duration = 1500;
  const end = Date.now() + duration;

  const frame = () => {
    confetti({
      particleCount: 2,
      angle: 60,
      spread: 55,
      origin: { x: 0.1, y: 0.8 },
      colors: COLORS,
    });
    confetti({
      particleCount: 2,
      angle: 120,
      spread: 55,
      origin: { x: 0.9, y: 0.8 },
      colors: COLORS,
    });
    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  };
  frame();
}
