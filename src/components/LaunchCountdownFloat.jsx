import { useEffect, useMemo, useState } from "react";
import {
  PRODUCT_LAUNCH_DATE_LABEL,
  PRODUCT_LAUNCH_DEADLINE_MS,
} from "@/constants/productLaunch";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function useLaunchCountdown(deadlineMs) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return useMemo(() => {
    const diff = Math.max(0, deadlineMs - now);
    if (diff === 0) {
      return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
    }
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return { expired: false, days, hours, minutes, seconds };
  }, [deadlineMs, now]);
}

const UNIT =
  "flex min-w-[3rem] flex-col items-center rounded-lg bg-black/40 px-2 py-1.5 ring-1 ring-white/10 sm:min-w-[3.25rem] sm:px-2.5";

/**
 * Fixed corner countdown until {@link PRODUCT_LAUNCH_DEADLINE_MS}.
 */
export default function LaunchCountdownFloat() {
  const { expired, days, hours, minutes, seconds } = useLaunchCountdown(PRODUCT_LAUNCH_DEADLINE_MS);

  if (expired) {
    return null;
  }

  return (
    <aside
      className="pointer-events-none fixed bottom-4 left-4 right-4 z-[90] mx-auto flex max-w-md justify-center sm:left-auto sm:right-6 sm:mx-0"
      aria-label={`Countdown to launch on ${PRODUCT_LAUNCH_DATE_LABEL}`}
    >
      <div className="pointer-events-auto w-full rounded-2xl border border-white/[0.12] bg-[#0a0a0a]/92 px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-xl sm:w-auto sm:min-w-[280px]">
        <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-amber-200">
          Launch · {PRODUCT_LAUNCH_DATE_LABEL}
        </p>
        <p className="mt-1 text-center text-xs text-zinc-400">Time left</p>
        <div
          className="mt-2 flex items-start justify-center gap-1.5 sm:gap-2"
          role="timer"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className={UNIT}>
            <span className="font-mono text-lg font-bold tabular-nums text-white sm:text-xl">{days}</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Days</span>
          </div>
          <div className={UNIT}>
            <span className="font-mono text-lg font-bold tabular-nums text-white sm:text-xl">{pad2(hours)}</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-300">Hrs</span>
          </div>
          <div className={UNIT}>
            <span className="font-mono text-lg font-bold tabular-nums text-white sm:text-xl">{pad2(minutes)}</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-300">Min</span>
          </div>
          <div className={UNIT}>
            <span className="font-mono text-lg font-bold tabular-nums text-[#FF4F00] sm:text-xl">{pad2(seconds)}</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-300">Sec</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
