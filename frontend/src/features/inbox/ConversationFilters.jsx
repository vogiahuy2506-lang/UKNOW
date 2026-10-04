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
import { FaTelegramPlane, FaWhatsapp } from 'react-icons/fa';
import { useI18n } from '../../i18n';

const DATE_OPTIONS = (t) => [
  { value: 'all', label: t('inbox.dateAnytime') },
  { value: 'today', label: t('inbox.dateToday') },
  { value: 'week', label: t('inbox.dateWeek') },
  { value: 'month', label: t('inbox.dateMonth') },
];

/**
 * Mọi tab kênh có thể có. Facebook không còn (kết nối Facebook đã chốt không làm, 21/09). Hộp thư chỉ hiện tab của
 * kênh user THỰC SỰ có (`availableChannels` từ server) — trước đây cố định 7 tab cho mọi người, tràn ngang ở 360 px (H-12).
 * Icon Telegram dùng logo máy bay giấy, không dùng tam giác có vạch của heroicons (giống biển cảnh báo).
 */
const CHANNEL_OPTIONS = (t) => [
  { value: '', label: t('inbox.allChannels'), Icon: HiGlobeAlt, short: t('inbox.channelAllShort') },
  { value: 'web', label: t('inbox.webChat'), Icon: HiChatAlt2, short: t('inbox.webChatShort') },
  { value: 'zalo_personal', label: t('inbox.zaloPersonal'), Icon: HiUser, short: t('inbox.zaloPersonalShort') },
  { value: 'zalo_oa', label: t('inbox.zaloOA'), Icon: HiDeviceMobile, short: 'OA' },
  { value: 'whatsapp_baileys', label: 'WhatsApp', Icon: FaWhatsapp, short: 'WA' },
  { value: 'telegram', label: 'Telegram', Icon: FaTelegramPlane, short: 'TG' },
];

/** Từ 5 kênh trở lên (cộng "Tất cả" là 6 nút) thì gom thành một ô chọn "Kênh" thay vì hàng tab tràn ngang. */
const MAX_TABS = 4;

const ChannelTabs = ({ channels, value, onChange }) => (
  <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
    {channels.map((channel) => {
      const active = value === channel.value;
      const Icon = channel.Icon;
      return (
        <button
          key={channel.value || 'all'}
          type="button"
          onClick={() => onChange(channel.value)}
          title={channel.label}
          className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold rounded-lg whitespace-nowrap transition-all ${
            active
              ? 'bg-white text-primary-600 shadow-sm ring-1 ring-black/5'
              : 'text-gray-500 hover:bg-white/70 hover:text-gray-700'
          }`}
        >
          {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
          <span className="truncate">{channel.short || channel.label}</span>
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
  const hasValue = value !== 'all' && value !== '';

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

const Chip = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors ${
      active
        ? 'bg-primary-50 text-primary-700 border-primary-200'
        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
    }`}
  >
    {children}
  </button>
);

/**
 * Bộ lọc danh sách (H-12, H-13): hàng tab kênh (chỉ kênh user có), rồi MỘT hàng chip [Chưa đọc] [Cá nhân] [Nhóm] +
 * "Thời gian". Bỏ "Trạng thái" (100% hội thoại đang hoạt động) và "Sắp xếp" (chỉ sắp trong 20 dòng đã tải, server luôn
 * trả mới nhất trước) — "Chưa đọc" giờ lọc phía server nên áp lên cả danh sách.
 *
 * @param {{ filters: object, onChange: Function, availableChannels?: string[] }} props
 */
const ConversationFilters = ({ filters, onChange, availableChannels = [] }) => {
  const { t } = useI18n();
  const dateOptions = DATE_OPTIONS(t);

  const handleChange = (key, value) => {
    onChange({ ...filters, [key]: value });
  };

  const handleClearAdvanced = () => {
    onChange({ ...filters, date: 'all', kind: '', unreadOnly: false });
  };

  const allOptions = CHANNEL_OPTIONS(t);
  const channelOptions = [
    allOptions[0],
    ...allOptions.slice(1).filter((option) => availableChannels.includes(option.value)),
  ];
  // Một kênh duy nhất thì "Tất cả" và kênh đó là một — không cần hàng tab.
  const showChannels = channelOptions.length >= 3;
  const useDropdown = channelOptions.length - 1 > MAX_TABS;

  const hasAdvancedFilters = filters.date !== 'all' || !!filters.kind || filters.unreadOnly === true;

  return (
    <div className="space-y-2">
      {showChannels && (useDropdown ? (
        <FilterDropdown
          options={channelOptions.map((c) => ({ value: c.value, label: c.label }))}
          value={filters.channel}
          onChange={(val) => handleChange('channel', val)}
          label={t('inbox.channelFilterLabel')}
        />
      ) : (
        <ChannelTabs
          channels={channelOptions}
          value={filters.channel}
          onChange={(val) => handleChange('channel', val)}
        />
      ))}

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip active={filters.unreadOnly === true} onClick={() => handleChange('unreadOnly', !filters.unreadOnly)}>
          {t('inbox.chipUnread')}
        </Chip>
        <Chip active={filters.kind === 'personal'} onClick={() => handleChange('kind', filters.kind === 'personal' ? '' : 'personal')}>
          {t('inbox.chipPersonal')}
        </Chip>
        <Chip active={filters.kind === 'group'} onClick={() => handleChange('kind', filters.kind === 'group' ? '' : 'group')}>
          {t('inbox.chipGroup')}
        </Chip>
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

export { ConversationFilters, ChannelTabs, DATE_OPTIONS, CHANNEL_OPTIONS };
export default ConversationFilters;
