import { useState, useRef, useEffect } from 'react';
import { HiGlobeAlt } from 'react-icons/hi';
import { useI18n } from '../i18n';
import { localeLabels, localeFlags, LOCALES } from '../utils/i18n';

const LanguageSwitcher = ({ className = '', showLabel = false, variant = 'default' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { locale, changeLocale, t } = useI18n();
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (localeKey) => {
    changeLocale(localeKey);
    setIsOpen(false);
  };

  const isDark = variant === 'dark';

  const buttonClasses = isDark
    ? 'text-white hover:text-white hover:bg-white/20'
    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100';

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${buttonClasses}`}
        title={t('common.language') || 'Language'}
      >
        <HiGlobeAlt className="w-5 h-5" />
        {showLabel && (
          <span className="font-medium">
            {localeFlags[locale]} {localeLabels[locale]}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          {Object.entries(LOCALES).map(([key, value]) => (
            <button
              key={key}
              onClick={() => handleSelect(value)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
                locale === value ? 'bg-primary-50 text-primary-600 font-medium' : 'text-gray-700'
              }`}
            >
              <span className="text-lg">{localeFlags[value]}</span>
              <span>{localeLabels[value]}</span>
              {locale === value && (
                <svg className="w-4 h-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher;
