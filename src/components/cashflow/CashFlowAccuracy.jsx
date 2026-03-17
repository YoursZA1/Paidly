import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { CashFlowService } from '../../services/CashFlowService';
import { formatCurrency } from '@/utils/currencyCalculations';
import { AlertCircle, TrendingUp, TrendingDown, CheckCircle, AlertTriangle } from 'lucide-react';
import PropTypes from 'prop-types';

const CashFlowAccuracy = ({ payments = [], expenses = [], currency = 'USD' }) => {
  const analysis = useMemo(() => {
    if (!payments && !expenses) {
      return {
        validation: { isValid: true, issues: [], warnings: [] },
        metrics: {},
        trends: {},
        margins: {},
        forecast: []
      };
    }

    return {
      validation: CashFlowService.validateData(payments, expenses),
      metrics: CashFlowService.calculateMetrics(payments, expenses),
      trends: CashFlowService.analyzeTrends(payments, expenses, 6),
      margins: CashFlowService.calculateMargins(payments, expenses),
      forecast: CashFlowService.generateForecast(payments, expenses, 3),
      monthlyData: CashFlowService.generateMonthlyCashFlow(payments, expenses, 6)
    };
  }, [payments, expenses]);

  if (!analysis.validation.isValid) {
    return (
      <Alert className="border-red-200 bg-red-50">
        <AlertCircle className="h-4 w-4 text-red-600" />
        <AlertDescription>
          <p className="font-semibold text-red-900 mb-2">Data Validation Issues:</p>
          <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
            {analysis.validation.issues.map((issue, idx) => (
              <li key={idx}>{issue}</li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Data Quality Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            Data Quality & Accuracy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-900 mb-1">Data Validation</p>
              <p className="text-2xl font-bold text-green-600">✓ Valid</p>
              <p className="text-xs text-green-700 mt-2">All records have required fields</p>
            </div>

            <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
              <p className="text-sm font-medium text-foreground mb-1">Total Transactions</p>
              <p className="text-2xl font-bold text-primary">{analysis.validation.totalTransactions}</p>
              <p className="text-xs text-primary mt-2">
                {analysis.validation.paymentCount} payments, {analysis.validation.expenseCount} expenses
              </p>
            </div>

            <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="text-sm font-medium text-purple-900 mb-1">Profitability</p>
              <p className="text-2xl font-bold text-purple-600">
                {analysis.metrics.profitabilityRate?.toFixed(0)}%
              </p>
              <p className="text-xs text-purple-700 mt-2">
                {analysis.metrics?.positiveMonths ?? 0} of {(analysis.metrics?.positiveMonths ?? 0) + (analysis.metrics?.negativeMonths ?? 0)} months positive
              </p>
            </div>
          </div>

          {analysis.validation.warnings.length > 0 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm font-medium text-yellow-900 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Data Warnings
              </p>
              <ul className="text-xs text-yellow-700 space-y-1 list-disc list-inside">
                {analysis.validation.warnings.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Current Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-600 font-medium">Income</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(analysis.metrics.currentMonth?.income || 0, currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600 font-medium">Expenses</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(analysis.metrics.currentMonth?.expenses || 0, currency)}
                </p>
              </div>
              <div className="pt-2 border-t border-gray-200">
                <p className="text-xs text-gray-600 font-medium">Net Cash Flow</p>
                <p className={`text-2xl font-bold ${(analysis.metrics.currentMonth?.net || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(analysis.metrics.currentMonth?.net || 0, currency)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">12-Month Averages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-600 font-medium">Avg Monthly Income</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(analysis.metrics.averageMonthlyIncome || 0, currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600 font-medium">Avg Monthly Expenses</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(analysis.metrics.averageMonthlyExpenses || 0, currency)}
                </p>
              </div>
              <div className="pt-2 border-t border-gray-200">
                <p className="text-xs text-gray-600 font-medium">Avg Monthly Net</p>
                <p className={`text-2xl font-bold ${(analysis.metrics.averageMonthlyNet || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(analysis.metrics.averageMonthlyNet || 0, currency)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Operating Margin Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Operating Margin Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-gradient-to-br from-primary/10 to-primary/15 border border-primary/20 rounded-lg">
              <p className="text-sm font-medium text-foreground mb-3">Current Month Margin</p>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-primary">Margin %</span>
                  <span className="text-lg font-bold text-foreground">
                    {analysis.margins.currentMonth?.marginPercentage?.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-primary/20 rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full"
                    style={{ width: `${Math.min(Math.max(analysis.margins.currentMonth?.marginPercentage || 0, 0), 100)}%` }}
                  />
                </div>
                <div className="text-xs text-primary pt-1">
                  {formatCurrency(analysis.margins.currentMonth?.margin || 0, currency)} profit on {formatCurrency(analysis.margins.currentMonth?.income || 0, currency)} income
                </div>
              </div>
            </div>

            <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg">
              <p className="text-sm font-medium text-purple-900 mb-3">12-Month Average Margin</p>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-purple-700">Margin %</span>
                  <span className="text-lg font-bold text-purple-900">
                    {analysis.margins.average?.marginPercentage?.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-purple-200 rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full"
                    style={{ width: `${Math.min(Math.max(analysis.margins.average?.marginPercentage || 0, 0), 100)}%` }}
                  />
                </div>
                <div className="text-xs text-purple-700 pt-1">
                  {formatCurrency(analysis.margins.average?.margin || 0, currency)} avg profit on {formatCurrency(analysis.margins.average?.income || 0, currency)} avg income
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trend Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>6-Month Trend Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className={`p-3 rounded-lg border ${
              analysis.trends.incomeTrend === 'increasing' ? 'bg-green-50 border-green-200' :
              analysis.trends.incomeTrend === 'decreasing' ? 'bg-red-50 border-red-200' :
              'bg-gray-50 border-gray-200'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {analysis.trends.incomeTrend === 'increasing' && <TrendingUp className="w-4 h-4 text-green-600" />}
                {analysis.trends.incomeTrend === 'decreasing' && <TrendingDown className="w-4 h-4 text-red-600" />}
                <span className="text-xs font-medium text-gray-700">Income Trend</span>
              </div>
              <p className="text-sm font-semibold text-gray-900 capitalize">
                {analysis.trends.incomeTrend}
              </p>
            </div>

            <div className={`p-3 rounded-lg border ${
              analysis.trends.expenseTrend === 'decreasing' ? 'bg-green-50 border-green-200' :
              analysis.trends.expenseTrend === 'increasing' ? 'bg-red-50 border-red-200' :
              'bg-gray-50 border-gray-200'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {analysis.trends.expenseTrend === 'decreasing' && <TrendingDown className="w-4 h-4 text-green-600" />}
                {analysis.trends.expenseTrend === 'increasing' && <TrendingUp className="w-4 h-4 text-red-600" />}
                <span className="text-xs font-medium text-gray-700">Expense Trend</span>
              </div>
              <p className="text-sm font-semibold text-gray-900 capitalize">
                {analysis.trends.expenseTrend}
              </p>
            </div>

            <div className={`p-3 rounded-lg border ${
              analysis.trends.netTrend === 'increasing' ? 'bg-green-50 border-green-200' :
              analysis.trends.netTrend === 'decreasing' ? 'bg-red-50 border-red-200' :
              'bg-gray-50 border-gray-200'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {analysis.trends.netTrend === 'increasing' && <TrendingUp className="w-4 h-4 text-green-600" />}
                {analysis.trends.netTrend === 'decreasing' && <TrendingDown className="w-4 h-4 text-red-600" />}
                <span className="text-xs font-medium text-gray-700">Net Cash Flow Trend</span>
              </div>
              <p className="text-sm font-semibold text-gray-900 capitalize">
                {analysis.trends.netTrend}
              </p>
            </div>
          </div>

          {analysis.trends.monthlyData && analysis.trends.monthlyData.length > 0 && (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analysis.trends.monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="shortMonth" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value, currency)} />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="income" 
                  stroke="#10b981" 
                  name="Income"
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="expenses" 
                  stroke="#ef4444" 
                  name="Expenses"
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="net" 
                  stroke="#3b82f6" 
                  name="Net"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Cash Flow Forecast */}
      {analysis.forecast && analysis.forecast.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>3-Month Cash Flow Forecast</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analysis.forecast.map((month, idx) => (
                <div key={idx} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-medium text-gray-900">{month.month}</p>
                    <p className={`text-lg font-bold ${month.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(month.net, currency)}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                    <div>Income: {formatCurrency(month.income, currency)}</div>
                    <div>Expenses: {formatCurrency(month.expenses, currency)}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Accuracy Notes */}
      <Card className="bg-primary/10 border-primary/20">
        <CardHeader>
          <CardTitle className="text-sm text-foreground">Cash Flow Accuracy</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-primary space-y-2">
          <p>✓ Income calculated from actual payment dates, not invoice creation dates</p>
          <p>✓ Expenses matched to transaction dates for accurate period reporting</p>
          <p>✓ All calculations validated for data integrity and consistency</p>
          <p>✓ Forecasts based on 6-month historical averages</p>
          <p>✓ Margin analysis includes transaction fees and adjustments</p>
        </CardContent>
      </Card>
    </div>
  );
};

CashFlowAccuracy.propTypes = {
  payments: PropTypes.arrayOf(PropTypes.object),
  expenses: PropTypes.arrayOf(PropTypes.object),
  currency: PropTypes.string
};

CashFlowAccuracy.defaultProps = {
  payments: [],
  expenses: [],
  currency: 'USD'
};

export default CashFlowAccuracy;
