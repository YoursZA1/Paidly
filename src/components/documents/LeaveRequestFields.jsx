import { useMemo } from "react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  DEFAULT_LEAVE_BALANCES,
  LEAVE_TYPES,
  countBusinessLeaveDays,
  leaveBalanceForType,
  leaveTypeLabel,
} from "@/document-engine/leaveRequest";

/**
 * Shared leave-request form fields (create page + document detail).
 *
 * @param {{
 *   leaveType: string,
 *   onLeaveTypeChange?: (value: string) => void,
 *   dateRange: { from?: Date, to?: Date },
 *   onDateRangeChange?: (range: { from?: Date, to?: Date }) => void,
 *   reason?: string,
 *   onReasonChange?: (value: string) => void,
 *   balances?: Record<string, number | null>,
 *   readOnly?: boolean,
 *   showSummary?: boolean,
 *   className?: string,
 * }} props
 */
export default function LeaveRequestFields({
  leaveType,
  onLeaveTypeChange,
  dateRange,
  onDateRangeChange,
  reason = "",
  onReasonChange,
  balances = DEFAULT_LEAVE_BALANCES,
  readOnly = false,
  showSummary = true,
  className,
}) {
  const daysRequested = useMemo(
    () => countBusinessLeaveDays(dateRange?.from, dateRange?.to),
    [dateRange?.from, dateRange?.to]
  );

  const available = leaveBalanceForType(balances, leaveType);
  const remaining =
    available == null ? null : Math.max(available - daysRequested, 0);
  const overBalance = available != null && daysRequested > available;

  return (
    <div className={cn("space-y-6", className)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="leave-type">Type of leave</Label>
          {readOnly ? (
            <p id="leave-type" className="text-sm font-medium">
              {leaveTypeLabel(leaveType)}
            </p>
          ) : (
            <Select value={leaveType} onValueChange={onLeaveTypeChange}>
              <SelectTrigger id="leave-type">
                <SelectValue placeholder="Select leave type" />
              </SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-2">
          <Label>Leave available</Label>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
            <p className="text-2xl font-semibold tabular-nums">
              {available == null ? "—" : `${available} days`}
            </p>
            <p className="text-xs text-muted-foreground">{leaveTypeLabel(leaveType)} balance</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>When is your leave?</Label>
        <p className="text-sm text-muted-foreground">
          Select a start and end date on the calendar (weekends excluded from the day count).
        </p>
        <div className="flex justify-center rounded-xl border border-border bg-card p-3 sm:justify-start">
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={readOnly ? undefined : onDateRangeChange}
            numberOfMonths={1}
            disabled={readOnly ? () => true : undefined}
            className="rounded-md"
          />
        </div>
        {(dateRange?.from || dateRange?.to) && (
          <p className="text-sm text-muted-foreground">
            {dateRange.from ? format(dateRange.from, "MMM d, yyyy") : "—"}
            {" → "}
            {dateRange.to ? format(dateRange.to, "MMM d, yyyy") : "—"}
            {daysRequested > 0 ? ` · ${daysRequested} business day${daysRequested === 1 ? "" : "s"}` : null}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="leave-reason">Reason / notes</Label>
        {readOnly ? (
          <p id="leave-reason" className="whitespace-pre-wrap text-sm">
            {reason?.trim() ? reason : "—"}
          </p>
        ) : (
          <Textarea
            id="leave-reason"
            value={reason}
            onChange={(e) => onReasonChange?.(e.target.value)}
            placeholder="Optional context for your manager or HR team…"
            className="min-h-[100px]"
          />
        )}
      </div>

      {showSummary ? (
        <Card className={cn(overBalance && "border-amber-500/50 bg-amber-500/5")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Request summary</CardTitle>
            <CardDescription>
              Review your dates before submitting for approval.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Days requested</p>
              <p className="text-xl font-semibold tabular-nums">{daysRequested || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Available</p>
              <p className="text-xl font-semibold tabular-nums">
                {available == null ? "—" : available}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Remaining after</p>
              <p
                className={cn(
                  "text-xl font-semibold tabular-nums",
                  overBalance && "text-amber-700 dark:text-amber-400"
                )}
              >
                {remaining == null ? "—" : remaining}
              </p>
            </div>
          </CardContent>
          {overBalance ? (
            <p className="px-6 pb-4 text-sm text-amber-700 dark:text-amber-400">
              This request exceeds your available {leaveTypeLabel(leaveType).toLowerCase()} balance.
            </p>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

/** @param {unknown} metadata */
export function leaveDataFromMetadata(metadata) {
  const leave = metadata && typeof metadata === "object" ? metadata.leave : null;
  if (!leave || typeof leave !== "object") return null;
  return leave;
}

/** Build calendar range + form state from persisted leave metadata. */
export function leaveFormStateFromMetadata(metadata) {
  const leave = leaveDataFromMetadata(metadata);
  if (!leave) {
    return {
      leaveType: "annual",
      dateRange: { from: undefined, to: undefined },
      reason: "",
      balances: DEFAULT_LEAVE_BALANCES,
    };
  }
  const from = leave.start_date ? new Date(`${leave.start_date}T12:00:00`) : undefined;
  const to = leave.end_date ? new Date(`${leave.end_date}T12:00:00`) : undefined;
  return {
    leaveType: leave.leave_type || "annual",
    dateRange: { from, to },
    reason: leave.reason || "",
    balances: leave.balances || DEFAULT_LEAVE_BALANCES,
  };
}

/** @param {{ leaveType: string, dateRange: { from?: Date, to?: Date }, reason?: string, balances?: Record<string, number | null> }} form */
export function leaveMetadataFromForm(form) {
  const days = countBusinessLeaveDays(form.dateRange?.from, form.dateRange?.to);
  return {
    leave: {
      leave_type: form.leaveType,
      start_date: form.dateRange?.from ? format(form.dateRange.from, "yyyy-MM-dd") : null,
      end_date: form.dateRange?.to ? format(form.dateRange.to, "yyyy-MM-dd") : null,
      days_requested: days,
      reason: form.reason?.trim() || null,
      balances: form.balances || DEFAULT_LEAVE_BALANCES,
    },
  };
}
