import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { RecurringInvoice } from '@/api/entities';
import { RecurringInvoiceService } from '../../services/RecurringInvoiceService';
import { formatCurrency } from '@/utils/currencyCalculations';
import {
  MoreVertical,
  Pause,
  Play,
  Zap,
  Trash2,
  Edit2,
  TrendingUp,
  Calendar,
  AlertCircle,
  Copy,
  History
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import PropTypes from 'prop-types';

const RecurringInvoiceCard = ({
  recurringInvoice,
  onEdit,
  onDelete,
  onRefresh,
  onViewCycleHistory,
  clientName
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const frequency = RecurringInvoiceService.getFrequency(recurringInvoice.frequency);
  const isDue = RecurringInvoiceService.isDue(recurringInvoice);
  
  // Calculate schedule preview
  const schedule = RecurringInvoiceService.getUpcomingSchedule(recurringInvoice, 3);

  // Calculate revenue metrics
  const mrr = recurringInvoice.frequency === 'monthly' 
    ? recurringInvoice.total_amount 
    : (recurringInvoice.total_amount * 12) / (frequency.daysInCycle / 365.25);
  
  const arr = mrr * 12;

  const getStatusColor = () => {
    if (recurringInvoice.status === 'paused') return 'bg-yellow-50 border-yellow-200';
    if (recurringInvoice.status === 'ended') return 'bg-gray-50 border-gray-200';
    if (isDue) return 'bg-blue-50 border-blue-200';
    return 'bg-white';
  };

  const getStatusBadgeColor = () => {
    if (recurringInvoice.status === 'paused') return 'bg-yellow-100 text-yellow-800';
    if (recurringInvoice.status === 'ended') return 'bg-gray-100 text-gray-800';
    if (isDue) return 'bg-blue-100 text-blue-800';
    return 'bg-green-100 text-green-800';
  };

  const getStatusLabel = () => {
    if (recurringInvoice.status === 'paused') return 'Paused';
    if (recurringInvoice.status === 'ended') return 'Ended';
    if (isDue) return 'Due for Generation';
    return 'Active';
  };

  const handlePause = async () => {
    if (recurringInvoice.status === 'paused') {
      await handleResume();
      return;
    }

    setLoading(true);
    setError('');
    try {
      await RecurringInvoiceService.pauseRecurringInvoice(recurringInvoice.id);
      onRefresh?.();
    } catch (error) {
      setError('Failed to pause recurring invoice');
      console.error('Error pausing:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResume = async () => {
    setLoading(true);
    setError('');
    try {
      await RecurringInvoiceService.resumeRecurringInvoice(recurringInvoice.id);
      onRefresh?.();
    } catch (error) {
      setError('Failed to resume recurring invoice');
      console.error('Error resuming:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEnd = async () => {
    if (!window.confirm('Are you sure? This will mark the recurring invoice as ended.')) {
      return;
    }

    setLoading(true);
    setError('');
    try {
      await RecurringInvoiceService.endRecurringInvoice(recurringInvoice.id);
      onRefresh?.();
    } catch (error) {
      setError('Failed to end recurring invoice');
      console.error('Error ending:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this recurring invoice template?')) {
      return;
    }

    setLoading(true);
    setError('');
    try {
      await RecurringInvoice.delete(recurringInvoice.id);
      onDelete?.();
    } catch (error) {
      setError('Failed to delete recurring invoice');
      console.error('Error deleting:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateNow = async () => {
    setLoading(true);
    setError('');
    try {
      await RecurringInvoiceService.generateInvoiceFromRecurring(recurringInvoice);
      const nextDate = RecurringInvoiceService.calculateNextGenerationDate(
        recurringInvoice.next_generation_date,
        recurringInvoice.frequency
      );
      await RecurringInvoice.update(recurringInvoice.id, {
        next_generation_date: nextDate.toISOString(),
        last_generated_date: new Date().toISOString()
      });
      onRefresh?.();
    } catch (error) {
      setError('Failed to generate invoice');
      console.error('Error generating:', error);
    } finally {
      setLoading(false);
    }
  };

  const daysUntilDue = differenceInDays(new Date(recurringInvoice.next_generation_date), new Date());

  return (
    <Card className={`border transition-all ${getStatusColor()}`}>
      {error && (
        <Alert className="border-red-200 bg-red-50 m-4 mb-0 rounded-t-none">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-700 text-sm">{error}</AlertDescription>
        </Alert>
      )}

      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-600" />
              {recurringInvoice.template_name}
            </CardTitle>
            <CardDescription>{clientName}</CardDescription>
          </div>

          <div className="flex gap-2">
            <Badge className={getStatusBadgeColor()}>
              {getStatusLabel()}
            </Badge>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={loading}
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit?.(recurringInvoice)}>
                  <Edit2 className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => onViewCycleHistory?.(recurringInvoice)}>
                  <History className="w-4 h-4 mr-2" />
                  View Cycle History
                </DropdownMenuItem>

                <DropdownMenuItem onClick={handleGenerateNow} disabled={loading}>
                  <Copy className="w-4 h-4 mr-2" />
                  Generate Now
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {recurringInvoice.status !== 'ended' && (
                  <>
                    <DropdownMenuItem onClick={handlePause} disabled={loading}>
                      {recurringInvoice.status === 'paused' ? (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Resume
                        </>
                      ) : (
                        <>
                          <Pause className="w-4 h-4 mr-2" />
                          Pause
                        </>
                      )}
                    </DropdownMenuItem>

                    <DropdownMenuItem onClick={handleEnd} disabled={loading}>
                      <AlertCircle className="w-4 h-4 mr-2" />
                      End
                    </DropdownMenuItem>
                  </>
                )}

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={handleDelete}
                  disabled={loading}
                  className="text-red-600"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Frequency and Schedule */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600 mb-1">Frequency</p>
            <p className="font-semibold text-sm">{frequency.label}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600 mb-1">Next Generation</p>
            <p className="font-semibold text-sm">
              {format(new Date(recurringInvoice.next_generation_date), 'MMM dd')}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {daysUntilDue > 0 ? `in ${daysUntilDue}d` : 'overdue'}
            </p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600 mb-1">Total Amount</p>
            <p className="font-semibold text-sm text-blue-600">
              {formatCurrency(recurringInvoice.total_amount, 'USD')}
            </p>
          </div>
        </div>

        {/* Revenue Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
            <p className="text-xs text-emerald-700 mb-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Monthly Revenue (MRR)
            </p>
            <p className="font-bold text-emerald-700">
              {formatCurrency(mrr, 'USD')}
            </p>
          </div>
          <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
            <p className="text-xs text-purple-700 mb-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Annual Revenue (ARR)
            </p>
            <p className="font-bold text-purple-700">
              {formatCurrency(arr, 'USD')}
            </p>
          </div>
        </div>

        {/* Upcoming Schedule */}
        {schedule.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs font-semibold text-gray-600 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Upcoming {schedule.length} Invoices
            </p>
            <div className="space-y-1">
              {schedule.map((date, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs p-2 bg-gray-50 rounded">
                  <span className="text-gray-600">
                    {format(new Date(date), 'MMM dd, yyyy')}
                  </span>
                  <span className="text-gray-500">
                    {formatCurrency(recurringInvoice.total_amount, 'USD')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Meta Information */}
        <div className="text-xs text-gray-500 space-y-1 pt-2 border-t">
          {recurringInvoice.invoice_prefix && (
            <p>Invoice Prefix: <span className="font-medium text-gray-700">{recurringInvoice.invoice_prefix}</span></p>
          )}
          {recurringInvoice.last_generated_date && (
            <p>Last Generated: <span className="font-medium text-gray-700">{format(new Date(recurringInvoice.last_generated_date), 'MMM dd, yyyy')}</span></p>
          )}
          {recurringInvoice.end_date && (
            <p>Ends: <span className="font-medium text-gray-700">{format(new Date(recurringInvoice.end_date), 'MMM dd, yyyy')}</span></p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

RecurringInvoiceCard.propTypes = {
  recurringInvoice: PropTypes.shape({
    id: PropTypes.string.isRequired,
    template_name: PropTypes.string.isRequired,
    client_id: PropTypes.string.isRequired,
    frequency: PropTypes.string.isRequired,
    total_amount: PropTypes.number.isRequired,
    status: PropTypes.oneOf(['active', 'paused', 'ended']).isRequired,
    next_generation_date: PropTypes.string.isRequired,
    last_generated_date: PropTypes.string,
    end_date: PropTypes.string,
    invoice_prefix: PropTypes.string,
    notes: PropTypes.string
  }).isRequired,
  onEdit: PropTypes.func,
  onDelete: PropTypes.func,
  onRefresh: PropTypes.func,
  onViewCycleHistory: PropTypes.func,
  clientName: PropTypes.string
};

export default RecurringInvoiceCard;
