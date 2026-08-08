import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { HiOutlineArrowLeft } from 'react-icons/hi';
import marketplaceService from '../../services/marketplace.service';
import campaignApiService from '../../features/campaigns/services/campaignApi.service';
import { FormField, FormSection, FormActions, TagInput } from '../../components/common/FormComponents';

const CATEGORIES = [
  { value: 'marketing', label: 'Marketing' },
  { value: 'automation', label: 'Automation' },
  { value: 'support', label: 'Hỗ trợ khách hàng' },
];

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Công khai', description: 'Mọi người đều có thể xem và mua' },
  { value: 'team', label: 'Chỉ team', description: 'Chỉ thành viên trong team mới thấy' },
];

const CreateListing = () => {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState({
    campaignId: '',
    title: '',
    description: '',
    category: '',
    tags: [],
    priceCredits: 0,
    visibility: 'public',
  });

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    setIsLoadingCampaigns(true);
    try {
      const response = await campaignApiService.getCampaigns({ limit: 100 });
      const campaignsData = response.data.data.items || [];
      setCampaigns(campaignsData);
    } catch (error) {
      toast.error('Không thể tải danh sách chiến dịch');
    } finally {
      setIsLoadingCampaigns(false);
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!form.campaignId) {
      newErrors.campaignId = 'Vui lòng chọn chiến dịch';
    }
    if (!form.title.trim()) {
      newErrors.title = 'Vui lòng nhập tiêu đề';
    } else if (form.title.length > 255) {
      newErrors.title = 'Tiêu đề không được quá 255 ký tự';
    }
    if (form.description && form.description.length > 2000) {
      newErrors.description = 'Mô tả không được quá 2000 ký tự';
    }
    if (form.priceCredits < 0) {
      newErrors.priceCredits = 'Giá không được âm';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error('Vui lòng kiểm tra lại thông tin');
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
        visibility: form.visibility,
      });
      toast.success('Tạo listing thành công!');
      navigate('/app/marketplace/my');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể tạo listing');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCampaignSelect = (campaignId) => {
    const campaign = campaigns.find(c => c.id === parseInt(campaignId, 10));
    setForm(prev => ({
      ...prev,
      campaignId,
      title: prev.title || campaign?.campaignName || '',
    }));
    setErrors(prev => ({ ...prev, campaignId: undefined }));
  };

  const updateForm = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link
        to="/app/marketplace/my"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900"
      >
        <HiOutlineArrowLeft className="w-5 h-5" />
        Quay lại
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tạo Marketplace Listing</h1>
        <p className="text-gray-500 mt-1">
          Chia sẻ template của bạn với cộng đồng
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Campaign Selection */}
        <FormSection
          title="Chọn chiến dịch"
          description="Chọn chiến dịch bạn muốn chia sẻ trên Marketplace"
        >
          <FormField
            label="Chiến dịch"
            name="campaignId"
            type="select"
            value={form.campaignId}
            onChange={(e) => handleCampaignSelect(e.target.value)}
            placeholder="-- Chọn chiến dịch --"
            options={campaigns.map(c => ({
              value: c.id,
              label: `${c.campaignName} (${c.campaignType})`
            }))}
            required
            error={errors.campaignId}
            disabled={isLoadingCampaigns}
          />
          {isLoadingCampaigns && (
            <div className="mt-2">
              <div className="spinner w-5 h-5"></div>
              <span className="text-sm text-gray-500 ml-2">Đang tải danh sách chiến dịch...</span>
            </div>
          )}
        </FormSection>

        {/* Listing Info */}
        <FormSection
          title="Thông tin listing"
          description="Cung cấp thông tin chi tiết về template của bạn"
        >
          <FormField
            label="Tiêu đề"
            name="title"
            value={form.title}
            onChange={(e) => updateForm('title', e.target.value)}
            placeholder="VD: Mẫu chiến dịch email chào mừng"
            required
            error={errors.title}
            helpText="Tối đa 255 ký tự"
          />

          <FormField
            label="Mô tả"
            name="description"
            type="textarea"
            value={form.description}
            onChange={(e) => updateForm('description', e.target.value)}
            placeholder="Mô tả chiến dịch của bạn..."
            rows={4}
            error={errors.description}
            helpText="Giúp người khác hiểu rõ hơn về template của bạn"
          />

          <FormField
            label="Danh mục"
            name="category"
            type="select"
            value={form.category}
            onChange={(e) => updateForm('category', e.target.value)}
            placeholder="-- Chọn danh mục --"
            options={CATEGORIES}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Tags
            </label>
            <TagInput
              value={form.tags}
              onChange={(tags) => updateForm('tags', tags)}
              placeholder="Thêm tags để dễ tìm kiếm..."
            />
          </div>
        </FormSection>

        {/* Pricing */}
        <FormSection
          title="Giá cả"
          description="Đặt giá cho template của bạn"
        >
          <FormField
            label="Giá (credits)"
            name="priceCredits"
            type="number"
            value={form.priceCredits}
            onChange={(e) => updateForm('priceCredits', e.target.value)}
            placeholder="0 = miễn phí"
            min={0}
            error={errors.priceCredits}
            helpText="Đặt giá 0 nếu muốn chia sẻ miễn phí"
          />
        </FormSection>

        {/* Visibility */}
        <FormSection
          title="Quyền hiển thị"
          description="Chọn ai có thể xem template của bạn"
        >
          <div className="space-y-3">
            {VISIBILITY_OPTIONS.map(option => (
              <label
                key={option.value}
                className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                  form.visibility === option.value
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  value={option.value}
                  checked={form.visibility === option.value}
                  onChange={(e) => updateForm('visibility', e.target.value)}
                  className="mt-1 w-4 h-4 text-primary-600"
                />
                <div>
                  <p className="font-medium text-gray-900">{option.label}</p>
                  <p className="text-sm text-gray-500">{option.description}</p>
                </div>
              </label>
            ))}
          </div>
        </FormSection>

        {/* Actions */}
        <FormActions>
          <button
            type="button"
            onClick={() => navigate('/app/marketplace/my')}
            className="btn btn-outline"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn btn-primary"
          >
            {isSubmitting ? (
              <>
                <span className="spinner w-4 h-4 mr-2"></span>
                Đang tạo...
              </>
            ) : (
              'Tạo Listing'
            )}
          </button>
        </FormActions>
      </form>
    </div>
  );
};

export default CreateListing;
