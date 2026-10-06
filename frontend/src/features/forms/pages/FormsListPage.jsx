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
  HiOutlineClipboardList,
} from 'react-icons/hi';
import PageHeader from '../../../components/common/PageHeader';
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
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        icon={HiOutlineClipboardList}
        title={t('forms.title')}
        subtitle={t('forms.subtitle')}
        actions={
          <button
            onClick={() => navigate('/app/forms/new')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-sm font-bold shadow-sm hover:shadow transition-all duration-150 shrink-0"
          >
            <HiOutlinePlus className="w-4 h-4" />
            <span>{t('forms.createNew')}</span>
          </button>
        }
      />

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
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs p-16 flex flex-col items-center justify-center gap-3">
          <div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500 font-medium">{t('forms.listPage.loading')}</p>
        </div>
      ) : forms.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs py-16 text-center px-4">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-orange-50 border border-orange-200/60 text-orange-400 flex items-center justify-center shadow-xs">
            <HiOutlinePlus className="w-7 h-7" />
          </div>
          <h3 className="text-sm font-semibold text-slate-700 mb-1">{t('forms.listPage.empty')}</h3>
          <p className="text-xs text-slate-400 mb-4 max-w-md mx-auto leading-relaxed">
            {t('forms.listPage.emptyDescription')}
          </p>
          <button
            onClick={() => navigate('/app/forms/new')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-bold shadow-xs hover:shadow transition-all"
          >
            <HiOutlinePlus className="w-4 h-4" />
            <span>{t('forms.createNew')}</span>
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('forms.listPage.colForm')}</th>
                  <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('forms.listPage.colStatus')}</th>
                  <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('forms.listPage.colSubmissions')}</th>
                  <th className="px-6 py-3.5 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('forms.listPage.colActions')}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {forms.map((form) => {
                  const submissionCount = Number(form.submissionCount) || 0;
                  return (
                    <tr key={form.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-sm text-slate-900 break-words line-clamp-1">
                          {form.title}
                        </div>
                        {form.description && (
                          <div className="text-xs text-slate-400 mt-0.5 line-clamp-1 break-words">
                            {form.description}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {/* Admin tắt biểu mẫu (admin_disabled_at) thì khách KHÔNG nộp được dù is_published=true —
                            chủ phải thấy "Đã bị tắt" chứ không phải "Đã xuất bản" (giống trang admin). */}
                        {form.adminDisabledAt ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/80 shadow-2xs"
                            title={t('forms.listPage.statusAdminDisabledHint')}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                            {t('forms.listPage.statusAdminDisabled')}
                          </span>
                        ) : form.isPublished ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            {t('forms.isPublished')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 shadow-2xs">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                            {t('forms.isDraft')}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => navigate(`/app/forms/${form.id}/submissions`)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700 hover:underline"
                        >
                          <HiOutlineInbox className="w-4 h-4 text-slate-400" />
                          <span>{t('forms.listPage.submissionCount', { count: submissionCount })}</span>
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <div className="inline-flex items-center gap-1 justify-end">
                          {/* Toggle xuất bản / ẩn */}
                          <button
                            onClick={() => handleTogglePublish(form)}
                            title={form.isPublished ? t('forms.unpublish') : t('forms.publish')}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
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
                            className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                          >
                            <HiOutlineShare className="w-4 h-4" />
                          </button>

                          {/* Sửa form */}
                          <button
                            onClick={() => navigate(`/app/forms/${form.id}/edit`)}
                            title={t('forms.editForm')}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                          >
                            <HiOutlinePencil className="w-4 h-4" />
                          </button>

                          {/* Xoá form */}
                          <button
                            onClick={() => setDeleteTarget(form)}
                            title={t('forms.delete')}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
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
