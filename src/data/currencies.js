/**
 * Global Currency Profiles and Configuration
 * Provides standard currency definitions with symbols, codes, and formatting rules
 */

export const CURRENCIES = {
  ZAR: {
    code: 'ZAR',
    name: 'South African Rand',
    symbol: 'R',
    symbolPosition: 'prefix',
    decimals: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
    region: 'South Africa',
    isDefault: true,
  },
  USD: {
    code: 'USD',
    name: 'United States Dollar',
    symbol: '$',
    symbolPosition: 'prefix',
    decimals: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
    region: 'United States',
    isDefault: false,
  },
  EUR: {
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    symbolPosition: 'suffix',
    decimals: 2,
    thousandsSeparator: '.',
    decimalSeparator: ',',
    region: 'European Union',
    isDefault: false,
  },
  GBP: {
    code: 'GBP',
    name: 'British Pound',
    symbol: '£',
    symbolPosition: 'prefix',
    decimals: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
    region: 'United Kingdom',
    isDefault: false,
  },
  AUD: {
    code: 'AUD',
    name: 'Australian Dollar',
    symbol: 'A$',
    symbolPosition: 'prefix',
    decimals: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
    region: 'Australia',
    isDefault: false,
  },
  CAD: {
    code: 'CAD',
    name: 'Canadian Dollar',
    symbol: 'C$',
    symbolPosition: 'prefix',
    decimals: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
    region: 'Canada',
    isDefault: false,
  },
  CHF: {
    code: 'CHF',
    name: 'Swiss Franc',
    symbol: 'CHF',
    symbolPosition: 'suffix',
    decimals: 2,
    thousandsSeparator: "'",
    decimalSeparator: '.',
    region: 'Switzerland',
    isDefault: false,
  },
  JPY: {
    code: 'JPY',
    name: 'Japanese Yen',
    symbol: '¥',
    symbolPosition: 'prefix',
    decimals: 0,
    thousandsSeparator: ',',
    decimalSeparator: '.',
    region: 'Japan',
    isDefault: false,
  },
  CNY: {
    code: 'CNY',
    name: 'Chinese Yuan',
    symbol: '¥',
    symbolPosition: 'prefix',
    decimals: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
    region: 'China',
    isDefault: false,
  },
  INR: {
    code: 'INR',
    name: 'Indian Rupee',
    symbol: '₹',
    symbolPosition: 'prefix',
    decimals: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
    region: 'India',
    isDefault: false,
  },
  NGN: {
    code: 'NGN',
    name: 'Nigerian Naira',
    symbol: '₦',
    symbolPosition: 'prefix',
    decimals: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
    region: 'Nigeria',
    isDefault: false,
  },
  KES: {
    code: 'KES',
    name: 'Kenyan Shilling',
    symbol: 'KSh',
    symbolPosition: 'prefix',
    decimals: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
    region: 'Kenya',
    isDefault: false,
  },
  MXN: {
    code: 'MXN',
    name: 'Mexican Peso',
    symbol: '$',
    symbolPosition: 'prefix',
    decimals: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
    region: 'Mexico',
    isDefault: false,
  },
  BRL: {
    code: 'BRL',
    name: 'Brazilian Real',
    symbol: 'R$',
    symbolPosition: 'prefix',
    decimals: 2,
    thousandsSeparator: '.',
    decimalSeparator: ',',
    region: 'Brazil',
    isDefault: false,
  },
  AED: {
    code: 'AED',
    name: 'United Arab Emirates Dirham',
    symbol: 'د.إ',
    symbolPosition: 'suffix',
    decimals: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
    region: 'United Arab Emirates',
    isDefault: false,
  },
};

/**
 * Get currency by code
 * @param {string} code - Currency code (e.g., 'ZAR', 'USD')
 * @returns {object} Currency configuration
 */
export const getCurrencyByCode = (code) => {
  return CURRENCIES[code] || CURRENCIES.ZAR;
};

/**
 * Get default currency
 * @returns {object} Default currency (ZAR)
 */
export const getDefaultCurrency = () => {
  return CURRENCIES.ZAR;
};

/**
 * Get all currency codes
 * @returns {array} Array of all currency codes
 */
export const getAllCurrencyCodes = () => {
  return Object.keys(CURRENCIES);
};

/**
 * Get all currencies as array for lists
 * @returns {array} Array of currency objects
 */
export const getAllCurrencies = () => {
  return Object.values(CURRENCIES);
};

/**
 * Get currencies grouped by region
 * @returns {object} Currencies grouped by region
 */
export const getCurrenciesByRegion = () => {
  const grouped = {};
  Object.values(CURRENCIES).forEach((currency) => {
    if (!grouped[currency.region]) {
      grouped[currency.region] = [];
    }
    grouped[currency.region].push(currency);
  });
  return grouped;
};

/**
 * Search currencies by name or code
 * @param {string} query - Search query
 * @returns {array} Matching currencies
 */
export const searchCurrencies = (query) => {
  const lower = query.toLowerCase();
  return Object.values(CURRENCIES).filter(
    (currency) =>
      currency.code.toLowerCase().includes(lower) ||
      currency.name.toLowerCase().includes(lower)
  );
};

/**
 * Common currency shortcuts
 */
export const COMMON_CURRENCIES = [
  CURRENCIES.ZAR,
  CURRENCIES.USD,
  CURRENCIES.EUR,
  CURRENCIES.GBP,
  CURRENCIES.AUD,
];

/**
 * African currencies
 */
export const AFRICAN_CURRENCIES = [
  CURRENCIES.ZAR,
  CURRENCIES.NGN,
  CURRENCIES.KES,
];

export default CURRENCIES;
