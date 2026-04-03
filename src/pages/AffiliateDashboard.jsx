import { useCallback, useEffect, useMemo, useState } from "react";
import { useAffiliateDashboardStore } from "@/stores/useAffiliateDashboardStore";
import { fetchAffiliateDashboardData } from "@/api/affiliateClient";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  MousePointerClick,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import {
  createAffiliateApplyUrl,
  createAffiliateLandingUrl,
  createAffiliateSignupShareUrl,
} from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";

function shareOrigin() {
  const raw = (import.meta.env.VITE_APP_URL || "").toString().trim();
  if (raw) {
    try {
      return new URL(raw).origin;
    } catch {
      /* ignore */
    }
  }
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

function formatZar(n) {
  const v = Number(n) || 0;
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function formatPct(rate) {
  const r = Number(rate);
  if (Number.isNaN(r)) return "—";
  return `${Math.round(r * 100)}%`;
}

const statusStyles = {
  pending: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  approved: "bg-sky-500/15 text-sky-800 dark:text-sky-200",
  paid: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
};

/**
 * In-app affiliate hub — dashboard payload lives in Zustand (`useAffiliateDashboardStore`); updates use `set({ affiliateData })`, never in-place mutation.
 */
export default function AffiliateDashboard() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const loading = useAffiliateDashboardStore((s) => s.loading);
  const refreshing = useAffiliateDashboardStore((s) => s.refreshing);
  const loadError = useAffiliateDashboardStore((s) => s.loadError);
  const payload = useAffiliateDashboardStore((s) => s.affiliateData);
  const fetchDashboard = useAffiliateDashboardStore((s) => s.fetchDashboard);
  const setAffiliateDashboard = useAffiliateDashboardStore((s) => s.setAffiliateDashboard);
  const setLoading = useAffiliateDashboardStore((s) => s.setLoading);
  const setLoadError = useAffiliateDashboardStore((s) => s.setLoadError);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("[AffiliateDashboard] Mount: fetching dashboard data");
    }
    setLoading(true);
    setLoadError(null);

    fetchAffiliateDashboardData()
      .then((data) => {
        if (import.meta.env.DEV) {
          console.log("[AffiliateDashboard] Fetch returned", { ok: data?.ok, hasData: !!data });
        }
        if (data?.ok) {
          if (import.meta.env.DEV) {
            console.log("[AffiliateDashboard] Setting state with fresh data", { affiliate: !!data.affiliate });
          }
          setAffiliateDashboard(data);
          setLoadError(null);
        } else {
          if (import.meta.env.DEV) {
            console.error("[AffiliateDashboard] API returned error:", data?.error);
          }
          setAffiliateDashboard(null);
          setLoadError(data?.error || "Could not load affiliate data");
        }
      })
      .catch((err) => {
        if (import.meta.env.DEV) {
          console.error("[AffiliateDashboard] Fetch threw error:", err);
        }
        setAffiliateDashboard(null);
        setLoadError(err?.message || "Failed to fetch affiliate data");
      })
      .finally(() => {
        if (import.meta.env.DEV) {
          console.log("[AffiliateDashboard] Fetch complete, setting loading=false");
        }
        setLoading(false);
      });
  }, [setAffiliateDashboard, setLoadError, setLoading]);

  const affiliate = payload?.affiliate;
  const stats = payload?.stats;
  const recentCommissions = payload?.recentCommissions ?? [];

  const totalEarningsBooked = useMemo(() => {
    const p = Number(stats?.earningsPending) || 0;
    const paid = Number(stats?.earningsPaid) || 0;
    return p + paid;
  }, [stats?.earningsPending, stats?.earningsPaid]);

  const referralUrl = useMemo(() => {
    if (!affiliate?.referral_code) return "";
    return createAffiliateSignupShareUrl(affiliate.referral_code, shareOrigin());
  }, [affiliate?.referral_code]);

  const copyLink = useCallback(async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      toast({ title: "Link copied" });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  }, [referralUrl, toast]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] w-full items-center justify-center mobile-page">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
          <p className="text-sm">Loading affiliate data…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 mobile-page">
        <Card>
          <CardHeader>
            <CardTitle>Couldn&apos;t load dashboard</CardTitle>
            <CardDescription>{loadError}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" onClick={() => fetchDashboard(false)}>
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const noAffiliate = !affiliate;

  return (
    <div className="w-full min-w-0 mobile-page">
      <div className="relative overflow-hidden border-b border-border/60 bg-gradient-to-br from-primary/[0.07] via-background to-background">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-0 h-48 w-48 rounded-full bg-emerald-500/5 blur-2xl" />
        <div className="relative mx-auto flex max-w-6xl flex-col gap-4 px-3 py-8 sm:flex-row sm:items-end sm:justify-between sm:px-6 md:py-10">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="space-y-2"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Growth partner</p>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl md:text-4xl">
              Affiliate command center
            </h1>
            <p className="max-w-xl text-sm text-muted-foreground">
              One ledger for your link, attributed signups, and commission balance — built for trust and clean
              payouts.
            </p>
          </motion.div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={refreshing}
              onClick={() => fetchDashboard(true)}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
              Refresh
            </Button>
            <Button variant="secondary" size="sm" asChild className="gap-2">
              <Link to={createAffiliateLandingUrl()} target="_blank" rel="noopener noreferrer">
                Program page
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-8 px-3 py-8 sm:px-6 md:py-10">
        {noAffiliate ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <Card className="border-dashed border-primary/25 bg-muted/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock className="h-5 w-5 text-amber-500" aria-hidden />
                  Not activated yet
                </CardTitle>
                <CardDescription>
                  You don&apos;t have an approved affiliate profile in Paidly yet. Apply on the public page — when
                  we approve you, your referral code and earnings ledger appear here automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Button asChild className="gap-2">
                  <Link to={createAffiliateApplyUrl()}>
                    Apply to the program
                    <ArrowUpRight className="h-4 w-4" aria-hidden />
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to={createAffiliateLandingUrl()}>How it works</Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="border-border/80 lg:col-span-2">
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-2">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-hidden />
                      Partner status
                    </CardTitle>
                    <CardDescription>Commission rate and referral code</CardDescription>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    Active
                  </span>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-6 text-sm">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rate</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                      {formatPct(affiliate.commission_rate)} recurring
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Code</p>
                    <p className="mt-1 font-mono text-lg font-semibold tracking-wider text-foreground">
                      {affiliate.referral_code}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/80 bg-muted/15">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Wallet className="h-5 w-5 text-primary" aria-hidden />
                    Balance snapshot
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Pending / approved</span>
                    <span className="font-semibold tabular-nums text-foreground">{formatZar(stats?.earningsPending)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 border-t border-border/60 pt-3">
                    <span className="text-xs text-muted-foreground">Paid out</span>
                    <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatZar(stats?.earningsPaid)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/80 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Link2 className="h-5 w-5 text-primary" aria-hidden />
                  Your referral link
                </CardTitle>
                <CardDescription>
                  Share this URL — clicks and signups are attributed when someone creates an account with your code.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1 rounded-xl border border-border bg-muted/30 px-3 py-2.5 font-mono text-xs break-all text-foreground sm:text-sm">
                    {referralUrl || "—"}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0 gap-2"
                    onClick={copyLink}
                    disabled={!referralUrl}
                  >
                    <Copy className="h-4 w-4" aria-hidden />
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Anyone who creates a Paidly account through this link is attributed to you; eligible subscriptions can
                  generate commissions per program terms.
                </p>
              </CardContent>
            </Card>

            <div>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Performance
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    label: "Clicks",
                    value: stats?.clicks ?? 0,
                    hint: "Tracked link visits",
                    icon: MousePointerClick,
                  },
                  {
                    label: "Signups",
                    value: stats?.signups ?? 0,
                    hint: "Accounts attributed",
                    icon: Users,
                  },
                  {
                    label: "Paid users",
                    value: stats?.paidUsers ?? 0,
                    hint: "Converted & paying",
                    icon: TrendingUp,
                  },
                  {
                    label: "Earnings",
                    value: formatZar(totalEarningsBooked),
                    hint: "Pending + paid (ledger)",
                    icon: Wallet,
                  },
                ].map((row, i) => (
                  <motion.div
                    key={row.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.05 }}
                  >
                    <Card className="h-full border-border/80 bg-card/50 shadow-sm backdrop-blur-sm">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <row.icon className="h-4 w-4" aria-hidden />
                          <span className="text-xs font-medium uppercase tracking-wide">{row.label}</span>
                        </div>
                        <CardTitle className="text-3xl font-bold tabular-nums tracking-tight text-foreground">
                          {row.value}
                        </CardTitle>
                        <CardDescription className="text-xs">{row.hint}</CardDescription>
                      </CardHeader>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>

            <Card className="border-border/80">
              <CardHeader>
                <CardTitle className="text-lg">Recent commissions</CardTitle>
                <CardDescription>Line items from your ledger (newest first)</CardDescription>
              </CardHeader>
              <CardContent>
                {recentCommissions.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No commission rows yet. When referred users pay, entries will appear here with status.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border/60">
                    <table className="w-full min-w-[480px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-border/60 bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-4 py-3 font-medium">Date</th>
                          <th className="px-4 py-3 font-medium">Amount</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentCommissions.map((c) => (
                          <tr key={c.id} className="border-b border-border/40 last:border-0">
                            <td className="px-4 py-3 text-muted-foreground tabular-nums">
                              {c.created_at
                                ? new Date(c.created_at).toLocaleDateString("en-ZA", {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  })
                                : "—"}
                            </td>
                            <td className="px-4 py-3 font-medium tabular-nums text-foreground">
                              {formatZar(c.amount)}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                  statusStyles[c.status] || "bg-muted text-muted-foreground"
                                }`}
                              >
                                {c.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
