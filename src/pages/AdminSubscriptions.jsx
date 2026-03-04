import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  PieChart, Pie, Cell,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import {
  Search, Download, Pause, Play, Trash2, AlertCircle,
  CheckCircle2, Clock, TrendingUp, Zap, RefreshCw, Flag, ArrowUpRight
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { getSupabaseErrorMessage } from '@/utils/supabaseErrorUtils';
import {
  getStatusBadgeColor, getStatusLabel, getPlanBadgeColor,
  getPaymentStatusBadgeColor,
  getBillingCycleLabel, formatCurrency, formatDate, formatDateTime,
  calculateCycleProgress,
  getRenewalStatusColor, getRenewalStatusText,
  sortSubscriptions, getPlanPrice
} from '@/utils/subscriptionManagementUtils';
import { PLANS, getPlanOrder } from '@/data/planLimits';
import { createPageUrl } from '@/utils';

// Generate dynamic plan colors, with fallback for custom plans
const generatePlanColor = (planKey, index) => {
  const defaultColors = {
    free: '#94a3b8',
    starter: '#3b82f6',
    professional: '#a855f7',
    enterprise: '#f59e0b'
  };
  if (defaultColors[planKey]) return defaultColors[planKey];
  // Generate color from hash for custom plans
  const hues = [0, 30, 60, 120, 180, 240, 280, 320];
  const hue = hues[index % hues.length];
  return `hsl(${hue}, 70%, 50%)`;
};

const getPlanColors = () => {
  const planOrder = getPlanOrder();
  const colors = {};
  planOrder.forEach((planKey, index) => {
    colors[planKey] = generatePlanColor(planKey, index);
  });
  return colors;
};

const STATUS_COLORS = {
  active: '#10b981',
  trial: '#3b82f6',
  paused: '#f59e0b',
  cancelled: '#ef4444'
};

export default function AdminSubscriptions() {
  const location = useLocation();
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get('tab') || 'overview';
  const initialSearchQuery = urlParams.get('search') || '';
  const initialHistorySearch = urlParams.get('historySearch') || '';
  const initialHistoryEvent = urlParams.get('historyEvent') || 'all';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [subscriptions, setSubscriptions] = useState([]);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPlan, setFilterPlan] = useState('all');
  const [sortBy, setSortBy] = useState('createdAt');

  // Data states
  const [summary, setSummary] = useState(null);
  const [upcomingRenewals, setUpcomingRenewals] = useState([]);
  const [failedPayments, setFailedPayments] = useState([]);
  const [billingHistory, setBillingHistory] = useState([]);
  const [historySearchQuery, setHistorySearchQuery] = useState(initialHistorySearch);
  const [historyEventType, setHistoryEventType] = useState(initialHistoryEvent);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [upgradeTarget, setUpgradeTarget] = useState(null);
  const [upgradePlan, setUpgradePlan] = useState('');
  const [upgradeReason, setUpgradeReason] = useState('');
  const [isFlagModalOpen, setIsFlagModalOpen] = useState(false);
  const [flagTarget, setFlagTarget] = useState(null);
  const [flagReason, setFlagReason] = useState('');
  const [flagError, setFlagError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nextTab = params.get('tab') || 'overview';
    const nextSearch = params.get('search') || '';
    const nextHistorySearch = params.get('historySearch') || '';
    const nextHistoryEvent = params.get('historyEvent') || 'all';
    setActiveTab(nextTab);
    setSearchQuery(nextSearch);
    setHistorySearchQuery(nextHistorySearch);
    setHistoryEventType(nextHistoryEvent);
  }, [location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const currentTab = params.get('tab') || 'overview';
    const currentSearch = params.get('search') || '';
    const currentHistorySearch = params.get('historySearch') || '';
    const currentHistoryEvent = params.get('historyEvent') || 'all';

    const shouldUpdate =
      currentTab !== activeTab ||
      currentSearch !== searchQuery ||
      currentHistorySearch !== historySearchQuery ||
      currentHistoryEvent !== historyEventType;

    if (!shouldUpdate) return;

    params.set('tab', activeTab);
    if (searchQuery) {
      params.set('search', searchQuery);
    } else {
      params.delete('search');
    }

    if (historySearchQuery) {
      params.set('historySearch', historySearchQuery);
    } else {
      params.delete('historySearch');
    }

    if (historyEventType && historyEventType !== 'all') {
      params.set('historyEvent', historyEventType);
    } else {
      params.delete('historyEvent');
    }

    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  }, [
    activeTab,
    historyEventType,
    historySearchQuery,
    location.pathname,
    location.search,
    navigate,
    searchQuery
  ]);

  const [loadError, setLoadError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data: allSubs, error: subError } = await supabase.from('subscriptions').select('*');
      if (subError) throw new Error(getSupabaseErrorMessage(subError, 'Failed to load subscriptions'));
      setSubscriptions(allSubs || []);
    } catch (error) {
      const msg = getSupabaseErrorMessage(error, 'Failed to load subscription data');
      setLoadError(msg);
      console.error('AdminSubscriptions loadData:', msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getBillingEventLabel = (eventType) => {
    const labels = {
      subscription_resumed: 'Subscription resumed',
      subscription_paused: 'Subscription paused',
      subscription_cancelled: 'Subscription cancelled',
      payment_status_recorded: 'Payment status updated',
      payment_retry_succeeded: 'Payment retry succeeded',
      plan_change: 'Plan changed',
      discount_applied: 'Discount applied',
      discount_removed: 'Discount removed',
      custom_plan_created: 'Custom plan created'
    };

    return labels[eventType] || eventType.replace(/_/g, ' ');
  };

  const getBillingEventBadge = (eventType) => {
    const badges = {
      subscription_resumed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      subscription_paused: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      subscription_cancelled: 'bg-red-100 text-red-700 border-red-200',
      payment_status_recorded: 'bg-primary/15 text-primary border-primary/20',
      payment_retry_succeeded: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      plan_change: 'bg-primary/15 text-primary border-primary/20',
      discount_applied: 'bg-purple-100 text-purple-700 border-purple-200',
      discount_removed: 'bg-slate-100 text-slate-700 border-slate-200',
      custom_plan_created: 'bg-orange-100 text-orange-700 border-orange-200'
    };

    return badges[eventType] || 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const historyEventTypes = useMemo(() => {
    return Array.from(new Set(billingHistory.map(entry => entry.eventType))).sort();
  }, [billingHistory]);

  const filteredHistory = useMemo(() => {
    const query = historySearchQuery.trim().toLowerCase();
    return billingHistory.filter((entry) => {
      if (historyEventType !== 'all' && entry.eventType !== historyEventType) {
        return false;
      }

      if (!query) return true;

      const subscription = subscriptions.find(sub => sub.id === entry.subscriptionId);
      const name = (subscription?.userName || '').toLowerCase();
      const email = (subscription?.userEmail || '').toLowerCase();
      const subId = (entry.subscriptionId || '').toLowerCase();

      return name.includes(query) || email.includes(query) || subId.includes(query);
    });
  }, [billingHistory, historyEventType, historySearchQuery, subscriptions]);

  const planChangeHistory = useMemo(() => {
    const planOrder = getPlanOrder();
    return billingHistory
      .filter(entry => entry.eventType === 'plan_change')
      .map(entry => {
        const fromPlan = entry.details?.from || 'free';
        const toPlan = entry.details?.to || 'free';
        const fromIndex = planOrder.indexOf(fromPlan);
        const toIndex = planOrder.indexOf(toPlan);
        let changeType = 'change';
        if (fromIndex !== -1 && toIndex !== -1) {
          if (toIndex > fromIndex) changeType = 'upgrade';
          if (toIndex < fromIndex) changeType = 'downgrade';
        }
        const subscription = subscriptions.find(sub => sub.id === entry.subscriptionId);

        return {
          id: entry.id,
          userName: subscription?.userName || 'Unknown',
          userEmail: subscription?.userEmail || '',
          fromPlan,
          toPlan,
          changeType,
          timestamp: entry.timestamp
        };
      })
      .slice(0, 6);
  }, [billingHistory, subscriptions]);

  // Filter and sort subscriptions
  const filteredSubscriptions = useMemo(() => {
    let filtered = subscriptions;

    if (searchQuery) {
      filtered = filtered.filter(sub =>
        sub.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sub.userEmail.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter(sub => sub.status === filterStatus);
    }

    if (filterPlan !== 'all') {
      filtered = filtered.filter(sub => sub.currentPlan === filterPlan);
    }

    return sortSubscriptions(filtered, sortBy, 'desc');
  }, [subscriptions, searchQuery, filterStatus, filterPlan, sortBy]);

  const reloadSubscriptions = async () => {
    const { data, error } = await supabase.from('subscriptions').select('*');
    if (!error) setSubscriptions(data ?? []);
    return error;
  };

  const handlePauseSubscription = async (subscriptionId) => {
    if (!window.confirm('Pause this subscription?')) return;
    try {
      const { error: updateError } = await supabase.from('subscriptions').update({ status: 'paused' }).eq('id', subscriptionId);
      if (updateError) throw new Error(getSupabaseErrorMessage(updateError, 'Failed to pause subscription'));
      await reloadSubscriptions();
    } catch (err) {
      console.error(getSupabaseErrorMessage(err, 'Pause failed'));
      alert(getSupabaseErrorMessage(err, 'Failed to pause subscription.'));
    }
  };

  const handleResumeSubscription = async (subscriptionId) => {
    if (!window.confirm('Resume this subscription?')) return;
    try {
      const { error: updateError } = await supabase.from('subscriptions').update({ status: 'active' }).eq('id', subscriptionId);
      if (updateError) throw new Error(getSupabaseErrorMessage(updateError, 'Failed to resume subscription'));
      await reloadSubscriptions();
    } catch (err) {
      console.error(getSupabaseErrorMessage(err, 'Resume failed'));
      alert(getSupabaseErrorMessage(err, 'Failed to resume subscription.'));
    }
  };

  const handleCancelSubscription = async (subscriptionId) => {
    if (!window.confirm('Cancel this subscription immediately?')) return;
    try {
      const { error: updateError } = await supabase.from('subscriptions').update({ status: 'cancelled' }).eq('id', subscriptionId);
      if (updateError) throw new Error(getSupabaseErrorMessage(updateError, 'Failed to cancel subscription'));
      await reloadSubscriptions();
    } catch (err) {
      console.error(getSupabaseErrorMessage(err, 'Cancel failed'));
      alert(getSupabaseErrorMessage(err, 'Failed to cancel subscription.'));
    }
  };

  const handleUpgradeSubscription = (sub) => {
    const planOrder = getPlanOrder();
    const currentIndex = planOrder.indexOf(sub.currentPlan);
    const suggestion = currentIndex >= 0 && currentIndex < planOrder.length - 1
      ? planOrder[currentIndex + 1]
      : sub.currentPlan;
    setUpgradeTarget(sub);
    setUpgradePlan(suggestion);
    setUpgradeReason('');
    setIsUpgradeModalOpen(true);
  };

  const confirmUpgrade = async () => {
    if (!upgradeTarget || !upgradePlan) return;
    if (upgradePlan === upgradeTarget.currentPlan) {
      setIsUpgradeModalOpen(false);
      return;
    }
    try {
      const { error: updateError } = await supabase.from('subscriptions').update({ currentPlan: upgradePlan }).eq('id', upgradeTarget.id);
      if (updateError) throw new Error(getSupabaseErrorMessage(updateError, 'Failed to upgrade plan'));
      setIsUpgradeModalOpen(false);
      setUpgradeTarget(null);
      setUpgradeReason('');
      await reloadSubscriptions();
    } catch (err) {
      console.error(getSupabaseErrorMessage(err, 'Upgrade failed'));
      alert(getSupabaseErrorMessage(err, 'Failed to upgrade plan.'));
    }
  };

  const handleFlagAccount = (sub) => {
    setFlagTarget(sub);
    setFlagReason('');
    setFlagError('');
    setIsFlagModalOpen(true);
  };

  const getPlanPreviewPrice = (planKey, cycle) => {
    const price = getPlanPrice(planKey, cycle) || 0;
    return formatCurrency(price);
  };

  const confirmFlag = async () => {
    if (!flagTarget) return;
    const reason = flagReason.trim();
    if (!reason) {
      setFlagError('Reason is required.');
      return;
    }
    try {
      const { error } = await supabase.from('users').update({ health: 'flagged', flag_reason: reason }).eq('id', flagTarget.userId);
      if (error) throw new Error(getSupabaseErrorMessage(error, 'Failed to flag account'));
      setIsFlagModalOpen(false);
      setFlagTarget(null);
      setFlagReason('');
      setFlagError('');
    } catch (err) {
      setFlagError(getSupabaseErrorMessage(err, 'Failed to flag account.'));
    }
  };

  const handleManualPaymentUpdate = async (payment, status) => {
    if (!payment?.subscriptionId) return;
    const statusLabel = status === 'succeeded' ? 'mark as paid' : 'mark as failed';
    if (!window.confirm(`Confirm ${statusLabel} for ${payment.userName}?`)) return;
    try {
      const { error } = await supabase.from('payments').update({ status }).eq('subscription_id', payment.subscriptionId);
      if (error) throw new Error(getSupabaseErrorMessage(error, 'Failed to update payment status'));
    } catch (err) {
      console.error(getSupabaseErrorMessage(err, 'Payment update failed'));
      alert(getSupabaseErrorMessage(err, 'Failed to update payment status.'));
    }
  };


  const handleExportData = async () => {
    try {
      const { data, error } = await supabase.from('subscriptions').select('*');
      if (error) throw new Error(getSupabaseErrorMessage(error, 'Failed to load subscriptions for export'));
      if (data?.length) {
        const timestamp = new Date().toISOString().split('T')[0];
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `subscriptions_${timestamp}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error(getSupabaseErrorMessage(err, 'Export failed'));
      alert(getSupabaseErrorMessage(err, 'Failed to export data.'));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-slate-600">Loading subscription data...</p>
          </div>
        </div>
      </div>
    );
  }

  // Empty state (no subscriptions)
  if (!loading && subscriptions.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-8">
        {loadError && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-4 text-amber-800" role="alert">
            {loadError}
          </div>
        )}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Subscription Management</h1>
          <p className="text-slate-600">Manage all platform subscriptions, plans, and billing cycles</p>
        </div>
        <Card className="bg-white border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <Zap className="w-16 h-16 mx-auto mb-4 text-slate-300" />
            <h3 className="text-xl font-semibold text-slate-900 mb-2">No Subscriptions Yet</h3>
            <p className="text-slate-600 mb-6">
              No user accounts have been created yet. Subscriptions will appear here once users sign up.
            </p>
            <Button onClick={loadData} variant="outline" className="flex items-center gap-2 mx-auto">
              <RefreshCw size={18} /> Refresh Data
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-4xl font-bold text-slate-900">Subscription Management</h1>
          <div className="flex gap-2">
            <Button onClick={loadData} variant="outline" className="flex items-center gap-2">
              <RefreshCw size={18} /> Refresh
            </Button>
            <Button onClick={handleExportData} variant="outline" className="flex items-center gap-2">
              <Download size={18} /> Export
            </Button>
          </div>
        </div>
        <p className="text-slate-600">
          Manage all platform subscriptions, plans, and billing cycles
          {subscriptions.length > 0 && ` · ${subscriptions.length} total subscriptions`}
        </p>
      </div>

      {/* Key Metrics */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Total Subs</p>
                  <p className="text-3xl font-bold text-slate-900">{summary.total}</p>
                </div>
                <TrendingUp size={32} className="text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Active</p>
                  <p className="text-3xl font-bold text-green-600">{summary.active}</p>
                </div>
                <CheckCircle2 size={32} className="text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">MRR</p>
                  <p className="text-2xl font-bold text-purple-600">{formatCurrency(summary.mrr)}</p>
                </div>
                <Zap size={32} className="text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">ARR</p>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(summary.arr)}</p>
                </div>
                <TrendingUp size={32} className="text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Paused</p>
                  <p className="text-3xl font-bold text-yellow-600">{summary.paused}</p>
                </div>
                <Clock size={32} className="text-yellow-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="renewals">Renewals</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Subscriptions by Plan */}
            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Subscriptions by Plan</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={Object.entries(summary?.plans || {})
                        .filter(([, count]) => count > 0)
                        .map(([plan, count], index) => ({
                          name: PLANS[plan]?.name || plan.charAt(0).toUpperCase() + plan.slice(1),
                          value: count,
                          fill: getPlanColors()[plan] || '#94a3b8'
                        }))}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {Object.entries(summary?.plans || {})
                        .filter(([, count]) => count > 0)
                        .map(([plan], index) => (
                          <Cell key={`cell-${index}`} fill={getPlanColors()[plan] || '#94a3b8'} />
                        ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Subscription Status */}
            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Status Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Active', value: summary?.active || 0, fill: STATUS_COLORS.active },
                        { name: 'Trial', value: summary?.trial || 0, fill: STATUS_COLORS.trial },
                        { name: 'Paused', value: summary?.paused || 0, fill: STATUS_COLORS.paused },
                        { name: 'Cancelled', value: summary?.cancelled || 0, fill: STATUS_COLORS.cancelled }
                      ].filter(item => item.value > 0)}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {[
                        STATUS_COLORS.active,
                        STATUS_COLORS.trial,
                        STATUS_COLORS.paused,
                        STATUS_COLORS.cancelled
                      ].map((fill, index) => (
                        <Cell key={`cell-${index}`} fill={fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Active vs Cancelled</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Active</span>
                  <span className="text-sm font-semibold text-slate-900">{summary?.active || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Cancelled</span>
                  <span className="text-sm font-semibold text-slate-900">{summary?.cancelled || 0}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-2 bg-emerald-500"
                    style={{
                      width: `${summary?.total ? Math.round((summary.active / summary.total) * 100) : 0}%`
                    }}
                  />
                </div>
                <p className="text-xs text-slate-500">
                  {summary?.total ? Math.round((summary.active / summary.total) * 100) : 0}% active
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Upgrade / Downgrade History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {planChangeHistory.length === 0 ? (
                  <p className="text-sm text-slate-500">No plan changes logged.</p>
                ) : (
                  planChangeHistory.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{entry.userName}</p>
                        <p className="text-xs text-slate-500">
                          {(PLANS[entry.fromPlan]?.name || entry.fromPlan)} → {(PLANS[entry.toPlan]?.name || entry.toPlan)}
                        </p>
                      </div>
                      <Badge
                        className={
                          entry.changeType === 'upgrade'
                            ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                            : entry.changeType === 'downgrade'
                              ? 'bg-rose-100 text-rose-700 border-rose-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                        }
                      >
                        {entry.changeType}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Trial Users</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold text-primary">{summary?.trial}</p>
                <p className="text-sm text-slate-600 mt-2">
                  {((summary?.trial / summary?.total) * 100).toFixed(1)}% of total
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Failed Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold text-red-600">{summary?.failed_payment}</p>
                <p className="text-sm text-slate-600 mt-2">Require attention</p>
              </CardContent>
            </Card>

            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Pending Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold text-yellow-600">{summary?.pending_payment}</p>
                <p className="text-sm text-slate-600 mt-2">In progress</p>
              </CardContent>
            </Card>

            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Cancelled</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold text-slate-600">{summary?.cancelled}</p>
                <p className="text-sm text-slate-600 mt-2">
                  {((summary?.cancelled / summary?.total) * 100).toFixed(1)}% of total
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Subscriptions Tab */}
        <TabsContent value="subscriptions" className="space-y-6">
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Filter & Search</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3">
                  <Search size={20} className="text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent border-none outline-none py-2"
                  />
                </div>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-slate-100 rounded-lg px-3 py-2 border-none outline-none"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="trial">Trial</option>
                  <option value="paused">Paused</option>
                  <option value="cancelled">Cancelled</option>
                </select>

                <select
                  value={filterPlan}
                  onChange={(e) => setFilterPlan(e.target.value)}
                  className="bg-slate-100 rounded-lg px-3 py-2 border-none outline-none"
                >
                  <option value="all">All Plans</option>
                  {getPlanOrder().map((planKey) => (
                    <option key={planKey} value={planKey}>
                      {PLANS[planKey]?.name || planKey.charAt(0).toUpperCase() + planKey.slice(1)}
                    </option>
                  ))}
                </select>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-slate-100 rounded-lg px-3 py-2 border-none outline-none"
                >
                  <option value="createdAt">Sort by Date</option>
                  <option value="name">Sort by Name</option>
                  <option value="plan">Sort by Plan</option>
                  <option value="renewal">Sort by Renewal</option>
                  <option value="amount">Sort by Amount</option>
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Subscriptions Table */}
          <Card className="bg-white border-0 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">User</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Plan</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Status</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Start Date</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Renewal Date</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Amount</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubscriptions.map((sub) => {
                    const cycle = sub.billingCycle === 'annual' ? 'annual' : 'monthly';
                    const basePrice = getPlanPrice(sub.currentPlan, cycle) || 0;
                    const amount = sub.customPrice || basePrice;

                    return (
                      <tr key={sub.id} className="border-b hover:bg-slate-50 transition">
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-slate-900">{sub.userName}</p>
                            <p className="text-sm text-slate-500">{sub.userEmail}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge className={getPlanBadgeColor(sub.currentPlan)}>
                            {sub.currentPlan.charAt(0).toUpperCase() + sub.currentPlan.slice(1)}
                          </Badge>
                          {sub.isCustomPlan && (
                            <p className="text-xs text-slate-600 mt-1">Custom</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <Badge className={getStatusBadgeColor(sub.status)}>
                            {getStatusLabel(sub.status)}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {formatDate(sub.createdAt)}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {formatDate(sub.renewalDate)}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-900">
                          {formatCurrency(amount)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {sub.status === 'active' ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handlePauseSubscription(sub.id)}
                                title="Pause"
                                className="text-yellow-600 hover:bg-yellow-50"
                              >
                                <Pause size={16} />
                              </Button>
                            ) : sub.status === 'paused' ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleResumeSubscription(sub.id)}
                                title="Resume"
                                className="text-green-600 hover:bg-green-50"
                              >
                                <Play size={16} />
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleUpgradeSubscription(sub)}
                              title="Upgrade"
                              className="text-primary hover:bg-primary/10"
                            >
                              <ArrowUpRight size={16} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleFlagAccount(sub)}
                              title="Flag account"
                              className="text-amber-600 hover:bg-amber-50"
                            >
                              <Flag size={16} />
                            </Button>
                            {sub.status !== 'cancelled' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleCancelSubscription(sub.id)}
                                title="Cancel"
                                className="text-red-600 hover:bg-red-50"
                              >
                                <Trash2 size={16} />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredSubscriptions.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                No subscriptions found matching your filters
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Renewals Tab */}
        <TabsContent value="renewals" className="space-y-6">
          <div className="grid grid-cols-1 gap-4">
            {upcomingRenewals && upcomingRenewals.length > 0 ? (
              upcomingRenewals.map((renewal) => (
                <Card key={renewal.subscriptionId} className="bg-white border-0 shadow-sm">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{renewal.userName}</p>
                        <p className="text-sm text-slate-600">{renewal.userEmail}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge className={getPlanBadgeColor(renewal.plan)}>
                            {renewal.plan.charAt(0).toUpperCase() + renewal.plan.slice(1)}
                          </Badge>
                          <span className="text-sm text-slate-600">
                            {renewal.daysUntilRenewal === 1 ? 'Tomorrow' : `In ${renewal.daysUntilRenewal} days`}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-slate-900">{formatCurrency(renewal.amount)}</p>
                        <p className="text-sm text-slate-600 mt-1">{formatDate(renewal.renewalDate)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card className="bg-white border-0 shadow-sm">
                <CardContent className="pt-6 text-center text-slate-500">
                  No renewals in the next 7 days
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="space-y-6">
          {failedPayments && failedPayments.length > 0 ? (
            <div className="grid grid-cols-1 gap-4">
              {failedPayments.map((payment) => (
                <Card
                  key={payment.subscriptionId}
                  className="bg-white border-0 shadow-sm border-l-4 border-red-500"
                >
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-red-100">
                          <AlertCircle size={20} className="text-red-600" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-slate-900">{payment.userName}</p>
                          <p className="text-sm text-slate-600">{payment.userEmail}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge className={getPlanBadgeColor(payment.plan)}>
                              {payment.plan.charAt(0).toUpperCase() + payment.plan.slice(1)}
                            </Badge>
                            <Badge className={getPaymentStatusBadgeColor(payment.type)}>
                              {payment.type === 'failed'
                                ? `Failed (${payment.failedCount}x)`
                                : 'Pending'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-slate-900">
                          {formatCurrency(payment.amount)}
                        </p>
                        <p className="text-sm text-slate-600 mt-1">
                          {formatDateTime(payment.lastAttempt)}
                        </p>
                        <div className="mt-3 flex items-center gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 border-green-300 hover:bg-green-50"
                            onClick={() => handleManualPaymentUpdate(payment, 'succeeded')}
                          >
                            Mark Paid
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-300 hover:bg-red-50"
                            onClick={() => handleManualPaymentUpdate(payment, 'failed')}
                          >
                            Mark Failed
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="bg-white border-0 shadow-sm">
              <CardContent className="pt-6 text-center text-slate-500">
                <CheckCircle2 size={32} className="mx-auto mb-2 text-green-500" />
                All payments are current
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Filter History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3">
                  <Search size={20} className="text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search by user or email..."
                    value={historySearchQuery}
                    onChange={(e) => setHistorySearchQuery(e.target.value)}
                    className="w-full bg-transparent border-none outline-none py-2"
                  />
                </div>
                <select
                  value={historyEventType}
                  onChange={(e) => setHistoryEventType(e.target.value)}
                  className="bg-slate-100 rounded-lg px-3 py-2 border-none outline-none"
                >
                  <option value="all">All events</option>
                  {historyEventTypes.map((eventType) => (
                    <option key={eventType} value={eventType}>
                      {getBillingEventLabel(eventType)}
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          {filteredHistory.length > 0 ? (
            <div className="space-y-3">
              {filteredHistory.slice(0, 50).map((entry) => {
                const subscription = subscriptions.find(sub => sub.id === entry.subscriptionId);
                const details = entry.details || {};
                const amount = details.amount !== undefined ? formatCurrency(details.amount) : null;
                const accountSearchValue = subscription?.userEmail || subscription?.userName || subscription?.userId;

                return (
                  <Card key={entry.id} className="bg-white border-0 shadow-sm">
                    <CardContent className="pt-6">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge className={getBillingEventBadge(entry.eventType)}>
                              {getBillingEventLabel(entry.eventType)}
                            </Badge>
                            <span className="text-xs text-slate-500">
                              {formatDateTime(entry.timestamp)}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600">
                            {subscription ? (
                              <span className="font-medium text-slate-900">
                                {subscription.userName} · {subscription.userEmail}
                              </span>
                            ) : (
                              <span className="font-medium text-slate-900">
                                Subscription: {entry.subscriptionId}
                              </span>
                            )}
                          </p>
                          {accountSearchValue && (
                            <Link
                              to={createPageUrl(`AdminAccounts?search=${encodeURIComponent(accountSearchValue)}`)}
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              View account
                            </Link>
                          )}
                          {accountSearchValue && (
                            <Link
                              to={createPageUrl(`AdminSubscriptions?tab=subscriptions&search=${encodeURIComponent(accountSearchValue)}`)}
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              View subscription
                            </Link>
                          )}
                          {details.status && (
                            <p className="text-xs text-slate-500">Status: {details.status}</p>
                          )}
                          {details.reason && (
                            <p className="text-xs text-slate-500">Reason: {details.reason}</p>
                          )}
                          {details.source && (
                            <p className="text-xs text-slate-500">Source: {details.source}</p>
                          )}
                        </div>
                        {amount && (
                          <div className="text-right">
                            <p className="text-sm font-semibold text-slate-900">{amount}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="bg-white border-0 shadow-sm">
              <CardContent className="pt-6 text-center text-slate-500">
                No billing history yet
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {isUpgradeModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md shadow-2xl">
            <CardHeader>
              <CardTitle>Upgrade subscription</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-slate-600">
                {upgradeTarget?.userName} · {upgradeTarget?.userEmail}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">New plan</label>
                <select
                  value={upgradePlan}
                  onChange={(e) => setUpgradePlan(e.target.value)}
                  className="w-full bg-slate-100 rounded-lg px-3 py-2 border-none outline-none"
                >
                  {getPlanOrder().map((planKey) => (
                    <option key={planKey} value={planKey}>
                      {PLANS[planKey]?.name || planKey.charAt(0).toUpperCase() + planKey.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 space-y-1">
                <div className="flex items-center justify-between">
                  <span>Current plan</span>
                  <span className="font-medium text-slate-900">
                    {PLANS[upgradeTarget?.currentPlan]?.name || upgradeTarget?.currentPlan || '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Billing cycle</span>
                  <span className="font-medium text-slate-900">
                    {upgradeTarget?.billingCycle ? getBillingCycleLabel(upgradeTarget.billingCycle) : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Selected plan (monthly)</span>
                  <span className="font-medium text-slate-900">
                    {getPlanPreviewPrice(upgradePlan, 'monthly')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Selected plan (annual)</span>
                  <span className="font-medium text-slate-900">
                    {getPlanPreviewPrice(upgradePlan, 'annual')}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Reason (optional)</label>
                <textarea
                  value={upgradeReason}
                  onChange={(e) => setUpgradeReason(e.target.value)}
                  placeholder="Why are you upgrading this account?"
                  className="min-h-[100px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsUpgradeModalOpen(false);
                    setUpgradeTarget(null);
                    setUpgradeReason('');
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" className="bg-primary hover:bg-primary/90" onClick={confirmUpgrade}>
                  Upgrade
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {isFlagModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md shadow-2xl">
            <CardHeader>
              <CardTitle>Flag account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-slate-600">
                {flagTarget?.userName} · {flagTarget?.userEmail}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Reason</label>
                <textarea
                  value={flagReason}
                  onChange={(e) => {
                    setFlagReason(e.target.value);
                    if (flagError) setFlagError('');
                  }}
                  placeholder="Add a reason for flagging this account"
                  className="min-h-[120px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              {flagError && (
                <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
                  {flagError}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsFlagModalOpen(false);
                    setFlagTarget(null);
                    setFlagReason('');
                    setFlagError('');
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" className="bg-amber-600 hover:bg-amber-700" onClick={confirmFlag}>
                  Flag account
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
