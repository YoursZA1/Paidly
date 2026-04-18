import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient, useIsFetching } from '@tanstack/react-query';
import { paidly } from '@/api/paidlyClient';
import { affiliateApplicationsAdminQueryFn } from '@/api/fetchAdminAffiliateApplications';
import {
  approveAffiliateApplication,
  declineAffiliateApplication,
  resendAffiliateReferralEmail,
} from '@/api/affiliateAdminModerationApi';
import AffiliateApprovalResultDialog from '@/components/affiliates/AffiliateApprovalResultDialog';
import { Search, CheckCircle, XCircle, Eye, Filter, Calculator, Copy, Mail, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import PageHeader from '@/components/dashboard/PageHeader';
import StatusBadge from '@/components/dashboard/StatusBadge';
import PayoutCalculator from '@/components/affiliates/PayoutCalculator';
import PayoutsTable from '@/components/affiliates/PayoutsTable';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLogger';
import { useCurrentUser } from '@/lib/useCurrentUser';
import {
  EMPTY_AFFILIATE_ADMIN_BUNDLE,
  normalizeAffiliateAdminQueryResult,
} from '@/utils/affiliateApplicationCounts';
import { formatQueryError } from '@/utils/apiErrorText';
import { stableEntityRowKey } from '@/utils/stableListKey';
import { SystemSettingsService } from '@/services/SystemSettingsService';
import { createAffiliateSignupShareUrl } from '@/utils';

export default function AffiliatesPage() {
  const { user: currentUser } = useCurrentUser();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewingApp, setViewingApp] = useState(null);
  const [calculatingFor, setCalculatingFor] = useState(null);
  /** Set after successful POST /api/admin/approve — admin confirmation + same link emailed to the affiliate. */
  const [approvalNotice, setApprovalNotice] = useState(null);
  const queryClient = useQueryClient();
  const hasAlertedErrorRef = useRef(false);
  const isRefreshing =
    useIsFetching({
      predicate: (q) => ['affiliates', 'affiliate-payouts'].includes(String(q.queryKey[0])),
    }) > 0;

  const {
    data: affiliateAdmin = EMPTY_AFFILIATE_ADMIN_BUNDLE,
    isLoading,
    isError: affiliatesFetchError,
    error: affiliatesFetchErr,
  } = useQuery({
    queryKey: ['affiliates'],
    select: normalizeAffiliateAdminQueryResult,
    queryFn: () => affiliateApplicationsAdminQueryFn(),
    refetchInterval: 45000,
    staleTime: 30000,
  });
  const affiliates = affiliateAdmin.applications;
  const affiliateStatusCounts = affiliateAdmin.counts;

  useEffect(() => {
    if (!affiliatesFetchError || !affiliatesFetchErr) return;
    if (hasAlertedErrorRef.current) return;

    const formatted = formatQueryError(affiliatesFetchErr);
    if (formatted === '[object Object]' || formatted === 'Unknown error') {
      // Step 4 debugging aid: surface the full error object instead of a useless string.
      console.error(affiliatesFetchErr);
      const payload =
        affiliatesFetchErr instanceof Error
          ? { name: affiliatesFetchErr.name, message: affiliatesFetchErr.message, stack: affiliatesFetchErr.stack }
          : affiliatesFetchErr;
      try {
        alert(JSON.stringify(payload));
      } catch {
        alert(String(payload));
      }
      hasAlertedErrorRef.current = true;
    }
  }, [affiliatesFetchError, affiliatesFetchErr]);

  const { data: payouts = [] } = useQuery({
    queryKey: ['affiliate-payouts'],
    queryFn: () => paidly.entities.AffiliatePayout.list('-created_date', 150),
    refetchInterval: 45000,
    staleTime: 30000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => paidly.entities.AffiliateSubmission.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['affiliates'] });
      toast.success('Affiliate submission updated');
    },
  });

  const copyReferralLink = async (code) => {
    if (!code) return;
    const origin = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '');
    const url = createAffiliateSignupShareUrl(code, origin);
    await navigator.clipboard.writeText(url);
    toast.success('Link copied');
  };

  const defaultCommissionPct = SystemSettingsService.getAffiliateDefaultCommissionPercent();

  const handleApprove = async (aff) => {
    try {
      const result = await approveAffiliateApplication({
        applicationId: aff.id,
        commissionRate: Number(aff.commission_rate ?? defaultCommissionPct),
      });
      queryClient.invalidateQueries({ queryKey: ['affiliates'] });

      const origin = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '');
      const code = String(result?.referral_code || '').trim();
      const link =
        String(result?.referral_link || '').trim() ||
        (code ? createAffiliateSignupShareUrl(code, origin) : '');

      setApprovalNotice({
        applicantName: String(aff.applicant_name || '').trim() || 'Applicant',
        applicantEmail: String(aff.applicant_email || '').trim(),
        referralCode: code,
        referralLink: link,
        emailSent: result?.email_sent !== false,
        emailError: result?.email_error != null ? String(result.email_error) : null,
      });

      toast.success('Affiliate approved', {
        description:
          result?.email_sent === false
            ? 'Approval saved — email could not be sent. Use the dialog to copy their link.'
            : `Confirmation email sent to ${String(aff.applicant_email || '').trim() || 'applicant'}.`,
      });

      logAction({
        actor: currentUser,
        action: AUDIT_ACTIONS.AFFILIATE_APPROVED,
        category: 'affiliates',
        description: `Approved affiliate application for ${aff.applicant_name} (${aff.applicant_email})`,
        targetId: aff.id,
        targetLabel: aff.applicant_email,
        before: { status: 'pending' },
        after: {
          status: 'approved',
          referral_code: result?.referral_code,
          referral_link: result?.referral_link,
          user_id: result?.user_id,
          email_sent: result?.email_sent,
        },
      });
      return true;
    } catch (e) {
      toast.error(e?.message || 'Could not approve affiliate');
      return false;
    }
  };

  const handleResend = async (aff) => {
    try {
      const result = await resendAffiliateReferralEmail({ applicationId: aff.id });
      const origin = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '');
      const code = String(result?.referral_code || '').trim();
      const link =
        String(result?.referral_link || '').trim() ||
        (code ? createAffiliateSignupShareUrl(code, origin) : '');
      setApprovalNotice({
        applicantName: String(aff.applicant_name || '').trim() || 'Applicant',
        applicantEmail: String(aff.applicant_email || '').trim(),
        referralCode: code,
        referralLink: link,
        emailSent: true,
        emailError: null,
        isResend: true,
      });
      toast.success('Referral link emailed again', {
        description: `Sent to ${String(aff.applicant_email || '').trim() || 'applicant'}.`,
      });
    } catch (e) {
      toast.error(e?.message || 'Could not resend link');
    }
  };

  const handleCommissionUpdate = (aff, nextRate) => {
    const parsed = Number(nextRate);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
      toast.error('Commission rate must be between 0 and 100');
      return;
    }
    updateMutation.mutate({ id: aff.id, data: { commission_rate: parsed } });
  };

  const handleDecline = async (aff) => {
    try {
      await declineAffiliateApplication({ applicationId: aff.id });
      queryClient.invalidateQueries({ queryKey: ['affiliates'] });
      toast.success('Application declined');
      logAction({
        actor: currentUser,
        action: AUDIT_ACTIONS.AFFILIATE_DECLINED,
        category: 'affiliates',
        description: `Declined affiliate application for ${aff.applicant_name} (${aff.applicant_email})`,
        targetId: aff.id,
        targetLabel: aff.applicant_email,
        before: { status: 'pending' },
        after: { status: 'declined' },
      });
      return true;
    } catch (e) {
      toast.error(e?.message || 'Could not decline application');
      return false;
    }
  };

  const payoutsByAffiliateId = useMemo(() => {
    const map = new Map();
    for (const p of payouts) {
      const key = String(p.affiliate_id || '');
      if (!key) continue;
      const arr = map.get(key) || [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [payouts]);

  const filtered = useMemo(() => {
    return affiliates.filter((a) => {
      const matchSearch =
        !search ||
        (a.applicant_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (a.applicant_email || '').toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'all' || a.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [affiliates, search, statusFilter]);

  const pendingCount = affiliateStatusCounts.pending;
  const pendingPayoutsTotal = useMemo(
    () =>
      payouts
        .filter((p) => p.status === 'pending' || p.status === 'approved')
        .reduce((s, p) => s + Number(p.commission_amount ?? p.amount ?? 0), 0),
    [payouts]
  );

  return (
    <div>
      <PageHeader
        title="Affiliates"
        description={`${pendingCount} pending reviews · R ${pendingPayoutsTotal.toFixed(2)} in unpaid payouts`}
        onRefresh={() => {
          queryClient.invalidateQueries({ queryKey: ['affiliates'] });
          queryClient.invalidateQueries({ queryKey: ['affiliate-payouts'] });
        }}
        isRefreshing={isRefreshing}
      />

      {affiliatesFetchError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            Could not load affiliate submissions (admin queue is not read from Supabase in the browser):{' '}
            {formatQueryError(affiliatesFetchErr)}. Test{' '}
            <code className="rounded bg-muted px-1">GET /api/admin/affiliates</code> with a Bearer token — not this page URL (
            <code className="rounded bg-muted px-1">/admin-v2/affiliates</code> is the SPA). Prefer same-origin{' '}
            <code className="rounded bg-muted px-1">/api/admin/affiliates</code> when app and API share one deployment (leave{' '}
            <code className="rounded bg-muted px-1">VITE_SERVER_URL</code> unset). Otherwise point{' '}
            <code className="rounded bg-muted px-1">VITE_SERVER_URL</code> at your API and ensure Vercel has{' '}
            <code className="rounded bg-muted px-1">SUPABASE_URL</code> and a valid service-role{' '}
            <code className="rounded bg-muted px-1">SUPABASE_SERVICE_ROLE_KEY</code>.
          </AlertDescription>
        </Alert>
      ) : null}

      {!affiliatesFetchError ? (
        <div className="mb-4 rounded-md border border-border bg-muted/25 px-4 py-2 text-xs text-muted-foreground">
          Data source table:{' '}
          <code className="rounded bg-muted px-1 font-mono text-foreground">affiliate_applications</code>
          <span className="mx-1 text-muted-foreground/80">·</span>
          Partner profiles (when shown) come from <code className="rounded bg-muted px-1 font-mono text-foreground">affiliates</code>
          <span className="mx-1 text-muted-foreground/80">·</span>
          <code className="rounded bg-muted px-1">GET /api/admin/affiliates</code>
        </div>
      ) : null}

      <Tabs defaultValue="submissions" className="space-y-6">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="submissions" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Submissions
            {pendingCount > 0 && (
              <span className="ml-2 bg-primary/20 text-primary text-xs px-1.5 py-0.5 rounded-full data-[state=active]:bg-white/20 data-[state=active]:text-white">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="payouts" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Payouts
            {payouts.filter((p) => p.status !== 'paid').length > 0 && (
              <span className="ml-2 bg-primary/20 text-primary text-xs px-1.5 py-0.5 rounded-full data-[state=active]:bg-white/20 data-[state=active]:text-white">
                {payouts.filter((p) => p.status !== 'paid').length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="submissions" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Pending', count: affiliateStatusCounts.pending, color: 'border-blue-500/30' },
              { label: 'Approved', count: affiliateStatusCounts.approved, color: 'border-emerald-500/30' },
              { label: 'Declined', count: affiliateStatusCounts.declined, color: 'border-red-500/30' },
            ].map((s) => (
              <div key={s.label} className={`bg-card rounded-xl border-2 ${s.color} p-5`}>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold mt-1">{s.count}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search affiliates..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-card" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px] bg-card">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="declined">Declined</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left px-6 py-3 font-medium">Applicant</th>
                    <th className="text-left px-6 py-3 font-medium">Type</th>
                    <th className="text-left px-6 py-3 font-medium">Status</th>
                    <th className="text-left px-6 py-3 font-medium">Linked User</th>
                    <th className="text-left px-6 py-3 font-medium">Referral Code</th>
                    <th className="text-left px-6 py-3 font-medium">Commission</th>
                    <th className="text-left px-6 py-3 font-medium">Referrals</th>
                    <th className="text-left px-6 py-3 font-medium">Total Earnings</th>
                    <th className="text-left px-6 py-3 font-medium">Submitted</th>
                    <th className="text-right px-6 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((aff, affIdx) => {
                    const rowKey = stableEntityRowKey(aff, affIdx);
                    const payoutKey = String(aff.affiliate_partner_id || '');
                    const affPayouts = (payoutKey && payoutsByAffiliateId.get(payoutKey)) || [];
                    const totalEarnings = affPayouts.reduce((s, p) => s + Number(p.commission_amount ?? p.amount ?? 0), 0);
                    return (
                      <tr key={rowKey} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium">{aff.applicant_name}</p>
                          <p className="text-xs text-muted-foreground">{aff.applicant_email}</p>
                        </td>
                        <td className="px-6 py-4 text-sm capitalize text-muted-foreground">{aff.audience_type || '—'}</td>
                        <td className="px-6 py-4"><StatusBadge status={aff.status} /></td>
                        <td className="px-6 py-4 text-xs">
                          {aff.user_id ? (
                            <span className="text-emerald-500">Linked</span>
                          ) : (
                            <span className="text-amber-500">Not linked</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs font-mono text-muted-foreground">{aff.referral_code || '—'}</td>
                        <td className="px-6 py-4">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            className="h-8 w-20"
                            disabled={aff.status !== 'approved'}
                            title={
                              aff.status !== 'approved'
                                ? 'Commission can be adjusted after the application is approved'
                                : 'Updates the partner rate used for new subscription commissions'
                            }
                            defaultValue={Number(aff.commission_rate ?? defaultCommissionPct)}
                            key={`${rowKey}-${aff.commission_rate}`}
                            onBlur={(e) => handleCommissionUpdate(aff, e.target.value)}
                          />
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <span className="font-medium tabular-nums">{aff.referrals_count ?? 0}</span>
                          {(aff.referrals_subscribed_count > 0 || aff.referrals_paid_count > 0) && (
                            <span className="block text-xs text-muted-foreground tabular-nums">
                              {aff.referrals_subscribed_count ?? 0} subscriber
                              {(aff.referrals_subscribed_count ?? 0) === 1 ? '' : 's'} · {aff.referrals_paid_count ?? 0}{' '}
                              paid
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-primary">
                          R{' '}
                          {(totalEarnings > 0 ? totalEarnings : Number(aff.earnings || 0)).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">
                          {aff.created_date ? format(new Date(aff.created_date), 'dd MMM yyyy') : '—'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {aff.referral_code ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Copy referral link"
                                onClick={() => copyReferralLink(aff.referral_code)}
                              >
                                <Copy className="w-4 h-4" />
                              </Button>
                            ) : null}
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewingApp(aff)}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            {aff.status === 'approved' ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Resend referral link"
                                onClick={() => handleResend(aff)}
                              >
                                <Mail className="w-4 h-4" />
                              </Button>
                            ) : null}
                            {aff.status === 'approved' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-primary hover:text-primary/80"
                                title="Generate Payout"
                                onClick={() => setCalculatingFor(aff)}
                              >
                                <Calculator className="w-4 h-4" />
                              </Button>
                            )}
                            {aff.status === 'pending' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-emerald-500 hover:text-emerald-400"
                                  aria-label="Approve application"
                                  onClick={() => handleApprove(aff)}
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-red-500 hover:text-red-400"
                                  aria-label="Decline application"
                                  onClick={() => handleDecline(aff)}
                                >
                                  <XCircle className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-6 py-12 text-center text-muted-foreground text-sm">
                        {isLoading ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading affiliates...
                          </span>
                        ) : affiliates.length === 0 ? (
                          <span className="block max-w-md mx-auto space-y-2 text-left">
                            <span className="block font-medium text-foreground">No submissions in the queue yet.</span>
                            <span className="block text-xs leading-relaxed text-muted-foreground">
                              The list is everything in <code className="rounded bg-muted px-1 font-mono text-foreground">affiliate_applications</code> returned by the admin API (see the data source note above). Empty usually means no applications yet, or this deployment points at a Supabase project that does not have those rows.
                            </span>
                          </span>
                        ) : (
                          <span>
                            No rows match your search or status filter. Try &quot;All Status&quot; or clear the search box.
                          </span>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="payouts">
          <PayoutsTable />
        </TabsContent>
      </Tabs>

      <Dialog open={!!viewingApp} onOpenChange={() => setViewingApp(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Affiliate application</DialogTitle>
            <DialogDescription>
              Review the applicant below. Approving grants affiliate access, creates their referral code, and emails
              their share link when email is configured. Decline rejects the application.
            </DialogDescription>
          </DialogHeader>
          {viewingApp && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-muted-foreground">Name</p><p className="font-medium">{viewingApp.applicant_name}</p></div>
                <div><p className="text-xs text-muted-foreground">Email</p><p className="font-medium">{viewingApp.applicant_email}</p></div>
                <div><p className="text-xs text-muted-foreground">Audience Type</p><p className="font-medium capitalize">{viewingApp.audience_type || '—'}</p></div>
                <div><p className="text-xs text-muted-foreground">Audience Size</p><p className="font-medium">{viewingApp.audience_size || '—'}</p></div>
                <div><p className="text-xs text-muted-foreground">Linked User</p><p className="font-medium">{viewingApp.user_id ? 'Yes' : 'No (email match required)'}</p></div>
                <div><p className="text-xs text-muted-foreground">Referral Code</p><p className="font-mono text-xs">{viewingApp.referral_code || 'Will be generated on approval'}</p></div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Description</p>
                <p className="text-sm bg-muted/30 rounded-lg p-3">{viewingApp.description || 'No description provided'}</p>
              </div>
              {viewingApp.status === 'pending' && (
                <div className="flex gap-3 pt-2">
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    aria-label="Approve application"
                    onClick={async () => {
                      const app = viewingApp;
                      if (!app) return;
                      const ok = await handleApprove(app);
                      if (ok) setViewingApp(null);
                    }}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" /> Approve
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 text-red-500 border-red-500/30 hover:bg-red-500/10"
                    aria-label="Decline application"
                    onClick={async () => {
                      if (await handleDecline(viewingApp)) setViewingApp(null);
                    }}
                  >
                    <XCircle className="w-4 h-4 mr-2" /> Decline
                  </Button>
                </div>
              )}
              {viewingApp.status === 'approved' && (
                <Button className="w-full bg-primary" onClick={() => { setViewingApp(null); setCalculatingFor(viewingApp); }}>
                  <Calculator className="w-4 h-4 mr-2" /> Generate Payout
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AffiliateApprovalResultDialog
        notice={approvalNotice}
        onOpenChange={(open) => {
          if (!open) setApprovalNotice(null);
        }}
      />

      <PayoutCalculator
        open={!!calculatingFor}
        onClose={() => setCalculatingFor(null)}
        affiliate={calculatingFor}
      />
    </div>
  );
}
