import React from 'react';

/**
 * Safely renders an icon component, handling all possible icon formats
 * @param {Function|React.Element|string|object} icon - The icon to render
 * @param {object} props - Props to pass to the icon component
 * @returns {React.Element|null} - Rendered icon or null
 */
export function renderIcon(icon, props = {}) {
  if (!icon) return null;
  
  // If it's a function (React component), create element
  if (typeof icon === 'function') {
    return React.createElement(icon, { ...props, className: props.className || '' });
  }
  
  // If it's a string (emoji or text), return as-is
  if (typeof icon === 'string') {
    return icon;
  }
  
  // If it's a React element (already rendered), return as-is
  if (React.isValidElement(icon)) {
    return icon;
  }
  
  // If it's an object with $$typeof (React element descriptor), don't render directly
  // This can happen with some icon libraries - return null to avoid error
  if (typeof icon === 'object' && icon !== null) {
    if (icon.$$typeof) {
      // This is a React element descriptor - don't render directly
      return null;
    }
  }
  
  return null;
}
