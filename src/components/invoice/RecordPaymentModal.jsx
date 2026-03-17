import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import Button from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, Calendar, CreditCard, Save, AlertCircle, Building2, Banknote, Smartphone, CheckCircle } from 'lucide-react';
import { formatCurrency } from '@/utils/currencyCalculations';
import { Payment } from '@/api/entities';

export default function RecordPaymentModal({ invoice, isOpen, onClose, onSave, defaultValues = null }) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [existingPayments, setExistingPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [phase, setPhase] = useState('form'); // 'form' | 'recording' | 'success'

  // Load existing payments from Payment entity
  useEffect(() => {
    const loadPayments = async () => {
      if (invoice?.id && isOpen) {
        setLoading(true);
        try {
          const allPayments = await Payment.list();
          const payments = (allPayments || []).filter(p => p.invoice_id === invoice.id);
          setExistingPayments(payments || []);
        } catch (error) {
          console.error('Error loading payments:', error);
          setExistingPayments([]);
        } finally {
          setLoading(false);
        }
      }
    };
    loadPayments();
  }, [invoice?.id, isOpen]);

  const totalPaid = existingPayments.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
  const invoiceTotal = invoice?.total_amount || 0;
  const remainingBalance = Math.max(0, invoiceTotal - totalPaid);
  const isAmountValid = amount && parseFloat(amount) > 0 && parseFloat(amount) <= remainingBalance;
  const paymentProgress = invoiceTotal > 0 ? (totalPaid / invoiceTotal) * 100 : 0;

  const toDateInputValue = (value) => {
    if (!value) return new Date().toISOString().slice(0, 10);
    const dateValue = new Date(value);
    if (Number.isNaN(dateValue.getTime())) {
      return new Date().toISOString().slice(0, 10);
    }
    return dateValue.toISOString().slice(0, 10);
  };

  useEffect(() => {
    if (!isOpen) return;
    setPhase('form');
    const presetAmount = defaultValues?.amount;
    setAmount(presetAmount ? Number(presetAmount).toFixed(2) : '');
    setDate(toDateInputValue(defaultValues?.payment_date));
    setMethod(defaultValues?.payment_method || '');
    setNotes(defaultValues?.notes || '');
    setError('');
  }, [isOpen, defaultValues?.amount, defaultValues?.payment_date, defaultValues?.payment_method, defaultValues?.notes]);

  // Default amount to full balance once payments are loaded
  useEffect(() => {
    if (!isOpen || loading || remainingBalance <= 0) return;
    setAmount((prev) => (prev === '' ? remainingBalance.toFixed(2) : prev));
  }, [isOpen, loading, remainingBalance]);
  
  // Generate smart payment suggestions
  const suggestedAmounts = [
    { label: 'Full Balance', value: remainingBalance },
    { label: '50% of Balance', value: remainingBalance / 2 },
    { label: '25% of Balance', value: remainingBalance / 4 },
    { label: '10% of Balance', value: remainingBalance / 10 }
  ].filter(suggestion => suggestion.value >= 1 && remainingBalance > 0);

  const handleSave = async () => {
    if (!amount || !date || !method) {
      setError('Amount, date, and payment method are required');
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (parsedAmount <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    if (parsedAmount > remainingBalance) {
      setError(`Amount cannot exceed remaining balance of ${formatCurrency(remainingBalance, invoice.currency || 'USD')}`);
      return;
    }

    setPhase('recording');
    setError('');
    try {
      await onSave({
        amount: parsedAmount,
        payment_date: new Date(date).toISOString(),
        payment_method: method,
        reference_number: notes.split('\n')[0] || '',
        notes
      });
      setPhase('success');
      setTimeout(() => {
        setAmount('');
        setDate(new Date().toISOString().slice(0, 10));
        setMethod('');
        setNotes('');
        onClose();
      }, 1500);
    } catch (err) {
      setError(err?.message || 'Failed to record payment. Please try again.');
      setPhase('form');
    }
  };

  const showForm = phase === 'form';
  const showRecording = phase === 'recording';
  const showSuccess = phase === 'success';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && phase === 'form' && onClose()}>
      <DialogContent className={showSuccess ? 'sm:max-w-md' : ''} aria-describedby={undefined}>
        <AnimatePresence mode="wait">
          {showForm && (
            <motion.div
              key="form"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
        <DialogHeader>
          <DialogTitle>Record Payment for Invoice #{invoice.invoice_number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Payment Progress */}
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-foreground">Invoice Total</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(invoice.total_amount, invoice.currency || 'USD')}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-foreground">Remaining</p>
                <p className="text-2xl font-bold text-orange-600">{formatCurrency(remainingBalance, invoice.currency || 'USD')}</p>
              </div>
            </div>
            
            {totalPaid > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-primary">
                  <span>Already Paid: {formatCurrency(totalPaid, invoice.currency || 'USD')}</span>
                  <span className="font-semibold">{paymentProgress.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-primary/20 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-primary to-[#ff7c00] transition-all duration-500"
                    style={{ width: `${Math.min(paymentProgress, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {remainingBalance <= 0 && (
              <div className="bg-green-50 border border-green-200 rounded-md p-2 text-xs text-green-700">
                This invoice is fully paid. No additional payments can be recorded.
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="amount">Payment Amount *</Label>
              {showSuggestions && suggestedAmounts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowSuggestions(!showSuggestions)}
                  className="text-xs text-primary hover:text-primary"
                >
                  {showSuggestions ? 'Hide' : 'Show'} suggestions
                </button>
              )}
            </div>
            
            {showSuggestions && suggestedAmounts.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mb-2">
                {suggestedAmounts.map((suggestion, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setAmount(suggestion.value.toFixed(2));
                      setError('');
                    }}
                    className="px-3 py-2 text-sm border border-primary/20 rounded-lg hover:bg-primary/10 hover:border-primary transition-colors text-left"
                  >
                    <div className="font-medium text-foreground">{formatCurrency(suggestion.value, invoice.currency || 'USD')}</div>
                    <div className="text-xs text-primary">{suggestion.label}</div>
                  </button>
                ))}
              </div>
            )}
            
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                max={remainingBalance}
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError('');
                }}
                placeholder="0.00"
                className="pl-10 text-lg font-semibold"
              />
            </div>
            {amount && !isAmountValid && (
              <p className="text-xs text-red-600">Amount must be between 0 and {formatCurrency(remainingBalance, invoice.currency || 'USD')}</p>
            )}
            {amount && isAmountValid && parseFloat(amount) < remainingBalance && (
              <p className="text-xs text-orange-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                This is a partial payment. Remaining after: {formatCurrency(remainingBalance - parseFloat(amount), invoice.currency || 'USD')}
              </p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="date">Payment Date *</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="method">Payment Method *</Label>
            <Select value={method} onValueChange={(value) => {
              setMethod(value);
              setError('');
            }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select payment method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    <span>Bank Transfer</span>
                  </div>
                </SelectItem>
                <SelectItem value="cash">
                  <div className="flex items-center gap-2">
                    <Banknote className="w-4 h-4" />
                    <span>Cash</span>
                  </div>
                </SelectItem>
                <SelectItem value="credit_card">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    <span>Credit Card</span>
                  </div>
                </SelectItem>
                <SelectItem value="debit_card">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    <span>Debit Card</span>
                  </div>
                </SelectItem>
                <SelectItem value="mobile_payment">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4" />
                    <span>Mobile Payment</span>
                  </div>
                </SelectItem>
                <SelectItem value="check">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    <span>Check</span>
                  </div>
                </SelectItem>
                <SelectItem value="other">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    <span>Other</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="notes">Reference/Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Transaction ID, check number, reference code"
              className="min-h-20"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={!amount || !date || !method || !isAmountValid || remainingBalance <= 0}>
            <Save className="w-4 h-4 mr-2" />
            Record Payment
          </Button>
        </DialogFooter>
            </motion.div>
          )}
          {showRecording && (
            <motion.div
              key="recording"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-12 gap-4"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                className="w-12 h-12 border-2 border-primary/30 border-t-primary rounded-full"
              />
              <p className="text-muted-foreground font-medium">Recording payment…</p>
            </motion.div>
          )}
          {showSuccess && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="flex flex-col items-center justify-center py-12 gap-4"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25, delay: 0.1 }}
                className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center"
              >
                <CheckCircle className="w-10 h-10 text-white" strokeWidth={2.5} />
              </motion.div>
              <p className="text-lg font-semibold text-foreground">Payment recorded</p>
              <p className="text-sm text-muted-foreground text-center">Dashboard updated</p>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}