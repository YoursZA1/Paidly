import React from "react";
import PropTypes from 'prop-types';
import { Badge } from '@/components/ui/badge';
import { FileText, Send, CheckCircle, Clock, AlertCircle, XCircle, Eye } from 'lucide-react';

/**
 * InvoiceStatusBadge Component
 * Displays invoice status with appropriate styling
 */
function InvoiceStatusBadge({ status, size = 'default' }) {
  const sizeClasses = {
    small: 'text-[11px] px-2 py-0.5',
    default: 'text-xs px-2.5 py-1',
    large: 'text-sm px-3 py-1.5',
  };

  const statusConfig = {
    draft: {
      icon: FileText,
      label: 'Draft',
      className: 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300',
      description: 'Not sent to client',
    },
    sending: {
      icon: Send,
      label: 'Sending…',
      className: 'bg-primary/15 text-primary border-primary/20 animate-pulse',
      description: 'Sending to client',
    },
    preparing: {
      icon: Send,
      label: 'Preparing…',
      className: 'bg-primary/10 text-primary border-primary/20 animate-pulse',
      description: 'Preparing to send',
    },
    sent: {
      icon: Send,
      label: 'Sent',
      className: 'bg-primary/10 text-primary border-primary/20',
      description: 'Sent to client',
    },
    viewed: {
      icon: Eye,
      label: 'Viewed',
      className: 'bg-violet-500/10 text-violet-700 border-violet-500/20 dark:text-violet-300',
      description: 'Viewed by client',
    },
    pending: {
      icon: Clock,
      label: 'Pending',
      className: 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300',
      description: 'Awaiting payment',
    },
    paid: {
      icon: CheckCircle,
      label: 'Paid',
      className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300',
      description: 'Payment received',
    },
    partial_paid: {
      icon: AlertCircle,
      label: 'Partially Paid',
      className: 'bg-orange-500/10 text-orange-700 border-orange-500/20 dark:text-orange-300',
      description: 'Partial payment received',
    },
    overdue: {
      icon: AlertCircle,
      label: 'Overdue',
      className: 'bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-300',
      description: 'Payment overdue',
    },
    cancelled: {
      icon: XCircle,
      label: 'Cancelled',
      className: 'bg-muted/60 text-muted-foreground border-border',
      description: 'Invoice cancelled',
    },
  };

  const config = statusConfig[status] || statusConfig.draft;
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={`status-pill ${config.className} ${sizeClasses[size]} flex items-center gap-1 font-medium border rounded-full`}
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

export default React.memo(InvoiceStatusBadge);
