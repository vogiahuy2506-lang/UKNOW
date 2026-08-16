import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineArrowLeft,
  HiOutlineTrash,
  HiOutlineRefresh,
  HiOutlineTranslate,
} from 'react-icons/hi';
import { useI18n } from '../../i18n';
import help from '../../services/help.service';
import RichTextEditor from '../../components/editor/RichTextEditor';
import { miniMarkdownToHtml } from '../../utils/miniMarkdownToHtml';

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
  /** New articles default to rich editor; existing MD-only stay on textarea until converted */
  const [useRichEditor, setUseRichEditor] = useState(isCreate);

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

  const handleConvertToRich = () => {
    if (!window.confirm(t('adminHelp.convertToRichConfirm'))) return;
    const html = miniMarkdownToHtml(form.body_md);
    setForm((prev) => ({ ...prev, body_html: html }));
    setUseRichEditor(true);
    toast.success(t('adminHelp.convertToRichDone'));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
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
    return <div className="p-10 text-center text-sm text-slate-400">{t('common.loading')}</div>;
  }

  const currentLocale = form.locale || 'vi';
  const showStale = currentLocale === 'en' && form.is_stale;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/admin/help-articles" className="p-2 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100">
            <HiOutlineArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isCreate ? t('adminHelp.newArticle') : t('adminHelp.editArticle')}
            </h1>
            {!isCreate && form.slug && (
              <p className="mt-1 text-sm text-gray-500">/huong-dan/{form.slug}</p>
            )}
            {!isCreate && pendingEmbedCount > 0 && (
              <p className="mt-2 inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">
                {t('adminHelp.pendingEmbedBadge')}
              </p>
            )}
          </div>
        </div>

        {!isCreate && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
              <button
                type="button"
                onClick={() => switchLocale('vi')}
                disabled={!siblingViId && currentLocale !== 'vi'}
                className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${
                  currentLocale === 'vi' ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-50'
                }`}
                title={!siblingViId && currentLocale !== 'vi' ? 'Lỗi: Thiếu bản gốc tiếng Việt' : t('adminHelp.switchToVi')}
              >
                {t('adminHelp.localeVi')}
              </button>
              <button
                type="button"
                onClick={() => switchLocale('en')}
                disabled={!siblingEnId}
                className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${
                  currentLocale === 'en' ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-50'
                }`}
                title={!siblingEnId ? t('adminHelp.enMissingHint') : t('adminHelp.switchToEn')}
              >
                {t('adminHelp.localeEn')}
              </button>
            </div>
            {(currentLocale === 'vi' || siblingViId) && (
              <button
                type="button"
                onClick={handleTranslate}
                disabled={isTranslating}
                className="btn btn-secondary inline-flex items-center gap-2"
              >
                <HiOutlineTranslate className={`h-4 w-4 ${isTranslating ? 'animate-pulse' : ''}`} />
                {isTranslating ? t('adminHelp.translating') : t('adminHelp.translateEn')}
              </button>
            )}
          </div>
        )}
      </div>

      {showStale && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {t('adminHelp.staleBadge')}
        </div>
      )}
      {!isCreate && currentLocale === 'vi' && !siblingEnId && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
          {t('adminHelp.enMissingHint')}
        </div>
      )}
      {!isCreate && currentLocale === 'en' && !siblingViId && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Lỗi dữ liệu:</strong> Bài viết này hiện chỉ có bản tiếng Anh (bản gốc tiếng Việt cùng slug đã bị xoá hoặc không tồn tại). Nút chuyển "VI" và nút dịch tự động bị vô hiệu hoá. Để sửa lỗi, bạn hãy xoá bài này và viết lại từ đầu bằng tiếng Việt.
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('adminHelp.fieldTitle')} *</label>
            <input
              type="text"
              className="input"
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('adminHelp.fieldSlug')} *</label>
            <input
              type="text"
              className="input"
              value={form.slug}
              onChange={(e) => setField('slug', e.target.value)}
              placeholder="vi-du-slug-bai-viet"
              required
              disabled={currentLocale === 'en'}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('adminHelp.fieldSummary')}</label>
          <textarea
            className="input"
            rows={2}
            value={form.summary}
            onChange={(e) => setField('summary', e.target.value)}
          />
        </div>

        <div>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <label className="block text-sm font-medium text-gray-700">
              {useRichEditor ? t('adminHelp.fieldBodyHtml') : t('adminHelp.fieldBody')}
            </label>
            {!useRichEditor && (
              <button
                type="button"
                onClick={handleConvertToRich}
                className="text-xs font-medium text-primary-600 hover:text-primary-700"
              >
                {t('adminHelp.convertToRich')}
              </button>
            )}
          </div>
          {useRichEditor ? (
            <RichTextEditor
              value={form.body_html}
              onChange={(html) => setField('body_html', html)}
              disabled={isSaving}
            />
          ) : (
            <>
              <textarea
                className="input font-mono text-xs"
                rows={16}
                value={form.body_md}
                onChange={(e) => setField('body_md', e.target.value)}
                placeholder={'# Tiêu đề\n\nNội dung hướng dẫn...\n\n- Bước 1\n- Bước 2'}
              />
              <p className="mt-1 text-xs text-slate-400">{t('adminHelp.bodyHint')}</p>
            </>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('adminHelp.fieldFeatureKey')} *</label>
            <input
              type="text"
              className="input"
              value={form.feature_key}
              onChange={(e) => setField('feature_key', e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('adminHelp.fieldPrimaryRoute')}</label>
            <input
              type="text"
              className="input"
              value={form.primary_route}
              onChange={(e) => setField('primary_route', e.target.value)}
              placeholder="/app/..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('adminHelp.fieldSortOrder')}</label>
            <input
              type="number"
              className="input"
              value={form.sort_order}
              onChange={(e) => setField('sort_order', e.target.value)}
            />
          </div>
        </div>

        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-primary-600"
            checked={form.is_published}
            onChange={(e) => setField('is_published', e.target.checked)}
          />
          <span className="text-sm text-gray-700">{t('adminHelp.fieldPublished')}</span>
        </label>

        {media.length > 0 && (
          <div className="border-t border-slate-100 pt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">{t('adminHelp.mediaList')}</p>
            <ul className="space-y-1 text-sm text-slate-600">
              {media.map((m) => (
                <li key={m.id} className="truncate">
                  [{m.type}] {m.url}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div>
            {!isCreate && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="btn text-red-600 hover:bg-red-50 inline-flex items-center gap-2"
              >
                <HiOutlineTrash className="h-4 w-4" />
                {isDeleting ? t('common.deleting') : t('common.delete')}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isCreate && (
              <button
                type="button"
                onClick={handleReindex}
                disabled={isReindexing}
                className="btn btn-secondary inline-flex items-center gap-2"
              >
                <HiOutlineRefresh className={`h-4 w-4 ${isReindexing ? 'animate-spin' : ''}`} />
                {t('adminHelp.reindex')}
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
