import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { OutstandingBalanceService } from '../../services/OutstandingBalanceService';
import { formatCurrency } from '@/utils/currencyCalculations';
import { AlertCircle, Clock } from 'lucide-react';
import PropTypes from 'prop-types';

const OutstandingBalanceDashboard = ({ invoices = [], payments = [], currency = 'USD' }) => {
  const analysis = useMemo(() => {
    if (!invoices || invoices.length === 0) {
      return {
        totals: {},
        aging: {},
        byDueStatus: {},
        byClient: [],
        critical: [],
        forecast: {}
      };
    }

    const summary = OutstandingBalanceService.generateSummary(invoices, payments);
    return summary;
  }, [invoices, payments]);

  if (!invoices || invoices.length === 0) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg text-center text-gray-500">
        No invoice data available
      </div>
    );
  }

  const agingData = Object.entries(analysis.aging).map(([, data]) => ({
    label: data.label,
    amount: data.amount,
    count: data.count
  }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-600">
              {formatCurrency(analysis.totals.totalOutstanding, currency)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {analysis.totals.unpaidInvoiceCount} of {analysis.totals.invoiceCount} invoices
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Collection Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">
              {analysis.totals.percentPaid.toFixed(1)}%
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {formatCurrency(analysis.totals.totalPaid, currency)} collected
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Avg Days to Pay</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">
              {analysis.metrics.averageDaysToPayment.toFixed(0)}
            </p>
            <p className="text-xs text-gray-500 mt-1">days from creation</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Payment Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-600">
              {analysis.metrics.paymentVelocity.toFixed(1)}%
            </p>
            <p className={`text-xs mt-1 font-semibold ${
              analysis.metrics.trend === 'excellent' ? 'text-green-600' :
              analysis.metrics.trend === 'good' ? 'text-blue-600' :
              analysis.metrics.trend === 'fair' ? 'text-orange-600' :
              'text-red-600'
            }`}>
              {analysis.metrics.trend.toUpperCase()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Outstanding by Due Status */}
      <Card>
        <CardHeader>
          <CardTitle>Outstanding by Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(analysis.byDueStatus).map(([key, status]) => {
              const statusColors = {
                notDue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900', bar: 'bg-blue-500' },
                dueToday: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-900', bar: 'bg-yellow-500' },
                overdue: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-900', bar: 'bg-red-500' }
              };

              const colors = statusColors[key] || statusColors.notDue;
              const totalStatus = analysis.totals.totalOutstanding || 1;
              const percentage = totalStatus > 0 ? (status.amount / totalStatus) * 100 : 0;

              return (
                <div key={key} className={`p-4 rounded-lg border ${colors.bg} ${colors.border}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className={`font-semibold ${colors.text}`}>{status.label}</p>
                      <p className={`text-2xl font-bold ${colors.text}`}>
                        {formatCurrency(status.amount, currency)}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-gray-600">
                      {status.count} invoices
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${colors.bar}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-2">{percentage.toFixed(1)}% of total outstanding</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Aging Analysis Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Outstanding Aging Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          {agingData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={agingData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value, currency)} />
                <Legend />
                <Bar dataKey="amount" fill="#ef4444" name="Outstanding Amount" />
                <Bar dataKey="count" fill="#3b82f6" name="Invoice Count" yAxisId="right" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
              No aging data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Clients by Outstanding Balance */}
      {analysis.byClient.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Clients by Outstanding Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analysis.byClient.map((client, idx) => (
                <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-semibold text-gray-900">{client.clientName}</p>
                      <p className="text-sm text-gray-600">{client.invoiceCount} invoices</p>
                    </div>
                    <p className="text-lg font-bold text-red-600">
                      {formatCurrency(client.outstanding, currency)}
                    </p>
                  </div>
                  <Progress
                    value={client.percentOutstanding}
                    className="h-2"
                  />
                  <div className="flex justify-between mt-2 text-xs text-gray-600">
                    <span>Total: {formatCurrency(client.total, currency)}</span>
                    <span>{client.percentOutstanding.toFixed(0)}% outstanding</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Critical Outstanding Items */}
      {analysis.critical.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-900 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Critical Outstanding Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analysis.critical.slice(0, 5).map((item, idx) => (
                <div key={idx} className="p-3 bg-white border border-red-200 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-gray-900">Invoice #{item.invoiceNumber}</p>
                      <p className="text-sm text-gray-600">
                        {item.daysOutstanding} days old • {formatCurrency(item.outstanding, currency)} outstanding
                      </p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded ${
                      item.priority === 'critical' 
                        ? 'bg-red-600 text-white' 
                        : 'bg-orange-600 text-white'
                    }`}>
                      {item.priority.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Forecast */}
      {analysis.forecast && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Payment Forecast
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium text-blue-900 mb-2">Estimated Time to Clear</p>
                <p className="text-3xl font-bold text-blue-600">
                  {analysis.forecast.estimatedMonthsToClear.toFixed(1)}
                </p>
                <p className="text-xs text-blue-700 mt-2">months at current payment rate</p>
              </div>

              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm font-medium text-green-900 mb-2">Average Monthly Payment</p>
                <p className="text-3xl font-bold text-green-600">
                  {formatCurrency(analysis.forecast.averageMonthlyPayment, currency)}
                </p>
                <p className="text-xs text-green-700 mt-2">based on payment history</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

OutstandingBalanceDashboard.propTypes = {
  invoices: PropTypes.arrayOf(PropTypes.object),
  payments: PropTypes.arrayOf(PropTypes.object),
  currency: PropTypes.string
};

OutstandingBalanceDashboard.defaultProps = {
  invoices: [],
  payments: [],
  currency: 'USD'
};

export default OutstandingBalanceDashboard;
