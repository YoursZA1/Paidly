import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import StatusBadge from "@/components/dashboard/StatusBadge";
import PlanBadge from "@/components/dashboard/PlanBadge";
import { fetchAdminSubscriptionDetail } from "@/api/fetchAdminSubscriptionDetail";
import { updateAdminSubscription } from "@/api/mutateAdminSubscription";
import {
  SUBSCRIPTION_EVENT_LABELS,
  SUBSCRIPTION_TIMELINE_STAGES,
  buildSubscriptionEventTimeline,
} from "@shared/subscriptionEventTypes.js";

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  try {
    return format(d, "dd MMM yyyy HH:mm");
  } catch {
    return "—";
  }
}

function formatZar(amount, currency = "ZAR") {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "R 0";
  const prefix = String(currency || "ZAR").toUpperCase() === "ZAR" ? "R" : String(currency).toUpperCase();
  return `${prefix} ${n.toLocaleString("en-ZA", {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function DetailField({ label, children }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm text-foreground break-words">{children}</div>
    </div>
  );
}

function EventTimeline({ stages }) {
  const items =
    Array.isArray(stages) && stages.length > 0
      ? stages
      : SUBSCRIPTION_TIMELINE_STAGES.map((s) => ({
          key: s.key,
          label: s.label,
          reached: false,
          at: null,
        }));

  return (
    <ol className="space-y-0">
      {items.map((stage, index) => {
        const done = Boolean(stage.reached);
        const isLast = index === items.length - 1;
        return (
          <li key={stage.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs ${
                  done
                    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "border-border bg-muted text-muted-foreground"
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : index + 1}
              </span>
              {!isLast ? (
                <span
                  className={`my-0.5 w-px flex-1 min-h-[1.25rem] ${
                    done ? "bg-emerald-500/40" : "bg-border"
                  }`}
                  aria-hidden
                />
              ) : null}
            </div>
            <div className={`min-w-0 pb-4 ${isLast ? "pb-0" : ""}`}>
              <p className={`text-sm font-medium ${done ? "text-foreground" : "text-muted-foreground"}`}>
                {stage.label}
              </p>
              <p className="text-xs text-muted-foreground">
                {done ? formatDate(stage.at) : "Not reached"}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Admin Subscription Details sheet:
 * Company · Owner · Plan · PayFast ID · Renew Date + History / Logs / Invoices
 */
export default function SubscriptionDetailsSheet({
  subscriptionId,
  open,
  onOpenChange,
}) {
  const queryClient = useQueryClient();
  const enabled = Boolean(open && subscriptionId);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["subscription-detail", subscriptionId],
    queryFn: () => fetchAdminSubscriptionDetail(subscriptionId),
    enabled,
    staleTime: 15000,
  });

  const overrideMutation = useMutation({
    mutationFn: ({ action, extra }) =>
      updateAdminSubscription(subscriptionId, { action, ...(extra || {}) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription-detail", subscriptionId] });
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["subscription-overview"] });
      toast.success("Subscription updated");
    },
    onError: (err) => toast.error(err?.message || "Update failed"),
  });

  const sub = data?.subscription;
  const history = data?.history || [];
  const logs = data?.logs || [];
  const invoices = data?.invoices || [];
  const eventTimeline =
    data?.eventTimeline ||
    buildSubscriptionEventTimeline(
      (logs || []).filter((l) => l.kind === "event").map((l) => ({
        id: l.id,
        event_type: l.type,
        created_at: l.date,
      }))
    );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Subscription Details</SheetTitle>
          <SheetDescription>
            Company, owner, plan, PayFast ID, renew date — plus payment history, logs, and invoices.
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="mt-10 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : null}

        {isError ? (
          <p className="mt-6 text-sm text-destructive" role="alert">
            {error?.message || "Could not load subscription details"}
          </p>
        ) : null}

        {sub ? (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2">
              <DetailField label="Company">{sub.company || "—"}</DetailField>
              <DetailField label="Owner">
                <p>{sub.owner?.name || sub.owner?.label || "—"}</p>
                {sub.owner?.email ? (
                  <p className="text-xs text-muted-foreground">{sub.owner.email}</p>
                ) : null}
              </DetailField>
              <DetailField label="Plan">
                <div className="flex flex-wrap items-center gap-2">
                  <PlanBadge plan={sub.plan || "none"} />
                  {sub.planAmount != null ? (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatZar(sub.planAmount, sub.currency)}
                      {sub.billingCycle ? ` / ${sub.billingCycle}` : ""}
                    </span>
                  ) : null}
                </div>
              </DetailField>
              <DetailField label="Status">
                <StatusBadge status={sub.status} />
              </DetailField>
              <DetailField label="PayFast ID">
                <span className="font-mono text-xs break-all">{sub.payfastId || "—"}</span>
              </DetailField>
              <DetailField label="Renew Date">{formatDate(sub.renewDate)}</DetailField>
              <DetailField label="Trial start">{formatDate(sub.trialStartedAt)}</DetailField>
              <DetailField label="Trial end">{formatDate(sub.trialEndsAt)}</DetailField>
              <DetailField label="Account created">
                {formatDate(sub.owner?.createdAt || sub.createdAt)}
              </DetailField>
              <DetailField label="Successful payments">
                {sub.paymentsSummary?.successfulCount ?? 0}
                {sub.paymentsSummary?.successfulAmount != null
                  ? ` · ${formatZar(sub.paymentsSummary.successfulAmount, sub.currency)}`
                  : ""}
              </DetailField>
            </div>

            <div className="rounded-xl border border-border p-4">
              <h3 className="mb-3 text-sm font-semibold">Administrative controls</h3>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={overrideMutation.isPending}
                  onClick={() =>
                    overrideMutation.mutate({
                      action: "extend_trial",
                      extra: { days: 7, reason: "Admin extended trial by 7 days" },
                    })
                  }
                >
                  +7 days
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={overrideMutation.isPending}
                  onClick={() =>
                    overrideMutation.mutate({
                      action: "extend_trial",
                      extra: { days: 14, reason: "Admin extended trial by 14 days" },
                    })
                  }
                >
                  +14 days
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={overrideMutation.isPending}
                  onClick={() =>
                    overrideMutation.mutate({
                      action: "extend_trial",
                      extra: { days: 30, reason: "Admin extended trial by 30 days" },
                    })
                  }
                >
                  +30 days
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={overrideMutation.isPending}
                  onClick={() =>
                    overrideMutation.mutate({
                      action: "grant",
                      extra: { reason: "Admin granted access" },
                    })
                  }
                >
                  Grant access
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={overrideMutation.isPending}
                  onClick={() =>
                    overrideMutation.mutate({
                      action: "end_trial",
                      extra: { reason: "Admin ended trial immediately" },
                    })
                  }
                >
                  End trial
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={overrideMutation.isPending}
                  onClick={() =>
                    overrideMutation.mutate({
                      action: "suspend",
                      extra: { reason: "Admin suspended subscription" },
                    })
                  }
                >
                  Suspend
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={overrideMutation.isPending}
                  onClick={() =>
                    overrideMutation.mutate({
                      action: "activate",
                      extra: { reason: "Admin activated subscription" },
                    })
                  }
                >
                  Activate
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-border p-4">
              <h3 className="mb-3 text-sm font-semibold">Event Timeline</h3>
              <p className="mb-4 text-xs text-muted-foreground">
                Created → Redirected → ITN Received → Verified → Activated → Renewed → Cancelled
              </p>
              <EventTimeline stages={eventTimeline} />
            </div>

            <Tabs defaultValue="history">
              <TabsList className="w-full justify-start overflow-x-auto">
                <TabsTrigger value="history">History</TabsTrigger>
                <TabsTrigger value="logs">Logs</TabsTrigger>
                <TabsTrigger value="invoices">Invoices</TabsTrigger>
              </TabsList>

              <TabsContent value="history" className="space-y-2">
                {history.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No payment history</p>
                ) : (
                  history.map((h) => (
                    <div
                      key={h.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{formatDate(h.date)}</p>
                        <p className="text-xs text-muted-foreground capitalize">{h.status}</p>
                        {h.payfastPaymentId ? (
                          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                            {h.payfastPaymentId}
                          </p>
                        ) : null}
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums">
                        {formatZar(h.amount, h.currency)}
                      </p>
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="logs" className="space-y-2">
                {logs.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No logs</p>
                ) : (
                  logs.map((log) => (
                    <div
                      key={`${log.kind}-${log.id}`}
                      className="rounded-lg border border-border px-3 py-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {log.label ||
                            SUBSCRIPTION_EVENT_LABELS[log.type] ||
                            String(log.type || log.kind || "log").replace(/_/g, " ")}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatDate(log.date)}</p>
                      </div>
                      {log.kind === "itn" ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          verified={String(Boolean(log.verified))}
                          {log.verificationResponse
                            ? ` · ${String(log.verificationResponse).slice(0, 80)}`
                            : ""}
                          {log.paymentStatus ? ` · ${log.paymentStatus}` : ""}
                        </p>
                      ) : null}
                      {log.kind === "event" && log.source ? (
                        <p className="mt-1 text-xs text-muted-foreground">source: {log.source}</p>
                      ) : null}
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="invoices" className="space-y-2">
                {invoices.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No SaaS invoices</p>
                ) : (
                  invoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {inv.invoiceNumber || inv.id.slice(0, 8)}
                        </p>
                        <p className="text-xs capitalize text-muted-foreground">{inv.status}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(inv.paidAt || inv.issuedAt || inv.createdAt)}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums">
                        {formatZar(inv.amount, inv.currency)}
                      </p>
                    </div>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
