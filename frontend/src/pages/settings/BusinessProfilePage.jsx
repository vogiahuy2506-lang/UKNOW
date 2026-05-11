import { useState, useEffect } from 'react';
import { HiOutlineSparkles, HiOutlineSave, HiOutlineRefresh } from 'react-icons/hi';
import toast from 'react-hot-toast';
import aiApi from '../../services/aiApi';

const TONE_OPTIONS = [
  { value: 'professional', label: 'Chuyên nghiệp' },
  { value: 'friendly',     label: 'Thân thiện' },
  { value: 'formal',       label: 'Trang trọng' },
  { value: 'casual',       label: 'Gần gũi, trẻ trung' },
  { value: 'inspiring',    label: 'Truyền cảm hứng' },
];

const EMPTY_FORM = {
  company_name:    '',
  industry:        '',
  products:        '',
  target_audience: '',
  tone:            'professional',
  brand_color:     '#FF6B35',
  extra_context:   '',
};

const BusinessProfilePage = () => {
  const [form, setForm]         = useState(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving]   = useState(false);
  const [hasProfile, setHasProfile] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await aiApi.getBusinessProfile();
      if (res.data) {
        setHasProfile(true);
        setForm({
          company_name:    res.data.company_name    || '',
          industry:        res.data.industry        || '',
          products:        res.data.products        || '',
          target_audience: res.data.target_audience || '',
          tone:            res.data.tone            || 'professional',
          brand_color:     res.data.brand_color     || '#FF6B35',
          extra_context:   res.data.extra_context   || '',
        });
      }
    } catch {
      toast.error('Không thể tải hồ sơ doanh nghiệp');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field) => (e) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.company_name.trim()) {
      toast.error('Vui lòng nhập tên công ty');
      return;
    }
    setIsSaving(true);
    try {
      await aiApi.saveBusinessProfile(form);
      setHasProfile(true);
      toast.success('Đã lưu hồ sơ doanh nghiệp. AI sẽ sử dụng thông tin này từ bây giờ.');
    } catch {
      toast.error('Lưu thất bại, vui lòng thử lại');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
        Đang tải...
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
          <HiOutlineSparkles className="w-5 h-5 text-orange-500" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-800">Hồ sơ doanh nghiệp AI</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Cung cấp thông tin một lần — AI sẽ tự động cá nhân hóa mọi nội dung theo doanh nghiệp của bạn.
          </p>
        </div>
      </div>

      {hasProfile && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-2.5">
          <span className="w-2 h-2 bg-green-500 rounded-full shrink-0"></span>
          AI đang sử dụng hồ sơ của bạn. Cập nhật bất cứ lúc nào nếu thông tin thay đổi.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Tên công ty + Ngành nghề */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Tên công ty <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.company_name}
              onChange={handleChange('company_name')}
              placeholder="VD: ABC Academy"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Ngành nghề</label>
            <input
              type="text"
              value={form.industry}
              onChange={handleChange('industry')}
              placeholder="VD: Giáo dục, Thương mại điện tử..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 transition-all"
            />
          </div>
        </div>

        {/* Sản phẩm / Dịch vụ */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Sản phẩm / Dịch vụ</label>
          <textarea
            value={form.products}
            onChange={handleChange('products')}
            placeholder="VD: Khóa học lập trình Python 3 tháng (2.9tr), khóa JavaScript nâng cao (3.5tr)..."
            rows={3}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 transition-all resize-none"
          />
        </div>

        {/* Đối tượng khách hàng */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Đối tượng khách hàng mục tiêu</label>
          <textarea
            value={form.target_audience}
            onChange={handleChange('target_audience')}
            placeholder="VD: Sinh viên IT 18-25 tuổi, muốn học lập trình để đi làm, thu nhập dưới 5tr/tháng..."
            rows={2}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 transition-all resize-none"
          />
        </div>

        {/* Giọng điệu + Màu thương hiệu */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Giọng điệu</label>
            <select
              value={form.tone}
              onChange={handleChange('tone')}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 transition-all bg-white"
            >
              {TONE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Màu thương hiệu</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.brand_color}
                onChange={handleChange('brand_color')}
                className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5"
              />
              <input
                type="text"
                value={form.brand_color}
                onChange={handleChange('brand_color')}
                placeholder="#FF6B35"
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 transition-all font-mono"
              />
            </div>
          </div>
        </div>

        {/* Thông tin bổ sung */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Thông tin bổ sung</label>
          <p className="text-xs text-slate-400">USP, câu chuyện thương hiệu, chương trình khuyến mãi, lợi thế cạnh tranh...</p>
          <textarea
            value={form.extra_context}
            onChange={handleChange('extra_context')}
            placeholder="VD: Cam kết hoàn tiền 100% trong 7 ngày. Đã đào tạo hơn 5.000 học viên từ 2019. Giảng viên từng làm tại Google, VNG..."
            rows={4}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 transition-all resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white text-sm font-semibold rounded-xl hover:bg-orange-600 transition-all disabled:opacity-60 shadow-lg shadow-orange-500/20"
        >
          {isSaving ? (
            <>
              <HiOutlineRefresh className="w-4 h-4 animate-spin" />
              Đang lưu &amp; embedding...
            </>
          ) : (
            <>
              <HiOutlineSave className="w-4 h-4" />
              Lưu hồ sơ
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default BusinessProfilePage;
