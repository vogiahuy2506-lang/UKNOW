import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { HiOutlineCheck, HiOutlineSelector, HiOutlineOfficeBuilding, HiOutlineUser } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';

/**
 * Context Switcher — cho phép user chuyển giữa tài khoản cá nhân và
 * các tổ chức mà họ đang là employee.
 * Chỉ render khi user có ít nhất 1 membership.
 */
const ContextSwitcher = ({ showLabels = true }) => {
  const { t } = useI18n();
  const { user, activeContext, switchContext } = useAuthStore();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const memberships = user?.memberships || [];
  if (memberships.length === 0) return null;

  const isEmployeeCtx = activeContext?.type === 'employee';

  const currentLabel = isEmployeeCtx
    ? activeContext.ownerName || activeContext.ownerUsername || t('contextSwitcher.workingFor')
    : user?.fullName || user?.username || t('contextSwitcher.myAccount');

  const currentInitial = (
    (isEmployeeCtx ? activeContext.ownerName : user?.fullName || user?.username)?.[0] || 'T'
  ).toUpperCase();

  const handleSwitch = (ownerId) => {
    setOpen(false);
    switchContext(ownerId);
    navigate('/app');
  };

  const handleSelf = () => {
    setOpen(false);
    switchContext(null);
    navigate('/app');
  };

  // ─── Dropdown panel ──────────────────────────────
  const DropdownPanel = ({ className = '' }) => (
    <div className={`bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 z-50 ${className}`}>
      <p className="px-3 pt-1 pb-2 text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
        {t('contextSwitcher.switchContext')}
      </p>

      {/* Self */}
      <button
        onClick={handleSelf}
        className={`w-full flex items-center gap-2.5 px-3 py-2 transition-colors ${
          !isEmployeeCtx ? 'bg-primary-50/60' : 'hover:bg-gray-50'
        }`}
      >
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-sm">
          {(user?.fullName?.[0] || user?.username?.[0] || 'T').toUpperCase()}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-semibold text-gray-900 truncate leading-tight">
            {user?.fullName || user?.username}
          </p>
          <p className="text-[11px] text-gray-500 truncate mt-0.5">{t('contextSwitcher.personalAccount')}</p>
        </div>
        {!isEmployeeCtx && <HiOutlineCheck className="w-4 h-4 text-primary-600 flex-shrink-0" />}
      </button>

      {/* Memberships */}
      <div className="border-t border-gray-100 mt-1 pt-1">
        <p className="px-3 pt-1 pb-1.5 text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
          {t('contextSwitcher.workingFor')} ({memberships.length})
        </p>
        {memberships.map((m) => {
          const isActive = isEmployeeCtx && String(activeContext.ownerId) === String(m.ownerId);
          return (
            <button
              key={m.ownerId}
              onClick={() => handleSwitch(m.ownerId)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 transition-colors ${
                isActive ? 'bg-amber-50' : 'hover:bg-amber-50/60'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-sm">
                {(m.ownerName?.[0] || m.ownerUsername?.[0] || 'C').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold text-gray-900 truncate leading-tight">
                  {m.ownerName || m.ownerUsername}
                </p>
                <p className="text-[11px] text-gray-500 truncate mt-0.5">{t('contextSwitcher.employee')}</p>
              </div>
              {isActive && <HiOutlineCheck className="w-4 h-4 text-amber-600 flex-shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );

  // ─── Icon-only mode (sidebar collapsed) ─────────────────────────────────
  if (!showLabels) {
    return (
      <div ref={ref} className="relative flex justify-center">
        <button
          onClick={() => setOpen((v) => !v)}
          className={`relative flex justify-center items-center w-10 h-10 rounded-xl transition-all ${
            isEmployeeCtx
              ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md hover:shadow-lg'
              : 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-sm hover:shadow-md'
          }`}
          title={isEmployeeCtx ? `${t('contextSwitcher.workingAs')}: ${currentLabel}` : t('contextSwitcher.personalAccount')}
        >
          <span className="text-sm font-bold">{currentInitial}</span>
          {/* Badge chỉ báo có context để switch */}
          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-white border-2 border-white rounded-full shadow flex items-center justify-center">
            <span className="w-3 h-3 bg-gray-700 rounded-full flex items-center justify-center text-[8px] font-bold text-white leading-none">
              {memberships.length}
            </span>
          </span>
        </button>

        {open && <DropdownPanel className="absolute left-full top-0 ml-2 w-60" />}
      </div>
    );
  }

  // ─── Expanded mode (sidebar mở rộng) ───────────────────────────────────
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-all ${
          isEmployeeCtx
            ? 'bg-amber-50 hover:bg-amber-100 ring-1 ring-amber-200'
            : 'bg-gray-50 hover:bg-gray-100 ring-1 ring-gray-200'
        }`}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-sm bg-gradient-to-br ${
          isEmployeeCtx ? 'from-amber-400 to-orange-500' : 'from-primary-500 to-primary-600'
        }`}>
          {currentInitial}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-semibold text-gray-900 truncate leading-tight">
            {currentLabel}
          </p>
          <p className={`text-[11px] mt-0.5 truncate flex items-center gap-1 ${
            isEmployeeCtx ? 'text-amber-700' : 'text-gray-500'
          }`}>
            {isEmployeeCtx ? (
              <>
                <HiOutlineOfficeBuilding className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{t('contextSwitcher.workingAs')}</span>
              </>
            ) : (
              <>
                <HiOutlineUser className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{t('contextSwitcher.personalAccount')}</span>
              </>
            )}
          </p>
        </div>
        <HiOutlineSelector className={`w-4 h-4 flex-shrink-0 ${
          isEmployeeCtx ? 'text-amber-600' : 'text-gray-400'
        }`} />
      </button>

      {open && <DropdownPanel className="absolute left-0 right-0 top-full mt-1.5" />}
    </div>
  );
};

export default ContextSwitcher;
