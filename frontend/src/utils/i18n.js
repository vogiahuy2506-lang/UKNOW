// i18n utility functions for the UKNOW platform

export const LOCALES = {
  VI: 'vi',
  EN: 'en',
};

export const localeLabels = {
  vi: 'Tiếng Việt',
  en: 'English',
};

export const localeFlags = {
  vi: '🇻🇳',
  en: 'EN',
};

const STORAGE_KEY = 'uknow_locale';

export function getStoredLocale() {
  if (typeof window === 'undefined') return LOCALES.VI;
  return localStorage.getItem(STORAGE_KEY) || LOCALES.VI;
}

export function setStoredLocale(locale) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, locale);
  document.documentElement.lang = locale;
}

export function isValidLocale(locale) {
  return Object.values(LOCALES).includes(locale);
}

export function getLocaleFromAcceptLanguage(acceptLanguage) {
  if (!acceptLanguage) return LOCALES.VI;
  
  const langs = acceptLanguage
    .split(',')
    .map(l => l.split(';')[0].trim().toLowerCase())
    .map(l => l.split('-')[0]);
  
  if (langs.includes('en')) return LOCALES.EN;
  if (langs.includes('vi')) return LOCALES.VI;
  
  return LOCALES.VI;
}
