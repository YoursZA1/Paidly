/**
 * Document Activity Service
 * Tracks document creation, usage, and analytics
 * Updated to pull real-time data from user databases
 */

import { getAllUsersInvoices, getAllUsersQuotes, getAllUsersClients } from '@/utils/adminDataAggregator';

const DOCUMENT_LOG_KEY = 'breakapi_document_log';

export class DocumentActivityService {
  /**
   * Get all invoices from all users in real-time
   */
  static getAllInvoices() {
    return getAllUsersInvoices();
  }

  /**
   * Get all quotes from all users in real-time
   */
  static getAllQuotes() {
    return getAllUsersQuotes();
  }

  /**
   * Get all clients from all users
   */
  static getAllClients() {
    return getAllUsersClients();
  }
  /**
   * Record a document creation
   */
  static recordDocumentCreation(documentData) {
    const record = {
      id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: documentData.type, // 'invoice', 'quote', 'receipt', 'estimate', 'payslip'
      documentId: documentData.documentId,
      documentNumber: documentData.documentNumber,
      clientId: documentData.clientId,
      clientName: documentData.clientName,
      userId: documentData.userId,
      userPlan: documentData.userPlan || 'free',
      amount: documentData.amount || 0,
      status: documentData.status || 'draft', // draft, sent, paid, etc
      createdAt: new Date().toISOString(),
      metadata: documentData.metadata || {}
    };

    try {
      const log = this.getDocumentLog();
      log.unshift(record);
      localStorage.setItem(DOCUMENT_LOG_KEY, JSON.stringify(log));
      return record;
    } catch (error) {
      console.error('Error recording document creation:', error);
      return null;
    }
  }

  /**
   * Get all document records
   */
  static getDocumentLog() {
    try {
      const stored = localStorage.getItem(DOCUMENT_LOG_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading document log:', error);
      return [];
    }
  }

  /**
   * Get total documents created
   */
  static getTotalDocuments() {
    const log = this.getDocumentLog();
    return log.length;
  }

  /**
   * Get documents by type from real data
   */
  static getDocumentsByType() {
    const invoices = this.getAllInvoices();
    const quotes = this.getAllQuotes();

    const counts = {
      invoices: invoices.length,
      quotes: quotes.length,
      receipts: 0,
      estimates: 0,
      payslips: 0,
      other: 0
    };

    return counts;
  }

  /**
   * Get summary statistics from real data
   */
  static getSummaryStats() {
    const invoices = this.getAllInvoices();
    const quotes = this.getAllQuotes();
    const clients = this.getAllClients();

    // Calculate from real invoices
    let totalAmount = 0;
    let draftCount = 0;
    let sentCount = 0;
    let paidCount = 0;
    let viewedCount = 0;
    let overdueCount = 0;

    invoices.forEach(invoice => {
      const amount = parseFloat(invoice.total) || parseFloat(invoice.amount) || 0;
      totalAmount += amount;
      
      const status = (invoice.status || invoice.payment_status || '').toLowerCase();
      if (status === 'draft') draftCount++;
      else if (status === 'sent') sentCount++;
      else if (status === 'paid') paidCount++;
      else if (status === 'viewed') viewedCount++;
      else if (status === 'overdue') overdueCount++;
    });

    const totalDocuments = invoices.length + quotes.length;

    return {
      totalDocuments,
      totalInvoices: invoices.length,
      totalQuotes: quotes.length,
      totalReceipts: 0, // Could be added later
      totalClients: clients.length,
      totalAmount: totalAmount,
      draftCount: draftCount,
      sentCount: sentCount,
      paidCount: paidCount,
      viewedCount: viewedCount,
      overdueCount: overdueCount,
      averageDocumentValue: invoices.length > 0 ? Math.round(totalAmount / invoices.length) : 0
    };
  }

  /**
   * Get documents per plan from real data
   */
  static getDocumentsPerPlan() {
    const invoices = this.getAllInvoices();
    const quotes = this.getAllQuotes();
    
    const planStats = {};

    // Process invoices
    invoices.forEach(invoice => {
      const userPlan = invoice.user_plan || 'free';
      
      if (!planStats[userPlan]) {
        planStats[userPlan] = {
          plan: userPlan,
          totalDocuments: 0,
          invoices: 0,
          quotes: 0,
          receipts: 0,
          totalAmount: 0,
          avgValue: 0
        };
      }

      planStats[userPlan].totalDocuments++;
      planStats[userPlan].invoices++;
      
      const amount = parseFloat(invoice.total) || parseFloat(invoice.amount) || 0;
      planStats[userPlan].totalAmount += amount;
    });

    // Process quotes
    quotes.forEach(quote => {
      const userPlan = quote.user_plan || 'free';
      
      if (!planStats[userPlan]) {
        planStats[userPlan] = {
          plan: userPlan,
          totalDocuments: 0,
          invoices: 0,
          quotes: 0,
          receipts: 0,
          totalAmount: 0,
          avgValue: 0
        };
      }

      planStats[userPlan].totalDocuments++;
      planStats[userPlan].quotes++;
      
      const amount = parseFloat(quote.total) || parseFloat(quote.amount) || 0;
      planStats[userPlan].totalAmount += amount;
    });

    // Calculate averages
    Object.keys(planStats).forEach(plan => {
      if (planStats[plan].totalDocuments > 0) {
        planStats[plan].avgValue = Math.round(planStats[plan].totalAmount / planStats[plan].totalDocuments);
      }
    });

    return Object.values(planStats);
  }

  /**
   * Get documents created in time period
   */
  static getDocumentsInPeriod(days = 30) {
    const log = this.getDocumentLog();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return log.filter(doc => new Date(doc.createdAt) >= cutoffDate);
  }

  /**
   * Get daily document creation trend from real data
   */
  static getDailyTrend(days = 30) {
    const invoices = this.getAllInvoices();
    const quotes = this.getAllQuotes();
    const trend = {};

    // Initialize trend object for last N days
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      trend[dateStr] = {
        date: dateStr,
        invoices: 0,
        quotes: 0,
        receipts: 0,
        total: 0,
        totalAmount: 0
      };
    }

    // Count invoices by date
    invoices.forEach(invoice => {
      const createdAt = invoice.created_at || invoice.createdAt || invoice.date || '';
      const dateStr = createdAt.split('T')[0];
      
      if (trend[dateStr]) {
        trend[dateStr].invoices++;
        trend[dateStr].total++;
        
        const amount = parseFloat(invoice.total) || parseFloat(invoice.amount) || 0;
        trend[dateStr].totalAmount += amount;
      }
    });

    // Count quotes by date
    quotes.forEach(quote => {
      const createdAt = quote.created_at || quote.createdAt || quote.date || '';
      const dateStr = createdAt.split('T')[0];
      
      if (trend[dateStr]) {
        trend[dateStr].quotes++;
        trend[dateStr].total++;
        
        const amount = parseFloat(quote.total) || parseFloat(quote.amount) || 0;
        trend[dateStr].totalAmount += amount;
      }
    });

    return Object.values(trend);
  }

  /**
   * Get document status distribution from real invoices
   */
  static getStatusDistribution() {
    const invoices = this.getAllInvoices();
    const distribution = {
      draft: 0,
      sent: 0,
      viewed: 0,
      paid: 0,
      partial_paid: 0,
      overdue: 0,
      cancelled: 0,
      other: 0
    };

    invoices.forEach(invoice => {
      const status = (invoice.status || invoice.payment_status || 'other').toLowerCase();
      
      if (status in distribution) {
        distribution[status]++;
      } else if (status === 'partially_paid' || status === 'partial') {
        distribution.partial_paid++;
      } else {
        distribution.other++;
      }
    });

    return distribution;
  }

  /**
   * Get top clients by document count from real data
   */
  static getTopClients(limit = 10) {
    const invoices = this.getAllInvoices();
    const quotes = this.getAllQuotes();
    const clientMap = {};

    // Process invoices
    invoices.forEach(invoice => {
      const clientName = invoice.client_name || invoice.clientName || invoice.customer_name || 'Unknown Client';
      
      if (!clientMap[clientName]) {
        clientMap[clientName] = {
          name: clientName,
          count: 0,
          totalAmount: 0,
          documents: []
        };
      }

      clientMap[clientName].count++;
      const amount = parseFloat(invoice.total) || parseFloat(invoice.amount) || 0;
      clientMap[clientName].totalAmount += amount;
      clientMap[clientName].documents.push('invoice');
    });

    // Process quotes
    quotes.forEach(quote => {
      const clientName = quote.client_name || quote.clientName || quote.customer_name || 'Unknown Client';
      
      if (!clientMap[clientName]) {
        clientMap[clientName] = {
          name: clientName,
          count: 0,
          totalAmount: 0,
          documents: []
        };
      }

      clientMap[clientName].count++;
      const amount = parseFloat(quote.total) || parseFloat(quote.amount) || 0;
      clientMap[clientName].totalAmount += amount;
      clientMap[clientName].documents.push('quote');
    });

    return Object.values(clientMap)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, limit);
  }

  /**
   * Get document trends by type
   */
  static getDocumentTypesTrend(days = 30) {
    const trend = this.getDailyTrend(days);
    
    const summary = {
      invoices: 0,
      quotes: 0,
      receipts: 0,
      total: 0
    };

    trend.forEach(day => {
      summary.invoices += day.invoices;
      summary.quotes += day.quotes;
      summary.receipts += day.receipts;
      summary.total += day.total;
    });

    return {
      trend,
      summary,
      averagePerDay: summary.total > 0 ? Math.round(summary.total / days) : 0
    };
  }

  /**
   * Get document creation patterns from real data
   */
  static getCreationPatterns() {
    const invoices = this.getAllInvoices();
    const quotes = this.getAllQuotes();
    const patterns = {
      byDayOfWeek: {},
      byHour: {},
      byType: {}
    };

    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    daysOfWeek.forEach(day => {
      patterns.byDayOfWeek[day] = 0;
    });

    for (let i = 0; i < 24; i++) {
      patterns.byHour[i] = 0;
    }

    // Initialize type counters
    patterns.byType.invoice = 0;
    patterns.byType.quote = 0;

    // Process invoices
    invoices.forEach(invoice => {
      const dateStr = invoice.created_at || invoice.createdAt || invoice.date || '';
      if (dateStr) {
        const date = new Date(dateStr);
        const dayOfWeek = daysOfWeek[date.getDay()];
        const hour = date.getHours();

        patterns.byDayOfWeek[dayOfWeek]++;
        patterns.byHour[hour]++;
        patterns.byType.invoice++;
      }
    });

    // Process quotes
    quotes.forEach(quote => {
      const dateStr = quote.created_at || quote.createdAt || quote.date || '';
      if (dateStr) {
        const date = new Date(dateStr);
        const dayOfWeek = daysOfWeek[date.getDay()];
        const hour = date.getHours();

        patterns.byDayOfWeek[dayOfWeek]++;
        patterns.byHour[hour]++;
        patterns.byType.quote++;
      }
    });

    return patterns;
  }

  /**
   * Get document revenue metrics
   */
  static getRevenueMetrics() {
      const invoices = this.getAllInvoices();
      const quotes = this.getAllQuotes();

      let totalRevenue = 0;
      let invoiceRevenue = 0;
      let quotedValue = 0;
      let collectedRevenue = 0;
      let pendingRevenue = 0;

      // Process invoices
      invoices.forEach(invoice => {
        const amount = parseFloat(invoice.total) || parseFloat(invoice.amount) || 0;
        const status = (invoice.status || invoice.payment_status || '').toLowerCase();
      
        invoiceRevenue += amount;
      
        if (status === 'paid') {
          collectedRevenue += amount;
          totalRevenue += amount;
        } else if (status === 'sent' || status === 'viewed') {
          pendingRevenue += amount;
        }
      });

      // Process quotes
      quotes.forEach(quote => {
        const amount = parseFloat(quote.total) || parseFloat(quote.amount) || 0;
        quotedValue += amount;
      });

      return {
        totalRevenue,
        invoiceRevenue,
        quotedValue,
        collectedRevenue,
        pendingRevenue,
        quoteToPaidConversion: quotedValue > 0 ? Math.round((collectedRevenue / quotedValue) * 100) : 0
      };
  }

  /**
   * Clear document log (for testing/reset)
   */
  static clearLog() {
    localStorage.removeItem(DOCUMENT_LOG_KEY);
  }

  /**
   * Export document activity as JSON
   */
  static exportActivity() {
      const invoices = this.getAllInvoices();
      const quotes = this.getAllQuotes();
    const stats = this.getSummaryStats();
    const perPlan = this.getDocumentsPerPlan();
    const revenue = this.getRevenueMetrics();

    return {
      exportDate: new Date().toISOString(),
      summary: stats,
      revenue: revenue,
      perPlan: perPlan,
        invoices: invoices,
        quotes: quotes
    };
  }
}

export default DocumentActivityService;
