import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useI18n } from '../../../i18n';
import {
  fetchPublicForm,
  submitPublicForm,
} from '../services/formPublicApi.service';
import FormRenderer from '../components/FormRenderer';

export default function PublicFormPage() {
  const { t } = useI18n();
  const { publicKey } = useParams();

  const [form, setForm] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusCode, setStatusCode] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
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
    <div className="min-h-screen bg-gray-50/60 py-6 sm:py-12 px-3 sm:px-6 flex flex-col justify-center items-center overflow-x-hidden box-border">
      <FormRenderer
        form={form}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        externalError={submitError}
      />
    </div>
  );
}
