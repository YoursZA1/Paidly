import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDownRight, ArrowUpRight, CalendarClock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { formatCurrency } from "@/components/CurrencySelector";
import { toDayKey } from "@/utils/cashFlowTruth";

function formatLedgerDate(value) {
  const key = toDayKey(value);
  if (!key) return "—";
  try {
    return format(parseISO(key), "MMM d, yyyy");
  } catch {
    return key;
  }
}

const KIND_LABEL = {
  income: "Income",
  expense: "Expense",
  outstanding: "Outstanding",
};

export default function CashFlowLedger({ rows = [], currency = "ZAR", emptyLabel = "No movements in this view" }) {
  if (!rows.length) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <CalendarClock className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">{emptyLabel}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Income to expenses</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isIn = row.kind === "income";
              const isOut = row.kind === "expense";
              return (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">{formatLedgerDate(row.date)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={isIn ? "border-emerald-500/40 text-emerald-700" : isOut ? "border-red-500/40 text-red-700" : "border-orange-500/40 text-orange-700"}>
                      {KIND_LABEL[row.kind] || row.kind}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate" title={row.name}>
                    {row.name}
                    {row.category ? <span className="block text-xs text-muted-foreground">{row.category}</span> : null}
                  </TableCell>
                  <TableCell className={`text-right font-semibold tabular-nums ${isIn ? "text-emerald-700" : isOut ? "text-red-700" : "text-orange-700"}`}>
                    <span className="inline-flex items-center justify-end gap-1">
                      {isIn ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                      {isOut ? "−" : isIn ? "+" : ""}
                      {formatCurrency(row.amount, currency)}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
