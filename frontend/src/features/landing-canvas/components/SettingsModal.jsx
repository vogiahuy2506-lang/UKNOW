import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineX,
  HiOutlineArrowLeft,
  HiOutlineMail,
  HiOutlineGlobeAlt,
  HiOutlineDocumentText,
  HiOutlineCheckCircle,
} from 'react-icons/hi';
import LeadFormSettingsPanel from './LeadFormSettingsPanel.jsx';
import DomainSettingsPanel from './DomainSettingsPanel.jsx';
import PageSettingsPanel from './PageSettingsPanel.jsx';
import { useI18n } from '../../../i18n';

/**
 * Fullscreen modal cài đặt landing canvas — Phase UI 6+.
 *
 * Layout:
 *   ┌────────────────────────────────────────────────────────────┐
 *   │  ← Back           Settings · Title                     ✕  │
 *   ├──────────────┬─────────────────────────────────────────────┤
 *   │  Lead Form   │                                             │
 *   │  Domain      │   <content panel>                          │
 *   │  Page info   │                                             │
 *   │              │                                             │
 *   │  • Status    │                                             │
 *   └──────────────┴─────────────────────────────────────────────┘
 *
 * Props:
 *  - open: bool (null = đóng)
 *  - tab: 'leadForm' | 'domain' | 'page' | null
 *  - onClose: đóng modal
 *  - form, setForm: form state
 *  - editingId: null | number
 */

export default function SettingsModal({ open, tab, onClose, form, setForm, editingId }) {
  const tc = useI18n('landingCanvas.settingsModal');
  // Bridge cho các panel con — LeadFormConfigPanel dùng full path "leadFormConfig.*".
  const { t: tRoot } = useI18n();

  const TABS = [
    {
      key: 'leadForm',
      label: tc('tabs.leadForm.label'),
      desc: tc('tabs.leadForm.desc'),
      Icon: HiOutlineMail,
    },
    {
      key: 'domain',
      label: tc('tabs.domain.label'),
      desc: tc('tabs.domain.desc'),
      Icon: HiOutlineGlobeAlt,
    },
    {
      key: 'page',
      label: tc('tabs.page.label'),
      desc: tc('tabs.page.desc'),
      Icon: HiOutlineDocumentText,
    },
  ];

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || !tab) return null;

  const activeTab = TABS.find((tt) => tt.key === tab) || TABS[0];

  return createPortal(
    <div
      className="fixed inset-0 z-[55] flex flex-col bg-gray-50 animate-modal-fade-in text-[16px]"
      role="dialog"
      aria-modal="true"
      aria-label={tc('title')}
    >
      {/* Header */}
      <header className="h-24 px-8 flex items-center justify-between border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors text-[18px]"
            title={tc('close')}
          >
            <HiOutlineArrowLeft className="w-7 h-7" />
            <span className="font-semibold">{tc('back')}</span>
          </button>
          <span className="w-px h-8 bg-gray-200" />
          <div>
            <p className="text-[13px] uppercase tracking-[1.5px] text-gray-400 font-semibold">
              {tc('headerEyebrow')}
            </p>
            <span className="text-[23px] font-semibold text-gray-900 leading-tight block">
              {form?.title || tc('title')}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-3 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          title={tc('close')}
        >
          <HiOutlineX className="w-8 h-8" />
        </button>
      </header>

      {/* Body: sidebar + content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
          <p className="px-6 pt-6 pb-3 text-[13px] uppercase tracking-[1.5px] text-gray-400 font-semibold">
            {tc('sidebarTitle')}
          </p>
          <nav className="px-3 pb-5 space-y-1.5">
            {TABS.map((tt) => {
              const active = tt.key === tab;
              const { Icon } = tt;
              return (
                <button
                  key={tt.key}
                  type="button"
                  onClick={() => {
                    if (active) {
                      onClose?.();
                    } else {
                      const evt = new CustomEvent('landing-canvas:change-setting-tab', { detail: tt.key });
                      window.dispatchEvent(evt);
                    }
                  }}
                  className={`group w-full flex items-start gap-3.5 px-4 py-4 rounded-lg text-left transition-colors ${
                    active
                      ? 'bg-orange-50 text-orange-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon
                    className={`w-7 h-7 mt-0.5 shrink-0 ${
                      active ? 'text-orange-500' : 'text-gray-400 group-hover:text-gray-600'
                    }`}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[18px] font-semibold leading-tight">
                      {tt.label}
                    </span>
                    <span
                      className={`block text-[15px] leading-tight mt-0.5 ${
                        active ? 'text-orange-600/80' : 'text-gray-500'
                      }`}
                    >
                      {tt.desc}
                    </span>
                  </span>
                  {active ? (
                    <HiOutlineCheckCircle className="w-7 h-7 text-orange-500 mt-0.5 shrink-0" />
                  ) : null}
                </button>
              );
            })}
          </nav>

          {/* Sidebar footer: meta info */}
          <div className="border-t border-gray-100 p-5 mx-3 mt-3 space-y-2.5">
            <p className="text-[13px] uppercase tracking-[1.2px] text-gray-400 font-semibold">
              {tc('statusTitle')}
            </p>
            <div className="flex items-center justify-between text-[16px]">
              <span className="text-gray-500">{tc('slugLabel')}</span>
              <span className="font-mono text-gray-800 truncate max-w-[10rem]" title={form?.slug || ''}>
                {form?.slug || '—'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[16px]">
              <span className="text-gray-500">{tc('publishLabel')}</span>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[14px] font-semibold ${
                  form?.isPublished
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-gray-100 text-gray-600 border border-gray-200'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    form?.isPublished ? 'bg-green-500' : 'bg-gray-400'
                  }`}
                />
                {form?.isPublished ? tc('published') : tc('draft')}
              </span>
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-12 py-12">
            <div className="mb-10">
              <p className="text-[13px] uppercase tracking-[1.5px] text-orange-500 font-semibold">
                {activeTab.label}
              </p>
              <h2 className="text-[30px] font-bold text-gray-900 mt-1.5">
                {tab === 'leadForm' && tc('headings.leadForm')}
                {tab === 'domain' && tc('headings.domain')}
                {tab === 'page' && tc('headings.page')}
              </h2>
              <p className="text-[17px] text-gray-500 mt-2 leading-relaxed">
                {tab === 'leadForm' && tc('descriptions.leadForm')}
                {tab === 'domain' && tc('descriptions.domain')}
                {tab === 'page' && tc('descriptions.page')}
              </p>
            </div>

            {tab === 'leadForm' ? (
              <LeadFormSettingsPanel form={form} setForm={setForm} t={tRoot} editingId={editingId} />
            ) : null}
            {tab === 'domain' ? (
              <DomainSettingsPanel form={form} setForm={setForm} editingId={editingId} />
            ) : null}
            {tab === 'page' ? (
              <PageSettingsPanel form={form} setForm={setForm} />
            ) : null}
          </div>
        </main>
      </div>

      <style>{`
        @keyframes modalFadeIn {
          from { opacity: 0; transform: scale(0.985); }
          to   { opacity: 1; transform: scale(1); }
        }
        .animate-modal-fade-in { animation: modalFadeIn 180ms ease-out; }
      `}</style>
    </div>,
    document.body
  );
}
