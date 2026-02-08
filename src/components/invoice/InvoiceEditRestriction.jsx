import PropTypes from 'prop-types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Lock, Eye, AlertCircle, CheckCircle, DollarSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

/**
 * InvoiceEditRestriction Component
 * Displays restriction message when trying to edit paid/partially paid invoices
 */
export default function InvoiceEditRestriction({ invoice, reason = 'paid' }) {
  const navigate = useNavigate();

  const restrictions = {
    paid: {
      icon: CheckCircle,
      iconColor: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      title: 'Invoice is Paid',
      description: 'This invoice has been marked as paid and is now locked for editing to maintain financial record integrity.',
      reasons: [
        'Payment has been received and recorded',
        'Financial records must remain unchanged',
        'Audit trail must be preserved',
        'Editing could cause accounting discrepancies'
      ]
    },
    partial_paid: {
      icon: DollarSign,
      iconColor: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      title: 'Invoice is Partially Paid',
      description: 'This invoice has received partial payment and is locked for editing to protect financial accuracy.',
      reasons: [
        'Partial payment has been recorded',
        'Changes could affect payment tracking',
        'Financial reconciliation requires stability',
        'Payment history must remain accurate'
      ]
    },
    overdue: {
      icon: AlertCircle,
      iconColor: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      title: 'Invoice is Overdue',
      description: 'This overdue invoice has restricted editing to maintain payment collection efforts.',
      reasons: [
        'Invoice is past due date',
        'Collection process is active',
        'Changes could confuse payment status',
        'Client has already received original invoice'
      ]
    },
    cancelled: {
      icon: Lock,
      iconColor: 'text-slate-600',
      bgColor: 'bg-slate-100',
      borderColor: 'border-slate-200',
      title: 'Invoice is Cancelled',
      description: 'This invoice has been cancelled and is locked to preserve the audit trail.',
      reasons: [
        'Invoice has been cancelled',
        'Cancelled records should remain immutable',
        'Audit trail must be preserved',
        'Changes could create accounting discrepancies'
      ]
    }
  };

  const config = restrictions[reason] || restrictions.paid;
  const Icon = config.icon;

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <Card className="shadow-lg">
          <CardContent className="p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className={`w-20 h-20 ${config.bgColor} rounded-full flex items-center justify-center mx-auto mb-4`}>
                <Lock className="w-10 h-10 text-gray-600" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Editing Restricted
              </h1>
              <p className="text-gray-600 text-lg">
                Invoice #{invoice?.invoice_number}
              </p>
            </div>

            {/* Main Alert */}
            <Alert className={`${config.borderColor} ${config.bgColor} mb-6`}>
              <Icon className={`h-5 w-5 ${config.iconColor}`} />
              <AlertTitle className="text-lg font-semibold text-gray-900">
                {config.title}
              </AlertTitle>
              <AlertDescription className="text-gray-800 mt-2">
                {config.description}
              </AlertDescription>
            </Alert>

            {/* Reasons Card */}
            <Card className="mb-6 border-2">
              <CardContent className="p-6">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-gray-600" />
                  Why can&apos;t I edit this invoice?
                </h3>
                <ul className="space-y-3">
                  {config.reasons.map((reason, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-gray-400 mt-2 flex-shrink-0" />
                      <span className="text-gray-700">{reason}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Invoice Details */}
            {invoice && (
              <Card className="mb-6 bg-gray-50">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Invoice Details</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Invoice Number</p>
                      <p className="font-semibold text-gray-900">{invoice.invoice_number}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Status</p>
                      <p className="font-semibold text-gray-900 capitalize">
                        {invoice.status?.replace('_', ' ')}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Total Amount</p>
                      <p className="font-semibold text-gray-900">
                        {new Intl.NumberFormat('en-ZA', {
                          style: 'currency',
                          currency: invoice.owner_currency || 'ZAR'
                        }).format(invoice.total_amount || 0)}
                      </p>
                    </div>
                    {invoice.payments && invoice.payments.length > 0 && (
                      <div>
                        <p className="text-gray-600">Amount Paid</p>
                        <p className="font-semibold text-green-600">
                          {new Intl.NumberFormat('en-ZA', {
                            style: 'currency',
                            currency: invoice.owner_currency || 'ZAR'
                          }).format(
                            invoice.payments.reduce((sum, p) => sum + p.amount, 0)
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* What you can do */}
            <Card className="mb-8 border-blue-200 bg-blue-50">
              <CardContent className="p-6">
                <h3 className="font-semibold text-gray-900 mb-3">What you can do instead:</h3>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600">•</span>
                    <span>View the invoice in read-only mode</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600">•</span>
                    <span>Download or export the invoice</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600">•</span>
                    <span>Create a new invoice based on this one</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600">•</span>
                    <span>Contact support if you need to make corrections</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={() => navigate(createPageUrl('ViewInvoice') + `?id=${invoice?.id}`)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6"
              >
                <Eye className="w-4 h-4 mr-2" />
                View Invoice
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate(createPageUrl('Invoices'))}
                className="px-6"
              >
                Back to Invoices
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

InvoiceEditRestriction.propTypes = {
  invoice: PropTypes.shape({
    invoice_number: PropTypes.string,
    status: PropTypes.string,
    total_amount: PropTypes.number,
    owner_currency: PropTypes.string,
    payments: PropTypes.arrayOf(
      PropTypes.shape({
        amount: PropTypes.number,
      })
    ),
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }),
  reason: PropTypes.string,
};
