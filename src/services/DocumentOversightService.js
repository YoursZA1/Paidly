/**
 * Document Oversight Service
 * Provides operational insight into platform document usage and user activity
 */


const DOCUMENT_LOG_KEY = 'breakapi_document_creation_log';

class DocumentOversightService {
  /**
   * Record document creation
   */
  static recordDocumentCreation(userId, accountId, docType, docDetails = {}) {
    const documents = this.loadDocumentLog();
    
    documents.push({
      id: Date.now().toString(),
      userId,
      accountId,
      type: docType, // invoice, quote, receipt, estimate
      status: docDetails.status || 'draft',
      amount: docDetails.amount || 0,
      clientName: docDetails.clientName || 'Unknown',
      createdAt: new Date().toISOString(),
      docNumber: docDetails.docNumber || ''
    });

    localStorage.setItem(DOCUMENT_LOG_KEY, JSON.stringify(documents));
    return true;
  }

  /**
   * Get documents created per user
   */
  static getDocumentsPerUser() {
    const documents = this.loadDocumentLog();
    const usersData = this.loadUserData();
    const usersMap = {};

    documents.forEach(doc => {
      if (!usersMap[doc.userId]) {
        const user = usersData.find(u => u.id === doc.userId) || { 
          id: doc.userId, 
          name: `User ${doc.userId}`,
          email: `user${doc.userId}@example.com`,
          plan: 'professional'
        };
        usersMap[doc.userId] = {
          userId: doc.userId,
          userName: user.name,
          userEmail: user.email,
          plan: user.plan,
          invoices: 0,
          quotes: 0,
          receipts: 0,
          estimates: 0,
          total: 0,
          totalAmount: 0,
          lastDocumentDate: null
        };
      }

      if (doc.type === 'invoice') usersMap[doc.userId].invoices++;
      else if (doc.type === 'quote') usersMap[doc.userId].quotes++;
      else if (doc.type === 'receipt') usersMap[doc.userId].receipts++;
      else if (doc.type === 'estimate') usersMap[doc.userId].estimates++;

      usersMap[doc.userId].total++;
      usersMap[doc.userId].totalAmount += doc.amount;
      usersMap[doc.userId].lastDocumentDate = doc.createdAt;
    });

    return Object.values(usersMap).sort((a, b) => b.total - a.total);
  }

  /**
   * Get documents created per account
   */
  static getDocumentsPerAccount() {
    const documents = this.loadDocumentLog();
    const accountsData = this.loadAccountsData();
    const accountsMap = {};

    documents.forEach(doc => {
      if (!accountsMap[doc.accountId]) {
        const account = accountsData.find(a => a.id === doc.accountId) || {
          id: doc.accountId,
          name: `Account ${doc.accountId}`,
          email: `account${doc.accountId}@example.com`,
          plan: 'professional'
        };
        accountsMap[doc.accountId] = {
          accountId: doc.accountId,
          accountName: account.name,
          accountEmail: account.email,
          plan: account.plan,
          invoices: 0,
          quotes: 0,
          receipts: 0,
          estimates: 0,
          total: 0,
          totalAmount: 0,
          lastDocumentDate: null,
          uniqueUsers: new Set()
        };
      }

      accountsMap[doc.accountId].uniqueUsers.add(doc.userId);

      if (doc.type === 'invoice') accountsMap[doc.accountId].invoices++;
      else if (doc.type === 'quote') accountsMap[doc.accountId].quotes++;
      else if (doc.type === 'receipt') accountsMap[doc.accountId].receipts++;
      else if (doc.type === 'estimate') accountsMap[doc.accountId].estimates++;

      accountsMap[doc.accountId].total++;
      accountsMap[doc.accountId].totalAmount += doc.amount;
      accountsMap[doc.accountId].lastDocumentDate = doc.createdAt;
    });

    return Object.values(accountsMap).map(acc => ({
      ...acc,
      uniqueUsers: acc.uniqueUsers.size
    })).sort((a, b) => b.total - a.total);
  }

  /**
   * Get monthly document trends
   */
  static getMonthlyTrends() {
    const documents = this.loadDocumentLog();
    const trends = {};

    // Initialize last 12 months
    for (let i = 11; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthKey = date.toISOString().substring(0, 7);
      trends[monthKey] = {
        month: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        invoices: 0,
        quotes: 0,
        receipts: 0,
        estimates: 0,
        total: 0,
        revenue: 0
      };
    }

    documents.forEach(doc => {
      const monthKey = doc.createdAt.substring(0, 7);
      if (trends[monthKey]) {
        if (doc.type === 'invoice') trends[monthKey].invoices++;
        else if (doc.type === 'quote') trends[monthKey].quotes++;
        else if (doc.type === 'receipt') trends[monthKey].receipts++;
        else if (doc.type === 'estimate') trends[monthKey].estimates++;
        
        trends[monthKey].total++;
        trends[monthKey].revenue += doc.amount;
      }
    });

    return Object.values(trends);
  }

  /**
   * Get yearly document trends
   */
  static getYearlyTrends() {
    const documents = this.loadDocumentLog();
    const trends = {};

    // Initialize last 3 years
    for (let i = 2; i >= 0; i--) {
      const year = new Date().getFullYear() - i;
      trends[year] = {
        year,
        invoices: 0,
        quotes: 0,
        receipts: 0,
        estimates: 0,
        total: 0,
        revenue: 0
      };
    }

    documents.forEach(doc => {
      const year = parseInt(doc.createdAt.substring(0, 4));
      if (trends[year]) {
        if (doc.type === 'invoice') trends[year].invoices++;
        else if (doc.type === 'quote') trends[year].quotes++;
        else if (doc.type === 'receipt') trends[year].receipts++;
        else if (doc.type === 'estimate') trends[year].estimates++;
        
        trends[year].total++;
        trends[year].revenue += doc.amount;
      }
    });

    return Object.values(trends);
  }

  /**
   * Identify power users (top creators)
   */
  static getPowerUsers(limit = 10) {
    const usersPerDoc = this.getDocumentsPerUser();
    return usersPerDoc.slice(0, limit);
  }

  /**
   * Identify inactive users
   */
  static getInactiveUsers(daysInactive = 30) {
    const usersData = this.loadUserData();
    const documents = this.loadDocumentLog();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

    const userCreationDates = {};
    documents.forEach(doc => {
      if (!userCreationDates[doc.userId] || new Date(doc.createdAt) > new Date(userCreationDates[doc.userId])) {
        userCreationDates[doc.userId] = doc.createdAt;
      }
    });

    return usersData.filter(user => {
      const lastActivity = userCreationDates[user.id];
      return !lastActivity || new Date(lastActivity) < cutoffDate;
    });
  }

  /**
   * Get user activity status
   */
  static getUserActivityStatus() {
    const docsPerUser = this.getDocumentsPerUser();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7); // Last 7 days

    const active = docsPerUser.filter(u => new Date(u.lastDocumentDate) >= cutoffDate).length;
    const idle = docsPerUser.filter(u => {
      const lastDate = new Date(u.lastDocumentDate);
      return lastDate < cutoffDate && lastDate >= new Date(cutoffDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    }).length;
    const inactive = docsPerUser.filter(u => {
      const lastDate = new Date(u.lastDocumentDate);
      return lastDate < new Date(cutoffDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    }).length;

    return {
      active,
      idle,
      inactive,
      total: docsPerUser.length
    };
  }

  /**
   * Get document creation timeline
   */
  static getDocumentTimeline(userId = null, limit = 50) {
    let documents = this.loadDocumentLog();

    if (userId) {
      documents = documents.filter(d => d.userId === userId);
    }

    return documents
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  }

  /**
   * Get summary statistics
   */
  static getSummaryStats() {
    const documents = this.loadDocumentLog();
    const usersData = this.getDocumentsPerUser();
    const accountsData = this.getDocumentsPerAccount();

    const invoiceTotal = documents.filter(d => d.type === 'invoice').reduce((sum, d) => sum + d.amount, 0);
    const quoteTotal = documents.filter(d => d.type === 'quote').reduce((sum, d) => sum + d.amount, 0);

    return {
      totalDocuments: documents.length,
      totalUsers: usersData.length,
      totalAccounts: accountsData.length,
      invoicesCreated: documents.filter(d => d.type === 'invoice').length,
      quotesCreated: documents.filter(d => d.type === 'quote').length,
      receiptsCreated: documents.filter(d => d.type === 'receipt').length,
      estimatesCreated: documents.filter(d => d.type === 'estimate').length,
      totalInvoiceValue: invoiceTotal,
      totalQuoteValue: quoteTotal,
      averageDocumentsPerUser: usersData.length > 0 ? (documents.length / usersData.length).toFixed(1) : 0,
      averageDocumentsPerAccount: accountsData.length > 0 ? (documents.length / accountsData.length).toFixed(1) : 0
    };
  }

  /**
   * Get document type distribution
   */
  static getDocumentTypeDistribution() {
    const documents = this.loadDocumentLog();
    
    return {
      invoices: documents.filter(d => d.type === 'invoice').length,
      quotes: documents.filter(d => d.type === 'quote').length,
      receipts: documents.filter(d => d.type === 'receipt').length,
      estimates: documents.filter(d => d.type === 'estimate').length
    };
  }

  /**
   * Get user engagement metrics
   */
  static getUserEngagementMetrics() {
    const usersData = this.getDocumentsPerUser();
    
    return {
      powerUsersCount: usersData.filter(u => u.total >= 50).length,
      regularUsersCount: usersData.filter(u => u.total >= 10 && u.total < 50).length,
      occasionalUsersCount: usersData.filter(u => u.total > 0 && u.total < 10).length
    };
  }

  /**
   * Export overview data
   */
  static exportOversight() {
    return {
      exportDate: new Date().toISOString(),
      summary: this.getSummaryStats(),
      documentsPerUser: this.getDocumentsPerUser(),
      documentsPerAccount: this.getDocumentsPerAccount(),
      monthlyTrends: this.getMonthlyTrends(),
      yearlyTrends: this.getYearlyTrends(),
      powerUsers: this.getPowerUsers(20),
      inactiveUsers: this.getInactiveUsers(),
      userActivityStatus: this.getUserActivityStatus(),
      engagementMetrics: this.getUserEngagementMetrics()
    };
  }

  // ==================== Private Helper Methods ====================

  static loadDocumentLog() {
    const stored = localStorage.getItem(DOCUMENT_LOG_KEY);
    if (stored) {
      return JSON.parse(stored);
    }

    const sampleDocs = this.generateSampleDocuments();
    localStorage.setItem(DOCUMENT_LOG_KEY, JSON.stringify(sampleDocs));
    return sampleDocs;
  }

  static loadUserData() {
    const stored = localStorage.getItem('breakapi_users');
    if (stored) {
      return JSON.parse(stored);
    }
    
    return this.generateSampleUsers();
  }

  static loadAccountsData() {
    const stored = localStorage.getItem('breakapi_business_accounts');
    if (stored) {
      return JSON.parse(stored);
    }

    return this.generateSampleAccounts();
  }

  static generateSampleDocuments() {
    const docTypes = ['invoice', 'quote', 'receipt', 'estimate'];
    const documents = [];
    const userIds = ['1', '2', '3', '4', '5', '6', '7', '8'];
    const accountIds = ['1', '2', '3', '4', '5', '6', '7'];

    // Generate documents for last 12 months
    for (let monthsAgo = 11; monthsAgo >= 0; monthsAgo--) {
      const baseDate = new Date();
      baseDate.setMonth(baseDate.getMonth() - monthsAgo);

      // Random number of documents per month
      const docsThisMonth = Math.floor(Math.random() * 100 + 50);

      for (let i = 0; i < docsThisMonth; i++) {
        const randomDay = Math.floor(Math.random() * 28) + 1;
        baseDate.setDate(randomDay);
        const docDate = new Date(baseDate);

        documents.push({
          id: Date.now().toString() + Math.random(),
          userId: userIds[Math.floor(Math.random() * userIds.length)],
          accountId: accountIds[Math.floor(Math.random() * accountIds.length)],
          type: docTypes[Math.floor(Math.random() * docTypes.length)],
          status: Math.random() > 0.3 ? 'sent' : 'draft',
          amount: Math.floor(Math.random() * 5000 + 500),
          clientName: `Client ${Math.floor(Math.random() * 1000)}`,
          createdAt: docDate.toISOString(),
          docNumber: `DOC${Date.now()}`
        });
      }
    }

    return documents;
  }

  static generateSampleUsers() {
    return [
      { id: '1', name: 'Alice Johnson', email: 'alice@company.com', plan: 'professional' },
      { id: '2', name: 'Bob Smith', email: 'bob@company.com', plan: 'professional' },
      { id: '3', name: 'Carol Davis', email: 'carol@company.com', plan: 'starter' },
      { id: '4', name: 'David Wilson', email: 'david@company.com', plan: 'professional' },
      { id: '5', name: 'Emma Brown', email: 'emma@company.com', plan: 'starter' },
      { id: '6', name: 'Frank Miller', email: 'frank@company.com', plan: 'free' },
      { id: '7', name: 'Grace Lee', email: 'grace@company.com', plan: 'professional' },
      { id: '8', name: 'Henry Taylor', email: 'henry@company.com', plan: 'starter' }
    ];
  }

  static generateSampleAccounts() {
    return [
      { id: '1', name: 'Acme Corporation', plan: 'enterprise' },
      { id: '2', name: 'TechStart Inc', plan: 'professional' },
      { id: '3', name: 'Global Solutions', plan: 'professional' },
      { id: '4', name: 'Innovation Labs', plan: 'starter' },
      { id: '5', name: 'Digital Dreams', plan: 'professional' },
      { id: '6', name: 'Startup Ventures', plan: 'free' },
      { id: '7', name: 'Enterprise Corp', plan: 'enterprise' }
    ];
  }
}

export default DocumentOversightService;
