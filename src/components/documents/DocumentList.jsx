import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { DocumentService } from "@/services/DocumentService";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LIST } from "@/document-engine/documentTypes";
import { documentStatusBadgeVariant, documentTypeBadgeVariant } from "@/document-engine/documentUi";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw } from "lucide-react";
import { getSupabaseErrorMessage, isSupabaseMissingRelationError } from "@/utils/supabaseErrorUtils";
import { createPageUrl } from "@/utils";
import { formatCurrency } from "@/utils/currencyCalculations";

const STATUS_OPTIONS = [
  "all",
  "draft",
  "sent",
  "paid",
  "accepted",
  "converted",
  "declined",
  "expired",
  "overdue",
  "cancelled",
];

function typeLabel(t) {
  return t === "all" ? "All types" : t.charAt(0).toUpperCase() + t.slice(1);
}

function statusLabel(s) {
  return s === "all" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1);
}

function TableSkeleton() {
  return (
    <tbody aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} className="border-b border-border/60">
          <td className="px-3 py-3">
            <Skeleton className="h-5 w-16" />
          </td>
          <td className="px-3 py-3">
            <Skeleton className="h-4 w-48 max-w-full" />
            <Skeleton className="mt-2 h-3 w-24" />
          </td>
          <td className="px-3 py-3">
            <Skeleton className="h-5 w-20" />
          </td>
          <td className="px-3 py-3 text-right">
            <Skeleton className="ml-auto h-4 w-24" />
          </td>
          <td className="px-3 py-3 text-right">
            <Skeleton className="ml-auto h-4 w-20" />
          </td>
          <td className="px-3 py-3 text-right">
            <Skeleton className="ml-auto h-4 w-12" />
          </td>
        </tr>
      ))}
    </tbody>
  );
}

/**
 * Org-scoped document table with type and status filters (unified `documents` table).
 */
export function DocumentList() {
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await DocumentService.list({
        type: type === "all" ? undefined : type,
        status: status === "all" ? undefined : status,
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      const msg = getSupabaseErrorMessage(e, "Could not load documents");
      setError(
        isSupabaseMissingRelationError(e?.cause || e)
          ? "The documents tables are not on this database yet. Apply migration `20260418220000_documents_engine_core.sql` (for example `supabase db push` or run the SQL in the Supabase dashboard)."
          : msg
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [type, status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-lg">Your documents</CardTitle>
          <CardDescription>Filter by type and lifecycle status. Open any row to edit, send, or convert.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-[min(100%,180px)]" aria-label="Filter by document type">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {DOCUMENT_TYPE_LIST.map((t) => (
                <SelectItem key={t} value={t}>
                  {typeLabel(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[min(100%,180px)]" aria-label="Filter by status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {statusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="icon" onClick={() => load()} disabled={loading} aria-label="Refresh list">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Type
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Title / number
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Status
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Total
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Updated
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            {loading ? (
              <TableSkeleton />
            ) : (
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                      No documents match these filters. Create one from the buttons above or adjust filters.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const updated = row.updated_at ? new Date(row.updated_at) : null;
                    const updatedLabel =
                      updated && !Number.isNaN(updated.getTime()) ? format(updated, "MMM d, yyyy") : "—";
                    return (
                      <tr key={row.id} className="border-b border-border/80 last:border-0 hover:bg-muted/30">
                        <td className="px-3 py-2">
                          <Badge variant={documentTypeBadgeVariant(row.type)} className="capitalize">
                            {row.type}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-foreground">{row.title || "Untitled"}</span>
                            {row.type === DOCUMENT_TYPES.invoice && row.source_quote_id ? (
                              <Badge variant="outline" className="text-[10px] font-normal uppercase tracking-wide">
                                From quote
                              </Badge>
                            ) : null}
                          </div>
                          {row.document_number ? (
                            <div className="font-mono text-xs text-muted-foreground">{row.document_number}</div>
                          ) : (
                            <div className="font-mono text-xs text-muted-foreground/80" title={row.id}>
                              {String(row.id).slice(0, 8)}…
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={documentStatusBadgeVariant(row.status)} className="capitalize">
                            {row.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-foreground">
                          {formatCurrency(row.total_amount ?? 0, row.currency || "ZAR")}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{updatedLabel}</td>
                        <td className="px-3 py-2 text-right">
                          <Button variant="link" className="h-auto p-0 font-medium" asChild>
                            <Link to={`${createPageUrl("Documents")}/${encodeURIComponent(row.id)}`}>Open</Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            )}
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
