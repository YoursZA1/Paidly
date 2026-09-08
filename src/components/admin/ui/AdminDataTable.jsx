import { Link } from "react-router-dom";
import StatusBadge from "@/components/dashboard/StatusBadge";
import { formatAdminDate, formatAdminZar } from "./adminFormat";
import { AdminEmptyState, AdminErrorState, AdminLoadingState, AdminUnavailableState } from "./AdminStates";
import { cn } from "@/lib/utils";

function cellValue(row, column) {
  const raw = row?.[column.key];
  if (column.type === "money") return formatAdminZar(raw);
  if (column.type === "date") return formatAdminDate(raw);
  if (column.type === "status") return <StatusBadge status={String(raw || "none")} />;
  if (raw == null || raw === "") return "—";
  return raw;
}

export default function AdminDataTable({
  columns = [],
  rows = [],
  isLoading = false,
  errorMessage = null,
  unavailable = false,
  unavailableReason = null,
  emptyTitle,
  emptyDescription,
  onRetry,
}) {
  if (isLoading) return <AdminLoadingState />;
  if (errorMessage) return <AdminErrorState message={errorMessage} onRetry={onRetry} />;
  if (unavailable) return <AdminUnavailableState reason={unavailableReason} />;
  if (!rows.length) return <AdminEmptyState title={emptyTitle} description={emptyDescription} />;

  return (
    <>
      <div className="space-y-3 p-4 sm:hidden">
        {rows.map((row) => (
          <article key={row.id} className="rounded-xl border border-border bg-card p-3">
            <p className="text-sm font-medium">{row.title || row.business || row.id}</p>
            {row.subtitle ? <p className="text-xs text-muted-foreground">{row.subtitle}</p> : null}
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              {columns.slice(1, 5).map((col) => (
                <div key={col.key}>
                  <dt className="text-muted-foreground">{col.label}</dt>
                  <dd className="mt-0.5">{cellValue(row, col)}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              {columns.map((col) => (
                <th key={col.key} className={cn("px-4 py-2.5 text-left font-medium", col.align === "right" && "text-right")}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                {columns.map((col) => (
                  <td key={col.key} className={cn("px-4 py-3 text-sm", col.align === "right" && "text-right tabular-nums")}>
                    {col.key === "title" && row.href ? (
                      <Link to={row.href} className="font-medium text-foreground hover:text-primary">
                        {cellValue(row, col)}
                      </Link>
                    ) : (
                      cellValue(row, col)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
