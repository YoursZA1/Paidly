/**
 * Invoice Number Generator Service
 * Handles generation of unique, formatted invoice numbers
 */

export class InvoiceNumberGenerator {
  /**
   * Generate an invoice number with the format: INV-YYYYMMDD-INITIALS-HHMMSS
   * This ensures uniqueness while being human-readable
   * 
   * @param {string} clientName - Client name to extract initials from
   * @param {Date} dateTime - Optional date/time for the invoice (defaults to now)
   * @returns {string} Formatted invoice number
   */
  static generateInvoiceNumber(clientName, dateTime = new Date()) {
    // Extract client initials
    const clientInitials = this.getClientInitials(clientName);
    
    // Format date part (YYYYMMDD)
    const datePart = this.formatDatePart(dateTime);
    
    // Format time part (HHMMSS)
    const timePart = this.formatTimePart(dateTime);
    
    return `INV-${datePart}-${clientInitials}-${timePart}`;
  }

  /**
   * Generate invoice number with sequential numbering
   * Format: INV-YYYYMMDD-001, INV-YYYYMMDD-002, etc.
   * Useful for numbered invoices within a single day
   * 
   * @param {number} sequenceNumber - Sequential number for the day
   * @param {Date} dateTime - Optional date for the invoice
   * @returns {string} Sequential invoice number
   */
  static generateSequentialInvoiceNumber(sequenceNumber = 1, dateTime = new Date()) {
    const datePart = this.formatDatePart(dateTime);
    const sequence = String(sequenceNumber).padStart(3, '0');
    return `INV-${datePart}-${sequence}`;
  }

  /**
   * Generate invoice number with custom prefix
   * 
   * @param {string} prefix - Custom prefix (e.g., "INV", "QUOTE", "EST")
   * @param {string} clientName - Client name for initials
   * @param {Date} dateTime - Optional date/time
   * @returns {string} Custom prefixed invoice number
   */
  static generateCustomPrefixInvoiceNumber(prefix = 'INV', clientName, dateTime = new Date()) {
    const clientInitials = this.getClientInitials(clientName);
    const datePart = this.formatDatePart(dateTime);
    const timePart = this.formatTimePart(dateTime);
    
    return `${prefix}-${datePart}-${clientInitials}-${timePart}`;
  }

  /**
   * Get client initials from name
   * 
   * @param {string} name - Client name
   * @returns {string} Two-letter initials
   */
  static getClientInitials(name = '') {
    if (!name || typeof name !== 'string') return 'CL';
    
    const parts = name.trim().split(/\s+/);
    
    if (parts.length > 1) {
      // Use first letter of first name and first letter of last name
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    
    // Use first two letters for single-word names
    return name.substring(0, 2).toUpperCase();
  }

  /**
   * Format date part as YYYYMMDD
   * 
   * @param {Date} date - Date to format
   * @returns {string} Formatted date string
   */
  static formatDatePart(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Format time part as HHMMSS
   * 
   * @param {Date} date - Date to format
   * @returns {string} Formatted time string
   */
  static formatTimePart(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}${minutes}${seconds}`;
  }

  /**
   * Parse an existing invoice number to extract components
   * 
   * @param {string} invoiceNumber - Invoice number to parse
   * @returns {object} Parsed components
   */
  static parseInvoiceNumber(invoiceNumber) {
    const regex = /^INV-(\d{8})-([A-Z]{2})-(\d{6})$/;
    const match = invoiceNumber.match(regex);
    
    if (!match) {
      return null;
    }

    const [, dateStr, initials, timeStr] = match;
    
    return {
      invoiceNumber,
      prefix: 'INV',
      date: dateStr,
      clientInitials: initials,
      time: timeStr,
      dateObject: new Date(
        parseInt(dateStr.substring(0, 4)),
        parseInt(dateStr.substring(4, 6)) - 1,
        parseInt(dateStr.substring(6, 8))
      )
    };
  }

  /**
   * Validate invoice number format
   * 
   * @param {string} invoiceNumber - Invoice number to validate
   * @returns {boolean} True if valid format
   */
  static isValidInvoiceNumber(invoiceNumber) {
    const regex = /^INV-\d{8}-[A-Z]{2}-\d{6}$/;
    return regex.test(invoiceNumber);
  }

  /**
   * Generate multiple invoice numbers (for batch creation)
   * 
   * @param {string} clientName - Client name
   * @param {number} count - Number of invoice numbers to generate
   * @returns {string[]} Array of invoice numbers
   */
  static generateMultipleInvoiceNumbers(clientName, count = 1) {
    const invoiceNumbers = [];
    
    for (let i = 0; i < count; i++) {
      const now = new Date();
      // Add millisecond offset to ensure uniqueness
      const offsetDate = new Date(now.getTime() + i * 1000);
      invoiceNumbers.push(this.generateInvoiceNumber(clientName, offsetDate));
    }
    
    return invoiceNumbers;
  }
}

export default InvoiceNumberGenerator;
