import { useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { Invoice, Payment } from '@/api/entities';
import { appendHistory, createHistoryEntry } from '@/utils/invoiceHistory';
import { getAutoStatusUpdate } from '@/utils/invoiceStatus';
import { formatCurrency } from '@/utils/currencyCalculations';

/**
 * Hook for recording payments against an invoice.
 * Handles validation, API calls, status updates, and toast feedback.
 *
 * @param {Object} invoice - The invoice to record payment against
 * @param {Object} options
 * @param {Function} [options.onSuccess] - Called after successful payment with { invoice, payments, isFullyPaid }
 */
export function usePaymentActions(invoice, options = {}) {
  const { onSuccess } = options;
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  const recordPayment = async (paymentData) => {
    if (!invoice?.id) throw new Error('Invoice is required');
    const totalAmount = invoice?.total_amount || 0;
    const remainingBalance = totalAmount - (invoice?.payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);

    if (paymentData.amount > remainingBalance) {
      toast({
        title: 'Amount exceeds balance',
        description: `Cannot exceed remaining balance of ${formatCurrency(remainingBalance, invoice?.currency || 'USD')}`,
        variant: 'destructive',
      });
      throw new Error('Amount exceeds invoice balance.');
    }

    if (paymentData.amount <= 0) {
      toast({
        title: 'Invalid amount',
        description: 'Amount must be greater than 0.',
        variant: 'destructive',
      });
      throw new Error('Amount must be greater than 0.');
    }

    setIsProcessing(true);

    try {
      const newPayment = await Payment.create({
        invoice_id: invoice.id,
        client_id: invoice.client_id,
        amount: paymentData.amount,
        payment_date: paymentData.payment_date,
        payment_method: paymentData.payment_method,
        reference_number: paymentData.reference_number || '',
        notes: paymentData.notes || '',
        created_date: new Date().toISOString(),
      });

      const allPayments = await Payment.list('-payment_date');
      const invoicePayments = (allPayments || []).filter((p) => p.invoice_id === invoice.id);
      const mergedPaymentsMap = new Map();
      [...invoicePayments, newPayment].forEach((p) => {
        if (p?.id) mergedPaymentsMap.set(p.id, p);
      });
      const mergedPayments = Array.from(mergedPaymentsMap.values());

      const autoUpdate = getAutoStatusUpdate({
        ...invoice,
        payments: mergedPayments,
      });
      const nextStatus = autoUpdate?.status || invoice.status;

      const changes = [{ field: 'payment_recorded', from: null, to: newPayment }];
      if (nextStatus !== invoice.status) {
        changes.push({ field: 'status', from: invoice.status, to: nextStatus });
      }

      const historyEntry = createHistoryEntry({
        action: 'payment_recorded',
        summary: `Payment recorded (${formatCurrency(paymentData.amount, invoice.currency || 'USD')})`,
        changes,
        meta: { amount: paymentData.amount, payment_method: paymentData.payment_method },
      });

      const updatePayload = {
        ...(autoUpdate || {}),
        version_history: appendHistory(invoice.version_history, historyEntry),
      };

      await Invoice.update(invoice.id, updatePayload);

      const currency = invoice.currency || 'USD';
      const totalPaidAfter = mergedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const isFullyPaid = totalPaidAfter >= totalAmount;

      toast({
        title: isFullyPaid ? 'Invoice fully paid' : 'Payment recorded',
        description: isFullyPaid
          ? `${formatCurrency(paymentData.amount, currency)} received. Invoice is now fully paid.`
          : `Partial payment of ${formatCurrency(paymentData.amount, currency)} recorded.`,
        duration: 4000,
      });

      const updatedInvoice = { ...invoice, ...updatePayload };
      onSuccess?.({ invoice: updatedInvoice, payments: mergedPayments, isFullyPaid });
    } catch (error) {
      console.error('Failed to record payment:', error);
      toast({
        title: 'Failed to record payment',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsProcessing(false);
    }
  };

  return { recordPayment, isProcessing };
}
