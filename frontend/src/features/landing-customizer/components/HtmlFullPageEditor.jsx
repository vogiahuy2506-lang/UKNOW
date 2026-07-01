import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineCode,
  HiOutlineRefresh,
  HiOutlineSave,
  HiOutlineSparkles,
  HiOutlineViewGrid,
  HiOutlineX,
} from 'react-icons/hi';
import landingCustomizerApiService from '../services/landingCustomizerApi.service';
import { buildLandingHtmlSrcDoc } from '../utils/buildLandingHtmlSrcDoc.js';
import { getAiQuotaErrorMessage } from '../../../utils/aiLimitError.util';
import { useI18n } from '../../../i18n';

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

const PAGE_AI_PLACEHOLDERS = {
  hero: 'VD: Landing trang chủ Founder AI, hero video nền thành phố, headline về marketing automation + AI chatbot, CTA đăng ký dùng thử.',
  contact: 'VD: Trang liên hệ Founder AI với form, email, hotline, địa chỉ văn phòng.',
  pricing: 'VD: Trang bảng giá Founder AI với 4 gói Trial/Starter/Pro/Enterprise, so sánh tính năng.',
};

export default function HtmlFullPageEditor() {
  const { t } = useI18n();
  const [selectedPage, setSelectedPage] = useState('hero');
  const [langTab, setLangTab] = useState('vi');
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

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
      toast.error(err?.response?.data?.message || 'Không tải được cấu hình HTML');
      setForm(EMPTY_FORM);
    } finally {
      setLoading(false);
    }
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
      toast.error(err?.response?.data?.message || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => persist({ ...form }, 'Đã lưu cấu hình HTML');

  const handleEnableHtml = () => persist(
    { ...form, displayMode: 'html' },
    'Đã bật hiển thị HTML — trang public sẽ dùng HTML tùy chỉnh',
  );

  const handleUseDefault = () => persist(
    { ...form, displayMode: 'default' },
    'Đã chuyển về hiển thị mặc định (React editor)',
  );

  const runAiGenerate = async () => {
    const prompt = String(aiPrompt || '').trim();
    if (!prompt) {
      toast.error('Vui lòng nhập mô tả trang cho AI');
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
        throw new Error(payload?.message || 'AI không trả về HTML hợp lệ');
      }

      const html = String(payload.data.html);
      const field = langTab === 'en' ? 'htmlContentEn' : 'htmlContentVi';
      setForm((prev) => ({ ...prev, [field]: html }));
      setAiOpen(false);
      setAiPrompt('');
      toast.success('Đã tạo HTML — trừ 1 credit AI. Xem preview và lưu khi ổn.');
    } catch (err) {
      if (err?.response?.data?.code === 'RESOURCE_LIMIT_EXCEEDED') {
        toast.error(getAiQuotaErrorMessage(err, t));
      } else {
        toast.error(err?.response?.data?.message || err?.message || 'Không tạo được HTML bằng AI');
      }
    } finally {
      setAiBusy(false);
    }
  };

  const htmlField = langTab === 'en' ? 'htmlContentEn' : 'htmlContentVi';

  return (
    <div className="h-full flex flex-col bg-slate-100">
      <div className="px-4 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center gap-3">
        <div className="flex bg-slate-100 rounded-lg p-0.5">
          {PAGES.map((page) => (
            <button
              key={page.id}
              type="button"
              onClick={() => setSelectedPage(page.id)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                selectedPage === page.id
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white'
              }`}
            >
              {page.label}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-slate-200 hidden sm:block" />

        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Hiển thị:</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
            form.displayMode === 'html'
              ? 'bg-orange-100 text-orange-700'
              : 'bg-emerald-100 text-emerald-700'
          }`}
          >
            {form.displayMode === 'html' ? 'HTML tùy chỉnh' : 'Mặc định (React)'}
          </span>
        </div>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => loadPage(selectedPage)}
          disabled={loading || saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
        >
          <HiOutlineRefresh className="w-4 h-4" />
          Tải lại
        </button>
        <button
          type="button"
          onClick={handleUseDefault}
          disabled={loading || saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
        >
          <HiOutlineViewGrid className="w-4 h-4" />
          Hiển thị mặc định
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-slate-700 rounded-lg hover:bg-slate-800 disabled:opacity-50"
        >
          <HiOutlineSave className="w-4 h-4" />
          Lưu
        </button>
        <button
          type="button"
          onClick={handleEnableHtml}
          disabled={loading || saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50"
        >
          <HiOutlineCode className="w-4 h-4" />
          Lưu &amp; bật HTML
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
        <section className="w-full lg:w-[42%] xl:w-[38%] flex flex-col border-r border-slate-200 bg-white min-h-0">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-medium text-slate-800">Dán HTML full page</p>
            <p className="text-xs text-slate-500 mt-1">
              Dán file HTML vào đây. Khi bật HTML, trang
              {' '}
              <code className="text-orange-600">{currentPageMeta.path}</code>
              {' '}
              sẽ hiển thị theo HTML. Bấm &quot;Hiển thị mặc định&quot; để quay lại React editor (nội dung cũ vẫn được giữ).
            </p>
          </div>

          <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setLangTab('vi')}
                className={`px-3 py-1 text-xs font-medium rounded-md ${
                  langTab === 'vi' ? 'bg-white shadow text-slate-800' : 'text-slate-500'
                }`}
              >
                Tiếng Việt
              </button>
              <button
                type="button"
                onClick={() => setLangTab('en')}
                className={`px-3 py-1 text-xs font-medium rounded-md ${
                  langTab === 'en' ? 'bg-white shadow text-slate-800' : 'text-slate-500'
                }`}
              >
                English
              </button>
            </div>
            <button
              type="button"
              onClick={() => setAiOpen(true)}
              disabled={loading || saving || aiBusy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 disabled:opacity-50"
            >
              <HiOutlineSparkles className="w-4 h-4" />
              Tạo bằng AI (−1 credit)
            </button>
          </div>

          <div className="flex-1 p-4 flex flex-col gap-3 min-h-0">
            <textarea
              className="flex-1 min-h-[240px] w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono resize-none focus:border-orange-400 focus:ring-1 focus:ring-orange-300"
              value={form[htmlField]}
              onChange={(e) => setForm((prev) => ({ ...prev, [htmlField]: e.target.value }))}
              placeholder={langTab === 'vi'
                ? '<!-- Dán HTML Tiếng Việt (có thể là fragment hoặc full <!DOCTYPE html>) -->'
                : '<!-- Paste English HTML (optional — falls back to Vietnamese) -->'}
              spellCheck={false}
              disabled={loading}
            />

            <details className="shrink-0">
              <summary className="text-xs font-medium text-slate-600 cursor-pointer">CSS bổ sung (tuỳ chọn)</summary>
              <textarea
                className="mt-2 w-full h-24 rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono resize-none focus:border-orange-400 focus:ring-1 focus:ring-orange-300"
                value={form.cssContent}
                onChange={(e) => setForm((prev) => ({ ...prev, cssContent: e.target.value }))}
                placeholder="/* Custom CSS injected into page */"
                spellCheck={false}
                disabled={loading}
              />
            </details>
          </div>
        </section>

        <section className="hidden lg:flex flex-1 flex-col min-h-0 bg-slate-900">
          <div className="px-4 py-2 border-b border-slate-700 text-xs text-slate-400 flex items-center justify-between">
            <span>Preview ({langTab === 'en' ? 'English' : 'Tiếng Việt'})</span>
            <a
              href={`${currentPageMeta.path}${currentPageMeta.path === '/' ? '' : ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-400 hover:underline"
            >
              Mở trang public
            </a>
          </div>
          <div className="flex-1 min-h-0 bg-white">
            {loading ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-500">Đang tải…</div>
            ) : previewSrcDoc ? (
              <iframe
                title="HTML preview"
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                srcDoc={previewSrcDoc}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-400 px-6 text-center">
                Nhập HTML bên trái để xem preview
              </div>
            )}
          </div>
        </section>
      </div>

      {aiOpen && createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          onClick={() => !aiBusy && setAiOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center">
                  <HiOutlineSparkles className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Tạo HTML bằng AI</h3>
                  <p className="text-xs text-slate-500">
                    {currentPageMeta.label}
                    {' · '}
                    {langTab === 'en' ? 'English' : 'Tiếng Việt'}
                    {' · '}
                    trừ 1 credit/lần
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !aiBusy && setAiOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <HiOutlineX className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-5">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Mô tả trang bạn muốn
              </label>
              <textarea
                className="w-full h-32 rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:border-orange-400 focus:ring-1 focus:ring-orange-300"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder={PAGE_AI_PLACEHOLDERS[selectedPage] || PAGE_AI_PLACEHOLDERS.hero}
                disabled={aiBusy}
                spellCheck={false}
              />
              <p className="mt-2 text-xs text-slate-500">
                HTML sẽ điền vào tab ngôn ngữ đang chọn. Bạn vẫn cần bấm Lưu sau khi chỉnh.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50">
              <button
                type="button"
                onClick={() => !aiBusy && setAiOpen(false)}
                disabled={aiBusy}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg disabled:opacity-50"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={runAiGenerate}
                disabled={aiBusy}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50"
              >
                {aiBusy ? 'Đang tạo…' : 'Tạo HTML'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
