import { useMemo } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  ArrowLeft,
  CreditCard,
  FileText,
  Receipt,
  Sparkles,
  CalendarClock,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfileQuery } from "@/hooks/useUserProfileQuery";
import { useMySubscriptionsQuery } from "@/hooks/useMySubscriptionsQuery";
import { createPageUrl, getBillingPortalUrl } from "@/utils";
import { PLANS, normalizePlanSlug } from "@shared/plans.js";
import { priceForSlug } from "@/data/paidlySubscriptionPlans";
import {
  describeSubscriptionState,
  pickPreferredSubscriptionRow,
  isOnTrialSubscription,
  hasActivePaidSubscription,
} from "@/lib/subscriptionPlan";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

function formatZar(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
  }).format(n);
}

function formatWhen(iso) {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return format(d, "d MMM yyyy");
}

function statusBadgeVariant(status) {
  const s = String(status || "").toLowerCase();
  if (s === "active") return "default";
  if (s === "past_due" || s === "inactive") return "secondary";
  if (s === "canceled" || s === "cancelled") return "outline";
  return "secondary";
}

function planDisplayName(rawPlan) {
  const slug = normalizePlanSlug(String(rawPlan || "").replace(/^paidly\s+/i, ""));
  if (slug && PLANS[slug]) return PLANS[slug].name;
  const t = String(rawPlan || "").trim();
  return t || "—";
}

export default function BillingAndInvoices() {
  const { user: authUser } = useAuth();
  const { profile, isLoading: profileLoading } = useUserProfileQuery();
  const { data: subsRows = [], isLoading: subsLoading, isError: subsError } = useMySubscriptionsQuery();

  const billingProfile = useMemo(
    () => ({
      ...(authUser || {}),
      ...(profile || {}),
    }),
    [authUser, profile]
  );

  const accountState = describeSubscriptionState(billingProfile);
  const planSlug = normalizePlanSlug(
    billingProfile.plan || billingProfile.subscription_plan || accountState.packageKey
  );
  const planDef = planSlug && PLANS[planSlug] ? PLANS[planSlug] : null;
  const listPriceZar = planSlug ? priceForSlug(planSlug) : null;

  const preferredSub = useMemo(() => pickPreferredSubscriptionRow(subsRows), [subsRows]);

  const portalUrl = typeof window !== "undefined" ? getBillingPortalUrl() : "";
  const appOrigin = typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "";
  const portalNorm = portalUrl.replace(/\/$/, "");
  const stripePortal =
    Boolean(portalUrl) &&
    /^https?:\/\//i.test(portalUrl) &&
    (!appOrigin || portalNorm !== appOrigin);

  const loading = profileLoading;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-4 text-muted-foreground hover:text-foreground">
            <Link to={`${createPageUrl("Settings")}?tab=subscription`} className="inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to subscription settings
            </Link>
          </Button>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Billing &amp; invoices
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Your Paidly package, subscription activity, and where to find payment receipts.
          </p>
        </div>

        <div className="space-y-6">
          <Card className="overflow-hidden border-border shadow-sm">
            <CardHeader className="border-b border-border/80 bg-muted/30 pb-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Sparkles className="h-5 w-5" aria-hidden />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Current package</CardTitle>
                    <CardDescription>What you are subscribed to on Paidly</CardDescription>
                  </div>
                </div>
                <Badge variant="secondary" className="w-fit shrink-0 font-medium capitalize">
                  {accountState.statusLabel}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-4 w-full max-w-md" />
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Plan</p>
                    <p className="mt-1 text-xl font-semibold text-foreground">
                      {accountState.packageLabel}
                      {listPriceZar != null ? (
                        <span className="text-base font-normal text-muted-foreground">
                          {" "}
                          · R{listPriceZar}/mo list
                        </span>
                      ) : null}
                    </p>
                    {billingProfile.plan || billingProfile.subscription_plan ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Billing slug:{" "}
                        <span className="font-mono text-xs">
                          {String(billingProfile.plan || billingProfile.subscription_plan || "—")}
                        </span>
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-3 text-sm">
                    {isOnTrialSubscription(billingProfile) && billingProfile.trial_ends_at ? (
                      <div className="flex items-start gap-2 rounded-lg border border-border bg-card p-3">
                        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                        <div>
                          <p className="font-medium text-foreground">Trial</p>
                          <p className="text-muted-foreground">
                            Ends {formatWhen(billingProfile.trial_ends_at)} (UTC stored; shown in local time).
                          </p>
                        </div>
                      </div>
                    ) : null}
                    {hasActivePaidSubscription(billingProfile) && preferredSub?.next_billing_date ? (
                      <div className="flex items-start gap-2 rounded-lg border border-border bg-card p-3">
                        <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                        <div>
                          <p className="font-medium text-foreground">Next billing</p>
                          <p className="text-muted-foreground">{formatWhen(preferredSub.next_billing_date)}</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {planDef?.features?.length ? (
                <div className="mt-6 border-t border-border pt-6">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Included in this tier
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {planDef.features.map((f) => (
                      <li key={f}>
                        <Badge variant="outline" className="font-normal capitalize">
                          {f.replace(/_/g, " ")}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-muted-foreground" aria-hidden />
                <div>
                  <CardTitle className="text-lg">Invoices &amp; receipts</CardTitle>
                  <CardDescription>
                    Paidly bills through PayFast. Each successful charge generates a receipt; check the email you used at
                    checkout.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
                <li>Payment confirmations and tax documents are issued by PayFast for your subscription charges.</li>
                <li>
                  If you need a past receipt, search your inbox for PayFast or contact{" "}
                  <a
                    href={`mailto:${(import.meta.env.VITE_SUPPORT_EMAIL || "support@paidly.co.za").replace(/^mailto:/i, "")}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    support
                  </a>
                  {" "}with your account email.
                </li>
              </ul>
              {stripePortal ? (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => window.open(portalUrl, "_blank", "noopener,noreferrer")}
                >
                  <FileText className="mr-2 h-4 w-4" aria-hidden />
                  Open external billing portal
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-muted-foreground" aria-hidden />
                <div>
                  <CardTitle className="text-lg">Subscription history</CardTitle>
                  <CardDescription>
                    Agreements and billing status we store for your account (from PayFast notifications).
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {subsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : subsError ? (
                <p className="text-sm text-destructive" role="alert">
                  Could not load subscription history. If this persists, ensure your project has the latest database
                  policies applied.
                </p>
              ) : subsRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No subscription records yet. When you subscribe via PayFast, your agreements will appear here.
                </p>
              ) : (
                <Table aria-label="Your Paidly subscription agreements">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="hidden sm:table-cell">Last payment</TableHead>
                      <TableHead className="hidden md:table-cell">Next billing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subsRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{planDisplayName(row.plan || row.current_plan)}</TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(row.status)} className="capitalize">
                            {String(row.status || "—").replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatZar(row.amount ?? row.custom_price)}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                          {formatWhen(row.last_payment_at)}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">
                          {formatWhen(row.next_billing_date)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
