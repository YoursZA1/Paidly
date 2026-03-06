import { useState, useEffect, useRef } from 'react';

/**
 * Animates a number from 0 to the target value over a duration (e.g. on page load).
 * Uses ease-out cubic for a natural "ticker" feel. Run once when enabled becomes true with a valid end.
 * @param {number} end - Target value
 * @param {number} duration - Animation duration in ms (default 1000)
 * @param {boolean} enabled - Whether to run the animation (e.g. after data has loaded)
 * @returns {number} Current interpolated value
 */
export function useCountUp(end, duration = 1000, enabled = true) {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef(null);
  const displayedRef = useRef(0);

  useEffect(() => {
    const target = typeof end === 'number' && Number.isFinite(end) ? end : 0;
    if (!enabled) {
      setCurrent(target);
      displayedRef.current = target;
      return;
    }

    const start = displayedRef.current;
    const startTimeRef = { current: null };

    const tick = (now) => {
      if (startTimeRef.current == null) startTimeRef.current = now;
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const value = start + (target - start) * easeOut;
      displayedRef.current = value;
      setCurrent(value);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [end, duration, enabled]);

  return current;
}
