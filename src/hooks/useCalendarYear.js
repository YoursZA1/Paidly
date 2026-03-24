import { useState, useEffect } from "react";

/**
 * Current calendar year, kept in sync when the tab is idle across New Year or after long sessions.
 * Also updates on visibility restore and window focus.
 */
export function useCalendarYear() {
  const [year, setYear] = useState(() => new Date().getFullYear());

  useEffect(() => {
    const sync = () => {
      const y = new Date().getFullYear();
      setYear((prev) => (prev !== y ? y : prev));
    };
    sync();
    const id = setInterval(sync, 60_000);
    const onVis = () => {
      if (document.visibilityState === "visible") sync();
    };
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return year;
}
