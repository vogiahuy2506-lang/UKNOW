import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import vi from './vi';
import en from './en';
import { getStoredLocale, setStoredLocale, LOCALES } from '../utils/i18n';

const translations = { vi, en };

// eslint-disable-next-line react-refresh/only-export-components
export const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState(getStoredLocale);

  useEffect(() => {
    setStoredLocale(locale);
  }, [locale]);

  const toggleLocale = useCallback(() => {
    setLocale(prev => prev === LOCALES.VI ? LOCALES.EN : LOCALES.VI);
  }, []);

  const changeLocale = useCallback((newLocale) => {
    if (translations[newLocale]) {
      setLocale(newLocale);
    }
  }, []);

  const t = useCallback((key, params = {}) => {
    const keys = key.split('.');
    let value = translations[locale];

    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k];
      } else {
        value = undefined;
        break;
      }
    }

    // Fallback to Vietnamese if key not found
    if (value === undefined) {
      value = translations[LOCALES.VI];
      for (const k of keys) {
        if (value && typeof value === 'object') {
          value = value[k];
        } else {
          value = key;
          break;
        }
      }
    }

    // Replace placeholders like {n}, {name}, etc.
    if (typeof value === 'string') {
      return value.replace(/\{(\w+)\}/g, (_, param) => params[param] ?? `{${param}}`);
    }

    return value || key;
  }, [locale]);

  const value = {
    locale,
    t,
    toggleLocale,
    changeLocale,
    translations: translations[locale],
    availableLocales: Object.keys(translations),
  };

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(namespace = null) {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  if (namespace) {
    return (key, params = {}) => context.t(`${namespace}.${key}`, params);
  }
  return context;
}
