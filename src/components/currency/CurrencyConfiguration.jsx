import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { hasFeatureAccess } from '@/components/subscription/FeatureGate';
import { useUserProfileQuery } from '@/hooks/useUserProfileQuery';
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
  const { profile } = useUserProfileQuery();
  const [selectedCurrency, setSelectedCurrency] = useState('ZAR');
  const [allCurrencies, setAllCurrencies] = useState([]);
  const [exchangeRates, setExchangeRates] = useState({});
  const [loading, setLoading] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [viewMode, setViewMode] = useState('common'); // 'common' or 'all'
  const userPlan = profile?.subscription_plan || profile?.plan || 'Individual';
  const canUseMultiCurrency = hasFeatureAccess(userPlan, 'multicurrency');

  const loadCurrencyData = async () => {
    try {
      setLoading(true);

      // Load user's preferred currency
      const userPref = await getUserCurrency();
      if (userPref?.currency) {
        setSelectedCurrency(userPref.currency);
      }

      // Only fetch rates when the feature is enabled for the current plan.
      if (canUseMultiCurrency) {
        const rates = await getExchangeRates('ZAR');
        setExchangeRates(rates);
      } else {
        setExchangeRates({});
      }

      // Load all currencies
      const currencies = getAllCurrencies();
      setAllCurrencies(currencies);
    } catch (error) {
      console.error('Error loading currency data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCurrencyData();
    // Re-evaluate when plan capability changes (profile loads/updates).
  }, [canUseMultiCurrency]);

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
      <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">Primary Currency</CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">
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
              <div className="mt-4 p-4 bg-gray-50 dark:bg-slate-800/70 rounded-lg border border-slate-100 dark:border-slate-700">
                <h4 className="font-semibold mb-2 text-slate-900 dark:text-slate-100">Currency Details</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-600 dark:text-slate-400">Code:</span>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{currentCurrency.code}</p>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-slate-400">Symbol:</span>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{currentCurrency.symbol}</p>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-slate-400">Region:</span>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{currentCurrency.region}</p>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-slate-400">Decimal Places:</span>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{currentCurrency.decimals}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-600 dark:text-slate-400">Name:</span>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{currentCurrency.name}</p>
                  </div>
                </div>
              </div>
            )}

            {saveSuccess && (
              <div className="p-3 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded-md text-green-800 dark:text-green-200 text-sm">
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
      <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">Available Currencies</CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">
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
                    ? 'border-primary bg-primary/10 dark:bg-primary/20'
                    : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800/80 hover:border-gray-300 dark:hover:border-slate-500'
                }`}
                onClick={() => handleCurrencyChange(currency.code)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
                      {currency.symbol}
                    </span>
                    <div>
                      <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">{currency.code}</p>
                      <p className="text-xs text-gray-600 dark:text-slate-400">
                        {currency.decimals} decimals
                      </p>
                    </div>
                  </div>
                  {selectedCurrency === currency.code && (
                    <span className="bg-primary text-primary-foreground px-2 py-1 rounded text-xs font-semibold">
                      Current
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-2">
                  {currency.name}
                </p>
                <p className="text-xs text-gray-600 dark:text-slate-400">
                  {currency.region}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Exchange Rates Info */}
      {Object.keys(exchangeRates).length > 0 && (
        <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
          <CardHeader>
            <CardTitle className="text-slate-900 dark:text-slate-100">Exchange Rates</CardTitle>
            <CardDescription className="text-slate-600 dark:text-slate-400">
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
                    className="p-2 bg-gray-50 dark:bg-slate-800/70 rounded border border-gray-200 dark:border-slate-600"
                  >
                    <p className="text-xs font-semibold text-gray-700 dark:text-slate-400">
                      {pair}
                    </p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                      {parseFloat(rate).toFixed(4)}
                    </p>
                  </div>
                ))}
            </div>
            {Object.keys(exchangeRates).length === 0 && (
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Exchange rates not available at this time
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Currency Formatting Guide */}
      <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">Formatting Information</CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">
            How {currentCurrency?.code} formats numbers and currency
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between p-3 bg-gray-50 dark:bg-slate-800/70 rounded border border-transparent dark:border-slate-700">
              <span className="text-gray-700 dark:text-slate-300">Symbol Position:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {currentCurrency?.symbolPosition === 'prefix'
                  ? 'Before Amount'
                  : 'After Amount'}
              </span>
            </div>
            <div className="flex justify-between p-3 bg-gray-50 dark:bg-slate-800/70 rounded border border-transparent dark:border-slate-700">
              <span className="text-gray-700 dark:text-slate-300">Thousands Separator:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                &quot;{currentCurrency?.thousandsSeparator}&quot;
              </span>
            </div>
            <div className="flex justify-between p-3 bg-gray-50 dark:bg-slate-800/70 rounded border border-transparent dark:border-slate-700">
              <span className="text-gray-700 dark:text-slate-300">Decimal Separator:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                &quot;{currentCurrency?.decimalSeparator}&quot;
              </span>
            </div>
            <div className="flex justify-between p-3 bg-gray-50 dark:bg-slate-800/70 rounded border border-transparent dark:border-slate-700">
              <span className="text-gray-700 dark:text-slate-300">Decimal Places:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{currentCurrency?.decimals}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
