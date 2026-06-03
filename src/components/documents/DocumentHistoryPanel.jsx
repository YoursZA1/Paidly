import { format } from "date-fns";
import { formatDocumentEventType, summarizeDocumentEventPayload } from "@/document-engine/documentEventLabels";
import { EmptyState } from "@/components/ui/empty-state";
import { History } from "lucide-react";

/** Lifecycle milestones shown in the History tab (subset of all events). */
const HISTORY_EVENT_TYPES = new Set([
  "created",
  "updated",
  "sent",
  "viewed",
  "accepted",
  "paid",
  "converted",
  "created_from_quote",
  "created_from_conversion",
  "status_changed",
  "archived",
  "unarchived",
  "attachment_added",
  "comment_added",
]);

/**
 * Structured lifecycle history — key milestones only, distinct from the raw Activity feed.
 */
export default function DocumentHistoryPanel({ events = [] }) {
  const milestones = (Array.isArray(events) ? events : []).filter((ev) =>
    HISTORY_EVENT_TYPES.has(String(ev.event_type || ""))
  );

  if (!milestones.length) {
    return (
      <EmptyState
        icon={<History className="h-6 w-6 text-muted-foreground" />}
        title="No history yet"
        description="Lifecycle milestones appear here as the document moves through draft, sent, signed, and paid."
      />
    );
  }

  return (
    <ol className="relative space-y-0 border-l border-border pl-4">
      {milestones.map((ev) => {
        const rows = summarizeDocumentEventPayload(ev.payload);
        const dt = ev.created_at ? new Date(ev.created_at) : null;
        return (
          <li key={ev.id} className="relative pb-8 last:pb-0">
            <span
              className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary"
              aria-hidden
            />
            <div className="pl-2">
              <p className="text-sm font-semibold">{formatDocumentEventType(ev.event_type)}</p>
              {dt && !Number.isNaN(dt.getTime()) ? (
                <time className="text-xs text-muted-foreground" dateTime={ev.created_at}>
                  {format(dt, "EEEE, MMM d, yyyy · HH:mm")}
                </time>
              ) : null}
              {rows.length ? (
                <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {rows.map((row, j) => (
                    <div key={j} className="flex gap-2">
                      <dt className="font-medium text-foreground/70">{row.label}:</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
