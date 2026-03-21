import React, { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO, isValid } from "date-fns";
import { formatCurrency } from "@/components/CurrencySelector";
import PayslipActions from "./PayslipActions";
import PayslipStatusBadge from "./PayslipStatusBadge";
import { createPageUrl } from "@/utils";

const ROW_HEIGHT = 64;
const VIRTUAL_TABLE_MAX_HEIGHT = 480;

/** Same grid as invoice list: # | name | detail | amount | meta | date | status | actions */
const GRID_TOTAL_WIDTH = 220 + 160 + 220 + 140 + 140 + 140 + 120 + 60;

const safeFormatDate = (dateStr) => {
  if (!dateStr) return "N/A";
  const d = typeof dateStr === "string" ? parseISO(dateStr) : new Date(dateStr);
  return isValid(d) ? format(d, "MMM d, yyyy") : "N/A";
};

const payPeriodLabel = (p) => {
  if (p.pay_period_start && p.pay_period_end) {
    return `${safeFormatDate(p.pay_period_start)} – ${safeFormatDate(p.pay_period_end)}`;
  }
  return "N/A";
};

const PayslipRow = React.memo(function PayslipRow({
  payslip,
  virtualRow,
  userCurrency,
  onActionSuccess,
}) {
  return (
    <TableRow
      className="table-row border-0 absolute inset-x-0 w-full invoice-list-row"
      style={{
        height: `${virtualRow.size}px`,
        transform: `translateY(${virtualRow.start}px)`,
        top: 0,
      }}
    >
      <TableCell className="invoice-col-num text-left font-medium text-foreground text-xs sm:text-sm whitespace-nowrap truncate">
        {payslip.payslip_number}
      </TableCell>
      <TableCell className="invoice-col-client text-left text-muted-foreground text-xs sm:text-sm truncate">
        {payslip.employee_name}
      </TableCell>
      <TableCell className="invoice-col-project text-left text-muted-foreground text-xs sm:text-sm truncate">
        {payslip.position || "—"}
      </TableCell>
      <TableCell className="amount invoice-col-amount font-semibold text-foreground text-xs sm:text-sm whitespace-nowrap">
        {formatCurrency(payslip.net_pay, userCurrency)}
      </TableCell>
      <TableCell className="invoice-col-paid text-left text-muted-foreground text-xs sm:text-sm truncate" title={payPeriodLabel(payslip)}>
        {payPeriodLabel(payslip)}
      </TableCell>
      <TableCell className="invoice-col-date text-center text-muted-foreground text-xs sm:text-sm whitespace-nowrap">
        {safeFormatDate(payslip.pay_date)}
      </TableCell>
      <TableCell className="invoice-col-status text-center">
        <PayslipStatusBadge status={payslip.status || "draft"} />
      </TableCell>
      <TableCell className="invoice-col-actions text-center">
        <div className="flex justify-center">
          <PayslipActions payslip={payslip} onActionSuccess={onActionSuccess} />
        </div>
      </TableCell>
    </TableRow>
  );
});

const PayslipMobileCard = React.memo(function PayslipMobileCard({
  payslip,
  userCurrency,
  onActionSuccess,
}) {
  const payDate = safeFormatDate(payslip.pay_date);
  const amountLabel = formatCurrency(payslip.net_pay, userCurrency);
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden flex items-stretch gap-0 min-w-0">
      <Link
        to={createPageUrl(`ViewPayslip?id=${payslip.id}`)}
        className="flex-1 min-w-0 flex justify-between items-center gap-3 px-4 py-3 active:bg-muted/50 transition-colors"
      >
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="font-semibold text-foreground text-sm truncate">{payslip.employee_name}</p>
          <p className="text-[11px] text-muted-foreground truncate">{payslip.payslip_number}</p>
          <p className="text-[10px] text-muted-foreground/80">{payDate}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="font-bold text-foreground text-sm currency-nums whitespace-nowrap">{amountLabel}</span>
          <span className="text-[10px] text-muted-foreground truncate max-w-[9rem] text-right">
            {payPeriodLabel(payslip)}
          </span>
          <PayslipStatusBadge status={payslip.status || "draft"} />
        </div>
      </Link>
      <div className="flex items-center border-l border-border shrink-0" onClick={(e) => e.preventDefault()}>
        <PayslipActions payslip={payslip} onActionSuccess={onActionSuccess} />
      </div>
    </div>
  );
});

const VirtualizedTableBody = React.memo(function VirtualizedTableBody({
  payslips,
  parentRef,
  userCurrency,
  onActionSuccess,
}) {
  const rowVirtualizer = useVirtualizer({
    count: payslips.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  return (
    <>
      {totalSize > 0 && (
        <TableRow className="border-0 [&>td]:p-0 [&>td]:border-0" style={{ height: `${totalSize}px` }} aria-hidden>
          <TableCell colSpan={8} className="!p-0 !border-0 !h-0" style={{ height: `${totalSize}px`, lineHeight: 0, overflow: "hidden" }} />
        </TableRow>
      )}
      {virtualRows.map((virtualRow) => {
        const payslip = payslips[virtualRow.index];
        return (
          <PayslipRow
            key={payslip.id}
            payslip={payslip}
            virtualRow={virtualRow}
            userCurrency={userCurrency}
            onActionSuccess={onActionSuccess}
          />
        );
      })}
    </>
  );
});

function PayslipList({ payslips, isLoading, userCurrency, onActionSuccess }) {
  const parentRef = useRef(null);

  const colgroup = (
    <colgroup>
      <col style={{ width: 220 }} />
      <col style={{ width: 160 }} />
      <col style={{ width: 220 }} />
      <col style={{ width: 140 }} />
      <col style={{ width: 140 }} />
      <col style={{ width: 140 }} />
      <col style={{ width: 120 }} />
      <col style={{ width: 60 }} />
    </colgroup>
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border/50 bg-transparent w-full min-w-0">
      <div className="block md:hidden p-3 sm:p-4 space-y-3">
        {isLoading ? (
          Array(6)
            .fill(0)
            .map((_, i) => (
              <div
                key={i}
                className="bg-card border border-border rounded-2xl px-4 py-3 flex justify-between items-center gap-3"
              >
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <Skeleton className="h-4 w-24 rounded" />
                  <Skeleton className="h-3 w-20 rounded" />
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Skeleton className="h-4 w-20 rounded" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              </div>
            ))
        ) : (
          payslips.map((payslip) => (
            <PayslipMobileCard
              key={payslip.id}
              payslip={payslip}
              userCurrency={userCurrency}
              onActionSuccess={onActionSuccess}
            />
          ))
        )}
      </div>

      <div className="hidden md:block overflow-x-auto mobile-scroll-x">
        {isLoading ? (
          <Table className="table invoice-list-table table-fixed" style={{ width: GRID_TOTAL_WIDTH, minWidth: GRID_TOTAL_WIDTH }}>
            {colgroup}
            <TableHeader>
              <TableRow className="table-row hover:bg-transparent border-0">
                <TableHead className="text-left text-muted-foreground text-xs font-medium whitespace-nowrap">Payslip #</TableHead>
                <TableHead className="text-left text-muted-foreground text-xs font-medium whitespace-nowrap">Employee</TableHead>
                <TableHead className="text-left text-muted-foreground text-xs font-medium whitespace-nowrap">Position</TableHead>
                <TableHead className="amount text-muted-foreground text-xs font-medium whitespace-nowrap">Net pay</TableHead>
                <TableHead className="text-left text-muted-foreground text-xs font-medium whitespace-nowrap">Pay period</TableHead>
                <TableHead className="text-center text-muted-foreground text-xs font-medium whitespace-nowrap">Pay date</TableHead>
                <TableHead className="text-center text-muted-foreground text-xs font-medium whitespace-nowrap">Status</TableHead>
                <TableHead className="text-center text-muted-foreground text-xs font-medium whitespace-nowrap">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array(8)
                .fill(0)
                .map((_, i) => (
                  <TableRow key={i} className="table-row border-0">
                    <TableCell>
                      <Skeleton className="h-4 w-full max-w-[180px] rounded animate-pulse" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-full max-w-[120px] rounded animate-pulse" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-full max-w-[180px] rounded animate-pulse" />
                    </TableCell>
                    <TableCell className="amount">
                      <Skeleton className="h-4 w-full max-w-[100px] rounded animate-pulse ml-auto" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-full max-w-[100px] rounded animate-pulse" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-full max-w-[100px] rounded animate-pulse" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-full max-w-[80px] rounded-full animate-pulse" />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center">
                        <Skeleton className="h-8 w-8 rounded-lg animate-pulse" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        ) : payslips.length === 0 ? null : (
          <div
            ref={parentRef}
            className="overflow-auto overflow-x-auto"
            style={{ maxHeight: VIRTUAL_TABLE_MAX_HEIGHT, minWidth: GRID_TOTAL_WIDTH }}
          >
            <Table className="table invoice-list-table table-fixed" style={{ width: GRID_TOTAL_WIDTH, minWidth: GRID_TOTAL_WIDTH }}>
              {colgroup}
              <TableHeader>
                <TableRow className="table-row hover:bg-transparent border-0 bg-background sticky top-0 z-10">
                  <TableHead className="text-left text-muted-foreground text-xs font-medium whitespace-nowrap">Payslip #</TableHead>
                  <TableHead className="text-left text-muted-foreground text-xs font-medium whitespace-nowrap">Employee</TableHead>
                  <TableHead className="text-left text-muted-foreground text-xs font-medium whitespace-nowrap">Position</TableHead>
                  <TableHead className="amount text-muted-foreground text-xs font-medium whitespace-nowrap">Net pay</TableHead>
                  <TableHead className="text-left text-muted-foreground text-xs font-medium whitespace-nowrap">Pay period</TableHead>
                  <TableHead className="text-center text-muted-foreground text-xs font-medium whitespace-nowrap">Pay date</TableHead>
                  <TableHead className="text-center text-muted-foreground text-xs font-medium whitespace-nowrap">Status</TableHead>
                  <TableHead className="text-center text-muted-foreground text-xs font-medium whitespace-nowrap">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody style={{ position: "relative" }}>
                <VirtualizedTableBody
                  payslips={payslips}
                  parentRef={parentRef}
                  userCurrency={userCurrency}
                  onActionSuccess={onActionSuccess}
                />
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(PayslipList);
