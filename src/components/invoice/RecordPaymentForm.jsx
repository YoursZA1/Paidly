import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { Payment } from '@/api/entities';
import { getCurrencySymbol } from '@/utils/currencyCalculations';
import { cn } from '@/lib/utils';

const METHOD_MAP = {
  Bank: 'bank_transfer',
  Cash: 'cash',
  Card: 'credit_card',
};

export function RecordPaymentForm({ invoice, onConfirm, onBack, isProcessing }) {
  const [balance, setBalance] = useState(invoice?.total_amount || 0);
  const [amount, setAmount] = useState(String(invoice?.total_amount || 0));
  const [method, setMethod] = useState('Bank');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const currency = invoice?.currency || 'USD';
  const symbol = getCurrencySymbol(currency);

  useEffect(() => {
    const loadPayments = async () => {
      if (!invoice?.id) {
        setLoading(false);
        return;
      }
      try {
        const allPayments = await Payment.list();
        const payments = (allPayments || []).filter((p) => p.invoice_id === invoice.id);
        const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const remaining = Math.max(0, (invoice.total_amount || 0) - totalPaid);
        setBalance(remaining);
        setAmount(String(remaining));
      } catch (err) {
        console.error('Error loading payments:', err);
      } finally {
        setLoading(false);
      }
    };
    loadPayments();
  }, [invoice?.id, invoice?.total_amount]);

  const handleConfirm = () => {
    setError('');
    const num = parseFloat(String(amount).replace(/,/g, ''));
    if (Number.isNaN(num) || num <= 0) {
      setError('Enter a valid amount');
      return;
    }
    if (num > balance) {
      setError(`Amount cannot exceed ${symbol} ${balance.toLocaleString()}`);
      return;
    }
    const apiMethod = METHOD_MAP[method] || 'bank_transfer';
    onConfirm({
      amount: num,
      payment_method: apiMethod,
      payment_date: new Date().toISOString(),
      reference_number: '',
      notes: '',
    });
  };

  const methods = ['Bank', 'Cash', 'Card'];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (balance <= 0) {
    return (
      <div className="px-4 pb-6 pb-safe">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="bg-muted/50 p-4 rounded-2xl border border-border text-center text-muted-foreground text-sm">
          This invoice is fully paid. No additional payments can be recorded.
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.25 }}
      className="space-y-6 pt-2 px-4 pb-6 pb-safe"
    >
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground -ml-1"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <div className="bg-muted/50 p-4 rounded-2xl border border-border">
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Amount Received
        </label>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xl font-bold text-foreground tabular-nums">{symbol}</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError('');
            }}
            inputMode="decimal"
            min="0"
            max={balance}
            step="0.01"
            className="text-2xl font-bold bg-transparent border-none focus:ring-0 w-full tabular-nums text-foreground outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {methods.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            className={cn(
              'py-2.5 px-1 rounded-xl text-xs font-semibold border-2 transition-all touch-manipulation',
              method === m
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border/80 text-muted-foreground hover:border-primary/50'
            )}
          >
            {m}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <button
        type="button"
        disabled={isProcessing}
        onClick={handleConfirm}
        className={cn(
          'w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-lg shadow-primary/20',
          'active:scale-[0.98] transition-all touch-manipulation',
          'disabled:opacity-60 disabled:cursor-not-allowed'
        )}
      >
        {isProcessing ? 'Processing…' : 'Confirm Payment'}
      </button>
    </motion.div>
  );
}
