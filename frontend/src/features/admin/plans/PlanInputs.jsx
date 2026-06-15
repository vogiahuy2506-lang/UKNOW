import { useEffect, useRef, useState, useCallback } from 'react';
import { HiChevronDown, HiOutlinePlus, HiOutlineCheck, HiOutlineX } from 'react-icons/hi';
import { HiOutlineSparkles } from 'react-icons/hi2';
import adminPlansApiService from '../services/adminPlansApi.service';
import { useI18n } from '../../../i18n';
import { normalizeMoneyValue } from './planUtils.jsx';

// ── PriceInput ────────────────────────────────────────────────────────────────
export const PriceInput = ({ value, onChange, className = 'input w-full' }) => {
  const { t } = useI18n();
  const fmt = (n) => {
    const normalized = normalizeMoneyValue(n);
    return normalized === '' ? '' : Number(normalized).toLocaleString('vi-VN');
  };

  const handleChange = (e) => {
    const normalized = normalizeMoneyValue(e.target.value);
    onChange(normalized === '' ? 0 : normalized);
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
const normalizeFeatures = (features) => {
  if (Array.isArray(features)) return features;
  if (typeof features === 'string') {
    try { return JSON.parse(features) || []; } catch { return []; }
  }
  return [];
};

export const FeatureEditor = ({ features, onChange }) => {
  const { t, locale } = useI18n();
  const [draft, setDraft] = useState('');
  const [translatingIdxs, setTranslatingIdxs] = useState(new Set());
  const featuresRef = useRef(features);
  useEffect(() => { featuresRef.current = features; }, [features]);

  const list = normalizeFeatures(features);

  const viOnlyIdxs = list
    .map((f, i) => ({ i, text: typeof f === 'string' ? f : null }))
    .filter(({ text }) => text !== null);

  const getDisplayText = (f) => {
    if (typeof f === 'object' && f !== null) return f[locale] || f.vi || f.en || '';
    return f;
  };

  const translateOne = useCallback(async (text, idx) => {
    setTranslatingIdxs(prev => new Set([...prev, idx]));
    try {
      const { data } = await adminPlansApiService.translateFeatures([text]);
      const en = data.data?.[0];
      if (!en) return;
      const current = normalizeFeatures(featuresRef.current);
      if (typeof current[idx] === 'string') {
        const next = [...current];
        next[idx] = { vi: text, en };
        onChange(next);
      }
    } catch {
      // silently fail — stays as string, VI only badge appears
    } finally {
      setTranslatingIdxs(prev => { const s = new Set(prev); s.delete(idx); return s; });
    }
  }, [onChange]);

  const autoTranslateAll = async () => {
    if (viOnlyIdxs.length === 0) return;
    const allTranslating = new Set(viOnlyIdxs.map(({ i }) => i));
    setTranslatingIdxs(allTranslating);
    try {
      const { data } = await adminPlansApiService.translateFeatures(viOnlyIdxs.map(({ text }) => text));
      const translations = data.data;
      const current = normalizeFeatures(featuresRef.current);
      const updated = [...current];
      viOnlyIdxs.forEach(({ i, text }, arrIdx) => {
        if (typeof updated[i] === 'string') updated[i] = { vi: text, en: translations[arrIdx] };
      });
      onChange(updated);
    } catch {
      // silently fail
    } finally {
      setTranslatingIdxs(new Set());
    }
  };

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const newIdx = list.length;
    onChange([...list, trimmed]);
    setDraft('');
    translateOne(trimmed, newIdx);
  };

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();
    if (e.nativeEvent.isComposing) return;
    add();
  };

  return (
    <div className="space-y-2">
      {viOnlyIdxs.length > 0 && (
        <button
          type="button"
          onClick={autoTranslateAll}
          disabled={translatingIdxs.size > 0}
          className="flex items-center gap-1.5 text-xs font-medium text-orange-600 hover:text-orange-700 disabled:opacity-50 transition-colors"
        >
          <HiOutlineSparkles className="w-3.5 h-3.5" />
          {translatingIdxs.size > 0 ? 'Đang dịch...' : `Auto-translate ${viOnlyIdxs.length} VI only`}
        </button>
      )}
      <div className="space-y-1">
        {list.map((f, i) => {
          const isObj = typeof f === 'object' && f !== null;
          const isTranslating = translatingIdxs.has(i);
          return (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
              <HiOutlineCheck className="w-3.5 h-3.5 text-green-500 shrink-0" />
              <span className="text-sm text-gray-700 flex-1">{getDisplayText(f)}</span>
              {isTranslating && (
                <span className="text-[10px] text-gray-400 animate-pulse">translating...</span>
              )}
              {!isObj && !isTranslating && (
                <span className="text-[10px] text-amber-500 font-medium">VI only</span>
              )}
              <button
                type="button"
                onClick={() => onChange(list.filter((_, j) => j !== i))}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <HiOutlineX className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
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

// ── DurationInput — nhập số + đơn vị (ngày / tháng / năm) ───────────────────
const DURATION_UNITS_KEYS = [
  { key: 'durationUnitDay',   value: 'day',   mult: 1   },
  { key: 'durationUnitMonth', value: 'month', mult: 30  },
  { key: 'durationUnitYear',  value: 'year',  mult: 365 },
];

const daysToInput = (days) => {
  if (!days) return { num: '', unit: 'day' };
  const d = Number(days);
  if (d % 365 === 0) return { num: d / 365, unit: 'year'  };
  if (d % 30  === 0) return { num: d / 30,  unit: 'month' };
  return { num: d, unit: 'day' };
};

export const DurationInput = ({ value, onChange }) => {
  const { t } = useI18n();
  const isEmpty = value === '' || value == null;
  const parsed  = daysToInput(isEmpty ? '' : value);

  const [unlimited, setUnlimited] = useState(isEmpty);
  const [num,  setNum]  = useState(parsed.num);
  const [unit, setUnit] = useState(parsed.unit);
  const [unitMenuOpen, setUnitMenuOpen] = useState(false);
  const unitMenuRef = useRef(null);

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

  useEffect(() => {
    const handler = (e) => {
      if (unitMenuRef.current && !unitMenuRef.current.contains(e.target)) {
        setUnitMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

  const handleUnitChange = (nextUnit) => {
    setUnit(nextUnit);
    setUnitMenuOpen(false);
    emit(num, nextUnit);
  };

  const totalDays = !unlimited && num !== '' && num > 0
    ? Number(num) * (DURATION_UNITS_KEYS.find((x) => x.value === unit)?.mult ?? 1)
    : null;

  return (
    <div className="space-y-2">
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-[auto_minmax(0,1fr)_8.5rem]">
        <button
          type="button"
          onClick={() => handleUnlimitedChange(!unlimited)}
          className={`inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-all sm:w-auto ${
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
            <input
              type="text"
              inputMode="numeric"
              className="h-11 min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-center text-sm font-semibold text-slate-900 transition-base focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              placeholder="1"
              value={num}
              onChange={handleNumChange}
            />
            <div className="relative min-w-0" ref={unitMenuRef}>
              <button
                type="button"
                onClick={() => setUnitMenuOpen((open) => !open)}
                className="flex h-11 w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-orange-300 hover:bg-orange-50/40 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
              >
                <span>{t(`planInputs.${DURATION_UNITS_KEYS.find((u) => u.value === unit)?.key || 'durationUnitDay'}`)}</span>
                <HiChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${unitMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {unitMenuOpen && (
                <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                  {DURATION_UNITS_KEYS.map((u) => {
                    const selected = unit === u.value;
                    return (
                      <button
                        key={u.value}
                        type="button"
                        onClick={() => handleUnitChange(u.value)}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors ${
                          selected
                            ? 'bg-orange-50 text-orange-700'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        {t(`planInputs.${u.key}`)}
                        {selected && <HiOutlineCheck className="h-4 w-4" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {totalDays !== null && unit !== 'day' && (
        <span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500">
          {t('planInputs.durationEqualsNDays').replace('{n}', totalDays)}
        </span>
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

// ── PeriodMessagesField — quota tổng theo chu kỳ gói + Fair Usage Policy ─────
export const PeriodMessagesField = ({ form, set }) => {
  const { t } = useI18n();

  const handleInputChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').replace(/^0+(\d)/, '$1');
    set('messagesPerPeriod', digits === '' ? '' : Number(digits));
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {t('planInputs.messagesPerPeriod')}
          </label>
          <input
            type="text"
            inputMode="numeric"
            className="input h-11 w-full"
            placeholder={t('planInputs.messagesPerPeriodPlaceholder')}
            value={form.messagesPerPeriod ?? ''}
            onChange={handleInputChange}
          />
          <p className="mt-1.5 text-xs text-slate-400">{t('planInputs.messagesPerPeriodHint')}</p>
        </div>
        <label className="flex cursor-pointer items-center rounded-xl border border-slate-200 bg-white px-4 py-3">
          <input
            type="checkbox"
            className="h-4 w-4 rounded text-primary-600"
            checked={Boolean(form.isFupEnabled)}
            onChange={(e) => set('isFupEnabled', e.target.checked)}
          />
          <span className="ml-3">
            <span className="block text-sm font-semibold text-slate-800">{t('planInputs.fupEnabled')}</span>
            <span className="text-xs text-slate-500">{t('planInputs.fupDescription')}</span>
          </span>
        </label>
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
          ['maxChatbots',           'Chatbot AI'],
          ['aiTokensPerPeriod',    'Token AI / kỳ'],
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
