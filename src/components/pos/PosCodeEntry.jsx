import { useEffect, useRef, useState } from "react";
import { Delete, Loader2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchTillInfo, unlockTillWithCode } from "@/lib/pos/posAccessClient";

const CODE_LENGTH = 6;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

/**
 * Till lock screen: "PAIDLY POS · Main Till · CoffeeShop · Enter POS access code".
 * The till comes from the till link (or this device's last till). The code opens a scoped till
 * session — it never signs anyone into Paidly and never opens the dashboard.
 */
export default function PosCodeEntry({ tillId, onUnlocked, onUseOwnerSignIn, lockedMessage = "" }) {
  const [till, setTill] = useState(null);
  const [tillMissing, setTillMissing] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // "code" = the code was wrong / locked out (operator can fix); "system" = Paidly's side.
  const [errorKind, setErrorKind] = useState("code");
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setTillMissing(false);
    fetchTillInfo(tillId)
      .then((info) => {
        if (cancelled) return;
        if (info) setTill(info);
        else setTillMissing(true);
      })
      .catch(() => {
        if (!cancelled) setTillMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tillId]);

  const submit = async (value = code) => {
    if (value.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    setError("");
    try {
      const access = await unlockTillWithCode(tillId, value);
      onUnlocked?.(access);
    } catch (err) {
      const system = !err?.status || err.status >= 500;
      setErrorKind(system ? "system" : "code");
      setError(
        err?.message ||
          (system ? "Paidly couldn't open the till just now — this isn't your code. Try again." : "That code is not valid for this till.")
      );
      setCode("");
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const press = (key) => {
    if (busy) return;
    setError("");
    if (key === "back") return setCode((c) => c.slice(0, -1));
    if (!key) return;
    const next = (code + key).slice(0, CODE_LENGTH);
    setCode(next);
    if (next.length === CODE_LENGTH) void submit(next);
  };

  const codesUnavailable = till?.access_codes === "unavailable";

  if (tillMissing) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <Store className="size-10 text-muted-foreground" aria-hidden />
        <p className="font-display text-xl font-semibold">This till link isn&apos;t active</p>
        <p className="max-w-sm text-sm text-muted-foreground">Ask your business administrator for the current till link.</p>
        {onUseOwnerSignIn ? (
          <Button type="button" variant="ghost" onClick={onUseOwnerSignIn}>
            Owner or manager? Sign in with Paidly
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-xs text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary">
          <Store className="size-7 text-primary-foreground" aria-hidden />
        </div>
        <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">Paidly POS</p>
        <h1 className="mt-3 font-display text-2xl font-bold">{till?.till?.name || " "}</h1>
        <p className="text-sm text-muted-foreground">{till?.business?.name || " "}</p>
        {lockedMessage ? <p className="mt-3 text-sm text-muted-foreground">{lockedMessage}</p> : null}

        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label htmlFor="pos-access-code" className="text-sm font-medium">
            Enter POS access code
          </label>
          <input
            ref={inputRef}
            id="pos-access-code"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={CODE_LENGTH}
            value={code}
            onChange={(e) => {
              setError("");
              const next = e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH);
              setCode(next);
              if (next.length === CODE_LENGTH) void submit(next);
            }}
            className="sr-only"
            aria-describedby={error ? "pos-access-code-error" : undefined}
          />
          <div className="mt-3 flex justify-center gap-2" aria-hidden onClick={() => inputRef.current?.focus()}>
            {Array.from({ length: CODE_LENGTH }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "flex size-10 items-center justify-center rounded-lg border-2 text-2xl",
                  i < code.length ? "border-primary" : "border-border",
                  error && errorKind === "code" && "border-destructive"
                )}
              >
                {i < code.length ? "•" : ""}
              </span>
            ))}
          </div>
          {codesUnavailable ? (
            <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200" role="status">
              POS access codes aren&apos;t set up for this business yet. Ask your manager.
            </p>
          ) : null}
          {error ? (
            <p
              id="pos-access-code-error"
              className={cn(
                "mt-3 text-sm",
                errorKind === "system" ? "rounded-lg bg-amber-500/10 px-3 py-2 text-amber-900 dark:text-amber-200" : "text-destructive"
              )}
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-5 grid grid-cols-3 gap-2">
            {KEYS.map((key, i) =>
              key ? (
                <Button
                  key={key}
                  type="button"
                  variant="outline"
                  className="h-14 text-xl font-semibold touch-manipulation"
                  aria-label={key === "back" ? "Delete last digit" : key}
                  disabled={busy || codesUnavailable}
                  onClick={() => press(key)}
                >
                  {key === "back" ? <Delete className="size-5" /> : key}
                </Button>
              ) : (
                <span key={`gap-${i}`} />
              )
            )}
          </div>
          <Button type="submit" className="mt-4 h-12 w-full text-base font-semibold" disabled={busy || codesUnavailable || code.length !== CODE_LENGTH}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : null}
            Continue
          </Button>
        </form>

        <p className="mt-6 text-xs text-muted-foreground">Need help? Contact your business administrator.</p>
        {onUseOwnerSignIn ? (
          <Button type="button" variant="link" className="mt-1 h-auto text-xs text-muted-foreground" onClick={onUseOwnerSignIn}>
            Owner or manager? Sign in with Paidly
          </Button>
        ) : null}
      </div>
    </div>
  );
}
