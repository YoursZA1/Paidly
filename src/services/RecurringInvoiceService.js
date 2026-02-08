/**
 * RecurringInvoiceService
 * Manages recurring invoice templates and generation logic
 */

import { RecurringInvoice, Invoice } from '@/api/entities';
import {
  addMonths,
  addDays,
  isBefore,
  isAfter,
  parseISO,
  startOfDay,
  endOfMonth,
  format
} from 'date-fns';

export const RecurringInvoiceService = {
  // Frequency options for recurring invoices
  FREQUENCIES: {
    weekly: {
      id: 'weekly',
      label: 'Weekly',
      description: 'Every week',
      interval: 7,
      unit: 'days'
    },
    biweekly: {
      id: 'biweekly',
      label: 'Bi-weekly',
      description: 'Every 2 weeks',
      interval: 14,
      unit: 'days'
    },
    monthly: {
      id: 'monthly',
      label: 'Monthly',
      description: 'Every month on the same day',
      interval: 1,
      unit: 'months'
    },
    quarterly: {
      id: 'quarterly',
      label: 'Quarterly',
      description: 'Every 3 months',
      interval: 3,
      unit: 'months'
    },
    semiannual: {
      id: 'semiannual',
      label: 'Semi-annual',
      description: 'Every 6 months',
      interval: 6,
      unit: 'months'
    },
    annual: {
      id: 'annual',
      label: 'Annual',
      description: 'Every year',
      interval: 12,
      unit: 'months'
    }
  },

  // Template presets for quick creation
  TEMPLATES: {
    monthly_subscription: {
      id: 'monthly_subscription',
      name: 'Monthly Subscription',
      frequency: 'monthly',
      description: 'Perfect for monthly service subscriptions',
      example: {
        template: 'Monthly Service Subscription',
        items: 'Service/Product name',
        dueDate: 'Same day next month'
      }
    },
    quarterly_retainer: {
      id: 'quarterly_retainer',
      name: 'Quarterly Retainer',
      frequency: 'quarterly',
      description: 'Ideal for quarterly consulting or retainer agreements',
      example: {
        template: 'Quarterly Retainer Fee',
        items: 'Service retainer',
        dueDate: 'Same day in 3 months'
      }
    },
    annual_license: {
      id: 'annual_license',
      name: 'Annual License Fee',
      frequency: 'annual',
      description: 'For annual licenses or memberships',
      example: {
        template: 'Annual License Renewal',
        items: 'License fee',
        dueDate: 'Same day next year'
      }
    },
    biweekly_services: {
      id: 'biweekly_services',
      name: 'Bi-weekly Services',
      frequency: 'biweekly',
      description: 'For bi-weekly service billing',
      example: {
        template: 'Bi-weekly Service Invoice',
        items: 'Weekly services',
        dueDate: 'Every 14 days'
      }
    },
    weekly_retainer: {
      id: 'weekly_retainer',
      name: 'Weekly Retainer',
      frequency: 'weekly',
      description: 'For weekly service billing',
      example: {
        template: 'Weekly Retainer',
        items: 'Weekly services',
        dueDate: 'Every 7 days'
      }
    }
  },

  /**
   * Get all frequency options
   */
  getAllFrequencies() {
    return Object.values(this.FREQUENCIES);
  },

  /**
   * Get frequency details
   */
  getFrequency(frequencyId) {
    return this.FREQUENCIES[frequencyId] || this.FREQUENCIES.monthly;
  },

  /**
   * Get all template presets
   */
  getAllTemplates() {
    return Object.values(this.TEMPLATES);
  },

  /**
   * Get template details
   */
  getTemplate(templateId) {
    return this.TEMPLATES[templateId];
  },

  /**
   * Calculate next generation date
   */
  calculateNextGenerationDate(lastGeneratedDate, frequencyId, occurrences = 1) {
    const baseDate = lastGeneratedDate ? parseISO(lastGeneratedDate) : new Date();
    const frequency = this.getFrequency(frequencyId);

    let nextDate;
    if (frequency.unit === 'days') {
      nextDate = addDays(baseDate, frequency.interval * occurrences);
    } else if (frequency.unit === 'months') {
      nextDate = addMonths(baseDate, frequency.interval * occurrences);
    } else {
      nextDate = addDays(baseDate, frequency.interval * occurrences);
    }

    return nextDate;
  },

  /**
   * Check if a recurring invoice is due for generation
   */
  isDue(recurringInvoice) {
    if (recurringInvoice.status !== 'active') {
      return false;
    }

    const nextGenerationDate = parseISO(recurringInvoice.next_generation_date);
    const today = startOfDay(new Date());

    return !isAfter(nextGenerationDate, today);
  },

  /**
   * Generate invoices for all due recurring invoices
   */
  async checkAndGenerateDueInvoices() {
    try {
      const recurringInvoices = await RecurringInvoice.list();
      const dueInvoices = recurringInvoices.filter(ri => this.isDue(ri));

      const generatedInvoices = [];

      for (const recurringInvoice of dueInvoices) {
        try {
          const newInvoice = await this.generateInvoiceFromRecurring(recurringInvoice);
          generatedInvoices.push(newInvoice);

          // Update next_generation_date
          const nextDate = this.calculateNextGenerationDate(
            recurringInvoice.next_generation_date,
            recurringInvoice.frequency
          );

          await RecurringInvoice.update(recurringInvoice.id, {
            next_generation_date: nextDate.toISOString(),
            last_generated_date: new Date().toISOString()
          });
        } catch (error) {
          console.error(`Error generating invoice for recurring ${recurringInvoice.id}:`, error);
        }
      }

      return generatedInvoices;
    } catch (error) {
      console.error('Error checking due recurring invoices:', error);
      return [];
    }
  },

  /**
   * Generate a new invoice from a recurring invoice template
   */
  async generateInvoiceFromRecurring(recurringInvoice) {
    const now = new Date();
    const nextMonth = addMonths(now, 1);
    const dueDate = recurringInvoice.due_date_offset 
      ? addDays(now, recurringInvoice.due_date_offset)
      : endOfMonth(nextMonth);

    const invoiceData = {
      client_id: recurringInvoice.client_id,
      invoice_number: `${recurringInvoice.invoice_prefix}-${format(now, 'yyyyMMdd')}`,
      created_date: now.toISOString(),
      due_date: dueDate.toISOString(),
      status: 'draft',
      items: recurringInvoice.items || [],
      notes: recurringInvoice.notes || '',
      total_amount: recurringInvoice.total_amount || 0,
      tax_rate: recurringInvoice.tax_rate || 0,
      recurring_invoice_id: recurringInvoice.id
    };

    return await Invoice.create(invoiceData);
  },

  /**
   * Create a new recurring invoice from template
   */
  async createFromTemplate(templateId, clientId, invoiceData) {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    const recurringData = {
      client_id: clientId,
      frequency: template.frequency,
      status: 'active',
      created_date: new Date().toISOString(),
      next_generation_date: new Date().toISOString(),
      template_id: templateId,
      ...invoiceData
    };

    return await RecurringInvoice.create(recurringData);
  },

  /**
   * Validate recurring invoice data
   */
  validateData(data) {
    const errors = [];
    const warnings = [];

    if (!data.client_id) {
      errors.push('Client is required');
    }

    if (!data.frequency || !this.FREQUENCIES[data.frequency]) {
      errors.push('Valid frequency is required');
    }

    if (!data.items || data.items.length === 0) {
      errors.push('At least one line item is required');
    }

    if (data.total_amount && data.total_amount <= 0) {
      errors.push('Total amount must be greater than 0');
    }

    if (data.end_date && data.start_date) {
      const startDate = parseISO(data.start_date);
      const endDate = parseISO(data.end_date);
      if (isAfter(startDate, endDate)) {
        errors.push('End date must be after start date');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  },

  /**
   * Calculate number of invoices to be generated
   */
  calculateInvoiceCount(startDate, endDate, frequencyId) {
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    const frequency = this.getFrequency(frequencyId);

    let count = 0;
    let currentDate = new Date(start);

    while (isBefore(currentDate, end)) {
      count++;
      if (frequency.unit === 'days') {
        currentDate = addDays(currentDate, frequency.interval);
      } else if (frequency.unit === 'months') {
        currentDate = addMonths(currentDate, frequency.interval);
      }
    }

    return count;
  },

  /**
   * Get upcoming generation schedule
   */
  getUpcomingSchedule(recurringInvoice, occurrences = 12) {
    const schedule = [];
    let currentDate = parseISO(recurringInvoice.next_generation_date);
    const frequency = this.getFrequency(recurringInvoice.frequency);

    for (let i = 0; i < occurrences; i++) {
      schedule.push({
        occurrence: i + 1,
        generationDate: currentDate,
        formattedDate: format(currentDate, 'MMM dd, yyyy'),
        isPast: isBefore(currentDate, startOfDay(new Date())),
        isDue: isBefore(currentDate, startOfDay(new Date()))
      });

      if (frequency.unit === 'days') {
        currentDate = addDays(currentDate, frequency.interval);
      } else if (frequency.unit === 'months') {
        currentDate = addMonths(currentDate, frequency.interval);
      }
    }

    return schedule;
  },

  /**
   * Get recurring invoice statistics
   */
  async getStatistics() {
    try {
      const recurringInvoices = await RecurringInvoice.list();

      const stats = {
        total: recurringInvoices.length,
        active: recurringInvoices.filter(ri => ri.status === 'active').length,
        paused: recurringInvoices.filter(ri => ri.status === 'paused').length,
        ended: recurringInvoices.filter(ri => ri.status === 'ended').length,
        byFrequency: {
          weekly: 0,
          biweekly: 0,
          monthly: 0,
          quarterly: 0,
          semiannual: 0,
          annual: 0
        }
      };

      recurringInvoices.forEach(ri => {
        if (stats.byFrequency[ri.frequency] !== undefined) {
          stats.byFrequency[ri.frequency]++;
        }
      });

      return stats;
    } catch (error) {
      console.error('Error getting statistics:', error);
      return null;
    }
  },

  /**
   * Calculate total value of recurring invoices
   */
  calculateTotalValue(recurringInvoices) {
    return recurringInvoices.reduce((sum, ri) => sum + (ri.total_amount || 0), 0);
  },

  /**
   * Calculate monthly recurring revenue
   */
  calculateMRR(recurringInvoices) {
    let mrr = 0;

    recurringInvoices.forEach(ri => {
      const frequency = this.getFrequency(ri.frequency);
      const amount = ri.total_amount || 0;

      if (frequency.unit === 'months') {
        mrr += (amount / frequency.interval);
      } else if (frequency.unit === 'days') {
        mrr += (amount * (365 / frequency.interval) / 12);
      }
    });

    return mrr;
  },

  /**
   * Calculate annual recurring revenue
   */
  calculateARR(recurringInvoices) {
    return this.calculateMRR(recurringInvoices) * 12;
  },

  /**
   * Export recurring invoice as template
   */
  exportAsTemplate(recurringInvoice) {
    return {
      name: recurringInvoice.template_name || 'Custom Template',
      frequency: recurringInvoice.frequency,
      items: recurringInvoice.items,
      notes: recurringInvoice.notes,
      tax_rate: recurringInvoice.tax_rate,
      due_date_offset: recurringInvoice.due_date_offset,
      customFields: recurringInvoice.custom_fields || {}
    };
  },

  /**
   * Pause a recurring invoice
   */
  async pauseRecurringInvoice(recurringInvoiceId) {
    return await RecurringInvoice.update(recurringInvoiceId, {
      status: 'paused',
      paused_date: new Date().toISOString()
    });
  },

  /**
   * Resume a paused recurring invoice
   */
  async resumeRecurringInvoice(recurringInvoiceId) {
    return await RecurringInvoice.update(recurringInvoiceId, {
      status: 'active',
      resumed_date: new Date().toISOString()
    });
  },

  /**
   * End a recurring invoice
   */
  async endRecurringInvoice(recurringInvoiceId) {
    return await RecurringInvoice.update(recurringInvoiceId, {
      status: 'ended',
      end_date: new Date().toISOString()
    });
  }
};

export default RecurringInvoiceService;
