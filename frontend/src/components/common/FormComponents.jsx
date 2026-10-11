import { useState } from 'react';
import { HiOutlineExclamationCircle, HiOutlineCheckCircle, HiOutlineX } from 'react-icons/hi';
import { useI18n } from '../../i18n';

const FormField = ({
  label,
  name,
  type = 'text',
  value,
  onChange,
  placeholder,
  required = false,
  error,
  helpText,
  options = [],
  rows = 4,
  disabled = false,
  className = '',
  ...props
}) => {
  const { t } = useI18n();
  const [focused, setFocused] = useState(false);

  const inputClasses = `
    w-full px-4 py-2.5 border rounded-lg transition-colors dark:text-dk-text dark:placeholder-dk-muted
    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
    ${error
      ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40 focus:ring-red-200 dark:focus:ring-red-800'
      : focused
        ? 'border-blue-300 dark:border-blue-700 bg-white dark:bg-dk-inset'
        : 'border-gray-300 dark:border-dk-border-strong bg-white dark:bg-dk-inset hover:border-gray-400 dark:hover:border-dk-border-strong'
    }
    ${disabled ? 'bg-gray-100 dark:bg-dk-raised cursor-not-allowed opacity-60' : ''}
    ${className}
  `;

  const renderInput = () => {
    if (type === 'textarea') {
      return (
        <textarea
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={inputClasses}
          {...props}
        />
      );
    }

    if (type === 'select') {
      return (
        <select
          name={name}
          value={value}
          onChange={onChange}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={inputClasses}
          {...props}
        >
          <option value="">{placeholder || t('common.selectOption')}</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }

    if (type === 'number') {
      return (
        <input
          type="number"
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={inputClasses}
          {...props}
        />
      );
    }

    return (
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={inputClasses}
        {...props}
      />
    );
  };

  return (
    <div className="mb-4">
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-dk-text mb-1.5">
          {label}
          {required && <span className="text-red-500 dark:text-red-400 ml-1">*</span>}
        </label>
      )}

      {renderInput()}

      {/* Error message */}
      {error && (
        <div className="mt-1.5 flex items-center gap-1 text-red-600 dark:text-red-400 text-sm">
          <HiOutlineExclamationCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Help text */}
      {helpText && !error && (
        <p className="mt-1.5 text-gray-500 dark:text-dk-text2 text-sm">{helpText}</p>
      )}
    </div>
  );
};

const FormSection = ({ title, description, children, className = '' }) => (
  <div className={`bg-white dark:bg-dk-surface rounded-xl p-6 border border-gray-200 dark:border-dk-border ${className}`}>
    {title && (
      <h3 className="text-lg font-semibold text-gray-900 dark:text-dk-text mb-1">{title}</h3>
    )}
    {description && (
      <p className="text-gray-500 dark:text-dk-text2 text-sm mb-4">{description}</p>
    )}
    {children}
  </div>
);

const FormActions = ({ children, className = '', align = 'right' }) => {
  const alignClasses = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
  };

  return (
    <div className={`flex gap-3 ${alignClasses[align]} ${className}`}>
      {children}
    </div>
  );
};

const FormError = ({ message, onDismiss }) => (
  <div className="mb-4 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
    <HiOutlineExclamationCircle className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
    <div className="flex-1">
      <p className="text-red-700 dark:text-red-300 font-medium">Đã xảy ra lỗi</p>
      <p className="text-red-600 dark:text-red-400 text-sm mt-1">{message}</p>
    </div>
    {onDismiss && (
      <button
        onClick={onDismiss}
        className="text-red-400 hover:text-red-600 dark:hover:text-red-400 flex-shrink-0"
      >
        <HiOutlineX className="w-5 h-5" />
      </button>
    )}
  </div>
);

const FormSuccess = ({ message, onDismiss }) => (
  <div className="mb-4 p-4 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 rounded-lg flex items-start gap-3">
    <HiOutlineCheckCircle className="w-5 h-5 text-green-500 dark:text-green-400 flex-shrink-0 mt-0.5" />
    <div className="flex-1">
      <p className="text-green-700 dark:text-green-300 font-medium">Thành công</p>
      <p className="text-green-600 dark:text-green-400 text-sm mt-1">{message}</p>
    </div>
    {onDismiss && (
      <button
        onClick={onDismiss}
        className="text-green-400 hover:text-green-600 dark:hover:text-green-400 flex-shrink-0"
      >
        <HiOutlineX className="w-5 h-5" />
      </button>
    )}
  </div>
);

const TagInput = ({ value = [], onChange, placeholder = 'Add tag...', maxTags = 10 }) => {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
    if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      removeTag(value.length - 1);
    }
  };

  const addTag = () => {
    const tag = inputValue.trim();
    if (tag && !value.includes(tag) && value.length < maxTags) {
      onChange([...value, tag]);
      setInputValue('');
    }
  };

  const removeTag = (index) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-2 p-2 border border-gray-300 dark:border-dk-border-strong rounded-lg bg-white dark:bg-dk-surface focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
        {value.map((tag, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 rounded text-sm"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(index)}
              className="hover:text-blue-900 dark:hover:text-blue-300"
            >
              <HiOutlineX className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addTag}
          placeholder={value.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[100px] outline-none text-sm dark:bg-transparent dark:text-dk-text dark:placeholder-dk-muted"
        />
      </div>
      <p className="mt-1 text-gray-500 dark:text-dk-text2 text-xs">
        Nhấn Enter hoặc dấu phẩy để thêm tag. Tối đa {maxTags} tags.
      </p>
    </div>
  );
};

export {
  FormField,
  FormSection,
  FormActions,
  FormError,
  FormSuccess,
  TagInput,
};
