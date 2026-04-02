import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient, useIsFetching } from '@tanstack/react-query';
import { paidly } from '@/api/paidlyClient';
import {
  affiliateApplicationsAdminQueryFn,
  resolveAffiliateAdminMutationUrl,
} from '@/api/fetchAdminAffiliateApplications';
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
import { supabase } from '@/lib/supabaseClient';
import {
  EMPTY_AFFILIATE_ADMIN_BUNDLE,
  normalizeAffiliateAdminQueryResult,
} from '@/utils/affiliateApplicationCounts';

export default function AffiliatesPage() {
  const { user: currentUser } = useCurrentUser();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewingApp, setViewingApp] = useState(null);
  const [calculatingFor, setCalculatingFor] = useState(null);
  const queryClient = useQueryClient();
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
    queryFn: () => affiliateApplicationsAdminQueryFn(150),
    refetchInterval: 45000,
    staleTime: 30000,
  });
  const affiliates = affiliateAdmin.applications;
  const affiliateStatusCounts = affiliateAdmin.counts;

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

  const getAccessToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  };

  const callAdminAffiliateApi = async (path, body) => {
    const token = await getAccessToken();
    if (!token) throw new Error('Not authenticated');
    const url = resolveAffiliateAdminMutationUrl(path);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body || {}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.message || json?.error || `Request failed (${res.status})`);
    return json;
  };

  const copyReferralLink = async (code) => {
    if (!code) return;
    const base = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '');
    const url = `${base}/Signup#sign-up?ref=${encodeURIComponent(code)}`;
    await navigator.clipboard.writeText(url);
    toast.success('Link copied');
  };

  const handleApprove = async (aff) => {
    try {
      const result = await callAdminAffiliateApi('/api/admin/approve', {
        applicationId: aff.id,
        commissionRate: Number(aff.commission_rate ?? 15),
      });
      queryClient.invalidateQueries({ queryKey: ['affiliates'] });
      toast.success(result?.email_sent === false ? 'Approved (email failed)' : 'Approved & emailed link');

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
    } catch (e) {
      toast.error(e?.message || 'Could not approve affiliate');
    }
  };

  const handleResend = async (aff) => {
    try {
      const result = await callAdminAffiliateApi('/api/affiliates/resend-link', { applicationId: aff.id });
      toast.success('Referral link resent');
      if (result?.referral_code) {
        await copyReferralLink(result.referral_code).catch(() => {});
      }
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
      await callAdminAffiliateApi('/api/admin/decline', { applicationId: aff.id });
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
      const key = String(p.affiliate_id || p.referral_id || '');
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
  const affiliateSourceTables = useMemo(() => {
    const tables = new Set(
      affiliates
        .map((a) => String(a?.__source_table || '').trim())
        .filter(Boolean)
    );
    return [...tables];
  }, [affiliates]);
  const sourceTableLabel = useMemo(() => {
    if (affiliateSourceTables.length === 0) return null;
    if (affiliateSourceTables.length === 1) return affiliateSourceTables[0];
    return affiliateSourceTables.join(', ');
  }, [affiliateSourceTables]);
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
            Could not load affiliate submissions from the backend (admin queue is not loaded via Supabase):{' '}
            {affiliatesFetchErr?.message || 'Unknown error'}. Check that{' '}
            <code className="rounded bg-muted px-1">GET /api/admin/affiliates</code> returns JSON on this
            host (Vercel serverless) or your <code className="rounded bg-muted px-1">VITE_SERVER_URL</code>{' '}
            API. If the app and API are the same deployment, try clearing or updating{' '}
            <code className="rounded bg-muted px-1">VITE_SERVER_URL</code> so it does not point at a dead host.
          </AlertDescription>
        </Alert>
      ) : null}

      {sourceTableLabel ? (
        <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-800">
          Data source table: <span className="font-mono">{sourceTableLabel}</span>
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
                  {filtered.map((aff) => {
                    const affPayouts = payoutsByAffiliateId.get(String(aff.id)) || [];
                    const totalEarnings = affPayouts.reduce((s, p) => s + Number(p.commission_amount ?? p.amount ?? 0), 0);
                    return (
                      <tr key={aff.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
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
                            className="h-8 w-20"
                            defaultValue={Number(aff.commission_rate ?? 15)}
                            onBlur={(e) => handleCommissionUpdate(aff, e.target.value)}
                          />
                        </td>
                        <td className="px-6 py-4 text-sm">{aff.referrals_count || 0}</td>
                        <td className="px-6 py-4 text-sm font-medium text-primary">
                          R {totalEarnings > 0 ? totalEarnings.toFixed(2) : Number(aff.earnings || 0).toFixed(2)}
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
                          <span className="block max-w-md mx-auto space-y-2">
                            <span className="block">No submissions loaded yet.</span>
                            <span className="block text-xs">
                              The admin queue is loaded only from the backend. Confirm the Node API is deployed and{' '}
                              <code className="rounded bg-muted px-1">VITE_SERVER_URL</code> points to it so{' '}
                              <code className="rounded bg-muted px-1">GET /api/admin/affiliates</code> returns the full queue (service role). If the API returns an empty list, the
                              table is empty or check server logs.
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
            <DialogTitle>Affiliate Application</DialogTitle>
            <DialogDescription className="sr-only">Review applicant details and approve or decline.</DialogDescription>
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
                    onClick={() => {
                      handleApprove(viewingApp);
                      setViewingApp(null);
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

      <PayoutCalculator
        open={!!calculatingFor}
        onClose={() => setCalculatingFor(null)}
        affiliate={calculatingFor}
      />
    </div>
  );
}
