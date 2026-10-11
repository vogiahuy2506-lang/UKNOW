import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineTrash,
  HiOutlineRefresh,
  HiOutlineTranslate,
  HiOutlineBookOpen,
  HiOutlinePencil,
  HiOutlineEye,
  HiOutlineCheck,
  HiOutlineArrowLeft,
  HiOutlineExternalLink,
  HiOutlineSparkles,
} from 'react-icons/hi';
import PageContainer from '../../components/common/PageContainer';
import { useI18n } from '../../i18n';
import help from '../../services/help.service';
import RichTextEditor from '../../components/editor/RichTextEditor';
import { miniMarkdownToHtml } from '../../utils/miniMarkdownToHtml';
import { HELP_FEATURE_KEY_LIST, helpFeatureKeyLabel } from '../../constants/helpFeatureKeys';
import { HELP_ARTICLE_BODY_RICH_CLASS } from '../../constants/helpArticleBodyStyle';

const EMPTY_FORM = {
  title: '',
  slug: '',
  summary: '',
  body_md: '',
  body_html: '',
  feature_key: '',
  primary_route: '',
  sort_order: 0,
  is_published: false,
  locale: 'vi',
  is_stale: false,
};

function hasHtmlBody(html) {
  return Boolean(String(html || '').trim());
}

function slugify(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export default function AdminHelpArticleEditPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const isCreate = id === 'new';

  const [form, setForm] = useState(EMPTY_FORM);
  const [media, setMedia] = useState([]);
  const [siblingEnId, setSiblingEnId] = useState(null);
  const [siblingViId, setSiblingViId] = useState(null);
  const [pendingEmbedCount, setPendingEmbedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(!isCreate);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReindexing, setIsReindexing] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!isCreate);

  /** New articles default to rich editor; existing MD-only stay on textarea until converted */
  const [useRichEditor, setUseRichEditor] = useState(isCreate);

  // ----------------------------------------------------------------- Resizer & Layout state
  const containerRef = useRef(null);
  const [splitRatio, setSplitRatio] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('founder_ai_help_article_split_ratio'));
      if (saved >= 28 && saved <= 72) return saved;
    } catch {}
    return 50;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMouseDownResize = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const rawPercent = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.round(Math.max(28, Math.min(rawPercent, 72)));
      setSplitRatio(clamped);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      try {
        localStorage.setItem('founder_ai_help_article_split_ratio', String(splitRatio));
      } catch {}
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, splitRatio]);

  const handleResetSplit = useCallback(() => {
    setSplitRatio(50);
    try {
      localStorage.setItem('founder_ai_help_article_split_ratio', '50');
    } catch {}
  }, []);

  // ----------------------------------------------------------------- Loaders
  useEffect(() => {
    if (isCreate) {
      setUseRichEditor(true);
      setSiblingEnId(null);
      setSiblingViId(null);
      return;
    }
    let mounted = true;
    setIsLoading(true);
    help.adminGetHelpArticle(id)
      .then((res) => {
        if (!mounted) return;
        const a = res.data?.result || {};
        const html = a.body_html || '';
        setForm({
          title: a.title || '',
          slug: a.slug || '',
          summary: a.summary || '',
          body_md: a.body_md || '',
          body_html: html,
          feature_key: a.feature_key || '',
          primary_route: a.primary_route || '',
          sort_order: a.sort_order ?? 0,
          is_published: Boolean(a.is_published),
          locale: a.locale || 'vi',
          is_stale: Boolean(a.is_stale),
        });
        setSiblingEnId(a.siblingEnId || null);
        setSiblingViId(a.siblingViId || null);
        setPendingEmbedCount(Number(a.pendingEmbedCount) || 0);
        setUseRichEditor(hasHtmlBody(html));
        setMedia(a.media || []);
      })
      .catch((err) => {
        toast.error(err?.response?.data?.message || t('adminHelp.loadFailed'));
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => { mounted = false; };
  }, [id, isCreate, t]);

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleTitleChange = (e) => {
    const nextTitle = e.target.value;
    setField('title', nextTitle);
    if (isCreate && !slugTouched) {
      setField('slug', slugify(nextTitle));
    }
  };

  const handleSlugChange = (e) => {
    setSlugTouched(true);
    setField('slug', e.target.value);
  };

  // Bài cũ có thể mang key ngoài danh mục (vd 'voucher') — vẫn cho hiện để lưu
  // lại không âm thầm đổi chủ đề của bài.
  const featureKeyOptions = form.feature_key && !HELP_FEATURE_KEY_LIST.includes(form.feature_key)
    ? [...HELP_FEATURE_KEY_LIST, form.feature_key]
    : HELP_FEATURE_KEY_LIST;

  const handleConvertToRich = () => {
    if (!window.confirm(t('adminHelp.convertToRichConfirm'))) return;
    const html = miniMarkdownToHtml(form.body_md);
    setForm((prev) => ({ ...prev, body_html: html }));
    setUseRichEditor(true);
    toast.success(t('adminHelp.convertToRichDone'));
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!form.title.trim() || !form.slug.trim() || !form.feature_key.trim()) {
      toast.error(t('adminHelp.requiredFields'));
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        title: form.title,
        slug: form.slug,
        summary: form.summary,
        feature_key: form.feature_key,
        primary_route: form.primary_route || null,
        sort_order: Number(form.sort_order) || 0,
        is_published: form.is_published,
        locale: form.locale || 'vi',
      };
      if (useRichEditor) {
        payload.body_html = form.body_html || '';
        if (isCreate) payload.body_md = '';
      } else {
        payload.body_md = form.body_md;
      }

      if (isCreate) {
        const res = await help.adminCreateHelpArticle(payload);
        toast.success(t('adminHelp.createSuccess'));
        const newId = res.data?.result?.id;
        if (newId) navigate(`/admin/help-articles/${newId}`, { replace: true });
      } else {
        await help.adminUpdateHelpArticle(id, payload);
        toast.success(t('adminHelp.updateSuccess'));
        // Reload để cập nhật badge pendingEmbed (nếu embed tạm lỗi).
        const refreshed = await help.adminGetHelpArticle(id);
        const a = refreshed.data?.result || {};
        setPendingEmbedCount(Number(a.pendingEmbedCount) || 0);
        if (Number(a.pendingEmbedCount) > 0) {
          toast(t('adminHelp.pendingEmbedHint'), { icon: '⚠️' });
        }
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminHelp.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isCreate) return;
    if (!window.confirm(t('adminHelp.confirmDelete'))) return;
    setIsDeleting(true);
    try {
      await help.adminDeleteHelpArticle(id);
      toast.success(t('adminHelp.deleteSuccess'));
      navigate('/admin/help-articles', { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminHelp.deleteFailed'));
      setIsDeleting(false);
    }
  };

  const handleReindex = async () => {
    if (isCreate) return;
    setIsReindexing(true);
    try {
      const res = await help.adminReindexHelpArticle(id);
      const result = res.data?.result || {};
      toast.success(t('adminHelp.reindexSuccess', { count: result.chunkCount ?? 0 }));
      setPendingEmbedCount(result.pendingEmbed ? (result.chunkCount || 1) : 0);
      if (result.pendingEmbed) {
        toast.error(result.embedError || t('adminHelp.pendingEmbedHint'));
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminHelp.reindexFailed'));
    } finally {
      setIsReindexing(false);
    }
  };

  const handleTranslate = async () => {
    if (isCreate) return;
    const sourceId = (form.locale || 'vi') === 'vi' ? id : siblingViId;
    if (!sourceId) {
      toast.error(t('adminHelp.translateFailed'));
      return;
    }
    setIsTranslating(true);
    try {
      const res = await help.adminTranslateHelpArticle(sourceId, 'en');
      const enId = res.data?.result?.id;
      toast.success(t('adminHelp.translateSuccess'));
      if (enId) navigate(`/admin/help-articles/${enId}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminHelp.translateFailed'));
    } finally {
      setIsTranslating(false);
    }
  };

  const switchLocale = (target) => {
    if (isCreate) return;
    if (target === 'vi') {
      if (siblingViId && String(siblingViId) !== String(id)) {
        navigate(`/admin/help-articles/${siblingViId}`);
      }
      return;
    }
    if (siblingEnId) {
      navigate(`/admin/help-articles/${siblingEnId}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-72 items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-dk-muted">
          <span className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <span>{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  const currentLocale = form.locale || 'vi';
  const showStale = currentLocale === 'en' && form.is_stale;

  return (
    <PageContainer className="space-y-3 pb-4">
      {/* ── Studio Top Header Bar: Tinh gọn, tối đa không gian ── */}
      <div className="bg-white dark:bg-dk-surface border border-slate-200/80 dark:border-dk-border rounded-2xl p-3 shadow-xs space-y-2.5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {/* Trái: Nút Quay lại + Icon + Tiêu đề + Badges */}
          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
            <button
              type="button"
              onClick={() => navigate('/admin/help-articles')}
              className="p-1.5 rounded-xl border border-slate-200/80 dark:border-dk-border bg-slate-50 dark:bg-dk-raised text-slate-600 dark:text-dk-text hover:text-slate-900 dark:hover:text-dk-text transition-all shadow-2xs shrink-0"
              title={t('common.back')}
            >
              <HiOutlineArrowLeft className="w-4 h-4" />
            </button>

            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
              <HiOutlineBookOpen className="w-4 h-4" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-dk-text truncate">
                  {isCreate ? t('adminHelp.newArticle') : t('adminHelp.editArticle')}
                </h1>
                {/* Trạng thái xuất bản */}
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 border ${
                    form.is_published
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/80'
                      : 'bg-slate-100 text-slate-600 dark:bg-dk-raised dark:text-dk-text2 border-slate-200 dark:border-dk-border'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${form.is_published ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  <span>{form.is_published ? t('adminHelp.statusPublished') : t('adminHelp.statusDraft')}</span>
                </span>
                {pendingEmbedCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                    <HiOutlineSparkles className="w-3 h-3 text-amber-500 animate-pulse" />
                    <span>{t('adminHelp.pendingEmbedBadge')}</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] font-mono text-slate-500 dark:text-dk-text2 truncate max-w-sm sm:max-w-md">
                /huong-dan/{form.slug || 'slug-bai-viet'}
              </p>
            </div>
          </div>

          {/* Phải: Cụm hành động nhanh */}
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {!isCreate && (
              <>
                {/* Sibling Locale Switcher */}
                <div className="inline-flex rounded-xl border border-slate-200/80 dark:border-dk-border bg-slate-100 dark:bg-dk-raised p-0.5">
                  <button
                    type="button"
                    onClick={() => switchLocale('vi')}
                    disabled={!siblingViId && currentLocale !== 'vi'}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                      currentLocale === 'vi'
                        ? 'bg-white dark:bg-orange-500 text-orange-600 dark:text-dk-text shadow-2xs'
                        : 'text-slate-600 dark:text-dk-text2 hover:text-slate-900 dark:hover:text-dk-text'
                    }`}
                    title={!siblingViId && currentLocale !== 'vi' ? 'Thiếu bản gốc tiếng Việt' : t('adminHelp.switchToVi')}
                  >
                    VI
                  </button>
                  <button
                    type="button"
                    onClick={() => switchLocale('en')}
                    disabled={!siblingEnId}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                      currentLocale === 'en'
                        ? 'bg-white dark:bg-orange-500 text-orange-600 dark:text-dk-text shadow-2xs'
                        : 'text-slate-600 dark:text-dk-text2 hover:text-slate-900 dark:hover:text-dk-text'
                    }`}
                    title={!siblingEnId ? t('adminHelp.enMissingHint') : t('adminHelp.switchToEn')}
                  >
                    EN
                  </button>
                </div>

                {/* Dịch sang EN */}
                {(currentLocale === 'vi' || siblingViId) && (
                  <button
                    type="button"
                    onClick={handleTranslate}
                    disabled={isTranslating}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-dk-text bg-slate-100 hover:bg-slate-200/80 dark:bg-dk-raised dark:hover:bg-dk-strong border border-slate-200/80 dark:border-dk-border/80 rounded-xl transition-all shadow-2xs"
                  >
                    <HiOutlineTranslate className={`h-3.5 w-3.5 ${isTranslating ? 'animate-pulse text-orange-500' : ''}`} />
                    <span className="hidden sm:inline">{isTranslating ? t('adminHelp.translating') : t('adminHelp.translateEn')}</span>
                  </button>
                )}

                {/* Đánh chỉ mục */}
                <button
                  type="button"
                  onClick={handleReindex}
                  disabled={isReindexing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-dk-text bg-slate-100 hover:bg-slate-200/80 dark:bg-dk-raised dark:hover:bg-dk-strong border border-slate-200/80 dark:border-dk-border/80 rounded-xl transition-all shadow-2xs"
                  title={t('adminHelp.reindex')}
                >
                  <HiOutlineRefresh className={`h-3.5 w-3.5 ${isReindexing ? 'animate-spin text-orange-500' : ''}`} />
                  <span className="hidden md:inline">{t('adminHelp.reindex')}</span>
                </button>

                {/* Xóa bài */}
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200/80 dark:border-red-900/40 rounded-xl transition-all shadow-2xs"
                >
                  <HiOutlineTrash className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{isDeleting ? t('common.deleting') : t('common.delete')}</span>
                </button>
              </>
            )}

            {/* Nút Submit / Lưu bài viết */}
            <button
              type="submit"
              form="help-article-form"
              disabled={isSaving}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white rounded-xl shadow-sm transition-all ${
                isSaving
                  ? 'cursor-not-allowed bg-orange-300'
                  : 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 shadow-orange-500/20 active:scale-[0.98]'
              }`}
            >
              {isSaving ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{t('common.saving')}</span>
                </>
              ) : (
                <>
                  <HiOutlineCheck className="h-4 w-4" />
                  <span>{isCreate ? t('adminHelp.newArticle') : t('common.save')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Thông báo lỗi / cảnh báo ngôn ngữ nếu có */}
      {showStale && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40 px-4 py-2 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between">
          <span>{t('adminHelp.staleBadge')}</span>
        </div>
      )}
      {!isCreate && currentLocale === 'vi' && !siblingEnId && (
        <div className="rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-raised px-4 py-2 text-xs text-slate-600 dark:text-dk-text flex items-center justify-between">
          <span>{t('adminHelp.enMissingHint')}</span>
        </div>
      )}
      {!isCreate && currentLocale === 'en' && !siblingViId && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-4 py-2 text-xs text-red-800 dark:text-red-300">
          <strong>Lỗi dữ liệu:</strong> Bài viết này hiện chỉ có bản tiếng Anh. Bản gốc tiếng Việt cùng slug đã bị xoá hoặc không tồn tại.
        </div>
      )}

      {/* ── Metadata Strip: Cấu hình thông tin bài viết gọn gàng ── */}
      <form id="help-article-form" onSubmit={handleSubmit} className="space-y-3">
        <div className="rounded-2xl border border-slate-200/80 dark:border-dk-border bg-white dark:bg-dk-surface p-3 shadow-xs space-y-2.5">
          {/* Hàng 1: Tiêu đề + Slug + Chủ đề + Thứ tự + Toggle Công khai */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-center">
            {/* Tiêu đề */}
            <div className="lg:col-span-4 min-w-0">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-dk-text mb-1">
                {t('adminHelp.fieldTitle')} *
              </label>
              <input
                type="text"
                value={form.title}
                onChange={handleTitleChange}
                placeholder={t('adminHelp.titlePlaceholder')}
                required
                className="w-full h-9 rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50/70 dark:bg-dk-inset px-3 text-xs text-slate-900 dark:text-dk-text placeholder:text-slate-400 focus:border-orange-500 focus:bg-white dark:focus:bg-dk-inset focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>

            {/* Slug */}
            <div className="lg:col-span-3 min-w-0">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-dk-text mb-1">
                {t('adminHelp.fieldSlug')} *
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-2.5 text-[11px] font-mono text-slate-400 dark:text-dk-muted pointer-events-none select-none">
                  /
                </span>
                <input
                  type="text"
                  value={form.slug}
                  onChange={handleSlugChange}
                  placeholder={t('adminHelp.slugPlaceholder')}
                  required
                  disabled={currentLocale === 'en'}
                  className="w-full h-9 pl-5 pr-2.5 rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50/70 dark:bg-dk-inset text-xs font-mono text-slate-900 dark:text-dk-text placeholder:text-slate-400 focus:border-orange-500 focus:bg-white dark:focus:bg-dk-inset focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-50"
                />
              </div>
            </div>

            {/* Chủ đề */}
            <div className="lg:col-span-3 min-w-0">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-dk-text mb-1">
                {t('adminHelp.fieldFeatureKey')} *
              </label>
              <select
                value={form.feature_key}
                onChange={(e) => setField('feature_key', e.target.value)}
                required
                className="w-full h-9 rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50/70 dark:bg-dk-inset px-2.5 text-xs text-slate-900 dark:text-dk-text focus:border-orange-500 focus:bg-white dark:focus:bg-dk-inset focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                <option value="">{t('adminHelp.featureKeyPlaceholder')}</option>
                {featureKeyOptions.map((key) => (
                  <option key={key} value={key}>
                    {helpFeatureKeyLabel(t, key)}
                  </option>
                ))}
              </select>
            </div>

            {/* Thứ tự & Công khai */}
            <div className="lg:col-span-2 flex items-end gap-2">
              <div className="w-16 shrink-0">
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-dk-text mb-1">
                  {t('adminHelp.fieldSortOrder')}
                </label>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setField('sort_order', e.target.value)}
                  className="w-full h-9 text-center rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50/70 dark:bg-dk-inset text-xs text-slate-900 dark:text-dk-text focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={form.is_published}
                onClick={() => setField('is_published', !form.is_published)}
                className={`flex-1 h-9 inline-flex items-center justify-center gap-1.5 px-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  form.is_published
                    ? 'border-emerald-300 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 shadow-2xs'
                    : 'border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-inset text-slate-500 dark:text-dk-text2 hover:border-slate-300'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${form.is_published ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                <span className="truncate">{form.is_published ? t('adminHelp.statusPublished') : t('adminHelp.statusDraftShort')}</span>
              </button>
            </div>
          </div>

          {/* Hàng 2: Tóm tắt bài viết */}
          <div className="pt-1.5 border-t border-slate-100 dark:border-dk-border/80 flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-dk-text2 shrink-0">
              {t('adminHelp.fieldSummary')}:
            </span>
            <input
              type="text"
              value={form.summary}
              onChange={(e) => setField('summary', e.target.value)}
              placeholder={t('adminHelp.summaryPlaceholder')}
              className="flex-1 h-8 rounded-lg border border-slate-200/80 dark:border-dk-border bg-slate-50/50 dark:bg-dk-inset px-3 text-xs text-slate-900 dark:text-dk-text placeholder:text-slate-400 focus:border-orange-500 focus:bg-white dark:focus:bg-dk-inset focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
        </div>

        {/* ── Studio Split View: Soạn thảo (Trái) & Xem trước (Phải) ── */}
        <div
          ref={containerRef}
          className={`flex flex-col lg:flex-row gap-0 items-stretch min-h-[560px] lg:h-[calc(100vh-210px)] relative ${
            isResizing ? 'cursor-col-resize select-none' : ''
          }`}
        >
          {/* CỘT TRÁI: Soạn thảo */}
          <section
            style={isDesktop ? { width: `${splitRatio}%` } : undefined}
            className="w-full lg:w-auto flex flex-col rounded-2xl border border-slate-200/80 dark:border-dk-border bg-white dark:bg-dk-surface shadow-xs overflow-hidden shrink-0"
          >
            {/* Header Editor */}
            <div className="h-10 px-4 border-b border-slate-100 dark:border-dk-border flex items-center justify-between gap-3 shrink-0 bg-slate-50/70 dark:bg-dk-surface">
              <div className="flex items-center gap-2 min-w-0">
                <HiOutlinePencil className="h-4 w-4 text-orange-500 shrink-0" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-dk-text truncate">
                  {useRichEditor ? t('adminHelp.fieldBodyHtml') : t('adminHelp.fieldBody')}
                </h2>
                <span className="text-[11px] font-mono text-slate-400 dark:text-dk-muted">
                  {useRichEditor ? (form.body_html?.length || 0) : (form.body_md?.length || 0)} {t('adminHelp.chars')}
                </span>
              </div>

              {/* Toggle chế độ soạn thảo */}
              <div className="flex items-center gap-1.5 shrink-0">
                {!useRichEditor && (
                  <button
                    type="button"
                    onClick={handleConvertToRich}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30 rounded-lg transition-colors"
                  >
                    <HiOutlineSparkles className="w-3.5 h-3.5" />
                    <span>{t('adminHelp.convertToRich')}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Vùng soạn thảo TipTap hoặc Textarea Markdown */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white dark:bg-dk-inset">
              {useRichEditor ? (
                <RichTextEditor
                  value={form.body_html}
                  onChange={(html) => setField('body_html', html)}
                  disabled={isSaving}
                  className="h-full border-0 rounded-none"
                />
              ) : (
                <div className="flex-1 flex flex-col min-h-0 p-3">
                  <textarea
                    className="flex-1 w-full rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-inset text-slate-900 dark:text-dk-text p-3 font-mono text-xs leading-5 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 resize-none min-h-[220px]"
                    value={form.body_md}
                    onChange={(e) => setField('body_md', e.target.value)}
                    placeholder={t('adminHelp.markdownPlaceholder')}
                    spellCheck={false}
                  />
                  <p className="mt-1.5 text-[11px] text-slate-400 dark:text-dk-muted shrink-0">
                    {t('adminHelp.bodyHint')}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Thanh kéo phân cách thay đổi tỷ lệ giữa Editor và Preview */}
          <div
            role="separator"
            aria-orientation="vertical"
            tabIndex={0}
            onMouseDown={handleMouseDownResize}
            onDoubleClick={handleResetSplit}
            title={t('adminHelp.resizerTooltip')}
            className={`hidden lg:flex w-3 -mx-1.5 z-20 cursor-col-resize select-none shrink-0 items-center justify-center group transition-colors ${
              isResizing ? 'bg-orange-500/20' : 'hover:bg-orange-500/10'
            }`}
          >
            <div
              className={`w-1 h-10 rounded-full transition-colors ${
                isResizing ? 'bg-orange-500' : 'bg-slate-300 dark:bg-dk-strong group-hover:bg-orange-400'
              }`}
            />
          </div>

          {/* CỘT PHẢI: Xem trước trực tiếp */}
          <section
            style={isDesktop ? { width: `${100 - splitRatio}%` } : undefined}
            className="w-full lg:w-auto flex-1 flex flex-col rounded-2xl border border-slate-200/80 dark:border-dk-border bg-white dark:bg-dk-surface shadow-xs overflow-hidden shrink-0 mt-4 lg:mt-0 min-h-0"
          >
            {/* Header Preview */}
            <div className="h-10 px-4 border-b border-slate-100 dark:border-dk-border flex items-center justify-between gap-3 shrink-0 bg-slate-50/70 dark:bg-dk-surface">
              <div className="flex items-center gap-2 min-w-0">
                <HiOutlineEye className="h-4 w-4 text-orange-500 shrink-0" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-dk-text shrink-0">
                  {t('adminHelp.previewLabel')}
                </h2>
                <span className="text-[11px] text-slate-400 dark:text-dk-muted truncate hidden sm:inline">
                  {t('adminHelp.previewHint')}
                </span>
              </div>

              {!isCreate && form.slug && (
                <a
                  href={`/huong-dan/${form.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-dk-text hover:text-orange-600 dark:hover:text-orange-400 bg-slate-100 dark:bg-dk-raised hover:bg-slate-200/80 rounded-lg transition-colors shrink-0"
                >
                  <HiOutlineExternalLink className="h-3.5 w-3.5" />
                  <span>{t('adminHelp.openLivePage')}</span>
                </a>
              )}
            </div>

            {/* Email / Website Mock Window */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-100 dark:bg-dk-inset p-2.5">
              <div className="flex-1 flex flex-col bg-white dark:bg-dk-surface rounded-xl shadow-xs overflow-hidden border border-slate-200/80 dark:border-dk-border">
                {/* Mock Browser Header Bar */}
                <div className="px-3.5 py-2 border-b border-slate-100 dark:border-dk-border/80 bg-slate-50/80 dark:bg-dk-surface flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
                  </div>
                  <div className="flex-1 max-w-sm px-2.5 py-0.5 rounded-lg bg-white dark:bg-dk-inset border border-slate-200 dark:border-dk-border text-[11px] font-mono text-slate-500 dark:text-dk-text2 text-center truncate">
                    founderai.biz/huong-dan/{form.slug || 'slug-bai-viet'}
                  </div>
                  <div className="w-10 shrink-0 text-right text-[10px] text-slate-400">
                    {t('adminHelp.previewBadge')}
                  </div>
                </div>

                {/* Vùng bài viết thật mô phỏng /huong-dan/:slug */}
                <article className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-7 space-y-5 bg-white dark:bg-dk-inset">
                  {/* Breadcrumbs */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-dk-muted font-medium">
                    <span>{t('adminHelp.homeBreadcrumb')}</span>
                    <span>/</span>
                    <span>{t('adminHelp.helpBreadcrumb')}</span>
                    <span>/</span>
                    <span className="text-orange-600 dark:text-orange-400">
                      {helpFeatureKeyLabel(t, form.feature_key) || 'Chủ đề'}
                    </span>
                  </div>

                  {/* Header bài viết */}
                  <header className="space-y-2">
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-dk-text leading-tight">
                      {form.title || 'Tiêu đề bài hướng dẫn'}
                    </h1>
                    {form.summary && (
                      <p className="text-sm text-slate-600 dark:text-dk-text2 italic border-l-2 border-orange-500 pl-3 leading-relaxed">
                        {form.summary}
                      </p>
                    )}
                  </header>

                  {/* Nút giả lập "Hỏi trợ lý AI về bài này" */}
                  <div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs cursor-default"
                    >
                      <HiOutlineSparkles className="h-3.5 w-3.5" />
                      <span>{t('helpDocs.askAssistant')}</span>
                    </button>
                  </div>

                  {/* Nội dung bài viết */}
                  <div className={`border-t border-slate-100 dark:border-dk-border pt-5 ${HELP_ARTICLE_BODY_RICH_CLASS}`}>
                    <div className="overflow-x-auto">
                      {useRichEditor ? (
                        hasHtmlBody(form.body_html) ? (
                          <div dangerouslySetInnerHTML={{ __html: form.body_html }} />
                        ) : (
                          <div className="py-12 text-center text-sm text-slate-400 dark:text-dk-muted">
                            {t('adminHelp.previewEmpty')}
                          </div>
                        )
                      ) : form.body_md.trim() ? (
                        <div dangerouslySetInnerHTML={{ __html: miniMarkdownToHtml(form.body_md) }} />
                      ) : (
                        <div className="py-12 text-center text-sm text-slate-400 dark:text-dk-muted">
                          {t('adminHelp.previewEmpty')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Media đính kèm */}
                  {Array.isArray(media) && media.length > 0 && (
                    <div className="space-y-3 border-t border-slate-100 dark:border-dk-border pt-5">
                      <h4 className="text-xs font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wider">
                        {t('adminHelp.mediaList')} ({media.length})
                      </h4>
                      {media.map((item) => (
                        <figure key={item.id} className="space-y-1.5">
                          {item.type === 'video' ? (
                            <video src={item.url} controls className="w-full rounded-xl border border-slate-200 dark:border-dk-border" />
                          ) : (
                            <img
                              src={item.url}
                              alt={item.caption || form.title}
                              className="w-full rounded-xl border border-slate-200 dark:border-dk-border max-h-80 object-contain bg-slate-50 dark:bg-dk-surface"
                            />
                          )}
                          {item.caption && (
                            <figcaption className="text-xs text-slate-400 text-center">{item.caption}</figcaption>
                          )}
                        </figure>
                      ))}
                    </div>
                  )}
                </article>
              </div>
            </div>
          </section>
        </div>
      </form>
    </PageContainer>
  );
}

