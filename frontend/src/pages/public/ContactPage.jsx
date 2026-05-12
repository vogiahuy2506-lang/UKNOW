import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineMail, HiOutlinePhone, HiOutlineLocationMarker,
  HiOutlineChat, HiOutlineCheckCircle, HiOutlineArrowRight,
} from 'react-icons/hi';
import { submitContactForm } from '../../services/contactApi.service';

const COMPANY_SIZES = [
  { value: '', label: 'Chọn quy mô doanh nghiệp...' },
  { value: '1-10', label: '1-10 nhân viên' },
  { value: '11-50', label: '11-50 nhân viên' },
  { value: '51-200', label: '51-200 nhân viên' },
  { value: '201-500', label: '201-500 nhân viên' },
  { value: '500+', label: 'Trên 500 nhân viên' },
];

const CONTACT_CHANNELS = [
  {
    icon: HiOutlineMail,
    label: 'Email',
    value: 'hello@founderai.vn',
    href: 'mailto:hello@founderai.vn',
    description: 'Phản hồi trong 24 giờ',
  },
  {
    icon: HiOutlinePhone,
    label: 'Hotline',
    value: '1900 6868',
    href: 'tel:19006868',
    description: 'T2-T7, 8:00 - 17:30',
  },
  {
    icon: HiOutlineChat,
    label: 'Zalo OA',
    value: 'Founder AI Official',
    href: 'https://zalo.me/founderai',
    description: 'Hỗ trợ trực tuyến',
  },
  {
    icon: HiOutlineLocationMarker,
    label: 'Văn phòng',
    value: 'Hà Nội, Việt Nam',
    href: null,
    description: 'Tầng 5, Tòa nhà ABC',
  },
];

export default function ContactPage() {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', company: '', companySize: '', message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      toast.error('Vui lòng điền họ tên, email và lời nhắn');
      return;
    }
    if (form.message.trim().length < 10) {
      toast.error('Lời nhắn cần ít nhất 10 ký tự');
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitContactForm(form);
      toast.success(res.data?.message || 'Đã gửi thành công!');
      setSubmitted(true);
      setForm({ name: '', email: '', phone: '', company: '', companySize: '', message: '' });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không gửi được, vui lòng thử lại');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white pt-24 pb-20">
      {/* Hero */}
      <div className="max-w-7xl mx-auto px-6 text-center mb-12">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight mb-4">
          Liên hệ với chúng tôi
        </h1>
        <p className="text-base md:text-lg text-slate-600 max-w-2xl mx-auto">
          Có câu hỏi về sản phẩm, cần tư vấn gói doanh nghiệp hay muốn hợp tác?
          Đội ngũ Founder AI sẵn sàng hỗ trợ bạn.
        </p>
      </div>

      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12">
        {/* LEFT: Form (3 cols) */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
            {submitted ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-5">
                  <HiOutlineCheckCircle className="w-9 h-9 text-green-600" />
                </div>
                <h3 className="text-2xl font-black text-slate-900 mb-2">Cảm ơn bạn!</h3>
                <p className="text-slate-600 mb-6 max-w-md mx-auto">
                  Yêu cầu của bạn đã được ghi nhận. Đội ngũ Founder AI sẽ liên hệ lại trong vòng 24 giờ làm việc.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    type="button"
                    onClick={() => setSubmitted(false)}
                    className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
                  >
                    Gửi yêu cầu khác
                  </button>
                  <Link
                    to="/pricing"
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold hover:shadow-lg transition-all"
                  >
                    Xem bảng giá <HiOutlineArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <h2 className="text-xl md:text-2xl font-black text-slate-900 mb-1">
                    Gửi yêu cầu tư vấn
                  </h2>
                  <p className="text-sm text-slate-500">
                    Điền thông tin bên dưới, chúng tôi sẽ phản hồi trong 24 giờ.
                  </p>
                </div>

                {/* Row 1: Name + Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    label="Họ và tên"
                    required
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="Nguyễn Văn A"
                  />
                  <FormField
                    label="Email"
                    required
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="ban@congty.com"
                  />
                </div>

                {/* Row 2: Phone + Company */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    label="Số điện thoại"
                    type="tel"
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="0912 345 678"
                  />
                  <FormField
                    label="Tên công ty"
                    name="company"
                    value={form.company}
                    onChange={handleChange}
                    placeholder="Công ty TNHH ABC"
                  />
                </div>

                {/* Row 3: Company size */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Quy mô doanh nghiệp
                  </label>
                  <select
                    name="companySize"
                    value={form.companySize}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none transition-all"
                  >
                    {COMPANY_SIZES.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Row 4: Message */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Bạn cần chúng tôi hỗ trợ điều gì? <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    name="message"
                    value={form.message}
                    onChange={handleChange}
                    rows={5}
                    required
                    placeholder="Mô tả nhu cầu, mục tiêu hoặc câu hỏi của bạn..."
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none transition-all resize-none"
                  />
                  <div className="text-xs text-slate-400 mt-1 text-right">
                    {form.message.length} / 5000
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold hover:shadow-lg hover:shadow-orange-500/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Đang gửi...' : (
                    <>Gửi yêu cầu <HiOutlineArrowRight className="w-4 h-4" /></>
                  )}
                </button>

                <p className="text-xs text-slate-400">
                  Bằng việc gửi form, bạn đồng ý với{' '}
                  <a href="/privacy-policy" className="text-orange-600 hover:underline">
                    Chính sách bảo mật
                  </a> của chúng tôi.
                </p>
              </form>
            )}
          </div>
        </div>

        {/* RIGHT: Contact info (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl border border-orange-100 p-6">
            <h3 className="text-lg font-black text-slate-900 mb-1">Kênh liên hệ</h3>
            <p className="text-sm text-slate-600 mb-5">
              Chọn cách thuận tiện nhất cho bạn.
            </p>

            <div className="space-y-3">
              {CONTACT_CHANNELS.map((channel) => {
                const Icon = channel.icon;
                const content = (
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-white/70 hover:bg-white transition-colors border border-transparent hover:border-orange-200">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {channel.label}
                      </div>
                      <div className="text-sm font-bold text-slate-900 truncate">
                        {channel.value}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {channel.description}
                      </div>
                    </div>
                  </div>
                );

                return channel.href ? (
                  <a
                    key={channel.label}
                    href={channel.href}
                    target={channel.href.startsWith('http') ? '_blank' : undefined}
                    rel={channel.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                    className="block"
                  >
                    {content}
                  </a>
                ) : (
                  <div key={channel.label}>{content}</div>
                );
              })}
            </div>
          </div>

          {/* CTA secondary */}
          <div className="bg-slate-900 rounded-2xl p-6 text-white">
            <h4 className="font-black text-lg mb-2">Đã sẵn sàng bắt đầu?</h4>
            <p className="text-sm text-slate-300 mb-4">
              Đăng ký dùng thử 14 ngày miễn phí — không cần thẻ tín dụng.
            </p>
            <div className="flex flex-col gap-2">
              <Link
                to="/register"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white text-slate-900 font-bold hover:bg-slate-100 transition-colors text-sm"
              >
                Đăng ký miễn phí <HiOutlineArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 font-semibold hover:bg-slate-800 transition-colors text-sm"
              >
                Xem bảng giá
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, required, type = 'text', name, value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none transition-all"
      />
    </div>
  );
}
