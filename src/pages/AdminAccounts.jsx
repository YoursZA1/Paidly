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
import {
  Search, Download, Edit2, Pause, Play, AlertCircle,
  TrendingUp, Building2, HardDrive
} from 'lucide-react';
import AdminDataService from '@/services/AdminDataService';
import AuditLogService from '@/services/AuditLogService';
import { exportDataAsJSON } from '@/services/AdminCommonService';
import { PLANS } from '@/data/planLimits';
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
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const urlParams = new URLSearchParams(window.location.search);
  const initialSearchQuery = urlParams.get('search') || '';
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [filterPlan, setFilterPlan] = useState('all');
  const [filterHealth, setFilterHealth] = useState('all');

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
      const documentCount = (stats?.totalInvoices || 0) + (stats?.totalQuotes || 0);
      const subscriptionStatus = user.subscription_status || (user.status === 'suspended' ? 'paused' : 'active');
      const createdAt = user.created_at || user.createdAt || new Date().toISOString();
      const monthlyRate = user.monthly_rate ?? getPlanMonthlyRate(planKey);
      const renewalDate = user.subscription_renewal_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const account = {
        id: user.id,
        name: user.company_name || user.full_name || user.email || 'Unknown Account',
        email: user.email || 'no-email',
        plan: planKey,
        status: user.status || 'active',
        user_count: user.user_count || 1,
        document_count: documentCount,
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

  const loadData = () => {
    setLoading(true);
    try {
      const users = AdminDataService.getAllUsers();
      const allAccounts = buildAccountsFromUsers(users);
      setAccounts(allAccounts);

      const accountSummary = buildSummary(allAccounts);
      setSummary(accountSummary);

      const activity = buildActivityLog();
      setActivityLog(activity);

      // Calculate health distribution
      const healthStatus = {
        normal: 0,
        high_usage: 0,
        flagged: 0
      };
      allAccounts.forEach(account => {
        const health = account.health || 'normal';
        healthStatus[health]++;
      });
      setHealthCounts(healthStatus);
    } catch (error) {
      console.error('Error loading accounts data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePlan = (account) => {
    alert(`Todo: Implement plan change for ${account.name}`);
  };

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
          <Button onClick={handleExportAccounts} variant="outline" className="flex items-center gap-2">
            <Download size={18} /> Export Accounts
          </Button>
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
                <Building2 size={32} className="text-blue-500" />
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
          <TabsTrigger value="billing">Billing & Renewal</TabsTrigger>
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
                <p className="text-4xl font-bold text-blue-600">{summary?.totalUsers || 0}</p>
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
                  <Search size={20} className="text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search by account name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent border-none outline-none py-2"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Plan</label>
                    <select
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
                    <label className="block text-sm font-medium text-slate-700 mb-2">Health Status</label>
                    <select
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
                            onClick={() => handleChangePlan(account)}
                            className="text-blue-600 hover:bg-blue-50"
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

        {/* Billing & Renewal Tab */}
        <TabsContent value="billing" className="space-y-6">
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
    </div>
  );
}
