import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineX,
  HiOutlineCheckCircle,
  HiOutlineMail,
  HiOutlineLightBulb,
  HiOutlineTemplate,
} from 'react-icons/hi';
import marketplaceService from '../../services/marketplace.service';
import campaignApiService from '../../features/campaigns/services/campaignApi.service';
import { FormField, TagInput } from '../../components/common/FormComponents';
import { useI18n } from '../../i18n';

const CAMPAIGN_TYPE_FILTERS = [
  { value: '', label: 'Tất cả' },
  { value: 'email', label: 'Email' },
  { value: 'zalo', label: 'Zalo cá nhân' },
  { value: 'zalo_group', label: 'Zalo nhóm' },
];

const CAMPAIGN_TYPE_TO_CATEGORY = {
  email: 'email',
  zalo: 'zalo_personal',
  zalo_personal: 'zalo_personal',
  zalo_group: 'zalo_group',
  facebook: 'facebook',
  telegram: 'telegram',
  sms: 'sms',
  mixed: 'automation',
};

const CAMPAIGN_TYPE_LABELS = {
  email: 'Email',
  zalo: 'Zalo cá nhân',
  zalo_personal: 'Zalo cá nhân',
  zalo_group: 'Zalo nhóm',
  facebook: 'Facebook',
  telegram: 'Telegram',
  sms: 'SMS',
  mixed: 'Mixed',
};

const STEPS = [
  { id: 1, label: 'Chọn chiến dịch' },
  { id: 2, label: 'Thông tin' },
  { id: 3, label: 'Giá bán' },
];

const CreateListing = ({ onClose, onSuccess }) => {
  const t = useI18n('marketplace');
  const [campaigns, setCampaigns] = useState([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [currentStep, setCurrentStep] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [form, setForm] = useState({
    campaignId: '',
    title: '',
    description: '',
    category: '',
    tags: [],
    priceCredits: 0,
  });

  useEffect(() => {
    fetchCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredCampaigns = typeFilter
    ? campaigns.filter(c => c.campaignType === typeFilter)
    : campaigns;

  const fetchCampaigns = async () => {
    setIsLoadingCampaigns(true);
    try {
      const response = await campaignApiService.getCampaigns({ limit: 100 });
      const campaignsData = response.data.data.items || [];
      setCampaigns(campaignsData);
    } catch (error) {
      toast.error(t('createListing.loadError'));
    } finally {
      setIsLoadingCampaigns(false);
    }
  };

  const validateField = (field, value) => {
    if (field === 'campaignId' && !value) return 'Vui lòng chọn chiến dịch';
    if (field === 'title') {
      if (!value.trim()) return 'Vui lòng nhập tiêu đề';
      if (value.length > 255) return 'Tiêu đề không được quá 255 ký tự';
    }
    if (field === 'description' && value && value.length > 2000) {
      return 'Mô tả không được quá 2000 ký tự';
    }
    if (field === 'priceCredits' && value < 0) return 'Giá không được âm';
    return null;
  };

  const validateStep = (step) => {
    const newErrors = {};
    if (step === 1) {
      const e = validateField('campaignId', form.campaignId);
      if (e) newErrors.campaignId = e;
    }
    if (step === 2) {
      const eTitle = validateField('title', form.title);
      if (eTitle) newErrors.title = eTitle;
      if (form.description && form.description.length > 2000) {
        newErrors.description = 'Mô tả không được quá 2000 ký tự';
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((s) => Math.min(s + 1, STEPS.length));
    }
  };

  const handleBack = () => setCurrentStep((s) => Math.max(s - 1, 1));

  const handleSubmit = async () => {
    if (!validateStep(1)) {
      toast.error(t('createListing.invalidForm'));
      return;
    }

    setIsSubmitting(true);
    try {
      await marketplaceService.createListing({
        campaignId: parseInt(form.campaignId, 10),
        title: form.title.trim(),
        description: form.description?.trim() || null,
        category: form.category || null,
        tags: form.tags.length > 0 ? form.tags : null,
        priceCredits: parseInt(form.priceCredits, 10) || 0,
      });
      toast.success(t('createListing.createSuccess'));
      if (onSuccess) onSuccess();
      onClose?.();
    } catch (error) {
      toast.error(error.response?.data?.message || t('createListing.createError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCategoryFromCampaignType = (campaignType) => {
    const key = String(campaignType || '').trim().toLowerCase();
    return CAMPAIGN_TYPE_TO_CATEGORY[key] || null;
  };

  const handleCampaignSelect = (campaignId) => {
    const campaign = campaigns.find((c) => c.id === parseInt(campaignId, 10));
    const autoCategory = getCategoryFromCampaignType(campaign?.campaignType);
    setForm((prev) => ({
      ...prev,
      campaignId,
      title: campaign?.campaignName || prev.title || '',
      category: autoCategory,
    }));
    setErrors((prev) => ({ ...prev, campaignId: undefined }));
  };

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const selectedCampaign = campaigns.find((c) => c.id === parseInt(form.campaignId, 10));

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-gray-200 bg-white">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
              <HiOutlineTemplate className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Tạo Template mới</h1>
              <p className="text-sm text-gray-500">Chia sẻ chiến dịch của bạn trên marketplace</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
            aria-label="Đóng"
          >
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper */}
        <div className="px-6 pb-4">
          <div className="flex items-center gap-2">
            {STEPS.map((step, idx) => {
              const isActive = currentStep === step.id;
              const isDone = currentStep > step.id;
              return (
                <div key={step.id} className="flex items-center flex-1">
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                        isDone
                          ? 'bg-emerald-500 text-white'
                          : isActive
                          ? 'bg-orange-600 text-white'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {isDone ? '✓' : step.id}
                    </div>
                    <span
                      className={`text-sm font-medium hidden sm:inline ${
                        isActive ? 'text-gray-900' : isDone ? 'text-emerald-600' : 'text-gray-400'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className={`flex-1 mx-3 h-0.5 rounded ${isDone ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-6">
          {/* Step 1: Campaign selection */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="card p-4 bg-orange-50 border-orange-100">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                    <HiOutlineLightBulb className="w-4 h-4 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">
                      Chọn chiến dịch làm template
                    </h3>
                    <p className="text-sm text-gray-600">
                      Chiến dịch được chọn sẽ được đóng gói thành template để chia sẻ trên marketplace
                    </p>
                  </div>
                </div>
              </div>

              <div className="card p-4">
                <div className="flex items-center justify-between mb-4">
                  <label className="text-sm font-semibold text-gray-900">
                    Chiến dịch của bạn <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    {CAMPAIGN_TYPE_FILTERS.map((filter) => (
                      <button
                        key={filter.value}
                        type="button"
                        onClick={() => setTypeFilter(filter.value)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                          typeFilter === filter.value
                            ? 'bg-orange-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                </div>
                {isLoadingCampaigns ? (
                  <div className="flex items-center gap-3 py-6 text-sm text-gray-500">
                    <div className="spinner w-5 h-5" />
                    Đang tải...
                  </div>
                ) : filteredCampaigns.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gray-100 flex items-center justify-center">
                      <HiOutlineMail className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="text-gray-600 font-medium mb-1">
                      {typeFilter ? 'Không có chiến dịch loại này' : 'Chưa có chiến dịch nào'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {typeFilter ? 'Thử chọn loại khác' : 'Tạo chiến dịch để bắt đầu'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {filteredCampaigns.map((c) => {
                      const isSelected = form.campaignId === String(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleCampaignSelect(String(c.id))}
                          className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                            isSelected
                              ? 'border-orange-500 bg-orange-50'
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                isSelected
                                  ? 'bg-orange-500 text-white'
                                  : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              <HiOutlineMail className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 truncate">
                                {c.campaignName}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {CAMPAIGN_TYPE_LABELS[c.campaignType] || c.campaignType} • 
                                Tạo {new Date(c.createdAt).toLocaleDateString('vi-VN')}
                              </p>
                            </div>
                            {isSelected && (
                              <HiOutlineCheckCircle className="w-5 h-5 text-orange-600 flex-shrink-0" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {errors.campaignId && (
                  <p className="mt-2 text-sm text-red-600">{errors.campaignId}</p>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Info */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="card p-5 space-y-4">
                <FormField
                  label="Tiêu đề"
                  name="title"
                  value={form.title}
                  onChange={(e) => updateForm('title', e.target.value)}
                  placeholder="VD: Mẫu email chào mừng khách hàng mới"
                  required
                  error={errors.title}
                  helpText={`${form.title.length}/255 ký tự`}
                />

                <FormField
                  label="Mô tả"
                  name="description"
                  type="textarea"
                  value={form.description}
                  onChange={(e) => updateForm('description', e.target.value)}
                  placeholder="Mô tả chi tiết về template, đối tượng phù hợp và kết quả mong đợi..."
                  rows={4}
                  error={errors.description}
                  helpText={`${form.description.length}/2000 ký tự`}
                />

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1.5">
                    Tags
                  </label>
                  <TagInput
                    value={form.tags}
                    onChange={(tags) => updateForm('tags', tags)}
                    placeholder="Nhấn Enter để thêm..."
                  />
                  <p className="text-xs text-gray-500 mt-1.5">
                    Giúp người khác tìm thấy template dễ hơn
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Pricing */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="card p-5 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Giá bán <span className="text-gray-400 font-normal">(credits)</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => updateForm('priceCredits', Math.max(0, parseInt(form.priceCredits, 10) - 50))}
                      className="w-10 h-10 rounded-xl border border-gray-200 hover:border-orange-300 hover:bg-orange-50 text-gray-700 font-semibold transition-colors"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={form.priceCredits}
                      onChange={(e) => updateForm('priceCredits', Math.max(0, parseInt(e.target.value, 10) || 0))}
                      min={0}
                      className="input w-32 text-center text-lg font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => updateForm('priceCredits', parseInt(form.priceCredits, 10) + 50)}
                      className="w-10 h-10 rounded-xl border border-gray-200 hover:border-orange-300 hover:bg-orange-50 text-gray-700 font-semibold transition-colors"
                    >
                      +
                    </button>
                  </div>
                  <p className="text-sm text-gray-500 mt-2">
                    Đặt <strong>0 credits</strong> để chia sẻ miễn phí
                  </p>
                </div>
              </div>

              {/* Summary */}
              {selectedCampaign && (
                <div className="card p-4 bg-gray-900 text-white">
                  <p className="text-xs uppercase tracking-wider text-gray-400 mb-3">Tóm tắt</p>
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      form.priceCredits === 0 ? 'bg-emerald-500' : 'bg-orange-500'
                    }`}>
                      <HiOutlineMail className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{form.title || selectedCampaign.campaignName}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {form.priceCredits === 0 ? 'Miễn phí' : `${form.priceCredits} credits`}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="flex-shrink-0 border-t border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={currentStep === 1 ? onClose : handleBack}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {currentStep === 1 ? 'Hủy' : 'Quay lại'}
          </button>
          {currentStep < STEPS.length ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={currentStep === 1 && !form.campaignId}
              className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Tiếp theo
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="btn btn-primary inline-flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="spinner w-4 h-4 border-2 border-white/30 border-t-white" />
                  Đang tạo...
                </>
              ) : (
                <>
                  <HiOutlineCheckCircle className="w-4 h-4" />
                  Tạo Template
                </>
              )}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
};

export default CreateListing;
