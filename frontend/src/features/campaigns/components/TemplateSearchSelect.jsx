import { useEffect, useMemo, useRef, useState } from 'react';
import { HiOutlineChevronDown, HiOutlineEye, HiOutlineSearch } from 'react-icons/hi';

/**
 * Searchable dropdown for selecting one template.
 *
 * @param {Object} props component props
 * @param {Array<{id: string|number, label: string, description?: string}>} props.options option list
 * @param {string|number} props.value selected option id
 * @param {Function} props.onChange change handler for selected id
 * @param {string} [props.placeholder] placeholder text when nothing selected
 * @param {string} [props.searchPlaceholder] placeholder text for search input
 * @param {string} [props.emptyText] empty state text when no options match
 * @param {Function|null} [props.onPreview] callback to open preview
 * @returns {JSX.Element}
 */
const TemplateSearchSelect = ({
  options = [],
  value = '',
  onChange,
  placeholder = '-- Chọn template --',
  searchPlaceholder = 'Tìm template...',
  emptyText = 'Không có template phù hợp',
  onPreview = null,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const rootRef = useRef(null);

  const normalizedValue = String(value || '').trim();
  const selectedOption = useMemo(
    () => options.find((item) => String(item?.id || '').trim() === normalizedValue) || null,
    [normalizedValue, options]
  );

  const filteredOptions = useMemo(() => {
    const query = String(searchQuery || '').trim().toLowerCase();
    if (!query) return options;
    return options.filter((item) => {
      const label = String(item?.label || '').toLowerCase();
      const description = String(item?.description || '').toLowerCase();
      return label.includes(query) || description.includes(query);
    });
  }, [options, searchQuery]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleToggleOpen = () => {
    setIsOpen((prev) => !prev);
  };

  const handleSelect = (nextValue) => {
    if (typeof onChange === 'function') {
      onChange(nextValue);
    }
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1" ref={rootRef}>
          <button
            type="button"
            onClick={handleToggleOpen}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm bg-white flex items-center justify-between"
          >
            <span className={`truncate text-left ${selectedOption ? 'text-gray-800' : 'text-gray-500'}`}>
              {selectedOption?.label || placeholder}
            </span>
            <HiOutlineChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>

          {isOpen && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
              <div className="p-2 border-b border-gray-100">
                <div className="relative">
                  <HiOutlineSearch className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    autoFocus
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div className="max-h-56 overflow-y-auto py-1">
                <button
                  type="button"
                  onClick={() => handleSelect('')}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                    !normalizedValue ? 'bg-primary-50 text-primary-700' : 'text-gray-600'
                  }`}
                >
                  {placeholder}
                </button>

                {filteredOptions.length > 0 ? (
                  filteredOptions.map((item) => {
                    const optionId = String(item?.id || '').trim();
                    const isSelected = optionId === normalizedValue;
                    return (
                      <button
                        key={optionId}
                        type="button"
                        onClick={() => handleSelect(optionId)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                          isSelected ? 'bg-primary-50 text-primary-700' : 'text-gray-800'
                        }`}
                      >
                        <div className="truncate">{item.label}</div>
                        {item.description && (
                          <div className="text-xs text-gray-500 truncate mt-0.5">{item.description}</div>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-4 text-sm text-gray-500 text-center">{emptyText}</div>
                )}
              </div>
            </div>
          )}
        </div>

        {typeof onPreview === 'function' && (
          <button
            type="button"
            onClick={onPreview}
            disabled={!normalizedValue}
            className={`inline-flex items-center gap-1 px-3 py-2 text-xs rounded-lg transition-colors ${
              normalizedValue
                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            <HiOutlineEye className="w-4 h-4" />
            Xem trước
          </button>
        )}
      </div>
    </div>
  );
};

export default TemplateSearchSelect;
