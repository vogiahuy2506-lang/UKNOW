import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import { HiOutlinePlus, HiOutlineRefresh, HiOutlineTrash, HiOutlinePencil, HiOutlineExternalLink, HiOutlineClipboard, HiOutlineGlobeAlt } from 'react-icons/hi';
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

const BASE_DOMAIN = 'founderai.biz';

const emptyForm = () => ({
  slug: '',
  title: '',
  htmlContent: '',
  isPublished: false,
});

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

  useEffect(() => {
    const aiDraft = location.state?.aiDraft;
    if (!aiDraft) return;
    setEditingId(null);
    setForm({
      slug: '',
      title: aiDraft.title || '',
      htmlContent: (() => {
        if (!aiDraft.html) return '';
        const isFullDoc = /<!doctype\s+html/i.test(aiDraft.html) || /<html[\s>]/i.test(aiDraft.html);
        if (isFullDoc) return aiDraft.html;
        return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${aiDraft.title || ''}</title><script src="https://cdn.tailwindcss.com"></script><style>${aiDraft.css || ''}</style></head><body>${aiDraft.html}</body></html>`;
      })(),
      isPublished: false,
    });
    setModalOpen(true);
    window.history.replaceState({}, '');
  }, [location.state]);

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

  const tableRows = useMemo(() => {
    return rows.map((r) => {
      const st = statsBySlug.get(r.slug) || {};
      const domain = r.customDomainHostname || `${r.slug}.${BASE_DOMAIN}`;
      return {
        ...r,
        viewCount: Number(st.viewCount || 0),
        clickCount: Number(st.clickCount || 0),
        submitCount: Number(st.submitCount || 0),
        displayDomain: domain,
        isCustomDomain: Boolean(r.customDomainHostname),
        isApexDomain: Boolean(r.customDomainIsApex),
      };
    });
  }, [rows, statsBySlug]);

  const previewSrcDoc = useMemo(() => {
    const slug = String(form.slug || '').trim().toLowerCase();
    const rawTrim = (form.htmlContent || '').trim();
    const emptyHint =
      `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Preview</title></head><body><p class="p-4 text-gray-500 text-sm">${t('landingPagesAdmin.previewPlaceholder')}</p></body></html>`;
    if (!slug) {
      const raw = rawTrim || emptyHint;
      if (!raw || raw.includes('cdn.tailwindcss.com')) return raw;
      return raw.replace(/<head([^>]*)>/i, `<head$1>\n  <script src="https://cdn.tailwindcss.com"></script>`);
    }
    if (typeof window === 'undefined') {
      return rawTrim || emptyHint;
    }
    // Filter out Node.js code (require, __dirname, __filename, module.exports, process, etc.)
    // Remove entire script blocks containing Node.js syntax
    let cleanHtml = rawTrim
      // Remove <script>...</script> blocks containing Node.js keywords
      .replace(/<script(?:\s[^>]*)?>(?:[^<]|<(?!\/script))*?(?:require|__dirname|__filename|module\.exports|process\.|global\.)(?:[^<]|<(?!\/script))*?<\/script>/gi, '')
      // Remove <script src="..."> with Node.js-related filenames
      .replace(/<script[^>]*src\s*=[^>]*require[^>]*><\/script>/gi, '')
      // Replace any remaining require() calls in scripts with safe comment
      .replace(/require\s*\([^)]*\)/gi, '/* require removed */');

    // Handle case where rawTrim is a full HTML document vs just content
    const isFullHtml = /<html[\s>]/i.test(cleanHtml);
    const origin = window.location.origin;
    const apiBase = normalizeLandingLpTrackApiBase(
      String(import.meta.env.VITE_API_URL || `${origin}/api`)
    );

    let baseHtml;
    if (isFullHtml) {
      // Extract body content and re-wrap for preview
      const bodyMatch = cleanHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      const bodyContent = bodyMatch ? bodyMatch[1] : cleanHtml;
      baseHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${form.title || ''}</title></head><body>${bodyContent}</body></html>`;
    } else {
      baseHtml = cleanHtml
        ? `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${form.title || ''}</title></head><body>${cleanHtml}</body></html>`
        : '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Preview</title></head><body></body></html>';
    }

    const preview = prepareLandingHtmlForPreview(baseHtml, { slug, frontendOrigin: origin, apiBase });
    if (preview.includes('cdn.tailwindcss.com')) return preview;
    return preview.replace(/<head([^>]*)>/i, `<head$1>\n  <script src="https://cdn.tailwindcss.com"></script>`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.htmlContent, form.slug, form.title]);

  const previewExternalUrl = useMemo(() => {
    const slug = String(form.slug || '').trim().toLowerCase();
    if (!slug || typeof window === 'undefined') return '';
    return `https://${encodeURIComponent(slug)}.${BASE_DOMAIN}`;
  }, [form.slug]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = async (row) => {
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
        const created = await createLandingPageAdmin({
          slug,
          title: form.title,
          htmlContent: form.htmlContent,
          isPublished: form.isPublished,
        });
        toast.success(t('landingPagesAdmin.created'));
        if (created?.customDomainProvisioned === false) {
          toast.error(created.customDomainMessage || 'Landing đã tạo nhưng subdomain chưa được cấp qua Cloudflare.');
        }
      }
      closeModal();
      reloadAll();
    } catch (e) {
      if (!e._upgradeToastShown) {
        toast.error(e?.response?.data?.message || e?.message || t('landingPagesAdmin.saveFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(t('landingPagesAdmin.confirmDelete'))) return;
    try {
      await deleteLandingPageAdmin(row.id);
      toast.success(t('landingPagesAdmin.deleted'));
      reloadAll();
    } catch (e) {
      toast.error(e?.response?.data?.message || t('landingPagesAdmin.deleteFailed'));
    }
  };

  const copyToClipboard = (text, msg) => {
    navigator.clipboard.writeText(text).then(() => toast.success(msg || 'Đã copy'));
  };

  const getPublicUrl = (r) => {
    if (r?.customDomainHostname) {
      return `https://${r.customDomainHostname}`;
    }
    return `https://${r?.slug || ''}.${BASE_DOMAIN}`;
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
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : tableRows.length === 0 ? (
          <div className="text-center py-12">
            <HiOutlineGlobeAlt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">{t('landingPagesAdmin.noDynamicYet')}</p>
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              <HiOutlinePlus className="w-4 h-4 mr-2 inline" />
              {t('landingPagesAdmin.createNew')}
            </button>
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100 bg-gray-50/50">
                <th className="p-3 font-medium">{t('landingPagesAdmin.titleCol')}</th>
                <th className="p-3 font-medium">{t('landingPagesAdmin.domainCol') || 'Domain'}</th>
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
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/80 transition-colors">
                  <td className="p-3 font-medium text-gray-900">{r.title || '—'}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <code className={`font-mono text-xs px-2 py-1 rounded ${
                        r.isCustomDomain ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {r.displayDomain}
                      </code>
                      {r.isCustomDomain && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-600">
                          {r.isApexDomain ? 'Apex' : 'Sub'}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => copyToClipboard(getPublicUrl(r), 'Đã copy URL')}
                        className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                        title="Copy URL"
                      >
                        <HiOutlineClipboard className="w-3.5 h-3.5" />
                      </button>
                      <a
                        href={getPublicUrl(r)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Mở trong tab mới"
                      >
                        <HiOutlineExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </td>
                  <td className="p-3">
                    {r.isPublished ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        {t('common.yes')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        {t('common.no')}
                      </span>
                    )}
                  </td>
                  <td className="p-3 tabular-nums text-gray-700">{Number(r.viewCount || 0).toLocaleString('vi-VN')}</td>
                  <td className="p-3 tabular-nums text-gray-700">{Number(r.clickCount || 0).toLocaleString('vi-VN')}</td>
                  <td className="p-3 tabular-nums text-gray-700">{Number(r.submitCount || 0).toLocaleString('vi-VN')}</td>
                  <td className="p-3 text-xs text-gray-500">
                    {r.updatedAt ? new Date(r.updatedAt).toLocaleString('vi-VN') : '—'}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1 justify-end">
                      <button
                        type="button"
                        className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                        title={t('common.edit')}
                        onClick={() => openEdit(r)}
                      >
                        <HiOutlinePencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                        title={t('common.delete')}
                        onClick={() => remove(r)}
                      >
                        <HiOutlineTrash className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
