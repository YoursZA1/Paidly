import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getAllCurrencies,
  getCurrencyByCode,
  COMMON_CURRENCIES,
} from '@/data/currencies';
import { getUserCurrency, setUserCurrency } from '@/api/currencyProfiles';

/**
 * CurrencySelector Component
 * Provides currency selection dropdown with search and common currencies
 */
export default function CurrencySelector({
  value = 'ZAR',
  onChange = () => {},
  onBusinessChange = null,
  businessId = null,
  showCommonOnly = false,
  label = 'Currency',
  className = '',
  disabled = false,
}) {
  const [selectedCurrency, setSelectedCurrency] = useState(value);
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load user's preferred currency
    const loadUserCurrency = async () => {
      try {
        const pref = await getUserCurrency();
        if (pref?.currency) {
          setSelectedCurrency(pref.currency);
        }
      } catch (error) {
        console.error('Error loading user currency:', error);
      }
    };

    loadUserCurrency();

    // Set currency list
    const currencyList = showCommonOnly ? COMMON_CURRENCIES : getAllCurrencies();
    setCurrencies(currencyList.sort((a, b) => a.code.localeCompare(b.code)));
  }, [showCommonOnly]);

  const handleCurrencyChange = async (currencyCode) => {
    setSelectedCurrency(currencyCode);
    setLoading(true);

    try {
      // Update user preference
      await setUserCurrency(currencyCode);

      // Notify parent component
      onChange(currencyCode);

      // Update business currency if provided
      if (onBusinessChange && businessId) {
        onBusinessChange(currencyCode);
      }
    } catch (error) {
      console.error('Error updating currency:', error);
    } finally {
      setLoading(false);
    }
  };

  const currentCurrency = getCurrencyByCode(selectedCurrency);

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      
      <Select value={selectedCurrency} onValueChange={handleCurrencyChange} disabled={disabled || loading}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select currency" />
        </SelectTrigger>
        <SelectContent>
          {currencies.map((currency) => (
            <SelectItem key={currency.code} value={currency.code}>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{currency.symbol}</span>
                <span className="text-gray-700">{currency.code}</span>
                <span className="text-xs text-gray-500">{currency.name}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {currentCurrency && (
        <div className="text-xs text-gray-500 mt-1">
          <div className="flex justify-between">
            <span>{currentCurrency.name}</span>
            <span>{currentCurrency.region}</span>
          </div>
        </div>
      )}
    </div>
  );
}

CurrencySelector.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func,
  onBusinessChange: PropTypes.func,
  businessId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  showCommonOnly: PropTypes.bool,
  label: PropTypes.string,
  className: PropTypes.string,
  disabled: PropTypes.bool,
};
