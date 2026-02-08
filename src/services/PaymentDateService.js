import { parseISO, differenceInDays, isBefore } from 'date-fns';

/**
 * Payment Date Tracking Service
 * Handles all payment date calculations, aging analysis, and overdue tracking
 */

export const PaymentDateService = {
    /**
     * Calculate days between due date and payment date
     * Positive = late, Negative = early, 0 = on time
     */
    calculateDaysLate(dueDate, paymentDate) {
        const due = parseISO(dueDate);
        const paid = parseISO(paymentDate);
        return differenceInDays(paid, due);
    },

    /**
     * Check if payment was on time (paid by due date)
     */
    isOnTime(dueDate, paymentDate) {
        const daysLate = this.calculateDaysLate(dueDate, paymentDate);
        return daysLate <= 0;
    },

    /**
     * Calculate days overdue for an invoice
     * Returns 0 if not overdue or null if no due date
     */
    calculateDaysOverdue(dueDate) {
        if (!dueDate) return null;
        const due = parseISO(dueDate);
        const now = new Date();
        
        if (isBefore(due, now)) {
            return differenceInDays(now, due);
        }
        return 0;
    },

    /**
     * Get overdue category (0-30, 31-60, 61-90, 90+)
     */
    getOverdueCategory(daysOverdue) {
        if (daysOverdue === 0 || daysOverdue === null) return 'current';
        if (daysOverdue <= 30) return '30days';
        if (daysOverdue <= 60) return '60days';
        if (daysOverdue <= 90) return '90days';
        return 'over90days';
    },

    /**
     * Calculate payment aging (when payment was made relative to now)
     */
    calculatePaymentAge(paymentDate) {
        const paid = parseISO(paymentDate);
        const now = new Date();
        return differenceInDays(now, paid);
    },

    /**
     * Get payment aging category
     */
    getPaymentAgingCategory(paymentDate) {
        const age = this.calculatePaymentAge(paymentDate);
        if (age <= 30) return 'current';
        if (age <= 60) return '30-60days';
        if (age <= 90) return '60-90days';
        if (age <= 180) return '90-180days';
        return 'over180days';
    },

    /**
     * Calculate average days to payment
     * Compares payment date to invoice due date
     */
    calculateAverageDaysToPayment(payments, invoices) {
        if (!payments || payments.length === 0) return 0;

        const validPayments = payments.filter(payment => {
            if (!payment.payment_date || !payment.invoice_id) return false;
            const invoice = invoices.find(inv => inv.id === payment.invoice_id);
            return invoice && invoice.delivery_date;
        });

        if (validPayments.length === 0) return 0;

        const totalDays = validPayments.reduce((sum, payment) => {
            const invoice = invoices.find(inv => inv.id === payment.invoice_id);
            const daysLate = this.calculateDaysLate(invoice.delivery_date, payment.payment_date);
            return sum + daysLate;
        }, 0);

        return totalDays / validPayments.length;
    },

    /**
     * Calculate on-time payment percentage
     */
    calculateOnTimePercentage(payments, invoices) {
        if (!payments || payments.length === 0) return 100;

        const validPayments = payments.filter(payment => {
            if (!payment.payment_date || !payment.invoice_id) return false;
            const invoice = invoices.find(inv => inv.id === payment.invoice_id);
            return invoice && invoice.delivery_date;
        });

        if (validPayments.length === 0) return 100;

        const onTimeCount = validPayments.filter(payment => {
            const invoice = invoices.find(inv => inv.id === payment.invoice_id);
            return this.isOnTime(invoice.delivery_date, payment.payment_date);
        }).length;

        return (onTimeCount / validPayments.length) * 100;
    },

    /**
     * Get payment timeline for an invoice
     * Returns array of all payments with calculated metrics
     */
    getPaymentTimeline(invoiceId, payments, invoice) {
        return payments
            .filter(p => p.invoice_id === invoiceId)
            .map(payment => ({
                ...payment,
                paymentAge: this.calculatePaymentAge(payment.payment_date),
                agingCategory: this.getPaymentAgingCategory(payment.payment_date),
                daysLate: invoice?.delivery_date 
                    ? this.calculateDaysLate(invoice.delivery_date, payment.payment_date)
                    : null,
                isOnTime: invoice?.delivery_date
                    ? this.isOnTime(invoice.delivery_date, payment.payment_date)
                    : null
            }))
            .sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date));
    },

    /**
     * Calculate payment distribution by method
     */
    getPaymentMethodDistribution(payments) {
        const distribution = {};
        
        payments.forEach(payment => {
            const method = payment.payment_method || 'other';
            if (!distribution[method]) {
                distribution[method] = { count: 0, total: 0 };
            }
            distribution[method].count++;
            distribution[method].total += payment.amount || 0;
        });

        return Object.entries(distribution).map(([method, data]) => ({
            method,
            ...data,
            average: data.total / data.count
        }));
    },

    /**
     * Group payments by date range
     */
    groupPaymentsByDateRange(payments, rangeType = 'month') {
        const grouped = {};
        
        payments.forEach(payment => {
            if (!payment.payment_date) return;
            
            const date = parseISO(payment.payment_date);
            let key;
            
            switch (rangeType) {
                case 'week': {
                    const week = Math.floor(date.getDate() / 7);
                    key = `W${week + 1} ${date.getMonth() + 1}/${date.getFullYear()}`;
                    break;
                }
                case 'day':
                    key = date.toISOString().split('T')[0];
                    break;
                case 'month':
                default:
                    key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    break;
            }
            
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(payment);
        });
        
        return grouped;
    },

    /**
     * Find late payments in a list
     */
    findLatePayments(payments, invoices) {
        return payments
            .filter(payment => {
                if (!payment.payment_date || !payment.invoice_id) return false;
                const invoice = invoices.find(inv => inv.id === payment.invoice_id);
                return invoice && invoice.delivery_date && !this.isOnTime(invoice.delivery_date, payment.payment_date);
            })
            .map(payment => {
                const invoice = invoices.find(inv => inv.id === payment.invoice_id);
                return {
                    ...payment,
                    daysLate: this.calculateDaysLate(invoice.delivery_date, payment.payment_date),
                    invoice
                };
            })
            .sort((a, b) => b.daysLate - a.daysLate);
    },

    /**
     * Calculate cash flow for a date range
     */
    calculateCashFlowForRange(payments, startDate, endDate) {
        const start = parseISO(startDate);
        const end = parseISO(endDate);
        
        return payments
            .filter(payment => {
                if (!payment.payment_date) return false;
                const payDate = parseISO(payment.payment_date);
                return payDate >= start && payDate <= end;
            })
            .reduce((sum, payment) => sum + (payment.amount || 0), 0);
    },

    /**
     * Get payment delay statistics
     */
    getPaymentDelayStats(payments, invoices) {
        const validPayments = payments.filter(payment => {
            if (!payment.payment_date || !payment.invoice_id) return false;
            const invoice = invoices.find(inv => inv.id === payment.invoice_id);
            return invoice && invoice.delivery_date;
        });

        if (validPayments.length === 0) {
            return { average: 0, min: 0, max: 0, median: 0 };
        }

        const delays = validPayments.map(payment => {
            const invoice = invoices.find(inv => inv.id === payment.invoice_id);
            return this.calculateDaysLate(invoice.delivery_date, payment.payment_date);
        }).sort((a, b) => a - b);

        return {
            average: delays.reduce((a, b) => a + b) / delays.length,
            min: delays[0],
            max: delays[delays.length - 1],
            median: delays[Math.floor(delays.length / 2)],
            count: delays.length
        };
    }
};

export default PaymentDateService;
