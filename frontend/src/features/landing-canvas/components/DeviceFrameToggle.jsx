import { useState, useRef, useEffect } from 'react';
import { HiOutlineChevronDown, HiOutlineCheck } from 'react-icons/hi';
import { DEVICES, DEFAULT_VIEWPORT } from '../utils/deviceFrameConfig.js';

/**
 * Dropdown chọn thiết bị mô phỏng: Desktop / Tablet / Mobile.
 * Thiết kế gọn gàng, tiết kiệm diện tích trên thanh công cụ Topbar.
 */
export default function DeviceFrameToggle({ value = DEFAULT_VIEWPORT, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  const currentDevice = DEVICES[value] || DEVICES.desktop;
  const CurrentIcon = currentDevice.icon;

  // Đóng khi click outside hoặc ấn Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title={`Thiết bị: ${currentDevice.label} (${currentDevice.width} × ${currentDevice.height} px)`}
        className={`h-[34px] px-2.5 rounded-xl border text-xs font-semibold transition-all inline-flex items-center gap-1.5 box-border select-none ${
          isOpen
            ? 'bg-orange-50 text-orange-700 border-orange-200 ring-2 ring-orange-500/15'
            : 'bg-white text-gray-700 border-gray-200/90 hover:bg-gray-50 hover:text-gray-900 shadow-2xs'
        }`}
      >
        <CurrentIcon className="w-4 h-4 text-orange-600 shrink-0" />
        <span>{currentDevice.label}</span>
        <HiOutlineChevronDown
          className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-orange-600' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          className="absolute left-0 mt-1.5 w-56 bg-white rounded-2xl shadow-xl border border-gray-200/90 py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150 select-none"
        >
          <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            Thiết bị mô phỏng
          </div>
          {Object.values(DEVICES).map((device) => {
            const Icon = device.icon;
            const active = value === device.key;
            return (
              <button
                key={device.key}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange?.(device.key);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors ${
                  active
                    ? 'bg-orange-50/80 text-orange-900 font-semibold'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      active ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 leading-tight">{device.label}</div>
                    <div className="text-[11px] text-gray-400 leading-tight mt-0.5">
                      {device.width} × {device.height} px
                    </div>
                  </div>
                </div>
                {active && <HiOutlineCheck className="w-4 h-4 text-orange-600 shrink-0 ml-2" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { DEVICES, DEFAULT_VIEWPORT };
