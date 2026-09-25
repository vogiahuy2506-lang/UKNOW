import { useState, useRef, useEffect, useMemo } from 'react';
import { HiOutlineSearch, HiOutlineChevronDown, HiOutlineCheck } from 'react-icons/hi';
import { PAYOS_BANK_BIN_MAP } from '../../../utils/payosBankBinMap';

function normalizeSearchText(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/**
 * BankSearchSelect — Combobox tìm kiếm ngân hàng có hỗ trợ gõ lọc tên / mã ngắn.
 * Đồng thời giữ một thẻ <select> ẩn để tương thích trọn vẹn với test và form accessibility.
 */
export default function BankSearchSelect({
  value,
  onChange,
  disabled = false,
  hasError = false,
  placeholder = 'Chọn ngân hàng',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  const selectedBank = value ? PAYOS_BANK_BIN_MAP[value] : null;

  // Lọc danh sách ngân hàng theo từ khoá
  const filteredBanks = useMemo(() => {
    const query = normalizeSearchText(searchQuery);
    const entries = Object.entries(PAYOS_BANK_BIN_MAP);
    if (!query) return entries;

    return entries.filter(([bin, info]) => {
      const normName = normalizeSearchText(info.name);
      const normShort = normalizeSearchText(info.short);
      return normName.includes(query) || normShort.includes(query) || bin.includes(query);
    });
  }, [searchQuery]);

  // Đóng khi click ngoài
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Tự focus ô tìm kiếm khi mở
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  const handleSelectBank = (bin) => {
    onChange(bin);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Nút bấm hiển thị / mở dropdown */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`w-full px-3 py-2 bg-white rounded-xl border text-sm text-left flex items-center justify-between transition-colors focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed ${
          hasError
            ? 'border-red-300 focus:ring-red-200'
            : isOpen
            ? 'border-primary-500 ring-2 ring-primary-100'
            : 'border-gray-300 hover:border-gray-400 focus:border-primary-500 focus:ring-primary-100'
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          {selectedBank ? (
            <>
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: selectedBank.color || '#3b82f6' }}
              />
              <span className="font-medium text-gray-900 truncate">
                {selectedBank.name}
              </span>
              <span className="text-xs text-gray-400 font-semibold shrink-0">
                ({selectedBank.short})
              </span>
            </>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </div>
        <HiOutlineChevronDown
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${
            isOpen ? 'rotate-180 text-primary-600' : ''
          }`}
        />
      </button>

      {/* Menu dropdown có ô tìm kiếm */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden animate-in fade-in duration-100">
          <div className="p-2 border-b border-gray-100 bg-gray-50/50">
            <div className="relative">
              <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm ngân hàng (vd: VCB, MB, Techcom...)"
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white rounded-lg border border-gray-200 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsOpen(false);
                  } else if (e.key === 'Enter' && filteredBanks.length > 0) {
                    e.preventDefault();
                    handleSelectBank(filteredBanks[0][0]);
                  }
                }}
              />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-gray-50 py-1">
            {filteredBanks.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-gray-500">
                Không tìm thấy ngân hàng &quot;{searchQuery}&quot;
              </div>
            ) : (
              filteredBanks.map(([bin, info]) => {
                const isSelected = value === bin;
                return (
                  <button
                    key={bin}
                    type="button"
                    onClick={() => handleSelectBank(bin)}
                    className={`w-full px-3 py-2 text-left flex items-center justify-between text-xs transition-colors hover:bg-primary-50/60 ${
                      isSelected ? 'bg-primary-50/80 font-semibold text-primary-700' : 'text-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: info.color || '#3b82f6' }}
                      />
                      <span className="truncate">{info.name}</span>
                      <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0">
                        {info.short}
                      </span>
                    </div>
                    {isSelected && (
                      <HiOutlineCheck className="w-4 h-4 text-primary-600 shrink-0 ml-2" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Thẻ select ẩn để giữ tương thích 100% với unit test và browser autocomplete */}
      <select
        disabled={disabled}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      >
        <option value="">{placeholder}</option>
        {Object.entries(PAYOS_BANK_BIN_MAP).map(([bin, info]) => (
          <option key={bin} value={bin}>
            {info.name} ({info.short})
          </option>
        ))}
      </select>
    </div>
  );
}
