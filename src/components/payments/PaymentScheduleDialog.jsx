import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/utils/currencyCalculations';
import { addWeeks, addMonths } from 'date-fns';
import PropTypes from 'prop-types';

export default function PaymentScheduleDialog({ invoice, isOpen, onClose, onSave }) {
  const [installments, setInstallments] = useState([
    {
      amount: '',
      due_date: new Date().toISOString().slice(0, 10),
      description: ''
    }
  ]);
  const [template, setTemplate] = useState('');
  const [error, setError] = useState('');

  const totalScheduled = installments.reduce((sum, inst) => sum + (parseFloat(inst.amount) || 0), 0);
  const remainingAmount = invoice.total_amount - totalScheduled;

  const addInstallment = () => {
    const lastDate = installments[installments.length - 1]?.due_date || new Date().toISOString().slice(0, 10);
    setInstallments([
      ...installments,
      {
        amount: '',
        due_date: addMonths(new Date(lastDate), 1).toISOString().slice(0, 10),
        description: ''
      }
    ]);
  };

  const removeInstallment = (index) => {
    if (installments.length > 1) {
      setInstallments(installments.filter((_, i) => i !== index));
    }
  };

  const updateInstallment = (index, field, value) => {
    const updated = [...installments];
    updated[index][field] = value;
    setInstallments(updated);
    setError('');
  };

  const applyTemplate = (templateType) => {
    const today = new Date();
    let newInstallments = [];

    switch (templateType) {
      case 'split_2':
        newInstallments = [
          {
            amount: (invoice.total_amount / 2).toFixed(2),
            due_date: today.toISOString().slice(0, 10),
            description: 'First installment (50%)'
          },
          {
            amount: (invoice.total_amount / 2).toFixed(2),
            due_date: addMonths(today, 1).toISOString().slice(0, 10),
            description: 'Second installment (50%)'
          }
        ];
        break;

      case 'split_3': {
        const third = (invoice.total_amount / 3).toFixed(2);
        newInstallments = [
          {
            amount: third,
            due_date: today.toISOString().slice(0, 10),
            description: 'First installment (33%)'
          },
          {
            amount: third,
            due_date: addMonths(today, 1).toISOString().slice(0, 10),
            description: 'Second installment (33%)'
          },
          {
            amount: (invoice.total_amount - (parseFloat(third) * 2)).toFixed(2),
            due_date: addMonths(today, 2).toISOString().slice(0, 10),
            description: 'Final installment (34%)'
          }
        ];
        break;
      }

      case 'split_4': {
        const quarter = (invoice.total_amount / 4).toFixed(2);
        newInstallments = Array.from({ length: 4 }, (_, i) => ({
          amount: i === 3 ? (invoice.total_amount - (parseFloat(quarter) * 3)).toFixed(2) : quarter,
          due_date: addMonths(today, i).toISOString().slice(0, 10),
          description: `Installment ${i + 1} of 4 (${i === 3 ? 25 : 25}%)`
        }));
        break;
      }

      case 'weekly_4': {
        const weeklyAmount = (invoice.total_amount / 4).toFixed(2);
        newInstallments = Array.from({ length: 4 }, (_, i) => ({
          amount: i === 3 ? (invoice.total_amount - (parseFloat(weeklyAmount) * 3)).toFixed(2) : weeklyAmount,
          due_date: addWeeks(today, i + 1).toISOString().slice(0, 10),
          description: `Week ${i + 1} payment`
        }));
        break;
      }

      case 'deposit_balance': {
        const deposit = (invoice.total_amount * 0.3).toFixed(2);
        newInstallments = [
          {
            amount: deposit,
            due_date: today.toISOString().slice(0, 10),
            description: 'Deposit (30%)'
          },
          {
            amount: (invoice.total_amount - parseFloat(deposit)).toFixed(2),
            due_date: addMonths(today, 1).toISOString().slice(0, 10),
            description: 'Balance (70%)'
          }
        ];
        break;
      }

      default:
        return;
    }

    setInstallments(newInstallments);
    setTemplate(templateType);
  };

  const handleSave = () => {
    // Validation
    if (installments.some(inst => !inst.amount || !inst.due_date)) {
      setError('All installments must have an amount and due date');
      return;
    }

    const total = installments.reduce((sum, inst) => sum + parseFloat(inst.amount), 0);
    if (Math.abs(total - invoice.total_amount) > 0.01) {
      setError(`Total scheduled (${formatCurrency(total, invoice.currency)}) must equal invoice total (${formatCurrency(invoice.total_amount, invoice.currency)})`);
      return;
    }

    onSave(installments);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Payment Schedule - Invoice #{invoice.invoice_number}</DialogTitle>
          <p className="text-sm text-gray-600 mt-1">
            Total Amount: {formatCurrency(invoice.total_amount, invoice.currency || 'USD')}
          </p>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Templates */}
          <div className="space-y-2">
            <Label>Quick Templates</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => applyTemplate('split_2')}
                className={template === 'split_2' ? 'border-primary bg-primary/10' : ''}
              >
                2 Payments
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => applyTemplate('split_3')}
                className={template === 'split_3' ? 'border-primary bg-primary/10' : ''}
              >
                3 Payments
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => applyTemplate('split_4')}
                className={template === 'split_4' ? 'border-primary bg-primary/10' : ''}
              >
                4 Payments
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => applyTemplate('weekly_4')}
                className={template === 'weekly_4' ? 'border-primary bg-primary/10' : ''}
              >
                4 Weekly
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => applyTemplate('deposit_balance')}
                className={template === 'deposit_balance' ? 'border-primary bg-primary/10' : ''}
              >
                Deposit + Balance
              </Button>
            </div>
          </div>

          {/* Installments */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label>Installments</Label>
              <Button variant="outline" size="sm" onClick={addInstallment}>
                <Plus className="w-4 h-4 mr-2" />
                Add Installment
              </Button>
            </div>

            {installments.map((installment, index) => (
              <div key={index} className="p-4 border rounded-lg space-y-3 bg-gray-50">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">Installment #{index + 1}</span>
                  {installments.length > 1 && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => removeInstallment(index)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor={`amount-${index}`}>Amount *</Label>
                    <Input
                      id={`amount-${index}`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={installment.amount}
                      onChange={(e) => updateInstallment(index, 'amount', e.target.value)}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`date-${index}`}>Due Date *</Label>
                    <Input
                      id={`date-${index}`}
                      type="date"
                      value={installment.due_date}
                      onChange={(e) => updateInstallment(index, 'due_date', e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`description-${index}`}>Description (Optional)</Label>
                  <Input
                    id={`description-${index}`}
                    value={installment.description}
                    onChange={(e) => updateInstallment(index, 'description', e.target.value)}
                    placeholder="e.g., Initial deposit, Final payment"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Total Scheduled:</span>
              <span className={`font-bold ${Math.abs(remainingAmount) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(totalScheduled, invoice.currency || 'USD')}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-medium">Invoice Total:</span>
              <span className="font-bold">{formatCurrency(invoice.total_amount, invoice.currency || 'USD')}</span>
            </div>
            {Math.abs(remainingAmount) > 0.01 && (
              <div className="flex justify-between text-sm">
                <span className="font-medium">Difference:</span>
                <span className="font-bold text-red-600">
                  {formatCurrency(Math.abs(remainingAmount), invoice.currency || 'USD')} 
                  {remainingAmount > 0 ? ' remaining' : ' over'}
                </span>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={Math.abs(remainingAmount) > 0.01}>
            Create Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

PaymentScheduleDialog.propTypes = {
  invoice: PropTypes.object.isRequired,
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired
};
