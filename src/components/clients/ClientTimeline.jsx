import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Receipt, Wallet } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";

function iconFor(kind) {
  if (kind === "payment") return Wallet;
  if (kind === "quote") return Receipt;
  return FileText;
}

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    const d = parseISO(iso);
    return isValid(d) ? format(d, "MMM d, yyyy · HH:mm") : "—";
  } catch {
    return "—";
  }
}

/** @param {{ events: { id: string, kind: string, label: string, sub?: string, at: string, href: string }[] }} props */
export default function ClientTimeline({ events }) {
  const list = Array.isArray(events) ? events.slice(0, 40) : [];

  return (
    <Card className="bg-white shadow-lg border-0">
      <CardHeader className="border-b border-slate-100">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Receipt className="w-5 h-5 text-primary" aria-hidden />
          Activity timeline
        </CardTitle>
        <p className="text-sm text-muted-foreground font-normal">
          Invoices, quotes, and payments for this client (newest first).
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {list.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-600">No activity yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((ev) => {
              const Icon = iconFor(ev.kind);
              return (
                <li key={ev.id}>
                  <Link
                    to={ev.href}
                    className="flex gap-3 p-4 hover:bg-slate-50/80 transition-colors items-start min-w-0"
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 leading-snug">{ev.label}</p>
                      {ev.sub ? (
                        <p className="text-sm text-slate-600 truncate mt-0.5">{ev.sub}</p>
                      ) : null}
                      <p className="text-xs text-slate-400 mt-1 tabular-nums">{formatWhen(ev.at)}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
