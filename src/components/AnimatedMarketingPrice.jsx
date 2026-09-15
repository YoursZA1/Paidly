import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { formatMarketingZar } from "@shared/planMarketing.js";
import {
  PRICE_COUNT_DURATION_MS,
  animationStartFrom,
  countPriceFrame,
  marketingZarNumericPart,
} from "@/lib/animatedPrice.js";

export default function AnimatedMarketingPrice({ amount, grouped = false }) {
  const prefersReducedMotion = useReducedMotion();
  const target = Number(amount);
  const valid = Number.isFinite(target);
  const [frame, setFrame] = useState(valid ? target : 0);
  const displayedRef = useRef(valid ? target : 0);
  const hadValidDisplayRef = useRef(valid);

  useEffect(() => {
    if (!valid) {
      hadValidDisplayRef.current = false;
      return undefined;
    }
    const from = animationStartFrom(displayedRef.current, target, {
      hadValidDisplay: hadValidDisplayRef.current,
    });
    hadValidDisplayRef.current = true;
    if (prefersReducedMotion || from === target) {
      displayedRef.current = target;
      setFrame(target);
      return undefined;
    }

    const startedAt = performance.now();
    let raf = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - startedAt) / PRICE_COUNT_DURATION_MS);
      const next = countPriceFrame(from, target, t);
      displayedRef.current = next;
      setFrame(next);
      if (t < 1) raf = requestAnimationFrame(tick);
      else displayedRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, valid, prefersReducedMotion]);

  if (!valid) return "—";

  const shown = hadValidDisplayRef.current ? frame : target;
  return (
    <span aria-label={formatMarketingZar(target, { grouped })}>
      R
      <span className="tabular-nums" aria-hidden="true">
        {marketingZarNumericPart(shown, { grouped })}
      </span>
    </span>
  );
}
