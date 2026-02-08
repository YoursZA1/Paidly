/**
 * Line Item Calculator Service
 * Handles calculations for invoice line items with support for:
 * - Quantity × Unit Price
 * - Per-line-item tax rates
 * - Global invoice tax rate
 */

export class LineItemCalculator {
  /**
   * Calculate line item total with quantity and unit price
   * @param {number} quantity - Quantity of items
   * @param {number} unitPrice - Price per unit
   * @returns {number} Total price for the line item
   */
  static calculateLineTotal(quantity = 0, unitPrice = 0) {
    return parseFloat(quantity) * parseFloat(unitPrice);
  }

  /**
   * Calculate tax for a single line item
   * @param {number} lineTotal - Total price of the line item
   * @param {number} taxRate - Tax rate percentage (0-100)
   * @returns {number} Tax amount for the line item
   */
  static calculateLineTax(lineTotal = 0, taxRate = 0) {
    const total = parseFloat(lineTotal) || 0;
    const rate = parseFloat(taxRate) || 0;
    return total * (rate / 100);
  }

  /**
   * Calculate line total with tax included
   * @param {number} lineTotal - Total before tax
   * @param {number} taxRate - Tax rate percentage
   * @returns {number} Total including tax
   */
  static calculateLineTotalWithTax(lineTotal = 0, taxRate = 0) {
    const total = parseFloat(lineTotal) || 0;
    const tax = this.calculateLineTax(total, taxRate);
    return total + tax;
  }

  /**
   * Calculate invoice totals from line items
   * @param {Array} items - Array of line items with quantity, unit_price, item_tax_rate
   * @param {number} globalTaxRate - Global invoice tax rate
   * @returns {object} Object with subtotal, item_taxes, global_tax, and total
   */
  static calculateInvoiceTotals(items = [], globalTaxRate = 0) {
    // Calculate subtotal from line items
    const subtotal = items.reduce((sum, item) => {
      const lineTotal = this.calculateLineTotal(item.quantity, item.unit_price);
      return sum + lineTotal;
    }, 0);

    // Calculate per-item taxes
    const itemTaxes = items.reduce((sum, item) => {
      const lineTotal = this.calculateLineTotal(item.quantity, item.unit_price);
      const itemTax = this.calculateLineTax(lineTotal, item.item_tax_rate || 0);
      return sum + itemTax;
    }, 0);

    // Calculate global tax (applied to subtotal)
    const globalTax = this.calculateLineTax(subtotal, globalTaxRate);

    // Total tax is sum of item-specific and global taxes
    const totalTax = itemTaxes + globalTax;

    // Final total
    const total = subtotal + totalTax;

    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      item_taxes: parseFloat(itemTaxes.toFixed(2)),
      global_tax: parseFloat(globalTax.toFixed(2)),
      total_tax: parseFloat(totalTax.toFixed(2)),
      total: parseFloat(total.toFixed(2))
    };
  }

  /**
   * Format line item for display
   * @param {object} item - Line item object
   * @param {string} currency - Currency code (default: 'USD')
   * @returns {object} Formatted line item with display strings
   */
  static formatLineItem(item, currency = 'USD') {
    // currency parameter is reserved for future formatting implementation
    void currency;
    const quantity = parseFloat(item.quantity) || 0;
    const unitPrice = parseFloat(item.unit_price) || 0;
    const itemTaxRate = parseFloat(item.item_tax_rate) || 0;

    const lineTotal = this.calculateLineTotal(quantity, unitPrice);
    const lineTax = this.calculateLineTax(lineTotal, itemTaxRate);
    const lineTotalWithTax = lineTotal + lineTax;

    return {
      ...item,
      quantity,
      unitPrice,
      itemTaxRate,
      lineTotal: parseFloat(lineTotal.toFixed(2)),
      lineTax: parseFloat(lineTax.toFixed(2)),
      lineTotalWithTax: parseFloat(lineTotalWithTax.toFixed(2))
    };
  }

  /**
   * Validate line item
   * @param {object} item - Line item to validate
   * @returns {object} Validation result { isValid: boolean, errors: string[] }
   */
  static validateLineItem(item) {
    const errors = [];

    if (!item.service_name || item.service_name.trim() === '') {
      errors.push('Service name is required');
    }

    if (!item.quantity || parseFloat(item.quantity) <= 0) {
      errors.push('Quantity must be greater than 0');
    }

    if (!item.unit_price || parseFloat(item.unit_price) < 0) {
      errors.push('Unit price must be non-negative');
    }

    if (item.item_tax_rate && (parseFloat(item.item_tax_rate) < 0 || parseFloat(item.item_tax_rate) > 100)) {
      errors.push('Tax rate must be between 0 and 100');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Calculate discount amount
   * @param {number} subtotal - Subtotal amount
   * @param {string} discountType - Type of discount ('fixed' or 'percentage')
   * @param {number} discountValue - Discount value
   * @returns {number} Discount amount
   */
  static calculateDiscount(subtotal = 0, discountType = 'fixed', discountValue = 0) {
    const total = parseFloat(subtotal) || 0;
    const value = parseFloat(discountValue) || 0;

    if (value <= 0) return 0;

    if (discountType === 'percentage') {
      return total * (value / 100);
    }

    return Math.min(value, total); // Prevent discount from being greater than subtotal
  }

  /**
   * Calculate invoice totals with discount support
   * @param {Array} items - Array of line items
   * @param {number} globalTaxRate - Global invoice tax rate
   * @param {string} discountType - Type of discount ('fixed' or 'percentage')
   * @param {number} discountValue - Discount value
   * @returns {object} Complete invoice totals including discount
   */
  static calculateInvoiceTotalsWithDiscount(items = [], globalTaxRate = 0, discountType = 'fixed', discountValue = 0) {
    // Calculate subtotal from line items
    const subtotal = items.reduce((sum, item) => {
      const lineTotal = this.calculateLineTotal(item.quantity, item.unit_price);
      return sum + lineTotal;
    }, 0);

    // Calculate discount
    const discountAmount = this.calculateDiscount(subtotal, discountType, discountValue);

    // Subtotal after discount
    const subtotalAfterDiscount = subtotal - discountAmount;

    // Calculate per-item taxes
    const itemTaxes = items.reduce((sum, item) => {
      const lineTotal = this.calculateLineTotal(item.quantity, item.unit_price);
      const itemTax = this.calculateLineTax(lineTotal, item.item_tax_rate || 0);
      return sum + itemTax;
    }, 0);

    // Calculate global tax (applied to subtotal after discount)
    const globalTax = this.calculateLineTax(subtotalAfterDiscount, globalTaxRate);

    // Total tax is sum of item-specific and global taxes
    const totalTax = itemTaxes + globalTax;

    // Final total
    const total = subtotalAfterDiscount + totalTax;

    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      discount_amount: parseFloat(discountAmount.toFixed(2)),
      subtotal_after_discount: parseFloat(subtotalAfterDiscount.toFixed(2)),
      item_taxes: parseFloat(itemTaxes.toFixed(2)),
      global_tax: parseFloat(globalTax.toFixed(2)),
      total_tax: parseFloat(totalTax.toFixed(2)),
      total: parseFloat(total.toFixed(2))
    };
  }

  /**
   * Create a new empty line item template
   * @returns {object} Empty line item object
   */
  static createEmptyLineItem() {
    return {
      id: `item_${Date.now()}`,
      service_name: '',
      description: '',
      quantity: 0,
      unit_price: 0,
      item_tax_rate: 0,
      total_price: 0,
      item_tax_amount: 0,
      item_type: 'service',
      unit_type: 'unit'
    };
  }
}

export default LineItemCalculator;
