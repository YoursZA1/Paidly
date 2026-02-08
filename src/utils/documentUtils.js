/**
 * Document Utilities
 * Helper functions for document tracking and management
 */

import DocumentActivityService from '@/services/DocumentActivityService';

// Document types
export const DOCUMENT_TYPES = {
  INVOICE: 'invoice',
  QUOTE: 'quote',
  RECEIPT: 'receipt',
  ESTIMATE: 'estimate',
  PAYSLIP: 'payslip'
};

// Document statuses
export const DOCUMENT_STATUSES = {
  DRAFT: 'draft',
  SENT: 'sent',
  VIEWED: 'viewed',
  PAID: 'paid',
  PARTIAL_PAID: 'partial_paid',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled'
};

// Plan to document type limits
export const PLAN_DOCUMENT_LIMITS = {
  'free': {
    invoices: 10,
    quotes: 5,
    receipts: 0,
    total: 15
  },
  'starter': {
    invoices: 50,
    quotes: 25,
    receipts: 25,
    total: 100
  },
  'professional': {
    invoices: 500,
    quotes: 250,
    receipts: 250,
    total: 1000
  },
  'enterprise': {
    invoices: null, // Unlimited
    quotes: null,
    receipts: null,
    total: null
  }
};

/**
 * Record an invoice creation
 */
export function recordInvoiceCreation(invoiceData, userPlan) {
  return DocumentActivityService.recordDocumentCreation({
    type: DOCUMENT_TYPES.INVOICE,
    documentId: invoiceData.id,
    documentNumber: invoiceData.invoice_number,
    clientId: invoiceData.client_id,
    clientName: invoiceData.clientName,
    userId: invoiceData.userId,
    userPlan: userPlan,
    amount: invoiceData.total_amount || 0,
    status: invoiceData.status || DOCUMENT_STATUSES.DRAFT,
    metadata: {
      items: invoiceData.items?.length || 0,
      tax: invoiceData.tax_amount || 0
    }
  });
}

/**
 * Record a quote creation
 */
export function recordQuoteCreation(quoteData, userPlan) {
  return DocumentActivityService.recordDocumentCreation({
    type: DOCUMENT_TYPES.QUOTE,
    documentId: quoteData.id,
    documentNumber: quoteData.quote_number,
    clientId: quoteData.client_id,
    clientName: quoteData.clientName,
    userId: quoteData.userId,
    userPlan: userPlan,
    amount: quoteData.total_amount || 0,
    status: quoteData.status || DOCUMENT_STATUSES.DRAFT,
    metadata: {
      items: quoteData.items?.length || 0,
      validUntil: quoteData.valid_until
    }
  });
}

/**
 * Record a receipt creation
 */
export function recordReceiptCreation(receiptData, userPlan) {
  return DocumentActivityService.recordDocumentCreation({
    type: DOCUMENT_TYPES.RECEIPT,
    documentId: receiptData.id,
    documentNumber: receiptData.receipt_number,
    clientId: receiptData.client_id,
    clientName: receiptData.clientName,
    userId: receiptData.userId,
    userPlan: userPlan,
    amount: receiptData.amount || 0,
    status: DOCUMENT_STATUSES.SENT,
    metadata: {
      paymentMethod: receiptData.payment_method,
      invoiceId: receiptData.invoice_id
    }
  });
}

/**
 * Check if plan limit is reached
 */
export function isPlanLimitReached(userPlan, documentType) {
  const limits = PLAN_DOCUMENT_LIMITS[userPlan] || PLAN_DOCUMENT_LIMITS.free;
  
  if (limits[documentType] === null) {
    return false; // Unlimited
  }

  const currentDocs = getCurrentDocumentCount(userPlan, documentType);
  return currentDocs >= limits[documentType];
}

/**
 * Get current document count for plan and type
 */
export function getCurrentDocumentCount(userPlan, documentType) {
  const perPlan = DocumentActivityService.getDocumentsPerPlan();
  const planDocs = perPlan.find(p => p.plan === userPlan);
  
  if (!planDocs) return 0;
  
  switch (documentType) {
    case DOCUMENT_TYPES.INVOICE:
      return planDocs.invoices || 0;
    case DOCUMENT_TYPES.QUOTE:
      return planDocs.quotes || 0;
    case DOCUMENT_TYPES.RECEIPT:
      return planDocs.receipts || 0;
    default:
      return 0;
  }
}

/**
 * Get remaining documents in limit
 */
export function getRemainingDocuments(userPlan, documentType) {
  const limits = PLAN_DOCUMENT_LIMITS[userPlan] || PLAN_DOCUMENT_LIMITS.free;
  
  if (limits[documentType] === null) {
    return Infinity; // Unlimited
  }

  const current = getCurrentDocumentCount(userPlan, documentType);
  return Math.max(0, limits[documentType] - current);
}

/**
 * Get plan limit percentage used
 */
export function getPlanUsagePercentage(userPlan, documentType) {
  const limits = PLAN_DOCUMENT_LIMITS[userPlan] || PLAN_DOCUMENT_LIMITS.free;
  
  if (limits[documentType] === null) {
    return 0; // Unlimited shows 0%
  }

  const current = getCurrentDocumentCount(userPlan, documentType);
  return Math.round((current / limits[documentType]) * 100);
}

/**
 * Get document status badge color
 */
export function getStatusColor(status) {
  const colors = {
    [DOCUMENT_STATUSES.DRAFT]: 'bg-gray-100 text-gray-800',
    [DOCUMENT_STATUSES.SENT]: 'bg-blue-100 text-blue-800',
    [DOCUMENT_STATUSES.VIEWED]: 'bg-purple-100 text-purple-800',
    [DOCUMENT_STATUSES.PAID]: 'bg-green-100 text-green-800',
    [DOCUMENT_STATUSES.PARTIAL_PAID]: 'bg-amber-100 text-amber-800',
    [DOCUMENT_STATUSES.OVERDUE]: 'bg-red-100 text-red-800',
    [DOCUMENT_STATUSES.CANCELLED]: 'bg-slate-100 text-slate-800'
  };
  return colors[status] || colors.draft;
}

/**
 * Get document type label
 */
export function getDocumentTypeLabel(type) {
  const labels = {
    [DOCUMENT_TYPES.INVOICE]: 'Invoice',
    [DOCUMENT_TYPES.QUOTE]: 'Quote',
    [DOCUMENT_TYPES.RECEIPT]: 'Receipt',
    [DOCUMENT_TYPES.ESTIMATE]: 'Estimate',
    [DOCUMENT_TYPES.PAYSLIP]: 'Payslip'
  };
  return labels[type] || type;
}

/**
 * Get document type icon color
 */
export function getDocumentTypeColor(type) {
  const colors = {
    [DOCUMENT_TYPES.INVOICE]: '#3b82f6', // Blue
    [DOCUMENT_TYPES.QUOTE]: '#10b981', // Green
    [DOCUMENT_TYPES.RECEIPT]: '#f59e0b', // Amber
    [DOCUMENT_TYPES.ESTIMATE]: '#8b5cf6', // Purple
    [DOCUMENT_TYPES.PAYSLIP]: '#06b6d4' // Cyan
  };
  return colors[type] || '#6366f1';
}

/**
 * Format currency
 */
export function formatCurrency(amount, currency = 'ZAR') {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: currency
  }).format(amount);
}

/**
 * Check plan upgrade needs
 */
export function checkUpgradeNeeds(userPlan, documentType) {
  const isPlanLimited = isPlanLimitReached(userPlan, documentType);
  
  if (!isPlanLimited) {
    return null;
  }

  // Find next plan that has higher limit
  const planOrder = ['free', 'starter', 'professional', 'enterprise'];
  const currentIndex = planOrder.indexOf(userPlan);

  for (let i = currentIndex + 1; i < planOrder.length; i++) {
    const nextPlan = planOrder[i];
    const nextLimit = PLAN_DOCUMENT_LIMITS[nextPlan][documentType];
    if (nextLimit === null || nextLimit > getCurrentDocumentCount(userPlan, documentType)) {
      return {
        recommend: nextPlan,
        reason: `Current plan limit reached for ${documentType}s`,
        currentLimit: PLAN_DOCUMENT_LIMITS[userPlan][documentType],
        nextLimit: nextLimit
      };
    }
  }

  return null;
}

/**
 * Get document statistics summary
 */
export function getDocumentsSummary() {
  const stats = DocumentActivityService.getSummaryStats();
  return {
    total: stats.totalDocuments,
    invoices: stats.totalInvoices,
    quotes: stats.totalQuotes,
    receipts: stats.totalReceipts,
    avgValue: stats.averageDocumentValue,
    revenue: stats.totalAmount
  };
}

/**
 * Get today's document count
 */
export function getTodaysDocumentCount() {
  const log = DocumentActivityService.getDocumentLog();
  const today = new Date().toISOString().split('T')[0];
  return log.filter(doc => doc.createdAt.startsWith(today)).length;
}

/**
 * Get this month's document count
 */
export function getThisMonthsDocumentCount() {
  const log = DocumentActivityService.getDocumentLog();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  return log.filter(doc => doc.createdAt >= monthStart).length;
}

/**
 * Compare document counts month over month
 */
export function getMonthOverMonthGrowth() {
  const log = DocumentActivityService.getDocumentLog();
  const now = new Date();
  
  // Current month
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const thisMonth = log.filter(doc => doc.createdAt >= thisMonthStart).length;

  // Previous month
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
  const prevMonth = log.filter(doc => doc.createdAt >= prevMonthStart && doc.createdAt <= prevMonthEnd).length;

  const growth = prevMonth > 0 ? Math.round(((thisMonth - prevMonth) / prevMonth) * 100) : 0;
  
  return {
    thisMonth,
    prevMonth,
    growth,
    trend: growth > 0 ? 'up' : growth < 0 ? 'down' : 'stable'
  };
}

export default {
  DOCUMENT_TYPES,
  DOCUMENT_STATUSES,
  PLAN_DOCUMENT_LIMITS,
  recordInvoiceCreation,
  recordQuoteCreation,
  recordReceiptCreation,
  isPlanLimitReached,
  getCurrentDocumentCount,
  getRemainingDocuments,
  getPlanUsagePercentage,
  getStatusColor,
  getDocumentTypeLabel,
  getDocumentTypeColor,
  formatCurrency,
  checkUpgradeNeeds,
  getDocumentsSummary,
  getTodaysDocumentCount,
  getThisMonthsDocumentCount,
  getMonthOverMonthGrowth
};
