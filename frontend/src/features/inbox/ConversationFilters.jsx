import { useState, useRef, useEffect } from 'react';
import {
  HiChatAlt2,
  HiCheck,
  HiChevronDown,
  HiDeviceMobile,
  HiGlobeAlt,
  HiUser,
  HiX,
} from 'react-icons/hi';
import { useI18n } from '../../i18n';

const SORT_OPTIONS = (t) => [
  { value: 'latest', label: t('inbox.sortLatest') },
  { value: 'unread', label: t('inbox.sortUnread') },
  { value: 'name_asc', label: t('inbox.sortNameAsc') },
  { value: 'name_desc', label: t('inbox.sortNameDesc') },
];

const STATUS_OPTIONS = (t) => [
  { value: 'all', label: t('inbox.statusAll') },
  { value: 'active', label: t('inbox.statusActive') },
  { value: 'closed', label: t('inbox.statusClosed') },
];

const DATE_OPTIONS = (t) => [
  { value: 'all', label: t('inbox.dateAnytime') },
  { value: 'today', label: t('inbox.dateToday') },
  { value: 'week', label: t('inbox.dateWeek') },
  { value: 'month', label: t('inbox.dateMonth') },
];

const CHANNEL_OPTIONS = (t) => [
  { value: '', label: t('inbox.allChannels'), Icon: HiGlobeAlt, short: t('inbox.channelAllShort') },
  { value: 'web', label: t('inbox.webChat'), Icon: HiChatAlt2, short: t('inbox.webChatShort') },
  { value: 'zalo_oa', label: t('inbox.zaloOA'), Icon: HiDeviceMobile, short: 'OA' },
  { value: 'facebook', label: t('inbox.facebook'), Icon: HiChatAlt2, short: 'FB' },
  { value: 'zalo_personal', label: t('inbox.zaloPersonal'), Icon: HiUser, short: t('inbox.zaloPersonalShort') },
];

const ChannelTabs = ({ channels, value, onChange }) => (
  <div className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1">
    {channels.map((channel) => {
      const active = value === channel.value;
      const Icon = channel.Icon;
      return (
        <button
          key={channel.value || 'all'}
          type="button"
          onClick={() => onChange(channel.value)}
          title={channel.label}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg whitespace-nowrap transition-all ${
            active
              ? 'bg-white text-primary-600 shadow-sm ring-1 ring-black/5'
              : 'text-gray-500 hover:bg-white/70 hover:text-gray-700'
          }`}
        >
          {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
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
        className={`flex min-w-0 items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-lg border transition-colors ${
          hasValue
            ? 'bg-primary-50 text-primary-700 border-primary-200'
            : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-200'
        }`}
      >
        <span className="text-gray-400">{label}:</span>
        <span className="truncate max-w-[88px] font-semibold">{selectedOption?.label || label}</span>
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
  const { t } = useI18n();
  const sortOptions = SORT_OPTIONS(t);
  const statusOptions = STATUS_OPTIONS(t);
  const dateOptions = DATE_OPTIONS(t);
  const channelOptions = CHANNEL_OPTIONS(t);

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

  return (
    <div className="space-y-2">
      {showChannelTabs && (
        <ChannelTabs
          channels={channelOptions}
          value={filters.channel}
          onChange={(val) => handleChange('channel', val)}
        />
      )}

      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-100 bg-gray-50/80 p-1.5">
        <FilterDropdown
          options={sortOptions}
          value={filters.sort}
          onChange={(val) => handleChange('sort', val)}
          label={t('inbox.sort')}
        />
        <FilterDropdown
          options={statusOptions}
          value={filters.status}
          onChange={(val) => handleChange('status', val)}
          label={t('inbox.status')}
        />
        <FilterDropdown
          options={dateOptions}
          value={filters.date}
          onChange={(val) => handleChange('date', val)}
          label={t('inbox.date')}
        />
        {hasAdvancedFilters && (
          <button
            type="button"
            onClick={handleClearAdvanced}
            className="ml-auto flex items-center gap-0.5 px-2 py-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
          >
            <HiX className="w-3 h-3" />
            {t('inbox.clearFilters')}
          </button>
        )}
      </div>
    </div>
  );
};

export { ConversationFilters, ChannelTabs, SORT_OPTIONS, STATUS_OPTIONS, DATE_OPTIONS, CHANNEL_OPTIONS };
export default ConversationFilters;
