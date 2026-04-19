/**
 * Currency Management API Integration
 * User currency is stored in Supabase profiles (breakApi.auth); optional backend for business/exchange rates.
 */

import { breakApi } from './apiClient';
import { backendApi } from './backendClient';

// If exchange-rate routes are not deployed on this environment, stop retrying every page/view.
let exchangeRatesApiUnavailable = false;

/**
 * Get user's preferred currency from auth profile (Supabase profiles table).
 * @returns {Promise<{ currency: string }>} Currency preference data
 */
export const getUserCurrency = async () => {
  try {
    const user = await breakApi.auth.me();
    return { currency: user?.currency || 'ZAR' };
  } catch (error) {
    console.error('Error fetching user currency:', error);
    return { currency: 'ZAR' };
  }
};

/**
 * Set user's preferred currency via auth profile (Supabase profiles table).
 * @param {string} currencyCode - Currency code (e.g., 'ZAR', 'USD')
 * @returns {Promise} Updated currency preference
 */
export const setUserCurrency = async (currencyCode) => {
  try {
    await breakApi.auth.updateMyUserData({ currency: currencyCode });
    return { currency: currencyCode };
  } catch (error) {
    console.error('Error setting user currency:', error);
    throw error;
  }
};

/**
 * Get business currency settings (optional backend). Falls back to user default.
 * @param {string} businessId - Business ID
 * @returns {Promise} Business currency settings
 */
export const getBusinessCurrency = async (businessId) => {
  try {
    if (typeof backendApi.get === 'function') {
      const response = await backendApi.get(`/api/business/${businessId}/currency`, {
        __paidlySilent: true,
      });
      return response.data || { currency: 'ZAR', allowMultipleCurrencies: false };
    }
  } catch (error) {
    console.error('Error fetching business currency:', error);
  }
  return { currency: 'ZAR', allowMultipleCurrencies: false };
};

/**
 * Set business currency settings (optional backend).
 * @param {string} businessId - Business ID
 * @param {object} settings - Currency settings
 * @returns {Promise} Updated settings
 */
export const setBusinessCurrency = async (businessId, settings) => {
  try {
    if (typeof backendApi.put === 'function') {
      const response = await backendApi.put(
        `/api/business/${businessId}/currency`,
        settings,
        { __paidlySilent: true }
      );
      return response.data;
    }
  } catch (error) {
    console.error('Error setting business currency:', error);
    throw error;
  }
  return settings;
};

/**
 * Get exchange rates (optional backend). Fails fast when backend is down (e.g. dev server not running).
 * @param {string} baseCurrency - Base currency code
 * @returns {Promise} Exchange rates object
 */
export const getExchangeRates = async (baseCurrency = 'ZAR') => {
  if (exchangeRatesApiUnavailable) return {};
  try {
    if (typeof backendApi.get === 'function') {
      const response = await backendApi.get('/api/exchange-rates', {
        params: { base: baseCurrency },
        timeout: 5000,
        __paidlySilent: true,
      });
      return response.data || {};
    }
  } catch (error) {
    const status = Number(error?.response?.status || 0);
    if (status === 404 || status === 405 || status === 501) {
      exchangeRatesApiUnavailable = true;
    }
    if (import.meta.env?.DEV) {
      console.warn('Exchange rates unavailable (backend may be down). Using empty rates.', error?.code || error?.message);
    }
  }
  return {};
};

/**
 * Get historical exchange rates (optional backend).
 * @param {string} baseCurrency - Base currency code
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise} Historical exchange rates
 */
export const getHistoricalExchangeRates = async (
  baseCurrency = 'ZAR',
  date
) => {
  if (exchangeRatesApiUnavailable) return {};
  try {
    if (typeof backendApi.get === 'function') {
      const response = await backendApi.get(
        '/api/exchange-rates/historical',
        { params: { base: baseCurrency, date }, timeout: 5000, __paidlySilent: true }
      );
      return response.data || {};
    }
  } catch (error) {
    const status = Number(error?.response?.status || 0);
    if (status === 404 || status === 405 || status === 501) {
      exchangeRatesApiUnavailable = true;
    }
    if (import.meta.env?.DEV) {
      console.warn('Historical exchange rates unavailable.', error?.response?.status || error?.message);
    }
  }
  return {};
};

/**
 * Convert currency using API (optional backend).
 * @param {number} amount - Amount to convert
 * @param {string} fromCurrency - Source currency code
 * @param {string} toCurrency - Target currency code
 * @returns {Promise<number>} Converted amount
 */
export const convertCurrencyAPI = async (
  amount,
  fromCurrency = 'ZAR',
  toCurrency = 'ZAR'
) => {
  try {
    if (typeof backendApi.get === 'function') {
      const response = await backendApi.get('/api/currency/convert', {
        params: { amount, from: fromCurrency, to: toCurrency },
        __paidlySilent: true,
      });
      return response.data?.convertedAmount ?? amount;
    }
  } catch (error) {
    console.error('Error converting currency:', error);
  }
  return amount;
};

/**
 * Get all supported currencies (optional backend). Returns in-memory list if no backend.
 * @returns {Promise} Array of supported currencies
 */
export const getSupportedCurrencies = async () => {
  try {
    if (typeof backendApi.get === 'function') {
      const response = await backendApi.get('/api/currencies', { __paidlySilent: true });
      return response.data || [];
    }
  } catch (error) {
    console.error('Error fetching supported currencies:', error);
  }
  return [];
};

/**
 * Save invoice currency (updates invoice via entities, not REST).
 * @param {string} invoiceId - Invoice ID
 * @param {string} currencyCode - Currency code
 * @returns {Promise} Updated invoice
 */
export const saveInvoiceCurrency = async (invoiceId, currencyCode) => {
  try {
    await breakApi.entities.Invoice.update(invoiceId, { currency: currencyCode });
    return { currency: currencyCode };
  } catch (error) {
    console.error('Error saving invoice currency:', error);
    throw error;
  }
};

/**
 * Get invoice currency history (optional backend).
 * @param {string} invoiceId - Invoice ID
 * @returns {Promise} Currency history for invoice
 */
export const getInvoiceCurrencyHistory = async (invoiceId) => {
  try {
    if (typeof backendApi.get === 'function') {
      const response = await backendApi.get(`/api/invoices/${invoiceId}/currency-history`, {
        __paidlySilent: true,
      });
      return response.data || [];
    }
  } catch (error) {
    console.error('Error fetching invoice currency history:', error);
  }
  return [];
};

/**
 * Get currency conversion rates for a specific date (optional backend).
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise} Exchange rates for the date
 */
export const getCurrencyRatesForDate = async (date) => {
  if (exchangeRatesApiUnavailable) return {};
  try {
    if (typeof backendApi.get === 'function') {
      const response = await backendApi.get(`/api/exchange-rates/${date}`, {
        __paidlySilent: true,
      });
      return response.data || {};
    }
  } catch (error) {
    const status = Number(error?.response?.status || 0);
    if (status === 404 || status === 405 || status === 501) {
      exchangeRatesApiUnavailable = true;
    }
    console.error('Error fetching currency rates for date:', error);
  }
  return {};
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
