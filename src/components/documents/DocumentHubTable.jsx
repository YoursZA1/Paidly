/**
 * Business-hub document table: type, title, client, status, dates, owner, value, and an actions menu.
 * Presentational — all data/handlers come from the Documents page. Supports row selection for bulk
 * actions, a loading skeleton, and an empty state.
 */
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  ExternalLink,
  Copy,
  ArrowRightLeft,
  Archive,
  ArchiveRestore,
  Trash2,
  FileText,
} from "lucide-react";
import {
  typeLabel,
  isFinancialType,
  documentStatusBadgeVariant,
  getConversionOptions,
} from "@/document-engine";
import { DOCUMENT_TYPES } from "@/document-engine/documentTypes";
import { QUOTE_STATUSES } from "@/document-engine/documentStateMachine";
import { formatCurrency } from "@/utils/currencyCalculations";
import { DocumentTypeIcon } from "./documentIcon";

const COLUMN_COUNT = 10;

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function StatusBadge({ status, archived }) {
  if (archived) return <Badge variant="outline">Archived</Badge>;
  const label = String(status || "draft").replace(/_/g, " ");
  return (
    <Badge variant={documentStatusBadgeVariant(status)} className="capitalize">
      {label}
    </Badge>
  );
}

function ValueCell({ row }) {
  if (!isFinancialType(row.type)) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="tabular-nums">
      {formatCurrency(Number(row.total_amount || 0), row.currency || "ZAR")}
    </span>
  );
}

export default function DocumentHubTable({
  rows = [],
  loading = false,
  selectedIds = new Set(),
  onToggleSelect,
  onToggleSelectAll,
  onOpen,
  onAction,
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const someSelected = rows.some((r) => selectedIds.has(r.id));

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <div className="space-y-px p-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-2 py-3">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-48 flex-1" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <EmptyState
          icon={<FileText className="h-6 w-6 text-muted-foreground" />}
          title="No documents found"
          description="Try clearing filters or create your first document with the New Document button."
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-10">
              <Checkbox
                aria-label="Select all"
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={(v) => onToggleSelectAll?.(Boolean(v))}
              />
            </TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="hidden md:table-cell">Client</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden lg:table-cell">Created</TableHead>
            <TableHead className="hidden xl:table-cell">Owner</TableHead>
            <TableHead className="hidden lg:table-cell">Updated</TableHead>
            <TableHead className="text-right">Value</TableHead>
            <TableHead className="w-12 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const conversions = getConversionOptions(row.type).filter((opt) => {
              if (row.type === DOCUMENT_TYPES.quote && opt.targetType === "invoice") {
                return row.status === QUOTE_STATUSES.accepted;
              }
              return row.status !== "archived" && !row.archived_at;
            });
            const isArchived = Boolean(row.archived_at);
            return (
              <TableRow key={row.id} className="group">
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    aria-label={`Select ${row.title || row.document_number || "document"}`}
                    checked={selectedIds.has(row.id)}
                    onCheckedChange={() => onToggleSelect?.(row.id)}
                  />
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => onOpen?.(row)}
                    className="flex items-center gap-2 text-left"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <DocumentTypeIcon type={row.type} className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-medium">{typeLabel(row.type)}</span>
                  </button>
                </TableCell>
                <TableCell className="max-w-[280px]">
                  <button
                    type="button"
                    onClick={() => onOpen?.(row)}
                    className="block truncate text-left font-medium hover:underline"
                  >
                    {row.title || row.document_number || "Untitled document"}
                  </button>
                  {row.document_number ? (
                    <span className="block truncate text-xs text-muted-foreground">{row.document_number}</span>
                  ) : null}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <span className="text-sm text-muted-foreground">{row.client_name || "—"}</span>
                </TableCell>
                <TableCell>
                  <StatusBadge status={row.status} archived={isArchived} />
                </TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                  {fmtDate(row.created_at)}
                </TableCell>
                <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">
                  {row.assignee_name || "—"}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                  {fmtDate(row.updated_at)}
                </TableCell>
                <TableCell className="text-right">
                  <ValueCell row={row} />
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Document actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onSelect={() => onOpen?.(row)} className="gap-2">
                        <ExternalLink className="h-4 w-4" /> Open
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onAction?.("duplicate", row)} className="gap-2">
                        <Copy className="h-4 w-4" /> Duplicate
                      </DropdownMenuItem>
                      {conversions.length ? (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger className="gap-2">
                            <ArrowRightLeft className="h-4 w-4" /> Convert
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {conversions.map((opt) => (
                              <DropdownMenuItem
                                key={opt.targetType}
                                onSelect={() => onAction?.("convert", { ...row, _convertTarget: opt.targetType })}
                              >
                                {opt.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      ) : null}
                      <DropdownMenuSeparator />
                      {isArchived ? (
                        <DropdownMenuItem onSelect={() => onAction?.("unarchive", row)} className="gap-2">
                          <ArchiveRestore className="h-4 w-4" /> Restore
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={() => onAction?.("archive", row)} className="gap-2">
                          <Archive className="h-4 w-4" /> Archive
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onSelect={() => onAction?.("delete", row)}
                        className="gap-2 text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export { COLUMN_COUNT };
