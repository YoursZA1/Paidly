import { useEffect, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import DoneState from "@/components/shared/DoneState";
import { resetLiveDemo } from "@/lib/demo/demoModeApi";
import { DEMO_BUSINESS_NAME } from "@/lib/demo/demoModeState";

/**
 * Reset Demo: confirm → restore the original dataset on the server → Done State. The next pages are
 * full loads so no pre-reset data can linger in memory.
 */
export default function DemoResetDialog({ open, onOpenChange, businessName = DEMO_BUSINESS_NAME }) {
  const [phase, setPhase] = useState("confirm");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setPhase("confirm");
      setError("");
    }
  }, [open]);

  const reset = async () => {
    setPhase("working");
    setError("");
    try {
      await resetLiveDemo();
      setPhase("done");
    } catch (err) {
      setError(err?.message || "We couldn't reset the demo. Please try again.");
      setPhase("confirm");
    }
  };

  const go = (path) => window.location.assign(path);

  const handleOpenChange = (next) => {
    if (phase === "working") return;
    // Closing after a reset reloads the page so nothing from before the reset stays on screen.
    if (!next && phase === "done") {
      go(`${window.location.pathname}${window.location.search}`);
      return;
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md sm:rounded-2xl" data-testid="demo-reset-dialog">
        {phase === "done" ? (
          <>
            <DialogHeader className="sr-only">
              <DialogTitle>Demo reset</DialogTitle>
              <DialogDescription>{businessName} is back to its original data.</DialogDescription>
            </DialogHeader>
            <DoneState
              variant="dialog"
              title="Demo reset"
              reference={{ counterparty: businessName, meta: "Original sample data restored" }}
              message="Customers, invoices, quotes, stock, POS orders, tables and reports are back to where the demo started."
              actions={[
                { label: "Go to dashboard", onClick: () => go("/Dashboard") },
                { label: "Open the POS", onClick: () => go("/pos"), variant: "outline" },
              ]}
            />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RotateCcw className="size-5" aria-hidden />
                Reset the demo?
              </DialogTitle>
              <DialogDescription>
                {businessName} goes back to its original sample data. Anything you created or changed in this demo is removed.
              </DialogDescription>
            </DialogHeader>
            {error ? (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="ghost" disabled={phase === "working"} onClick={() => onOpenChange(false)}>
                Keep exploring
              </Button>
              <Button type="button" onClick={() => void reset()} disabled={phase === "working"} data-testid="demo-reset-confirm">
                {phase === "working" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
                {phase === "working" ? "Restoring…" : "Reset demo"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
