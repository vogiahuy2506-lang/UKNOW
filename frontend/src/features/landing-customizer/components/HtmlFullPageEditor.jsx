import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineCode,
  HiOutlineExternalLink,
  HiOutlineInformationCircle,
  HiOutlineRefresh,
  HiOutlineSave,
  HiOutlineSparkles,
  HiOutlineViewGrid,
  HiOutlineX,
} from 'react-icons/hi';
import landingCustomizerApiService from '../services/landingCustomizerApi.service';
import { buildLandingHtmlSrcDoc } from '../utils/buildLandingHtmlSrcDoc.js';
import { getAiQuotaErrorMessage } from '../../../utils/aiLimitError.util';
import { LANDING_AI_PROMPT_MAX_CHARS } from '../../landing-canvas/utils/landingAiInputLimits.js';
import { useI18n } from '../../../i18n';
import EditorModeSettings from './EditorModeSettings';
import {
  AdminEditorShell,
  EditorSettingsModal,
  EditorTopbar,
  TopbarButton,
  TopbarDivider,
  TopbarSaveButton,
  TopbarSegmented,
  TopbarSettingsButton,
  TopbarToolsMenu,
} from '../../../components/editor/AdminEditorShell';

// `label` là chuỗi gửi cho AI làm tiêu đề trang (hợp đồng với backend) — KHÔNG dịch/đổi; chữ hiển thị lấy từ i18n
// `landingCustomizer.pages.<id>`.
const PAGES = [
  { id: 'hero', label: 'Trang Hero', path: '/' },
  { id: 'contact', label: 'Trang Liên hệ', path: '/contact' },
  { id: 'pricing', label: 'Trang Bảng giá', path: '/pricing' },
];

const EMPTY_FORM = {
  displayMode: 'default',
  htmlContentVi: '',
  htmlContentEn: '',
  cssContent: '',
};

const TEXT_AREA_CLASS = 'w-full rounded-lg border border-gray-300 dark:border-dk-border bg-white dark:bg-dk-inset text-gray-900 dark:text-dk-text dark:placeholder:text-dk-muted px-3 py-2 text-xs font-mono resize-none focus:border-orange-400 focus:ring-1 focus:ring-orange-300 focus:outline-none';

// Bố cục 11/10/2026 (PLAN_TRANG_SOAN_QUAN_TRI): thanh trên 52px (trang ở giữa; Cài đặt · Công cụ · Lưu · Lưu & bật HTML bên
// phải), vùng chính chỉ còn ô HTML + xem trước. CHỈ ĐỔI BỐ CỤC: state, getHtmlMode/saveHtmlMode/generateHomepageHtmlWithAi,
// payload `{ displayMode, htmlContentVi, htmlContentEn, cssContent }` giữ nguyên — xem `__tests__/HtmlFullPageEditor.contract.spec.jsx`.
export default function HtmlFullPageEditor({ editorMode = 'html', onEditorModeChange }) {
  const { t } = useI18n();
  const th = (key, params) => t(`landingCustomizer.editor.html.${key}`, params);
  const [selectedPage, setSelectedPage] = useState('hero');
  const [langTab, setLangTab] = useState('vi');
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  // Chỉ phục vụ trình bày: modal Cài đặt.
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadPage = useCallback(async (page) => {
    setLoading(true);
    try {
      const res = await landingCustomizerApiService.getHtmlMode(page);
      const data = res.data?.data || {};
      setForm({
        displayMode: data.displayMode === 'html' ? 'html' : 'default',
        htmlContentVi: data.htmlContentVi || '',
        htmlContentEn: data.htmlContentEn || '',
        cssContent: data.cssContent || '',
      });
    } catch (err) {
      toast.error(err?.response?.data?.message || th('loadError'));
      setForm(EMPTY_FORM);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `th` chỉ đổi theo ngôn ngữ giao diện; không nạp lại trang vì đổi ngôn ngữ.
  }, []);

  useEffect(() => {
    loadPage(selectedPage);
  }, [selectedPage, loadPage]);

  const previewHtml = useMemo(() => {
    const html = langTab === 'en' ? form.htmlContentEn : form.htmlContentVi;
    return html || form.htmlContentVi || form.htmlContentEn || '';
  }, [form.htmlContentEn, form.htmlContentVi, langTab]);

  const previewSrcDoc = useMemo(
    () => buildLandingHtmlSrcDoc(previewHtml, form.cssContent),
    [previewHtml, form.cssContent],
  );

  const currentPageMeta = PAGES.find((p) => p.id === selectedPage) || PAGES[0];

  const persist = async (payload, successMessage) => {
    setSaving(true);
    try {
      const res = await landingCustomizerApiService.saveHtmlMode(selectedPage, payload);
      const data = res.data?.data || {};
      setForm({
        displayMode: data.displayMode === 'html' ? 'html' : 'default',
        htmlContentVi: data.htmlContentVi || '',
        htmlContentEn: data.htmlContentEn || '',
        cssContent: data.cssContent || '',
      });
      toast.success(successMessage);
    } catch (err) {
      toast.error(err?.response?.data?.message || th('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => persist({ ...form }, th('saved'));

  const handleEnableHtml = () => persist(
    { ...form, displayMode: 'html' },
    th('enabled'),
  );

  const handleUseDefault = () => persist(
    { ...form, displayMode: 'default' },
    th('reverted'),
  );

  const runAiGenerate = async () => {
    const prompt = String(aiPrompt || '').trim();
    if (!prompt) {
      toast.error(th('aiPromptRequired'));
      return;
    }

    setAiBusy(true);
    try {
      const res = await landingCustomizerApiService.generateHomepageHtmlWithAi({
        prompt,
        homepagePage: selectedPage,
        locale: langTab,
        title: `Founder AI — ${currentPageMeta.label}`,
      });
      const payload = res.data;
      if (!payload?.success || !payload?.data?.html) {
        throw new Error(payload?.message || th('aiInvalid'));
      }

      const html = String(payload.data.html);
      const field = langTab === 'en' ? 'htmlContentEn' : 'htmlContentVi';
      setForm((prev) => ({ ...prev, [field]: html }));
      setAiOpen(false);
      setAiPrompt('');
      toast.success(th('aiDone'));
    } catch (err) {
      if (err?.response?.data?.code === 'RESOURCE_LIMIT_EXCEEDED') {
        toast.error(getAiQuotaErrorMessage(err, t));
      } else {
        toast.error(err?.response?.data?.message || err?.message || th('aiFailed'));
      }
    } finally {
      setAiBusy(false);
    }
  };

  const htmlField = langTab === 'en' ? 'htmlContentEn' : 'htmlContentVi';
  const langLabel = langTab === 'en' ? th('langEn') : th('langVi');
  const pageLabel = t(`landingCustomizer.pages.${selectedPage}`);
  const busy = loading || saving;

  const pageSwitcher = (
    <TopbarSegmented
      value={selectedPage}
      onChange={setSelectedPage}
      ariaLabel={t('landingCustomizer.editor.pageSwitcher')}
      options={PAGES.map((page) => ({ value: page.id, label: t(`landingCustomizer.pages.${page.id}`), title: page.path }))}
    />
  );

  const toolsItems = [
    { key: 'save', icon: HiOutlineSave, label: th('save'), description: th('saveDesc'), onClick: handleSave, disabled: busy },
    { key: 'ai', icon: HiOutlineSparkles, label: th('ai'), description: th('aiDesc'), onClick: () => setAiOpen(true), disabled: busy || aiBusy },
    { key: 'default', icon: HiOutlineViewGrid, label: th('useDefault'), description: th('useDefaultDesc'), onClick: handleUseDefault, disabled: busy },
    { key: 'reload', icon: HiOutlineRefresh, label: th('reload'), description: th('reloadDesc'), onClick: () => loadPage(selectedPage), disabled: busy },
  ];

  return (
    <AdminEditorShell
      topbar={(
        <EditorTopbar
          icon={HiOutlineCode}
          title={t('landingCustomizer.editor.title')}
          subtitle={t('landingCustomizer.editor.subtitleHtml')}
          center={pageSwitcher}
          right={(
            <>
              <TopbarSettingsButton onClick={() => setSettingsOpen(true)} active={settingsOpen} />
              <TopbarToolsMenu items={toolsItems} />
              <TopbarDivider />
              <span className="hidden sm:inline-flex">
                <TopbarButton icon={HiOutlineSave} onClick={handleSave} disabled={busy}>{th('save')}</TopbarButton>
              </span>
              <TopbarSaveButton onClick={handleEnableHtml} saving={saving} disabled={loading} label={th('saveAndEnable')} icon={HiOutlineCode} />
            </>
          )}
        />
      )}
    >
      <div className="h-full min-h-0 flex flex-col">
        {/* Dưới md thanh trên ẩn cụm giữa — cho bộ chọn trang xuống đây */}
        <div className="md:hidden shrink-0 flex items-center gap-2 px-3 py-2 overflow-x-auto bg-white dark:bg-dk-surface border-b border-gray-200/80 dark:border-dk-border">
          {pageSwitcher}
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <section className="flex-1 lg:flex-none lg:w-[42%] xl:w-[38%] min-h-0 flex flex-col border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-dk-border bg-white dark:bg-dk-surface">
            <div className="shrink-0 px-3 py-2 border-b border-gray-100 dark:border-dk-border flex items-center gap-2 flex-wrap">
              <TopbarSegmented
                value={langTab}
                onChange={setLangTab}
                ariaLabel={th('langSwitcher')}
                options={[
                  { value: 'vi', label: th('langVi') },
                  { value: 'en', label: th('langEn') },
                ]}
              />
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  form.displayMode === 'html'
                    ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300'
                    : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {form.displayMode === 'html' ? t('landingCustomizer.editor.settings.state.html') : t('landingCustomizer.editor.settings.state.default')}
              </span>
              <span className="flex-1" />
              <span
                className="text-gray-400 dark:text-dk-muted hover:text-gray-600 dark:hover:text-dk-text2 cursor-help"
                title={th('info', { path: currentPageMeta.path })}
                aria-label={th('info', { path: currentPageMeta.path })}
                role="img"
              >
                <HiOutlineInformationCircle className="w-5 h-5" aria-hidden="true" />
              </span>
            </div>

            <div className="flex-1 p-3 flex flex-col gap-2 min-h-0">
              <textarea
                className={`${TEXT_AREA_CLASS} flex-1 min-h-[120px]`}
                value={form[htmlField]}
                onChange={(e) => setForm((prev) => ({ ...prev, [htmlField]: e.target.value }))}
                placeholder={langTab === 'vi' ? th('placeholderVi') : th('placeholderEn')}
                spellCheck={false}
                disabled={loading}
              />

              <details className="shrink-0">
                <summary className="text-xs font-medium text-gray-600 dark:text-dk-text2 cursor-pointer">{th('cssSummary')}</summary>
                <textarea
                  className={`${TEXT_AREA_CLASS} mt-2 h-24`}
                  value={form.cssContent}
                  onChange={(e) => setForm((prev) => ({ ...prev, cssContent: e.target.value }))}
                  placeholder={th('cssPlaceholder')}
                  spellCheck={false}
                  disabled={loading}
                />
              </details>
            </div>
          </section>

          <section className="flex-1 min-h-0 flex flex-col bg-gray-100 dark:bg-dk-inset">
            <div className="shrink-0 px-3 py-2 border-b border-gray-200/80 dark:border-dk-border bg-white/70 dark:bg-dk-surface text-xs text-gray-500 dark:text-dk-text2 flex items-center justify-between gap-2">
              <span className="truncate">{th('previewTitle', { lang: langLabel })}</span>
              <a
                href={currentPageMeta.path}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 hover:underline shrink-0"
              >
                <HiOutlineExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                {t('landingCustomizer.editor.openPublic')}
              </a>
            </div>
            <div className="flex-1 min-h-0 bg-white dark:bg-dk-inset">
              {loading ? (
                <div className="h-full flex items-center justify-center text-sm text-gray-500 dark:text-dk-muted">{th('loading')}</div>
              ) : previewSrcDoc ? (
                <iframe
                  title="HTML preview"
                  className="w-full h-full border-0"
                  sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                  srcDoc={previewSrcDoc}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-gray-400 dark:text-dk-muted px-6 text-center">
                  {th('previewEmpty')}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      <EditorSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title={t('landingCustomizer.editor.settings.title')}
        subtitle={t('landingCustomizer.editor.settings.subtitle')}
        footer={<TopbarButton onClick={() => setSettingsOpen(false)}>{t('editorShell.close')}</TopbarButton>}
      >
        <EditorModeSettings
          mode={editorMode}
          onModeChange={onEditorModeChange}
          displayState={loading ? 'loading' : form.displayMode}
          pageLabel={pageLabel}
          pagePath={currentPageMeta.path}
        >
          <div className="flex flex-wrap gap-2 pt-1">
            <TopbarButton icon={HiOutlineCode} active disabled={busy} onClick={() => { setSettingsOpen(false); handleEnableHtml(); }}>
              {th('saveAndEnable')}
            </TopbarButton>
            <TopbarButton icon={HiOutlineViewGrid} disabled={busy} onClick={() => { setSettingsOpen(false); handleUseDefault(); }}>
              {th('useDefault')}
            </TopbarButton>
          </div>
        </EditorModeSettings>
      </EditorSettingsModal>

      {aiOpen && createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          onClick={() => !aiBusy && setAiOpen(false)}
        >
          <div
            className="bg-white dark:bg-dk-raised dark:border dark:border-dk-border rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-dk-border">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-orange-100 dark:bg-orange-950/40 rounded-lg flex items-center justify-center">
                  <HiOutlineSparkles className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-dk-text">{th('aiModalTitle')}</h3>
                  <p className="text-xs text-gray-500 dark:text-dk-muted">
                    {th('aiModalMeta', { page: pageLabel, lang: langLabel })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !aiBusy && setAiOpen(false)}
                aria-label={t('editorShell.close')}
                className="p-2 hover:bg-gray-100 dark:hover:bg-dk-strong rounded-lg"
              >
                <HiOutlineX className="w-5 h-5 text-gray-500 dark:text-dk-muted" />
              </button>
            </div>

            <div className="p-5">
              <label className="block text-sm font-medium text-gray-700 dark:text-dk-text mb-2">
                {th('aiLabel')}
              </label>
              <textarea
                className="w-full h-32 rounded-lg border border-gray-300 dark:border-dk-border bg-white dark:bg-dk-inset text-gray-900 dark:text-dk-text dark:placeholder:text-dk-muted px-3 py-2 text-sm resize-none focus:border-orange-400 focus:ring-1 focus:ring-orange-300 focus:outline-none"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                maxLength={LANDING_AI_PROMPT_MAX_CHARS}
                placeholder={th(`aiPlaceholder.${selectedPage}`)}
                disabled={aiBusy}
                spellCheck={false}
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-dk-muted">
                {th('aiNote')}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-dk-border bg-gray-50 dark:bg-dk-surface">
              <button
                type="button"
                onClick={() => !aiBusy && setAiOpen(false)}
                disabled={aiBusy}
                className="px-4 py-2 text-sm text-gray-600 dark:text-dk-text2 hover:bg-gray-200 dark:hover:bg-dk-strong rounded-lg disabled:opacity-50"
              >
                {th('cancel')}
              </button>
              <button
                type="button"
                onClick={runAiGenerate}
                disabled={aiBusy}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50"
              >
                {aiBusy ? th('generating') : th('generate')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </AdminEditorShell>
  );
}
