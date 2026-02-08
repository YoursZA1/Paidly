/**
 * Tax Service
 * Handles tax/VAT configuration, presets, and calculations
 */

export class TaxService {
  // Default tax presets by region
  static TAX_PRESETS = {
    'US': [
      { name: 'Federal Standard', rate: 0, type: 'federal' },
      { name: 'Sales Tax - CA', rate: 7.25, type: 'state' },
      { name: 'Sales Tax - TX', rate: 6.25, type: 'state' },
      { name: 'Sales Tax - NY', rate: 8, type: 'state' },
    ],
    'EU': [
      { name: 'Standard VAT', rate: 21, type: 'standard' },
      { name: 'Reduced VAT', rate: 9, type: 'reduced' },
      { name: 'Super Reduced VAT', rate: 5, type: 'super_reduced' },
      { name: 'Zero VAT', rate: 0, type: 'zero' },
    ],
    'UK': [
      { name: 'Standard VAT', rate: 20, type: 'standard' },
      { name: 'Reduced VAT', rate: 5, type: 'reduced' },
      { name: 'Zero VAT', rate: 0, type: 'zero' },
    ],
    'CA': [
      { name: 'GST/HST', rate: 15, type: 'combined' },
      { name: 'GST Only', rate: 5, type: 'gst' },
      { name: 'PST', rate: 7, type: 'pst' },
    ],
    'AU': [
      { name: 'Standard GST', rate: 10, type: 'standard' },
    ],
  };

  /**
   * Get default tax presets for a region
   * @param {string} region - Region code (US, EU, UK, CA, AU)
   * @returns {Array} Tax presets for the region
   */
  static getTaxPresetsForRegion(region = 'US') {
    return this.TAX_PRESETS[region] || this.TAX_PRESETS['US'];
  }

  /**
   * Create a custom tax profile
   * @param {string} name - Tax profile name
   * @param {number} rate - Tax rate (0-100)
   * @param {string} type - Tax type (standard, reduced, etc.)
   * @param {string} description - Optional description
   * @returns {object} Tax profile
   */
  static createTaxProfile(name, rate, type = 'standard', description = '') {
    return {
      id: `tax_${Date.now()}`,
      name,
      rate: parseFloat(rate) || 0,
      type,
      description,
      isCustom: true,
      createdDate: new Date().toISOString()
    };
  }

  /**
   * Calculate tax amount
   * @param {number} amount - Amount to calculate tax on
   * @param {number} taxRate - Tax rate (0-100)
   * @returns {number} Tax amount
   */
  static calculateTax(amount = 0, taxRate = 0) {
    const base = parseFloat(amount) || 0;
    const rate = parseFloat(taxRate) || 0;
    return base * (rate / 100);
  }

  /**
   * Calculate amount including tax
   * @param {number} amount - Base amount
   * @param {number} taxRate - Tax rate
   * @returns {number} Amount with tax included
   */
  static calculateAmountWithTax(amount = 0, taxRate = 0) {
    const base = parseFloat(amount) || 0;
    const tax = this.calculateTax(base, taxRate);
    return base + tax;
  }

  /**
   * Calculate net amount from gross (reverse calculation)
   * @param {number} grossAmount - Gross amount (including tax)
   * @param {number} taxRate - Tax rate
   * @returns {object} Net amount and tax amount
   */
  static calculateNetFromGross(grossAmount = 0, taxRate = 0) {
    const gross = parseFloat(grossAmount) || 0;
    const rate = parseFloat(taxRate) || 0;
    
    if (rate === 0) {
      return { net: gross, tax: 0 };
    }

    const net = gross / (1 + (rate / 100));
    const tax = gross - net;

    return {
      net: parseFloat(net.toFixed(2)),
      tax: parseFloat(tax.toFixed(2))
    };
  }

  /**
   * Calculate multiple taxes (for compound tax scenarios)
   * @param {number} amount - Base amount
   * @param {Array} taxRates - Array of tax rates to apply
   * @returns {object} Breakdown of each tax and total
   */
  static calculateCompoundTaxes(amount = 0, taxRates = []) {
    let base = parseFloat(amount) || 0;
    const taxes = [];
    let totalTax = 0;

    taxRates.forEach((rate, index) => {
      const taxAmount = base * (parseFloat(rate) / 100);
      taxes.push({
        index,
        rate: parseFloat(rate),
        amount: parseFloat(taxAmount.toFixed(2))
      });
      totalTax += taxAmount;
    });

    return {
      baseAmount: base,
      taxes,
      totalTax: parseFloat(totalTax.toFixed(2)),
      totalWithTax: parseFloat((base + totalTax).toFixed(2))
    };
  }

  /**
   * Get tax summary for invoices
   * @param {Array} invoices - Array of invoice objects
   * @returns {object} Tax summary with totals
   */
  static getTaxSummaryFromInvoices(invoices = []) {
    const summary = {
      totalBeforeTax: 0,
      totalTax: 0,
      totalAfterTax: 0,
      byTaxRate: {}
    };

    invoices.forEach((invoice) => {
      const subtotal = invoice.subtotal || 0;
      const taxAmount = invoice.tax_amount || 0;
      const taxRate = invoice.tax_rate || 0;

      summary.totalBeforeTax += subtotal;
      summary.totalTax += taxAmount;
      summary.totalAfterTax += (subtotal + taxAmount);

      // Group by tax rate
      const rateKey = `${taxRate}%`;
      if (!summary.byTaxRate[rateKey]) {
        summary.byTaxRate[rateKey] = {
          rate: taxRate,
          count: 0,
          subtotal: 0,
          taxAmount: 0,
          total: 0
        };
      }
      summary.byTaxRate[rateKey].count += 1;
      summary.byTaxRate[rateKey].subtotal += subtotal;
      summary.byTaxRate[rateKey].taxAmount += taxAmount;
      summary.byTaxRate[rateKey].total += (subtotal + taxAmount);
    });

    return {
      ...summary,
      byTaxRateArray: Object.values(summary.byTaxRate).sort((a, b) => a.rate - b.rate)
    };
  }

  /**
   * Validate tax rate
   * @param {number} rate - Tax rate to validate
   * @returns {object} Validation result
   */
  static validateTaxRate(rate) {
    const errors = [];
    const parsedRate = parseFloat(rate);

    if (isNaN(parsedRate)) {
      errors.push('Tax rate must be a number');
    } else if (parsedRate < 0) {
      errors.push('Tax rate cannot be negative');
    } else if (parsedRate > 100) {
      errors.push('Tax rate cannot exceed 100%');
    }

    return {
      isValid: errors.length === 0,
      errors,
      rate: parsedRate
    };
  }

  /**
   * Format tax display
   * @param {number} taxAmount - Tax amount
   * @param {number} taxRate - Tax rate
   * @param {string} currency - Currency code
   * @returns {string} Formatted tax display
   */
  static formatTaxDisplay(taxAmount, taxRate, currency = 'USD') {
    return `${taxRate}% (${currency} ${taxAmount.toFixed(2)})`;
  }
}

export default TaxService;
