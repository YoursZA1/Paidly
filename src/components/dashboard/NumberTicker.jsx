import { useEffect, useRef } from 'react';
import { useMotionValue, useSpring, useInView } from 'framer-motion';
import { formatCurrency } from '@/utils/currencyCalculations';

/**
 * Number ticker with spring physics — value "climbs" when in view.
 * Uses Framer Motion useSpring for a premium SaaS feel.
 */
export function NumberTicker({ value, currency = 'ZAR', enabled = true }) {
  const ref = useRef(null);
  const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, {
    damping: 30,
    stiffness: 100,
  });
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  useEffect(() => {
    if (enabled && isInView) {
      motionValue.set(numericValue);
    } else if (!enabled) {
      motionValue.set(numericValue);
    }
  }, [motionValue, numericValue, isInView, enabled]);

  useEffect(() => {
    const unsub = springValue.on('change', (latest) => {
      if (ref.current) {
        ref.current.textContent = formatCurrency(Number(latest.toFixed(0)), currency);
      }
    });
    if (ref.current) {
      ref.current.textContent = formatCurrency(Math.round(springValue.get()), currency);
    }
    return unsub;
  }, [springValue, currency]);

  return <span ref={ref} className="currency-nums tabular-nums" />;
}
