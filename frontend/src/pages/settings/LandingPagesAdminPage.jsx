import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import { HiOutlinePlus, HiOutlineRefresh, HiOutlineTrash, HiOutlinePencil } from 'react-icons/hi';
import {
  createLandingPageAdmin,
  deleteLandingPageAdmin,
  fetchLandingPagesAdminList,
  fetchLandingPageAdminById,
  updateLandingPageAdmin,
  fetchLandingPagesDashboardStats,
} from '../../features/landing-pages/services/landingPagesAdminApi.service.js';
import LandingPageFullEditor from '../../features/landing-pages/components/LandingPageFullEditor.jsx';
import { prepareLandingHtmlForPreview } from '../../features/landing-pages/utils/injectLandingEnhancements.js';
import { normalizeLandingLpTrackApiBase } from '../../features/landing-pages/utils/normalizeLandingLpTrackApiBase.js';

const emptyForm = () => ({
  slug: '',
  title: '',
  htmlContent: '',
  isPublished: false,
});

/** Slug landing React tại `/l` — chỉ xem thống kê, không CRUD qua trang này. */
const FIXED_LANDING_SLUG = 'l';

/**
 * Quản trị landing HTML động — `/lp/:slug`. Khi Lưu, backend chuẩn hóa HTML (link tracking + script); iframe form do admin dán từ khối copy trong editor.
 */
export default function LandingPagesAdminPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [statsPack, setStatsPack] = useState({ filters: {}, rows: [] });
  const location = useLocation();

  // Auto-open editor when AI chatbot passes a landing page draft
  useEffect(() => {
    const aiDraft = location.state?.aiDraft;
    if (!aiDraft) return;
    setEditingId(null);
    setForm({
      slug: '',
      title: aiDraft.title || '',
      htmlContent: aiDraft.html
        ? `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${aiDraft.title || ''}</title><style>${aiDraft.css || ''}</style></head><body>${aiDraft.html}</body></html>`
        : '',
      isPublished: false,
    });
    setModalOpen(true);
    // Clear state so refreshing doesn't re-open
    window.history.replaceState({}, '');
  }, [location.state]);

  /**
   * Tải danh sách CMS + thống kê landing (toàn thời gian) song song.
   */
  const reloadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [list, d] = await Promise.all([
        fetchLandingPagesAdminList(),
        fetchLandingPagesDashboardStats({ allTime: 1 }),
      ]);
      setRows(list);
      setStatsPack(d);
    } catch (e) {
      toast.error(e?.response?.data?.message || t('landingPagesAdmin.loadFailed'));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    reloadAll();
  }, [reloadAll]);

  const statsBySlug = useMemo(() => {
    const m = new Map();
    for (const r of statsPack.rows || []) {
      if (r?.slug) m.set(String(r.slug), r);
    }
    return m;
  }, [statsPack.rows]);

  /** Một hàng cố định `/l` + các bản ghi CMS đã gộp số liệu. */
  const tableRows = useMemo(() => {
    const fixed = statsBySlug.get(FIXED_LANDING_SLUG) || {};
    const fixedRow = {
      id: '__fixed_l',
      slug: FIXED_LANDING_SLUG,
      title: t('landingPagesAdmin.fixedLanding'),
      isPublished: true,
      isFixed: true,
      updatedAt: null,
      viewCount: Number(fixed.viewCount || 0),
      clickCount: Number(fixed.clickCount || 0),
      submitCount: Number(fixed.submitCount || 0),
    };
    const rest = rows.map((r) => {
      const st = statsBySlug.get(r.slug) || {};
      return {
        ...r,
        isFixed: false,
        viewCount: Number(st.viewCount || 0),
        clickCount: Number(st.clickCount || 0),
        submitCount: Number(st.submitCount || 0),
      };
    });
    return [fixedRow, ...rest];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, statsBySlug]);

  /**
   * Xem trước gần giống bản lưu: strip khối Founder AI cũ + rewrite link http(s) + chèn lp-track.js (iframe không tự chèn).
   * Cần slug hợp lệ (khác `l`) và `window` để tính origin / API base.
   */
  const previewSrcDoc = useMemo(() => {
    const slug = String(form.slug || '').trim().toLowerCase();
    const rawTrim = (form.htmlContent || '').trim();
    const emptyHint =
      `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Preview</title></head><body><p class="p-4 text-gray-500 text-sm">${t('landingPagesAdmin.previewPlaceholder')}</p></body></html>`;
    if (!slug || slug === FIXED_LANDING_SLUG) {
      return rawTrim || emptyHint;
    }
    if (typeof window === 'undefined') {
      return rawTrim || emptyHint;
    }
    const origin = window.location.origin;
    const apiBase = normalizeLandingLpTrackApiBase(
      String(import.meta.env.VITE_API_URL || `${origin}/api`)
    );
    const baseHtml = rawTrim
      ? form.htmlContent
      : '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Preview</title></head><body></body></html>';
    const preview = prepareLandingHtmlForPreview(baseHtml, { slug, frontendOrigin: origin, apiBase });
    if (preview.includes('cdn.tailwindcss.com')) return preview;
    return preview.replace(/<head([^>]*)>/i, `<head$1>\n  <script src="https://cdn.tailwindcss.com"></script>`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.htmlContent, form.slug]);

  const previewExternalUrl = useMemo(() => {
    const slug = String(form.slug || '').trim().toLowerCase();
    if (!slug || typeof window === 'undefined') return '';
    return `${window.location.origin}/lp/${encodeURIComponent(slug)}`;
  }, [form.slug]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = async (row) => {
    if (row.isFixed) return;
    try {
      const full = await fetchLandingPageAdminById(row.id);
      setEditingId(full.id);
      setForm({
        slug: full.slug || '',
        title: full.title || '',
        htmlContent: full.htmlContent || '',
        isPublished: Boolean(full.isPublished),
      });
      setModalOpen(true);
    } catch (e) {
      toast.error(e?.response?.data?.message || t('landingPagesAdmin.loadDetailFailed'));
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  const save = async () => {
    const slug = String(form.slug || '').trim().toLowerCase();
    if (!slug) {
      toast.error(t('landingPagesAdmin.slugRequired'));
      return;
    }
    if (slug === FIXED_LANDING_SLUG) {
      toast.error(t('landingPagesAdmin.reservedSlug'));
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateLandingPageAdmin(editingId, {
          slug,
          title: form.title,
          htmlContent: form.htmlContent,
          isPublished: form.isPublished,
        });
        toast.success(t('landingPagesAdmin.updated'));
      } else {
        await createLandingPageAdmin({
          slug,
          title: form.title,
          htmlContent: form.htmlContent,
          isPublished: form.isPublished,
        });
        toast.success(t('landingPagesAdmin.created'));
      }
      closeModal();
      reloadAll();
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || t('landingPagesAdmin.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (row.isFixed) return;
    if (!window.confirm(t('landingPagesAdmin.confirmDelete'))) return;
    try {
      await deleteLandingPageAdmin(row.id);
        toast.success(t('landingPagesAdmin.deleted'));
      reloadAll();
    } catch (e) {
      toast.error(e?.response?.data?.message || t('landingPagesAdmin.deleteFailed'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t('landingPagesAdmin.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('landingPagesAdmin.description')}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="btn btn-secondary flex items-center gap-2" onClick={() => reloadAll()} disabled={loading}>
            <HiOutlineRefresh className="w-4 h-4" />
            {t('landingPagesAdmin.reload')}
          </button>
          <button type="button" className="btn btn-primary flex items-center gap-2" onClick={openCreate}>
            <HiOutlinePlus className="w-4 h-4" />
            {t('landingPagesAdmin.createNew')}
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <p className="p-6 text-sm text-gray-500">{t('landingPagesAdmin.loading')}</p>
        ) : (
          <>
            {rows.length === 0 ? (
              <p className="px-4 pt-4 text-sm text-gray-500">
                {t('landingPagesAdmin.noDynamicYet')}
              </p>
            ) : null}
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="p-3 font-medium">{t('landingPagesAdmin.slug')}</th>
                  <th className="p-3 font-medium">{t('landingPagesAdmin.titleCol')}</th>
                  <th className="p-3 font-medium">{t('landingPagesAdmin.published')}</th>
                  <th className="p-3 font-medium tabular-nums">{t('landingPagesAdmin.views')}</th>
                  <th className="p-3 font-medium tabular-nums">{t('landingPagesAdmin.clicks')}</th>
                  <th className="p-3 font-medium tabular-nums">{t('landingPagesAdmin.forms')}</th>
                  <th className="p-3 font-medium">{t('landingPagesAdmin.updated')}</th>
                  <th className="p-3 w-32" />
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => (
                  <tr
                    key={r.isFixed ? 'fixed-l' : r.id}
                    className={`border-b border-gray-50 ${r.isFixed ? 'bg-sky-50/50' : 'hover:bg-gray-50/80'}`}
                  >
                    <td className="p-3 font-mono text-xs">
                      {r.slug}
                      {r.isFixed ? (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-sky-700 font-sans">{t('landingPagesAdmin.fixed')}</span>
                      ) : null}
                    </td>
                    <td className="p-3 text-gray-800">{r.title || '—'}</td>
                    <td className="p-3">{r.isPublished ? t('common.yes') : t('common.no')}</td>
                    <td className="p-3 tabular-nums text-gray-700">{Number(r.viewCount || 0).toLocaleString('vi-VN')}</td>
                    <td className="p-3 tabular-nums text-gray-700">{Number(r.clickCount || 0).toLocaleString('vi-VN')}</td>
                    <td className="p-3 tabular-nums text-gray-700">{Number(r.submitCount || 0).toLocaleString('vi-VN')}</td>
                    <td className="p-3 text-xs text-gray-500">
                      {r.updatedAt ? new Date(r.updatedAt).toLocaleString('vi-VN') : '—'}
                    </td>
                    <td className="p-3">
                      {r.isFixed ? (
                        <span className="text-xs text-gray-400">—</span>
                      ) : (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
                            title={t('common.edit')}
                            onClick={() => openEdit(r)}
                          >
                            <HiOutlinePencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                            title={t('common.delete')}
                            onClick={() => remove(r)}
                          >
                            <HiOutlineTrash className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <LandingPageFullEditor
        open={modalOpen}
        editingId={editingId}
        form={form}
        setForm={setForm}
        saving={saving}
        previewSrcDoc={previewSrcDoc}
        links={{ preview: previewExternalUrl }}
        onClose={closeModal}
        onSave={save}
      />
    </div>
  );
}
