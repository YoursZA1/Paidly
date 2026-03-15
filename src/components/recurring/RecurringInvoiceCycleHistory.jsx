import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Invoice } from '@/api/entities';
import { Calendar, Eye, Clock, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency } from '@/utils/currencyCalculations';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import PropTypes from 'prop-types';

const RecurringInvoiceCycleHistory = ({ recurringInvoiceId }) => {
  const navigate = useNavigate();
  const [generatedInvoices, setGeneratedInvoices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    paid: 0,
    pending: 0,
    overdue: 0,
    totalRevenue: 0,
    paidRevenue: 0,
    paymentRate: 0
  });

  useEffect(() => {
    if (recurringInvoiceId) {
      loadCycleHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurringInvoiceId]);

  const loadCycleHistory = async () => {
    setIsLoading(true);
    try {
      // Fetch all invoices
      const allInvoices = await Invoice.list('-created_date');
      
      // Filter invoices generated from this recurring template
      const cycleInvoices = allInvoices.filter(
        inv => inv.recurring_invoice_id === recurringInvoiceId
      );

      setGeneratedInvoices(cycleInvoices);

      // Calculate statistics
      const total = cycleInvoices.length;
      const paid = cycleInvoices.filter(inv => inv.status === 'paid').length;
      const overdue = cycleInvoices.filter(inv => inv.status === 'overdue').length;
      const pending = cycleInvoices.filter(inv => 
        ['sent', 'viewed', 'draft'].includes(inv.status)
      ).length;

      const totalRevenue = cycleInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
      const paidRevenue = cycleInvoices
        .filter(inv => inv.status === 'paid')
        .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

      const paymentRate = total > 0 ? (paid / total) * 100 : 0;

      setStats({
        total,
        paid,
        pending,
        overdue,
        totalRevenue,
        paidRevenue,
        paymentRate
      });
    } catch (error) {
      console.error('Error loading cycle history:', error);
    }
    setIsLoading(false);
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      paid: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Paid' },
      sent: { color: 'bg-primary/15 text-primary', icon: Calendar, label: 'Sent' },
      viewed: { color: 'bg-purple-100 text-purple-800', icon: Eye, label: 'Viewed' },
      overdue: { color: 'bg-red-100 text-red-800', icon: AlertCircle, label: 'Overdue' },
      draft: { color: 'bg-gray-100 text-gray-800', icon: Clock, label: 'Draft' },
      cancelled: { color: 'bg-gray-100 text-gray-600', icon: XCircle, label: 'Cancelled' }
    };

    const config = statusConfig[status] || statusConfig.draft;
    const Icon = config.icon;

    return (
      <Badge className={config.color}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  const handleViewInvoice = (invoiceId) => {
    navigate(createPageUrl('view-invoice') + `?id=${invoiceId}`);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <Skeleton className="h-5 w-48 rounded" />
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4 py-3 border-b border-border last:border-0">
                <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32 rounded" />
                  <Skeleton className="h-3 w-24 rounded" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (generatedInvoices.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-12 pb-12">
          <div className="text-center">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-600 mb-2">No Invoices Generated Yet</h3>
            <p className="text-gray-500">
              No invoices have been generated from this recurring template yet.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Total Cycles</p>
              <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-green-600 mb-1">Paid</p>
              <p className="text-3xl font-bold text-green-600">{stats.paid}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-primary mb-1">Pending</p>
              <p className="text-3xl font-bold text-primary">{stats.pending}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-red-600 mb-1">Overdue</p>
              <p className="text-3xl font-bold text-red-600">{stats.overdue}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Summary */}
      <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
        <CardContent className="pt-6">
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Revenue</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(stats.totalRevenue, 'USD')}
              </p>
            </div>
            <div>
              <p className="text-sm text-green-600 mb-1">Collected</p>
              <p className="text-2xl font-bold text-green-700">
                {formatCurrency(stats.paidRevenue, 'USD')}
              </p>
            </div>
            <div>
              <p className="text-sm text-primary mb-1">Payment Rate</p>
              <p className="text-2xl font-bold text-primary">
                {stats.paymentRate.toFixed(1)}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cycle History Table */}
      <Card>
        <CardHeader>
          <CardTitle>Cycle History</CardTitle>
          <CardDescription>
            All invoices generated from this recurring template
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Cycle</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Invoice #</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Created</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Due Date</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Amount</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Status</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {generatedInvoices.map((invoice, index) => (
                  <tr key={invoice.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-900">
                      #{generatedInvoices.length - index}
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">
                      {invoice.invoice_number}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {invoice.created_date 
                        ? format(new Date(invoice.created_date), 'MMM dd, yyyy')
                        : 'N/A'
                      }
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {invoice.due_date 
                        ? format(new Date(invoice.due_date), 'MMM dd, yyyy')
                        : 'N/A'
                      }
                    </td>
                    <td className="py-3 px-4 text-sm font-semibold text-right text-gray-900">
                      {formatCurrency(invoice.total_amount || 0, 'USD')}
                    </td>
                    <td className="py-3 px-4">
                      {getStatusBadge(invoice.status)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewInvoice(invoice.id)}
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Payment Insights */}
      {stats.overdue > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-900">Payment Attention Needed</p>
                <p className="text-sm text-red-800 mt-1">
                  You have {stats.overdue} overdue invoice{stats.overdue > 1 ? 's' : ''} from this recurring template.
                  Consider following up with the client.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {stats.paymentRate === 100 && stats.paid > 2 && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-green-900">Perfect Payment Record</p>
                <p className="text-sm text-green-800 mt-1">
                  This client has paid all {stats.paid} invoices on time. Excellent payment history!
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

RecurringInvoiceCycleHistory.propTypes = {
  recurringInvoiceId: PropTypes.string.isRequired
};

export default RecurringInvoiceCycleHistory;
