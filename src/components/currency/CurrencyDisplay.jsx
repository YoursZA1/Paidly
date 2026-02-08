import React from 'react';
import { formatCurrency, getCurrencySymbol } from '@/utils/currencyCalculations';

/**
 * CurrencyDisplay Component
 * Displays formatted currency amounts with proper formatting
 */
export default function CurrencyDisplay({
  amount = 0,
  currency = 'ZAR',
  showSymbol = true,
  showDecimals = true,
  compact = false,
  className = '',
  prefix = '',
  suffix = '',
  size = 'default', // 'small', 'default', 'large'
}) {
  const sizeClasses = {
    small: 'text-sm',
    default: 'text-base',
    large: 'text-lg',
  };

  // Format the amount
  const formatted = formatCurrency(amount, currency, {
    includeSymbol: showSymbol,
    showDecimals: showDecimals,
  });

  return (
    <span className={`${sizeClasses[size]} font-semibold ${className}`}>
      {prefix && <span>{prefix}</span>}
      <span>{formatted}</span>
      {suffix && <span>{suffix}</span>}
    </span>
  );
}
