import { useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { RecurringInvoiceService } from '../../services/RecurringInvoiceService';
import { formatCurrency } from '@/utils/currencyCalculations';
import {
  TrendingUp,
  AlertCircle,
  PauseCircle,
  CheckCircle2,
  DollarSign,
  BarChart3,
  Calendar
} from 'lucide-react';
import PropTypes from 'prop-types';
import { addMonths, format } from 'date-fns';

const RecurringInvoiceAnalytics = ({ recurringInvoices }) => {
  const [viewMode, setViewMode] = useState('monthly'); // 'monthly' or 'yearly'
  const stats = useMemo(() => {
    if (!recurringInvoices || recurringInvoices.length === 0) {
      return {
        total: 0,
        active: 0,
        paused: 0,
        ended: 0,
        totalMRR: 0,
        totalARR: 0,
        due: 0,
        byFrequency: [],
        revenueByFrequency: [],
        revenue12Month: [],
        revenueBy12Year: []
      };
    }

    // Count statistics
    const active = recurringInvoices.filter(ri => ri.status === 'active').length;
    const paused = recurringInvoices.filter(ri => ri.status === 'paused').length;
    const ended = recurringInvoices.filter(ri => ri.status === 'ended').length;
    const due = recurringInvoices.filter(ri => 
      ri.status === 'active' && RecurringInvoiceService.isDue(ri)
    ).length;

    // Revenue calculations
    let totalMRR = 0;
    let totalARR = 0;

    recurringInvoices.forEach(ri => {
      if (ri.status === 'active') {
        const frequency = RecurringInvoiceService.getFrequency(ri.frequency);
        const monthlyValue = (ri.total_amount * 12) / (frequency.daysInCycle / 365.25);
        totalMRR += monthlyValue;
        totalARR += monthlyValue * 12;
      }
    });

    // By frequency breakdown
    const frequencyMap = {};
    const frequencyRevenueMap = {};
    recurringInvoices.forEach(ri => {
      const freqLabel = RecurringInvoiceService.getFrequency(ri.frequency).label;
      frequencyMap[freqLabel] = (frequencyMap[freqLabel] || 0) + 1;

      if (ri.status === 'active') {
        const frequency = RecurringInvoiceService.getFrequency(ri.frequency);
        const monthlyValue = (ri.total_amount * 12) / (frequency.daysInCycle / 365.25);
        frequencyRevenueMap[freqLabel] = (frequencyRevenueMap[freqLabel] || 0) + monthlyValue;
      }
    });

    const byFrequency = Object.entries(frequencyMap).map(([name, count]) => ({
      name,
      value: count,
      revenue: frequencyRevenueMap[name] || 0
    }));

    const revenueByFrequency = Object.entries(frequencyRevenueMap).map(([name, revenue]) => ({
      name,
      revenue
    }));

    // 12-month revenue projection
    const revenue12Month = [];
    for (let i = 0; i < 12; i++) {
      const date = addMonths(new Date(), i);
      const monthLabel = format(date, 'MMM');
      
      const monthRevenue = recurringInvoices.reduce((sum, ri) => {
        if (ri.status !== 'active') return sum;
        
        // Check if invoice would be generated this month
        const nextGen = new Date(ri.next_generation_date);
        const endDate = ri.end_date ? new Date(ri.end_date) : null;
        
        if (nextGen > date || (endDate && endDate < date)) {
          return sum;
        }

        const frequency = RecurringInvoiceService.getFrequency(ri.frequency);
        const monthlyValue = (ri.total_amount * 12) / (frequency.daysInCycle / 365.25);
        return sum + monthlyValue;
      }, 0);

      revenue12Month.push({
        month: monthLabel,
        revenue: Math.round(monthRevenue * 100) / 100
      });
    }

    // 12-year revenue projection
    const revenueBy12Year = [];
    for (let i = 0; i < 12; i++) {
      const year = new Date().getFullYear() + i;
      
      const yearRevenue = recurringInvoices.reduce((sum, ri) => {
        if (ri.status !== 'active') return sum;
        
        const frequency = RecurringInvoiceService.getFrequency(ri.frequency);
        const monthlyValue = (ri.total_amount * 12) / (frequency.daysInCycle / 365.25);
        const yearlyValue = monthlyValue * 12;
        return sum + yearlyValue;
      }, 0);

      revenueBy12Year.push({
        year: year.toString(),
        revenue: Math.round(yearRevenue * 100) / 100
      });
    }

    return {
      total: recurringInvoices.length,
      active,
      paused,
      ended,
      due,
      totalMRR,
      totalARR,
      byFrequency,
      revenueByFrequency,
      revenue12Month,
      revenueBy12Year
    };
  }, [recurringInvoices]);

  const COLORS = [
    '#3b82f6', // blue
    '#10b981', // emerald
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#ec4899'  // pink
  ];

  const statusColors = {
    active: '#10b981',
    paused: '#f59e0b',
    ended: '#9ca3af'
  };

  return (
    <div className="space-y-6">
      {/* View Mode Toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Revenue Overview</h3>
        <div className="flex gap-2">
          <Button
            onClick={() => setViewMode('monthly')}
            variant={viewMode === 'monthly' ? 'default' : 'outline'}
            size="sm"
          >
            Monthly View
          </Button>
          <Button
            onClick={() => setViewMode('yearly')}
            variant={viewMode === 'yearly' ? 'default' : 'outline'}
            size="sm"
          >
            Yearly View
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Total Templates */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              Total Templates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.total}</p>
            <p className="text-xs text-gray-500 mt-1">
              {stats.active} active, {stats.paused} paused
            </p>
          </CardContent>
        </Card>

        {/* Due for Generation */}
        <Card className={stats.due > 0 ? 'border-blue-200 bg-blue-50' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-blue-600" />
              Due for Generation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">{stats.due}</p>
            <p className="text-xs text-gray-500 mt-1">Ready to generate invoices</p>
          </CardContent>
        </Card>

        {/* Revenue Card - Changes based on view mode */}
        {viewMode === 'monthly' ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                Monthly Revenue (MRR)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-emerald-600">
                {formatCurrency(stats.totalMRR, 'USD')}
              </p>
              <p className="text-xs text-gray-500 mt-1">From {stats.active} active templates</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-purple-600" />
                Annual Revenue (ARR)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-purple-600">
                {formatCurrency(stats.totalARR, 'USD')}
              </p>
              <p className="text-xs text-gray-500 mt-1">From {stats.active} active templates</p>
            </CardContent>
          </Card>
        )}

        {/* Annual Recurring Revenue - Only show in monthly mode */}
        {viewMode === 'monthly' && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-purple-600" />
                Annual Revenue (ARR)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-purple-600">
                {formatCurrency(stats.totalARR, 'USD')}
              </p>
              <p className="text-xs text-gray-500 mt-1">Projected annual recurring</p>
            </CardContent>
          </Card>
        )}

        {/* Active */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{stats.active}</p>
            <p className="text-xs text-gray-500 mt-1">Currently generating invoices</p>
          </CardContent>
        </Card>

        {/* Paused/Ended */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <PauseCircle className="w-4 h-4 text-amber-600" />
              Paused/Ended
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-600">{stats.paused + stats.ended}</p>
            <p className="text-xs text-gray-500 mt-1">
              {stats.paused} paused, {stats.ended} ended
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      {stats.total > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Revenue Projection Chart - Changes based on view mode */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                {viewMode === 'monthly' ? '12-Month Revenue Projection' : '12-Year Revenue Projection'}
              </CardTitle>
              <CardDescription>
                {viewMode === 'monthly' ? 'Projected monthly recurring revenue' : 'Projected annual recurring revenue'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={viewMode === 'monthly' ? stats.revenue12Month : stats.revenueBy12Year}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey={viewMode === 'monthly' ? 'month' : 'year'} />
                  <YAxis />
                  <Tooltip
                    formatter={(value) => formatCurrency(value, 'USD')}
                    contentStyle={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#3b82f6"
                    dot={{ fill: '#3b82f6', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Monthly Revenue Trend - Only show in monthly mode */}
          {viewMode === 'monthly' && stats.revenueByFrequency.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  MRR by Billing Frequency
                </CardTitle>
                <CardDescription>Monthly revenue contribution by frequency</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stats.revenueByFrequency}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip
                      formatter={(value) => formatCurrency(value, 'USD')}
                      contentStyle={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}
                    />
                    <Bar dataKey="revenue" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Distribution by Frequency */}
          {stats.byFrequency.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Templates by Frequency</CardTitle>
                <CardDescription>Count of templates by billing cycle</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={stats.byFrequency}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name} (${value})`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {stats.byFrequency.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Status Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status Distribution</CardTitle>
              <CardDescription>Active, paused, and ended templates</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Active', value: stats.active },
                      { name: 'Paused', value: stats.paused },
                      { name: 'Ended', value: stats.ended }
                    ]}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name} (${value})`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    <Cell fill={statusColors.active} />
                    <Cell fill={statusColors.paused} />
                    <Cell fill={statusColors.ended} />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Frequency Legend */}
      {stats.byFrequency.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Frequency Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.byFrequency.map((freq, idx) => (
                <div key={freq.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                    />
                    <span className="font-medium">{freq.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant="outline">{freq.value} templates</Badge>
                    <span className="font-semibold text-emerald-600 w-28 text-right">
                      {formatCurrency(freq.revenue, 'USD')}/mo
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

RecurringInvoiceAnalytics.propTypes = {
  recurringInvoices: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    frequency: PropTypes.string.isRequired,
    total_amount: PropTypes.number.isRequired,
    status: PropTypes.oneOf(['active', 'paused', 'ended']).isRequired,
    next_generation_date: PropTypes.string.isRequired,
    end_date: PropTypes.string
  }))
};

RecurringInvoiceAnalytics.defaultProps = {
  recurringInvoices: []
};

export default RecurringInvoiceAnalytics;
