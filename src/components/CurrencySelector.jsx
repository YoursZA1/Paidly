import React, { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User } from '@/api/entities';

const currencyData = {
    // South African Rand (Default)
    ZAR: { name: 'South African Rand', symbol: 'R', flag: '🇿🇦', countries: ['ZA'], isDefault: true },
    
    // Other currencies
    USD: { name: 'US Dollar', symbol: '$', flag: '🇺🇸', countries: ['US', 'PR', 'VG', 'AS'] },
    EUR: { name: 'Euro', symbol: '€', flag: '🇪🇺', countries: ['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'PT', 'IE', 'FI', 'GR', 'LU', 'SI', 'SK', 'CY', 'MT', 'EE', 'LV', 'LT'] },
    GBP: { name: 'British Pound', symbol: '£', flag: '🇬🇧', countries: ['GB', 'UK'] },
    
    // African currencies
    NGN: { name: 'Nigerian Naira', symbol: '₦', flag: '🇳🇬', countries: ['NG'] },
    KES: { name: 'Kenyan Shilling', symbol: 'KSh', flag: '🇰🇪', countries: ['KE'] },
    EGP: { name: 'Egyptian Pound', symbol: '£', flag: '🇪🇬', countries: ['EG'] },
    MAD: { name: 'Moroccan Dirham', symbol: 'د.م.', flag: '🇲🇦', countries: ['MA'] },
    GHS: { name: 'Ghanaian Cedi', symbol: '₵', flag: '🇬🇭', countries: ['GH'] },
    XOF: { name: 'West African CFA Franc', symbol: 'CFA', flag: '🌍', countries: ['SN', 'CI', 'BF', 'NE', 'ML', 'BJ', 'TG', 'GW'] },
    XAF: { name: 'Central African CFA Franc', symbol: 'FCFA', flag: '🌍', countries: ['CM', 'CF', 'TD', 'CG', 'GQ', 'GA'] },
    
    // Other major currencies
    CAD: { name: 'Canadian Dollar', symbol: 'C$', flag: '🇨🇦', countries: ['CA'] },
    AUD: { name: 'Australian Dollar', symbol: 'A$', flag: '🇦🇺', countries: ['AU'] },
    JPY: { name: 'Japanese Yen', symbol: '¥', flag: '🇯🇵', countries: ['JP'] },
    CNY: { name: 'Chinese Yuan', symbol: '¥', flag: '🇨🇳', countries: ['CN'] },
    INR: { name: 'Indian Rupee', symbol: '₹', flag: '🇮🇳', countries: ['IN'] }
};

// Currency utility functions with ZAR as default
export const formatCurrency = (amount, currencyCode = 'ZAR', decimals = 2) => {
    if (typeof amount !== 'number') {
        amount = parseFloat(amount) || 0;
    }
    
    const currency = currencyData[currencyCode];
    if (!currency) return `R${amount.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
    
    try {
        // Special handling for ZAR to show proper South African formatting
        if (currencyCode === 'ZAR') {
            return new Intl.NumberFormat('en-ZA', {
                style: 'currency',
                currency: 'ZAR',
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            }).format(amount);
        }
        
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currencyCode,
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(amount);
    } catch (error) {
        // Fallback for unsupported currencies
        return `${currency.symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
    }
};

export const getCurrencySymbol = (currencyCode = 'ZAR') => {
    const currency = currencyData[currencyCode];
    return currency ? currency.symbol : 'R';
};

export const parseCurrencyAmount = (amountString, currencyCode = 'ZAR') => {
    if (typeof amountString === 'number') return amountString;
    
    // Remove currency symbols and non-numeric characters except decimal points
    const cleanAmount = amountString?.toString().replace(/[^\d.-]/g, '') || '0';
    return parseFloat(cleanAmount) || 0;
};

export default function CurrencySelector({ value, onChange, className = "" }) {
    const [detectedCountry, setDetectedCountry] = useState(null);
    const [suggestedCurrency, setSuggestedCurrency] = useState('ZAR'); // Default to ZAR

    useEffect(() => {
        // Always suggest ZAR as default, but still try to detect location
        const detectLocation = async () => {
            try {
                // Try to get location from IP
                const response = await fetch('https://ipapi.co/json/');
                const data = await response.json();
                
                if (data.country_code) {
                    setDetectedCountry(data.country_code);
                    
                    // Find suggested currency based on country, but prefer ZAR for South Africa
                    const suggested = Object.entries(currencyData).find(([code, info]) =>
                        info.countries.includes(data.country_code)
                    );
                    
                    if (suggested) {
                        setSuggestedCurrency(suggested[0]);
                        
                        // Auto-select if no currency is set
                        if (!value && onChange) {
                            onChange(suggested[0]);
                            
                            // Save to user profile
                            User.updateMyUserData({
                                country: data.country_code,
                                currency: suggested[0]
                            }).catch(console.error);
                        }
                    }
                } else {
                    // Fallback to ZAR if location detection fails
                    if (!value && onChange) {
                        onChange('ZAR');
                        User.updateMyUserData({
                            currency: 'ZAR'
                        }).catch(console.error);
                    }
                }
            } catch (error) {
                console.error('Error detecting location:', error);
                // Always fallback to ZAR
                setSuggestedCurrency('ZAR');
                if (!value && onChange) {
                    onChange('ZAR');
                }
            }
        };

        detectLocation();
    }, [value, onChange]);

    const formatCurrencyOption = (code) => {
        const currency = currencyData[code];
        return (
            <div className="flex items-center gap-3">
                <span className="text-lg">{currency.flag}</span>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <span className="font-medium">{code}</span>
                        <span className="text-sm text-gray-500">{currency.symbol}</span>
                        {code === 'ZAR' && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Default</span>}
                    </div>
                    <div className="text-xs text-gray-500">{currency.name}</div>
                </div>
                {code === suggestedCurrency && code !== 'ZAR' && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                        Suggested
                    </span>
                )}
            </div>
        );
    };

    const getDisplayValue = () => {
        if (!value) return "Select currency";
        const currency = currencyData[value];
        return (
            <div className="flex items-center gap-2">
                <span>{currency.flag}</span>
                <span>{value}</span>
                <span className="text-gray-500">({currency.symbol})</span>
            </div>
        );
    };

    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className={`w-full ${className}`}>
                <SelectValue>
                    {getDisplayValue()}
                </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-80">
                {/* ZAR first as default */}
                <SelectItem value="ZAR" className="border-b">
                    {formatCurrencyOption('ZAR')}
                </SelectItem>
                
                {/* Suggested currency if not ZAR */}
                {suggestedCurrency && suggestedCurrency !== 'ZAR' && value !== suggestedCurrency && (
                    <>
                        <SelectItem value={suggestedCurrency} className="border-b">
                            {formatCurrencyOption(suggestedCurrency)}
                        </SelectItem>
                    </>
                )}
                
                <div className="px-2 py-1 text-xs font-medium text-gray-500 bg-gray-50">
                    Other Currencies
                </div>
                
                {/* All other currencies */}
                {Object.entries(currencyData)
                    .filter(([code]) => code !== 'ZAR' && code !== suggestedCurrency)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([code]) => (
                        <SelectItem key={code} value={code}>
                            {formatCurrencyOption(code)}
                        </SelectItem>
                    ))}
            </SelectContent>
        </Select>
    );
}

export { currencyData };