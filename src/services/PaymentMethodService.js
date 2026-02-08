/**
 * PaymentMethodService
 * Comprehensive payment method tracking and analytics
 */

export const PaymentMethodService = {
  // Payment method definitions
  PAYMENT_METHODS: {
    bank_transfer: {
      id: 'bank_transfer',
      label: 'Bank Transfer',
      icon: 'Building2',
      color: '#3b82f6',
      description: 'Electronic bank transfer or wire payment',
      processingTime: 1, // days
      fee: 0
    },
    cash: {
      id: 'cash',
      label: 'Cash',
      icon: 'Banknote',
      color: '#10b981',
      description: 'Physical cash payment',
      processingTime: 0,
      fee: 0
    },
    credit_card: {
      id: 'credit_card',
      label: 'Credit Card',
      icon: 'CreditCard',
      color: '#f59e0b',
      description: 'Credit card payment',
      processingTime: 2,
      fee: 0.025 // 2.5% typical fee
    },
    debit_card: {
      id: 'debit_card',
      label: 'Debit Card',
      icon: 'CreditCard',
      color: '#8b5cf6',
      description: 'Debit card payment',
      processingTime: 1,
      fee: 0.01 // 1% typical fee
    },
    mobile_payment: {
      id: 'mobile_payment',
      label: 'Mobile Payment',
      icon: 'Smartphone',
      color: '#ec4899',
      description: 'Mobile wallet or app payment',
      processingTime: 0,
      fee: 0.015 // 1.5% typical fee
    },
    check: {
      id: 'check',
      label: 'Check',
      icon: 'FileCheck',
      color: '#06b6d4',
      description: 'Paper check payment',
      processingTime: 5,
      fee: 0
    },
    other: {
      id: 'other',
      label: 'Other',
      icon: 'HelpCircle',
      color: '#6b7280',
      description: 'Other payment method',
      processingTime: 3,
      fee: 0
    }
  },

  /**
   * Get payment method details
   */
  getMethodDetails(methodId) {
    return this.PAYMENT_METHODS[methodId] || this.PAYMENT_METHODS.other;
  },

  /**
   * Get all payment methods
   */
  getAllMethods() {
    return Object.values(this.PAYMENT_METHODS);
  },

  /**
   * Calculate payment method distribution
   * @param {Array} payments - Array of payment objects
   * @returns {Object} Distribution with counts and totals
   */
  getMethodDistribution(payments) {
    const distribution = {};
    
    payments.forEach(payment => {
      const method = payment.payment_method || 'other';
      if (!distribution[method]) {
        distribution[method] = {
          method,
          details: this.getMethodDetails(method),
          count: 0,
          amount: 0,
          averageAmount: 0
        };
      }
      distribution[method].count++;
      distribution[method].amount += payment.amount || 0;
    });

    // Calculate averages
    Object.values(distribution).forEach(dist => {
      dist.averageAmount = dist.count > 0 ? dist.amount / dist.count : 0;
    });

    return distribution;
  },

  /**
   * Get payment method statistics
   * @param {Array} payments - Array of payment objects
   * @returns {Object} Statistics including preferred method
   */
  getMethodStatistics(payments) {
    if (!payments || payments.length === 0) {
      return {
        totalMethods: 0,
        preferredMethod: null,
        distribution: {},
        methodPercentages: {}
      };
    }

    const distribution = this.getMethodDistribution(payments);
    const totalAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    
    let preferredMethod = null;
    let maxCount = 0;

    const methodPercentages = {};
    Object.entries(distribution).forEach(([method, data]) => {
      methodPercentages[method] = totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0;
      
      if (data.count > maxCount) {
        maxCount = data.count;
        preferredMethod = method;
      }
    });

    return {
      totalMethods: Object.keys(distribution).length,
      preferredMethod,
      distribution,
      methodPercentages
    };
  },

  /**
   * Get payment method by date range
   * @param {Array} payments - Array of payment objects
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Object} Methods used in date range
   */
  getMethodsByDateRange(payments, startDate, endDate) {
    const filtered = payments.filter(p => {
      const paymentDate = new Date(p.payment_date);
      return paymentDate >= startDate && paymentDate <= endDate;
    });

    return this.getMethodDistribution(filtered);
  },

  /**
   * Calculate transaction fees by method
   * @param {Array} payments - Array of payment objects
   * @returns {Object} Fees by method
   */
  calculateTransactionFees(payments) {
    const fees = {};
    let totalFees = 0;

    payments.forEach(payment => {
      const method = payment.payment_method || 'other';
      const methodDetails = this.getMethodDetails(method);
      const feeAmount = (payment.amount || 0) * methodDetails.fee;

      if (!fees[method]) {
        fees[method] = {
          method,
          count: 0,
          amount: 0,
          totalFees: 0
        };
      }

      fees[method].count++;
      fees[method].amount += payment.amount || 0;
      fees[method].totalFees += feeAmount;
      totalFees += feeAmount;
    });

    return {
      byMethod: fees,
      totalFees
    };
  },

  /**
   * Get most cost-effective payment methods
   * @param {Array} payments - Array of payment objects
   * @returns {Array} Methods ranked by cost efficiency
   */
  getRankedByEfficiency(payments) {
    const distribution = this.getMethodDistribution(payments);
    const fees = this.calculateTransactionFees(payments);

    return Object.entries(distribution)
      .map(([method, data]) => ({
        method,
        details: data.details,
        count: data.count,
        amount: data.amount,
        fees: fees.byMethod[method]?.totalFees || 0,
        costPerTransaction: fees.byMethod[method] ? fees.byMethod[method].totalFees / data.count : 0,
        efficiency: ((data.amount - (fees.byMethod[method]?.totalFees || 0)) / data.amount) * 100
      }))
      .sort((a, b) => b.efficiency - a.efficiency);
  },

  /**
   * Estimate processing time for payment
   * @param {String} methodId - Payment method ID
   * @returns {Number} Processing time in days
   */
  getProcessingTime(methodId) {
    const method = this.getMethodDetails(methodId);
    return method.processingTime;
  },

  /**
   * Suggest next payment method based on history
   * @param {Array} payments - Array of payment objects
   * @returns {String} Suggested payment method
   */
  suggestNextMethod(payments) {
    if (!payments || payments.length === 0) {
      return 'bank_transfer';
    }

    const stats = this.getMethodStatistics(payments);
    return stats.preferredMethod || 'bank_transfer';
  },

  /**
   * Get payment methods by success rate (for future use with status tracking)
   * @param {Array} payments - Array of payment objects
   * @param {Array} completedPaymentIds - Array of completed payment IDs
   * @returns {Object} Success rates by method
   */
  getSuccessRateByMethod(payments, completedPaymentIds = []) {
    const distribution = {};

    payments.forEach(payment => {
      const method = payment.payment_method || 'other';
      if (!distribution[method]) {
        distribution[method] = {
          method,
          total: 0,
          successful: 0,
          successRate: 0
        };
      }
      distribution[method].total++;
      if (completedPaymentIds.includes(payment.id)) {
        distribution[method].successful++;
      }
    });

    Object.values(distribution).forEach(data => {
      data.successRate = data.total > 0 ? (data.successful / data.total) * 100 : 0;
    });

    return distribution;
  },

  /**
   * Format payment method for display
   * @param {String} methodId - Payment method ID
   * @returns {Object} Formatted method with label and icon
   */
  formatMethod(methodId) {
    const method = this.getMethodDetails(methodId);
    return {
      label: method.label,
      icon: method.icon,
      color: method.color
    };
  },

  /**
   * Validate payment method
   * @param {String} methodId - Payment method ID
   * @returns {Boolean} Whether method is valid
   */
  isValidMethod(methodId) {
    return methodId in this.PAYMENT_METHODS;
  }
};

export default PaymentMethodService;
