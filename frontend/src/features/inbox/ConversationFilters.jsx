import { useState, useRef, useEffect } from 'react';
import { HiChevronDown, HiX, HiCheck } from 'react-icons/hi';

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
  { value: '', label: 'Tất cả', icon: '🌐' },
  { value: 'web', label: 'Web', icon: '💬' },
  { value: 'zalo_oa', label: 'Zalo OA', icon: '📱' },
  { value: 'facebook', label: 'Facebook', icon: '📘' },
  { value: 'zalo_personal', label: 'Zalo', icon: '👤' },
];

const ChannelTabs = ({ channels, value, onChange }) => {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
      {channels.map((channel) => (
        <button
          key={channel.value}
          onClick={() => onChange(channel.value)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-all duration-200 ${
            value === channel.value
              ? 'bg-primary-500 text-white shadow-md shadow-primary-500/20'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <span>{channel.icon}</span>
          <span>{channel.label}</span>
        </button>
      ))}
    </div>
  );
};

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

  const selectedOption = options.find(opt => opt.value === value);
  const hasValue = value !== 'all' && value !== 'latest';

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
          hasValue
            ? 'bg-primary-50 text-primary-600 border border-primary-200'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-transparent'
        }`}
      >
        <span className="font-semibold">{selectedOption?.label || label}</span>
        <HiChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50 min-w-[140px] overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full px-3.5 py-2 text-xs text-left flex items-center justify-between transition-colors ${
                value === option.value
                  ? 'text-primary-600 bg-primary-50 font-semibold'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span>{option.label}</span>
              {value === option.value && <HiCheck className="w-4 h-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const ConversationFilters = ({ filters, onChange, showChannelTabs = true }) => {
  const handleChange = (key, value) => {
    onChange({ ...filters, [key]: value });
  };

  const handleClearAll = () => {
    onChange({
      ...filters,
      sort: 'latest',
      status: 'all',
      date: 'all',
    });
  };

  const hasActiveFilters = filters.sort !== 'latest' || filters.status !== 'all' || filters.date !== 'all';

  return (
    <div className="space-y-2.5">
      {/* Channel Tabs */}
      {showChannelTabs && (
        <ChannelTabs
          channels={CHANNEL_OPTIONS()}
          value={filters.channel}
          onChange={(val) => handleChange('channel', val)}
        />
      )}

      {/* Filter Row */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
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

        {/* Clear All Button */}
        {hasActiveFilters && (
          <button
            onClick={handleClearAll}
            className="ml-auto text-xs text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 font-medium"
          >
            <HiX className="w-3.5 h-3.5" />
            <span>Xóa lọc</span>
          </button>
        )}
      </div>
    </div>
  );
};

export { ConversationFilters, ChannelTabs, SORT_OPTIONS, STATUS_OPTIONS, DATE_OPTIONS, CHANNEL_OPTIONS };
export default ConversationFilters;
