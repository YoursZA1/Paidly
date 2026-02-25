import PropTypes from 'prop-types';
import { Badge } from '@/components/ui/badge';
import { FileText, Send, CheckCircle, Clock, AlertCircle, XCircle, Eye } from 'lucide-react';

/**
 * InvoiceStatusBadge Component
 * Displays invoice status with appropriate styling
 */
export default function InvoiceStatusBadge({ status, size = 'default' }) {
  const sizeClasses = {
    small: 'text-xs px-2 py-0.5',
    default: 'text-sm px-3 py-1',
    large: 'text-base px-4 py-1.5',
  };

  const statusConfig = {
    draft: {
      icon: FileText,
      label: 'Draft',
      className: 'bg-gray-100 text-gray-700 border-gray-200',
      description: 'Not sent to client',
    },
    sent: {
      icon: Send,
      label: 'Sent',
      className: 'bg-blue-100 text-blue-700 border-blue-200',
      description: 'Sent to client',
    },
    viewed: {
      icon: Eye,
      label: 'Viewed',
      className: 'bg-purple-100 text-purple-700 border-purple-200',
      description: 'Viewed by client',
    },
    pending: {
      icon: Clock,
      label: 'Pending',
      className: 'bg-amber-100 text-amber-700 border-amber-200',
      description: 'Awaiting payment',
    },
    paid: {
      icon: CheckCircle,
      label: 'Paid',
      className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      description: 'Payment received',
    },
    partial_paid: {
      icon: AlertCircle,
      label: 'Partially Paid',
      className: 'bg-orange-100 text-orange-700 border-orange-200',
      description: 'Partial payment received',
    },
    overdue: {
      icon: AlertCircle,
      label: 'Overdue',
      className: 'bg-red-100 text-red-700 border-red-200',
      description: 'Payment overdue',
    },
    cancelled: {
      icon: XCircle,
      label: 'Cancelled',
      className: 'bg-gray-100 text-gray-500 border-gray-200',
      description: 'Invoice cancelled',
    },
  };

  const config = statusConfig[status] || statusConfig.draft;
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={`${config.className} ${sizeClasses[size]} flex items-center gap-1 font-medium border rounded-lg`}
      title={config.description}
    >
      <Icon className="w-3 h-3" />
      <span>{config.label}</span>
    </Badge>
  );
}

InvoiceStatusBadge.propTypes = {
  status: PropTypes.string,
  size: PropTypes.oneOf(['small', 'default', 'large']),
};
