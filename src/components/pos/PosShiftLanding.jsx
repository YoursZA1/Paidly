import { useState } from "react";
import { Store, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { greetingForHour, firstNameFromEmployee } from "@/lib/pos/posAccessCopy";

/**
 * POS entry after a valid access pass. Does not start the shift until the employee confirms.
 */
export default function PosShiftLanding({
  employeeName = "",
  employeeEmail = "",
  businessName = "",
  tillName = "",
  openShift = null,
  openingBalance = 0,
  busy = false,
  error = "",
  onStartShift,
  onResumeShift,
} = {}) {
  const [openingDraft, setOpeningDraft] = useState(String(openingBalance ?? 0));
  const firstName = firstNameFromEmployee(employeeName, employeeEmail);
  const greeting = greetingForHour();
  const hasOpenShift = Boolean(openShift?.id);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-none">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary">
          <Store className="size-8 text-primary-foreground" aria-hidden />
        </div>
        <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Paidly POS
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold text-foreground">
          {greeting}, {firstName}
        </h1>
        <p className="mt-2 text-base text-muted-foreground">{businessName || "Your store"}</p>
        <p className="mt-4 text-sm font-medium text-foreground">{tillName || "Assigned till"}</p>

        {hasOpenShift ? (
          <p className="mt-3 text-sm text-muted-foreground">You already have an active shift on this till.</p>
        ) : (
          <div className="mt-6 space-y-2 text-left">
            <Label htmlFor="pos-landing-opening">Opening cash</Label>
            <Input
              id="pos-landing-opening"
              inputMode="decimal"
              value={openingDraft}
              onChange={(e) => setOpeningDraft(e.target.value)}
              className="h-12"
            />
          </div>
        )}

        {error ? (
          <p className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <Button
          type="button"
          className="mt-6 h-14 w-full text-base font-semibold uppercase tracking-wide"
          disabled={busy || (!hasOpenShift && (openingDraft === "" || Number(openingDraft) < 0))}
          onClick={() => {
            if (hasOpenShift) onResumeShift?.();
            else onStartShift?.(Number(openingDraft));
          }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {hasOpenShift ? "Resume Shift" : "Start Shift"}
        </Button>
      </div>
    </div>
  );
}
