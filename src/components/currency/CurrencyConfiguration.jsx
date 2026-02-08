import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getAllCurrencies,
  getCurrencyByCode,
  COMMON_CURRENCIES,
} from '@/data/currencies';
import { formatCurrency } from '@/utils/currencyCalculations';
import {
  getUserCurrency,
  setUserCurrency,
  getExchangeRates,
} from '@/api/currencyProfiles';
import CurrencySelector from './CurrencySelector';

/**
 * CurrencyConfiguration Component
 * Manages currency settings and preferences
 */
export default function CurrencyConfiguration() {
  const [selectedCurrency, setSelectedCurrency] = useState('ZAR');
  const [allCurrencies, setAllCurrencies] = useState([]);
  const [exchangeRates, setExchangeRates] = useState({});
  const [loading, setLoading] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [viewMode, setViewMode] = useState('common'); // 'common' or 'all'

  useEffect(() => {
    loadCurrencyData();
  }, []);

  const loadCurrencyData = async () => {
    try {
      setLoading(true);

      // Load user's preferred currency
      const userPref = await getUserCurrency();
      if (userPref?.currency) {
        setSelectedCurrency(userPref.currency);
      }

      // Load exchange rates
      const rates = await getExchangeRates('ZAR');
      setExchangeRates(rates);

      // Load all currencies
      const currencies = getAllCurrencies();
      setAllCurrencies(currencies);
    } catch (error) {
      console.error('Error loading currency data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCurrencyChange = async (currencyCode) => {
    try {
      setLoading(true);
      await setUserCurrency(currencyCode);
      setSelectedCurrency(currencyCode);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error updating currency:', error);
    } finally {
      setLoading(false);
    }
  };

  const currentCurrency = getCurrencyByCode(selectedCurrency);
  const currenciesToDisplay =
    viewMode === 'common' ? COMMON_CURRENCIES : allCurrencies;

  return (
    <div className="space-y-6">
      {/* Current Currency Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Primary Currency</CardTitle>
          <CardDescription>
            Set your default currency for invoices and financial reports
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <CurrencySelector
              value={selectedCurrency}
              onChange={handleCurrencyChange}
              disabled={loading}
            />

            {currentCurrency && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <h4 className="font-semibold mb-2">Currency Details</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-600">Code:</span>
                    <p className="font-semibold">{currentCurrency.code}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Symbol:</span>
                    <p className="font-semibold">{currentCurrency.symbol}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Region:</span>
                    <p className="font-semibold">{currentCurrency.region}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Decimal Places:</span>
                    <p className="font-semibold">{currentCurrency.decimals}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-600">Name:</span>
                    <p className="font-semibold">{currentCurrency.name}</p>
                  </div>
                </div>
              </div>
            )}

            {saveSuccess && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-md text-green-800 text-sm">
                ✓ Currency preference updated successfully
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Currency Preview & Formatting */}
      <Card>
        <CardHeader>
          <CardTitle>Currency Preview</CardTitle>
          <CardDescription>
            See how amounts are formatted in {currentCurrency?.code}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[100, 1000, 10000, 100000, 1000000, 9999.99].map((amount) => (
              <div
                key={amount}
                className="p-3 bg-gray-50 rounded-lg border border-gray-200"
              >
                <p className="text-xs text-gray-600 mb-1">
                  {amount.toLocaleString()}
                </p>
                <p className="font-semibold text-base">
                  {formatCurrency(amount, selectedCurrency)}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Available Currencies */}
      <Card>
        <CardHeader>
          <CardTitle>Available Currencies</CardTitle>
          <CardDescription>
            View all supported currencies and their formatting options
          </CardDescription>
          <div className="flex gap-2 mt-4">
            <Button
              variant={viewMode === 'common' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('common')}
            >
              Common Currencies
            </Button>
            <Button
              variant={viewMode === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('all')}
            >
              All Currencies ({allCurrencies.length})
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
            {currenciesToDisplay.map((currency) => (
              <div
                key={currency.code}
                className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedCurrency === currency.code
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
                onClick={() => handleCurrencyChange(currency.code)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold">
                      {currency.symbol}
                    </span>
                    <div>
                      <p className="font-semibold text-sm">{currency.code}</p>
                      <p className="text-xs text-gray-600">
                        {currency.decimals} decimals
                      </p>
                    </div>
                  </div>
                  {selectedCurrency === currency.code && (
                    <span className="bg-blue-500 text-white px-2 py-1 rounded text-xs font-semibold">
                      Current
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  {currency.name}
                </p>
                <p className="text-xs text-gray-600">
                  {currency.region}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Exchange Rates Info */}
      {Object.keys(exchangeRates).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Exchange Rates</CardTitle>
            <CardDescription>
              Current exchange rates relative to {selectedCurrency}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-48 overflow-y-auto">
              {Object.entries(exchangeRates)
                .slice(0, 12)
                .map(([pair, rate]) => (
                  <div
                    key={pair}
                    className="p-2 bg-gray-50 rounded border border-gray-200"
                  >
                    <p className="text-xs font-semibold text-gray-700">
                      {pair}
                    </p>
                    <p className="text-sm font-semibold text-gray-900">
                      {parseFloat(rate).toFixed(4)}
                    </p>
                  </div>
                ))}
            </div>
            {Object.keys(exchangeRates).length === 0 && (
              <p className="text-sm text-gray-500">
                Exchange rates not available at this time
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Currency Formatting Guide */}
      <Card>
        <CardHeader>
          <CardTitle>Formatting Information</CardTitle>
          <CardDescription>
            How {currentCurrency?.code} formats numbers and currency
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between p-3 bg-gray-50 rounded">
              <span className="text-gray-700">Symbol Position:</span>
              <span className="font-semibold">
                {currentCurrency?.symbolPosition === 'prefix'
                  ? 'Before Amount'
                  : 'After Amount'}
              </span>
            </div>
            <div className="flex justify-between p-3 bg-gray-50 rounded">
              <span className="text-gray-700">Thousands Separator:</span>
              <span className="font-semibold">
                &quot;{currentCurrency?.thousandsSeparator}&quot;
              </span>
            </div>
            <div className="flex justify-between p-3 bg-gray-50 rounded">
              <span className="text-gray-700">Decimal Separator:</span>
              <span className="font-semibold">
                &quot;{currentCurrency?.decimalSeparator}&quot;
              </span>
            </div>
            <div className="flex justify-between p-3 bg-gray-50 rounded">
              <span className="text-gray-700">Decimal Places:</span>
              <span className="font-semibold">{currentCurrency?.decimals}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
