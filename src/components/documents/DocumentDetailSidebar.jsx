import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { documentStatusBadgeVariant } from "@/document-engine/documentUi";
import { typeLabel } from "@/document-engine";
import { DocumentTypeIcon } from "./documentIcon";
import { createPageUrl } from "@/utils";

function fmtDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Right sidebar for document detail: status, assignee, client, linked docs, dates.
 */
export default function DocumentDetailSidebar({
  doc,
  clients = [],
  onClientChange,
  saving = false,
}) {
  if (!doc) return null;
  const isArchived = Boolean(doc.archived_at);
  const statusLabel = isArchived ? "archived" : doc.status;

  return (
    <aside className="space-y-5 rounded-xl border border-border bg-card p-4 shadow-sm ring-1 ring-border/40 lg:sticky lg:top-6">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">Document</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1 capitalize">
            <DocumentTypeIcon type={doc.type} className="h-3 w-3" />
            {typeLabel(doc.type)}
          </Badge>
          <Badge variant={documentStatusBadgeVariant(statusLabel)} className="capitalize">
            {statusLabel}
          </Badge>
        </div>
      </div>

      <Separator />

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

      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Assigned</dt>
          <dd className="mt-0.5 font-medium">{doc.assigned_user_id ? "Team member" : "Unassigned"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Created</dt>
          <dd className="mt-0.5">{fmtDateTime(doc.created_at)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last updated</dt>
          <dd className="mt-0.5">{fmtDateTime(doc.updated_at)}</dd>
        </div>
      </dl>

      {doc.linked_documents?.length ? (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold">Linked documents</h3>
            <ul className="mt-2 space-y-2">
              {doc.linked_documents.map((link) => (
                <li key={link.link_id}>
                  <Link
                    to={`${createPageUrl("Documents")}/${encodeURIComponent(link.document?.id || "")}`}
                    className="block rounded-md border border-border/60 px-2.5 py-2 text-sm transition-colors hover:bg-muted/50"
                  >
                    <span className="font-medium">{link.document?.title || "Untitled"}</span>
                    <span className="mt-0.5 block text-xs capitalize text-muted-foreground">
                      {typeLabel(link.document?.type)} · {link.relation?.replace(/_/g, " ")}
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
            to={`${createPageUrl("Documents")}/${encodeURIComponent(doc.source_quote_id)}`}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            View original quote
          </Link>
        </>
      ) : null}
    </aside>
  );
}
