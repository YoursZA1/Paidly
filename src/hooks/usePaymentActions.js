import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { Invoice, Payment } from '@/api/entities';
import { recordDocumentPayment } from '@/api/documentPaymentApi';
import { invalidateInvoiceDomain } from '@/lib/queryInvalidation';
import { appendHistory, createHistoryEntry } from '@/utils/invoiceHistory';
import { formatCurrency } from '@/utils/currencyCalculations';
import { detectPaymentMilestone } from '@/services/milestoneService';

/**
 * Hook for recording money received offline (cash, EFT, card machine, cheque) against an invoice.
 *
 * The Payment Engine records it (POST /api/payment-intents/document-record): a cash payment_intent is
 * approved and settled server-side, which writes the payment and derives the invoice status. The
 * browser never writes payments or a paid status — the database refuses both.
 *
 * @param {Object} invoice - The invoice to record payment against
 * @param {Object} options
 * @param {Function} [options.onSuccess] - Called after successful payment with { invoice, payments, isFullyPaid, milestone }
 * @returns recordPayment(paymentData, { showToast = true }) resolves with
 *   { amount, amountDue, isFullyPaid, invoiceStatus, currency, milestone }.
 *   Pass showToast: false when the caller renders its own Done State (RecordPaymentModal).
 */
export function usePaymentActions(invoice, options = {}) {
  const { onSuccess } = options;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);

  const recordPayment = async (paymentData, { showToast = true } = {}) => {
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
      const result = await recordDocumentPayment({
        invoiceId: invoice.id,
        amount: paymentData.amount,
        paymentMethod: paymentData.payment_method,
        paidAt: paymentData.payment_date || null,
        reference: paymentData.reference_number || null,
        notes: paymentData.notes || null,
        idempotencyKey: paymentData.idempotency_key || globalThis.crypto?.randomUUID?.() || null,
      });

      const allPayments = await Payment.list('-payment_date');
      const invoicePayments = (allPayments || []).filter((p) => p.invoice_id === invoice.id);
      const nextStatus = result?.invoice_status || invoice.status;

      const changes = [{ field: 'payment_recorded', from: null, to: result?.payment || null }];
      if (nextStatus !== invoice.status) {
        changes.push({ field: 'status', from: invoice.status, to: nextStatus });
      }
      const historyEntry = createHistoryEntry({
        action: 'payment_recorded',
        summary: `Payment recorded (${formatCurrency(paymentData.amount, invoice.currency || 'USD')})`,
        changes,
        meta: { amount: paymentData.amount, payment_method: paymentData.payment_method },
      });
      const version_history = appendHistory(invoice.version_history, historyEntry);
      try {
        // History only — the status was set by the settlement.
        await Invoice.update(invoice.id, { version_history });
      } catch (historyErr) {
        console.warn('Payment recorded; history entry not saved:', historyErr);
      }

      const currency = invoice.currency || 'USD';
      const amountDue = Number(result?.amount_due ?? Math.max(0, remainingBalance - paymentData.amount));
      const isFullyPaid = amountDue <= 0;
      // Celebrate only milestones (first payment ever, collection thresholds) — never every payment.
      const milestone = await detectPaymentMilestone({ amount: paymentData.amount });

      if (showToast) {
        toast({
          title: isFullyPaid ? 'Invoice fully paid' : 'Payment recorded',
          description: isFullyPaid
            ? `${formatCurrency(paymentData.amount, currency)} received. Invoice is now fully paid.`
            : `${formatCurrency(paymentData.amount, currency)} received. ${formatCurrency(amountDue, currency)} still outstanding.`,
          duration: 4000,
        });
      }

      const updatedInvoice = { ...invoice, status: nextStatus, version_history };
      invalidateInvoiceDomain(queryClient, { invoiceId: invoice.id });
      onSuccess?.({ invoice: updatedInvoice, payments: invoicePayments, isFullyPaid, milestone });
      return {
        amount: paymentData.amount,
        amountDue,
        isFullyPaid,
        invoiceStatus: nextStatus,
        currency,
        milestone,
      };
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
