import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useI18n } from '../../../i18n';
import {
  fetchPublicForm,
  submitPublicForm,
  fetchPublicSlots,
} from '../services/formPublicApi.service';
import FormRenderer from '../components/FormRenderer';
import { useFormEmbedResize } from '../hooks/useFormEmbedResize';

export default function PublicFormPage() {
  const { t } = useI18n();
  const { publicKey } = useParams();
  const [searchParams] = useSearchParams();
  const embedMode = searchParams.get('embed') === '1';

  const [form, setForm] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusCode, setStatusCode] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // PR-5 — trạng thái hiển thị hiện tại làm depsKey: đổi trạng thái (loading/404/503/error/form)
  // luôn mount LẠI wrapper div ngoài cùng (5 nhánh JSX khác nhau bên dưới) nên effect đo chiều
  // cao trong hook phải chạy lại để bắt root node MỚI. Chuyển form -> thành công hay chọn
  // tuần/khung giờ đặt lịch (bên trong FormRenderer) KHÔNG unmount wrapper 'form' — ResizeObserver
  // đang gắn sẵn tự bắt được những thay đổi layout đó, không cần đổi depsKey.
  const renderState = isLoading
    ? 'loading'
    : statusCode === 404
    ? 'not-found'
    : statusCode === 503
    ? 'plan-expired'
    : statusCode || !form
    ? 'error'
    : 'form';
  const embedRootRef = useFormEmbedResize({ enabled: embedMode, formKey: publicKey, depsKey: renderState });

  // Nhúng: bỏ min-h-screen/nền xám, thu gọn margin — trang chỉ hiển thị trong 1 khối iframe
  // trên landing, không cần chiếm cả viewport như khi mở trực tiếp /f/:publicKey.
  const stateWrapperClass = embedMode
    ? 'flex items-center justify-center p-3'
    : 'min-h-screen bg-gray-50 flex items-center justify-center p-4';
  const formWrapperClass = embedMode
    ? 'py-3 px-2 flex flex-col justify-center items-center overflow-x-hidden box-border'
    : 'min-h-screen bg-gray-50/60 py-6 sm:py-12 px-3 sm:px-6 flex flex-col justify-center items-center overflow-x-hidden box-border';

  const loadForm = useCallback(async () => {
    setIsLoading(true);
    setStatusCode(null);
    setSubmitError('');
    try {
      const data = await fetchPublicForm(publicKey);
      setForm(data);
    } catch (err) {
      const status = err.response?.status || 500;
      setStatusCode(status);
    } finally {
      setIsLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    loadForm();
  }, [loadForm]);

  const loadSlots = useCallback(
    (from, days) => fetchPublicSlots(publicKey, { from, days }),
    [publicKey]
  );

  const handleSubmit = async (payload) => {
    setSubmitError('');
    setIsSubmitting(true);
    try {
      await submitPublicForm(publicKey, payload);
    } catch (err) {
      setIsSubmitting(false);
      const status = err.response?.status;
      if (status === 429) {
        setSubmitError(t('publicForm.rateLimitError'));
      } else {
        const msg = err.response?.data?.message || t('publicForm.submitError');
        setSubmitError(msg);
      }
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  // 1. Trạng thái Đang tải
  if (isLoading) {
    return (
      <div ref={embedRootRef} className={stateWrapperClass}>
        <div className="text-center text-gray-500">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-primary-600 mb-3" />
          <p className="text-sm">{t('publicForm.loading')}</p>
        </div>
      </div>
    );
  }

  // 2. Trạng thái 404 Không tìm thấy biểu mẫu
  if (statusCode === 404) {
    return (
      <div ref={embedRootRef} className={stateWrapperClass}>
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center text-2xl font-bold">
            ?
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {t('publicForm.notFoundTitle')}
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            {t('publicForm.notFoundDesc')}
          </p>
        </div>
      </div>
    );
  }

  // 3. Trạng thái 503 Biểu mẫu tạm ngừng (chủ hết hạn gói)
  if (statusCode === 503) {
    return (
      <div ref={embedRootRef} className={stateWrapperClass}>
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center text-2xl font-bold">
            !
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {t('publicForm.planExpiredTitle')}
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            {t('publicForm.planExpiredDesc')}
          </p>
        </div>
      </div>
    );
  }

  // 4. Trạng thái Lỗi mạng / Khác
  if (statusCode || !form) {
    return (
      <div ref={embedRootRef} className={stateWrapperClass}>
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 text-red-600 flex items-center justify-center text-2xl font-bold">
            ✕
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {t('publicForm.loadErrorTitle')}
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed mb-6">
            {t('publicForm.loadErrorDesc')}
          </p>
          <button
            onClick={loadForm}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
          >
            {t('publicForm.retry')}
          </button>
        </div>
      </div>
    );
  }

  // 5. Render biểu mẫu
  return (
    <div ref={embedRootRef} className={formWrapperClass}>
      <FormRenderer
        form={form}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        externalError={submitError}
        loadSlots={form?.booking?.enabled ? loadSlots : undefined}
        embedMode={embedMode}
      />
    </div>
  );
}
