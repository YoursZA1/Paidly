import PropTypes from 'prop-types';
import { getCurrencySymbol } from '@/utils/currencyCalculations';

/**
 * CurrencyInput Component
 * Input field for currency amounts with proper formatting
 */
export default function CurrencyInput({
  value = '',
  onChange = () => {},
  currency = 'ZAR',
  placeholder = '0.00',
  disabled = false,
  className = '',
  label = '',
  error = '',
  required = false,
  min = 0,
  step = 0.01,
  id,
  name = 'amount',
}) {
  const currencySymbol = getCurrencySymbol(currency);
  const inputId = id || 'currency-amount';

  const handleChange = (e) => {
    const inputValue = e.target.value;
    
    // Allow only numbers and decimal point
    if (inputValue === '' || /^\d*\.?\d*$/.test(inputValue)) {
      onChange(inputValue);
    }
  };

  const handleBlur = (e) => {
    // Format the value on blur
    const num = parseFloat(e.target.value);
    if (!isNaN(num) && num >= 0) {
      onChange(num.toFixed(2));
    }
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        <span className="absolute left-3 top-2 text-gray-600 font-semibold">
          {currencySymbol}
        </span>

        <input
          id={inputId}
          name={name}
          type="number"
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          min={min}
          step={step}
          className={`
            w-full pl-10 pr-3 py-2 border rounded-md
            focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent
            ${error ? 'border-red-500' : 'border-gray-300'}
            ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
            transition-all
          `}
        />
      </div>

      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}

CurrencyInput.propTypes = {
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onChange: PropTypes.func,
  currency: PropTypes.string,
  placeholder: PropTypes.string,
  disabled: PropTypes.bool,
  className: PropTypes.string,
  label: PropTypes.string,
  error: PropTypes.string,
  required: PropTypes.bool,
  min: PropTypes.number,
  step: PropTypes.number,
  id: PropTypes.string,
  name: PropTypes.string,
};
