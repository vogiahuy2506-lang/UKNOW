import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineArrowLeft,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineArrowUp,
  HiOutlineArrowDown,
  HiOutlineCheck,
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import {
  fetchFormById,
  createForm,
  updateForm,
} from '../services/formAdminApi.service';

const FIELD_TYPES = [
  { value: 'short_text', labelKey: 'forms.types.short_text' },
  { value: 'long_text', labelKey: 'forms.types.long_text' },
  { value: 'email', labelKey: 'forms.types.email' },
  { value: 'phone', labelKey: 'forms.types.phone' },
  { value: 'number', labelKey: 'forms.types.number' },
  { value: 'select', labelKey: 'forms.types.select' },
  { value: 'radio', labelKey: 'forms.types.radio' },
  { value: 'checkbox', labelKey: 'forms.types.checkbox' },
  { value: 'date', labelKey: 'forms.types.date' },
];

const DEFAULT_SETTINGS = {
  notifyOwner: true,
  consentEnabled: false,
  sendConfirmation: false,
  submitButtonText: 'Gửi thông tin',
  successMessage: 'Cảm ơn bạn đã gửi thông tin!',
  redirectUrl: '',
};

export default function FormEditorPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = Boolean(id);

  const [isLoading, setIsLoading] = useState(isEditMode);
  const [isSaving, setIsSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [fields, setFields] = useState([]);
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS }));
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!isEditMode) {
      // Form mới mặc định cho sẵn 1 trường Họ tên
      setFields([
        {
          key: '',
          label: 'Họ và tên',
          type: 'short_text',
          required: true,
          role: 'name',
          options: [],
        },
      ]);
      return;
    }

    setIsLoading(true);
    fetchFormById(id)
      .then((data) => {
        if (!data) {
          toast.error('Không tìm thấy biểu mẫu');
          navigate('/app/forms');
          return;
        }
        setTitle(data.title || '');
        setDescription(data.description || '');
        setIsPublished(Boolean(data.isPublished));
        setFields(
          Array.isArray(data.fields)
            ? data.fields.map((f) => ({
                key: f.key || '',
                label: f.label || '',
                type: f.type || 'short_text',
                required: Boolean(f.required),
                role: f.role || '',
                options: Array.isArray(f.options)
                  ? f.options.map((opt) => (typeof opt === 'object' ? opt.label || opt.value : opt))
                  : [],
              }))
            : []
        );
        setSettings({
          notifyOwner: Boolean(data.settings?.notifyOwner ?? DEFAULT_SETTINGS.notifyOwner),
          consentEnabled: Boolean(data.settings?.consentEnabled ?? DEFAULT_SETTINGS.consentEnabled),
          sendConfirmation: Boolean(data.settings?.sendConfirmation ?? DEFAULT_SETTINGS.sendConfirmation),
          submitButtonText: data.settings?.submitButtonText || DEFAULT_SETTINGS.submitButtonText,
          successMessage: data.settings?.successMessage || DEFAULT_SETTINGS.successMessage,
          redirectUrl: data.settings?.redirectUrl || '',
        });
      })
      .catch((err) => {
        toast.error(err.response?.data?.message || 'Lỗi tải dữ liệu biểu mẫu');
        navigate('/app/forms');
      })
      .finally(() => setIsLoading(false));
  }, [id, isEditMode, navigate]);

  // Thêm trường mới
  const handleAddField = () => {
    if (fields.length >= 30) {
      toast.error('Mỗi biểu mẫu tối đa 30 trường thông tin');
      return;
    }
    setFields((prev) => [
      ...prev,
      {
        key: '', // Trường mới key rỗng để server tự sinh
        label: `Trường mới ${prev.length + 1}`,
        type: 'short_text',
        required: false,
        role: '',
        options: [],
      },
    ]);
  };

  // Xoá trường
  const handleRemoveField = (idx) => {
    setFields((prev) => prev.filter((_, i) => i !== idx));
  };

  // Di chuyển thứ tự trường
  const handleMoveField = (idx, direction) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= fields.length) return;
    setFields((prev) => {
      const copy = [...prev];
      const temp = copy[idx];
      copy[idx] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy;
    });
  };

  // Cập nhật thuộc tính trường
  const handleUpdateField = (idx, key, value) => {
    setFields((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [key]: value };

      // Nếu chuyển sang kiểu không có options thì clear options
      if (key === 'type' && !['select', 'radio', 'checkbox'].includes(value)) {
        copy[idx].options = [];
      } else if (key === 'type' && ['select', 'radio', 'checkbox'].includes(value) && copy[idx].options.length === 0) {
        copy[idx].options = ['Lựa chọn 1', 'Lựa chọn 2'];
      }

      // Đổi role: kiểm tra trùng lặp
      if (key === 'role' && value) {
        for (let i = 0; i < copy.length; i++) {
          if (i !== idx && copy[i].role === value) {
            toast.error(`Vai trò "${value}" đã được gán cho trường khác. Đã hủy gán ở trường cũ.`);
            copy[i].role = '';
          }
        }
      }

      return copy;
    });
  };

  // Thao tác với options
  const handleAddOption = (fieldIdx) => {
    setFields((prev) => {
      const copy = [...prev];
      const currentOpts = copy[fieldIdx].options || [];
      if (currentOpts.length >= 50) {
        toast.error('Tối đa 50 lựa chọn');
        return prev;
      }
      copy[fieldIdx] = {
        ...copy[fieldIdx],
        options: [...currentOpts, `Lựa chọn ${currentOpts.length + 1}`],
      };
      return copy;
    });
  };

  const handleUpdateOption = (fieldIdx, optIdx, val) => {
    setFields((prev) => {
      const copy = [...prev];
      const currentOpts = [...(copy[fieldIdx].options || [])];
      currentOpts[optIdx] = val;
      copy[fieldIdx] = { ...copy[fieldIdx], options: currentOpts };
      return copy;
    });
  };

  const handleRemoveOption = (fieldIdx, optIdx) => {
    setFields((prev) => {
      const copy = [...prev];
      const currentOpts = copy[fieldIdx].options.filter((_, i) => i !== optIdx);
      copy[fieldIdx] = { ...copy[fieldIdx], options: currentOpts };
      return copy;
    });
  };

  // Validate form trước khi lưu
  const validateForm = () => {
    const errs = {};

    if (!title.trim()) {
      errs.title = 'Tiêu đề biểu mẫu là bắt buộc';
    } else if (title.trim().length > 200) {
      errs.title = 'Tiêu đề biểu mẫu không được vượt quá 200 ký tự';
    }

    if (description && description.length > 5000) {
      errs.description = 'Mô tả biểu mẫu không được vượt quá 5000 ký tự';
    }

    if (fields.length === 0) {
      errs.fields = 'Biểu mẫu phải có ít nhất 1 trường thông tin';
    }

    // Validate từng trường
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (!f.label || !f.label.trim()) {
        errs[`field_${i}_label`] = 'Tên trường không được để trống';
      } else if (f.label.trim().length > 200) {
        errs[`field_${i}_label`] = 'Tên trường không được vượt quá 200 ký tự';
      }

      if (['select', 'radio', 'checkbox'].includes(f.type)) {
        if (!f.options || f.options.length === 0) {
          errs[`field_${i}_options`] = 'Phải có ít nhất 1 lựa chọn';
        }
      }
    }

    // Validate settings
    if (settings.submitButtonText && settings.submitButtonText.length > 50) {
      errs.submitButtonText = 'Chữ nút gửi không quá 50 ký tự';
    }
    if (settings.successMessage && settings.successMessage.length > 500) {
      errs.successMessage = 'Thông báo thành công không quá 500 ký tự';
    }
    if (settings.redirectUrl && settings.redirectUrl.trim()) {
      const urlStr = settings.redirectUrl.trim();
      if (urlStr.length > 2000) {
        errs.redirectUrl = 'Đường dẫn chuyển hướng không quá 2000 ký tự';
      } else {
        try {
          const parsed = new URL(urlStr);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            errs.redirectUrl = 'Đường dẫn phải bắt đầu bằng http:// hoặc https://';
          }
        } catch {
          errs.redirectUrl = 'Đường dẫn không hợp lệ';
        }
      }
    }

    return errs;
  };

  const handleSave = async () => {
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      const firstError = Object.values(validationErrors)[0];
      toast.error(firstError);
      return;
    }
    setErrors({});
    setIsSaving(true);

    try {
      // Chuẩn bị payload: giữ nguyên key cũ nếu có (bắt buộc theo PR-1b contract)
      const payloadFields = fields.map((f) => {
        const item = {
          label: f.label.trim(),
          type: f.type,
          required: Boolean(f.required),
        };
        // Giữ key cũ nếu có (trường mới key rỗng)
        if (f.key && String(f.key).trim()) {
          item.key = f.key.trim();
        }
        if (f.role) {
          item.role = f.role;
        }
        if (['select', 'radio', 'checkbox'].includes(f.type)) {
          item.options = f.options.map((opt) => String(opt).trim()).filter(Boolean);
        }
        return item;
      });

      // Luôn gửi đủ 6 khoá settings vì PUT ghi đè cả khối
      const payloadSettings = {
        notifyOwner: Boolean(settings.notifyOwner),
        consentEnabled: Boolean(settings.consentEnabled),
        sendConfirmation: Boolean(settings.sendConfirmation),
        submitButtonText: settings.submitButtonText?.trim() || 'Gửi thông tin',
        successMessage: settings.successMessage?.trim() || 'Cảm ơn bạn đã gửi thông tin!',
        redirectUrl: settings.redirectUrl?.trim() || null,
      };

      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        fields: payloadFields,
        settings: payloadSettings,
      };

      if (isEditMode) {
        await updateForm(id, payload);
        toast.success(t('forms.saveSuccess'));
      } else {
        const created = await createForm(payload);
        toast.success(t('forms.saveSuccess'));
        navigate(`/app/forms/${created.id}/edit`, { replace: true });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không thể lưu biểu mẫu');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-gray-500">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-primary-600 mb-3" />
        <p className="text-sm">Đang tải biểu mẫu...</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto overflow-x-hidden box-border">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/app/forms')}
            className="p-2 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title={t('forms.submissionsPage.backToForms')}
          >
            <HiOutlineArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                {isEditMode ? t('forms.editForm') : t('forms.createNew')}
              </h1>
              {isEditMode && (
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    isPublished
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-gray-100 text-gray-600 border border-gray-200'
                  }`}
                >
                  {isPublished ? t('forms.isPublished') : t('forms.isDraft')}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              {isEditMode ? 'Cập nhật cấu hình và trường biểu mẫu' : 'Thiết lập biểu mẫu thu thập dữ liệu'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 active:scale-[0.99] text-white text-sm font-medium rounded-xl shadow-sm transition-all disabled:opacity-50"
          >
            <HiOutlineCheck className="w-5 h-5" />
            {isSaving ? 'Đang lưu...' : 'Lưu biểu mẫu'}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Khối 1: Thông tin chung */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Thông tin chung</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('forms.formTitle')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ví dụ: Đăng ký tư vấn lộ trình 1-1"
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 ${
                errors.title
                  ? 'border-red-300 focus:ring-red-200'
                  : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
              }`}
            />
            {errors.title && <p className="text-xs text-red-600 mt-1">{errors.title}</p>}
            <p className="text-xs text-gray-400 mt-1 text-right">{title.length}/200</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('forms.formDescription')}
            </label>
            <textarea
              rows={3}
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả mục đích hoặc hướng dẫn người điền biểu mẫu..."
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 resize-y ${
                errors.description
                  ? 'border-red-300 focus:ring-red-200'
                  : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
              }`}
            />
            {errors.description && (
              <p className="text-xs text-red-600 mt-1">{errors.description}</p>
            )}
            <p className="text-xs text-gray-400 mt-1 text-right">{description.length}/5000</p>
          </div>
        </div>

        {/* Khối 2: Danh sách trường */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">{t('forms.fields')}</h2>
              <p className="text-xs text-gray-500">Mỗi biểu mẫu có thể chứa tối đa 30 trường</p>
            </div>
            <button
              type="button"
              onClick={handleAddField}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary-50 text-primary-700 hover:bg-primary-100 rounded-xl text-xs font-medium transition-colors"
            >
              <HiOutlinePlus className="w-4 h-4" />
              {t('forms.addField')}
            </button>
          </div>

          {errors.fields && (
            <p className="text-xs text-red-600 p-3 bg-red-50 rounded-xl">{errors.fields}</p>
          )}

          <div className="space-y-4">
            {fields.map((field, idx) => {
              const hasOptions = ['select', 'radio', 'checkbox'].includes(field.type);
              const labelError = errors[`field_${idx}_label`];
              const optionsError = errors[`field_${idx}_options`];

              return (
                <div
                  key={field.key || idx}
                  className="p-4 rounded-xl border border-gray-200/90 bg-gray-50/50 space-y-4 relative"
                >
                  <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                    <span className="text-xs font-semibold uppercase text-gray-500">
                      Trường #{idx + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveField(idx, -1)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded"
                        title="Di chuyển lên"
                      >
                        <HiOutlineArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === fields.length - 1}
                        onClick={() => handleMoveField(idx, 1)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded"
                        title="Di chuyển xuống"
                      >
                        <HiOutlineArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveField(idx)}
                        className="p-1.5 text-red-400 hover:text-red-600 rounded"
                        title="Xoá trường"
                      >
                        <HiOutlineTrash className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Nhãn trường */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {t('forms.fieldLabel')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        maxLength={200}
                        value={field.label}
                        onChange={(e) => handleUpdateField(idx, 'label', e.target.value)}
                        placeholder="Ví dụ: Họ và tên"
                        className={`w-full px-3 py-2 bg-white rounded-xl border text-sm focus:outline-none focus:ring-2 ${
                          labelError
                            ? 'border-red-300 focus:ring-red-200'
                            : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                        }`}
                      />
                      {labelError && <p className="text-xs text-red-600 mt-1">{labelError}</p>}
                    </div>

                    {/* Kiểu dữ liệu */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {t('forms.fieldType')}
                      </label>
                      <select
                        value={field.type}
                        onChange={(e) => handleUpdateField(idx, 'type', e.target.value)}
                        className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-100"
                      >
                        {FIELD_TYPES.map((ft) => (
                          <option key={ft.value} value={ft.value}>
                            {t(ft.labelKey)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Vai trò role */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {t('forms.role')}
                      </label>
                      <select
                        value={field.role || ''}
                        onChange={(e) => handleUpdateField(idx, 'role', e.target.value)}
                        className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-100"
                      >
                        <option value="">{t('forms.roleNone')}</option>
                        <option value="name">{t('forms.roleName')}</option>
                        <option value="email">{t('forms.roleEmail')}</option>
                        <option value="phone">{t('forms.rolePhone')}</option>
                      </select>
                    </div>

                    {/* Bắt buộc check */}
                    <div className="flex items-center pt-5">
                      <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => handleUpdateField(idx, 'required', e.target.checked)}
                          className="h-4 w-4 rounded text-primary-600 focus:ring-primary-500 border-gray-300"
                        />
                        <span>{t('forms.required')}</span>
                      </label>
                    </div>
                  </div>

                  {/* Danh sách lựa chọn options (nếu là select, radio, checkbox) */}
                  {hasOptions && (
                    <div className="pt-2 border-t border-gray-200/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-gray-700">
                          {t('forms.options')}
                        </label>
                        <button
                          type="button"
                          onClick={() => handleAddOption(idx)}
                          className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                        >
                          + {t('forms.addOption')}
                        </button>
                      </div>

                      {optionsError && (
                        <p className="text-xs text-red-600">{optionsError}</p>
                      )}

                      <div className="space-y-2">
                        {field.options.map((opt, optIdx) => (
                          <div key={optIdx} className="flex items-center gap-2">
                            <input
                              type="text"
                              maxLength={100}
                              value={opt}
                              onChange={(e) => handleUpdateOption(idx, optIdx, e.target.value)}
                              placeholder={t('forms.optionPlaceholder')}
                              className="w-full px-3 py-1.5 bg-white rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveOption(idx, optIdx)}
                              className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                            >
                              <HiOutlineTrash className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Khối 3: Cài đặt nâng cao */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-900">{t('forms.settings')}</h2>

          <div className="space-y-4 divide-y divide-gray-100">
            {/* notifyOwner */}
            <div className="flex items-start justify-between gap-4 pt-4 first:pt-0">
              <div>
                <div className="text-sm font-medium text-gray-800">
                  {t('forms.notifyOwner')}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Gửi thư thông báo kèm thông tin người nộp về email của chủ tài khoản
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.notifyOwner}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, notifyOwner: e.target.checked }))
                }
                className="mt-1 h-4 w-4 rounded text-primary-600 focus:ring-primary-500 border-gray-300"
              />
            </div>

            {/* consentEnabled */}
            <div className="flex items-start justify-between gap-4 pt-4">
              <div>
                <div className="text-sm font-medium text-gray-800">
                  {t('forms.consentEnabled')}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Hiển thị ô đánh dấu đồng ý tiếp thị trên form để khách hàng xác nhận nhận tin
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.consentEnabled}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, consentEnabled: e.target.checked }))
                }
                className="mt-1 h-4 w-4 rounded text-primary-600 focus:ring-primary-500 border-gray-300"
              />
            </div>

            {/* sendConfirmation */}
            <div className="flex items-start justify-between gap-4 pt-4">
              <div>
                <div className="text-sm font-medium text-gray-800">
                  {t('forms.sendConfirmation')}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Gửi thư xác nhận tự động tới người điền (nếu có cung cấp email)
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.sendConfirmation}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, sendConfirmation: e.target.checked }))
                }
                className="mt-1 h-4 w-4 rounded text-primary-600 focus:ring-primary-500 border-gray-300"
              />
            </div>

            {/* submitButtonText */}
            <div className="pt-4 space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                {t('forms.submitButtonText')}
              </label>
              <input
                type="text"
                maxLength={50}
                value={settings.submitButtonText}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, submitButtonText: e.target.value }))
                }
                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
              />
            </div>

            {/* successMessage */}
            <div className="pt-4 space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                {t('forms.successMessage')}
              </label>
              <textarea
                rows={2}
                maxLength={500}
                value={settings.successMessage}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, successMessage: e.target.value }))
                }
                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
              />
            </div>

            {/* redirectUrl */}
            <div className="pt-4 space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                {t('forms.redirectUrl')}
              </label>
              <input
                type="url"
                maxLength={2000}
                value={settings.redirectUrl}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, redirectUrl: e.target.value }))
                }
                placeholder="https://example.com/cam-on"
                className={`w-full px-3.5 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 ${
                  errors.redirectUrl
                    ? 'border-red-300 focus:ring-red-200'
                    : 'border-gray-300 focus:ring-primary-100 focus:border-primary-500'
                }`}
              />
              {errors.redirectUrl && (
                <p className="text-xs text-red-600 mt-1">{errors.redirectUrl}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
