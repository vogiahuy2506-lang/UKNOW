import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineX, HiOutlineClock, HiOutlineRefresh, HiOutlineTrash, HiOutlineCheck } from 'react-icons/hi';
import {
  fetchLandingPageVersions,
  previewLandingPageVersion,
  restoreLandingPageVersion,
  deleteLandingPageVersion,
} from '../../landing-pages/services/landingPagesAdminApi.service.js';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';

/**
 * useI18n() trả về context stable (t được memo hóa bên trong provider).
 * useI18n(namespace) trả về wrapper function — sẽ thay đổi reference khi locale thay đổi.
 * Dùng cách này để tránh tc thay đổi reference mỗi render.
 */
function useStableI18n() {
  const { t } = useI18n();
  return (key, params) => t(`landingCanvas.versionHistory.${key}`, params);
}

/**
 * Version History Modal — bật từ topbar icon.
 * Chỉ hiển thị khi editingId != null.
 *
 * Props:
 *  - open: bool
 *  - landingId: number
 *  - currentHtml: string
 *  - onRestore: (html: string) => void
 *  - onClose: () => void
 */
export default function VersionHistoryModal({ open, landingId, currentHtml, onRestore, onClose }) {
  const tc = useStableI18n();
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(null); // version id
  const [previewing, setPreviewing] = useState(null); // version id
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadVersions = useCallback(async () => {
    if (!landingId) return;
    setLoading(true);
    try {
      const data = await fetchLandingPageVersions(landingId);
      setVersions(Array.isArray(data) ? data : []);
      } catch (e) {
      toast.error(tc('loadError'));
    } finally {
      setLoading(false);
    }
  }, [landingId]);

  useEffect(() => {
    if (!open) return;
    loadVersions();
  }, [open, loadVersions]);

  const handlePreview = useCallback(
    async (version) => {
      if (previewing === version.id) {
        setPreviewing(null);
        setPreviewHtml('');
        return;
      }
      setPreviewing(version.id);
      setPreviewLoading(true);
      try {
        const data = await previewLandingPageVersion(landingId, version.id);
        const html =
          data?.htmlContent ||
          data?.html ||
          data?.data?.htmlContent ||
          data?.data?.html ||
          '';
        setPreviewHtml(html);
      } catch (e) {
        toast.error(tc('previewLoadError'));
        setPreviewing(null);
      } finally {
        setPreviewLoading(false);
      }
    },
    [landingId]
  );

  const handleRestore = useCallback(
    async (version) => {
      if (!window.confirm(tc('confirmRestore', { ts: formatTs(version.createdAt) }))) return;
      setRestoring(version.id);
      try {
        const data = await restoreLandingPageVersion(landingId, version.id);
        const html =
          data?.htmlContent ||
          data?.data?.htmlContent ||
          data?.html ||
          data?.data?.html ||
          '';
        onRestore?.(html);
        toast.success(tc('restoreSuccess'));
        onClose?.();
      } catch (e) {
        toast.error(e?.response?.data?.message || e?.message || tc('restoreError'));
      } finally {
        setRestoring(null);
      }
    },
    [landingId, onRestore, onClose, tc]
  );

  const handleDelete = useCallback(
    async (version) => {
      if (!window.confirm(tc('confirmDelete'))) return;
      try {
        await deleteLandingPageVersion(landingId, version.id);
        toast.success(tc('deleteSuccess'));
        loadVersions();
      } catch (e) {
        toast.error(tc('deleteError'));
      }
    },
    [landingId, loadVersions]
  );

  const handleRestoreLatest = useCallback(async () => {
    if (!versions.length) return;
    await handleRestore(versions[0]);
  }, [versions, handleRestore]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="relative w-[calc(100vw-48px)] h-[calc(100vh-48px)] max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 shrink-0">
          <HiOutlineClock className="w-6 h-6 text-gray-500" />
          <h2 className="text-[20px] font-semibold text-gray-900">{tc('title')}</h2>
          <div className="flex-1" />
          <button
            type="button"
            onClick={loadVersions}
            disabled={loading}
            className="p-2.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            title={tc('reload')}
          >
            <HiOutlineRefresh className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          >
            <HiOutlineX className="w-6 h-6" />
          </button>
        </div>

        {/* Current version */}
        <div className="px-4 py-3 border-b border-gray-100 bg-orange-50 shrink-0">
          <p className="text-[14px] font-medium text-orange-800 flex items-center gap-2">
            <HiOutlineCheck className="w-5 h-5 text-orange-600" />
            {tc('currentUnsaved')}
          </p>
        </div>

        {/* Version list */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-2 border-gray-300 border-t-orange-500 rounded-full animate-spin" />
            </div>
          ) : versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-[15px]">
              <HiOutlineClock className="w-12 h-12 mb-2" />
              <p>{tc('empty')}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {versions.map((v, idx) => (
                <div key={v.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[15px] font-semibold text-gray-900 truncate">
                          {v.title || tc('defaultTitle', { n: versions.length - idx })}
                        </p>
                        {idx === 0 && (
                          <span className="shrink-0 px-2 py-0.5 rounded text-[12px] font-semibold bg-green-100 text-green-700">
                            {tc('latestBadge')}
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] text-gray-500 mt-1">{formatTs(v.createdAt)}</p>
                      {v.note ? (
                        <p className="text-[14px] text-gray-600 mt-1.5">{v.note}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handlePreview(v)}
                        className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold border transition-colors ${
                          previewing === v.id
                            ? 'border-orange-300 bg-orange-50 text-orange-700'
                            : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {previewing === v.id ? tc('hidePreview') : tc('viewButton')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRestore(v)}
                        disabled={restoring === v.id}
                        className="px-3 py-1.5 rounded-lg text-[13px] font-semibold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-60 transition-colors"
                      >
                        {restoring === v.id ? '…' : tc('restoreButton')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(v)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title={tc('deleteTitle')}
                      >
                        <HiOutlineTrash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Preview panel */}
        {previewing ? (
          <div className="border-t border-gray-200 bg-white shrink-0" style={{ height: 280 }}>
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
              <span className="text-[14px] font-medium text-gray-700">
                {tc('previewTitle')}
              </span>
              <button
                type="button"
                onClick={() => {
                  setPreviewing(null);
                  setPreviewHtml('');
                }}
                className="text-[13px] text-gray-500 hover:text-gray-900"
              >
                {tc('closePreview')}
              </button>
            </div>
            <div className="h-[calc(280px-36px)] bg-gray-50">
              {previewLoading ? (
                <div className="flex items-center justify-center h-full text-gray-400 text-[14px]">
                  <div className="w-8 h-8 border-2 border-gray-300 border-t-orange-500 rounded-full animate-spin mr-2" />
                  {tc('previewLoading')}
                </div>
              ) : (
                <iframe
                  title="version-preview"
                  className="w-full h-full border-0 bg-white"
                  srcDoc={previewHtml}
                  sandbox="allow-scripts"
                />
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

function formatTs(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}
