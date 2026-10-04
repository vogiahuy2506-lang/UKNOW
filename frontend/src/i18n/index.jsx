import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import vi from './vi';
import { getLoadedEnglish, loadEnglishDictionary } from './englishDictionary';
import { getStoredLocale, setStoredLocale, LOCALES } from '../utils/i18n';

// `vi` nằm sẵn trong bundle chính (ngôn ngữ mặc định + chỗ rơi về của t()). `en` nạp lười — xem
// englishDictionary.js. Danh sách ngôn ngữ CỐ ĐỊNH, không suy từ các từ điển đã nạp: menu đổi ngôn ngữ
// không được mất EN chỉ vì EN chưa nạp.
const AVAILABLE_LOCALES = [LOCALES.VI, LOCALES.EN];

// eslint-disable-next-line react-refresh/only-export-components
export const I18nContext = createContext(null);

// Màn chờ lúc khởi động với locale `en` mà từ điển chưa về (vài chục ms). Không có chữ: lúc này chưa có
// từ điển nào đúng ngôn ngữ để hiện.
function DictionaryLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50" role="status" aria-busy="true">
      <div className="spinner w-10 h-10"></div>
    </div>
  );
}

export function I18nProvider({ children }) {
  const [initialLocale] = useState(getStoredLocale);
  const [locale, setLocale] = useState(initialLocale);
  const [englishDictionary, setEnglishDictionary] = useState(getLoadedEnglish);
  // Khởi động với locale `en` mà từ điển `en` chưa nạp: giữ màn chờ tới khi nạp xong, khỏi nháy tiếng Việt.
  const [ready, setReady] = useState(() => initialLocale !== LOCALES.EN || Boolean(getLoadedEnglish()));
  // Ngôn ngữ người dùng chọn gần nhất — lượt nạp `en` về muộn không được ghi đè lựa chọn mới hơn (bấm EN rồi VI ngay).
  const requestedLocaleRef = useRef(initialLocale);
  // Nạp `en` lúc khởi động lỗi: hiện tiếng Việt nhưng KHÔNG ghi đè lựa chọn "en" đã lưu (lỗi mạng thoáng qua).
  const skipPersistRef = useRef(false);

  useEffect(() => {
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      document.documentElement.lang = locale;
      return;
    }
    setStoredLocale(locale);
  }, [locale]);

  useEffect(() => {
    if (ready) return undefined;
    let cancelled = false;
    loadEnglishDictionary().then(
      (dictionary) => {
        if (cancelled) return;
        setEnglishDictionary(dictionary);
        setReady(true);
      },
      (error) => {
        if (cancelled) return;
        console.warn('[i18n] Không nạp được từ điển tiếng Anh — dùng tiếng Việt:', error);
        skipPersistRef.current = true;
        requestedLocaleRef.current = LOCALES.VI;
        setLocale(LOCALES.VI);
        setReady(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ready]);

  const changeLocale = useCallback((newLocale) => {
    if (newLocale === LOCALES.VI) {
      requestedLocaleRef.current = LOCALES.VI;
      setLocale(LOCALES.VI);
      return;
    }
    // Locale lạ: bỏ qua như trước (chỉ vi/en có từ điển).
    if (newLocale !== LOCALES.EN) return;

    requestedLocaleRef.current = LOCALES.EN;
    const loaded = getLoadedEnglish();
    if (loaded) {
      setEnglishDictionary(loaded);
      setLocale(LOCALES.EN);
      return;
    }
    // Lần đầu đổi sang `en`: nạp xong mới đổi, để không có khoảnh khắc locale=en mà chưa có chuỗi nào.
    loadEnglishDictionary().then(
      (dictionary) => {
        if (requestedLocaleRef.current !== LOCALES.EN) return;
        setEnglishDictionary(dictionary);
        setLocale(LOCALES.EN);
      },
      (error) => {
        console.warn('[i18n] Không nạp được từ điển tiếng Anh — giữ nguyên ngôn ngữ hiện tại:', error);
        // Đang hiện vi (nếu đang hiện en thì đã đi nhánh `loaded` ở trên): trả "ý định" về vi để toggleLocale thử nạp lại.
        if (requestedLocaleRef.current === LOCALES.EN) requestedLocaleRef.current = LOCALES.VI;
      },
    );
  }, []);

  const toggleLocale = useCallback(() => {
    changeLocale(requestedLocaleRef.current === LOCALES.VI ? LOCALES.EN : LOCALES.VI);
  }, [changeLocale]);

  let currentDictionary;
  if (locale === LOCALES.VI) currentDictionary = vi;
  else if (locale === LOCALES.EN) currentDictionary = englishDictionary || undefined;

  const t = useCallback((key, params = {}) => {
    const keys = key.split('.');
    let value = currentDictionary;

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
      value = vi;
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
  }, [currentDictionary]);

  const value = {
    locale,
    t,
    toggleLocale,
    changeLocale,
    translations: currentDictionary,
    availableLocales: AVAILABLE_LOCALES,
  };

  return (
    <I18nContext.Provider value={value}>
      {ready ? children : <DictionaryLoadingFallback />}
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
