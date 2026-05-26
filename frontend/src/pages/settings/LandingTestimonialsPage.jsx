import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineRefresh, HiOutlineTrash, HiOutlinePencil } from 'react-icons/hi';
import {
  createLandingTestimonial,
  deleteLandingTestimonial,
  fetchAdminLandingTestimonials,
  updateLandingTestimonial,
} from '../../features/landing/services/landingTestimonialsApi.service.js';
import emailTemplateUploadApiService from '../../features/templates/services/emailTemplateUploadApi.service.js';
import { normalizePublicFileUrlForEmbed } from '../../features/landing/utils/publicFileUrl.js';
import { useI18n } from '../../i18n';

const emptyForm = () => ({
  quoteVi: '',
  quoteEn: '',
  starRating: 5,
  nameVi: '',
  nameEn: '',
  roleVi: '',
  roleEn: '',
  locationVi: '',
  locationEn: '',
  imageUrl: '',
  isActive: true,
});

/**
 * Trang admin — chỉnh đánh giá (testimonials) trên landing `/l` (lưu DB, ảnh qua upload hoặc URL).
 *
 * Luồng hoạt động:
 * 1. Tải danh sách từ GET `/api/admin/landing-testimonials`.
 * 2. Thêm / sửa / xóa; upload ảnh tạm qua POST `/api/uploads/temp`, lưu bản ghi kèm `imageTempId` + `imageOriginalName`.
 */
const LandingTestimonialsPage = () => {
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingSortOrder, setEditingSortOrder] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  /** File vừa upload tạm (chưa ghi DB) — khi lưu sẽ chuyển vào thư mục uploads. */
  const [pendingImage, setPendingImage] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  /** Sao lưu URL ảnh trước khi chọn upload để khôi phục khi bấm bỏ chọn ảnh. */
  const imageUrlBackupRef = useRef(null);

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const list = await fetchAdminLandingTestimonials();
      setRows(list);
    } catch (e) {
      toast.error(e?.response?.data?.message || t('landingTestimonials.loadFailed'));
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
      quoteVi: row.quoteVi || '',
      quoteEn: row.quoteEn || '',
      starRating: Number(row.starRating) || 5,
      nameVi: row.nameVi || '',
      nameEn: row.nameEn || '',
      roleVi: row.roleVi || '',
      roleEn: row.roleEn || '',
      locationVi: row.locationVi || '',
      locationEn: row.locationEn || '',
      imageUrl: row.imageUrl || '',
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

  /**
   * Chọn file ảnh → upload tạm; URL cuối được backend tạo khi lưu bản ghi.
   */
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
      toast.success(t('landingTestimonials.imageUploaded'));
    } catch {
      toast.error(t('landingTestimonials.uploadFailed'));
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
      quoteVi: String(form.quoteVi).trim(),
      quoteEn: String(form.quoteEn).trim(),
      starRating: Number(form.starRating) || 5,
      nameVi: String(form.nameVi).trim(),
      nameEn: String(form.nameEn).trim(),
      roleVi: String(form.roleVi).trim(),
      roleEn: String(form.roleEn).trim(),
      locationVi: String(form.locationVi).trim(),
      locationEn: String(form.locationEn).trim(),
      sortOrder: editingId ? Number(editingSortOrder) || 0 : 0,
      isActive: Boolean(form.isActive),
    };
    if (!payload.quoteVi || !payload.quoteEn) {
      toast.error(t('landingTestimonials.contentViRequired'));
      return;
    }
    if (!payload.nameVi || !payload.nameEn) {
      toast.error(t('landingTestimonials.nameViRequired'));
      return;
    }
    if (pendingImage?.tempId && pendingImage?.originalName) {
      payload.imageTempId = pendingImage.tempId;
      payload.imageOriginalName = pendingImage.originalName;
    } else {
      payload.imageUrl = String(form.imageUrl).trim() || null;
    }
    try {
      setSaving(true);
      if (editingId) {
        await updateLandingTestimonial(editingId, payload);
        toast.success(t('landingTestimonials.updated'));
      } else {
        await createLandingTestimonial(payload);
        toast.success(t('landingTestimonials.created'));
      }
      closeModal();
      await load(true);
    } catch {
      toast.error(t('landingTestimonials.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (row) => {
    if (!window.confirm(t('landingTestimonials.deleteConfirm', { name: row.nameVi }))) return;
    try {
      await deleteLandingTestimonial(row.id);
      toast.success(t('landingTestimonials.deleted'));
      await load(true);
    } catch {
      toast.error(t('landingTestimonials.deleteFailed'));
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('landingTestimonials.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('landingTestimonials.description')}
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
            {t('landingTestimonials.refresh')}
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
          >
            <HiOutlinePlus />
            {t('landingTestimonials.addTestimonial')}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">{t('landingTestimonials.loading')}</p>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-700">{t('landingTestimonials.nameVi')}</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-700">{t('landingTestimonials.stars')}</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-700 max-w-xs">{t('landingTestimonials.content')}</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-700 w-[88px]">{t('landingTestimonials.image')}</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-700">{t('landingTestimonials.visible')}</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-700">{t('landingTestimonials.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                    {t('landingTestimonials.noRecords')}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-gray-900 max-w-[140px] truncate">{r.nameVi}</td>
                    <td className="px-3 py-2 text-center text-amber-600">{r.starRating}★</td>
                    <td className="px-3 py-2 text-gray-600 max-w-md truncate">{r.quoteVi}</td>
                    <td className="px-3 py-2 text-center align-middle">
                      {r.imageUrl ? (
                        <a
                          href={normalizePublicFileUrlForEmbed(r.imageUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block"
                          title={t('landingTestimonials.viewImage')}
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
                    <td className="px-3 py-2 text-center">{r.isActive ? t('landingTestimonials.yes') : t('landingTestimonials.no')}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-primary-600 hover:bg-primary-50 rounded"
                      >
                        <HiOutlinePencil /> {t('landingTestimonials.edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(r)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-red-600 hover:bg-red-50 rounded ml-2"
                      >
                        <HiOutlineTrash /> {t('landingTestimonials.delete')}
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
            <h2 className="text-lg font-bold text-gray-900 mb-4">{editingId ? t('landingTestimonials.editTestimonial') : t('landingTestimonials.createTestimonial')}</h2>
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-gray-600">{t('landingTestimonials.contentVi')}</span>
                  <textarea
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[80px]"
                    value={form.quoteVi}
                    onChange={(e) => setField('quoteVi', e.target.value)}
                    required
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-gray-600">{t('landingTestimonials.contentEn')}</span>
                  <textarea
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[80px]"
                    value={form.quoteEn}
                    onChange={(e) => setField('quoteEn', e.target.value)}
                    required
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">{t('landingTestimonials.starCount')}</span>
                <select
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={form.starRating}
                  onChange={(e) => setField('starRating', Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} {t('landingTestimonials.stars').toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">{t('landingTestimonials.nameVi')}</span>
                  <input
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={form.nameVi}
                    onChange={(e) => setField('nameVi', e.target.value)}
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">{t('landingTestimonials.nameEn')}</span>
                  <input
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={form.nameEn}
                    onChange={(e) => setField('nameEn', e.target.value)}
                    required
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">{t('landingTestimonials.roleVi')}</span>
                  <input
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={form.roleVi}
                    onChange={(e) => setField('roleVi', e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">{t('landingTestimonials.roleEn')}</span>
                  <input
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={form.roleEn}
                    onChange={(e) => setField('roleEn', e.target.value)}
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">{t('landingTestimonials.locationVi')}</span>
                  <input
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={form.locationVi}
                    onChange={(e) => setField('locationVi', e.target.value)}
                    placeholder={t('landingTestimonials.locationPlaceholderVi')}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">{t('landingTestimonials.locationEn')}</span>
                  <input
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={form.locationEn}
                    onChange={(e) => setField('locationEn', e.target.value)}
                    placeholder={t('landingTestimonials.locationPlaceholderEn')}
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">
                  {t('landingTestimonials.imageUrlLabel')}
                </span>
                <p className="text-xs text-amber-900/90 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2 mt-1.5 space-y-1">
                  <span className="block">
                    {t('landingTestimonials.imageUrlNote1')}
                  </span>
                  <span className="block">
                    {t('landingTestimonials.imageUrlNote2')}
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
                  title={pendingImage ? t('landingTestimonials.imageDisabledNote') : ''}
                />
              </label>
              <div className="rounded-lg border border-dashed border-gray-300 p-3">
                <p className="text-xs text-gray-600 mb-2">
                  {t('landingTestimonials.uploadImageLabel')}
                </p>
                <input type="file" accept="image/*" onChange={onPickImage} disabled={uploadingFile} className="text-sm" />
                {pendingImage && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p className="text-xs text-primary-600">{t('landingTestimonials.pendingSave', { name: pendingImage.originalName })}</p>
                    <button
                      type="button"
                      onClick={clearPendingImage}
                      className="text-xs font-medium text-gray-700 underline hover:text-primary-600"
                    >
                      {t('landingTestimonials.cancelUpload')}
                    </button>
                  </div>
                )}
              </div>
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setField('isActive', e.target.checked)}
                />
                <span className="text-gray-700">{t('landingTestimonials.isActiveLabel')}</span>
              </label>
              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  {t('landingTestimonials.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {saving ? t('landingTestimonials.saving') : t('landingTestimonials.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandingTestimonialsPage;
