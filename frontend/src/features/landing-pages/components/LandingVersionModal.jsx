import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineClock,
  HiOutlineX,
  HiOutlineTrash,
  HiOutlineRefresh,
  HiOutlineEye,
  HiOutlineArrowNarrowLeft,
  HiOutlineCheckCircle,
  HiOutlineDatabase,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import {
  fetchLandingPageVersions,
  previewLandingPageVersion,
  deleteLandingPageVersion,
} from '../services/landingPagesAdminApi.service.js';

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getSourceBadge(source) {
  switch (source) {
    case 'ai_edit':
      return { label: 'Sửa với AI', className: 'bg-purple-100 text-purple-800 border-purple-200' };
    case 'ai_generate':
      return { label: 'Tạo với AI', className: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
    case 'template':
      return { label: 'Template', className: 'bg-blue-100 text-blue-800 border-blue-200' };
    case 'rollback':
      return { label: 'Khôi phục', className: 'bg-amber-100 text-amber-800 border-amber-200' };
    default:
      return { label: 'Lưu thủ công', className: 'bg-gray-100 text-gray-700 border-gray-200' };
  }
}

export default function LandingVersionModal({
  open,
  onClose,
  landingPageId,
  onRestoreVersion,
}) {
  const [versions, setVersions] = useState([]);
  const [totalSizeBytes, setTotalSizeBytes] = useState(0);
  const [maxVersions, setMaxVersions] = useState(5);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null); // { version, htmlContent }
  const [loadingPreviewId, setLoadingPreviewId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const loadVersions = useCallback(async () => {
    if (!landingPageId) return;
    setLoading(true);
    try {
      const data = await fetchLandingPageVersions(landingPageId);
      setVersions(data?.versions || []);
      setTotalSizeBytes(data?.totalSizeBytes || 0);
      if (data?.maxVersions) setMaxVersions(data.maxVersions);
    } catch (err) {
      console.error('Failed to load landing versions:', err);
      toast.error(err.message || 'Không tải được danh sách phiên bản');
    } finally {
      setLoading(false);
    }
  }, [landingPageId]);

  useEffect(() => {
    if (open && landingPageId) {
      setPreviewData(null);
      loadVersions();
    }
  }, [open, landingPageId, loadVersions]);

  const handlePreview = async (version) => {
    setLoadingPreviewId(version.id);
    try {
      const data = await previewLandingPageVersion(landingPageId, version.id);
      setPreviewData(data);
    } catch (err) {
      toast.error(err.message || 'Không thể tải nội dung phiên bản để xem trước');
    } finally {
      setLoadingPreviewId(null);
    }
  };

  const handleDelete = async (versionId) => {
    if (!window.confirm('Bạn có chắc muốn xóa phiên bản này khỏi kho lưu trữ để giải phóng dung lượng?')) {
      return;
    }
    setDeletingId(versionId);
    try {
      await deleteLandingPageVersion(landingPageId, versionId);
      toast.success('Đã xóa phiên bản thành công');
      if (previewData?.version?.id === versionId) {
        setPreviewData(null);
      }
      loadVersions();
    } catch (err) {
      toast.error(err.message || 'Không thể xóa phiên bản');
    } finally {
      setDeletingId(null);
    }
  };

  const handleApplyRestore = (version, htmlContent) => {
    if (!htmlContent) {
      toast.error('Không có nội dung HTML để khôi phục');
      return;
    }
    if (!window.confirm(`Khôi phục về phiên bản "${formatDate(version.created_at)}"? Giao diện hiện tại trong editor sẽ được thay thế.`)) {
      return;
    }
    onRestoreVersion?.(htmlContent, version);
    onClose?.();
    toast.success('Đã nạp lại phiên bản vào trình soạn thảo!');
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <HiOutlineClock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {previewData ? 'Xem trước phiên bản' : 'Lịch sử phiên bản'}
              </h2>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <HiOutlineDatabase className="w-3.5 h-3.5 text-gray-400" />
                  Đang dùng: <strong>{formatBytes(totalSizeBytes)}</strong>
                </span>
                <span>•</span>
                <span>Lưu tối đa {maxVersions} bản gần nhất trên Cloud Storage</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!previewData && (
              <button
                type="button"
                onClick={loadVersions}
                disabled={loading}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200/60 rounded-lg transition-colors"
                title="Làm mới"
              >
                <HiOutlineRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          {previewData ? (
            /* PREVIEW VIEW */
            <div className="h-full flex flex-col space-y-4">
              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-200 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewData(null)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-gray-300 font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    <HiOutlineArrowNarrowLeft className="w-4 h-4" />
                    <span>Quay lại danh sách</span>
                  </button>
                  <span className="text-gray-500">
                    Bản chụp lúc <strong>{formatDate(previewData.version?.created_at)}</strong> ({formatBytes(previewData.version?.sizeBytes)})
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleApplyRestore(previewData.version, previewData.htmlContent)}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-sm transition-all text-xs"
                >
                  <HiOutlineCheckCircle className="w-4 h-4" />
                  <span>Khôi phục bản này</span>
                </button>
              </div>

              <div className="flex-1 min-h-[450px] border border-gray-200 rounded-xl overflow-hidden shadow-inner bg-white">
                <iframe
                  title="Landing Version Preview"
                  srcDoc={previewData.htmlContent}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            </div>
          ) : loading ? (
            /* LOADING VIEW */
            <div className="h-64 flex flex-col items-center justify-center text-gray-400 gap-2">
              <HiOutlineRefresh className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="text-xs">Đang tải lịch sử phiên bản từ Cloud Storage...</p>
            </div>
          ) : versions.length === 0 ? (
            /* EMPTY VIEW */
            <div className="h-64 flex flex-col items-center justify-center text-center p-6">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 mb-3">
                <HiOutlineClock className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-gray-800">Chưa có phiên bản lịch sử nào</h3>
              <p className="text-xs text-gray-500 max-w-sm mt-1">
                Khi bạn chỉnh sửa mã nguồn HTML và bấm <strong>Lưu</strong> hoặc <strong>Sửa với AI</strong>, hệ thống sẽ tự động lưu lại bản cũ lên Cloud Storage để bạn có thể xem lại hoặc khôi phục bất cứ lúc nào.
              </p>
            </div>
          ) : (
            /* LIST VIEW */
            <div className="space-y-3">
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                {versions.map((ver, idx) => {
                  const badge = getSourceBadge(ver.source);
                  const isPreviewing = loadingPreviewId === ver.id;
                  const isDeleting = deletingId === ver.id;

                  return (
                    <div
                      key={ver.id}
                      className="p-4 hover:bg-gray-50/80 transition-colors flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                          #{versions.length - idx}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-gray-900">
                              {formatDate(ver.createdAt)}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badge.className}`}>
                              {badge.label}
                            </span>
                            {idx === 0 && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Bản gần nhất
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Dung lượng: <strong className="text-gray-700">{formatBytes(ver.sizeBytes)}</strong>
                          </p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handlePreview(ver)}
                          disabled={isPreviewing || isDeleting}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 shadow-sm transition-all disabled:opacity-50"
                        >
                          <HiOutlineEye className={`w-3.5 h-3.5 ${isPreviewing ? 'animate-spin' : ''}`} />
                          <span>{isPreviewing ? 'Đang tải...' : 'Xem trước'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(ver.id)}
                          disabled={isPreviewing || isDeleting}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Xóa phiên bản này"
                        >
                          <HiOutlineTrash className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
          <span>Dung lượng lịch sử được tính vào gói lưu trữ Cloud Storage của bạn.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold transition-all"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
