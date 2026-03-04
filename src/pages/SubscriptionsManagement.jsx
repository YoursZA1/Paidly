import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users, TrendingUp, TrendingDown, Activity, BarChart3,
  PieChart, LineChartIcon, AlertCircle, CheckCircle,
  XCircle, Clock, Download, RefreshCw
} from 'lucide-react';
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as PieChartComponent, Pie, Cell
} from 'recharts';
import SubscriptionService from '@/services/SubscriptionService';

export default function SubscriptionsManagement() {
  const [isLoading, setIsLoading] = useState(true);
  const [planData, setPlanData] = useState(null);
  const [statusData, setStatusData] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [mrrTrend, setMrrTrend] = useState([]);
  const [churnData, setChurnData] = useState(null);

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setIsLoading(true);
    try {
      // Get all subscription data
      const plans = SubscriptionService.getUsersByPlanCategory();
      const status = SubscriptionService.getSubscriptionStatus();
      const metricsData = SubscriptionService.getMetrics();
      const timeline = SubscriptionService.getTimelineEvents(20);
      const mrr = SubscriptionService.getMRRTrend(12);
      const churn = SubscriptionService.getChurnAnalysis();

      setPlanData(plans);
      setStatusData(status);
      setMetrics(metricsData);
      setTimelineEvents(timeline);
      setMrrTrend(mrr);
      setChurnData(churn);
    } catch (error) {
      console.error('Error loading subscription data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Chart data for pie chart
  const planChartData = useMemo(() => {
    if (!planData) return [];
    return [
      { name: 'Individual', value: planData.Individual.count, color: '#f24e00' },
      { name: 'SME', value: planData.SME.count, color: '#10b981' },
      { name: 'Corporate', value: planData.Corporate.count, color: '#a855f7' }
    ];
  }, [planData]);

  const statusChartData = useMemo(() => {
    if (!statusData) return [];
    return [
      { name: 'Active', value: statusData.active.count, color: '#10b981' },
      { name: 'Cancelled', value: statusData.cancelled.count, color: '#ef4444' },
      { name: 'Paused', value: statusData.paused.count, color: '#f59e0b' },
      { name: 'Trial', value: statusData.trialing.count, color: '#8b5cf6' }
    ];
  }, [statusData]);

  const handleExportReport = () => {
    const data = {
      timestamp: new Date().toISOString(),
      planDistribution: planData,
      subscriptionStatus: statusData,
      metrics: metrics,
      timeline: timelineEvents
    };

    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `subscription-report-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Subscriptions & Packages</h1>
          <p className="text-slate-600 mt-2">Track user plans, subscription status, and growth metrics</p>
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
              <Users className="h-4 w-4 text-primary" />
              Active Subscriptions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{metrics?.activeSubscriptions || 0}</div>
            <p className="text-xs text-slate-500 mt-1">
              {metrics?.totalSubscribers && Math.round((metrics.activeSubscriptions / metrics.totalSubscribers) * 100)}% of total
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              Cancelled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{metrics?.cancelledSubscriptions || 0}</div>
            <p className="text-xs text-slate-500 mt-1">Churn rate: {metrics?.churnRate || 0}%</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              30-Day Upgrades
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{metrics?.metrics30Days?.upgrades || 0}</div>
            <p className="text-xs text-slate-500 mt-1">+R {metrics?.mrrMovement?.fromUpgrades || 0} MRR</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-orange-500" />
              30-Day Downgrades
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{metrics?.metrics30Days?.downgrades || 0}</div>
            <p className="text-xs text-slate-500 mt-1">-R {metrics?.mrrMovement?.fromDowngrades || 0} MRR</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity Log</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="churn">Churn Analysis</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Users per Plan */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Plan Category Charts */}
            <Card className="shadow-xl rounded-2xl border-0 lg:col-span-1">
              <CardHeader className="bg-gradient-to-r from-[#f24e00] to-[#ff7c00] text-white rounded-t-2xl">
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Users by Plan
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChartComponent>
                      <Pie
                        data={planChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value, percent }) => `${name} ${value} (${(percent * 100).toFixed(0)}%)`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {planChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChartComponent>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Plan Details */}
            <Card className="shadow-xl rounded-2xl border-0 lg:col-span-2">
              <CardHeader className="bg-gradient-to-r from-[#f24e00] to-[#ff7c00] text-white rounded-t-2xl">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Plan Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {planData && Object.entries(planData).map(([category, data]) => (
                  <div key={category} className="border-b pb-4 last:border-b-0">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-slate-900">{category}</h4>
                      <Badge variant="outline">{data.count} users</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-200 rounded-full h-2">
                        <div 
                          className="bg-primary/100 h-2 rounded-full" 
                          style={{ width: `${data.percentage}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-slate-600 w-12 text-right">
                        {data.percentage}%
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Plans: {data.plans.join(', ')}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Subscription Status */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Status Chart */}
            <Card className="shadow-xl rounded-2xl border-0 lg:col-span-1">
              <CardHeader className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-t-2xl">
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
                  Status Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChartComponent>
                      <Pie
                        data={statusChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name} (${value})`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {statusChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChartComponent>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Status Details */}
            <Card className="shadow-xl rounded-2xl border-0 lg:col-span-2">
              <CardHeader className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-t-2xl">
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Subscription Status
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-3">
                {statusData && (
                  <>
                    <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border-l-4 border-green-500">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        <div>
                          <p className="font-semibold text-slate-900">Active</p>
                          <p className="text-xs text-slate-500">{statusData.active.count} subscriptions</p>
                        </div>
                      </div>
                      <Badge className="bg-green-500 text-white">{statusData.active.percentage}%</Badge>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border-l-4 border-red-500">
                      <div className="flex items-center gap-3">
                        <XCircle className="h-5 w-5 text-red-500" />
                        <div>
                          <p className="font-semibold text-slate-900">Cancelled</p>
                          <p className="text-xs text-slate-500">{statusData.cancelled.count} subscriptions</p>
                        </div>
                      </div>
                      <Badge className="bg-red-500 text-white">{statusData.cancelled.percentage}%</Badge>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border-l-4 border-yellow-500">
                      <div className="flex items-center gap-3">
                        <Clock className="h-5 w-5 text-yellow-500" />
                        <div>
                          <p className="font-semibold text-slate-900">Paused</p>
                          <p className="text-xs text-slate-500">{statusData.paused.count} subscriptions</p>
                        </div>
                      </div>
                      <Badge className="bg-yellow-500 text-white">{statusData.paused.percentage}%</Badge>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border-l-4 border-purple-500">
                      <div className="flex items-center gap-3">
                        <AlertCircle className="h-5 w-5 text-purple-500" />
                        <div>
                          <p className="font-semibold text-slate-900">Trial</p>
                          <p className="text-xs text-slate-500">{statusData.trialing.count} subscriptions</p>
                        </div>
                      </div>
                      <Badge className="bg-purple-500 text-white">{statusData.trialing.percentage}%</Badge>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* MRR Trend */}
          <Card className="shadow-xl rounded-2xl border-0">
            <CardHeader className="bg-gradient-to-r from-[#f24e00] to-[#ff7c00] text-white rounded-t-2xl">
              <CardTitle className="flex items-center gap-2">
                <LineChartIcon className="h-5 w-5" />
                Monthly Recurring Revenue Trend (12 Months)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={mrrTrend} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                    <defs>
                      <linearGradient id="colorMrr" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f24e00" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#f24e00" stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => `$${value}`} />
                    <Area 
                      type="monotone" 
                      dataKey="mrr" 
                      stroke="#f24e00" 
                      fillOpacity={1} 
                      fill="url(#colorMrr)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Log Tab */}
        <TabsContent value="activity" className="space-y-6">
          <Card className="shadow-xl rounded-2xl border-0">
            <CardHeader className="bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-t-2xl">
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent Subscription Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {timelineEvents.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <p>No activity recorded yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {timelineEvents.map((event) => (
                    <div key={event.id} className="flex items-start gap-4 p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors">
                      <div className="pt-1">
                        {event.type === 'upgrade' && <TrendingUp className="h-5 w-5 text-green-500" />}
                        {event.type === 'downgrade' && <TrendingDown className="h-5 w-5 text-orange-500" />}
                        {event.type === 'cancel' && <XCircle className="h-5 w-5 text-red-500" />}
                        {event.type === 'reactivate' && <CheckCircle className="h-5 w-5 text-primary" />}
                        {event.type === 'extend' && <Clock className="h-5 w-5 text-purple-500" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900">{event.userName}</p>
                          <Badge variant="outline" className="text-xs">
                            {event.type === 'upgrade' && 'Upgrade'}
                            {event.type === 'downgrade' && 'Downgrade'}
                            {event.type === 'cancel' && 'Cancellation'}
                            {event.type === 'reactivate' && 'Reactivation'}
                            {event.type === 'extend' && 'Extension'}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-600 mt-1">
                          {event.fromPlan} {event.type !== 'cancel' && event.type !== 'extend' && `→ ${event.toPlan}`}
                        </p>
                        {event.reason && <p className="text-xs text-slate-500 mt-1">Reason: {event.reason}</p>}
                        <p className="text-xs text-slate-400 mt-2">
                          {new Date(event.timestamp).toLocaleDateString()} {new Date(event.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analysis Tab */}
        <TabsContent value="analysis" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="shadow-xl rounded-2xl border-0">
              <CardHeader className="bg-gradient-to-r from-[#f24e00] to-[#ff7c00] text-white rounded-t-2xl">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  30-Day Movement
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-3">
                {metrics && (
                  <>
                    <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
                      <span className="text-slate-700 font-medium">Upgrades</span>
                      <span className="text-2xl font-bold text-green-600">+{metrics.metrics30Days.upgrades}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                      <span className="text-slate-700 font-medium">Downgrades</span>
                      <span className="text-2xl font-bold text-orange-600">{metrics.metrics30Days.downgrades}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                      <span className="text-slate-700 font-medium">Cancellations</span>
                      <span className="text-2xl font-bold text-red-600">{metrics.metrics30Days.cancellations}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                      <span className="text-slate-700 font-medium">Reactivations</span>
                      <span className="text-2xl font-bold text-green-600">+{metrics.metrics30Days.reactivations}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border-2 border-orange-300">
                      <span className="text-slate-700 font-medium font-semibold">Net Movement</span>
                      <span className={`text-2xl font-bold ${metrics.metrics30Days.netMovement >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {metrics.metrics30Days.netMovement > 0 ? '+' : ''}{metrics.metrics30Days.netMovement}
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-xl rounded-2xl border-0">
              <CardHeader className="bg-gradient-to-r from-[#f24e00] to-[#ffa600] text-white rounded-t-2xl">
                <CardTitle className="flex items-center gap-2">
                  <LineChartIcon className="h-5 w-5" />
                  MRR Movement
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-3">
                {metrics && (
                  <>
                    <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                      <span className="text-slate-700 font-medium">From Upgrades</span>
                      <span className="text-2xl font-bold text-green-600">+${metrics.mrrMovement.fromUpgrades}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                      <span className="text-slate-700 font-medium">From Downgrades</span>
                      <span className="text-2xl font-bold text-red-600">${metrics.mrrMovement.fromDowngrades}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border-2 border-slate-300">
                      <span className="text-slate-700 font-medium font-semibold">Net MRR Movement</span>
                      <span className={`text-2xl font-bold ${metrics.mrrMovement.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {metrics.mrrMovement.net > 0 ? '+' : ''}${metrics.mrrMovement.net}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                      <span className="text-slate-700 font-medium">Churn Rate</span>
                      <span className="text-2xl font-bold text-purple-600">{metrics.churnRate}%</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Churn Analysis Tab */}
        <TabsContent value="churn" className="space-y-6">
          {churnData && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="shadow-xl rounded-2xl border-0">
                  <CardHeader className="bg-gradient-to-r from-red-500 to-pink-600 text-white rounded-t-2xl">
                    <CardTitle className="flex items-center gap-2">
                      <XCircle className="h-5 w-5" />
                      Cancellation Reasons
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-2">
                    {Object.entries(churnData.reasonBreakdown).length === 0 ? (
                      <p className="text-slate-500 text-center py-4">No cancellations recorded</p>
                    ) : (
                      Object.entries(churnData.reasonBreakdown).map(([reason, count]) => (
                        <div key={reason} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                          <span className="text-slate-700">{reason}</span>
                          <Badge variant="destructive">{count}</Badge>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-xl rounded-2xl border-0">
                  <CardHeader className="bg-gradient-to-r from-red-500 to-pink-600 text-white rounded-t-2xl">
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Cancellations by Plan
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-2">
                    {Object.entries(churnData.planBreakdown).length === 0 ? (
                      <p className="text-slate-500 text-center py-4">No cancellations recorded</p>
                    ) : (
                      Object.entries(churnData.planBreakdown).map(([plan, count]) => (
                        <div key={plan} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-red-200">
                          <span className="text-slate-700 font-medium capitalize">{plan}</span>
                          <Badge>{count}</Badge>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              {churnData.recentCancellations.length > 0 && (
                <Card className="shadow-xl rounded-2xl border-0">
                  <CardHeader className="bg-gradient-to-r from-red-500 to-pink-600 text-white rounded-t-2xl">
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Recent Cancellations
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="space-y-2">
                      {churnData.recentCancellations.map((cancel) => (
                        <div key={cancel.id} className="flex items-start gap-4 p-3 bg-red-50 rounded-lg border border-red-200">
                          <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-1" />
                          <div className="flex-1">
                            <p className="font-semibold text-slate-900">{cancel.userName}</p>
                            <p className="text-sm text-slate-600">{cancel.userEmail}</p>
                            {cancel.reason && <p className="text-xs text-slate-500 mt-1">Reason: {cancel.reason}</p>}
                            <p className="text-xs text-slate-400 mt-2">
                              {new Date(cancel.timestamp).toLocaleDateString()}
                            </p>
                          </div>
                          <Badge variant="destructive">{cancel.fromPlan}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
