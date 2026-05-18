const isNode = typeof window === 'undefined';
const windowObj = isNode ? { localStorage: new Map() } : window;
const storage = windowObj.localStorage;

const toSnakeCase = (str) => str.replace(/([A-Z])/g, '_$1').toLowerCase();

// Cap URL-sourced values to prevent localStorage pollution from arbitrarily large params.
const MAX_PARAM_LEN = 8192;

const getAppParamValue = (paramName, { defaultValue = undefined, removeFromUrl = false } = {}) => {
  if (isNode) return defaultValue;

  const storageKey = `paidly_${toSnakeCase(paramName)}`;
  const legacyStorageKey = `base44_${toSnakeCase(paramName)}`;
  const urlParams = new URLSearchParams(window.location.search);
  const searchParam = urlParams.get(paramName);

  if (removeFromUrl) {
    urlParams.delete(paramName);
    const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ''}${window.location.hash}`;
    window.history.replaceState({}, document.title, newUrl);
  }

  if (searchParam) {
    const safe = String(searchParam).slice(0, MAX_PARAM_LEN);
    storage.setItem(storageKey, safe);
    return safe;
  }

  if (defaultValue) {
    storage.setItem(storageKey, defaultValue);
    return defaultValue;
  }

  const storedValue = storage.getItem(storageKey);
  if (storedValue) return storedValue;
  const legacyStoredValue = storage.getItem(legacyStorageKey);
  if (legacyStoredValue) {
    storage.setItem(storageKey, legacyStoredValue);
    return legacyStoredValue;
  }
  return null;
};

const getAppParams = () => {
  if (getAppParamValue('clear_access_token') === 'true') {
    storage.removeItem('paidly_access_token');
    storage.removeItem('base44_access_token');
    storage.removeItem('token');
  }

  return {
    appId: getAppParamValue('app_id', { defaultValue: import.meta.env.VITE_PAIDLY_APP_ID || import.meta.env.VITE_BASE44_APP_ID }),
    token: getAppParamValue('access_token', { removeFromUrl: true }),
    fromUrl: getAppParamValue('from_url', { defaultValue: window.location.href }),
    functionsVersion: getAppParamValue('functions_version', { defaultValue: import.meta.env.VITE_PAIDLY_FUNCTIONS_VERSION || import.meta.env.VITE_BASE44_FUNCTIONS_VERSION }),
    appBaseUrl: getAppParamValue('app_base_url', { defaultValue: import.meta.env.VITE_PAIDLY_APP_BASE_URL || import.meta.env.VITE_BASE44_APP_BASE_URL }),
  };
};

export const appParams = {
  ...getAppParams(),
};
