/**
 * Admin Document Oversight
 * Operational insight into platform document usage and user activity
 */

import { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area
} from 'recharts';
import {
  Search, Download, TrendingUp, TrendingDown,
  FileText, Users, Zap, Activity
} from 'lucide-react';
import AdminDataService from '@/services/AdminDataService';
import { exportDataAsJSON } from '@/services/AdminCommonService';
import { generateUserId, getAllUsersInvoices, getAllUsersQuotes } from '@/utils/adminDataAggregator';
import {
  formatCurrency, formatRelativeTime, formatDate,
  calculateGrowth,
  getChartDataForDocumentTypes, getChartDataForActivityStatus
} from '@/utils/documentOversightUtils';

export default function AdminDocumentOversight() {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [documentTypeFilter, setDocumentTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');

  // Data states
  const [summary, setSummary] = useState(null);
  const [documentsPerUser, setDocumentsPerUser] = useState([]);
  const [documentsPerAccount, setDocumentsPerAccount] = useState([]);
  const [monthlyTrends, setMonthlyTrends] = useState([]);
  const [yearlyTrends, setYearlyTrends] = useState([]);
  const [powerUsers, setPowerUsers] = useState([]);
  const [inactiveUsers, setInactiveUsers] = useState([]);
  const [activityStatus, setActivityStatus] = useState(null);
  const [engagement, setEngagement] = useState(null);
  const [distribution, setDistribution] = useState(null);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);

  // Helper: Build summary from real user data
  const buildSummaryStats = () => {
    const users = AdminDataService.getAllUsers();
    const invoices = getAllUsersInvoices();
    const quotes = getAllUsersQuotes();
    
    const totalInvoiceValue = invoices.reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0);
    const totalQuoteValue = quotes.reduce((sum, q) => sum + (parseFloat(q.total) || 0), 0);
    
    return {
      totalDocuments: invoices.length + quotes.length,
      invoicesCreated: invoices.length,
      quotesCreated: quotes.length,
      totalUsers: users.length,
      totalAccounts: users.filter(u => u.company_name).length,
      averageDocumentsPerUser: users.length > 0 ? Math.round((invoices.length + quotes.length) / users.length) : 0,
      averageDocumentsPerAccount: users.filter(u => u.company_name).length > 0 
        ? Math.round((invoices.length + quotes.length) / users.filter(u => u.company_name).length) 
        : 0,
      totalInvoiceValue,
      totalQuoteValue
    };
  };

  // Helper: Build documents per user from real data
  const buildDocumentsPerUser = () => {
    const users = AdminDataService.getAllUsers();
    const invoices = getAllUsersInvoices();
    const quotes = getAllUsersQuotes();
    
    const userDocsMap = {};
    users.forEach(user => {
      const userId = generateUserId(user.email);
      userDocsMap[userId] = {
        userId: userId,
        userName: user.full_name || user.email,
        userEmail: user.email,
        plan: user.plan || 'free',
        invoices: 0,
        quotes: 0,
        total: 0,
        totalAmount: 0,
        lastDocumentDate: null
      };
    });
    
    invoices.forEach(inv => {
      if (userDocsMap[inv.user_id]) {
        userDocsMap[inv.user_id].invoices += 1;
        userDocsMap[inv.user_id].total += 1;
        userDocsMap[inv.user_id].totalAmount += parseFloat(inv.total) || 0;
        const invDate = new Date(inv.createdAt || inv.date);
        if (!userDocsMap[inv.user_id].lastDocumentDate || invDate > new Date(userDocsMap[inv.user_id].lastDocumentDate)) {
          userDocsMap[inv.user_id].lastDocumentDate = inv.createdAt || inv.date;
        }
      }
    });
    
    quotes.forEach(q => {
      if (userDocsMap[q.user_id]) {
        userDocsMap[q.user_id].quotes += 1;
        userDocsMap[q.user_id].total += 1;
        userDocsMap[q.user_id].totalAmount += parseFloat(q.total) || 0;
        const qDate = new Date(q.createdAt || q.date);
        if (!userDocsMap[q.user_id].lastDocumentDate || qDate > new Date(userDocsMap[q.user_id].lastDocumentDate)) {
          userDocsMap[q.user_id].lastDocumentDate = q.createdAt || q.date;
        }
      }
    });
    
    return Object.values(userDocsMap).sort((a, b) => b.total - a.total);
  };

  // Helper: Build documents per account from real data
  const buildDocumentsPerAccount = () => {
    const users = AdminDataService.getAllUsers();
    const invoices = getAllUsersInvoices();
    const quotes = getAllUsersQuotes();
    
    const accountDocsMap = {};
    users.forEach(user => {
      if (user.company_name) {
        accountDocsMap[user.id] = {
          accountId: user.id,
          accountName: user.company_name,
          accountEmail: user.email,
          plan: user.plan || 'free',
          invoices: 0,
          quotes: 0,
          total: 0,
          uniqueUsers: new Set([user.id]),
          totalAmount: 0
        };
      }
    });
    
    invoices.forEach(inv => {
      const user = users.find(u => u.email === inv.user_email);
      if (user && accountDocsMap[user.id]) {
        accountDocsMap[user.id].invoices += 1;
        accountDocsMap[user.id].total += 1;
        accountDocsMap[user.id].totalAmount += parseFloat(inv.total) || 0;
      }
    });
    
    quotes.forEach(q => {
      const user = users.find(u => u.email === q.user_email);
      if (user && accountDocsMap[user.id]) {
        accountDocsMap[user.id].quotes += 1;
        accountDocsMap[user.id].total += 1;
        accountDocsMap[user.id].totalAmount += parseFloat(q.total) || 0;
      }
    });
    
    return Object.values(accountDocsMap).map(a => ({ ...a, uniqueUsers: a.uniqueUsers.size })).sort((a, b) => b.total - a.total);
  };

  // Helper: Build monthly trends from real document data
  const buildMonthlyTrends = () => {
    const invoices = getAllUsersInvoices();
    const quotes = getAllUsersQuotes();
    const allDocs = [...invoices, ...quotes];
    
    const monthsMap = {};
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      monthsMap[key] = { month: key, invoices: 0, quotes: 0, receipts: 0, estimates: 0, revenue: 0, total: 0 };
    }
    
    allDocs.forEach(doc => {
      const docDate = new Date(doc.createdAt || doc.date);
      const key = docDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      if (monthsMap[key]) {
        if (doc.type === 'invoice' || doc.docType === 'invoice') {
          monthsMap[key].invoices += 1;
          monthsMap[key].revenue += parseFloat(doc.total) || 0;
        } else if (doc.type === 'quote' || doc.docType === 'quote') {
          monthsMap[key].quotes += 1;
        } else if (doc.type === 'receipt' || doc.docType === 'receipt') {
          monthsMap[key].receipts += 1;
        } else if (doc.type === 'estimate' || doc.docType === 'estimate') {
          monthsMap[key].estimates += 1;
        }
        monthsMap[key].total += 1;
      }
    });
    
    return Object.values(monthsMap);
  };

  // Helper: Build yearly trends from real document data
  const buildYearlyTrends = () => {
    const invoices = getAllUsersInvoices();
    const quotes = getAllUsersQuotes();
    const allDocs = [...invoices, ...quotes];
    
    const yearsMap = {};
    const now = new Date();
    for (let i = 4; i >= 0; i--) {
      const year = now.getFullYear() - i;
      yearsMap[year] = { year: year.toString(), invoices: 0, quotes: 0, receipts: 0, estimates: 0 };
    }
    
    allDocs.forEach(doc => {
      const docDate = new Date(doc.createdAt || doc.date);
      const year = docDate.getFullYear();
      if (yearsMap[year]) {
        if (doc.type === 'invoice' || doc.docType === 'invoice') yearsMap[year].invoices += 1;
        else if (doc.type === 'quote' || doc.docType === 'quote') yearsMap[year].quotes += 1;
        else if (doc.type === 'receipt' || doc.docType === 'receipt') yearsMap[year].receipts += 1;
        else if (doc.type === 'estimate' || doc.docType === 'estimate') yearsMap[year].estimates += 1;
      }
    });
    
    return Object.values(yearsMap);
  };

  // Helper: Build power users from real data
  const buildPowerUsers = (limit = 10) => {
    const docPerUser = buildDocumentsPerUser();
    return docPerUser.slice(0, limit);
  };

  // Helper: Build inactive users from real data
  const buildInactiveUsers = () => {
    const users = AdminDataService.getAllUsers();
    const docPerUser = buildDocumentsPerUser();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    return users.filter(user => {
      const userDocs = docPerUser.find(d => d.userEmail === user.email);
      if (!userDocs || !userDocs.lastDocumentDate) return true;
      return new Date(userDocs.lastDocumentDate) < thirtyDaysAgo;
    }).map(u => ({ id: u.id, name: u.full_name, email: u.email }));
  };

  // Helper: Build user activity status from real data
  const buildActivityStatus = () => {
    const docPerUser = buildDocumentsPerUser();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const users = AdminDataService.getAllUsers();
    
    let active = 0, inactive = 0, dormant = 0;
    users.forEach(user => {
      const userDocs = docPerUser.find(d => d.userEmail === user.email);
      if (!userDocs || !userDocs.lastDocumentDate) {
        dormant += 1;
      } else if (new Date(userDocs.lastDocumentDate) < sevenDaysAgo) {
        inactive += 1;
      } else {
        active += 1;
      }
    });
    
    return { active, inactive, dormant };
  };

  // Helper: Build engagement metrics
  const buildEngagementMetrics = () => {
    const docPerUser = buildDocumentsPerUser();
    
    let powerUsersCount = 0, regularUsersCount = 0, occasionalUsersCount = 0;
    docPerUser.forEach(u => {
      if (u.total >= 20) powerUsersCount += 1;
      else if (u.total >= 5) regularUsersCount += 1;
      else if (u.total > 0) occasionalUsersCount += 1;
    });
    
    return { powerUsersCount, regularUsersCount, occasionalUsersCount };
  };

  // Helper: Build document type distribution
  const buildDistribution = () => {
    const invoices = getAllUsersInvoices();
    const quotes = getAllUsersQuotes();
    return {
      invoices: invoices.length,
      quotes: quotes.length,
      receipts: 0,
      estimates: 0
    };
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = () => {
    setLoading(true);
    try {
      setSummary(buildSummaryStats());
      setDocumentsPerUser(buildDocumentsPerUser());
      setDocumentsPerAccount(buildDocumentsPerAccount());
      setMonthlyTrends(buildMonthlyTrends());
      setYearlyTrends(buildYearlyTrends());
      setPowerUsers(buildPowerUsers(10));
      setInactiveUsers(buildInactiveUsers());
      setActivityStatus(buildActivityStatus());
      setEngagement(buildEngagementMetrics());
      setDistribution(buildDistribution());
      setDataRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error('Error loading document oversight data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const data = {
      summary,
      documentsPerUser,
      documentsPerAccount,
      monthlyTrends,
      yearlyTrends,
      powerUsers,
      inactiveUsers,
      activityStatus,
      engagement,
      distribution,
      exportedAt: new Date().toISOString()
    };
    const timestamp = new Date().toISOString().split('T')[0];
    exportDataAsJSON(data, `document_oversight_${timestamp}.json`);
  };

  const filteredDocumentsPerUser = documentsPerUser.filter(user =>
    user.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.userEmail.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDocumentsPerAccount = documentsPerAccount.filter(account =>
    account.accountName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    account.accountEmail.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredInactiveUsers = inactiveUsers.filter(user =>
    (user.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.email || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const statusBadgeClass = (status) => {
    const value = String(status || '').toLowerCase();
    if (['paid', 'active', 'succeeded'].includes(value)) return 'bg-emerald-100 text-emerald-700';
    if (['pending', 'sent', 'trial'].includes(value)) return 'bg-amber-100 text-amber-700';
    if (['overdue', 'failed', 'cancelled', 'canceled'].includes(value)) return 'bg-rose-100 text-rose-700';
    return 'bg-slate-100 text-slate-700';
  };

  const allDocuments = useMemo(() => {
    void dataRefreshKey;
    const users = AdminDataService.getAllUsers();
    const usersById = new Map();
    const usersByEmail = new Map();
    users.forEach(user => {
      if (user.id) usersById.set(user.id, user);
      if (user.email) usersByEmail.set(user.email, user);
    });

    const mapDocument = (doc, type) => {
      const userId = doc.user_id || doc.created_by || doc.owner_id || doc.userId || '';
      const userEmail = doc.user_email || doc.owner_email || doc.userEmail || '';
      const user = usersById.get(userId) || usersByEmail.get(userEmail);
      const createdAt = doc.created_date || doc.created_at || doc.createdAt || doc.date || '';
      const total = Number(doc.total_amount || doc.total || 0);
      const status = String(doc.status || doc.payment_status || doc.state || 'unknown').toLowerCase();

      return {
        id: `${type}-${doc.id || doc.invoice_number || doc.quote_number || createdAt}`,
        type,
        number: doc.invoice_number || doc.quote_number || doc.id || '—',
        userId: user?.id || userId || '',
        userName: user?.full_name || user?.display_name || user?.email || userEmail || 'Unknown',
        userEmail: user?.email || userEmail || '',
        total,
        status,
        createdAt
      };
    };

    const invoices = getAllUsersInvoices().map(inv => mapDocument(inv, 'invoice'));
    const quotes = getAllUsersQuotes().map(quote => mapDocument(quote, 'quote'));

    return [...invoices, ...quotes].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [dataRefreshKey]);

  const statusOptions = useMemo(() => {
    const values = new Set();
    allDocuments.forEach(doc => values.add(doc.status || 'unknown'));
    return ['all', ...Array.from(values).sort()];
  }, [allDocuments]);

  const userOptions = useMemo(() => {
    const users = AdminDataService.getAllUsers();
    return users.map(user => ({
      id: user.id || user.email,
      name: user.full_name || user.display_name || user.email,
      email: user.email
    }));
  }, []);

  const filteredDocuments = useMemo(() => {
    const minAmount = amountMin ? Number(amountMin) : null;
    const maxAmount = amountMax ? Number(amountMax) : null;
    const fromDate = dateFrom ? new Date(dateFrom) : null;
    const toDate = dateTo ? new Date(`${dateTo}T23:59:59`) : null;

    return allDocuments.filter(doc => {
      if (documentTypeFilter !== 'all' && doc.type !== documentTypeFilter) return false;
      if (statusFilter !== 'all' && doc.status !== statusFilter) return false;
      if (userFilter !== 'all' && doc.userId !== userFilter) return false;

      if (fromDate || toDate) {
        if (!doc.createdAt) return false;
        const created = new Date(doc.createdAt);
        if (fromDate && created < fromDate) return false;
        if (toDate && created > toDate) return false;
      }

      if (minAmount !== null && !Number.isNaN(minAmount) && doc.total < minAmount) return false;
      if (maxAmount !== null && !Number.isNaN(maxAmount) && doc.total > maxAmount) return false;

      return true;
    });
  }, [
    allDocuments,
    documentTypeFilter,
    statusFilter,
    userFilter,
    dateFrom,
    dateTo,
    amountMin,
    amountMax
  ]);

  if (loading) {
    return <div className="p-8 text-center">Loading document oversight data...</div>;
  }

  const monthlyGrowth = monthlyTrends.length >= 2 
    ? calculateGrowth(monthlyTrends[monthlyTrends.length - 1].total, monthlyTrends[monthlyTrends.length - 2].total)
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-4xl font-bold text-slate-900">Document Oversight</h1>
          <Button onClick={handleExport} variant="outline" className="flex items-center gap-2">
            <Download size={18} /> Export Report
          </Button>
        </div>
        <p className="text-slate-600">Operational insight into platform usage and user activity</p>
      </div>

      {/* Key Metrics */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Total Documents</p>
                  <p className="text-3xl font-bold text-slate-900">{summary.totalDocuments}</p>
                </div>
                <FileText size={32} className="text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Invoices</p>
                  <p className="text-3xl font-bold text-green-600">{summary.invoicesCreated}</p>
                </div>
                <TrendingUp size={32} className="text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Quotes</p>
                  <p className="text-3xl font-bold text-primary">{summary.quotesCreated}</p>
                </div>
                <FileText size={32} className="text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Active Users</p>
                  <p className="text-3xl font-bold text-purple-600">{activityStatus?.active || 0}</p>
                </div>
                <Users size={32} className="text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Monthly Growth</p>
                  <p className={`text-3xl font-bold ${monthlyGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {monthlyGrowth >= 0 ? '+' : ''}{monthlyGrowth}%
                  </p>
                </div>
                {monthlyGrowth >= 0 ? <TrendingUp size={32} className="text-green-500" /> : <TrendingDown size={32} className="text-red-500" />}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Per User</TabsTrigger>
          <TabsTrigger value="accounts">Per Account</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="documents">Invoices & Quotes</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Document Type Distribution */}
            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Document Type Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={getChartDataForDocumentTypes(distribution)}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {getChartDataForDocumentTypes(distribution).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* User Activity Status */}
            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <CardTitle>User Activity Status</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={getChartDataForActivityStatus(activityStatus)}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {getChartDataForActivityStatus(activityStatus).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Total Users</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold text-primary">{summary?.totalUsers || 0}</p>
                <p className="text-sm text-slate-600 mt-2">
                  Avg: {summary?.averageDocumentsPerUser} docs/user
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Total Accounts</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold text-purple-600">{summary?.totalAccounts || 0}</p>
                <p className="text-sm text-slate-600 mt-2">
                  Avg: {summary?.averageDocumentsPerAccount} docs/account
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Total Value</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold text-green-600">
                  {formatCurrency((summary?.totalInvoiceValue || 0) + (summary?.totalQuoteValue || 0))}
                </p>
                <p className="text-sm text-slate-600 mt-2">Invoices + Quotes</p>
              </CardContent>
            </Card>
          </div>

          {/* Monthly Trend */}
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Monthly Document Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={monthlyTrends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="invoices" stackId="1" stroke="#10b981" fill="#d1fae5" />
                  <Area type="monotone" dataKey="quotes" stackId="1" stroke="#3b82f6" fill="#dbeafe" />
                  <Area type="monotone" dataKey="receipts" stackId="1" stroke="#f59e0b" fill="#fef3c7" />
                  <Area type="monotone" dataKey="estimates" stackId="1" stroke="#8b5cf6" fill="#ede9fe" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Per User Tab */}
        <TabsContent value="users" className="space-y-6">
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Search Users</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          {/* Documents Per User Table */}
          <Card className="bg-white border-0 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">User</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Plan</th>
                    <th className="text-center px-6 py-3 text-sm font-semibold text-slate-600">Invoices</th>
                    <th className="text-center px-6 py-3 text-sm font-semibold text-slate-600">Quotes</th>
                    <th className="text-center px-6 py-3 text-sm font-semibold text-slate-600">Total</th>
                    <th className="text-right px-6 py-3 text-sm font-semibold text-slate-600">Amount</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Last Document</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocumentsPerUser.map((user) => (
                    <tr key={user.userId} className="border-b hover:bg-slate-50 transition">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-slate-900">{user.userName}</p>
                          <p className="text-sm text-slate-500">{user.userEmail}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge className="bg-primary/15 text-primary">
                          {user.plan}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-center text-slate-900 font-medium">{user.invoices}</td>
                      <td className="px-6 py-4 text-center text-slate-900 font-medium">{user.quotes}</td>
                      <td className="px-6 py-4 text-center font-bold text-slate-900">{user.total}</td>
                      <td className="px-6 py-4 text-right text-green-600 font-medium">
                        {formatCurrency(user.totalAmount)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {formatRelativeTime(user.lastDocumentDate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredDocumentsPerUser.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                No users found matching your search
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Invoices & Quotes Tab */}
        <TabsContent value="documents" className="space-y-6">
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <select
                  value={documentTypeFilter}
                  onChange={(e) => setDocumentTypeFilter(e.target.value)}
                  className="bg-slate-100 rounded-lg px-3 py-2 border-none outline-none"
                >
                  <option value="all">Invoice / Quote</option>
                  <option value="invoice">Invoice</option>
                  <option value="quote">Quote</option>
                </select>

                <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full bg-transparent border-none outline-none"
                  />
                  <span className="text-xs text-slate-500">to</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full bg-transparent border-none outline-none"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-slate-100 rounded-lg px-3 py-2 border-none outline-none"
                >
                  {statusOptions.map(option => (
                    <option key={option} value={option}>
                      {option === 'all' ? 'Status' : option}
                    </option>
                  ))}
                </select>

                <select
                  value={userFilter}
                  onChange={(e) => setUserFilter(e.target.value)}
                  className="bg-slate-100 rounded-lg px-3 py-2 border-none outline-none"
                >
                  <option value="all">User</option>
                  {userOptions.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="Min amount"
                  value={amountMin}
                  onChange={(e) => setAmountMin(e.target.value)}
                  className="bg-slate-100 rounded-lg px-3 py-2 border-none outline-none"
                />

                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="Max amount"
                  value={amountMax}
                  onChange={(e) => setAmountMax(e.target.value)}
                  className="bg-slate-100 rounded-lg px-3 py-2 border-none outline-none"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Number</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">User</th>
                    <th className="text-right px-6 py-3 text-sm font-semibold text-slate-600">Total</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Status</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Created date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocuments.map(doc => (
                    <tr key={doc.id} className="border-b hover:bg-slate-50 transition">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-slate-900">{doc.number}</p>
                          <p className="text-xs text-slate-500">{doc.type}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-slate-900">{doc.userName}</p>
                          <p className="text-sm text-slate-500">{doc.userEmail}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-slate-900 font-medium">
                        {formatCurrency(doc.total)}
                      </td>
                      <td className="px-6 py-4">
                        <Badge className={statusBadgeClass(doc.status)}>{doc.status}</Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {formatDate(doc.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredDocuments.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                No documents match your filters.
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Per Account Tab */}
        <TabsContent value="accounts" className="space-y-6">
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Search Accounts</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          {/* Documents Per Account Table */}
          <Card className="bg-white border-0 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Account</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Plan</th>
                    <th className="text-center px-6 py-3 text-sm font-semibold text-slate-600">Invoices</th>
                    <th className="text-center px-6 py-3 text-sm font-semibold text-slate-600">Quotes</th>
                    <th className="text-center px-6 py-3 text-sm font-semibold text-slate-600">Total</th>
                    <th className="text-center px-6 py-3 text-sm font-semibold text-slate-600">Users</th>
                    <th className="text-right px-6 py-3 text-sm font-semibold text-slate-600">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocumentsPerAccount.map((account) => (
                    <tr key={account.accountId} className="border-b hover:bg-slate-50 transition">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-slate-900">{account.accountName}</p>
                          <p className="text-sm text-slate-500">{account.accountEmail}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge className="bg-purple-100 text-purple-800">
                          {account.plan}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-center text-slate-900 font-medium">{account.invoices}</td>
                      <td className="px-6 py-4 text-center text-slate-900 font-medium">{account.quotes}</td>
                      <td className="px-6 py-4 text-center font-bold text-slate-900">{account.total}</td>
                      <td className="px-6 py-4 text-center text-slate-900 font-medium">{account.uniqueUsers}</td>
                      <td className="px-6 py-4 text-right text-green-600 font-medium">
                        {formatCurrency(account.totalAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredDocumentsPerAccount.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                No accounts found matching your search
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-6">
          {/* Yearly Trend */}
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Yearly Document Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={yearlyTrends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="invoices" stackId="a" fill="#10b981" />
                  <Bar dataKey="quotes" stackId="a" fill="#3b82f6" />
                  <Bar dataKey="receipts" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="estimates" stackId="a" fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Revenue Trend */}
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Revenue Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={monthlyTrends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" stroke="#10b981" name="Revenue" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Insights Tab */}
        <TabsContent value="insights" className="space-y-6">
          {/* Power Users */}
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Power Users (Top 10)</CardTitle>
                <Zap size={20} className="text-yellow-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {powerUsers.map((user, index) => (
                  <div key={user.userId} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center font-bold text-yellow-700">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{user.userName}</p>
                        <p className="text-sm text-slate-600">{user.userEmail}</p>
                      </div>
                    </div>
                    <Badge className="bg-purple-100 text-purple-800">
                      {user.total} documents
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Inactive Users */}
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Inactive Users (30+ days)</CardTitle>
                <Activity size={20} className="text-red-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredInactiveUsers.slice(0, 10).map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div>
                      <p className="font-medium text-slate-900">{user.name || 'Unknown User'}</p>
                      <p className="text-sm text-slate-600">{user.email || 'no-email'}</p>
                    </div>
                    <Badge className="bg-red-100 text-red-800">
                      Inactive
                    </Badge>
                  </div>
                ))}
                {filteredInactiveUsers.length === 0 && (
                  <p className="text-center py-4 text-slate-500">No inactive users found</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* User Engagement */}
          {engagement && (
            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <CardTitle>User Engagement Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <p className="text-2xl font-bold text-purple-600">{engagement.powerUsersCount}</p>
                    <p className="text-sm text-slate-600">Power Users</p>
                  </div>
                  <div className="text-center p-4 bg-primary/10 rounded-lg">
                    <p className="text-2xl font-bold text-primary">{engagement.regularUsersCount}</p>
                    <p className="text-sm text-slate-600">Regular Users</p>
                  </div>
                  <div className="text-center p-4 bg-yellow-50 rounded-lg">
                    <p className="text-2xl font-bold text-yellow-600">{engagement.occasionalUsersCount}</p>
                    <p className="text-sm text-slate-600">Occasional Users</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
