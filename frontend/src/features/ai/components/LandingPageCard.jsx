import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  HiOutlineSparkles, HiOutlineExternalLink, HiOutlinePencilAlt,
  HiOutlineDeviceMobile, HiOutlineDesktopComputer, HiOutlineCode,
  HiOutlineEye, HiOutlineDownload, HiOutlineClipboard, HiOutlineX,
  HiOutlineCheck, HiOutlineGlobeAlt, HiOutlineRefresh,
  HiOutlineReply, HiOutlineExclamation,
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import { getPublicUrlFromSlug } from '../../landing-canvas/utils/buildCanvasSrcDoc.js';
import { slugifyLandingTitle } from '../utils/landingPaste.js';
import { buildFullLandingHtml, describeFindingsForUser } from '../utils/layoutAudit.js';
import { pickSectionTitle } from '../utils/landingLayoutFlow.js';
import { injectFormSlotPreviewHint } from '../../landing-pages/utils/injectLandingEnhancements.js';

/**
 * Enhanced Landing Page Card with preview, code view, and export options.
 */
const LandingPageCard = ({
  page,
  messageId = null,
  canSave = true,
  onSaveAndPublish,
  onGenerateNew,
  onEditWithAi,
  onRevert,
  isEditing = false,
  messageIndex,
}) => {
  const t = useI18n('landingPageCard');
  const tcp = useI18n('landingCanvas.canvasPreview');
  const [viewMode, setViewMode] = useState('preview'); // 'preview' | 'code'
  const [device, setDevice] = useState('desktop');
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showEditBox, setShowEditBox] = useState(false);
  const [editInstruction, setEditInstruction] = useState('');
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);
  const iframeRef = useRef(null);

  // "Lưu & xuất bản" (PLAN_TRO_LY_CHINH_LANDING_TRON_GOI_2026-09-13.md, Việc 2.2) — thay cho nút
  // "Lưu vào thư viện" cũ (chỉ navigate sang trang soạn kèm state, chưa lưu gì thật).
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveTitle, setSaveTitle] = useState(page.title || '');
  const [saveSlug, setSaveSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [savePublishNow, setSavePublishNow] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveBusy, setSaveBusy] = useState(null); // null | 'create' | 'toggle' | 'update'

  const isSaved = Boolean(page.landingPageId);
  const publicUrl = isSaved && page.slug ? getPublicUrlFromSlug(page.slug) : '';

  // Vòng tự kiểm hiển thị (plan landing tự kiểm, PR-3). `layoutStatus` do AiChatbot ghi vào data thẻ:
  // checking | clean | fixed | still_broken | unknown. `unknown` (chưa kiểm được) và chưa có trạng
  // thái thì KHÔNG hiện gì. Người dùng chỉ thấy câu tiếng người — số đo nằm ở kênh máy ↔ AI.
  const layoutStatus = page.layoutStatus || null;
  const layoutFindings = Array.isArray(page.layoutFindings) ? page.layoutFindings : [];
  const stillBroken = layoutStatus === 'still_broken' && layoutFindings.length > 0;
  const okStatus = layoutStatus === 'clean' || layoutStatus === 'fixed';
  const [okStripHidden, setOkStripHidden] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  useEffect(() => {
    setOkStripHidden(false);
    if (!okStatus) return undefined;
    const timer = setTimeout(() => setOkStripHidden(true), 4000);
    return () => clearTimeout(timer);
  }, [okStatus, page.html]);
  // Server báo canRevert sau mỗi lượt sửa; thẻ tải lại từ phiên không có cờ đó nhưng mang previousHtml.
  const canRevert = page.canRevert === true
    || (page.canRevert !== false && typeof page.previousHtml === 'string' && page.previousHtml.trim() !== '');

  const fullHtml = buildFullLandingHtml(page);

  // PR-5b-2c mục 5 — thẻ landing của trợ lý nổi xem trước srcDoc THẲNG (không qua
  // buildCanvasSrcDoc.js như trình soạn landing), nên chỗ trống `data-founderai-form-slot` (AI
  // dựng bằng Biểu mẫu, chưa lưu) hiện ra một khoảng trống câm. Chỉ đổi biến PREVIEW riêng cho
  // iframe — `fullHtml` (copy/tải về/hiện code) giữ nguyên chỗ trống thật để không lưu nhầm bản
  // đã chèn khung gợi ý.
  const previewHtml = injectFormSlotPreviewHint(fullHtml, tcp('formSlotHint'));

  const handlePreview = () => {
    setShowFullscreen(true);
  };

  const handleCopy = () => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(fullHtml).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = fullHtml;
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${page.title || 'landing-page'}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSubmitEdit = async (e) => {
    e?.preventDefault?.();
    const text = editInstruction.trim();
    if (!text || isEditing || isSubmittingLocal) return;

    setIsSubmittingLocal(true);
    try {
      if (onEditWithAi) {
        const success = await onEditWithAi(page, text, messageIndex, { messageId });
        if (success) {
          setShowEditBox(false);
          setEditInstruction('');
        }
      }
    } finally {
      setIsSubmittingLocal(false);
    }
  };

  // "Trình bày lại phần này": đường sửa THƯỜNG (người dùng chủ động, có trừ 1 credit — nói rõ trên
  // nút). Lệnh viết bằng lời thường vì nó hiện lại trong tin xác nhận; luật bố cục an toàn do server dặn AI.
  const handleRelayout = async () => {
    if (!onEditWithAi || isEditing || isSubmittingLocal) return;
    const section = pickSectionTitle(layoutFindings);
    const instruction = section ? t('relayoutInstruction', { section }) : t('relayoutInstructionPlain');
    setIsSubmittingLocal(true);
    try {
      await onEditWithAi(page, instruction, messageIndex, { messageId, skipLayoutAudit: true });
    } finally {
      setIsSubmittingLocal(false);
    }
  };

  const handleRevert = async () => {
    if (!onRevert || isReverting || isEditing || isSubmittingLocal) return;
    setIsReverting(true);
    try {
      await onRevert(page, messageIndex, { messageId });
    } finally {
      setIsReverting(false);
    }
  };

  const handleOpenSaveForm = () => {
    setSaveTitle(page.title || '');
    setSaveSlug(slugifyLandingTitle(page.title || ''));
    setSlugTouched(false);
    setSavePublishNow(false);
    setSaveError(null);
    setShowSaveForm(true);
  };

  const handleTitleChange = (e) => {
    const value = e.target.value;
    setSaveTitle(value);
    if (!slugTouched) setSaveSlug(slugifyLandingTitle(value));
  };

  const handleSlugChange = (e) => {
    setSlugTouched(true);
    setSaveSlug(e.target.value.toLowerCase());
  };

  const handleSubmitSave = async (e) => {
    e?.preventDefault?.();
    const title = saveTitle.trim();
    if (!title || saveBusy) {
      if (!title) setSaveError(t('save.titleRequired'));
      return;
    }
    setSaveBusy('create');
    setSaveError(null);
    try {
      await onSaveAndPublish?.({
        page,
        formValues: { title, slug: saveSlug.trim().toLowerCase(), isPublished: savePublishNow },
        fullHtml,
        messageIndex,
        messageId,
        mode: 'create',
      });
      setShowSaveForm(false);
      toast.success(t('save.saved'));
    } catch (error) {
      const status = error?.response?.status;
      if (status === 409) setSaveError(t('save.slugTaken'));
      else if (status === 403) setSaveError(t('save.forbidden'));
      else setSaveError(error?.response?.data?.message || t('save.saveFailed'));
    } finally {
      setSaveBusy(null);
    }
  };

  const handleTogglePublish = async () => {
    if (saveBusy) return;
    setSaveBusy('toggle');
    try {
      await onSaveAndPublish?.({
        page,
        formValues: { title: page.title, slug: page.slug, isPublished: !page.isPublished },
        fullHtml,
        messageIndex,
        messageId,
        mode: 'toggle',
      });
    } catch (error) {
      toast.error(error?.response?.data?.message || t('save.toggleFailed'));
    } finally {
      setSaveBusy(null);
    }
  };

  const handleUpdateSaved = async () => {
    if (saveBusy) return;
    setSaveBusy('update');
    try {
      await onSaveAndPublish?.({
        page,
        formValues: { title: page.title, slug: page.slug, isPublished: page.isPublished },
        fullHtml,
        messageIndex,
        messageId,
        mode: 'update',
      });
      toast.success(t('save.updateSaved'));
    } catch (error) {
      toast.error(error?.response?.data?.message || t('save.saveFailed'));
    } finally {
      setSaveBusy(null);
    }
  };

  const isBusy = isEditing || isSubmittingLocal;
  const showSaveButton = !isSaved && canSave;
  const deviceWidth = device === 'mobile' ? 'w-[375px]' : 'w-full';
  const deviceHeight = device === 'mobile' ? 'h-[667px]' : 'h-full';

  return (
    <>
      <div className="mt-4 bg-slate-50 rounded-2xl p-4 border border-slate-200 overflow-hidden relative">
        {/* Busy Overlay */}
        {isBusy && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-[1px] z-20 flex flex-col items-center justify-center gap-2">
            <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold text-slate-700">{t('editing')}</p>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-2 mb-3 text-slate-600">
          <HiOutlineSparkles className="w-4 h-4 text-orange-500" />
          <span className="font-black text-[10px] uppercase tracking-widest">{t('label')}</span>
          {page.templateName && (
            <span className="ml-auto text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
              {page.templateName}
            </span>
          )}
        </div>

        {/* Title */}
        <p className="text-sm font-bold text-slate-800 mb-3">{page.title || t('untitled')}</p>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 mb-3 bg-white rounded-lg p-1 border border-slate-200">
          <button
            onClick={() => setViewMode('preview')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-all ${
              viewMode === 'preview'
                ? 'bg-slate-800 text-white'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <HiOutlineEye className="w-3.5 h-3.5" />
            {t('preview')}
          </button>
          <button
            onClick={() => setViewMode('code')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-all ${
              viewMode === 'code'
                ? 'bg-slate-800 text-white'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <HiOutlineCode className="w-3.5 h-3.5" />
            {t('sourceCode')}
          </button>
        </div>

        {/* Preview / Code View */}
        {viewMode === 'preview' ? (
          <div className="space-y-3">
            {/* Device Toggle */}
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setDevice('desktop')}
                className={`p-1.5 rounded-md transition-all ${
                  device === 'desktop'
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
                title={t('desktop')}
              >
                <HiOutlineDesktopComputer className="w-4 h-4" />
              </button>
              <button
                onClick={() => setDevice('mobile')}
                className={`p-1.5 rounded-md transition-all ${
                  device === 'mobile'
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
                title={t('mobile')}
              >
                <HiOutlineDeviceMobile className="w-4 h-4" />
              </button>
            </div>

            {/* Preview Frame */}
            <div className={`mx-auto transition-all ${deviceWidth}`}>
              <div className={`bg-white rounded-xl border border-slate-200 overflow-hidden ${device === 'mobile' ? 'shadow-lg' : ''}`}>
                <div className="h-6 bg-slate-100 border-b border-slate-200 flex items-center px-3 gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                </div>
                <iframe
                  ref={iframeRef}
                  srcDoc={previewHtml}
                  className={`w-full ${deviceHeight} border-0`}
                  title="Landing Page Preview"
                  sandbox="allow-scripts"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-slate-900 rounded-xl p-4 overflow-auto max-h-64">
              <pre className="text-xs text-green-400 whitespace-pre-wrap font-mono">
                {fullHtml.length > 2000
                  ? fullHtml.substring(0, 2000) + '\n\n... (còn tiếp)'
                  : fullHtml}
              </pre>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-700 transition"
              >
                {copied ? <HiOutlineCheck className="w-3.5 h-3.5" /> : <HiOutlineClipboard className="w-3.5 h-3.5" />}
                {copied ? t('copied') : t('copyCode')}
              </button>
              <button
                onClick={handleDownload}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-200 transition"
              >
                <HiOutlineDownload className="w-3.5 h-3.5" />
                Download
              </button>
            </div>
          </div>
        )}

        {/* AI Inline Edit Box */}
        {showEditBox && (
          <div className="mt-3 bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-3 border border-orange-200 space-y-2">
            <div className="flex items-center gap-1.5 text-orange-800 font-bold text-xs">
              <HiOutlineSparkles className="w-3.5 h-3.5 text-orange-500" />
              <span>{t('editBoxTitle')}</span>
            </div>
            <textarea
              value={editInstruction}
              onChange={(e) => setEditInstruction(e.target.value)}
              placeholder={t('editBoxPlaceholder')}
              rows={2}
              className="w-full text-xs rounded-lg border border-orange-200 bg-white p-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
              disabled={isBusy}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleSubmitEdit(e);
                }
              }}
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowEditBox(false);
                  setEditInstruction('');
                }}
                disabled={isBusy}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg transition"
              >
                {t('cancelEdit')}
              </button>
              <button
                type="button"
                onClick={handleSubmitEdit}
                disabled={!editInstruction.trim() || isBusy}
                className="px-4 py-1.5 text-xs font-bold bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg transition flex items-center gap-1.5 shadow-sm"
              >
                <HiOutlineSparkles className="w-3.5 h-3.5" />
                {isBusy ? t('editing') : t('applyEdit')}
              </button>
            </div>
          </div>
        )}

        {/* Lưu & xuất bản (Việc 2.2) */}
        {!isSaved && showSaveForm && (
          <form
            onSubmit={handleSubmitSave}
            className="mt-3 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-3 border border-slate-200 space-y-2"
          >
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                {t('save.title')}
              </label>
              <input
                type="text"
                value={saveTitle}
                onChange={handleTitleChange}
                disabled={saveBusy === 'create'}
                className="w-full text-xs rounded-lg border border-slate-200 bg-white p-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                {t('save.slug')}
              </label>
              <input
                type="text"
                value={saveSlug}
                onChange={handleSlugChange}
                placeholder={t('save.slugPlaceholder')}
                disabled={saveBusy === 'create'}
                className="w-full text-xs rounded-lg border border-slate-200 bg-white p-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
              {saveSlug && (
                <p className="mt-1 text-[10px] text-slate-400 truncate">{getPublicUrlFromSlug(saveSlug)}</p>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={savePublishNow}
                onChange={(e) => setSavePublishNow(e.target.checked)}
                disabled={saveBusy === 'create'}
              />
              {t('save.publishNow')}
            </label>
            {saveError && <p className="text-xs text-red-600">{saveError}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSaveForm(false)}
                disabled={saveBusy === 'create'}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg transition"
              >
                {t('save.cancel')}
              </button>
              <button
                type="submit"
                disabled={saveBusy === 'create'}
                className="px-4 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded-lg transition"
              >
                {saveBusy === 'create' ? t('save.saving') : t('save.submit')}
              </button>
            </div>
          </form>
        )}

        {isSaved && (
          <div className="mt-3 bg-emerald-50 rounded-xl p-3 border border-emerald-200 space-y-2">
            <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs">
              <HiOutlineCheck className="w-3.5 h-3.5" />
              <span>{t('save.saved')}</span>
            </div>
            {publicUrl && (
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 underline truncate"
              >
                <HiOutlineGlobeAlt className="w-3.5 h-3.5 shrink-0" />
                {publicUrl}
              </a>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to={`/app/settings/landing-pages/${page.landingPageId}/edit`}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-emerald-200 text-emerald-700 text-[10px] font-bold rounded-lg hover:bg-emerald-100 transition"
              >
                <HiOutlinePencilAlt className="w-3 h-3" />
                {t('save.openEditor')}
              </Link>
              {canSave && (
                <button
                  type="button"
                  onClick={handleTogglePublish}
                  disabled={Boolean(saveBusy)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-emerald-200 text-emerald-700 text-[10px] font-bold rounded-lg hover:bg-emerald-100 transition disabled:opacity-50"
                >
                  {saveBusy === 'toggle' ? t('save.saving') : (page.isPublished ? t('save.unpublish') : t('save.publish'))}
                </button>
              )}
              {canSave && (
                <button
                  type="button"
                  onClick={handleUpdateSaved}
                  disabled={Boolean(saveBusy)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-emerald-200 text-emerald-700 text-[10px] font-bold rounded-lg hover:bg-emerald-100 transition disabled:opacity-50"
                >
                  <HiOutlineRefresh className="w-3 h-3" />
                  {saveBusy === 'update' ? t('save.updating') : t('save.updateButton')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Trạng thái kiểm tra hiển thị + Hoàn tác — dải nhỏ phía trên hàng nút */}
        {(layoutStatus === 'checking' || (okStatus && !okStripHidden) || stillBroken || canRevert) && (
          <div className="mt-3 space-y-2" data-testid="landing-layout-strip">
            {layoutStatus === 'checking' && (
              <div role="status" className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                {t('layoutChecking')}
              </div>
            )}
            {okStatus && !okStripHidden && (
              <div role="status" className="text-[11px] font-semibold text-emerald-700">
                {t('layoutOk')}
              </div>
            )}
            {stillBroken && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                <p className="flex items-start gap-1.5 text-xs text-amber-900">
                  <HiOutlineExclamation className="w-4 h-4 flex-shrink-0 text-amber-600" />
                  <span>{describeFindingsForUser(layoutFindings, t)}</span>
                </p>
                <button
                  type="button"
                  onClick={handleRelayout}
                  disabled={isBusy}
                  className="w-full py-2 bg-white border border-amber-300 text-amber-800 text-[11px] font-bold rounded-lg hover:bg-amber-100 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <HiOutlineRefresh className="w-3.5 h-3.5" />
                  {t('relayoutSection')}
                </button>
              </div>
            )}
            {canRevert && (
              <button
                type="button"
                onClick={handleRevert}
                disabled={isBusy || isReverting}
                className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 transition disabled:opacity-50"
              >
                <HiOutlineReply className="w-3.5 h-3.5" />
                {t('undo')}
              </button>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 space-y-2">
          <button
            onClick={handlePreview}
            className="w-full py-2.5 bg-slate-800 text-white font-black text-[11px] uppercase tracking-widest rounded-xl hover:bg-slate-900 flex items-center justify-center gap-2"
          >
            <HiOutlineExternalLink className="w-4 h-4 text-orange-400" />
            {t('viewFullscreen')}
          </button>
          <div className={`grid gap-2 ${showSaveButton ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <button
              onClick={() => setShowEditBox((prev) => !prev)}
              className={`py-2.5 border font-black text-[10px] uppercase tracking-widest rounded-xl flex items-center justify-center gap-1 transition-all ${
                showEditBox
                  ? 'bg-orange-500 border-orange-500 text-white shadow-sm'
                  : 'bg-white border-orange-200 text-orange-700 hover:bg-orange-50'
              }`}
            >
              <HiOutlineSparkles className="w-3.5 h-3.5" />
              {t('editWithAi')}
            </button>
            {showSaveButton && (
              <button
                onClick={handleOpenSaveForm}
                className="py-2.5 bg-white border border-slate-200 text-slate-700 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-slate-50 flex items-center justify-center gap-1"
              >
                <HiOutlinePencilAlt className="w-3.5 h-3.5 text-slate-500" />
                {t('save.button')}
              </button>
            )}
            <button
              onClick={() => onGenerateNew?.()}
              className="py-2.5 bg-slate-50 border border-slate-200 text-slate-600 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-slate-100 flex items-center justify-center gap-1"
            >
              <HiOutlineSparkles className="w-3.5 h-3.5" />
              {t('createNew')}
            </button>
          </div>
        </div>
      </div>

      {/* Fullscreen Modal */}
      {showFullscreen && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-slate-900">
            <span className="text-white font-bold text-sm">{page.title || 'Landing Page Preview'}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDevice('desktop')}
                className={`p-2 rounded-md transition-all ${
                  device === 'desktop' ? 'bg-white text-slate-900' : 'bg-slate-700 text-white'
                }`}
              >
                <HiOutlineDesktopComputer className="w-5 h-5" />
              </button>
              <button
                onClick={() => setDevice('mobile')}
                className={`p-2 rounded-md transition-all ${
                  device === 'mobile' ? 'bg-white text-slate-900' : 'bg-slate-700 text-white'
                }`}
              >
                <HiOutlineDeviceMobile className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowFullscreen(false)}
                className="p-2 bg-slate-700 text-white rounded-md hover:bg-slate-600 transition"
              >
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 bg-slate-800 overflow-auto">
            {device === 'mobile' ? (
              <div className="flex items-center justify-center p-4 min-h-full">
                <div className="w-[375px] h-[667px] flex-shrink-0 bg-white rounded-xl overflow-hidden shadow-2xl">
                  <iframe
                    srcDoc={previewHtml}
                    className="w-full h-full border-0"
                    title="Landing Page Fullscreen Preview"
                    sandbox="allow-scripts"
                  />
                </div>
              </div>
            ) : (
              <div className="h-full p-4 flex flex-col">
                <div className="flex-1 min-h-0 w-full max-w-6xl mx-auto bg-white rounded-xl overflow-hidden shadow-2xl">
                  <iframe
                    srcDoc={previewHtml}
                    className="w-full h-full border-0"
                    title="Landing Page Fullscreen Preview"
                    sandbox="allow-scripts"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default LandingPageCard;
