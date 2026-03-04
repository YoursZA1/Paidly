import PropTypes from 'prop-types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, Calendar, DollarSign, User, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency } from '@/utils/currencyCalculations';

/**
 * DraftInvoiceInfo Component
 * Displays information about a draft invoice being edited
 */
export default function DraftInvoiceInfo({ invoice, client }) {
  if (!invoice) return null;

  const isDraft = invoice.status === 'draft';

  return (
    <Card className={`border-2 ${isDraft ? 'border-primary/20 bg-primary/10' : 'border-gray-200 bg-gray-50'}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText className={`w-5 h-5 ${isDraft ? 'text-primary' : 'text-gray-600'}`} />
            <h3 className="font-semibold text-gray-900">Invoice Information</h3>
          </div>
          <Badge 
            variant={isDraft ? 'default' : 'secondary'}
            className={isDraft ? 'bg-primary' : 'bg-gray-600'}
          >
            {isDraft ? 'DRAFT' : invoice.status?.toUpperCase()}
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Invoice Number */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
              <FileText className="w-4 h-4 text-gray-600" />
            </div>
            <div>
              <p className="text-xs text-gray-600">Invoice Number</p>
              <p className="font-semibold text-gray-900">{invoice.invoice_number}</p>
            </div>
          </div>

          {/* Client */}
          {client && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                <User className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Client</p>
                <p className="font-semibold text-gray-900">{client.name}</p>
              </div>
            </div>
          )}

          {/* Created Date */}
          {invoice.created_date && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                <Calendar className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Created</p>
                <p className="font-semibold text-gray-900">
                  {format(new Date(invoice.created_date), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
          )}

          {/* Total Amount */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-gray-600" />
            </div>
            <div>
              <p className="text-xs text-gray-600">Total Amount</p>
              <p className="font-semibold text-gray-900">
                {formatCurrency(invoice.total_amount || 0, invoice.owner_currency || 'ZAR')}
              </p>
            </div>
          </div>

          {/* Last Modified */}
          {invoice.last_modified_date && (
            <div className="flex items-center gap-2 sm:col-span-2">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                <Clock className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Last Modified</p>
                <p className="font-semibold text-gray-900">
                  {format(new Date(invoice.last_modified_date), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Draft-specific info */}
        {isDraft && (
          <div className="mt-4 pt-4 border-t border-primary/20">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Draft Status
                </p>
                <p className="text-xs text-primary mt-1">
                  This invoice hasn&apos;t been sent to the client. You can make changes and either save as draft or send it.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Sent-specific info */}
        {invoice.status === 'sent' && invoice.sent_date && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  Sent to Client
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Sent on {format(new Date(invoice.sent_date), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

DraftInvoiceInfo.propTypes = {
  invoice: PropTypes.shape({
    status: PropTypes.string,
    invoice_number: PropTypes.string,
    created_date: PropTypes.string,
    last_modified_date: PropTypes.string,
    total_amount: PropTypes.number,
    owner_currency: PropTypes.string,
    sent_date: PropTypes.string,
  }),
  client: PropTypes.shape({
    name: PropTypes.string,
  }),
};
