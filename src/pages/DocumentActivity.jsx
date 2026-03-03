import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileText, BarChart3, LineChart as LineChartIcon, PieChart,
  Users, DollarSign, Download, RefreshCw
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, PieChart as PieChartComponent, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart
} from 'recharts';
import DocumentActivityService from '@/services/DocumentActivityService';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';

export default function DocumentActivity() {
  const [isLoading, setIsLoading] = useState(true);
  const [summaryStats, setSummaryStats] = useState(null);
  const [documentsPerPlan, setDocumentsPerPlan] = useState([]);
  const [dailyTrend, setDailyTrend] = useState([]);
  const [statusDistribution, setStatusDistribution] = useState(null);
  const [topClients, setTopClients] = useState([]);
  const [revenueMetrics, setRevenueMetrics] = useState(null);
  const [creationPatterns, setCreationPatterns] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setIsLoading(true);
    try {
      const stats = DocumentActivityService.getSummaryStats();
      const perPlan = DocumentActivityService.getDocumentsPerPlan();
      const trend = DocumentActivityService.getDailyTrend(30);
      const status = DocumentActivityService.getStatusDistribution();
      const clients = DocumentActivityService.getTopClients(10);
      const revenue = DocumentActivityService.getRevenueMetrics();
      const patterns = DocumentActivityService.getCreationPatterns();

      setSummaryStats(stats);
      setDocumentsPerPlan(perPlan);
      setDailyTrend(trend);
      setStatusDistribution(status);
      setTopClients(clients);
      setRevenueMetrics(revenue);
      setCreationPatterns(patterns);
    } catch (error) {
      console.error('Error loading document activity data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Chart data
  const documentTypeData = useMemo(() => {
    if (!summaryStats) return [];
    return [
      { name: 'Invoices', value: summaryStats.totalInvoices, color: '#f24e00' },
      { name: 'Quotes', value: summaryStats.totalQuotes, color: '#10b981' },
      { name: 'Receipts', value: summaryStats.totalReceipts, color: '#f59e0b' }
    ];
  }, [summaryStats]);

  const statusData = useMemo(() => {
    if (!statusDistribution) return [];
    return [
      { name: 'Draft', value: statusDistribution.draft, color: '#94a3b8' },
      { name: 'Sent', value: statusDistribution.sent, color: '#3b82f6' },
      { name: 'Viewed', value: statusDistribution.viewed, color: '#8b5cf6' },
      { name: 'Paid', value: statusDistribution.paid, color: '#10b981' },
      { name: 'Overdue', value: statusDistribution.overdue, color: '#ef4444' }
    ].filter(s => s.value > 0);
  }, [statusDistribution]);

  const handleExportReport = () => {
    const data = DocumentActivityService.exportActivity();
    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `document-activity-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Document Activity</h1>
          <p className="text-slate-600 mt-2">Track invoices, quotes, receipts, and document creation metrics</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleExportReport}>
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-500" />
              Total Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{summaryStats?.totalDocuments || 0}</div>
            <p className="text-xs text-slate-500 mt-1">All time</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-green-500" />
              Total Invoices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{summaryStats?.totalInvoices || 0}</div>
            <p className="text-xs text-slate-500 mt-1">Created</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <PieChart className="h-4 w-4 text-purple-500" />
              Total Quotes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{summaryStats?.totalQuotes || 0}</div>
            <p className="text-xs text-slate-500 mt-1">Created</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-amber-500" />
              Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">R{(revenueMetrics?.totalRevenue || 0).toLocaleString()}</div>
            <p className="text-xs text-slate-500 mt-1">Collected</p>
          </CardContent>
        </Card>
      </div>

      {/* Document Status Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Document Status Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: 'Draft', value: summaryStats?.draftCount, color: 'bg-gray-100 text-gray-700' },
              { label: 'Sent', value: summaryStats?.sentCount, color: 'bg-blue-100 text-blue-700' },
              { label: 'Paid', value: summaryStats?.paidCount, color: 'bg-green-100 text-green-700' }
            ].map((item, idx) => (
              <div key={idx}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-slate-700">{item.label}</span>
                  <Badge className={item.color}>{item.value}</Badge>
                </div>
                <Progress value={(item.value / (summaryStats?.totalDocuments || 1)) * 100} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Revenue Metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
              <span className="text-sm font-medium">Invoice Revenue</span>
              <span className="font-bold text-slate-900">R{(revenueMetrics?.invoiceRevenue || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
              <span className="text-sm font-medium">Collected</span>
              <span className="font-bold text-green-600">R{(revenueMetrics?.collectedRevenue || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-yellow-50 rounded-lg">
              <span className="text-sm font-medium">Pending</span>
              <span className="font-bold text-yellow-600">R{(revenueMetrics?.pendingRevenue || 0).toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="plans">Per Plan</TabsTrigger>
          <TabsTrigger value="clients">Top Clients</TabsTrigger>
          <TabsTrigger value="patterns">Patterns</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Document Types */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-xl rounded-2xl border-0">
              <CardHeader className="bg-gradient-to-r from-[#f24e00] to-[#ff7c00] text-white rounded-t-2xl">
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
                  Document Types
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChartComponent>
                      <Pie
                        data={documentTypeData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name} (${value})`}
                        outerRadius={80}
                        dataKey="value"
                      >
                        {documentTypeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChartComponent>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-xl rounded-2xl border-0">
              <CardHeader className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-t-2xl">
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
                  Document Status
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChartComponent>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name} (${value})`}
                        outerRadius={80}
                        dataKey="value"
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChartComponent>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 30-Day Trend */}
          <Card className="shadow-xl rounded-2xl border-0">
            <CardHeader className="bg-gradient-to-r from-[#f24e00] to-[#ff7c00] text-white rounded-t-2xl">
              <CardTitle className="flex items-center gap-2">
                <LineChartIcon className="h-5 w-5" />
                30-Day Document Creation Trend
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyTrend} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                    <defs>
                      <linearGradient id="colorInvoices" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f24e00" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#f24e00" stopOpacity={0.1}/>
                      </linearGradient>
                      <linearGradient id="colorQuotes" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="invoices" stroke="#f24e00" fillOpacity={1} fill="url(#colorInvoices)" />
                    <Area type="monotone" dataKey="quotes" stroke="#10b981" fillOpacity={1} fill="url(#colorQuotes)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Revenue Trend */}
          <Card className="shadow-xl rounded-2xl border-0">
            <CardHeader className="bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-t-2xl">
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                30-Day Revenue Trend
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyTrend} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip formatter={(value) => `R${value.toLocaleString()}`} />
                    <Legend />
                    <Line type="monotone" dataKey="totalAmount" stroke="#a855f7" strokeWidth={2} name="Daily Revenue" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Per Plan Tab */}
        <TabsContent value="plans" className="space-y-6">
          <Card className="shadow-xl rounded-2xl border-0">
            <CardHeader className="bg-gradient-to-r from-[#f24e00] to-[#ff7c00] text-white rounded-t-2xl">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Documents Created Per Plan
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={documentsPerPlan} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="plan" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="invoices" stackId="a" fill="#f24e00" name="Invoices" />
                    <Bar dataKey="quotes" stackId="a" fill="#10b981" name="Quotes" />
                    <Bar dataKey="receipts" stackId="a" fill="#f59e0b" name="Receipts" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {documentsPerPlan.map((plan) => (
              <Card key={plan.plan} className="shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-slate-900 capitalize">{plan.plan}</h3>
                    <Badge variant="outline">{plan.totalDocuments} documents</Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <p className="text-xs text-blue-600 font-medium">Invoices</p>
                      <p className="text-2xl font-bold text-blue-900">{plan.invoices}</p>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg">
                      <p className="text-xs text-green-600 font-medium">Quotes</p>
                      <p className="text-2xl font-bold text-green-900">{plan.quotes}</p>
                    </div>
                    <div className="bg-amber-50 p-3 rounded-lg">
                      <p className="text-xs text-amber-600 font-medium">Receipts</p>
                      <p className="text-2xl font-bold text-amber-900">{plan.receipts}</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg">
                      <p className="text-xs text-slate-600 font-medium">Avg Value</p>
                      <p className="text-2xl font-bold text-slate-900">R{plan.avgValue.toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Top Clients Tab */}
        <TabsContent value="clients" className="space-y-6">
          <Card className="shadow-xl rounded-2xl border-0">
            <CardHeader className="bg-gradient-to-r from-[#f24e00] to-[#ff7c00] text-white rounded-t-2xl">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Top 10 Clients
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                {topClients.map((client, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                        {idx + 1}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{client.name}</p>
                        <p className="text-xs text-slate-500">{client.count} documents</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-slate-900">R{client.totalAmount.toLocaleString()}</p>
                      <p className="text-xs text-slate-500">Total value</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Patterns Tab */}
        <TabsContent value="patterns" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-xl rounded-2xl border-0">
              <CardHeader className="bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-t-2xl">
                <CardTitle className="text-sm">Documents by Day of Week</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-2">
                  {creationPatterns && Object.entries(creationPatterns.byDayOfWeek || {}).map(([day, count]) => (
                    <div key={day} className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700 w-20">{day}</span>
                      <div className="flex-1 mx-4">
                        <Progress value={(count / Math.max(...Object.values(creationPatterns.byDayOfWeek || {}))) * 100} className="h-2" />
                      </div>
                      <span className="text-sm font-bold text-slate-900 w-8 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-xl rounded-2xl border-0">
              <CardHeader className="bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-t-2xl">
                <CardTitle className="text-sm">Documents by Hour</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={Object.entries(creationPatterns?.byHour || {}).map(([hour, count]) => ({ hour: `${hour}:00`, count }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="hour" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#f97316" name="Documents" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-xl rounded-2xl border-0">
            <CardHeader className="bg-gradient-to-r from-[#f24e00] to-[#ffa600] text-white rounded-t-2xl">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Documents by Type (All Time)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                {creationPatterns && Object.entries(creationPatterns.byType || {}).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <span className="font-medium text-slate-900 capitalize">{type}</span>
                    <Badge>{count}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
