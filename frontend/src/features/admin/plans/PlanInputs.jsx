import { useEffect, useRef, useState } from 'react';
import { HiOutlinePlus, HiOutlineCheck, HiOutlineX } from 'react-icons/hi';
import adminPlansApiService from '../services/adminPlansApi.service';

// ── PriceInput ────────────────────────────────────────────────────────────────
export const PriceInput = ({ value, onChange, className = 'input w-full' }) => {
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
      placeholder="0"
    />
  );
};

// ── FeatureEditor ─────────────────────────────────────────────────────────────
export const FeatureEditor = ({ features, onChange }) => {
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
          placeholder="Thêm tính năng... (Enter để thêm)"
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
                    Có gói
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
      placeholder="Không giới hạn"
      value={displayVal}
      onChange={handleChange}
    />
  );
};

// ── DurationInput — chọn thời hạn gói (preset + tùy chỉnh) ──────────────────
const DURATION_PRESETS = [
  { label: 'Không giới hạn', value: '' },
  { label: '10 ngày (dùng thử)', value: 10 },
  { label: '30 ngày (1 tháng)', value: 30 },
  { label: '90 ngày (3 tháng)', value: 90 },
  { label: '365 ngày (1 năm)', value: 365 },
  { label: 'Tùy chỉnh...', value: 'custom' },
];

export const DurationInput = ({ value, onChange }) => {
  const isCustom = value !== '' && value !== null && value !== undefined &&
    ![10, 30, 90, 365].includes(Number(value));
  const selectVal = isCustom ? 'custom' : (value === '' || value == null ? '' : Number(value));

  const handleSelect = (e) => {
    const v = e.target.value;
    if (v === '') { onChange(''); return; }
    if (v === 'custom') { onChange(1); return; }
    onChange(Number(v));
  };

  return (
    <div className="flex gap-2">
      <select className="input flex-1" value={selectVal} onChange={handleSelect}>
        {DURATION_PRESETS.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>
      {isCustom && (
        <div className="flex items-center gap-1">
          <input
            type="text"
            inputMode="numeric"
            className="input w-24"
            value={value}
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, '');
              onChange(d === '' ? 1 : Number(d));
            }}
          />
          <span className="text-sm text-gray-500 shrink-0">ngày</span>
        </div>
      )}
    </div>
  );
};

// ── LimitInput — checkbox "Không giới hạn" + số, 0 = không hỗ trợ ───────────
const LimitInput = ({ value, onChange }) => {
  const isUnlimited = value === '' || value === null || value === undefined;
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={isUnlimited}
          onChange={(e) => onChange(e.target.checked ? '' : 0)}
          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5"
        />
        <span className="text-xs text-gray-400">Không giới hạn</span>
      </label>
      {!isUnlimited && (
        <input
          type="text"
          inputMode="numeric"
          className="input w-full"
          placeholder="0 = không hỗ trợ"
          value={value}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, '');
            onChange(raw === '' ? 0 : Number(raw));
          }}
        />
      )}
    </div>
  );
};

// ── SendLimitsFields — 2×2 grid dùng chung cho cả 2 modal ────────────────────
export const SendLimitsFields = ({ form, set }) => (
  <div>
    <p className="text-sm font-medium text-gray-700 mb-1">Hạn mức gửi tin</p>
    <p className="text-xs text-gray-400 mb-3">Check = không giới hạn. Bỏ check → nhập số (0 = không hỗ trợ).</p>
    <div className="grid grid-cols-2 gap-4">
      {[
        ['dailyEmailLimit',   'Email / ngày'],
        ['monthlyEmailLimit', 'Email / tháng'],
        ['dailyZaloLimit',    'Zalo / ngày'],
        ['monthlyZaloLimit',  'Zalo / tháng'],
      ].map(([key, label]) => (
        <div key={key}>
          <label className="block text-xs text-gray-500 mb-1.5">{label}</label>
          <LimitInput value={form[key]} onChange={(v) => set(key, v)} />
        </div>
      ))}
    </div>
  </div>
);

// ── ResourceLimitsFields — giới hạn số lượng tài nguyên theo gói ─────────────
export const ResourceLimitsFields = ({ form, set }) => (
  <div>
    <p className="text-sm font-medium text-gray-700 mb-1">Giới hạn tài nguyên</p>
    <p className="text-xs text-gray-400 mb-3">Check = không giới hạn. Bỏ check → nhập số (0 = không hỗ trợ).</p>
    <div className="grid grid-cols-2 gap-4">
      {[
        ['maxLandingPages',   'Landing pages'],
        ['maxCampaigns',      'Chiến dịch'],
        ['maxZaloAccounts',   'Tài khoản Zalo'],
        ['maxEmailAccounts',  'Tài khoản Email'],
        ['maxEmailTemplates', 'Email template'],
        ['maxZaloTemplates',  'Zalo template'],
      ].map(([key, label]) => (
        <div key={key}>
          <label className="block text-xs text-gray-500 mb-1.5">{label}</label>
          <LimitInput value={form[key] ?? ''} onChange={(v) => set(key, v)} />
        </div>
      ))}
    </div>
  </div>
);
