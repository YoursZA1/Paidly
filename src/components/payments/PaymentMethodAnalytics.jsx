import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { PaymentMethodService } from '../../services/PaymentMethodService';
import { formatCurrency } from '@/utils/currencyCalculations';
import { Building2, Banknote, CreditCard, Smartphone, DollarSign } from 'lucide-react';
import PropTypes from 'prop-types';

const PaymentMethodAnalytics = ({ payments = [], currency = 'USD' }) => {
  const analytics = useMemo(() => {
    if (!payments || payments.length === 0) {
      return {
        distribution: {},
        statistics: {},
        efficiency: [],
        fees: { byMethod: {}, totalFees: 0 },
        chartData: []
      };
    }

    const distribution = PaymentMethodService.getMethodDistribution(payments);
    const statistics = PaymentMethodService.getMethodStatistics(payments);
    const efficiency = PaymentMethodService.getRankedByEfficiency(payments);
    const fees = PaymentMethodService.calculateTransactionFees(payments);

    // Prepare chart data
    const chartData = Object.entries(distribution).map(([, data]) => ({
      method: data.details.label,
      amount: data.amount,
      count: data.count,
      color: data.details.color
    }));

    return {
      distribution,
      statistics,
      efficiency,
      fees,
      chartData
    };
  }, [payments]);

  const getMethodIcon = (methodId) => {
    const methodDetails = PaymentMethodService.getMethodDetails(methodId);
    switch (methodDetails.icon) {
      case 'Building2':
        return <Building2 className="w-4 h-4" />;
      case 'Banknote':
        return <Banknote className="w-4 h-4" />;
      case 'CreditCard':
        return <CreditCard className="w-4 h-4" />;
      case 'Smartphone':
        return <Smartphone className="w-4 h-4" />;
      default:
        return <DollarSign className="w-4 h-4" />;
    }
  };

  if (!payments || payments.length === 0) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg text-center text-gray-500">
        No payment data available
      </div>
    );
  }

  const totalAmount = Object.values(analytics.distribution).reduce((sum, m) => sum + m.amount, 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Payment Methods Used</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-gray-900">{analytics.statistics.totalMethods}</p>
            <p className="text-xs text-gray-500 mt-1">
              {Object.keys(analytics.distribution).join(', ')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-gray-900">{payments.length}</p>
            <p className="text-xs text-gray-500 mt-1">
              {formatCurrency(totalAmount, currency)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Transaction Fees</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-orange-600">
              {formatCurrency(analytics.fees.totalFees, currency)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {((analytics.fees.totalFees / totalAmount) * 100).toFixed(2)}% of total
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Payment Distribution Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Method Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          {analytics.chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={analytics.chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ method, percent }) => `${method}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="amount"
                >
                  {analytics.chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value, currency)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-500">
              No distribution data
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Method Details Table */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Method Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Method</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Count</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Amount</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Average</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">% Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(analytics.distribution)
                  .sort((a, b) => b[1].amount - a[1].amount)
                  .map(([, data], idx) => (
                    <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: data.details.color }}
                          />
                          <span className="font-medium">{data.details.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{data.count}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {formatCurrency(data.amount, currency)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {formatCurrency(data.averageAmount, currency)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {((data.amount / totalAmount) * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Cost Efficiency Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Cost Efficiency Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {analytics.efficiency.map((method, idx) => (
              <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: method.details.color }}
                    />
                    <span className="font-medium text-gray-900">{method.details.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-700">
                    {method.efficiency.toFixed(2)}% efficient
                  </span>
                </div>
                <div className="space-y-1 text-xs text-gray-600">
                  <div className="flex justify-between">
                    <span>Transactions: {method.count}</span>
                    <span>Total: {formatCurrency(method.amount, currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fees: {formatCurrency(method.fees, currency)}</span>
                    <span>Cost/Txn: {formatCurrency(method.costPerTransaction, currency)}</span>
                  </div>
                </div>
                <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      backgroundColor: method.efficiency > 98 ? '#10b981' : method.efficiency > 95 ? '#f59e0b' : '#ef4444',
                      width: `${method.efficiency}%`
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Processing Time Info */}
      <Card>
        <CardHeader>
          <CardTitle>Processing Times</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {PaymentMethodService.getAllMethods().map((method) => (
              <div key={method.id} className="p-3 bg-gray-50 rounded-lg text-center">
                <div className="flex justify-center mb-2">
                  {getMethodIcon(method.id)}
                </div>
                <p className="text-xs font-medium text-gray-600">{method.label}</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{method.processingTime}d</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

PaymentMethodAnalytics.propTypes = {
  payments: PropTypes.arrayOf(PropTypes.object),
  currency: PropTypes.string
};

PaymentMethodAnalytics.defaultProps = {
  payments: [],
  currency: 'USD'
};

export default PaymentMethodAnalytics;
