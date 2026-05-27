import { useEffect, useRef, useState } from 'react';
import { HiOutlinePlus, HiOutlineCheck, HiOutlineX } from 'react-icons/hi';
import adminPlansApiService from '../services/adminPlansApi.service';
import { useI18n } from '../../../i18n';

// ── PriceInput ────────────────────────────────────────────────────────────────
export const PriceInput = ({ value, onChange, className = 'input w-full' }) => {
  const { t } = useI18n();
  const fmt = (n) => n ? Number(n).toLocaleString('vi-VN') : '';

  const handleChange = (e) => {
    const digits = e.target.value.replace(/\./g, '').replace(/\D/g, '');
    onChange(digits === '' ? 0 : Number(digits));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      className={className}
      value={fmt(value)}
      onChange={handleChange}
      placeholder={t('planInputs.pricePlaceholder')}
    />
  );
};

// ── FeatureEditor ─────────────────────────────────────────────────────────────
export const FeatureEditor = ({ features, onChange }) => {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onChange([...features, trimmed]);
    setDraft('');
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        {features.map((f, i) => (
          <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
            <HiOutlineCheck className="w-3.5 h-3.5 text-green-500 shrink-0" />
            <span className="text-sm text-gray-700 flex-1">{f}</span>
            <button
              type="button"
              onClick={() => onChange(features.filter((_, j) => j !== i))}
              className="text-gray-400 hover:text-red-500 transition-colors"
            >
              <HiOutlineX className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={t('planInputs.featuresPlaceholder')}
          className="input flex-1 text-sm"
        />
        <button type="button" onClick={add} className="btn btn-secondary px-3">
          <HiOutlinePlus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ── EmailAutocomplete ─────────────────────────────────────────────────────────
export const EmailAutocomplete = ({ value, onChange, placeholder = 'user@example.com', excludeWithPlan = false }) => {
  const { t } = useI18n();
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchSuggestions = async (q) => {
    try {
      const res = await adminPlansApiService.searchUsers(q, excludeWithPlan);
      const list = res.data.data || [];
      setSuggestions(list);
      setOpen(list.length > 0);
    } catch { /* silent */ }
  };

  const handleChange = (e) => {
    const q = e.target.value;
    onChange(q);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchSuggestions(q), 250);
  };

  const handleFocus = () => {
    if (suggestions.length > 0) { setOpen(true); return; }
    fetchSuggestions(value);
  };

  const pick = (email) => {
    onChange(email);
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <input
        type="text"
        autoFocus
        autoComplete="off"
        className="input w-full bg-white"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
      />
      {open && (
        <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {suggestions.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(u.email); }}
                className="w-full flex items-start gap-2 px-3 py-2.5 hover:bg-gray-50 text-left transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-800">{u.email}</p>
                  {u.full_name && <p className="text-xs text-gray-400">{u.full_name}</p>}
                </div>
                {u.active_plan_id && (
                  <span className="ml-auto text-xs text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full shrink-0 self-center">
                    {t('planInputs.hasPlan')}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ── EmployeeInput — chỉ nhập số nguyên dương, trống = không giới hạn ─────────
export const EmployeeInput = ({ value, onChange, className = 'input w-full' }) => {
  const { t } = useI18n();
  const displayVal = (value === -1 || value === '' || value == null) ? '' : String(value);

  const handleChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').replace(/^0+(\d)/, '$1');
    onChange(digits === '' ? -1 : Number(digits));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      className={className}
      placeholder={t('planInputs.employeesPlaceholder')}
      value={displayVal}
      onChange={handleChange}
    />
  );
};

// ── DurationInput — nhập số + đơn vị (ngày / tuần / tháng / năm) ─────────────
const DURATION_UNITS_KEYS = [
  { key: 'durationUnitDay',   value: 'day',   mult: 1   },
  { key: 'durationUnitWeek',  value: 'week',  mult: 7   },
  { key: 'durationUnitMonth', value: 'month', mult: 30  },
  { key: 'durationUnitYear',  value: 'year',  mult: 365 },
];

const daysToInput = (days) => {
  if (!days) return { num: '', unit: 'day' };
  const d = Number(days);
  if (d % 365 === 0) return { num: d / 365, unit: 'year'  };
  if (d % 30  === 0) return { num: d / 30,  unit: 'month' };
  if (d % 7   === 0) return { num: d / 7,   unit: 'week'  };
  return { num: d, unit: 'day' };
};

export const DurationInput = ({ value, onChange }) => {
  const { t } = useI18n();
  const isEmpty = value === '' || value == null;
  const parsed  = daysToInput(isEmpty ? '' : value);

  const [unlimited, setUnlimited] = useState(isEmpty);
  const [num,  setNum]  = useState(parsed.num);
  const [unit, setUnit] = useState(parsed.unit);

  useEffect(() => {
    const isNowEmpty = value === '' || value == null;
    if (isNowEmpty) {
      setUnlimited(true);
    } else {
      const p = daysToInput(value);
      setUnlimited(false);
      setNum(p.num);
      setUnit(p.unit);
    }
  }, [value]);

  const emit = (n, u) => {
    const mult = DURATION_UNITS_KEYS.find((x) => x.value === u)?.mult ?? 1;
    const days = n === '' || n == null ? '' : Number(n) * mult;
    onChange(days === '' || isNaN(days) ? '' : days);
  };

  const handleUnlimitedChange = (checked) => {
    setUnlimited(checked);
    if (checked) {
      onChange('');
    } else {
      const defaultNum = num || 1;
      setNum(defaultNum);
      emit(defaultNum, unit);
    }
  };

  const handleNumChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').replace(/^0+(\d)/, '$1');
    setNum(raw === '' ? '' : Number(raw));
    emit(raw === '' ? '' : Number(raw), unit);
  };

  const handleUnitChange = (e) => {
    setUnit(e.target.value);
    emit(num, e.target.value);
  };

  const totalDays = !unlimited && num !== '' && num > 0
    ? Number(num) * (DURATION_UNITS_KEYS.find((x) => x.value === unit)?.mult ?? 1)
    : null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Unlimited toggle pill */}
      <button
        type="button"
        onClick={() => handleUnlimitedChange(!unlimited)}
        className={`inline-flex h-11 items-center gap-1.5 px-3 rounded-xl text-xs font-semibold border transition-all shrink-0 ${
          unlimited
            ? 'bg-orange-50 border-orange-200 text-orange-700'
            : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
        }`}
      >
        <span className={`w-2 h-2 rounded-full ${unlimited ? 'bg-orange-500' : 'bg-gray-300'}`} />
        {t('planInputs.durationUnlimited')}
      </button>

      {!unlimited && (
        <>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <input
              type="text"
              inputMode="numeric"
              className="input h-11 w-24 text-center shrink-0"
              placeholder="1"
              value={num}
              onChange={handleNumChange}
            />
            <select className="input h-11 flex-1 min-w-0" value={unit} onChange={handleUnitChange}>
              {DURATION_UNITS_KEYS.map((u) => (
                <option key={u.value} value={u.value}>{t(`planInputs.${u.key}`)}</option>
              ))}
            </select>
          </div>
          {totalDays !== null && (
            <span className="text-xs text-gray-500 shrink-0 bg-gray-50 px-2.5 py-1.5 rounded-lg border border-gray-100">
              {t('planInputs.durationEqualsNDays').replace('{n}', totalDays)}
            </span>
          )}
        </>
      )}
    </div>
  );
};

// ── LimitInput — input số với toggle "Không hỗ trợ" (-1) ─────────────────────
/** value: '' = unlimited, -1 = not supported, number = limit */
const LimitInput = ({ value, onChange, placeholder }) => {
  const { t } = useI18n();
  const isNotSupported = value === -1 || value === '-1';

  const handleToggleNA = () => {
    onChange(isNotSupported ? '' : -1);
  };

  const handleInputChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').replace(/^0+(\d)/, '$1');
    onChange(digits === '' ? '' : Number(digits));
  };

  return (
    <div className="flex gap-2">
      {isNotSupported ? (
        <div className="input h-11 flex-1 flex items-center bg-rose-50 border-rose-200">
          <span className="text-sm font-semibold text-rose-600">{t('planInputs.notSupported')}</span>
        </div>
      ) : (
        <input
          type="text"
          inputMode="numeric"
          className="input h-11 flex-1 min-w-0"
          placeholder={placeholder || t('planInputs.noLimit')}
          value={value ?? ''}
          onChange={handleInputChange}
        />
      )}
      <button
        type="button"
        title={isNotSupported ? t('planInputs.noLimit') : t('planInputs.notSupported')}
        onClick={handleToggleNA}
        className={`shrink-0 h-11 px-3 rounded-xl border text-xs font-bold transition-all ${
          isNotSupported
            ? 'bg-rose-100 border-rose-300 text-rose-700 hover:bg-rose-50'
            : 'bg-white border-gray-200 text-gray-500 hover:border-rose-300 hover:text-rose-600'
        }`}
      >
        N/A
      </button>
    </div>
  );
};

// ── SendLimitsFields — 2×2 grid dùng chung cho cả 2 modal ────────────────────
export const SendLimitsFields = ({ form, set, hint }) => {
  const { t } = useI18n();
  const hintText = hint || t('planInputs.hintLeaveEmptyUnlimited');

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">{hintText}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          ['dailyEmailLimit',   t('planInputs.emailPerDay'),   t('planInputs.emailPerDayPlaceholder')],
          ['monthlyEmailLimit', t('planInputs.emailPerMonth'),  t('planInputs.emailPerMonthPlaceholder')],
          ['dailyZaloLimit',    t('planInputs.zaloPerDay'),    t('planInputs.zaloPerDayPlaceholder')],
          ['monthlyZaloLimit',  t('planInputs.zaloPerMonth'),   t('planInputs.zaloPerMonthPlaceholder')],
        ].map(([key, label, ph]) => (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
            <LimitInput value={form[key]} onChange={(v) => set(key, v)} placeholder={ph} />
          </div>
        ))}
      </div>
    </div>
  );
};

// ── ResourceLimitsFields — giới hạn số lượng tài nguyên theo gói ─────────────
export const ResourceLimitsFields = ({ form, set, hint }) => {
  const { t } = useI18n();
  const hintText = hint || t('planInputs.hintLeaveEmptyUnlimited');

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">{hintText}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          ['maxLandingPages',       t('planInputs.landingPages')],
          ['maxCampaigns',          t('planInputs.campaigns')],
          ['maxZaloCampaigns',      t('planInputs.zaloCampaigns')],
          ['maxZaloGroupCampaigns', t('planInputs.zaloGroupCampaigns')],
          ['maxEmailCampaigns',     t('planInputs.emailCampaigns')],
          ['maxZaloAccounts',       t('planInputs.zaloAccounts')],
          ['maxEmailAccounts',      t('planInputs.emailAccounts')],
          ['maxEmailTemplates',     t('planInputs.emailTemplates')],
          ['maxZaloTemplates',      t('planInputs.zaloTemplates')],
        ].map(([key, label]) => (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
            <LimitInput value={form[key] ?? ''} onChange={(v) => set(key, v)} />
          </div>
        ))}
      </div>
    </div>
  );
};
