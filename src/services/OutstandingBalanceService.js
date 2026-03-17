/**
 * OutstandingBalanceService
 * Comprehensive outstanding balance tracking and analysis
 */

import { parseISO, isBefore, startOfDay } from 'date-fns';

function safeParseISO(value) {
  if (value == null || value === '') return null;
  const str = typeof value === 'string' ? value : (value instanceof Date ? value.toISOString() : null);
  if (!str) return null;
  try {
    return parseISO(str);
  } catch {
    return null;
  }
}

export const OutstandingBalanceService = {
  /**
   * Calculate outstanding balance for a single invoice
   * @param {Object} invoice - Invoice object
   * @param {Array} payments - Array of payment objects for this invoice
   * @returns {Object} Outstanding balance details
   */
  calculateInvoiceBalance(invoice, payments = []) {
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const invoiceTotal = invoice.total_amount || invoice.total || 0;
    const outstanding = Math.max(0, invoiceTotal - totalPaid);
    const paymentCount = payments.length;
    const isPartiallyPaid = outstanding > 0 && totalPaid > 0;
    const isFull = outstanding === 0;

    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      total: invoiceTotal,
      paid: totalPaid,
      outstanding,
      percentPaid: invoiceTotal > 0 ? (totalPaid / invoiceTotal) * 100 : 0,
      percentOutstanding: invoiceTotal > 0 ? (outstanding / invoiceTotal) * 100 : 0,
      paymentCount,
      isPartiallyPaid,
      isFull,
      status: isFull ? 'paid' : outstanding === invoiceTotal ? 'unpaid' : 'partial_paid'
    };
  },

  /**
   * Calculate total outstanding balance across invoices
   * @param {Array} invoices - Array of invoice objects
   * @param {Array} payments - Array of payment objects
   * @returns {Object} Aggregated outstanding balance
   */
  calculateTotalOutstanding(invoices, payments = []) {
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    const invoiceBalances = [];

    invoices.forEach(invoice => {
      const invoicePayments = payments.filter(p => p.invoice_id === invoice.id);
      const balance = this.calculateInvoiceBalance(invoice, invoicePayments);
      
      totalInvoiced += balance.total;
      totalPaid += balance.paid;
      totalOutstanding += balance.outstanding;
      
      if (balance.outstanding > 0) {
        invoiceBalances.push(balance);
      }
    });

    const percentPaid = totalInvoiced > 0 ? (totalPaid / totalInvoiced) * 100 : 0;
    const percentOutstanding = 100 - percentPaid;

    return {
      totalInvoiced,
      totalPaid,
      totalOutstanding,
      percentPaid,
      percentOutstanding,
      invoiceCount: invoices.length,
      unpaidInvoiceCount: invoiceBalances.length,
      invoiceBalances: invoiceBalances.sort((a, b) => b.outstanding - a.outstanding)
    };
  },

  /**
   * Get outstanding balance aging
   * Categorizes outstanding balance by how old the invoice is
   * @param {Array} invoices - Array of invoice objects
   * @param {Array} payments - Array of payment objects
   * @returns {Object} Aging breakdown
   */
  getOutstandingAging(invoices, payments = []) {
    const today = startOfDay(new Date());
    const aging = {
      current: { label: 'Current', daysRange: '0-30', amount: 0, count: 0 },
      thirtyPlus: { label: '30-60 Days', daysRange: '30-60', amount: 0, count: 0 },
      sixtyPlus: { label: '60-90 Days', daysRange: '60-90', amount: 0, count: 0 },
      ninetyPlus: { label: '90+ Days', daysRange: '90+', amount: 0, count: 0 }
    };

    invoices.forEach(invoice => {
      const invoicePayments = payments.filter(p => p.invoice_id === invoice.id);
      const balance = this.calculateInvoiceBalance(invoice, invoicePayments);

      if (balance.outstanding > 0) {
        const dateStr = invoice.created_date || invoice.created_at;
        const invoiceDate = safeParseISO(dateStr) || today;
        const daysSinceCreation = Math.floor((today - invoiceDate) / (1000 * 60 * 60 * 24));

        if (daysSinceCreation <= 30) {
          aging.current.amount += balance.outstanding;
          aging.current.count++;
        } else if (daysSinceCreation <= 60) {
          aging.thirtyPlus.amount += balance.outstanding;
          aging.thirtyPlus.count++;
        } else if (daysSinceCreation <= 90) {
          aging.sixtyPlus.amount += balance.outstanding;
          aging.sixtyPlus.count++;
        } else {
          aging.ninetyPlus.amount += balance.outstanding;
          aging.ninetyPlus.count++;
        }
      }
    });

    return aging;
  },

  /**
   * Get outstanding balance by client
   * @param {Array} invoices - Array of invoice objects
   * @param {Array} payments - Array of payment objects
   * @returns {Array} Outstanding balance per client
   */
  getOutstandingByClient(invoices, payments = []) {
    const clientBalances = {};

    invoices.forEach(invoice => {
      const clientId = invoice.client_id;
      const clientName = invoice.client_name || 'Unknown Client';

      if (!clientBalances[clientId]) {
        clientBalances[clientId] = {
          clientId,
          clientName,
          total: 0,
          paid: 0,
          outstanding: 0,
          invoices: [],
          invoiceCount: 0
        };
      }

      const invoicePayments = payments.filter(p => p.invoice_id === invoice.id);
      const balance = this.calculateInvoiceBalance(invoice, invoicePayments);

      clientBalances[clientId].total += balance.total;
      clientBalances[clientId].paid += balance.paid;
      clientBalances[clientId].outstanding += balance.outstanding;
      clientBalances[clientId].invoiceCount++;

      if (balance.outstanding > 0) {
        clientBalances[clientId].invoices.push(balance);
      }
    });

    return Object.values(clientBalances)
      .map(client => ({
        ...client,
        percentOutstanding: client.total > 0 ? (client.outstanding / client.total) * 100 : 0
      }))
      .sort((a, b) => b.outstanding - a.outstanding);
  },

  /**
   * Get outstanding balance by due date status
   * @param {Array} invoices - Array of invoice objects
   * @param {Array} payments - Array of payment objects
   * @returns {Object} Outstanding categorized by due status
   */
  getOutstandingByDueStatus(invoices, payments = []) {
    const today = startOfDay(new Date());
    const status = {
      notDue: { label: 'Not Due Yet', amount: 0, count: 0 },
      dueToday: { label: 'Due Today', amount: 0, count: 0 },
      overdue: { label: 'Overdue', amount: 0, count: 0 }
    };

    invoices.forEach(invoice => {
      const invoicePayments = payments.filter(p => p.invoice_id === invoice.id);
      const balance = this.calculateInvoiceBalance(invoice, invoicePayments);

      if (balance.outstanding > 0) {
        const dueStr = invoice.due_date || invoice.delivery_date;
        const dueDate = safeParseISO(dueStr);
        if (!dueDate) return;

        if (isBefore(today, dueDate)) {
          status.notDue.amount += balance.outstanding;
          status.notDue.count++;
        } else if (today.getTime() === dueDate.getTime()) {
          status.dueToday.amount += balance.outstanding;
          status.dueToday.count++;
        } else {
          status.overdue.amount += balance.outstanding;
          status.overdue.count++;
        }
      }
    });

    return status;
  },

  /**
   * Get critical outstanding amounts (over 90 days or large amounts)
   * @param {Array} invoices - Array of invoice objects
   * @param {Array} payments - Array of payment objects
   * @param {Number} thresholdDays - Days threshold for aging
   * @param {Number} thresholdAmount - Amount threshold in primary currency
   * @returns {Array} Critical outstanding invoices
   */
  getCriticalOutstanding(invoices, payments = [], thresholdDays = 90, thresholdAmount = 1000) {
    const today = startOfDay(new Date());
    const critical = [];

    invoices.forEach(invoice => {
      const invoicePayments = payments.filter(p => p.invoice_id === invoice.id);
      const balance = this.calculateInvoiceBalance(invoice, invoicePayments);

      if (balance.outstanding > 0) {
        const dateStr = invoice.created_date || invoice.created_at;
        const invoiceDate = safeParseISO(dateStr) || today;
        const daysSinceCreation = Math.floor((today - invoiceDate) / (1000 * 60 * 60 * 24));
        const isCritical = daysSinceCreation >= thresholdDays || balance.outstanding >= thresholdAmount;

        if (isCritical) {
          critical.push({
            ...balance,
            daysOutstanding: daysSinceCreation,
            priority: balance.outstanding >= thresholdAmount * 2 ? 'critical' : 'high'
          });
        }
      }
    });

    return critical.sort((a, b) => b.outstanding - a.outstanding);
  },

  /**
   * Calculate average days to payment
   * @param {Array} invoices - Array of invoice objects
   * @param {Array} payments - Array of payment objects
   * @returns {Number} Average days from invoice creation to payment
   */
  getAverageDaysToPayment(invoices, payments = []) {
    let totalDays = 0;
    let paymentCount = 0;

    invoices.forEach(invoice => {
      const invoicePayments = payments.filter(p => p.invoice_id === invoice.id);
      if (invoicePayments.length > 0) {
        const invDateStr = invoice.created_date || invoice.created_at;
        const invoiceDate = safeParseISO(invDateStr);
        if (!invoiceDate) return;

        invoicePayments.forEach(payment => {
          const paymentDate = safeParseISO(payment.payment_date || payment.paid_at);
          if (!paymentDate) return;
          const days = Math.floor((paymentDate - invoiceDate) / (1000 * 60 * 60 * 24));
          totalDays += days;
          paymentCount++;
        });
      }
    });

    return paymentCount > 0 ? totalDays / paymentCount : 0;
  },

  /**
   * Forecast outstanding balance reduction
   * Based on payment history, predict when balance will be cleared
   * @param {Array} invoices - Array of invoice objects
   * @param {Array} payments - Array of payment objects
   * @returns {Object} Forecast details
   */
  forecastBalanceClearance(invoices, payments = []) {
    const totals = this.calculateTotalOutstanding(invoices, payments);
    const avgPayment = payments.length > 0 
      ? payments.reduce((sum, p) => sum + (p.amount || 0), 0) / payments.length 
      : 0;
    const monthsToPayments = payments.length > 0 
      ? payments.length / 12
      : 1;
    const avgMonthlyPayment = monthsToPayments > 0 
      ? payments.reduce((sum, p) => sum + (p.amount || 0), 0) / monthsToPayments 
      : 0;

    return {
      currentOutstanding: totals.totalOutstanding,
      averagePaymentAmount: avgPayment,
      averageMonthlyPayment: avgMonthlyPayment,
      estimatedMonthsToClear: avgMonthlyPayment > 0 
        ? totals.totalOutstanding / avgMonthlyPayment 
        : 0,
      estimatedClearanceDate: new Date(Date.now() + (avgMonthlyPayment > 0 
        ? (totals.totalOutstanding / avgMonthlyPayment) * 30 * 24 * 60 * 60 * 1000 
        : 0))
    };
  },

  /**
   * Get payment velocity analysis
   * How quickly outstanding balances are being paid
   * @param {Array} invoices - Array of invoice objects
   * @param {Array} payments - Array of payment objects
   * @param {Number} monthsBack - Number of months to analyze
   * @returns {Object} Payment velocity metrics
   */
  getPaymentVelocity(invoices, payments = [], monthsBack = 6) {
    const now = new Date();
    const dateThreshold = new Date(now.getFullYear(), now.getMonth() - monthsBack, now.getDate());
    
    const recentPayments = payments.filter(p => {
      const paymentDate = safeParseISO(p.payment_date || p.paid_at);
      return paymentDate && paymentDate >= dateThreshold;
    });

    const recentInvoices = invoices.filter(inv => {
      const invDate = safeParseISO(inv.created_date || inv.created_at);
      return invDate && invDate >= dateThreshold;
    });

    let totalRecentPaid = 0;
    recentInvoices.forEach(invoice => {
      const invoicePayments = recentPayments.filter(p => p.invoice_id === invoice.id);
      totalRecentPaid += invoicePayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    });

    const totalRecentInvoiced = recentInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
    const velocity = totalRecentInvoiced > 0 ? totalRecentPaid / totalRecentInvoiced : 0;

    return {
      periodMonths: monthsBack,
      recentInvoiceCount: recentInvoices.length,
      recentPaymentCount: recentPayments.length,
      totalRecentInvoiced,
      totalRecentPaid,
      paymentRatio: velocity,
      paymentPercentage: velocity * 100,
      trend: velocity > 0.9 ? 'excellent' : velocity > 0.7 ? 'good' : velocity > 0.5 ? 'fair' : 'poor'
    };
  },

  /**
   * Generate outstanding balance summary
   * @param {Array} invoices - Array of invoice objects
   * @param {Array} payments - Array of payment objects
   * @returns {Object} Comprehensive summary
   */
  generateSummary(invoices, payments = []) {
    const totals = this.calculateTotalOutstanding(invoices, payments);
    const aging = this.getOutstandingAging(invoices, payments);
    const byDueStatus = this.getOutstandingByDueStatus(invoices, payments);
    const byClient = this.getOutstandingByClient(invoices, payments);
    const critical = this.getCriticalOutstanding(invoices, payments);
    const avgDaysToPayment = this.getAverageDaysToPayment(invoices, payments);
    const forecast = this.forecastBalanceClearance(invoices, payments);
    const velocity = this.getPaymentVelocity(invoices, payments);

    return {
      totals,
      aging,
      byDueStatus,
      byClient: byClient.slice(0, 5),
      critical,
      metrics: {
        averageDaysToPayment: avgDaysToPayment,
        paymentVelocity: velocity.paymentPercentage,
        trend: velocity.trend,
        estimatedMonthsToClear: forecast.estimatedMonthsToClear
      },
      forecast
    };
  }
};

export default OutstandingBalanceService;
