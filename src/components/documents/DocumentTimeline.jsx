import PropTypes from "prop-types";
import { Link } from "react-router-dom";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";
import { formatDocumentEventType, summarizeDocumentEventPayload } from "@/document-engine/documentEventLabels";
import { createPageUrl } from "@/utils";
import { cn } from "@/lib/utils";
import {
  FilePlus,
  Pencil,
  Send,
  Eye,
  CheckCircle2,
  DollarSign,
  ArrowRightLeft,
  Archive,
  ArchiveRestore,
  Paperclip,
  MessageSquare,
  FileDown,
  Download,
  PenLine,
  ShieldCheck,
  XCircle,
  RefreshCw,
  GitBranch,
  FileText,
} from "lucide-react";

/** Icon + colour palette per event type */
const EVENT_META = {
  created:                 { Icon: FilePlus,       ring: "bg-blue-500",      label: "created" },
  updated:                 { Icon: Pencil,          ring: "bg-zinc-400",      label: "updated" },
  sent:                    { Icon: Send,            ring: "bg-orange-500",    label: "sent" },
  viewed:                  { Icon: Eye,             ring: "bg-sky-500",       label: "viewed" },
  accepted:                { Icon: CheckCircle2,    ring: "bg-emerald-500",   label: "accepted" },
  paid:                    { Icon: DollarSign,      ring: "bg-emerald-600",   label: "paid" },
  converted:               { Icon: ArrowRightLeft,  ring: "bg-violet-500",    label: "converted" },
  created_from_quote:      { Icon: GitBranch,       ring: "bg-violet-400",    label: "converted" },
  created_from_conversion: { Icon: GitBranch,       ring: "bg-violet-400",    label: "converted" },
  status_changed:          { Icon: RefreshCw,       ring: "bg-zinc-400",      label: "status" },
  archived:                { Icon: Archive,         ring: "bg-zinc-400",      label: "archived" },
  unarchived:              { Icon: ArchiveRestore,  ring: "bg-zinc-400",      label: "restored" },
  attachment_added:        { Icon: Paperclip,       ring: "bg-zinc-400",      label: "attachment" },
  comment_added:           { Icon: MessageSquare,   ring: "bg-zinc-400",      label: "comment" },
  // PDF workflow
  pdf_generated:           { Icon: FileDown,        ring: "bg-blue-400",      label: "pdf" },
  pdf_downloaded:          { Icon: Download,        ring: "bg-blue-500",      label: "pdf" },
  sent_to_client:          { Icon: Send,            ring: "bg-orange-500",    label: "sent" },
  signature_requested:     { Icon: PenLine,         ring: "bg-violet-500",    label: "signature" },
  signature_viewed:        { Icon: Eye,             ring: "bg-violet-400",    label: "signature" },
  signature_completed:     { Icon: ShieldCheck,     ring: "bg-emerald-500",   label: "signature" },
  signature_declined:      { Icon: XCircle,         ring: "bg-destructive",   label: "signature" },
};

const FALLBACK_META = { Icon: FileText, ring: "bg-zinc-300", label: "event" };

function getEventMeta(eventType) {
  return EVENT_META[String(eventType || "")] ?? FALLBACK_META;
}

function isLikelyUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
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

PayloadValue.propTypes = { value: PropTypes.string };

function formatEventDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  if (isToday(d)) return `Today · ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `Yesterday · ${format(d, "HH:mm")}`;
  const diff = Date.now() - d.getTime();
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    return `${formatDistanceToNow(d, { addSuffix: true })}`;
  }
  return format(d, "MMM d, yyyy · HH:mm");
}

/**
 * Chronological activity feed for document_events (newest-first ordering from DocumentService).
 */
export function DocumentTimeline({ events, className }) {
  const list = Array.isArray(events) ? events : [];

  if (!list.length) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-8 text-center",
          className
        )}
      >
        <p className="text-sm text-muted-foreground">
          No activity yet. Saving, sending, or changing status will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight">Activity</h3>
        <span className="text-xs text-muted-foreground">
          {list.length} event{list.length !== 1 ? "s" : ""}
        </span>
      </div>

      <ol className="relative space-y-0 pl-6">
        {/* Vertical rule */}
        <li
          aria-hidden
          className="pointer-events-none absolute bottom-2 left-[10px] top-2 w-px bg-border/70"
        />

        {list.map((ev) => {
          const { Icon, ring } = getEventMeta(ev.event_type);
          const rows = summarizeDocumentEventPayload(ev.payload);
          const dateLabel = formatEventDate(ev.created_at);

          return (
            <li key={ev.id} className="relative pb-6 last:pb-0">
              {/* Coloured icon dot */}
              <span
                className={cn(
                  "absolute -left-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-background",
                  ring
                )}
                aria-hidden
              >
                <Icon className="h-2.5 w-2.5 text-white" />
              </span>

              <div className="min-w-0 pl-2">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-medium leading-none text-foreground">
                    {formatDocumentEventType(ev.event_type)}
                  </span>
                  {dateLabel && (
                    <time
                      className="text-xs text-muted-foreground"
                      dateTime={ev.created_at}
                    >
                      {dateLabel}
                    </time>
                  )}
                </div>

                {rows.length > 0 && (
                  <dl className="mt-1.5 space-y-0.5">
                    {rows.map((row, j) => (
                      <div
                        key={j}
                        className="flex flex-wrap gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground"
                      >
                        <dt className="font-medium text-foreground/60">
                          {row.label}:
                        </dt>
                        <dd className="min-w-0 flex-1">
                          <PayloadValue value={row.value} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
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
