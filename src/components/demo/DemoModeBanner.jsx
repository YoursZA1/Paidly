import { useState } from "react";
import { Clock, LogOut, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDemoTimeLeft, useDemoMode } from "@/hooks/useDemoMode";
import DemoResetDialog from "@/components/demo/DemoResetDialog";
import DemoWelcomeDialog from "@/components/demo/DemoWelcomeDialog";
import { useDemoActions } from "@/components/demo/useDemoActions";

/**
 * Persistent Demo Mode indicator for the app shell and the till. Always visible while in a demo:
 * what this is, how long is left, Reset demo, End demo, and a quiet "create your account" CTA.
 * @param {{ variant?: "shell" | "till" }} props
 */
export default function DemoModeBanner({ variant = "shell" }) {
  const demo = useDemoMode();
  const { leaving, endDemo, createAccount } = useDemoActions();
  const [resetOpen, setResetOpen] = useState(false);

  if (!demo.isDemo) return null;

  const timeLeft = formatDemoTimeLeft(demo.minutesLeft);
  const till = variant === "till";

  if (demo.expired) {
    return (
      <div
        role="status"
        data-testid="demo-mode-banner"
        className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100"
      >
        <span className="inline-flex items-center rounded-md bg-amber-500 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
          Demo ended
        </span>
        <span className="min-w-0 flex-1">This demo has ended. Nothing you changed was kept — start a fresh demo to keep exploring.</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8" disabled={leaving} onClick={() => void endDemo()}>
            Start a fresh demo
          </Button>
          <Button size="sm" className="h-8" disabled={leaving} onClick={() => void createAccount()}>
            Create your Paidly account
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        role="region"
        aria-label="Demo Mode"
        data-testid="demo-mode-banner"
        className={cn(
          "flex items-center gap-2 border-b px-3 py-1.5 text-sm sm:gap-3 sm:px-4",
          "border-primary/15 bg-primary/[0.06] text-foreground",
          till && "shrink-0"
        )}
      >
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary-foreground">
          <Sparkles className="size-3" aria-hidden />
          Demo mode
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground sm:text-sm">
          <span className="font-medium text-foreground">{demo.businessName}</span>
          <span className="hidden sm:inline"> · sample data · payments are simulated and no messages are sent</span>
          {timeLeft ? (
            <span className="hidden md:inline">
              {" · "}
              <Clock className="mb-0.5 inline size-3.5" aria-hidden /> {timeLeft} left
            </span>
          ) : null}
        </span>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2"
            onClick={() => setResetOpen(true)}
            data-testid="demo-reset-button"
            aria-label="Reset demo"
          >
            <RotateCcw className="size-4" aria-hidden />
            <span className="hidden sm:inline">Reset demo</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2"
            disabled={leaving}
            onClick={() => void endDemo()}
            aria-label="End demo"
          >
            <LogOut className="size-4" aria-hidden />
            <span className="hidden lg:inline">End demo</span>
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 px-3"
            disabled={leaving}
            onClick={() => void createAccount()}
            data-testid="demo-create-account"
          >
            <span className="sm:hidden">Sign up</span>
            <span className="hidden sm:inline">Create your Paidly account</span>
          </Button>
        </div>
      </div>
      <DemoResetDialog open={resetOpen} onOpenChange={setResetOpen} businessName={demo.businessName} />
      {till ? null : <DemoWelcomeDialog businessName={demo.businessName} />}
    </>
  );
}
