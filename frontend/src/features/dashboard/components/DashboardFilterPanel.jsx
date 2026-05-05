import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const CHANNEL_BADGE = {
  email: 'bg-sky-100 text-sky-700',
  zalo: 'bg-blue-100 text-blue-700',
  zalo_group: 'bg-purple-100 text-purple-700',
};

/**
 * Custom checkbox dropdown for campaign selection.
 * Replaces native <select multiple> with a searchable, accessible list.
 *
 * @param {object} props
 * @param {Array<{id: number, label: string, campaignType: string}>} props.options
 * @param {number[]} props.selectedIds
 * @param {function(number[]): void} props.onChange
 * @returns {JSX.Element}
 */
const CampaignCheckboxDropdown = ({ options, selectedIds, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = search.trim()
    ? options.filter((opt) =>
        opt.label.toLowerCase().includes(search.trim().toLowerCase()) ||
        opt.campaignType.toLowerCase().includes(search.trim().toLowerCase())
      )
    : options;

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((opt) => selectedIds.includes(opt.id));

  const toggleItem = (id) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
    );
  };

  const toggleAllFiltered = () => {
    if (allFilteredSelected) {
      const filteredIds = new Set(filtered.map((opt) => opt.id));
      onChange(selectedIds.filter((id) => !filteredIds.has(id)));
    } else {
      const toAdd = filtered.map((opt) => opt.id).filter((id) => !selectedIds.includes(id));
      onChange([...selectedIds, ...toAdd]);
    }
  };

  const triggerLabel =
    selectedIds.length === 0
      ? 'Tất cả chiến dịch'
      : selectedIds.length === 1
      ? options.find((o) => o.id === selectedIds[0])?.label || '1 chiến dịch'
      : `${selectedIds.length} chiến dịch đã chọn`;

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-sm transition-base ${
          isOpen
            ? 'border-primary-400 ring-1 ring-primary-400 bg-white'
            : 'border-gray-300 bg-white hover:border-gray-400'
        } ${selectedIds.length > 0 ? 'text-gray-900 font-medium' : 'text-gray-500'}`}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span className="truncate">{triggerLabel}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {selectedIds.length > 0 && (
            <span
              className="flex items-center justify-center w-5 h-5 rounded-full bg-primary-100 text-primary-600 text-[10px] font-bold"
            >
              {selectedIds.length}
            </span>
          )}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl border border-gray-200 shadow-xl z-10 overflow-hidden">
          {/* Search */}
          <div className="p-2.5 border-b border-gray-100">
            <div className="relative">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:border-primary-400 focus:ring-1 focus:ring-primary-400 transition-base placeholder-gray-400"
                placeholder="Tìm chiến dịch..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          {/* Select all row */}
          {filtered.length > 0 && (
            <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/50">
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 rounded border-gray-300 text-primary-500 cursor-pointer accent-orange-500"
                  checked={allFilteredSelected}
                  onChange={toggleAllFiltered}
                />
                <span className="text-xs font-medium text-gray-500 group-hover:text-gray-700">
                  {allFilteredSelected ? 'Bỏ chọn tất cả' : `Chọn tất cả (${filtered.length})`}
                </span>
              </label>
            </div>
          )}

          {/* List */}
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-gray-400 text-center">
                Không tìm thấy chiến dịch phù hợp
              </div>
            ) : (
              filtered.map((opt) => {
                const checked = selectedIds.includes(opt.id);
                const badgeCls = CHANNEL_BADGE[opt.campaignType] || 'bg-gray-100 text-gray-600';
                return (
                  <label
                    key={opt.id}
                    className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
                      checked ? 'bg-primary-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 rounded border-gray-300 cursor-pointer accent-orange-500 shrink-0"
                      checked={checked}
                      onChange={() => toggleItem(opt.id)}
                    />
                    <span className="flex-1 text-sm text-gray-800 truncate leading-snug">
                      {opt.label}
                    </span>
                    <span className={`badge text-[10px] px-1.5 py-0 shrink-0 ${badgeCls}`}>
                      {opt.campaignType}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          {/* Footer summary */}
          {selectedIds.length > 0 && (
            <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
              <span className="text-xs text-primary-600 font-medium">
                Đã chọn {selectedIds.length} chiến dịch
              </span>
              <button
                type="button"
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                onClick={() => onChange([])}
              >
                Xóa tất cả
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const CAMPAIGN_TYPE_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'email', label: 'Email' },
  { value: 'zalo', label: 'Zalo' },
  { value: 'zalo_group', label: 'Zalo group' },
];

const QUICK_RANGES = [
  { key: '7d',  label: '7 ngày',   days: 6  },
  { key: '30d', label: '30 ngày',  days: 29 },
  { key: '90d', label: '90 ngày',  days: 89 },
  { key: '3m',  label: '3 tháng',  months: 3  },
  { key: '6m',  label: '6 tháng',  months: 6  },
  { key: '12m', label: '12 tháng', months: 12 },
];

/**
 * Chuyển Date thành chuỗi YYYY-MM-DD theo giờ local.
 *
 * @param {Date} value
 * @returns {string}
 */
const toLocalDateString = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Slide-over filter panel for dashboard.
 *
 * Opens from the right side, contains date range, campaign type,
 * and multi-campaign selectors.
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {function} props.onClose
 * @param {object} props.draftFilters
 * @param {function} props.setDraftFilters
 * @param {Array<{id: number, label: string, campaignType: string}>} props.campaignOptions
 * @param {function} props.onApply
 * @returns {JSX.Element}
 */
/**
 * @param {object}   props
 * @param {boolean}  props.isOpen
 * @param {function} props.onClose
 * @param {object}   props.draftFilters
 * @param {function} props.setDraftFilters
 * @param {Array}    props.campaignOptions
 * @param {function} props.onApply
 * @param {'quick'|'custom'} props.dateMode      - Lifted to parent to survive skeleton re-mounts
 * @param {function} props.setDateMode
 * @param {string|null} props.activeQuickKey     - Key of the highlighted quick-range button
 * @param {function} props.setActiveQuickKey
 * @param {string} [props.panelTitle]
 * @param {string} [props.panelDescription]
 */
const DashboardFilterPanel = ({
  isOpen, onClose,
  draftFilters, setDraftFilters,
  campaignOptions, onApply,
  dateMode, setDateMode,
  activeQuickKey, setActiveQuickKey,
  panelTitle = 'Bộ lọc Dashboard',
  panelDescription = 'Tùy chỉnh phạm vi dữ liệu hiển thị',
}) => {

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKey);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const selectedCampaignIds = draftFilters?.campaignIds || [];

  const handleCampaignChange = (ids) => {
    setDraftFilters((prev) => ({ ...prev, campaignIds: ids }));
  };

  const applyQuickRange = (range) => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Month ranges: start = 1st of (currentMonth - (n-1)), so "3 tháng" = Jan→Mar, not Dec→Mar
    const start = range.months
      ? new Date(end.getFullYear(), end.getMonth() - (range.months - 1), 1)
      : new Date(end.getTime() - range.days * 24 * 60 * 60 * 1000);
    setActiveQuickKey(range.key);
    setDraftFilters((prev) => ({
      ...prev,
      startDate: toLocalDateString(start),
      endDate: toLocalDateString(end),
    }));
  };

  const handleDateChange = (field, value) => {
    setActiveQuickKey(null);
    setDraftFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleSwitchToCustom = () => {
    setDateMode('custom');
    setActiveQuickKey(null);
  };

  const handleSwitchToQuick = () => {
    setDateMode('quick');
  };

  const handleApply = () => {
    onApply();
    onClose();
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity duration-200 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div
        className={`fixed top-0 right-0 h-screen w-[400px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-250 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{panelTitle}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{panelDescription}</p>
          </div>
          <button
            type="button"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-base"
            onClick={onClose}
            aria-label="Đóng bộ lọc"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body - scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Date filter — mode toggle + conditional content */}
          <div>
            {/* Mode toggle tabs */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-4">
              <button
                type="button"
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-base ${
                  dateMode === 'quick'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                onClick={handleSwitchToQuick}
              >
                Chọn nhanh
              </button>
              <button
                type="button"
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-base ${
                  dateMode === 'custom'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                onClick={handleSwitchToCustom}
              >
                Khoảng thời gian
              </button>
            </div>

            {/* Quick ranges — 3-column grid */}
            {dateMode === 'quick' && (
              <div className="grid grid-cols-3 gap-2">
                {QUICK_RANGES.map((range) => (
                  <button
                    key={range.key}
                    type="button"
                    className={`py-2 rounded-lg text-xs font-semibold border transition-base ${
                      activeQuickKey === range.key
                        ? 'bg-primary-500 text-white border-primary-500 shadow-sm'
                        : 'border-gray-200 text-gray-600 bg-white hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50'
                    }`}
                    onClick={() => applyQuickRange(range)}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            )}

            {/* Custom date range inputs */}
            {dateMode === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Từ ngày</label>
                  <input
                    type="date"
                    className="input text-sm"
                    value={draftFilters.startDate}
                    onChange={(e) => handleDateChange('startDate', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Đến ngày</label>
                  <input
                    type="date"
                    className="input text-sm"
                    value={draftFilters.endDate}
                    onChange={(e) => handleDateChange('endDate', e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Campaign type */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Loại kênh</p>
            <div className="flex flex-wrap gap-2">
              {CAMPAIGN_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-base ${
                    draftFilters.campaignType === opt.value
                      ? 'bg-primary-500 text-white border-primary-500 shadow-sm'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => setDraftFilters((prev) => ({ ...prev, campaignType: opt.value }))}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Campaign multi-select — custom checkbox dropdown */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Chiến dịch cụ thể
            </p>
            <CampaignCheckboxDropdown
              options={campaignOptions}
              selectedIds={selectedCampaignIds}
              onChange={handleCampaignChange}
            />
            <p className="text-xs text-gray-400 mt-2">
              Không chọn = lấy tất cả chiến dịch trong bộ lọc trên.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0 bg-gray-50/50">
          <button type="button" className="btn btn-secondary flex-1" onClick={onClose}>
            Hủy
          </button>
          <button type="button" className="btn btn-primary flex-1" onClick={handleApply}>
            Áp dụng bộ lọc
          </button>
        </div>
      </div>
    </>,
    document.body
  );
};

export default DashboardFilterPanel;
