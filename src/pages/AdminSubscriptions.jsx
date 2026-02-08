import { useState, useEffect, useMemo } from 'react';
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
  CheckCircle2, Clock, TrendingUp, Zap, RefreshCw, CreditCard
} from 'lucide-react';
import SubscriptionManagementService from '@/services/SubscriptionManagementService';
import { exportDataAsJSON, subscribeToAdminDataChanges } from '@/services/AdminCommonService';
import {
  getStatusBadgeColor, getStatusLabel, getPlanBadgeColor,
  getPaymentStatusBadgeColor,
  getBillingCycleLabel, formatCurrency, formatDate, formatDateTime,
  calculateCycleProgress,
  getRenewalStatusColor, getRenewalStatusText,
  sortSubscriptions, getPlanPrice
} from '@/utils/subscriptionManagementUtils';
import { PLANS, getPlanOrder } from '@/data/planLimits';
import UserCurrencyService from '@/services/UserCurrencyService';
import PayfastService from '@/services/PayfastService';
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
  const [payfastLoadingId, setPayfastLoadingId] = useState(null);

  // Data states
  const [summary, setSummary] = useState(null);
  const [upcomingRenewals, setUpcomingRenewals] = useState([]);
  const [failedPayments, setFailedPayments] = useState([]);
  const [billingHistory, setBillingHistory] = useState([]);
  const [historySearchQuery, setHistorySearchQuery] = useState(initialHistorySearch);
  const [historyEventType, setHistoryEventType] = useState(initialHistoryEvent);

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

  // Load data on mount
  useEffect(() => {
    loadData();

    // Subscribe to data changes from other admin pages
    const unsubscribe = subscribeToAdminDataChanges((data) => {
      if (data.eventType === 'userUpdated' || data.eventType === 'planChanged' || data.eventType === 'dataRefreshed') {
        console.log('🔄 AdminSubscriptions: Data changed, reloading', data);
        loadData();
      }
    });

    return () => unsubscribe();
  }, []);

  const loadData = () => {
    setLoading(true);
    try {
      const allSubs = SubscriptionManagementService.getAllSubscriptions();
      console.log('📊 Admin Subscriptions - Loaded data:', {
        count: allSubs.length,
        subscriptions: allSubs
      });
      setSubscriptions(allSubs);

      const summaryData = SubscriptionManagementService.getSubscriptionSummary();
      console.log('💰 Subscription Summary:', summaryData);
      setSummary(summaryData);

      const renewals = SubscriptionManagementService.getUpcomingRenewals();
      setUpcomingRenewals(renewals);

      const failed = SubscriptionManagementService.getFailedAndPendingPayments();
      setFailedPayments(failed);

      const history = SubscriptionManagementService.getBillingHistory();
      setBillingHistory(history);
    } catch (error) {
      console.error('Error loading subscription data:', error);
    } finally {
      setLoading(false);
    }
  };

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
      payment_status_recorded: 'bg-blue-100 text-blue-700 border-blue-200',
      payment_retry_succeeded: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      plan_change: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      discount_applied: 'bg-purple-100 text-purple-700 border-purple-200',
      discount_removed: 'bg-slate-100 text-slate-700 border-slate-200',
      custom_plan_created: 'bg-cyan-100 text-cyan-700 border-cyan-200'
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

  const handlePauseSubscription = (subscriptionId) => {
    if (window.confirm('Pause this subscription?')) {
      SubscriptionManagementService.pauseSubscription(subscriptionId, 'Paused by admin');
      loadData();
    }
  };

  const handleResumeSubscription = (subscriptionId) => {
    if (window.confirm('Resume this subscription?')) {
      SubscriptionManagementService.resumeSubscription(subscriptionId, 'Resumed by admin');
      loadData();
    }
  };

  const handleCancelSubscription = (subscriptionId) => {
    if (window.confirm('Cancel this subscription immediately?')) {
      SubscriptionManagementService.cancelSubscription(subscriptionId, 'Cancelled by admin', true);
      loadData();
    }
  };

  const handleManualPaymentUpdate = (payment, status) => {
    if (!payment?.subscriptionId) return;

    const statusLabel = status === 'succeeded' ? 'mark as paid' : 'mark as failed';
    if (!window.confirm(`Confirm ${statusLabel} for ${payment.userName}?`)) {
      return;
    }

    SubscriptionManagementService.recordPaymentStatus(
      payment.subscriptionId,
      status,
      payment.amount || 0,
      { manual: true, updatedBy: 'admin' }
    );

    loadData();
  };

  const handleStartPayfastSubscription = async (sub) => {
    const cycle = sub.billingCycle === 'annual' ? 'annual' : 'monthly';
    const basePrice = getPlanPrice(sub.currentPlan, cycle) || 0;
    const amount = sub.customPrice || basePrice;

    if (!amount || amount <= 0) {
      alert('Plan price must be greater than 0 to start a subscription.');
      return;
    }

    setPayfastLoadingId(sub.id);
    try {
      await PayfastService.startSubscription({
        subscriptionId: sub.id,
        userId: sub.userId,
        userEmail: sub.userEmail,
        userName: sub.userName,
        plan: sub.currentPlan,
        billingCycle: cycle,
        amount,
        currency: 'ZAR'
      });

      SubscriptionManagementService.recordPaymentStatus(
        sub.id,
        'pending',
        amount,
        { gateway: 'payfast' }
      );
      loadData();
    } catch (error) {
      console.error('Error starting Payfast subscription:', error);
      alert(error.message || 'Failed to start Payfast subscription.');
    } finally {
      setPayfastLoadingId(null);
    }
  };

  const handleExportData = () => {
    const data = SubscriptionManagementService.exportSubscriptions();
    const timestamp = new Date().toISOString().split('T')[0];
    exportDataAsJSON(data, `subscriptions_${timestamp}.json`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-slate-600">Loading subscription data...</p>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!loading && subscriptions.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-8">
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
                <TrendingUp size={32} className="text-blue-500" />
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
                  <p className="text-2xl font-bold text-indigo-600">{formatCurrency(summary.arr)}</p>
                </div>
                <TrendingUp size={32} className="text-indigo-500" />
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

          {/* Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Trial Users</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold text-blue-600">{summary?.trial}</p>
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
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Billing</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Price Preview</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">User Currency</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Renewal</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Amount (ZAR)</th>
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
                          {getBillingCycleLabel(sub.billingCycle)}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <div className="space-y-1">
                            <p className="text-slate-600">
                              <span className="font-medium">Monthly:</span> {formatCurrency(getPlanPrice(sub.currentPlan, 'monthly') || 0)}
                            </p>
                            <p className="text-slate-600">
                              <span className="font-medium">Annual:</span> {formatCurrency(getPlanPrice(sub.currentPlan, 'annual') || 0)}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <div className="flex items-center flex-col gap-1">
                            <span className="font-medium text-slate-900">
                              {UserCurrencyService.getUserCurrency(sub.userId) || 'ZAR'}
                            </span>
                            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                              Admin: ZAR
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className={`text-sm font-medium ${getRenewalStatusColor(sub.renewalDate)}`}>
                            {getRenewalStatusText(sub.renewalDate)}
                          </p>
                          <div className="w-24 bg-slate-200 rounded-full h-2 mt-2">
                            <div
                              className="h-2 rounded-full bg-blue-500"
                              style={{ width: `${calculateCycleProgress(sub.currentCycleStart, sub.renewalDate)}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-900">
                          {formatCurrency(amount)} ZAR
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleStartPayfastSubscription(sub)}
                              title="Start Payfast subscription"
                              className="text-blue-600 hover:bg-blue-50"
                              disabled={payfastLoadingId === sub.id || sub.status === 'cancelled'}
                            >
                              <CreditCard size={16} />
                            </Button>
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
                              className="text-xs font-medium text-blue-600 hover:underline"
                            >
                              View account
                            </Link>
                          )}
                          {accountSearchValue && (
                            <Link
                              to={createPageUrl(`AdminSubscriptions?tab=subscriptions&search=${encodeURIComponent(accountSearchValue)}`)}
                              className="text-xs font-medium text-blue-600 hover:underline"
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
    </div>
  );
}
