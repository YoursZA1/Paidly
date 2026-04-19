import PropTypes from "prop-types";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { formatDocumentEventType, summarizeDocumentEventPayload } from "@/document-engine/documentEventLabels";
import { createPageUrl } from "@/utils";
import { cn } from "@/lib/utils";

function isLikelyUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

function PayloadValue({ value }) {
  const s = String(value ?? "").trim();
  if (isLikelyUuid(s)) {
    return (
      <Link
        to={`${createPageUrl("Documents")}/${encodeURIComponent(s)}`}
        className="font-mono text-xs text-primary underline-offset-4 hover:underline"
      >
        {s.slice(0, 8)}…
      </Link>
    );
  }
  return <span className="break-words text-xs">{s}</span>;
}

PayloadValue.propTypes = {
  value: PropTypes.string,
};

/**
 * Activity feed for `document_events` (newest first; matches `DocumentService.get` ordering).
 * @param {{ events: Array<{ id: string, event_type: string, created_at?: string, actor_user_id?: string|null, payload?: object }>, className?: string }} props
 */
export function DocumentTimeline({ events, className }) {
  const list = Array.isArray(events) ? events : [];
  if (!list.length) {
    return (
      <div className={cn("rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-6 text-center", className)}>
        <p className="text-sm text-muted-foreground">No activity recorded yet. Saving, sending, or changing status will appear here.</p>
      </div>
    );
  }
  return (
    <div className={cn("space-y-3 border-t border-border pt-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight">Activity</h3>
        <span className="text-xs text-muted-foreground">{list.length} events</span>
      </div>
      <ol className="relative space-y-0 border-l border-border/80 pl-4">
        {list.map((ev) => {
          const rows = summarizeDocumentEventPayload(ev.payload);
          const dt = ev.created_at ? new Date(ev.created_at) : null;
          const timeLabel = dt && !Number.isNaN(dt.getTime()) ? format(dt, "MMM d, HH:mm") : "";
          const headerLabel = timeLabel
            ? `${formatDocumentEventType(ev.event_type)} • ${timeLabel}`
            : formatDocumentEventType(ev.event_type);
          return (
            <li key={ev.id} className="relative pb-6 last:pb-0">
              <span
                className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary/80"
                aria-hidden
              />
              <div className="pl-2">
                <time className="text-sm font-medium leading-none text-foreground" dateTime={ev.created_at}>
                  {headerLabel}
                </time>
                {rows.length > 0 ? (
                  <dl className="mt-2 space-y-1">
                    {rows.map((row, j) => (
                      <div key={j} className="flex flex-wrap gap-x-2 gap-y-0.5 text-muted-foreground">
                        <dt className="text-xs font-medium text-foreground/70">{row.label}</dt>
                        <dd className="min-w-0 flex-1 text-xs">
                          <PayloadValue value={row.value} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

DocumentTimeline.propTypes = {
  events: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      event_type: PropTypes.string,
      created_at: PropTypes.string,
      actor_user_id: PropTypes.string,
      payload: PropTypes.object,
    })
  ),
  className: PropTypes.string,
};
