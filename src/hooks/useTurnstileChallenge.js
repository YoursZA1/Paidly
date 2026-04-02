import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const TURNSTILE_SCRIPT_ID = "cf-turnstile-api-script";
const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function envFlag(name) {
  const raw = String(import.meta.env[name] || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function useTurnstileChallenge({ requiredEnvKey, theme = "light", requireInProdByDefault = true } = {}) {
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);

  const siteKey = String(import.meta.env.VITE_TURNSTILE_SITE_KEY || "").trim();
  const required = useMemo(() => {
    if (!siteKey) return false;
    if (requiredEnvKey && envFlag(requiredEnvKey)) return true;
    return requireInProdByDefault ? import.meta.env.PROD : false;
  }, [requiredEnvKey, requireInProdByDefault, siteKey]);

  const clear = useCallback(() => {
    setToken("");
    setReady(false);
  }, []);

  const reset = useCallback(() => {
    if (typeof window !== "undefined" && window.turnstile && widgetIdRef.current !== null) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {
        // ignore reset errors and still clear local state
      }
    }
    clear();
  }, [clear]);

  useEffect(() => {
    if (!siteKey) return;
    if (typeof window === "undefined") return;

    const renderWidget = () => {
      if (!window.turnstile || !containerRef.current || widgetIdRef.current !== null) return;
      const widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme,
        callback: (value) => {
          setToken(String(value || ""));
          setReady(true);
        },
        "expired-callback": clear,
        "error-callback": clear,
      });
      widgetIdRef.current = widgetId;
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      let script = document.getElementById(TURNSTILE_SCRIPT_ID);
      if (!script) {
        script = document.createElement("script");
        script.id = TURNSTILE_SCRIPT_ID;
        script.src = TURNSTILE_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", renderWidget);
      return () => script.removeEventListener("load", renderWidget);
    }

    return () => {
      if (window.turnstile && widgetIdRef.current !== null) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
      }
      widgetIdRef.current = null;
      clear();
    };
  }, [clear, siteKey, theme]);

  return {
    siteKey,
    required,
    ready,
    token,
    containerRef,
    reset,
    clear,
  };
}
