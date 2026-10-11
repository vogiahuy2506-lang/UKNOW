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
 * Mọi tab kênh có thể có. Facebook không còn (kết nối Facebook đã chốt không làm, 21/09). Icon Telegram dùng logo máy bay
 * giấy, không dùng tam giác có vạch của heroicons (giống biển cảnh báo).
 *
 * Từ 11/10: bốn kênh có chỗ nối (`FIXED_INBOX_CHANNELS`) LUÔN hiện, kênh chưa nối thì đánh dấu "Chưa kết nối" và trang
 * Hộp thư mời kết nối — giấu tab khiến người dùng tưởng mất tính năng (trước đó H-12 chỉ hiện tab của kênh `availableChannels`).
 * `zalo_oa` không còn chỗ nối nên chỉ hiện khi tài khoản còn kênh đó.
 */
const CHANNEL_OPTIONS = (t) => [
  { value: '', label: t('inbox.allChannels'), Icon: HiGlobeAlt, short: t('inbox.channelAllShort') },
  { value: 'web', label: t('inbox.webChat'), Icon: HiChatAlt2, short: t('inbox.webChatShort') },
  { value: 'zalo_personal', label: t('inbox.zaloPersonal'), Icon: HiUser, short: t('inbox.zaloPersonalShort') },
  { value: 'zalo_oa', label: t('inbox.zaloOA'), Icon: HiDeviceMobile, short: 'OA' },
  { value: 'whatsapp_baileys', label: 'WhatsApp', Icon: FaWhatsapp, short: 'WA' },
  { value: 'telegram', label: 'Telegram', Icon: FaTelegramPlane, short: 'TG' },
];

/** Kênh luôn có tab, theo thứ tự hiển thị. Web chat nối ở Chatbot của tôi; Zalo/WhatsApp/Telegram nối ở Cài đặt kênh. */
const FIXED_INBOX_CHANNELS = ['web', 'zalo_personal', 'whatsapp_baileys', 'telegram'];

/** Từ 5 kênh trở lên (cộng "Tất cả" là 6 nút) thì gom thành một ô chọn "Kênh" thay vì hàng tab tràn ngang. */
const MAX_TABS = 4;

const ChannelTabs = ({ channels, value, onChange, notConnectedLabel }) => (
  <div className="flex gap-1 rounded-xl bg-gray-100 dark:bg-dk-raised p-1">
    {channels.map((channel) => {
      const active = value === channel.value;
      const Icon = channel.Icon;
      return (
        <button
          key={channel.value || 'all'}
          type="button"
          onClick={() => onChange(channel.value)}
          title={channel.notConnected ? `${channel.label} — ${notConnectedLabel}` : channel.label}
          className={`relative flex min-w-0 flex-auto items-center justify-center gap-1 px-1.5 py-1.5 text-[11px] font-semibold rounded-lg whitespace-nowrap transition-all ${
            active
              ? 'bg-white dark:bg-dk-surface text-primary-600 dark:text-primary-400 shadow-sm ring-1 ring-black/5 dark:ring-dk-border/10'
              : 'text-gray-500 dark:text-dk-text2 hover:bg-white/70 dark:hover:bg-dk-surface/60 hover:text-gray-700 dark:hover:text-dk-text'
          }`}
        >
          {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
          <span className="truncate">{channel.short || channel.label}</span>
          {/* Chấm xám nhỏ đặt chồng lên góc nút: không đổi kích thước nút, hàng tab không tràn thêm. */}
          {channel.notConnected && (
            <span
              role="img"
              aria-label={notConnectedLabel}
              className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-dk-border-strong"
            />
          )}
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
            ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 border-primary-200 dark:border-primary-800'
            : 'bg-white dark:bg-dk-raised text-gray-600 dark:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-strong border-gray-200 dark:border-dk-border'
        }`}
      >
        <span className="text-gray-400 dark:text-dk-muted">{label}:</span>
        <span className="truncate max-w-[88px] font-semibold">{selectedOption?.label || label}</span>
        <HiChevronDown className={`w-3 h-3 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white dark:bg-dk-surface rounded-lg shadow-lg border border-gray-100 dark:border-dk-border py-1 z-50 min-w-[128px]">
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
                  ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-950/40 font-semibold'
                  : 'text-gray-600 dark:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-raised'
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
        ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 border-primary-200 dark:border-primary-800'
        : 'bg-white dark:bg-dk-raised text-gray-600 dark:text-dk-text border-gray-200 dark:border-dk-border hover:bg-gray-50 dark:hover:bg-dk-strong'
    }`}
  >
    {children}
  </button>
);

/**
 * Bộ lọc danh sách (H-12, H-13): hàng tab kênh (bốn kênh cố định luôn hiện, kênh chưa nối có chấm xám), rồi MỘT hàng chip [Chưa đọc] [Cá nhân] [Nhóm] +
 * "Thời gian". Bỏ "Trạng thái" (100% hội thoại đang hoạt động) và "Sắp xếp" (chỉ sắp trong 20 dòng đã tải, server luôn
 * trả mới nhất trước) — "Chưa đọc" giờ lọc phía server nên áp lên cả danh sách.
 *
 * `channelsLoaded=false` (server chưa trả `availableChannels`, hoặc lỗi) → chưa biết kênh nào đã nối nên KHÔNG đánh dấu
 * "Chưa kết nối" ở tab nào (tránh nháy rồi đổi).
 *
 * @param {{ filters: object, onChange: Function, availableChannels?: string[], channelsLoaded?: boolean }} props
 */
const ConversationFilters = ({ filters, onChange, availableChannels = [], channelsLoaded = true }) => {
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
    ...allOptions
      .slice(1)
      .filter((option) => FIXED_INBOX_CHANNELS.includes(option.value) || availableChannels.includes(option.value))
      .map((option) => ({
        ...option,
        notConnected: channelsLoaded && !availableChannels.includes(option.value),
      })),
  ];
  const useDropdown = channelOptions.length - 1 > MAX_TABS;

  const hasAdvancedFilters = filters.date !== 'all' || !!filters.kind || filters.unreadOnly === true;

  return (
    <div className="space-y-2">
      {useDropdown ? (
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
          notConnectedLabel={t('inbox.channelNotConnectedBadge')}
        />
      )}

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
            className="ml-auto flex items-center gap-0.5 px-2 py-1.5 text-[11px] font-medium text-gray-500 dark:text-dk-text2 hover:text-gray-700 dark:hover:text-dk-text rounded-lg hover:bg-gray-100 dark:hover:bg-dk-raised"
          >
            <HiX className="w-3 h-3" />
            {t('inbox.clearFilters')}
          </button>
        )}
      </div>
    </div>
  );
};

export { ConversationFilters, ChannelTabs, DATE_OPTIONS, CHANNEL_OPTIONS, FIXED_INBOX_CHANNELS };
export default ConversationFilters;
