import { useState, useEffect } from 'react';
import { PaymentDateService } from '../../services/PaymentDateService';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { AlertCircle, Clock, TrendingUp } from 'lucide-react';
import PropTypes from 'prop-types';

function safeParseDate(value) {
  if (value == null || value === '') return null;
  const str = typeof value === 'string' ? value : (value instanceof Date ? value.toISOString() : String(value));
  if (!str) return null;
  try {
    return parseISO(str);
  } catch {
    return null;
  }
}

const OverduePaymentTracker = ({ invoices, payments }) => {
  const [overdueData, setOverdueData] = useState({
    totalOverdue: 0,
    overdueCount: 0,
    overdueInvoices: [],
    urgencyBreakdown: {
      thirtyDays: 0,
      sixtyDays: 0,
      ninetyDays: 0,
      over90: 0
    }
  });

  useEffect(() => {
    const calculateOverdue = () => {
      if (!invoices || invoices.length === 0) {
        setOverdueData({
          totalOverdue: 0,
          overdueCount: 0,
          overdueInvoices: [],
          urgencyBreakdown: {
            thirtyDays: 0,
            sixtyDays: 0,
            ninetyDays: 0,
            over90: 0
          }
        });
        return;
      }

      const today = new Date();
      const overdueInvoices = [];
      let totalOverdue = 0;
      const urgencyBreakdown = {
        thirtyDays: 0,
        sixtyDays: 0,
        ninetyDays: 0,
        over90: 0
      };

      invoices.forEach(invoice => {
        // Only check unpaid/partially paid invoices
        if (invoice.status === 'paid') return;

        const dueStr = invoice.due_date || invoice.delivery_date;
        if (!dueStr) return;
        const dueDate = safeParseDate(dueStr);
        if (!dueDate || dueDate > today) return; // Not overdue

        const daysOverdue = PaymentDateService.calculateDaysOverdue(dueStr);
        const category = PaymentDateService.getOverdueCategory(daysOverdue);

        // Calculate remaining balance
        const totalPaid = payments
          .filter(p => p.invoice_id === invoice.id)
          .reduce((sum, p) => sum + (p.amount || 0), 0);
        const remaining = (invoice.total || 0) - totalPaid;

        if (remaining > 0) {
          overdueInvoices.push({
            ...invoice,
            daysOverdue,
            remaining,
            category,
            lastPaymentDate: payments
              .filter(p => p.invoice_id === invoice.id)
              .sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date))[0]?.payment_date || null
          });

          totalOverdue += remaining;

          // Update urgency breakdown
          if (daysOverdue <= 30) urgencyBreakdown.thirtyDays++;
          else if (daysOverdue <= 60) urgencyBreakdown.sixtyDays++;
          else if (daysOverdue <= 90) urgencyBreakdown.ninetyDays++;
          else urgencyBreakdown.over90++;
        }
      });

      setOverdueData({
        totalOverdue,
        overdueCount: overdueInvoices.length,
        overdueInvoices: overdueInvoices.sort((a, b) => b.daysOverdue - a.daysOverdue),
        urgencyBreakdown
      });
    };

    calculateOverdue();
  }, [invoices, payments]);

  const getUrgencyColor = (category) => {
    switch (category) {
      case '30':
        return 'bg-yellow-50 border-yellow-200';
      case '60':
        return 'bg-orange-50 border-orange-200';
      case '90':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-red-50 border-red-200';
    }
  };

  const getUrgencyBadgeColor = (category) => {
    switch (category) {
      case '30':
        return 'bg-yellow-100 text-yellow-800';
      case '60':
        return 'bg-orange-100 text-orange-800';
      case '90':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-red-100 text-red-800';
    }
  };

  const getUrgencyLabel = (category) => {
    switch (category) {
      case '30':
        return '30 Days Overdue';
      case '60':
        return '60 Days Overdue';
      case '90':
        return '90 Days Overdue';
      default:
        return 'Over 90 Days';
    }
  };

  if (!invoices || invoices.length === 0) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg text-center text-gray-500">
        No invoices to track
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm font-medium">Overdue Count</span>
            <AlertCircle className="w-4 h-4 text-red-500" />
          </div>
          <p className="text-2xl font-bold text-red-600">
            {overdueData.overdueCount}
          </p>
          <p className="text-xs text-gray-500 mt-1">invoices overdue</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm font-medium">Total Overdue</span>
            <TrendingUp className="w-4 h-4 text-red-500" />
          </div>
          <p className="text-2xl font-bold text-red-600">
            ${overdueData.totalOverdue.toFixed(2)}
          </p>
          <p className="text-xs text-gray-500 mt-1">amount outstanding</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm font-medium">Critical (90+)</span>
            <Clock className="w-4 h-4 text-red-600" />
          </div>
          <p className="text-2xl font-bold text-red-600">
            {overdueData.urgencyBreakdown.over90}
          </p>
          <p className="text-xs text-gray-500 mt-1">overdue 90+ days</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm font-medium">At Risk</span>
            <AlertCircle className="w-4 h-4 text-orange-500" />
          </div>
          <p className="text-2xl font-bold text-orange-600">
            {overdueData.urgencyBreakdown.thirtyDays +
              overdueData.urgencyBreakdown.sixtyDays +
              overdueData.urgencyBreakdown.ninetyDays}
          </p>
          <p className="text-xs text-gray-500 mt-1">30-90 days overdue</p>
        </div>
      </div>

      {/* Urgency Distribution */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="font-semibold text-gray-900 mb-4">Overdue Distribution</h3>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-gray-600">30 Days Overdue</span>
              <span className="text-sm font-medium text-yellow-700">
                {overdueData.urgencyBreakdown.thirtyDays}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-yellow-400 h-2 rounded-full"
                style={{
                  width: `${
                    (overdueData.urgencyBreakdown.thirtyDays /
                      (overdueData.overdueCount || 1)) *
                    100
                  }%`
                }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-gray-600">60 Days Overdue</span>
              <span className="text-sm font-medium text-orange-700">
                {overdueData.urgencyBreakdown.sixtyDays}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-orange-400 h-2 rounded-full"
                style={{
                  width: `${
                    (overdueData.urgencyBreakdown.sixtyDays /
                      (overdueData.overdueCount || 1)) *
                    100
                  }%`
                }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-gray-600">90 Days Overdue</span>
              <span className="text-sm font-medium text-red-700">
                {overdueData.urgencyBreakdown.ninetyDays}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-red-400 h-2 rounded-full"
                style={{
                  width: `${
                    (overdueData.urgencyBreakdown.ninetyDays /
                      (overdueData.overdueCount || 1)) *
                    100
                  }%`
                }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-gray-600">Over 90 Days Overdue</span>
              <span className="text-sm font-medium text-red-800">
                {overdueData.urgencyBreakdown.over90}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-red-600 h-2 rounded-full"
                style={{
                  width: `${
                    (overdueData.urgencyBreakdown.over90 /
                      (overdueData.overdueCount || 1)) *
                    100
                  }%`
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Overdue Invoices Table */}
      {overdueData.overdueCount > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <h3 className="font-semibold text-gray-900">Overdue Invoices</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    Invoice #
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    Client
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    Due Date
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    Days Overdue
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">
                    Remaining
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    Last Payment
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {overdueData.overdueInvoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${getUrgencyColor(
                      invoice.category
                    )}`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {invoice.invoice_number}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{invoice.client_name}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {new Date(invoice.due_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-red-600">
                        {invoice.daysOverdue}
                      </span>
                      <span className="text-gray-600 text-xs ml-1">days</span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      ${invoice.remaining.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {invoice.lastPaymentDate && safeParseDate(invoice.lastPaymentDate)
                        ? formatDistanceToNow(
                            safeParseDate(invoice.lastPaymentDate),
                            { addSuffix: true }
                          )
                        : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getUrgencyBadgeColor(
                          invoice.category
                        )}`}
                      >
                        {getUrgencyLabel(invoice.category)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No Overdue Message */}
      {overdueData.overdueCount === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <div className="text-green-600 text-lg font-semibold mb-1">
            Great! No overdue invoices
          </div>
          <p className="text-green-600 text-sm">All invoices are either paid or not yet due.</p>
        </div>
      )}
    </div>
  );
};

OverduePaymentTracker.propTypes = {
  invoices: PropTypes.arrayOf(PropTypes.object).isRequired,
  payments: PropTypes.arrayOf(PropTypes.object).isRequired
};

export default OverduePaymentTracker;
