/**
 * Admin Accounts Management
 * Platform-level business account management with usage tracking and health monitoring
 */

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/components/auth/AuthContext';
import {
  PieChart, Pie, Cell,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import {
  Search, Download, Edit2, Pause, Play, AlertCircle,
  TrendingUp, Building2, HardDrive, AlertTriangle, Check, X,
  FileText, RefreshCw
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import AdminDataService from '@/services/AdminDataService';
import { syncAdminData } from '@/services/AdminSupabaseSyncService';
import { getAllUsersInvoices } from '@/utils/adminDataAggregator';
import { createPageUrl } from '@/utils';
import AuditLogService from '@/services/AuditLogService';
import NotificationService from '@/components/notifications/NotificationService';
import EmailNotificationService from '@/services/EmailNotificationService';
import { exportDataAsJSON, exportDataAsCSV } from '@/services/AdminCommonService';
import { PLANS, getFeatureCatalog, getPlanOrder } from '@/data/planLimits';
import { generateUserId, getUserStatistics } from '@/utils/adminDataAggregator';
import {
  getAccountStatusColor, getAccountStatusLabel,
  getAccountHealthColor, getAccountHealthLabel,
  getPlanTypeLabel, getPlanColor,
  formatDate, formatDateTime, formatCurrency,
  calculateDaysUntilRenewal,
  getChartDataByPlan,
  getChartDataByHealth, calculateMRR, getRenewalStatusBadge
} from '@/utils/accountsManagementUtils';

export default function AdminAccounts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const urlParams = new URLSearchParams(window.location.search);
  const initialSearchQuery = urlParams.get('search') || '';
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [filterPlan, setFilterPlan] = useState('all');
  const [filterHealth, setFilterHealth] = useState('all');
  const [accountInvoicesDrawer, setAccountInvoicesDrawer] = useState(null);
  const [allInvoicesForDrawer, setAllInvoicesForDrawer] = useState([]);

  // Data states
  const [summary, setSummary] = useState(null);
  const [activityLog, setActivityLog] = useState([]);
  const [healthCounts, setHealthCounts] = useState({});


  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPlanMonthlyRate = (planKey) => {
    const plan = PLANS[planKey] || PLANS.free;
    return Number(plan?.priceMonthly || 0);
  };

  const toNumericLimit = (value) => {
    if (value === null || value === undefined) return Infinity;
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.toLowerCase() === 'unlimited') return Infinity;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Infinity;
  };

  const getDocumentLimit = (planKey) => {
    const plan = PLANS[planKey] || PLANS.free;
    const invoiceLimit = toNumericLimit(plan?.invoices_limit);
    const quoteLimit = toNumericLimit(plan?.quotes_limit);
    if (!Number.isFinite(invoiceLimit) || !Number.isFinite(quoteLimit)) return Infinity;
    return invoiceLimit + quoteLimit;
  };

  const formatLimitValue = (value) => {
    if (value === null || value === undefined) return 'Unlimited';
    if (typeof value === 'string' && value.toLowerCase() === 'unlimited') return 'Unlimited';
    return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : 'Unlimited';
  };

  const formatUsagePercent = (value) => {
    if (!Number.isFinite(value)) return 'Unlimited';
    return `${value}%`;
  };

  const getUsageBadge = (percent) => {
    if (!Number.isFinite(percent)) return 'bg-slate-100 text-slate-700';
    if (percent >= 100) return 'bg-red-100 text-red-800';
    if (percent >= 90) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  };

  const getAccountHealth = (account) => {
    if (account.status === 'suspended' || account.status === 'inactive') return 'flagged';
    if (account.pending_payment_count > 0 || account.failed_payment_count > 0) return 'flagged';

    const limit = getDocumentLimit(account.plan);
    if (Number.isFinite(limit) && limit > 0) {
      const usagePercent = (account.document_count / limit) * 100;
      if (usagePercent >= 90) return 'high_usage';
    }

    return 'normal';
  };

  const buildAccountsFromUsers = (users) => {
    return users.map((user) => {
      const planKey = user.plan || 'free';
      const stats = user.email ? getUserStatistics(generateUserId(user.email)) : null;
      const invoiceCount = stats?.totalInvoices || 0;
      const quoteCount = stats?.totalQuotes || 0;
      const documentCount = invoiceCount + quoteCount;
      const subscriptionStatus = user.subscription_status || (user.status === 'suspended' ? 'paused' : 'active');
      const createdAt = user.created_at || user.createdAt || new Date().toISOString();
      const monthlyRate = user.monthly_rate ?? getPlanMonthlyRate(planKey);
      const renewalDate = user.subscription_renewal_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const plan = PLANS[planKey] || PLANS.free;
      const invoiceLimit = toNumericLimit(plan?.invoices_limit);
      const quoteLimit = toNumericLimit(plan?.quotes_limit);
      const invoiceUsagePercent = Number.isFinite(invoiceLimit) && invoiceLimit > 0
        ? Math.round((invoiceCount / invoiceLimit) * 100)
        : Infinity;
      const quoteUsagePercent = Number.isFinite(quoteLimit) && quoteLimit > 0
        ? Math.round((quoteCount / quoteLimit) * 100)
        : Infinity;

      const account = {
        id: user.id,
        name: user.company_name || user.full_name || user.email || 'Unknown Account',
        email: user.email || 'no-email',
        plan: planKey,
        status: user.status || 'active',
        user_count: user.user_count || 1,
        document_count: documentCount,
        invoice_count: invoiceCount,
        quote_count: quoteCount,
        invoice_limit: invoiceLimit,
        quote_limit: quoteLimit,
        invoice_usage_percent: invoiceUsagePercent,
        quote_usage_percent: quoteUsagePercent,
        billing_cycle: user.billing_cycle || 'monthly',
        subscription_status: subscriptionStatus,
        subscription_renewal_date: renewalDate,
        last_billed_date: user.last_billed_date || createdAt,
        monthly_rate: monthlyRate,
        pending_payment_count: user.pending_payment_count || 0,
        failed_payment_count: user.failed_payment_count || 0,
        created_at: createdAt
      };

      return {
        ...account,
        health: getAccountHealth(account)
      };
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  };

  const buildSummary = (accountsList) => {
    return {
      totalAccounts: accountsList.length,
      activeAccounts: accountsList.filter(a => a.status === 'active').length,
      accountsAtCapacity: accountsList.filter(a => a.health === 'high_usage').length,
      flaggedAccounts: accountsList.filter(a => a.health === 'flagged').length,
      totalUsers: accountsList.reduce((sum, a) => sum + (a.user_count || 0), 0),
      totalDocuments: accountsList.reduce((sum, a) => sum + (a.document_count || 0), 0)
    };
  };

  const buildActivityLog = () => {
    const logs = AuditLogService.getAllLogs();
    return logs.map((log) => ({
      id: log.id,
      action: log.action || log.type || 'activity',
      details: typeof log.details === 'string' ? log.details : (log.details?.message || log.details?.reason || ''),
      timestamp: log.timestamp,
      performedBy: log.performedBy || log.userName || 'System',
      accountId: log.userId || log.entityId || 'unknown'
    }));
  };

  const getLimitAlertStorageKey = (accountId, alertType) => {
    return `breakapi_limit_alert_${accountId}_${alertType}`;
  };

  const shouldLogLimitAlert = (storageKey) => {
    const lastLogged = localStorage.getItem(storageKey);
    if (!lastLogged) return true;
    const lastTime = new Date(lastLogged).getTime();
    if (!Number.isFinite(lastTime)) return true;
    return Date.now() - lastTime > 24 * 60 * 60 * 1000;
  };

  const logLimitAlert = (account, payload) => {
    AuditLogService.logEvent({
      type: 'ADMIN_ACTION',
      action: 'USAGE_LIMIT_REACHED',
      severity: payload.severity || 'high',
      entityType: 'account',
      entityId: account.id,
      entityName: account.name,
      userId: account.id,
      userName: account.name,
      performedBy: user?.email || 'System',
      details: {
        message: payload.message,
        plan: account.plan,
        invoiceCount: account.invoice_count,
        invoiceLimit: account.invoice_limit,
        invoiceUsagePercent: account.invoice_usage_percent,
        quoteCount: account.quote_count,
        quoteLimit: account.quote_limit,
        quoteUsagePercent: account.quote_usage_percent
      }
    });

    const title = 'Usage limit reached';
    const message = payload.message;
    NotificationService.createNotification(
      account.id,
      title,
      message,
      'usage_limit_reached',
      account.id
    );

    EmailNotificationService.sendEmail({
      to: account.email,
      subject: 'Usage limit reached on your plan',
      body: `${account.name},\n\n${message}\n\nPlan: ${getPlanTypeLabel(account.plan)}\nInvoices: ${account.invoice_count}/${formatLimitValue(account.invoice_limit)} (${formatUsagePercent(account.invoice_usage_percent)})\nQuotes: ${account.quote_count}/${formatLimitValue(account.quote_limit)} (${formatUsagePercent(account.quote_usage_percent)})\n\nPlease review your plan limits or upgrade as needed.`,
      metadata: {
        accountId: account.id,
        plan: account.plan,
        invoiceUsagePercent: account.invoice_usage_percent,
        quoteUsagePercent: account.quote_usage_percent
      }
    });
  };

  const applyHardLimitActions = (accountsList) => {
    const updatedAccounts = accountsList.map((account) => ({ ...account }));

    updatedAccounts.forEach((account) => {
      const invoiceHardLimit = Number.isFinite(account.invoice_usage_percent) && account.invoice_usage_percent >= 100;
      const quoteHardLimit = Number.isFinite(account.quote_usage_percent) && account.quote_usage_percent >= 100;
      if (!invoiceHardLimit && !quoteHardLimit) return;

      const alertType = invoiceHardLimit && quoteHardLimit ? 'both' : invoiceHardLimit ? 'invoice' : 'quote';
      const alertKey = getLimitAlertStorageKey(account.id, alertType);
      if (shouldLogLimitAlert(alertKey)) {
        const message = `Usage limit reached (${alertType}). Notification sent.`;
        logLimitAlert(account, { message, severity: 'critical' });
        localStorage.setItem(alertKey, new Date().toISOString());
      }
    });

    return { updatedAccounts };
  };

  const loadData = () => {
    setLoading(true);
    try {
      const users = AdminDataService.getAllUsers();
      const allAccounts = buildAccountsFromUsers(users);
      const { updatedAccounts } = applyHardLimitActions(allAccounts);
      setAccounts(updatedAccounts);

      const accountSummary = buildSummary(updatedAccounts);
      setSummary(accountSummary);

      const activity = buildActivityLog();
      setActivityLog(activity);

      const healthStatus = {
        normal: 0,
        high_usage: 0,
        flagged: 0
      };
      updatedAccounts.forEach(account => {
        const health = account.health || 'normal';
        healthStatus[health]++;
      });
      setHealthCounts(healthStatus);

      setAllInvoicesForDrawer(getAllUsersInvoices());
    } catch (error) {
      console.error('Error loading accounts data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncFromSupabase = async () => {
    setSyncing(true);
    try {
      await syncAdminData();
      loadData();
      toast({
        title: 'Sync complete',
        description: 'Accounts list has been updated from Supabase.',
        variant: 'default',
      });
    } catch (err) {
      toast({
        title: 'Sync failed',
        description: err?.message || 'Could not sync. Check your connection and admin access.',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleChangePlan = (account) => {
    navigate(`${createPageUrl('AdminSubscriptions')}?search=${encodeURIComponent(account.email || '')}&tab=subscriptions`);
  };

  const invoicesForAccount = accountInvoicesDrawer
    ? allInvoicesForDrawer.filter(
        (inv) =>
          (inv.user_id && String(inv.user_id) === String(accountInvoicesDrawer.id)) ||
          (inv.created_by && String(inv.created_by) === String(accountInvoicesDrawer.id))
      )
    : [];

  const handlePauseSubscription = (accountId) => {
    if (window.confirm('Pause this subscription?')) {
      AdminDataService.updateUser(accountId, {
        subscription_status: 'paused',
        status: 'suspended',
        paused_at: new Date().toISOString()
      });
      loadData();
    }
  };

  const handleResumeSubscription = (accountId) => {
    if (window.confirm('Resume this subscription?')) {
      AdminDataService.updateUser(accountId, {
        subscription_status: 'active',
        status: 'active',
        resumed_at: new Date().toISOString()
      });
      loadData();
    }
  };

  const handleExportAccounts = () => {
    const data = {
      exportDate: new Date().toISOString(),
      summary: summary || buildSummary(accounts),
      accounts,
      activityLog
    };
    const timestamp = new Date().toISOString().split('T')[0];
    exportDataAsJSON(data, `accounts_${timestamp}.json`);
  };

  const handleExportBillingLimits = () => {
    const rows = accounts.map((account) => ({
      account: account.name,
      email: account.email,
      plan: getPlanTypeLabel(account.plan),
      invoice_limit: formatLimitValue(account.invoice_limit),
      invoice_count: account.invoice_count,
      invoice_usage_percent: formatUsagePercent(account.invoice_usage_percent),
      quote_limit: formatLimitValue(account.quote_limit),
      quote_count: account.quote_count,
      quote_usage_percent: formatUsagePercent(account.quote_usage_percent),
      status: getAccountStatusLabel(account.status),
      subscription_status: account.subscription_status
    }));
    const timestamp = new Date().toISOString().split('T')[0];
    exportDataAsCSV(rows, `billing_limits_${timestamp}.csv`, [
      'account',
      'email',
      'plan',
      'invoice_limit',
      'invoice_count',
      'invoice_usage_percent',
      'quote_limit',
      'quote_count',
      'quote_usage_percent',
      'status',
      'subscription_status'
    ]);
  };

  const filteredAccounts = accounts.filter(account => {
    const matchesSearch = account.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          account.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPlan = filterPlan === 'all' || account.plan === filterPlan;
    const matchesHealth = filterHealth === 'all' || account.health === filterHealth;
    return matchesSearch && matchesPlan && matchesHealth;
  });

  if (loading) {
    return <div className="p-8 text-center">Loading accounts data...</div>;
  }

  const mrr = calculateMRR(accounts);
  const planOrder = getPlanOrder();
  const featureCatalog = getFeatureCatalog();
  const planSummaries = planOrder.map((planKey) => {
    const plan = PLANS[planKey] || {};
    const enabledFeatures = Object.values(plan.features || {}).filter(Boolean).length;
    return {
      key: planKey,
      name: plan.name || getPlanTypeLabel(planKey),
      invoiceLimit: plan.invoices_limit,
      quoteLimit: plan.quotes_limit,
      userLimit: plan.userLimit ?? plan.users,
      storage: plan.storage || 'N/A',
      enabledFeatures
    };
  });
  const overUsageAlerts = accounts
    .filter((account) => {
      const invoiceAlert = Number.isFinite(account.invoice_usage_percent) && account.invoice_usage_percent >= 90;
      const quoteAlert = Number.isFinite(account.quote_usage_percent) && account.quote_usage_percent >= 90;
      return invoiceAlert || quoteAlert;
    })
    .map((account) => {
      const invoicePercent = Number.isFinite(account.invoice_usage_percent) ? account.invoice_usage_percent : null;
      const quotePercent = Number.isFinite(account.quote_usage_percent) ? account.quote_usage_percent : null;
      const maxPercent = Math.max(invoicePercent ?? 0, quotePercent ?? 0);
      return { ...account, maxPercent };
    })
    .sort((a, b) => b.maxPercent - a.maxPercent);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-bold text-slate-900">Accounts Management</h1>
            {user?.role === 'admin' && (
              <Badge className="bg-slate-900 text-white">Admin Account</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleSyncFromSupabase}
              disabled={syncing}
              className="flex items-center gap-2"
            >
              <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : 'Sync from Supabase'}
            </Button>
            <Button onClick={handleExportAccounts} variant="outline" className="flex items-center gap-2">
              <Download size={18} /> Export Accounts
            </Button>
            <Button onClick={handleExportBillingLimits} variant="outline" className="flex items-center gap-2">
              <Download size={18} /> Consolidated report (CSV)
            </Button>
          </div>
        </div>
        <p className="text-slate-600">Monitor and manage business accounts, usage, and subscriptions</p>
      </div>

      {/* Key Metrics */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Total Accounts</p>
                  <p className="text-3xl font-bold text-slate-900">{summary.totalAccounts}</p>
                </div>
                <Building2 size={32} className="text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Active</p>
                  <p className="text-3xl font-bold text-green-600">{summary.activeAccounts}</p>
                </div>
                <TrendingUp size={32} className="text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">High Usage</p>
                  <p className="text-3xl font-bold text-yellow-600">{summary.accountsAtCapacity}</p>
                </div>
                <HardDrive size={32} className="text-yellow-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Flagged</p>
                  <p className="text-3xl font-bold text-red-600">{summary.flaggedAccounts}</p>
                </div>
                <AlertCircle size={32} className="text-red-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="pt-6">
              <div>
                <p className="text-sm font-medium text-slate-600">MRR</p>
                <p className="text-3xl font-bold text-purple-600">{formatCurrency(mrr)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="accounts">All Accounts</TabsTrigger>
          <TabsTrigger value="billing">Billing & Limits</TabsTrigger>
          <TabsTrigger value="activity">Activity Log</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Accounts by Plan */}
            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Accounts by Plan</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={getChartDataByPlan(accounts)}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {getChartDataByPlan(accounts).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Account Health Distribution */}
            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Account Health Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={getChartDataByHealth(accounts, healthCounts)}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {getChartDataByHealth(accounts, healthCounts).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Total Users</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold text-primary">{summary?.totalUsers || 0}</p>
                <p className="text-sm text-slate-600 mt-2">Across all accounts</p>
              </CardContent>
            </Card>

            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Total Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold text-purple-600">{summary?.totalDocuments || 0}</p>
                <p className="text-sm text-slate-600 mt-2">Created by all accounts</p>
              </CardContent>
            </Card>

            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Average ARR</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-green-600">
                  {formatCurrency((mrr * 12) / (summary?.totalAccounts || 1))}
                </p>
                <p className="text-sm text-slate-600 mt-2">Per account</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* All Accounts Tab */}
        <TabsContent value="accounts" className="space-y-6">
          {/* Filters */}
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Search & Filter</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3">
                  <Search size={20} className="text-slate-500 shrink-0" aria-hidden />
                  <label htmlFor="admin-accounts-search" className="sr-only">
                    Search by account name or email
                  </label>
                  <input
                    id="admin-accounts-search"
                    type="text"
                    placeholder="Search by account name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent border-none outline-none py-2"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="admin-accounts-filter-plan" className="block text-sm font-medium text-slate-700 mb-2">Plan</label>
                    <select
                      id="admin-accounts-filter-plan"
                      value={filterPlan}
                      onChange={(e) => setFilterPlan(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    >
                      <option value="all">All Plans</option>
                      <option value="free">Free</option>
                      <option value="starter">Starter</option>
                      <option value="professional">Professional</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="admin-accounts-filter-health" className="block text-sm font-medium text-slate-700 mb-2">Health Status</label>
                    <select
                      id="admin-accounts-filter-health"
                      value={filterHealth}
                      onChange={(e) => setFilterHealth(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    >
                      <option value="all">All Status</option>
                      <option value="normal">Normal</option>
                      <option value="high_usage">High Usage</option>
                      <option value="flagged">Flagged</option>
                    </select>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Accounts Table */}
          <Card className="bg-white border-0 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Account</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Plan</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Status</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Users</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Documents</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Health</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.map((account) => (
                    <tr key={account.id} className="border-b hover:bg-slate-50 transition">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-slate-900">{account.name}</p>
                          <p className="text-sm text-slate-500">{account.email}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge className={getPlanColor(account.plan)}>
                          {getPlanTypeLabel(account.plan)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <Badge className={getAccountStatusColor(account.status)}>
                          {getAccountStatusLabel(account.status)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-slate-700">{account.user_count}</td>
                      <td className="px-6 py-4 text-slate-700">{account.document_count}</td>
                      <td className="px-6 py-4">
                        <Badge className={getAccountHealthColor(account.health)}>
                          {getAccountHealthLabel(account.health)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setAccountInvoicesDrawer(account)}
                            className="text-slate-600 hover:bg-slate-100"
                            title="View invoices"
                          >
                            <FileText size={16} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleChangePlan(account)}
                            className="text-primary hover:bg-primary/10"
                            title="Change plan"
                          >
                            <Edit2 size={16} />
                          </Button>
                          {account.subscription_status === 'active' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handlePauseSubscription(account.id)}
                              className="text-yellow-600 hover:bg-yellow-50"
                              title="Pause subscription"
                            >
                              <Pause size={16} />
                            </Button>
                          ) : account.subscription_status === 'paused' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleResumeSubscription(account.id)}
                              className="text-green-600 hover:bg-green-50"
                              title="Resume subscription"
                            >
                              <Play size={16} />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredAccounts.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                No accounts found matching your criteria
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Billing & Limits Tab */}
        <TabsContent value="billing" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Billing & Limits</h2>
              <p className="text-sm text-slate-600">Enforce plan limits, features, and usage thresholds</p>
            </div>
            <Button onClick={handleExportBillingLimits} variant="outline" className="flex items-center gap-2">
              <Download size={16} /> Export Billing CSV
            </Button>
          </div>

          <Card className="bg-white border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Plan Limits Overview</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Plan</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Invoice Limit</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Quote Limit</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">User Limit</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Storage</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Features Enabled</th>
                  </tr>
                </thead>
                <tbody>
                  {planSummaries.map((plan) => (
                    <tr key={plan.key} className="border-b">
                      <td className="px-4 py-3">
                        <Badge className={getPlanColor(plan.key)}>{plan.name}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{formatLimitValue(plan.invoiceLimit)}</td>
                      <td className="px-4 py-3 text-slate-700">{formatLimitValue(plan.quoteLimit)}</td>
                      <td className="px-4 py-3 text-slate-700">{formatLimitValue(plan.userLimit)}</td>
                      <td className="px-4 py-3 text-slate-700">{plan.storage}</td>
                      <td className="px-4 py-3 text-slate-700">{plan.enabledFeatures}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Feature Toggles by Plan</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Feature</th>
                    {planSummaries.map((plan) => (
                      <th key={plan.key} className="text-left px-4 py-3 text-sm font-semibold text-slate-600">{plan.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {featureCatalog.map((feature) => (
                    <tr key={feature.key} className="border-b">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{feature.label}</p>
                        <p className="text-xs text-slate-500">{feature.description}</p>
                      </td>
                      {planSummaries.map((plan) => {
                        const enabled = Boolean(PLANS[plan.key]?.features?.[feature.key]);
                        return (
                          <td key={`${feature.key}-${plan.key}`} className="px-4 py-3">
                            <Badge className={enabled ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'}>
                              {enabled ? <Check size={14} className="mr-1" /> : <X size={14} className="mr-1" />}
                              {enabled ? 'Enabled' : 'Disabled'}
                            </Badge>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-yellow-600" /> Over-Usage Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {overUsageAlerts.length === 0 ? (
                <p className="text-sm text-slate-500">No accounts are near or over their limits.</p>
              ) : (
                <div className="space-y-4">
                  {overUsageAlerts.map((account) => (
                    <div key={account.id} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <p className="font-medium text-slate-900">{account.name}</p>
                          <p className="text-sm text-slate-500">{account.email}</p>
                        </div>
                        <Badge className={getPlanColor(account.plan)}>{getPlanTypeLabel(account.plan)}</Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                          <div>
                            <p className="text-xs text-slate-500">Invoices</p>
                            <p className="text-sm font-medium text-slate-900">
                              {account.invoice_count} / {formatLimitValue(account.invoice_limit)}
                            </p>
                          </div>
                          <Badge className={getUsageBadge(account.invoice_usage_percent)}>
                            {Number.isFinite(account.invoice_usage_percent) ? `${account.invoice_usage_percent}%` : 'Unlimited'}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                          <div>
                            <p className="text-xs text-slate-500">Quotes</p>
                            <p className="text-sm font-medium text-slate-900">
                              {account.quote_count} / {formatLimitValue(account.quote_limit)}
                            </p>
                          </div>
                          <Badge className={getUsageBadge(account.quote_usage_percent)}>
                            {Number.isFinite(account.quote_usage_percent) ? `${account.quote_usage_percent}%` : 'Unlimited'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {accounts
              .sort((a, b) => {
                const daysA = calculateDaysUntilRenewal(a.subscription_renewal_date);
                const daysB = calculateDaysUntilRenewal(b.subscription_renewal_date);
                return daysA - daysB;
              })
              .map((account) => {

                const renewalStatus = getRenewalStatusBadge(account.subscription_renewal_date);

                return (
                  <Card key={account.id} className="bg-white border-0 shadow-sm">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-slate-900">{account.name}</p>
                          <p className="text-sm text-slate-600">{account.email}</p>

                          <div className="mt-4 grid grid-cols-4 gap-4">
                            <div>
                              <p className="text-xs text-slate-600">Plan</p>
                              <p className="font-medium text-slate-900">{getPlanTypeLabel(account.plan)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-600">Billing Cycle</p>
                              <p className="font-medium text-slate-900">{account.billing_cycle === 'monthly' ? 'Monthly' : 'Yearly'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-600">Monthly Rate</p>
                              <p className="font-medium text-slate-900">{formatCurrency(account.monthly_rate)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-600">Last Billed</p>
                              <p className="font-medium text-slate-900">{formatDate(account.last_billed_date)}</p>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <Badge className={
                            renewalStatus.color === 'green' ? 'bg-green-100 text-green-800' :
                            renewalStatus.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }>
                            {renewalStatus.label}
                          </Badge>
                          <p className="text-sm text-slate-600 mt-2">
                            Renews: {formatDate(account.subscription_renewal_date)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </TabsContent>

        {/* Activity Log Tab */}
        <TabsContent value="activity" className="space-y-6">
          <div className="space-y-4">
            {activityLog.slice(0, 100).map((activity) => (
              <Card key={activity.id} className="bg-white border-0 shadow-sm">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-slate-900 capitalize">{activity.action.replace(/_/g, ' ')}</p>
                      <p className="text-sm text-slate-600">{activity.details}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Account ID: {activity.accountId}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm text-slate-600 font-medium">
                        {formatDateTime(activity.timestamp)}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">by {activity.performedBy}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {activityLog.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              No activity recorded yet
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Invoices drawer for selected account */}
      <Sheet open={!!accountInvoicesDrawer} onOpenChange={(open) => !open && setAccountInvoicesDrawer(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              Invoices {accountInvoicesDrawer ? `— ${accountInvoicesDrawer.name}` : ''}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {!accountInvoicesDrawer ? null : invoicesForAccount.length === 0 ? (
              <p className="text-sm text-slate-500">No invoices found for this account.</p>
            ) : (
              <ul className="space-y-2">
                {invoicesForAccount
                  .sort((a, b) => new Date(b.created_date || b.created_at || 0) - new Date(a.created_date || a.created_at || 0))
                  .slice(0, 50)
                  .map((inv) => (
                    <li key={inv.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                      <div>
                        <p className="font-medium text-slate-900">{inv.invoice_number || inv.id}</p>
                        <p className="text-xs text-slate-500">
                          {inv.total_amount != null ? formatCurrency(inv.total_amount) : '—'} · {inv.status || 'draft'}
                        </p>
                      </div>
                      <p className="text-xs text-slate-500">
                        {formatDate(inv.created_date || inv.created_at)}
                      </p>
                    </li>
                  ))}
              </ul>
            )}
            {accountInvoicesDrawer && invoicesForAccount.length > 50 && (
              <p className="text-xs text-slate-500 mt-2">Showing latest 50 of {invoicesForAccount.length}</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
