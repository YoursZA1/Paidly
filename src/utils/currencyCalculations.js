/**
 * Currency Formatting and Conversion Utilities
 * Handles formatting, conversion, and currency-related calculations
 */

import { getCurrencyByCode } from '../data/currencies.js';

/**
 * Format a number as currency
 * @param {number} amount - Amount to format
 * @param {string} currencyCode - Currency code (default: ZAR)
 * @param {object} options - Formatting options
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (
  amount,
  currencyCode = 'ZAR',
  options = {}
) => {
  const currency = getCurrencyByCode(currencyCode);
  const {
    includeSymbol = true,
    decimals = currency.decimals,
    showDecimals = true,
  } = options;

  // Handle null/undefined values
  if (amount === null || amount === undefined) {
    amount = 0;
  }

  // Parse amount as number
  const num = parseFloat(amount);

  if (isNaN(num)) {
    return `${currency.symbol} 0${'.' + '0'.repeat(decimals)}`;
  }

  // Format with proper decimal places
  let formatted = num.toFixed(decimals);

  // Split into integer and decimal parts
  const [integerPart, decimalPart] = formatted.split('.');

  // Apply thousands separator to integer part
  const formattedInteger = integerPart.replace(
    /\B(?=(\d{3})+(?!\d))/g,
    currency.thousandsSeparator
  );

  // Combine with decimal part
  let result = formattedInteger;
  if (showDecimals && decimals > 0) {
    result += currency.decimalSeparator + decimalPart;
  }

  // Add symbol
  if (includeSymbol) {
    if (currency.symbolPosition === 'prefix') {
      result = `${currency.symbol} ${result}`;
    } else {
      result = `${result} ${currency.symbol}`;
    }
  }

  return result;
};

/**
 * Format currency without symbol
 * @param {number} amount - Amount to format
 * @param {string} currencyCode - Currency code
 * @returns {string} Formatted number without currency symbol
 */
export const formatCurrencyAmount = (amount, currencyCode = 'ZAR') => {
  return formatCurrency(amount, currencyCode, { includeSymbol: false });
};

/**
 * Parse currency string to number
 * @param {string} currencyString - Currency formatted string
 * @param {string} currencyCode - Currency code
 * @returns {number} Parsed numeric value
 */
export const parseCurrency = (currencyString, currencyCode = 'ZAR') => {
  if (!currencyString) return 0;

  const currency = getCurrencyByCode(currencyCode);

  // Remove currency symbol
  let cleaned = currencyString.replace(currency.symbol, '').trim();

  // Replace thousands separator with empty string
  cleaned = cleaned.replace(new RegExp(currency.thousandsSeparator, 'g'), '');

  // Replace decimal separator with dot
  if (currency.decimalSeparator !== '.') {
    cleaned = cleaned.replace(currency.decimalSeparator, '.');
  }

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

/**
 * Get currency symbol
 * @param {string} currencyCode - Currency code
 * @returns {string} Currency symbol
 */
export const getCurrencySymbol = (currencyCode = 'ZAR') => {
  const currency = getCurrencyByCode(currencyCode);
  return currency.symbol;
};

/**
 * Get currency name
 * @param {string} currencyCode - Currency code
 * @returns {string} Currency name
 */
export const getCurrencyName = (currencyCode = 'ZAR') => {
  const currency = getCurrencyByCode(currencyCode);
  return currency.name;
};

/**
 * Convert amount from one currency to another
 * Note: This requires exchange rates - implement with API integration
 * @param {number} amount - Amount to convert
 * @param {string} fromCurrency - Source currency code
 * @param {string} toCurrency - Target currency code
 * @param {object} exchangeRates - Exchange rates object
 * @returns {number} Converted amount
 */
export const convertCurrency = (
  amount,
  fromCurrency = 'ZAR',
  toCurrency = 'ZAR',
  exchangeRates = {}
) => {
  // If currencies are the same, return amount unchanged
  if (fromCurrency === toCurrency) {
    return amount;
  }

  // Check if exchange rate exists
  const rateKey = `${fromCurrency}_${toCurrency}`;
  if (!exchangeRates[rateKey]) {
    console.warn(
      `Exchange rate not found for ${fromCurrency} to ${toCurrency}`
    );
    return amount;
  }

  const rate = exchangeRates[rateKey];
  return parseFloat((amount * rate).toFixed(2));
};

/**
 * Calculate percentage of currency amount
 * @param {number} amount - Base amount
 * @param {number} percentage - Percentage value (0-100)
 * @param {string} currencyCode - Currency code
 * @returns {string} Formatted percentage amount
 */
export const calculatePercentageAmount = (
  amount,
  percentage,
  currencyCode = 'ZAR'
) => {
  const result = (parseFloat(amount) * parseFloat(percentage)) / 100;
  return formatCurrency(result, currencyCode);
};

/**
 * Add multiple currency amounts
 * @param {array} amounts - Array of amounts to add
 * @param {string} currencyCode - Currency code
 * @returns {number} Sum of amounts
 */
export const sumCurrencyAmounts = (amounts = [], currencyCode = 'ZAR') => {
  // currencyCode is reserved for future currency-specific calculations
  void currencyCode;
  return amounts.reduce((sum, amount) => {
    return sum + parseFloat(amount || 0);
  }, 0);
};

/**
 * Format currency range (min - max)
 * @param {number} minAmount - Minimum amount
 * @param {number} maxAmount - Maximum amount
 * @param {string} currencyCode - Currency code
 * @returns {string} Formatted currency range
 */
export const formatCurrencyRange = (
  minAmount,
  maxAmount,
  currencyCode = 'ZAR'
) => {
  const currency = getCurrencyByCode(currencyCode);
  const minFormatted = formatCurrencyAmount(minAmount, currencyCode);
  const maxFormatted = formatCurrencyAmount(maxAmount, currencyCode);

  if (currency.symbolPosition === 'prefix') {
    return `${currency.symbol} ${minFormatted} - ${maxFormatted}`;
  } else {
    return `${minFormatted} - ${maxFormatted} ${currency.symbol}`;
  }
};

/**
 * Check if currency supports decimals
 * @param {string} currencyCode - Currency code
 * @returns {boolean} Whether currency supports decimals
 */
export const currencySupportsDecimals = (currencyCode = 'ZAR') => {
  const currency = getCurrencyByCode(currencyCode);
  return currency.decimals > 0;
};

/**
 * Get decimal places for currency
 * @param {string} currencyCode - Currency code
 * @returns {number} Number of decimal places
 */
export const getCurrencyDecimalPlaces = (currencyCode = 'ZAR') => {
  const currency = getCurrencyByCode(currencyCode);
  return currency.decimals;
};

/**
 * Round amount to currency precision
 * @param {number} amount - Amount to round
 * @param {string} currencyCode - Currency code
 * @returns {number} Rounded amount
 */
export const roundToCurrencyPrecision = (amount, currencyCode = 'ZAR') => {
  const currency = getCurrencyByCode(currencyCode);
  const factor = Math.pow(10, currency.decimals);
  return Math.round(parseFloat(amount) * factor) / factor;
};

/**
 * Format currency for display in table/list
 * @param {number} amount - Amount to format
 * @param {string} currencyCode - Currency code
 * @returns {string} Compact formatted currency
 */
export const formatCurrencyCompact = (amount, currencyCode = 'ZAR') => {
  const num = parseFloat(amount);

  if (isNaN(num)) return getCurrencySymbol(currencyCode) + ' 0';

  let displayNum = num;
  let suffix = '';

  if (Math.abs(num) >= 1000000) {
    displayNum = (num / 1000000).toFixed(1);
    suffix = 'M';
  } else if (Math.abs(num) >= 1000) {
    displayNum = (num / 1000).toFixed(1);
    suffix = 'K';
  }

  return formatCurrency(displayNum, currencyCode) + suffix;
};

/**
 * Validate currency amount
 * @param {number|string} amount - Amount to validate
 * @returns {object} Validation result
 */
export const validateCurrencyAmount = (amount) => {
  const parsed = parseFloat(amount);

  if (isNaN(parsed)) {
    return {
      valid: false,
      error: 'Invalid currency amount',
    };
  }

  if (parsed < 0) {
    return {
      valid: false,
      error: 'Amount cannot be negative',
    };
  }

  return {
    valid: true,
    amount: parsed,
  };
};

/**
 * Get currency info as object
 * @param {string} currencyCode - Currency code
 * @returns {object} Complete currency information
 */
export const getCurrencyInfo = (currencyCode = 'ZAR') => {
  return getCurrencyByCode(currencyCode);
};

export default {
  formatCurrency,
  formatCurrencyAmount,
  parseCurrency,
  getCurrencySymbol,
  getCurrencyName,
  convertCurrency,
  calculatePercentageAmount,
  sumCurrencyAmounts,
  formatCurrencyRange,
  currencySupportsDecimals,
  getCurrencyDecimalPlaces,
  roundToCurrencyPrecision,
  formatCurrencyCompact,
  validateCurrencyAmount,
  getCurrencyInfo,
};
