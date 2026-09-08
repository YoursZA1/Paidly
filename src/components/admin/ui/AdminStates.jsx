import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

export function AdminLoadingState({ rows = 4, className = "" }) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-2xl bg-muted/70" />
      ))}
    </div>
  );
}

export function AdminEmptyState({ title, description, action }) {
  return (
    <EmptyState
      icon={<Inbox className="h-6 w-6 text-muted-foreground" />}
      title={title || "Nothing to show yet"}
      description={description || "When this data exists in Paidly, it will appear here."}
      action={action}
    />
  );
}

export function AdminErrorState({ message, onRetry }) {
  return (
    <EmptyState
      icon={<AlertTriangle className="h-6 w-6 text-destructive" />}
      title="Could not load this view"
      description={message || "The admin API did not return this data."}
      action={
        onRetry ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Retry
          </Button>
        ) : null
      }
    />
  );
}

export function AdminUnavailableState({ reason }) {
  return (
    <EmptyState
      icon={<Inbox className="h-6 w-6 text-muted-foreground" />}
      title="Not available from current data"
      description={reason || "This module is wired, but the underlying table or metric is not available in this environment."}
    />
  );
}
