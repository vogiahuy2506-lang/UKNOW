import { useState, useRef, useEffect } from 'react';
import { HiChevronDown, HiX, HiCheck, HiAdjustments } from 'react-icons/hi';

const SORT_OPTIONS = [
  { value: 'latest', label: 'Mới nhất' },
  { value: 'unread', label: 'Chưa đọc' },
  { value: 'name_asc', label: 'A → Z' },
  { value: 'name_desc', label: 'Z → A' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'active', label: 'Hoạt động' },
  { value: 'closed', label: 'Đã đóng' },
];

const DATE_OPTIONS = [
  { value: 'all', label: 'Mọi lúc' },
  { value: 'today', label: 'Hôm nay' },
  { value: 'week', label: '7 ngày' },
  { value: 'month', label: '30 ngày' },
];

const CHANNEL_OPTIONS = () => [
  { value: '', label: 'Tất cả', icon: '🌐', short: 'All' },
  { value: 'web', label: 'Web', icon: '💬', short: 'Web' },
  { value: 'zalo_oa', label: 'Zalo OA', icon: '📱', short: 'OA' },
  { value: 'facebook', label: 'Facebook', icon: '📘', short: 'FB' },
  { value: 'zalo_personal', label: 'Zalo', icon: '👤', short: 'ZL' },
];

const ChannelTabs = ({ channels, value, onChange }) => (
  <div className="flex gap-1 overflow-x-auto pb-0.5">
    {channels.map((channel) => {
      const active = value === channel.value;
      return (
        <button
          key={channel.value || 'all'}
          type="button"
          onClick={() => onChange(channel.value)}
          title={channel.label}
          className={`flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md whitespace-nowrap transition-colors ${
            active
              ? 'bg-primary-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <span className="text-xs leading-none">{channel.icon}</span>
          <span>{channel.short || channel.label}</span>
        </button>
      );
    })}
  </div>
);

const FilterDropdown = ({ options, value, onChange, label }) => {
  const [isOpen, setIsOpen] = useState(false);
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

  const selectedOption = options.find((opt) => opt.value === value);
  const hasValue = value !== 'all' && value !== 'latest';

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md transition-colors ${
          hasValue
            ? 'bg-primary-50 text-primary-600 border border-primary-200'
            : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
        }`}
      >
        <span className="truncate max-w-[72px]">{selectedOption?.label || label}</span>
        <HiChevronDown className={`w-3 h-3 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-50 min-w-[128px]">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full px-3 py-1.5 text-xs text-left flex items-center justify-between ${
                value === option.value
                  ? 'text-primary-600 bg-primary-50 font-semibold'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span>{option.label}</span>
              {value === option.value && <HiCheck className="w-3.5 h-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const ConversationFilters = ({ filters, onChange, showChannelTabs = true }) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleChange = (key, value) => {
    onChange({ ...filters, [key]: value });
  };

  const handleClearAdvanced = () => {
    onChange({
      ...filters,
      sort: 'latest',
      status: 'all',
      date: 'all',
    });
  };

  const hasAdvancedFilters = filters.sort !== 'latest' || filters.status !== 'all' || filters.date !== 'all';

  useEffect(() => {
    if (hasAdvancedFilters) setShowAdvanced(true);
  }, [hasAdvancedFilters]);

  return (
    <div className="space-y-2">
      {showChannelTabs && (
        <ChannelTabs
          channels={CHANNEL_OPTIONS()}
          value={filters.channel}
          onChange={(val) => handleChange('channel', val)}
        />
      )}

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border transition-colors ${
            showAdvanced || hasAdvancedFilters
              ? 'bg-primary-50 text-primary-600 border-primary-200'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          <HiAdjustments className="w-3.5 h-3.5" />
          <span>Lọc</span>
          {hasAdvancedFilters && (
            <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
          )}
        </button>

        {hasAdvancedFilters && (
          <button
            type="button"
            onClick={handleClearAdvanced}
            className="ml-auto flex items-center gap-0.5 px-1.5 py-1 text-[11px] text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100"
          >
            <HiX className="w-3 h-3" />
            Xóa
          </button>
        )}
      </div>

      {showAdvanced && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <FilterDropdown
            options={SORT_OPTIONS}
            value={filters.sort}
            onChange={(val) => handleChange('sort', val)}
            label="Sắp xếp"
          />
          <FilterDropdown
            options={STATUS_OPTIONS}
            value={filters.status}
            onChange={(val) => handleChange('status', val)}
            label="Trạng thái"
          />
          <FilterDropdown
            options={DATE_OPTIONS}
            value={filters.date}
            onChange={(val) => handleChange('date', val)}
            label="Thời gian"
          />
        </div>
      )}
    </div>
  );
};

export { ConversationFilters, ChannelTabs, SORT_OPTIONS, STATUS_OPTIONS, DATE_OPTIONS, CHANNEL_OPTIONS };
export default ConversationFilters;
