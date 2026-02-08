/**
 * Currency Management API Integration
 * Handles API calls for currency preferences and settings
 */

import { breakApi } from './apiClient';

/**
 * Get user's preferred currency
 * @returns {Promise} Currency preference data
 */
export const getUserCurrency = async () => {
  try {
    const response = await breakApi.get('/api/user/currency');
    return response.data || { currency: 'ZAR' };
  } catch (error) {
    console.error('Error fetching user currency:', error);
    return { currency: 'ZAR' };
  }
};

/**
 * Set user's preferred currency
 * @param {string} currencyCode - Currency code (e.g., 'ZAR', 'USD')
 * @returns {Promise} Updated currency preference
 */
export const setUserCurrency = async (currencyCode) => {
  try {
    const response = await breakApi.put('/api/user/currency', {
      currency: currencyCode,
    });
    return response.data;
  } catch (error) {
    console.error('Error setting user currency:', error);
    throw error;
  }
};

/**
 * Get business currency settings
 * @param {string} businessId - Business ID
 * @returns {Promise} Business currency settings
 */
export const getBusinessCurrency = async (businessId) => {
  try {
    const response = await breakApi.get(`/api/business/${businessId}/currency`);
    return response.data || { currency: 'ZAR', allowMultipleCurrencies: false };
  } catch (error) {
    console.error('Error fetching business currency:', error);
    return { currency: 'ZAR', allowMultipleCurrencies: false };
  }
};

/**
 * Set business currency settings
 * @param {string} businessId - Business ID
 * @param {object} settings - Currency settings
 * @returns {Promise} Updated settings
 */
export const setBusinessCurrency = async (businessId, settings) => {
  try {
    const response = await breakApi.put(
      `/api/business/${businessId}/currency`,
      settings
    );
    return response.data;
  } catch (error) {
    console.error('Error setting business currency:', error);
    throw error;
  }
};

/**
 * Get exchange rates
 * @param {string} baseCurrency - Base currency code
 * @returns {Promise} Exchange rates object
 */
export const getExchangeRates = async (baseCurrency = 'ZAR') => {
  try {
    const response = await breakApi.get('/api/exchange-rates', {
      params: { base: baseCurrency },
    });
    return response.data || {};
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    return {};
  }
};

/**
 * Get historical exchange rates
 * @param {string} baseCurrency - Base currency code
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise} Historical exchange rates
 */
export const getHistoricalExchangeRates = async (
  baseCurrency = 'ZAR',
  date
) => {
  try {
    const response = await breakApi.get(
      '/api/exchange-rates/historical',
      {
        params: { base: baseCurrency, date },
      }
    );
    return response.data || {};
  } catch (error) {
    console.error('Error fetching historical exchange rates:', error);
    return {};
  }
};

/**
 * Convert currency using API
 * @param {number} amount - Amount to convert
 * @param {string} fromCurrency - Source currency code
 * @param {string} toCurrency - Target currency code
 * @returns {Promise} Converted amount
 */
export const convertCurrencyAPI = async (
  amount,
  fromCurrency = 'ZAR',
  toCurrency = 'ZAR'
) => {
  try {
    const response = await breakApi.get('/api/currency/convert', {
      params: { amount, from: fromCurrency, to: toCurrency },
    });
    return response.data?.convertedAmount || amount;
  } catch (error) {
    console.error('Error converting currency:', error);
    return amount;
  }
};

/**
 * Get all supported currencies from API
 * @returns {Promise} Array of supported currencies
 */
export const getSupportedCurrencies = async () => {
  try {
    const response = await breakApi.get('/api/currencies');
    return response.data || [];
  } catch (error) {
    console.error('Error fetching supported currencies:', error);
    return [];
  }
};

/**
 * Save invoice currency
 * @param {string} invoiceId - Invoice ID
 * @param {string} currencyCode - Currency code
 * @returns {Promise} Updated invoice
 */
export const saveInvoiceCurrency = async (invoiceId, currencyCode) => {
  try {
    const response = await breakApi.put(`/api/invoices/${invoiceId}`, {
      currency: currencyCode,
    });
    return response.data;
  } catch (error) {
    console.error('Error saving invoice currency:', error);
    throw error;
  }
};

/**
 * Get invoice currency history
 * @param {string} invoiceId - Invoice ID
 * @returns {Promise} Currency history for invoice
 */
export const getInvoiceCurrencyHistory = async (invoiceId) => {
  try {
    const response = await breakApi.get(
      `/api/invoices/${invoiceId}/currency-history`
    );
    return response.data || [];
  } catch (error) {
    console.error('Error fetching invoice currency history:', error);
    return [];
  }
};

/**
 * Get currency conversion rates for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise} Exchange rates for the date
 */
export const getCurrencyRatesForDate = async (date) => {
  try {
    const response = await breakApi.get(`/api/exchange-rates/${date}`);
    return response.data || {};
  } catch (error) {
    console.error('Error fetching currency rates for date:', error);
    return {};
  }
};

export default {
  getUserCurrency,
  setUserCurrency,
  getBusinessCurrency,
  setBusinessCurrency,
  getExchangeRates,
  getHistoricalExchangeRates,
  convertCurrencyAPI,
  getSupportedCurrencies,
  saveInvoiceCurrency,
  getInvoiceCurrencyHistory,
  getCurrencyRatesForDate,
};
