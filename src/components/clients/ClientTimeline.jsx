import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { format, formatDistanceToNow, isToday, isYesterday, parseISO, isValid } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  FileText,
  Filter,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Send,
  StickyNote,
  User,
  Wallet,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/components/CurrencySelector";
import {
  CLIENT_TIMELINE_FILTERS,
  CLIENT_TIMELINE_CATEGORY,
  MANUAL_RELATIONSHIP_EVENT_TYPES,
} from "@shared/clients/clientRelationshipTimeline.js";
import {
  archiveClientTimelineNote,
  buildClientTimelineEvents,
  createClientRelationshipEvent,
  createClientTimelineNote,
  fetchClientRelationshipTimeline,
  updateClientTimelineNote,
} from "@/services/ClientTimelineService";
import { useToast } from "@/components/ui/use-toast";

const FILTER_LABELS = {
  all: "All",
  documents: "Documents",
  quotes: "Quotes",
  invoices: "Invoices",
  payments: "Payments",
  communication: "Communication",
  reminders: "Reminders",
  notes: "Notes",
  client_changes: "Client changes",
};

const INTERACTION_LABELS = {
  follow_up_required: "Follow-up required",
  client_contacted: "Client contacted",
  meeting_held: "Meeting held",
  call_completed: "Call completed",
  revision_requested: "Requested revision",
  new_quote_requested: "Requested new quote",
  payment_extension_requested: "Requested payment extension",
};

function iconFor(eventType, documentType) {
  const type = String(eventType || "");
  if (type.startsWith("note_")) return StickyNote;
  if (type.startsWith("email_") || type.startsWith("message_") || type === "reminded") return Mail;
  if (type === "paid" || type.startsWith("payment_")) return Wallet;
  if (type === "accepted") return CheckCircle2;
  if (type === "rejected" || type === "payment_failed" || type === "overdue") return XCircle;
  if (type === "opened" || type === "viewed" || type === "viewed_not_paid") return Eye;
  if (type === "sent") return Send;
  if (type === "clicked") return RefreshCw;
  if (documentType === "quote") return Receipt;
  if (type.startsWith("client_") || MANUAL_RELATIONSHIP_EVENT_TYPES.includes(type)) return User;
  return FileText;
}

function ringFor(eventType) {
  const type = String(eventType || "");
  if (type === "paid" || type === "accepted") return "bg-emerald-500";
  if (type === "payment_failed" || type === "rejected" || type === "overdue") return "bg-destructive";
  if (type.startsWith("payment_")) return "bg-amber-500";
  if (type === "sent" || type === "reminded") return "bg-orange-500";
  if (type === "opened" || type === "clicked") return "bg-sky-500";
  if (type.startsWith("note_")) return "bg-amber-600";
  return "bg-primary";
}

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    const d = typeof iso === "string" ? parseISO(iso) : new Date(iso);
    if (!isValid(d)) return "—";
    if (isToday(d)) return `Today · ${format(d, "HH:mm")}`;
    if (isYesterday(d)) return `Yesterday · ${format(d, "HH:mm")}`;
    return format(d, "d MMM yyyy · HH:mm");
  } catch {
    return "—";
  }
}

function relativeLabel(iso) {
  if (!iso) return "—";
  try {
    const d = parseISO(iso);
    if (!isValid(d)) return "—";
    if (isToday(d)) return "Today";
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return "—";
  }
}

function EventRow({ event, currency, canMutate, onEditNote, onArchiveNote }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(event.metadata?.preview || "");
  const Icon = iconFor(event.eventType, event.documentType);
  const amount =
    event.amount != null && Number.isFinite(Number(event.amount))
      ? formatCurrency(event.amount, event.currency || currency)
      : null;
  const metaRows = [
    event.metadata?.recipient ? ["Recipient", event.metadata.recipient] : null,
    event.metadata?.channel ? ["Channel", String(event.metadata.channel)] : null,
    event.metadata?.subject ? ["Subject", event.metadata.subject] : null,
    event.metadata?.from && event.metadata?.to ? ["Changed", `${event.metadata.from} → ${event.metadata.to}`] : null,
    event.metadata?.payment_reference ? ["Reference", event.metadata.payment_reference] : null,
    event.metadata?.note ? ["Note", event.metadata.note] : null,
  ].filter(Boolean);

  const inner = (
    <>
      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white ${ringFor(event.eventType)}`}>
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900 leading-snug">{event.title}</p>
        {amount ? <p className="text-sm font-semibold text-slate-800 mt-0.5 tabular-nums">{amount}</p> : null}
        {event.description && event.description !== event.title ? (
          <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap">{event.description}</p>
        ) : null}
        <p className="text-xs text-slate-400 mt-1 tabular-nums">
          {formatWhen(event.occurredAt)}
          {event.actorLabel ? ` · ${event.actorLabel}` : ""}
        </p>
        {open && metaRows.length ? (
          <dl className="mt-2 grid gap-1 text-xs text-slate-600">
            {metaRows.map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="text-slate-400 shrink-0">{label}</dt>
                <dd className="min-w-0 break-words">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {editing ? (
          <div className="mt-2 space-y-2">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  await onEditNote(event.noteId, draft);
                  setEditing(false);
                }}
              >
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );

  return (
    <li>
      <div className="flex gap-3 p-4 items-start min-w-0">
        {event.href ? (
          <Link to={event.href} className="flex gap-3 min-w-0 flex-1 hover:opacity-90">
            {inner}
          </Link>
        ) : (
          <div className="flex gap-3 min-w-0 flex-1">{inner}</div>
        )}
        <div className="flex shrink-0 flex-col gap-1">
          {metaRows.length ? (
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => setOpen((v) => !v)}>
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </Button>
          ) : null}
          {canMutate && event.noteId && event.eventType === "note_added" ? (
            <>
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-destructive" onClick={() => onArchiveNote(event.noteId)}>
                Archive
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function GroupRow({ group, currency, canMutate, onEditNote, onArchiveNote }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-slate-100">
      <button
        type="button"
        className="flex w-full items-start gap-3 p-4 text-left hover:bg-slate-50/80"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700">
          <FileText className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900">{group.title}</p>
          <p className="text-sm text-slate-600 mt-0.5">
            {group.documentNumber ? `#${group.documentNumber} · ` : ""}
            {group.events.length} events · {formatWhen(group.occurredAt)}
          </p>
          {!open ? (
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {group.events.slice(0, 3).map((ev) => (
                <li key={ev.id}>✓ {ev.title}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <ChevronDown className={`h-4 w-4 mt-2 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <ul className="bg-slate-50/60 divide-y divide-slate-100">
          {group.events.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              currency={currency}
              canMutate={canMutate}
              onEditNote={onEditNote}
              onArchiveNote={onArchiveNote}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default function ClientTimeline({
  clientId,
  currency = "ZAR",
  invoices = [],
  quotes = [],
  payments = [],
}) {
  const { toast } = useToast();
  const [category, setCategory] = useState(CLIENT_TIMELINE_CATEGORY.ALL);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [payload, setPayload] = useState(null);
  const [events, setEvents] = useState([]);
  const [noteBody, setNoteBody] = useState("");
  const [interactionType, setInteractionType] = useState("follow_up_required");
  const [interactionNote, setInteractionNote] = useState("");
  const [composer, setComposer] = useState(null);
  const [saving, setSaving] = useState(false);
  const fallbackRef = useRef({ invoices, quotes, payments, currency });
  fallbackRef.current = { invoices, quotes, payments, currency };

  const load = useCallback(
    async ({ before = null, append = false } = {}) => {
      if (!clientId) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const data = await fetchClientRelationshipTimeline(clientId, {
          category,
          q: search,
          from: from ? new Date(from).toISOString() : null,
          to: to ? new Date(`${to}T23:59:59`).toISOString() : null,
          before,
        });
        setPayload(data);
        setEvents((prev) => (append ? [...prev, ...(data.events || [])] : data.events || []));
      } catch {
        if (!append) {
          const fb = fallbackRef.current;
          setEvents(
            buildClientTimelineEvents({
              invoices: fb.invoices,
              quotes: fb.quotes,
              payments: fb.payments,
              currency: fb.currency,
            }).map((item) => ({
              ...item,
              kind: "event",
            }))
          );
          setPayload({
            summary: null,
            attention: [],
            signals: [],
            permissions: { canViewNotes: false, canMutate: false },
            page: { hasMore: false },
          });
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [clientId, category, search, from, to]
  );

  useEffect(() => {
    const t = setTimeout(() => load({ append: false }), 200);
    return () => clearTimeout(t);
  }, [load]);

  const summary = payload?.summary;
  const attention = payload?.attention || [];
  const signals = payload?.signals || [];
  const canMutate = Boolean(payload?.permissions?.canMutate);
  const canViewNotes = Boolean(payload?.permissions?.canViewNotes);

  const healthCells = useMemo(() => {
    if (!summary) return [];
    return [
      ["Total invoiced", formatCurrency(summary.totalInvoiced, currency)],
      ["Total paid", formatCurrency(summary.totalPaid, currency)],
      ["Outstanding", formatCurrency(summary.outstanding, currency)],
      ["Overdue", formatCurrency(summary.overdue, currency)],
      ["Quotes", `${summary.quotes} · ${summary.quotesAccepted} accepted`],
      ["Invoices", `${summary.invoices} · ${summary.invoicesPaid} paid`],
      ["Last activity", relativeLabel(summary.lastActivityAt)],
      ["Last payment", relativeLabel(summary.lastPaymentAt)],
    ];
  }, [summary, currency]);

  const refresh = () => load({ append: false });

  const handleCreateNote = async () => {
    if (!noteBody.trim()) return;
    setSaving(true);
    try {
      await createClientTimelineNote(clientId, noteBody);
      setNoteBody("");
      setComposer(null);
      await refresh();
    } catch (err) {
      toast({ title: "Could not save note", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleInteraction = async () => {
    setSaving(true);
    try {
      await createClientRelationshipEvent(clientId, {
        event_type: interactionType,
        note: interactionNote,
      });
      setInteractionNote("");
      setComposer(null);
      await refresh();
    } catch (err) {
      toast({ title: "Could not log interaction", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-white shadow-lg border-0">
      <CardHeader className="border-b border-slate-100 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="w-5 h-5 text-primary" aria-hidden />
              Relationship timeline
            </CardTitle>
            <p className="text-sm text-muted-foreground font-normal mt-1">
              Everything that has happened with this client, newest first.
            </p>
          </div>
          {canMutate ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setComposer(composer === "note" ? null : "note")}>
                <StickyNote className="w-4 h-4 mr-1.5" />
                Add note
              </Button>
              <Button size="sm" variant="outline" onClick={() => setComposer(composer === "event" ? null : "event")}>
                <Plus className="w-4 h-4 mr-1.5" />
                Log interaction
              </Button>
            </div>
          ) : null}
        </div>

        {healthCells.length ? (
          <div>
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase mb-2">Client health</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {healthCells.map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="text-sm font-semibold text-slate-900 mt-0.5">{value}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {signals.length ? (
          <div className="flex flex-wrap gap-2">
            {signals.map((signal) => (
              <Badge key={signal.id} variant="secondary" className="font-normal">
                {signal.label}
              </Badge>
            ))}
          </div>
        ) : null}

        {attention.length ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 flex items-center gap-1.5 mb-2">
              <AlertTriangle className="h-3.5 w-3.5" />
              Attention
            </p>
            <ul className="space-y-1">
              {attention.map((item) => (
                <li key={item.id}>
                  {item.href ? (
                    <Link to={item.href} className="text-sm text-amber-950 hover:underline">
                      {item.label}
                    </Link>
                  ) : (
                    <span className="text-sm text-amber-950">{item.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {composer === "note" && canViewNotes ? (
          <div className="rounded-xl border border-slate-200 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase text-slate-500">Internal note</p>
            <Textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Visible only to your team — never on invoices, quotes, or the client portal."
              rows={3}
            />
            <Button size="sm" onClick={handleCreateNote} disabled={saving || !noteBody.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save note
            </Button>
          </div>
        ) : null}

        {composer === "event" && canMutate ? (
          <div className="rounded-xl border border-slate-200 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase text-slate-500">Log interaction</p>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={interactionType}
              onChange={(e) => setInteractionType(e.target.value)}
            >
              {MANUAL_RELATIONSHIP_EVENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {INTERACTION_LABELS[type] || type}
                </option>
              ))}
            </select>
            <Textarea
              value={interactionNote}
              onChange={(e) => setInteractionNote(e.target.value)}
              placeholder="Optional internal detail"
              rows={2}
            />
            <Button size="sm" onClick={handleInteraction} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save
            </Button>
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {CLIENT_TIMELINE_FILTERS.map((key) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={category === key ? "default" : "outline"}
                className="rounded-full h-8"
                onClick={() => setCategory(key)}
              >
                {FILTER_LABELS[key] || key}
              </Button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="Search invoice, quote, payment, note…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400 hidden sm:block" />
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-8 flex items-center justify-center text-sm text-slate-500 gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading relationship history…
          </div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-600">No activity yet for this filter.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {events.map((item) =>
              item.kind === "group" ? (
                <GroupRow
                  key={item.id}
                  group={item}
                  currency={currency}
                  canMutate={canMutate}
                  onEditNote={async (id, body) => {
                    await updateClientTimelineNote(id, body);
                    await refresh();
                  }}
                  onArchiveNote={async (id) => {
                    await archiveClientTimelineNote(id);
                    await refresh();
                  }}
                />
              ) : (
                <EventRow
                  key={item.id}
                  event={item}
                  currency={currency}
                  canMutate={canMutate}
                  onEditNote={async (id, body) => {
                    await updateClientTimelineNote(id, body);
                    await refresh();
                  }}
                  onArchiveNote={async (id) => {
                    await archiveClientTimelineNote(id);
                    await refresh();
                  }}
                />
              )
            )}
          </ul>
        )}
        {payload?.page?.hasMore ? (
          <div className="p-4 border-t border-slate-100">
            <Button
              variant="outline"
              className="w-full"
              disabled={loadingMore}
              onClick={() => load({ before: payload.page.nextBefore, append: true })}
            >
              {loadingMore ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Load earlier activity
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
