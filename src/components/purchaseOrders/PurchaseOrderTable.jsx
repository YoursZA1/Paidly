import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Banknote, CheckCircle2, Eye, PackageCheck, Pencil, Send, XCircle } from "lucide-react";
import { formatCurrency } from "@/components/CurrencySelector";
import {
  PO_FINANCIAL_STATUS_LABEL,
  PO_STATUS_LABEL,
  canApprovePurchaseOrder,
  canCancelPurchaseOrder,
  canEditPurchaseOrder,
  canPayPurchaseOrder,
  canReceivePurchaseOrder,
  canSubmitPurchaseOrder,
  purchaseOrderFinancialStatus,
  purchaseOrderFinancials,
} from "@shared/procurement/purchaseOrderMath.js";
import { formatPoDate } from "./purchaseOrderDocumentModel";
import { PO_FINANCIAL_STATUS_TEXT, PO_STATUS_BADGE } from "./purchaseOrderBadges";

const shortDate = (value) => formatPoDate(value, "dd MMM yyyy") || "—";

function DueCell({ f }) {
  if (!f.dueDate) return <span className="text-muted-foreground">—</span>;
  if (f.owed <= 0) return <span className="text-muted-foreground">{shortDate(f.dueDate)}</span>;
  const tone = f.isOverdue
    ? "text-red-600 dark:text-red-400"
    : f.daysUntilDue <= 7
      ? "text-amber-700 dark:text-amber-400"
      : "text-muted-foreground";
  const when = f.isOverdue ? `${Math.abs(f.daysUntilDue)}d overdue` : f.daysUntilDue === 0 ? "Due today" : `in ${f.daysUntilDue}d`;
  return (
    <div>
      <div>{shortDate(f.dueDate)}</div>
      <div className={`text-xs ${tone}`}>{when}</div>
    </div>
  );
}

function ActionButton({ icon: Icon, label, poNumber, onClick, variant = "outline" }) {
  return (
    <Button size="sm" variant={variant} onClick={onClick} aria-label={`${label} ${poNumber}`} title={label}>
      <Icon className="w-4 h-4 2xl:mr-1" /> <span className="hidden 2xl:inline">{label}</span>
    </Button>
  );
}

/**
 * Purchase order list: what was ordered, from whom, its procurement and financial status, when payment
 * is due, the order total, what has been received and what is still outstanding. Actions follow the
 * order's state (the database refuses anything else).
 */
export default function PurchaseOrderTable({
  purchaseOrders = [],
  suppliersById,
  onView,
  onEdit,
  onSubmit,
  onApprove,
  onReceive,
  onPay,
  onCancel,
}) {
  if (purchaseOrders.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        No purchase orders here. Create one to commit spend with a supplier.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-2 sm:mx-0">
      <Table className="text-sm">
        <TableHeader>
          <TableRow>
            <TableHead>PO</TableHead>
            <TableHead className="hidden md:table-cell">Supplier</TableHead>
            <TableHead className="hidden sm:table-cell">Status</TableHead>
            <TableHead className="hidden 2xl:table-cell">Order date</TableHead>
            <TableHead className="hidden xl:table-cell">Expected</TableHead>
            <TableHead className="hidden lg:table-cell">Due</TableHead>
            <TableHead className="hidden xl:table-cell text-right">Items</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="hidden md:table-cell text-right">Received</TableHead>
            <TableHead className="hidden sm:table-cell text-right">Outstanding</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {purchaseOrders.map((po) => {
            const supplier = suppliersById?.get?.(po.supplier_id);
            const f = purchaseOrderFinancials(po);
            const fin = purchaseOrderFinancialStatus(po);
            const currency = po.currency || "ZAR";
            const committed = f.committed > 0;
            return (
              <TableRow key={po.id} className="cursor-pointer" onClick={() => onView(po)}>
                <TableCell>
                  <div className="font-medium whitespace-nowrap">{po.po_number}</div>
                  <div className="text-xs text-muted-foreground md:hidden truncate max-w-[9rem]">{supplier?.name || "No supplier"}</div>
                  <div className="sm:hidden mt-1 flex flex-wrap gap-1">
                    <Badge variant="outline" className={`font-normal ${PO_STATUS_BADGE[po.status] || ""}`}>
                      {PO_STATUS_LABEL[po.status] || po.status}
                    </Badge>
                    {f.isOverdue && (
                      <Badge variant="outline" className="font-normal border-transparent bg-red-500/10 text-red-700 dark:text-red-400">
                        Overdue
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell max-w-[12rem] truncate">{supplier?.name || "—"}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant="outline" className={`font-normal whitespace-nowrap ${PO_STATUS_BADGE[po.status] || ""}`}>
                    {PO_STATUS_LABEL[po.status] || po.status}
                  </Badge>
                  {fin !== "not_committed" && fin !== "cancelled" && (
                    <div className={`mt-1 text-xs whitespace-nowrap ${PO_FINANCIAL_STATUS_TEXT[fin] || "text-muted-foreground"}`}>
                      {PO_FINANCIAL_STATUS_LABEL[fin]}
                    </div>
                  )}
                </TableCell>
                <TableCell className="hidden 2xl:table-cell whitespace-nowrap">{shortDate(po.order_date)}</TableCell>
                <TableCell className="hidden xl:table-cell whitespace-nowrap">{shortDate(po.expected_date)}</TableCell>
                <TableCell className="hidden lg:table-cell whitespace-nowrap"><DueCell f={f} /></TableCell>
                <TableCell className="hidden xl:table-cell text-right tabular-nums">{po.line_count ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums font-medium whitespace-nowrap">{formatCurrency(f.total, currency)}</TableCell>
                <TableCell className="hidden md:table-cell text-right tabular-nums whitespace-nowrap">
                  {committed || po.status === "cancelled" ? formatCurrency(f.received, currency) : "—"}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-right whitespace-nowrap">
                  {committed ? (
                    f.owed > 0 ? (
                      <span className="tabular-nums font-medium text-amber-700 dark:text-amber-400">{formatCurrency(f.owed, currency)}</span>
                    ) : (
                      <span className="text-xs text-emerald-700 dark:text-emerald-400">Paid in full</span>
                    )
                  ) : (
                    <span className="text-xs text-muted-foreground">Not committed</span>
                  )}
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-wrap items-center justify-end gap-1 sm:flex-nowrap">
                    <Button size="sm" variant="ghost" className="hidden sm:inline-flex" onClick={() => onView(po)} aria-label={`View ${po.po_number}`} title="View & preview">
                      <Eye className="w-4 h-4" />
                    </Button>
                    {canEditPurchaseOrder(po) && (
                      <ActionButton icon={Pencil} label="Edit" poNumber={po.po_number} onClick={() => onEdit(po)} variant="ghost" />
                    )}
                    {canSubmitPurchaseOrder(po) && (
                      <ActionButton icon={Send} label="Submit" poNumber={po.po_number} onClick={() => onSubmit(po)} />
                    )}
                    {canApprovePurchaseOrder(po) && (
                      <ActionButton icon={CheckCircle2} label="Approve" poNumber={po.po_number} onClick={() => onApprove(po)} />
                    )}
                    {canReceivePurchaseOrder(po) && (
                      <ActionButton icon={PackageCheck} label="Receive" poNumber={po.po_number} onClick={() => onReceive(po)} />
                    )}
                    {canPayPurchaseOrder(po) && (
                      <ActionButton icon={Banknote} label="Record payment" poNumber={po.po_number} onClick={() => onPay(po)} />
                    )}
                    {canCancelPurchaseOrder(po) && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="hidden sm:inline-flex h-9 w-9 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                        onClick={() => onCancel(po)}
                        aria-label={`Cancel ${po.po_number}`}
                        title="Cancel purchase order"
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
