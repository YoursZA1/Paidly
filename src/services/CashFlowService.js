/**
 * CashFlowService
 * Accurate cash flow calculation and analysis
 */

import {
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  format
} from 'date-fns';

export const CashFlowService = {
  /**
   * Calculate cash flow for a specific period
   * @param {Array} payments - Payment objects with payment_date
   * @param {Array} expenses - Expense objects with date
   * @param {Date} periodStart - Start date
   * @param {Date} periodEnd - End date
   * @returns {Object} Cash flow for period
   */
  calculatePeriodCashFlow(payments = [], expenses = [], periodStart, periodEnd) {
    if (!periodStart || !periodEnd) {
      return {
        income: 0,
        expenses: 0,
        net: 0,
        transactionCount: 0
      };
    }

    // Income from payments within period
    const periodIncome = payments
      .filter(payment => {
        if (!payment.payment_date || !payment.amount || payment.amount <= 0) return false;
        const paymentDate = parseISO(payment.payment_date);
        return paymentDate >= periodStart && paymentDate <= periodEnd;
      })
      .reduce((sum, payment) => sum + payment.amount, 0);

    // Expenses within period
    const periodExpenses = expenses
      .filter(expense => {
        if (!expense.date || !expense.amount || expense.amount <= 0) return false;
        const expenseDate = parseISO(expense.date);
        return expenseDate >= periodStart && expenseDate <= periodEnd;
      })
      .reduce((sum, expense) => sum + expense.amount, 0);

    // Count transactions
    const incomeTransactions = payments.filter(payment => {
      if (!payment.payment_date || !payment.amount || payment.amount <= 0) return false;
      const paymentDate = parseISO(payment.payment_date);
      return paymentDate >= periodStart && paymentDate <= periodEnd;
    }).length;

    const expenseTransactions = expenses.filter(expense => {
      if (!expense.date || !expense.amount || expense.amount <= 0) return false;
      const expenseDate = parseISO(expense.date);
      return expenseDate >= periodStart && expenseDate <= periodEnd;
    }).length;

    return {
      income: periodIncome,
      expenses: periodExpenses,
      net: periodIncome - periodExpenses,
      incomeTransactions,
      expenseTransactions,
      transactionCount: incomeTransactions + expenseTransactions
    };
  },

  /**
   * Generate monthly cash flow chart data
   * @param {Array} payments - Payment objects
   * @param {Array} expenses - Expense objects
   * @param {Number} monthsToShow - Number of months to include
   * @returns {Array} Monthly cash flow data
   */
  generateMonthlyCashFlow(payments = [], expenses = [], monthsToShow = 6) {
    const months = [];
    const now = new Date();

    for (let i = monthsToShow - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStart = startOfMonth(date);
      const monthEnd = endOfMonth(date);

      const cashFlow = this.calculatePeriodCashFlow(payments, expenses, monthStart, monthEnd);

      months.push({
        month: format(date, 'MMM yyyy'),
        shortMonth: format(date, 'MMM'),
        year: date.getFullYear(),
        monthNum: date.getMonth() + 1,
        ...cashFlow,
        monthStart,
        monthEnd
      });
    }

    return months;
  },

  /**
   * Generate yearly cash flow summary
   * @param {Array} payments - Payment objects
   * @param {Array} expenses - Expense objects
   * @returns {Array} Yearly cash flow data
   */
  generateYearlyCashFlow(payments = [], expenses = []) {
    const years = {};
    const now = new Date();
    const currentYear = now.getFullYear();

    // Get years from data
    const allDates = [
      ...payments.map(p => p.payment_date),
      ...expenses.map(e => e.date)
    ].filter(Boolean);

    if (allDates.length === 0) {
      return [];
    }

    const minYear = Math.min(
      ...allDates.map(d => parseISO(d).getFullYear())
    );

    for (let year = minYear; year <= currentYear; year++) {
      const yearStart = startOfYear(new Date(year, 0, 1));
      const yearEnd = endOfYear(new Date(year, 11, 31));

      const cashFlow = this.calculatePeriodCashFlow(payments, expenses, yearStart, yearEnd);

      years[year] = {
        year,
        ...cashFlow
      };
    }

    return Object.values(years);
  },

  /**
   * Calculate cash flow by category
   * @param {Array} expenses - Expense objects
   * @returns {Array} Categorized expenses
   */
  getCategoryBreakdown(expenses = []) {
    const categories = {};

    expenses
      .filter(exp => exp.amount && exp.amount > 0)
      .forEach(exp => {
        const category = exp.category || 'Other';
        if (!categories[category]) {
          categories[category] = {
            category,
            amount: 0,
            count: 0,
            percentage: 0
          };
        }
        categories[category].amount += exp.amount;
        categories[category].count++;
      });

    const total = Object.values(categories).reduce((sum, cat) => sum + cat.amount, 0);
    return Object.values(categories)
      .map(cat => ({
        ...cat,
        percentage: total > 0 ? (cat.amount / total) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount);
  },

  /**
   * Calculate cash flow metrics
   * @param {Array} payments - Payment objects
   * @param {Array} expenses - Expense objects
   * @returns {Object} Cash flow metrics
   */
  calculateMetrics(payments = [], expenses = []) {
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const currentMonthEnd = endOfMonth(now);
    const yearStart = startOfYear(now);

    const currentMonth = this.calculatePeriodCashFlow(payments, expenses, currentMonthStart, currentMonthEnd);
    const yearToDate = this.calculatePeriodCashFlow(payments, expenses, yearStart, now);
    const allTime = this.calculatePeriodCashFlow(
      payments,
      expenses,
      new Date(2000, 0, 1),
      now
    );

    // Calculate averages
    const monthlyData = this.generateMonthlyCashFlow(payments, expenses, 12);
    const positiveMonths = monthlyData.filter(m => m.net > 0).length;
    const negativeMonths = monthlyData.filter(m => m.net < 0).length;

    return {
      currentMonth,
      yearToDate,
      allTime,
      averageMonthlyIncome: monthlyData.length > 0 
        ? monthlyData.reduce((sum, m) => sum + m.income, 0) / monthlyData.length 
        : 0,
      averageMonthlyExpenses: monthlyData.length > 0 
        ? monthlyData.reduce((sum, m) => sum + m.expenses, 0) / monthlyData.length 
        : 0,
      averageMonthlyNet: monthlyData.length > 0 
        ? monthlyData.reduce((sum, m) => sum + m.net, 0) / monthlyData.length 
        : 0,
      positiveMonths,
      negativeMonths,
      profitabilityRate: monthlyData.length > 0 
        ? (positiveMonths / monthlyData.length) * 100 
        : 0
    };
  },

  /**
   * Get cash flow trends
   * @param {Array} payments - Payment objects
   * @param {Array} expenses - Expense objects
   * @param {Number} months - Number of months to analyze
   * @returns {Object} Trend analysis
   */
  analyzeTrends(payments = [], expenses = [], months = 6) {
    const monthlyData = this.generateMonthlyCashFlow(payments, expenses, months);

    if (monthlyData.length < 2) {
      return {
        incomeTrend: 'insufficient_data',
        expenseTrend: 'insufficient_data',
        netTrend: 'insufficient_data'
      };
    }

    const getTrend = (values) => {
      if (values.length < 2) return 'flat';
      
      const recent = values.slice(-3);
      const older = values.slice(0, -3);
      
      const recentAvg = recent.reduce((a, b) => a + b) / recent.length;
      const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b) / older.length : recentAvg;
      
      const change = ((recentAvg - olderAvg) / (olderAvg || 1)) * 100;
      
      if (change > 10) return 'increasing';
      if (change < -10) return 'decreasing';
      return 'stable';
    };

    return {
      incomeTrend: getTrend(monthlyData.map(m => m.income)),
      expenseTrend: getTrend(monthlyData.map(m => m.expenses)),
      netTrend: getTrend(monthlyData.map(m => m.net)),
      monthlyData
    };
  },

  /**
   * Calculate operating margin
   * @param {Array} payments - Payment objects
   * @param {Array} expenses - Expense objects
   * @returns {Object} Margin analysis
   */
  calculateMargins(payments = [], expenses = []) {
    const now = new Date();
    const monthlyData = this.generateMonthlyCashFlow(payments, expenses, 12);

    const currentMonth = this.calculatePeriodCashFlow(
      payments,
      expenses,
      startOfMonth(now),
      endOfMonth(now)
    );

    const avgMonthly = {
      income: monthlyData.reduce((sum, m) => sum + m.income, 0) / Math.max(monthlyData.length, 1),
      expenses: monthlyData.reduce((sum, m) => sum + m.expenses, 0) / Math.max(monthlyData.length, 1)
    };

    return {
      currentMonth: {
        marginPercentage: currentMonth.income > 0 
          ? ((currentMonth.net / currentMonth.income) * 100) 
          : 0,
        margin: currentMonth.net,
        income: currentMonth.income,
        expenses: currentMonth.expenses
      },
      average: {
        marginPercentage: avgMonthly.income > 0 
          ? (((avgMonthly.income - avgMonthly.expenses) / avgMonthly.income) * 100) 
          : 0,
        margin: avgMonthly.income - avgMonthly.expenses,
        income: avgMonthly.income,
        expenses: avgMonthly.expenses
      }
    };
  },

  /**
   * Generate cash flow forecast
   * @param {Array} payments - Payment objects
   * @param {Array} expenses - Expense objects
   * @param {Number} forecastMonths - Months to forecast
   * @returns {Array} Forecasted cash flow
   */
  generateForecast(payments = [], expenses = [], forecastMonths = 3) {
    const monthlyData = this.generateMonthlyCashFlow(payments, expenses, 6);
    const forecast = [];

    if (monthlyData.length === 0) {
      return forecast;
    }

    // Calculate average from last 3 months
    const recentMonths = monthlyData.slice(-3);
    const avgIncome = recentMonths.reduce((sum, m) => sum + m.income, 0) / recentMonths.length;
    const avgExpenses = recentMonths.reduce((sum, m) => sum + m.expenses, 0) / recentMonths.length;

    const now = new Date();
    for (let i = 1; i <= forecastMonths; i++) {
      const forecastDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      forecast.push({
        month: format(forecastDate, 'MMM yyyy'),
        income: avgIncome,
        expenses: avgExpenses,
        net: avgIncome - avgExpenses,
        isForecast: true
      });
    }

    return forecast;
  },

  /**
   * Validate cash flow data
   * @param {Array} payments - Payment objects
   * @param {Array} expenses - Expense objects
   * @returns {Object} Validation result
   */
  validateData(payments = [], expenses = []) {
    const issues = [];
    const warnings = [];

    // Check payments
    payments.forEach((payment, idx) => {
      if (!payment.payment_date) {
        issues.push(`Payment ${idx + 1}: Missing payment date`);
      }
      if (!payment.amount || payment.amount <= 0) {
        issues.push(`Payment ${idx + 1}: Invalid amount`);
      }
      if (payment.amount > 1000000) {
        warnings.push(`Payment ${idx + 1}: Unusually large amount (${payment.amount})`);
      }
    });

    // Check expenses
    expenses.forEach((expense, idx) => {
      if (!expense.date) {
        issues.push(`Expense ${idx + 1}: Missing date`);
      }
      if (!expense.amount || expense.amount <= 0) {
        issues.push(`Expense ${idx + 1}: Invalid amount`);
      }
      if (expense.amount > 1000000) {
        warnings.push(`Expense ${idx + 1}: Unusually large amount (${expense.amount})`);
      }
    });

    return {
      isValid: issues.length === 0,
      issues,
      warnings,
      paymentCount: payments.length,
      expenseCount: expenses.length,
      totalTransactions: payments.length + expenses.length
    };
  }
};

export default CashFlowService;
