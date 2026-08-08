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
    w-full px-4 py-2.5 border rounded-lg transition-colors
    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
    ${error
      ? 'border-red-300 bg-red-50 focus:ring-red-200'
      : focused
        ? 'border-blue-300 bg-white'
        : 'border-gray-300 bg-white hover:border-gray-400'
    }
    ${disabled ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''}
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
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {renderInput()}

      {/* Error message */}
      {error && (
        <div className="mt-1.5 flex items-center gap-1 text-red-600 text-sm">
          <HiOutlineExclamationCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Help text */}
      {helpText && !error && (
        <p className="mt-1.5 text-gray-500 text-sm">{helpText}</p>
      )}
    </div>
  );
};

const FormSection = ({ title, description, children, className = '' }) => (
  <div className={`bg-white rounded-xl p-6 border border-gray-200 ${className}`}>
    {title && (
      <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
    )}
    {description && (
      <p className="text-gray-500 text-sm mb-4">{description}</p>
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
  <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
    <HiOutlineExclamationCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
    <div className="flex-1">
      <p className="text-red-700 font-medium">Đã xảy ra lỗi</p>
      <p className="text-red-600 text-sm mt-1">{message}</p>
    </div>
    {onDismiss && (
      <button
        onClick={onDismiss}
        className="text-red-400 hover:text-red-600 flex-shrink-0"
      >
        <HiOutlineX className="w-5 h-5" />
      </button>
    )}
  </div>
);

const FormSuccess = ({ message, onDismiss }) => (
  <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
    <HiOutlineCheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
    <div className="flex-1">
      <p className="text-green-700 font-medium">Thành công</p>
      <p className="text-green-600 text-sm mt-1">{message}</p>
    </div>
    {onDismiss && (
      <button
        onClick={onDismiss}
        className="text-green-400 hover:text-green-600 flex-shrink-0"
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
      <div className="flex flex-wrap gap-2 p-2 border border-gray-300 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
        {value.map((tag, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(index)}
              className="hover:text-blue-900"
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
          className="flex-1 min-w-[100px] outline-none text-sm"
        />
      </div>
      <p className="mt-1 text-gray-500 text-xs">
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
