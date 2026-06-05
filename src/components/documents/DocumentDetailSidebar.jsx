import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { documentStatusBadgeVariant } from "@/document-engine/documentUi";
import { typeLabel } from "@/document-engine";
import { DocumentTypeIcon } from "./documentIcon";
import { createPageUrl } from "@/utils";
import { CheckCircle2, Clock, AlertTriangle, Mail } from "lucide-react";

function fmtDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function memberLabel(members, userId) {
  if (!userId) return "Unassigned";
  const m = members.find((x) => x.user_id === userId);
  return m?.label || "Team member";
}

function SignerStatusIcon({ status }) {
  if (status === "signed")
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (status === "declined")
    return <AlertTriangle className="h-3.5 w-3.5 text-destructive" />;
  if (status === "viewed")
    return <Clock className="h-3.5 w-3.5 text-amber-500" />;
  return <Mail className="h-3.5 w-3.5 text-muted-foreground" />;
}

/**
 * Right sidebar for document detail: type/status, assignee, client, delivery info,
 * signature info, linked docs, and dates.
 */
export default function DocumentDetailSidebar({
  doc,
  clients = [],
  members = [],
  assigneesEnabled = true,
  sends = [],
  signatures = [],
  onClientChange,
  onAssigneeChange,
  saving = false,
}) {
  if (!doc) return null;
  const isArchived = Boolean(doc.archived_at);
  const statusLabel = isArchived ? "archived" : doc.status;

  const latestSend = sends[0] ?? null;
  const openCount = sends.filter((s) => s.opened_at).length;
  const downloadCount = sends.filter((s) => s.downloaded_at).length;
  const allSigned =
    signatures.length > 0 && signatures.every((s) => s.status === "signed");

  return (
    <aside className="space-y-5 rounded-xl border border-border bg-card p-4 shadow-sm ring-1 ring-border/40 lg:sticky lg:top-6">
      {/* ── Document type + status ── */}
      <div>
        <h2 className="text-sm font-semibold tracking-tight">Document</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1 capitalize">
            <DocumentTypeIcon type={doc.type} className="h-3 w-3" />
            {typeLabel(doc.type)}
          </Badge>
          <Badge
            variant={documentStatusBadgeVariant(statusLabel)}
            className="capitalize"
          >
            {statusLabel}
          </Badge>
          {doc.signature_status && doc.signature_status !== "draft" && (
            <Badge variant="outline" className="capitalize text-muted-foreground">
              {String(doc.signature_status).replace(/_/g, " ")}
            </Badge>
          )}
        </div>
      </div>

      <Separator />

      {/* ── Client ── */}
      <div className="space-y-2">
        <Label htmlFor="sidebar-client">Client</Label>
        <Select
          value={doc.client_id || "none"}
          onValueChange={(v) => onClientChange?.(v === "none" ? null : v)}
          disabled={saving}
        >
          <SelectTrigger id="sidebar-client">
            <SelectValue placeholder="No client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No client</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name || c.company || c.email || c.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Assignee ── */}
      <div className="space-y-2">
        <Label htmlFor="sidebar-assignee">Assigned to</Label>
        {assigneesEnabled ? (
          <Select
            value={doc.assigned_user_id || "none"}
            onValueChange={(v) => onAssigneeChange?.(v === "none" ? null : v)}
            disabled={saving}
          >
            <SelectTrigger id="sidebar-assignee">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm text-muted-foreground">
            {memberLabel(members, doc.assigned_user_id)}
          </p>
        )}
      </div>

      {/* ── Document dates ── */}
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Created</dt>
          <dd className="mt-0.5">{fmtDateTime(doc.created_at)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last updated</dt>
          <dd className="mt-0.5">{fmtDateTime(doc.updated_at)}</dd>
        </div>
        {doc.archived_at ? (
          <div>
            <dt className="text-muted-foreground">Archived</dt>
            <dd className="mt-0.5">{fmtDateTime(doc.archived_at)}</dd>
          </div>
        ) : null}
      </dl>

      {/* ── Delivery information ── */}
      {(latestSend || sends.length > 0) && (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold">Delivery</h3>
            <dl className="mt-3 space-y-3 text-sm">
              {latestSend && (
                <div>
                  <dt className="text-muted-foreground">
                    {latestSend.status === "scheduled"
                      ? "Scheduled for"
                      : "Last sent"}
                  </dt>
                  <dd className="mt-0.5">
                    {latestSend.status === "scheduled" && latestSend.scheduled_at
                      ? fmtDateTime(latestSend.scheduled_at)
                      : fmtDateTime(latestSend.sent_at)}
                  </dd>
                  {latestSend.recipient_email && (
                    <dd className="mt-0.5 truncate text-xs text-muted-foreground">
                      {latestSend.recipient_name
                        ? `${latestSend.recipient_name} · ${latestSend.recipient_email}`
                        : latestSend.recipient_email}
                    </dd>
                  )}
                </div>
              )}
              {latestSend?.opened_at && (
                <div>
                  <dt className="text-muted-foreground">Opened</dt>
                  <dd className="mt-0.5">{fmtDateTime(latestSend.opened_at)}</dd>
                </div>
              )}
              {(openCount > 0 || downloadCount > 0) && (
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {openCount > 0 && (
                    <span>
                      {openCount} open{openCount !== 1 ? "s" : ""}
                    </span>
                  )}
                  {downloadCount > 0 && (
                    <span>
                      {downloadCount} download{downloadCount !== 1 ? "s" : ""}
                    </span>
                  )}
                  <span>
                    {sends.length} send{sends.length !== 1 ? "s" : ""} total
                  </span>
                </div>
              )}
            </dl>
          </div>
        </>
      )}

      {/* ── Signature information ── */}
      {signatures.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold">
              Signatures
              {allSigned && (
                <CheckCircle2 className="ml-1.5 inline h-3.5 w-3.5 text-emerald-500" />
              )}
            </h3>
            <ul className="mt-3 space-y-2">
              {signatures.map((sig) => (
                <li
                  key={sig.id}
                  className="flex items-start gap-2 text-sm"
                >
                  <SignerStatusIcon status={sig.status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium leading-none">
                      {sig.signer_name || sig.signer_email}
                    </p>
                    {sig.signer_name && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {sig.signer_email}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                      {String(sig.status).replace(/_/g, " ")}
                      {sig.signed_at ? ` · ${fmtDateTime(sig.signed_at)}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {/* ── Linked documents ── */}
      {doc.linked_documents?.length ? (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold">Linked documents</h3>
            <ul className="mt-2 space-y-2">
              {doc.linked_documents.map((link) => (
                <li key={link.link_id}>
                  <Link
                    to={`${createPageUrl("Documents")}/${encodeURIComponent(
                      link.document?.id || ""
                    )}`}
                    className="block rounded-md border border-border/60 px-2.5 py-2 text-sm transition-colors hover:bg-muted/50"
                  >
                    <span className="font-medium">
                      {link.document?.title || "Untitled"}
                    </span>
                    <span className="mt-0.5 block text-xs capitalize text-muted-foreground">
                      {typeLabel(link.document?.type)} ·{" "}
                      {link.relation?.replace(/_/g, " ")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      {doc.source_quote_id ? (
        <>
          <Separator />
          <Link
            to={`${createPageUrl("Documents")}/${encodeURIComponent(
              doc.source_quote_id
            )}`}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            View original quote
          </Link>
        </>
      ) : null}
    </aside>
  );
}
