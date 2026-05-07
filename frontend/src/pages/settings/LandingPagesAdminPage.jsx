import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
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
      toast.error(e?.response?.data?.message || 'Không thể tải dữ liệu landing');
    } finally {
      setLoading(false);
    }
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
      title: 'Landing cố định (/l)',
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
  }, [rows, statsBySlug]);

  /**
   * Xem trước gần giống bản lưu: strip khối UKnow cũ + rewrite link http(s) + chèn lp-track.js (iframe không tự chèn).
   * Cần slug hợp lệ (khác `l`) và `window` để tính origin / API base.
   */
  const previewSrcDoc = useMemo(() => {
    const slug = String(form.slug || '').trim().toLowerCase();
    const rawTrim = (form.htmlContent || '').trim();
    const emptyHint =
      '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Preview</title></head><body><p class="p-4 text-gray-500 text-sm">Nhập slug và HTML — xem trước mô phỏng bản sau khi Lưu (tracking + script; dán iframe từ modal nếu cần xem form).</p></body></html>';
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
    return prepareLandingHtmlForPreview(baseHtml, { slug, frontendOrigin: origin, apiBase });
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
      toast.error(e?.response?.data?.message || 'Không tải được chi tiết');
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
      toast.error('Vui lòng nhập slug');
      return;
    }
    if (slug === FIXED_LANDING_SLUG) {
      toast.error('Slug "l" dành cho landing cố định tại /l — không lưu qua CMS này.');
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
        toast.success('Đã cập nhật');
      } else {
        await createLandingPageAdmin({
          slug,
          title: form.title,
          htmlContent: form.htmlContent,
          isPublished: form.isPublished,
        });
        toast.success('Đã tạo landing page');
      }
      closeModal();
      reloadAll();
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || 'Không lưu được');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (row.isFixed) return;
    if (!window.confirm('Xóa landing page này?')) return;
    try {
      await deleteLandingPageAdmin(row.id);
      toast.success('Đã xóa');
      reloadAll();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Không xóa được');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Landing — trang HTML</h1>
          <p className="text-sm text-gray-500 mt-1">
            Dán HTML vào editor — khi <strong>Lưu</strong>, server đổi link <code className="text-xs bg-gray-100 px-1 rounded">http(s)</code> trên{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">&lt;a&gt;</code> sang URL tracking và chèn{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">lp-track.js</code>. Iframe form: copy trong modal và dán vào HTML (không tự chèn). Hàng <strong>slug l</strong> là landing cố định{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">/l</code>{' '}
            — chỉ xem số liệu.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="btn btn-secondary flex items-center gap-2" onClick={() => reloadAll()} disabled={loading}>
            <HiOutlineRefresh className="w-4 h-4" />
            Tải lại
          </button>
          <button type="button" className="btn btn-primary flex items-center gap-2" onClick={openCreate}>
            <HiOutlinePlus className="w-4 h-4" />
            Tạo mới
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <p className="p-6 text-sm text-gray-500">Đang tải…</p>
        ) : (
          <>
            {rows.length === 0 ? (
              <p className="px-4 pt-4 text-sm text-gray-500">
                Chưa có landing HTML động trong CMS; bảng vẫn hiển thị dòng <code className="text-xs bg-gray-100 px-1 rounded">l</code>{' '}
                (landing cố định /l) kèm số liệu.
              </p>
            ) : null}
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="p-3 font-medium">Slug</th>
                  <th className="p-3 font-medium">Tiêu đề</th>
                  <th className="p-3 font-medium">Công bố</th>
                  <th className="p-3 font-medium tabular-nums">Xem</th>
                  <th className="p-3 font-medium tabular-nums">Click (tracking)</th>
                  <th className="p-3 font-medium tabular-nums">Form</th>
                  <th className="p-3 font-medium">Cập nhật</th>
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
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-sky-700 font-sans">cố định</span>
                      ) : null}
                    </td>
                    <td className="p-3 text-gray-800">{r.title || '—'}</td>
                    <td className="p-3">{r.isPublished ? 'Có' : 'Không'}</td>
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
                            title="Sửa"
                            onClick={() => openEdit(r)}
                          >
                            <HiOutlinePencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                            title="Xóa"
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
