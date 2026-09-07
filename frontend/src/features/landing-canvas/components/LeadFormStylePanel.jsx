import { useCallback, useMemo, useState } from 'react';
import {
  HiOutlineCheck,
  HiOutlineClipboard,
  HiOutlineRefresh,
  HiOutlineExclamationCircle,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import {
  defaultLeadFormTheme,
  normalizeLeadFormConfig,
  normalizeLeadFormTheme,
} from '../../landing-pages/utils/landingLeadFormConfig.js';
import { buildLeadFormHtmlSnippet } from '../../landing-pages/utils/buildLeadFormHtmlSnippet.js';
import { useI18n } from '../../../i18n';

/**
 * Lead Form Style + Snippet panel — Phase UI 6+.
 *
 * Bố cục:
 *  - Card "Giao diện": đổi màu/nhãn + chọn chế độ Họ tên (1 ô / 2 ô).
 *  - Card "Snippet nhúng": 2 tab Iframe / HTML, copy 1 chạm.
 *
 * Props:
 *  - form: object form của LandingCanvasEditor (chứa leadFormConfig.theme)
 *  - setForm: setter để patch theme
 *  - slug: string|null
 *  - editingId: number|null
 *  - nameMode: 'split' | 'single' (từ LeadFormSettingsPanel)
 *  - onNameModeChange: callback để cập nhật nameMode ở parent
 */
export default function LeadFormStylePanel({ form, setForm, slug, editingId, nameMode }) {
  const tc = useI18n('landingCanvas.leadFormStylePanel');
  const [copied, setCopied] = useState(false);

  const config = useMemo(
    () => normalizeLeadFormConfig(form?.leadFormConfig || { theme: defaultLeadFormTheme() }),
    [form?.leadFormConfig]
  );
  const theme = useMemo(() => normalizeLeadFormTheme(config.theme), [config.theme]);

  const apiBase = useMemo(() => {
    const url = import.meta.env.VITE_API_URL || '/api';
    return String(url || '').replace(/\/+$/, '');
  }, []);

  const safeSlug = String(slug || '').trim();

  const snippet = useMemo(() => {
    if (!safeSlug) return '';
    return buildLeadFormHtmlSnippet({
      slug: safeSlug,
      apiBase,
      nameMode,
      theme,
    });
  }, [safeSlug, apiBase, nameMode, theme]);

  const patchTheme = useCallback(
    (next) => {
      const merged = normalizeLeadFormTheme({ ...theme, ...next });
      setForm((prev) => {
        const cur = normalizeLeadFormConfig(prev.leadFormConfig);
        return { ...prev, leadFormConfig: { ...cur, theme: merged } };
      });
    },
    [theme, setForm]
  );

  const updateTheme = useCallback(
    (key, value) => {
      patchTheme({ [key]: value });
    },
    [patchTheme]
  );

  const resetTheme = useCallback(() => {
    patchTheme(defaultLeadFormTheme());
  }, [patchTheme]);

  const handleCopy = useCallback(async (text, msg) => {
    if (!text) {
      toast.error(tc('noSlugWarning'));
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(msg || tc('copySuccess'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(tc('copyError'));
    }
  }, [tc]);

  if (!editingId || !safeSlug) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 flex items-start gap-4">
        <HiOutlineExclamationCircle className="w-8 h-8 text-amber-500 shrink-0" />
        <div>
          <p className="text-[20px] font-semibold text-amber-900">{tc('snippetUnavailable')}</p>
          <p className="text-[17px] text-amber-800 mt-1.5 leading-relaxed">
            {tc('noSlugHint')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {/* Card: Giao diện */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[20px] font-semibold text-gray-900">{tc('formAppearance')}</p>
          <button
            type="button"
            onClick={resetTheme}
            className="inline-flex items-center gap-2 text-[15px] text-gray-500 hover:text-orange-600"
          >
            <HiOutlineRefresh className="w-5 h-5" />
            {tc('resetDefaults')}
          </button>
        </div>
        <p className="text-[15px] text-gray-500 mb-5">
          {tc('colorHelp')}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <ColorRow label={tc('primaryColor')} value={theme.primary} onChange={(v) => updateTheme('primary', v)} />
          <ColorRow label={tc('accentColor')} value={theme.accent} onChange={(v) => updateTheme('accent', v)} />
          <ColorRow label={tc('cardBg')} value={theme.bg} onChange={(v) => updateTheme('bg', v)} />
          <ColorRow label={tc('textColor')} value={theme.text} onChange={(v) => updateTheme('text', v)} />
          <ColorRow label={tc('borderColor')} value={theme.border} onChange={(v) => updateTheme('border', v)} />

          <RangeRow
            label={tc('borderRadius')}
            value={theme.radius}
            min={0}
            max={24}
            step={1}
            unit="px"
            onChange={(v) => updateTheme('radius', v)}
          />
        </div>

        <div className="mt-5 pt-5 border-t border-gray-100 space-y-4">
          <TextRow label={tc('formTitle')} value={theme.titleText} onChange={(v) => updateTheme('titleText', v)} />
          <TextRow label={tc('formDescription')} value={theme.subtitleText} onChange={(v) => updateTheme('subtitleText', v)} />
          <TextRow label={tc('submitButton')} value={theme.buttonText} onChange={(v) => updateTheme('buttonText', v)} />
        </div>
      </section>

      {/* Card: Snippet nhúng */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <p className="text-[20px] font-semibold text-gray-900">{tc('embedSnippet')}</p>
          <p className="text-[15px] text-gray-500 mt-1">
            {tc('embedSnippetHelp')}
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-[15px] text-gray-600">{tc('snippetLabel')}</p>
          <textarea
            readOnly
            value={snippet}
            rows={10}
            className="w-full px-5 py-4 border border-gray-300 rounded-lg text-[15px] font-mono bg-gray-50 resize-y"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => handleCopy(snippet, tc('copySuccess'))}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-orange-500 text-white text-[16px] font-semibold hover:bg-orange-600 transition-colors"
              >
                {copied ? <HiOutlineCheck className="w-6 h-6" /> : <HiOutlineClipboard className="w-6 h-6" />}
                {tc('copyBtn')}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ───────────────── Sub-components ───────────────── */

function ColorRow({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-[16px] text-gray-700 flex-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded border border-gray-300 cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-28 px-4 py-2.5 border border-gray-300 rounded text-[15px] font-mono"
        />
      </div>
    </div>
  );
}

function RangeRow({ label, value, min, max, step, unit, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-[16px] text-gray-700 flex-1">{label}</label>
      <div className="flex items-center gap-2 w-56">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1"
        />
        <span className="font-mono text-[15px] text-gray-600 w-14 text-right">
          {value}
          {unit || ''}
        </span>
      </div>
    </div>
  );
}

function TextRow({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-[16px] text-gray-700 flex-1">{label}</label>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-72 px-4 py-3 border border-gray-300 rounded-lg text-[16px] focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
      />
    </div>
  );
}
