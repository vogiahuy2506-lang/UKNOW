import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineRefresh, HiOutlineTrash, HiOutlinePencil } from 'react-icons/hi';
import {
  createLandingFeaturedCourse,
  deleteLandingFeaturedCourse,
  fetchAdminLandingFeaturedCourses,
  updateLandingFeaturedCourse,
} from '../../features/landing/services/landingFeaturedCoursesApi.service.js';
import emailTemplateUploadApiService from '../../features/templates/services/emailTemplateUploadApi.service.js';
import { normalizePublicFileUrlForEmbed } from '../../features/landing/utils/publicFileUrl.js';

const emptyForm = () => ({
  titleVi: '',
  titleEn: '',
  tagVi: '',
  tagEn: '',
  imageUrl: '',
  linkUrl: '',
  isActive: true,
});

/**
 * Trang admin — chỉnh khóa học nổi bật trên landing `/l` (lưu DB, hiển thị công khai).
 *
 * Luồng hoạt động:
 * 1. Tải danh sách từ GET `/api/admin/landing-featured-courses`.
 * 2. Thêm / sửa / xóa qua API; ảnh upload tạm `/api/uploads/temp` rồi lưu như testimonials; xóa bản ghi xóa file uploads.
 */
const LandingFeaturedCoursesPage = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  /** Giữ `sort_order` khi sửa (API vẫn cần); không hiển thị ô nhập — tạo mới luôn 0. */
  const [editingSortOrder, setEditingSortOrder] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  /** File ảnh vừa upload tạm — bấm Lưu mới chuyển vào uploads. */
  const [pendingImage, setPendingImage] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  /** Sao lưu URL ảnh trước khi chọn upload để khôi phục khi bấm bỏ chọn ảnh. */
  const imageUrlBackupRef = useRef(null);

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const list = await fetchAdminLandingFeaturedCourses();
      setRows(list);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Không thể tải danh sách');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setEditingSortOrder(null);
    setForm(emptyForm());
    setPendingImage(null);
    imageUrlBackupRef.current = null;
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setEditingSortOrder(row.sortOrder ?? 0);
    setForm({
      titleVi: row.titleVi || '',
      titleEn: row.titleEn || '',
      tagVi: row.tagVi || '',
      tagEn: row.tagEn || '',
      imageUrl: row.imageUrl || '',
      linkUrl: row.linkUrl || '',
      isActive: row.isActive !== false,
    });
    setPendingImage(null);
    imageUrlBackupRef.current = null;
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setEditingSortOrder(null);
    setPendingImage(null);
    imageUrlBackupRef.current = null;
  };

  const setField = (key, value) => {
    if (key === 'imageUrl') {
      setPendingImage(null);
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onPickImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || uploadingFile) return;
    setUploadingFile(true);
    try {
      const payload = new FormData();
      payload.append('file', file);
      const response = await emailTemplateUploadApiService.uploadTempFile(payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const tempData = response.data?.data;
      if (!tempData?.tempId) {
        throw new Error('missing-temp');
      }
      setForm((prev) => {
        // Chỉ sao lưu URL lần đầu có upload tạm; đổi sang file khác vẫn giữ bản sao để «Bỏ chọn» khôi phục đúng
        if (imageUrlBackupRef.current === null) {
          imageUrlBackupRef.current = prev.imageUrl || '';
        }
        return { ...prev, imageUrl: '' };
      });
      setPendingImage({ tempId: tempData.tempId, originalName: tempData.originalName || file.name });
      toast.success('Đã tải ảnh lên — bấm Lưu để áp dụng');
    } catch {
      toast.error('Upload ảnh thất bại');
    } finally {
      setUploadingFile(false);
    }
  };

  /**
   * Bỏ ảnh upload tạm, mở lại ô URL và khôi phục URL đã gõ trước khi upload (nếu có).
   */
  const clearPendingImage = () => {
    setPendingImage(null);
    setForm((prev) => ({ ...prev, imageUrl: imageUrlBackupRef.current ?? '' }));
    imageUrlBackupRef.current = null;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      titleVi: String(form.titleVi).trim(),
      titleEn: String(form.titleEn).trim(),
      tagVi: String(form.tagVi).trim(),
      tagEn: String(form.tagEn).trim(),
      linkUrl: String(form.linkUrl).trim(),
      sortOrder: editingId ? Number(editingSortOrder) || 0 : 0,
      isActive: Boolean(form.isActive),
    };
    if (pendingImage?.tempId && pendingImage?.originalName) {
      payload.imageTempId = pendingImage.tempId;
      payload.imageOriginalName = pendingImage.originalName;
    } else {
      payload.imageUrl = String(form.imageUrl).trim() || null;
    }
    if (!payload.titleVi || !payload.titleEn) {
      toast.error('Tiêu đề (VI) và (EN) là bắt buộc');
      return;
    }
    if (!payload.linkUrl) {
      toast.error('Link khóa học là bắt buộc (http/https)');
      return;
    }
    try {
      setSaving(true);
      if (editingId) {
        await updateLandingFeaturedCourse(editingId, payload);
        toast.success('Đã cập nhật');
      } else {
        await createLandingFeaturedCourse(payload);
        toast.success('Đã thêm khóa học');
      }
      closeModal();
      await load(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể lưu');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (row) => {
    if (!window.confirm(`Xóa khóa học: "${row.titleVi}"?`)) return;
    try {
      await deleteLandingFeaturedCourse(row.id);
      toast.success('Đã xóa');
      await load(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể xóa');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Landing — khóa học nổi bật</h1>
          <p className="text-sm text-gray-500 mt-1">
            Quản lý thẻ khóa học trên trang <code className="text-xs bg-gray-100 px-1 rounded">/l</code> — ảnh bấm mở link.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            <HiOutlineRefresh className={refreshing ? 'animate-spin' : ''} />
            Làm mới
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
          >
            <HiOutlinePlus />
            Thêm khóa học
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Đang tải...</p>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-700">Tiêu đề (VI)</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-700">Link</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-700 w-[88px]">Ảnh</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-700">Hiển thị</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-700">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                    Chưa có bản ghi — trang landing dùng nội dung mặc định trong code.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-gray-900 max-w-xs truncate">{r.titleVi}</td>
                    <td className="px-3 py-2 max-w-xs truncate">
                      <a href={r.linkUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                        {r.linkUrl}
                      </a>
                    </td>
                    <td className="px-3 py-2 text-center align-middle">
                      {r.imageUrl ? (
                        <a
                          href={normalizePublicFileUrlForEmbed(r.imageUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block"
                          title="Xem ảnh"
                        >
                          <img
                            src={normalizePublicFileUrlForEmbed(r.imageUrl)}
                            alt=""
                            className="h-10 w-10 rounded-md border border-gray-200 object-cover bg-gray-50"
                          />
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">{r.isActive ? 'Có' : 'Không'}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-primary-600 hover:bg-primary-50 rounded"
                      >
                        <HiOutlinePencil /> Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(r)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-red-600 hover:bg-red-50 rounded ml-2"
                      >
                        <HiOutlineTrash /> Xóa
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">{editingId ? 'Sửa khóa học' : 'Thêm khóa học'}</h2>
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Tiêu đề (VI) *</span>
                  <input
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={form.titleVi}
                    onChange={(e) => setField('titleVi', e.target.value)}
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Tiêu đề (EN) *</span>
                  <input
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={form.titleEn}
                    onChange={(e) => setField('titleEn', e.target.value)}
                    required
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Nhãn (VI)</span>
                  <input
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={form.tagVi}
                    onChange={(e) => setField('tagVi', e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Nhãn (EN)</span>
                  <input
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={form.tagEn}
                    onChange={(e) => setField('tagEn', e.target.value)}
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">
                  URL ảnh (http/https, tùy chọn — hoặc upload bên dưới; để trống = không ảnh)
                </span>
                <p className="text-xs text-amber-900/90 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2 mt-1.5 space-y-1">
                  <span className="block">
                    Ưu tiên khi lưu: nếu vừa có URL vừa chọn file upload, hệ thống dùng ảnh từ upload (đường dẫn do
                    server tạo).
                  </span>
                  <span className="block">
                    Khi đã chọn file upload tạm, ô URL ảnh bị khóa — bấm «Bỏ chọn ảnh upload» bên dưới để nhập lại
                    URL.
                  </span>
                </p>
                <input
                  className={`mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm ${
                    pendingImage ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''
                  }`}
                  value={form.imageUrl}
                  onChange={(e) => setField('imageUrl', e.target.value)}
                  placeholder="https://..."
                  disabled={Boolean(pendingImage)}
                  title={pendingImage ? 'Đang có ảnh upload tạm — bỏ chọn ảnh để nhập URL' : ''}
                />
              </label>
              <div className="rounded-lg border border-dashed border-gray-300 p-3">
                <p className="text-xs text-gray-600 mb-2">
                  Upload ảnh (lưu vào thư mục uploads khi bấm Lưu; xóa bản ghi sẽ xóa file nếu là ảnh upload hệ thống)
                </p>
                <input type="file" accept="image/*" onChange={onPickImage} disabled={uploadingFile} className="text-sm" />
                {pendingImage && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p className="text-xs text-primary-600">Chờ lưu: {pendingImage.originalName}</p>
                    <button
                      type="button"
                      onClick={clearPendingImage}
                      className="text-xs font-medium text-gray-700 underline hover:text-primary-600"
                    >
                      Bỏ chọn ảnh upload
                    </button>
                  </div>
                )}
              </div>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Link khóa học * (http/https)</span>
                <input
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={form.linkUrl}
                  onChange={(e) => setField('linkUrl', e.target.value)}
                  placeholder="https://founderai.biz/..."
                  required
                />
              </label>
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setField('isActive', e.target.checked)}
                />
                <span className="text-gray-700">Đang hiển thị trên landing</span>
              </label>
              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {saving ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandingFeaturedCoursesPage;
