import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlinePlus,
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineShare,
  HiOutlineInbox,
  HiOutlineEye,
  HiOutlineEyeOff,
  HiOutlineExclamationCircle,
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import {
  fetchForms,
  deleteForm,
  publishForm,
} from '../services/formAdminApi.service';
import ShareModal from '../components/ShareModal';

export default function FormsListPage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const [forms, setForms] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal chia sẻ & QR
  const [shareForm, setShareForm] = useState(null);

  // Modal xác nhận xoá kèm số bài nộp
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadForms = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await fetchForms();
      setForms(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.message || t('forms.listPage.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadForms();
  }, [loadForms]);

  const handleTogglePublish = async (form) => {
    try {
      const updated = await publishForm(form.id, !form.isPublished);
      setForms((prev) =>
        prev.map((f) => (f.id === form.id ? { ...f, isPublished: updated.isPublished } : f))
      );
      toast.success(t('forms.publishSuccess'));
    } catch (err) {
      toast.error(err.response?.data?.message || t('forms.listPage.togglePublishError'));
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteForm(deleteTarget.id);
      setForms((prev) => prev.filter((f) => f.id !== deleteTarget.id));
      toast.success(t('forms.deleteSuccess'));
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err.response?.data?.message || t('forms.listPage.deleteError'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('forms.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('forms.subtitle')}</p>
        </div>
        <button
          onClick={() => navigate('/app/forms/new')}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl shadow-sm transition-all active:scale-[0.99]"
        >
          <HiOutlinePlus className="w-5 h-5" />
          {t('forms.createNew')}
        </button>
      </div>

      {/* Lỗi tải */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={loadForms}
            className="font-medium underline hover:text-red-800"
          >
            {t('forms.listPage.retry')}
          </button>
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center text-gray-500">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-primary-600 mb-3" />
          <p className="text-sm">{t('forms.listPage.loading')}</p>
        </div>
      ) : forms.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center">
            <HiOutlinePlus className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">{t('forms.listPage.empty')}</h3>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            {t('forms.listPage.emptyDescription')}
          </p>
          <button
            onClick={() => navigate('/app/forms/new')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl shadow-sm transition-colors"
          >
            <HiOutlinePlus className="w-5 h-5" />
            {t('forms.createNew')}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-700">
              <thead className="bg-gray-50/75 border-b border-gray-100 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6">{t('forms.listPage.colForm')}</th>
                  <th className="py-3.5 px-4 sm:px-6">{t('forms.listPage.colStatus')}</th>
                  <th className="py-3.5 px-4 sm:px-6">{t('forms.listPage.colSubmissions')}</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">{t('forms.listPage.colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {forms.map((form) => {
                  const submissionCount = Number(form.submissionCount) || 0;
                  return (
                    <tr key={form.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-4 px-4 sm:px-6">
                        <div className="font-medium text-gray-900 break-words line-clamp-1">
                          {form.title}
                        </div>
                        {form.description && (
                          <div className="text-xs text-gray-500 mt-0.5 line-clamp-1 break-words">
                            {form.description}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4 sm:px-6">
                        {form.isPublished ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                            {t('forms.isPublished')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                            {t('forms.isDraft')}
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 sm:px-6">
                        <button
                          onClick={() => navigate(`/app/forms/${form.id}/submissions`)}
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
                        >
                          <HiOutlineInbox className="w-4 h-4" />
                          <span>{t('forms.listPage.submissionCount', { count: submissionCount })}</span>
                        </button>
                      </td>
                      <td className="py-4 px-4 sm:px-6 text-right">
                        <div className="inline-flex items-center gap-1 justify-end">
                          {/* Toggle xuất bản / ẩn */}
                          <button
                            onClick={() => handleTogglePublish(form)}
                            title={form.isPublished ? t('forms.unpublish') : t('forms.publish')}
                            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            {form.isPublished ? (
                              <HiOutlineEyeOff className="w-4 h-4" />
                            ) : (
                              <HiOutlineEye className="w-4 h-4" />
                            )}
                          </button>

                          {/* Nút chia sẻ & QR */}
                          <button
                            onClick={() => setShareForm(form)}
                            title={t('forms.share')}
                            className="p-2 rounded-lg text-gray-500 hover:text-primary-600 hover:bg-gray-100 transition-colors"
                          >
                            <HiOutlineShare className="w-4 h-4" />
                          </button>

                          {/* Sửa form */}
                          <button
                            onClick={() => navigate(`/app/forms/${form.id}/edit`)}
                            title={t('forms.editForm')}
                            className="p-2 rounded-lg text-gray-500 hover:text-primary-600 hover:bg-gray-100 transition-colors"
                          >
                            <HiOutlinePencil className="w-4 h-4" />
                          </button>

                          {/* Xoá form */}
                          <button
                            onClick={() => setDeleteTarget(form)}
                            title={t('forms.delete')}
                            className="p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <HiOutlineTrash className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {shareForm && (
        <ShareModal
          form={shareForm}
          isOpen={Boolean(shareForm)}
          onClose={() => setShareForm(null)}
        />
      )}

      {/* Modal xác nhận xoá kèm số bài nộp */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-4">
              <HiOutlineExclamationCircle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {t('forms.deleteConfirmTitle')}
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-6">
              {t('forms.listPage.deleteConfirmMessage', {
                title: deleteTarget.title,
                count: deleteTarget.submissionCount || 0,
              })}
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                {t('forms.listPage.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50"
              >
                {isDeleting ? t('forms.listPage.deleting') : t('forms.listPage.confirmDelete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
