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
import { CheckCircle2, PackageCheck, XCircle } from "lucide-react";

const STATUS_VARIANT = {
  draft: "secondary",
  approved: "default",
  received: "outline",
  cancelled: "destructive",
};

export default function PurchaseOrderTable({ purchaseOrders = [], suppliersById, itemCountByPo, onApprove, onReceive, onCancel }) {
  if (purchaseOrders.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        No purchase orders yet.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>PO Number</TableHead>
          <TableHead>Supplier</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Expected</TableHead>
          <TableHead>Lines</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {purchaseOrders.map((po) => {
          const supplier = suppliersById?.get?.(po.supplier_id);
          return (
            <TableRow key={po.id}>
              <TableCell className="font-medium">{po.po_number}</TableCell>
              <TableCell>{supplier?.name || "—"}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[po.status] || "secondary"} className="capitalize">
                  {po.status}
                </Badge>
              </TableCell>
              <TableCell>{po.expected_date || "—"}</TableCell>
              <TableCell>{itemCountByPo?.get?.(po.id) ?? 0}</TableCell>
              <TableCell className="text-right space-x-1">
                {po.status === "draft" && (
                  <Button size="sm" variant="outline" onClick={() => onApprove(po)}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                  </Button>
                )}
                {po.status === "approved" && (
                  <Button size="sm" variant="outline" onClick={() => onReceive(po)}>
                    <PackageCheck className="w-4 h-4 mr-1" /> Receive
                  </Button>
                )}
                {(po.status === "draft" || po.status === "approved") && (
                  <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => onCancel(po)}>
                    <XCircle className="w-4 h-4 mr-1" /> Cancel
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
