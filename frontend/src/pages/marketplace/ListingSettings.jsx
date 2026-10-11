import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineArrowLeft,
  HiOutlineCheck,
  HiOutlineEye,
  HiOutlineEyeOff,
  HiOutlineStar,
  HiOutlineTag,
  HiOutlineMail,
  HiOutlineChat,
  HiOutlineTemplate,
  HiOutlineTrendingUp,
} from 'react-icons/hi';
import marketplaceService from '../../services/marketplace.service';
import NumberInput from '../../components/common/NumberInput';

const ListingSettings = ({ id: propId, onClose: propOnClose, onBack: propOnBack }) => {
  const paramsId = useParams().id;
  const id = propId || paramsId;
  const navigate = useNavigate();

  const handleBack = () => {
    if (propOnBack) {
      propOnBack();
    } else if (propOnClose) {
      propOnClose();
    } else {
      navigate('/app/marketplace/my');
    }
  };

  const [listing, setListing] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    priceCredits: 0,
    isVisible: true,
  });

  useEffect(() => {
    if (id) {
      fetchListing();
    } else {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchListing = async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const response = await marketplaceService.getListing(id);
      const data = response.data.data;
      setListing(data);
      setForm({
        title: data.title || '',
        description: data.description || '',
        priceCredits: data.price_credits || 0,
        isVisible: data.status === 'published',
      });
    } catch (error) {
      toast.error('Không thể tải thông tin template');
      handleBack();
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error('Vui lòng nhập tiêu đề');
      return;
    }
    setIsSaving(true);
    try {
      await marketplaceService.updateListing(id, {
        title: form.title,
        description: form.description,
        priceCredits: parseInt(form.priceCredits, 10) || 0,
      });
      toast.success('Đã lưu thay đổi');
      setListing((prev) => ({
        ...prev,
        title: form.title,
        description: form.description,
        price_credits: parseInt(form.priceCredits, 10) || 0,
      }));
    } catch (error) {
      toast.error('Lỗi khi lưu: ' + (error.response?.data?.message || 'Vui lòng thử lại'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleVisibility = async () => {
    const newVisibility = !form.isVisible;
    try {
      if (newVisibility) {
        await marketplaceService.publishListing(id);
        toast.success('Đã công khai template');
      } else {
        await marketplaceService.pauseListing(id);
        toast.success('Đã ẩn template');
      }
      setForm((prev) => ({ ...prev, isVisible: newVisibility }));
      setListing((prev) => ({ ...prev, status: newVisibility ? 'published' : 'paused' }));
    } catch (error) {
      toast.error('Lỗi khi cập nhật trạng thái');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="spinner w-8 h-8"></div>
      </div>
    );
  }

  if (!listing && !isLoading) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 dark:text-dk-text2">Không tìm thấy template</p>
        <button onClick={handleBack} className="btn btn-primary mt-4">
          Quay lại
        </button>
      </div>
    );
  }

  const getTypeIcon = () => {
    if (listing.resource_type === 'campaign') return HiOutlineMail;
    if (listing.resource_type === 'chatbot') return HiOutlineChat;
    return HiOutlineTemplate;
  };
  const TypeIcon = getTypeIcon();

  const isPublished = form.isVisible;

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-dk-bg">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 bg-white dark:bg-dk-surface border-b border-gray-100 dark:border-dk-border">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dk-strong transition-colors text-gray-500 dark:text-dk-text2 hover:text-gray-700 dark:hover:text-dk-text"
          >
            <HiOutlineArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 flex-1">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              listing.resource_type === 'campaign' 
                ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400' 
                : 'bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400'
            }`}>
              <TypeIcon className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-dk-text">Cài đặt Template</h2>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  isPublished 
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' 
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                }`}>
                  {isPublished ? 'Đã công khai' : 'Đang ẩn'}
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-dk-text2">Chỉnh sửa thông tin và quản lý trạng thái</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white dark:bg-dk-surface rounded-xl p-4 border border-gray-100 dark:border-dk-border shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 dark:text-dk-text2 text-xs mb-2">
              <HiOutlineTrendingUp className="w-4 h-4" />
              <span>Lượt mua</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-dk-text">{listing.purchase_count || 0}</p>
          </div>
          <div className="bg-white dark:bg-dk-surface rounded-xl p-4 border border-gray-100 dark:border-dk-border shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 dark:text-dk-text2 text-xs mb-2">
              <HiOutlineStar className="w-4 h-4" />
              <span>Đánh giá</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-dk-text">
              {Number(listing.rating_avg || 0).toFixed(1)}
              <span className="text-sm font-normal text-gray-400 dark:text-dk-muted ml-1">({listing.rating_count || 0})</span>
            </p>
          </div>
          <div className="bg-white dark:bg-dk-surface rounded-xl p-4 border border-gray-100 dark:border-dk-border shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 dark:text-dk-text2 text-xs mb-2">
              <HiOutlineTag className="w-4 h-4" />
              <span>Giá bán</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-dk-text">
              {form.priceCredits > 0 ? form.priceCredits : 'Miễn phí'}
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="bg-white dark:bg-dk-surface rounded-xl p-6 border border-gray-100 dark:border-dk-border shadow-sm space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dk-text mb-1.5">
              Tiêu đề <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-dk-border dark:bg-dk-inset focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all text-gray-900 dark:text-dk-text placeholder-gray-400 dark:placeholder-dk-muted"
              placeholder="Nhập tiêu đề template"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dk-text mb-1.5">Mô tả</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-dk-border dark:bg-dk-inset focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all text-gray-900 dark:text-dk-text placeholder-gray-400 dark:placeholder-dk-muted resize-none min-h-[100px]"
              placeholder="Mô tả chi tiết về template của bạn"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dk-text mb-1.5">
              Giá bán <span className="text-gray-400 dark:text-dk-muted font-normal">(credits)</span>
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, priceCredits: Math.max(0, prev.priceCredits - 1) }))}
                className="w-10 h-10 rounded-lg border border-gray-200 dark:border-dk-border hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-gray-600 dark:text-dk-text2 font-semibold transition-colors"
              >
                −
              </button>
              <NumberInput
                value={form.priceCredits}
                onChange={(v) => setForm((prev) => ({ ...prev, priceCredits: parseInt(v, 10) || 0 }))}
                className="w-24 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-dk-border dark:bg-dk-inset focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all text-center text-gray-900 dark:text-dk-text font-medium"
              />
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, priceCredits: prev.priceCredits + 1 }))}
                className="w-10 h-10 rounded-lg border border-gray-200 dark:border-dk-border hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-gray-600 dark:text-dk-text2 font-semibold transition-colors"
              >
                +
              </button>
              <span className="text-sm text-gray-500 dark:text-dk-text2">Đặt 0 = miễn phí</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={handleToggleVisibility}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
              isPublished
                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/60 border border-amber-200 dark:border-amber-800'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800'
            }`}
          >
            {isPublished ? (
              <>
                <HiOutlineEyeOff className="w-4 h-4" />
                Ẩn template
              </>
            ) : (
              <>
                <HiOutlineEye className="w-4 h-4" />
                Công khai template
              </>
            )}
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm shadow-indigo-500/25"
          >
            {isSaving ? (
              <div className="spinner w-4 h-4 border-2 border-white/30 border-t-white" />
            ) : (
              <HiOutlineCheck className="w-4 h-4" />
            )}
            Lưu thay đổi
          </button>
        </div>
      </div>
    </div>
  );
};

export default ListingSettings;
