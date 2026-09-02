import { Link } from "react-router-dom";
import { Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createPageUrl } from "@/utils";

export function PosLoading({ message = "Loading your till..." } = {}) {
  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary">
        <Store className="size-7 text-primary-foreground" aria-hidden />
      </div>
      <p className="font-display text-xl font-semibold text-foreground">Paidly POS</p>
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
        aria-hidden
      />
      <p className="text-sm text-muted-foreground" role="status">
        {message}
      </p>
    </div>
  );
}

export function PosLoadError({
  title = "POS couldn't load",
  message = "Something went wrong while loading the POS system.",
  onRetry,
  error,
} = {}) {
  const detail = import.meta.env.DEV && error ? String(error.message || error) : null;

  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <Store className="size-10 text-muted-foreground" aria-hidden />
      <div>
        <p className="font-display text-xl font-semibold text-foreground">{title}</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>
        {detail ? (
          <pre className="mt-3 max-h-32 max-w-sm overflow-auto rounded-lg border border-border bg-muted/50 p-3 text-left font-mono text-[11px] text-foreground">
            {detail}
          </pre>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {typeof onRetry === "function" ? (
          <Button type="button" className="h-12 min-w-[10rem]" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
        <Button asChild type="button" variant="outline" className="h-12 min-w-[10rem]">
          <Link to={createPageUrl("Home")}>Return to Paidly</Link>
        </Button>
      </div>
    </div>
  );
}
