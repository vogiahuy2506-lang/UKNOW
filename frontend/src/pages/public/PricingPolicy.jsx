import { useState } from 'react';

function getLangClass(activeLang, itemLang) {
  return activeLang === itemLang ? '' : 'hidden';
}

function PricingPolicy() {
  const [language, setLanguage] = useState('vi');
  const lc = getLangClass;

  return (
    <div className="min-h-screen bg-slate-100/90 text-slate-900 antialiased">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap');
        .pp-body { font-family: 'Be Vietnam Pro', system-ui, sans-serif; line-height: 1.7; font-size: 15px; }
        .pp-section {
          border-radius: 0.75rem;
          border: 1px solid rgb(226 232 240 / 0.95);
          background: #fff;
          box-shadow: 0 1px 2px rgb(15 23 42 / 0.04), 0 8px 24px -4px rgb(15 23 42 / 0.06);
        }
        .pp-section:hover {
          box-shadow: 0 1px 2px rgb(15 23 42 / 0.05), 0 12px 32px -6px rgb(15 23 42 / 0.08);
        }
        .pp-list {
          list-style-type: decimal;
          padding-left: 1.5rem;
        }
        .pp-list li {
          margin-bottom: 0.5rem;
        }
      `}</style>
      <div className="pp-body">
        {/* Header */}
        <header className="relative border-b border-slate-800/80 bg-slate-950 text-white">
          <div className="h-1 bg-gradient-to-r from-orange-500 via-red-500 to-pink-500" aria-hidden />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                'radial-gradient(ellipse 80% 50% at 50% -20%, rgb(249 115 22 / 0.12), transparent), radial-gradient(ellipse 60% 40% at 100% 0%, rgb(244 63 94 / 0.08), transparent)',
            }}
            aria-hidden
          />

          <div className="relative mx-auto max-w-4xl px-5 pb-12 pt-10 sm:px-8 sm:pb-14 sm:pt-12">
            <div className="mb-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[13px] text-slate-400">
              <span className="font-semibold tracking-wide text-slate-200">DIGISO</span>
              <span className="hidden sm:inline text-slate-600" aria-hidden>|</span>
              <span className="rounded-md border border-slate-600/80 bg-slate-900/50 px-2.5 py-1 text-slate-300">
                founderai.biz
              </span>
            </div>

            <h1 className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'vi')}`}>
              Chính sách <span className="text-orange-400">Giá</span>
            </h1>
            <h1 className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'en')}`}>
              Pricing <span className="text-orange-400">Policy</span>
            </h1>

            <p className={`mt-3 text-center text-sm text-slate-400 ${lc(language, 'vi')}`}>
              Công ty TNHH Giải pháp số DIGISO
            </p>
            <p className={`mt-3 text-center text-sm text-slate-400 ${lc(language, 'en')}`}>
              DIGISO Digital Solutions Co., Ltd.
            </p>

            {/* Language Switcher */}
            <div className="mx-auto mt-8 flex w-full max-w-xs justify-center rounded-lg border border-slate-600/60 bg-slate-900/40 p-1 shadow-inner">
              <button
                type="button"
                onClick={() => setLanguage('vi')}
                className={`flex-1 rounded-md px-4 py-2.5 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                  language === 'vi'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                Tiếng Việt
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`flex-1 rounded-md px-4 py-2.5 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                  language === 'en'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                English
              </button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-4xl px-5 pb-24 pt-10 sm:px-8">
          {/* Meta info */}
          <div className="mb-8 flex flex-wrap items-start gap-x-4 gap-y-3 rounded-xl border border-slate-200/90 bg-white px-5 py-4 shadow-sm">
            <span
              className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-orange-500 ring-4 ring-orange-500/15"
              aria-hidden
            />
            <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-slate-600">
              <span className={lc(language, 'vi')}>
                Cập nhật: <strong>10 tháng 09 năm 2026</strong>
                {'\u00a0'}|{'\u00a0'}
                Áp dụng cho: founderai.biz
              </span>
              <span className={lc(language, 'en')}>
                Last updated: <strong>September 10, 2026</strong>
                {'\u00a0'}|{'\u00a0'}
                Applies to: founderai.biz
              </span>
            </p>
          </div>

          {/* Section 1: General Pricing */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              1. Quy định chung về Giá
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              1. General Pricing Regulations
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO cam kết minh bạch trong việc công bố giá dịch vụ. Tất cả các mức giá được hiển thị trên nền tảng founderai.biz đã bao gồm thuế giá trị gia tăng (VAT) theo quy định của pháp luật Việt Nam, trừ khi có ghi chú riêng biệt.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO commits to transparency in service pricing. All prices displayed on the founderai.biz platform include Value Added Tax (VAT) as required by Vietnamese law, unless otherwise stated.
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Giá đã bao gồm VAT:</strong> Các gói dịch vụ hiển thị giá đã bao gồm 10% VAT.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Prices include VAT:</strong> Displayed service package prices include 10% VAT.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Đơn vị tiền tệ:</strong> Tất cả giá được niêm yết bằng Đồng Việt Nam (VND).
              </li>
              <li className={lc(language, 'en')}>
                <strong>Currency:</strong> All prices are listed in Vietnamese Dong (VND).
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Thay đổi giá:</strong> DIGISO có quyền thay đổi giá dịch vụ với thông báo trước ít nhất 30 ngày.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Price changes:</strong> DIGISO reserves the right to change service prices with at least 30 days prior notice.
              </li>
            </ul>
          </section>

          {/* Section 2: Service Packages */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              2. Các gói dịch vụ và Bảng giá
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              2. Service Packages and Pricing
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO cung cấp nhiều gói dịch vụ với mức giá và quyền lợi khác nhau. Chi tiết các gói dịch vụ được công bố công khai tại trang Bảng giá (Pricing) của nền tảng.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO offers various service packages with different pricing and benefits. Details of service packages are publicly announced on the Pricing page of the platform.
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Gói cơ bản (Basic):</strong> Phù hợp cho cá nhân hoặc doanh nghiệp nhỏ mới bắt đầu.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Basic Package:</strong> Suitable for individuals or small businesses just starting out.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Gói chuyên nghiệp (Professional):</strong> Dành cho doanh nghiệp cần quản lý khách hàng và chiến dịch nâng cao.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Professional Package:</strong> For businesses requiring advanced customer management and campaign features.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Gói doanh nghiệp (Enterprise):</strong> Giải pháp toàn diện cho tổ chức lớn với nhu cầu tùy chỉnh cao.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Enterprise Package:</strong> Comprehensive solution for large organizations with high customization needs.
              </li>
            </ul>
          </section>

          {/* Section 3: Payment Methods */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              3. Phương thức Thanh toán
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              3. Payment Methods
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO hỗ trợ các phương thức thanh toán sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO supports the following payment methods:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2">
              <li className={lc(language, 'vi')}>
                <strong>Thanh toán trực tuyến qua QR Code:</strong> Sử dụng ứng dụng ngân hàng để quét mã QR.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Online payment via QR Code:</strong> Use banking applications to scan QR codes.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Chuyển khoản ngân hàng:</strong> Thông tin tài khoản được cung cấp khi tạo đơn hàng.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Bank transfer:</strong> Account information is provided when placing an order.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Thanh toán qua ví điện tử:</strong> Hỗ trợ các ví phổ biến tại Việt Nam.
              </li>
              <li className={lc(language, 'en')}>
                <strong>E-wallet payment:</strong> Supports popular e-wallets in Vietnam.
              </li>
            </ul>
          </section>

          {/* Section 4: Billing Cycles */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              4. Chu kỳ Thanh toán
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              4. Billing Cycles
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO cung cấp các chu kỳ thanh toán linh hoạt:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO offers flexible billing cycles:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Thanh toán hàng tháng:</strong> Phí được tính và thu vào ngày đầu tiên của mỗi tháng.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Monthly payment:</strong> Fees are calculated and charged on the first day of each month.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Thanh toán hàng năm:</strong> Thanh toán trước 12 tháng với ưu đãi giảm giá.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Annual payment:</strong> Prepay for 12 months with a discount benefit.
              </li>
            </ul>
            <p className={`text-slate-700 ${lc(language, 'vi')}`}>
              Khi chuyển đổi gói dịch vụ, phí chênh lệch sẽ được tính toán và yêu cầu thanh toán bổ sung hoặc hoàn trả tùy theo trường hợp.
            </p>
            <p className={`text-slate-700 ${lc(language, 'en')}`}>
              When switching service packages, the difference in fees will be calculated and require additional payment or refund depending on the case.
            </p>
          </section>

          {/* Section 5: Price Adjustments */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              5. Điều chỉnh Giá
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              5. Price Adjustments
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO có thể điều chỉnh giá dịch vụ trong các trường hợp sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO may adjust service prices in the following cases:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Thay đổi thuế suất VAT theo quy định của pháp luật.
              </li>
              <li className={lc(language, 'en')}>
                Change in VAT rates as required by law.
              </li>
              <li className={lc(language, 'vi')}>
                Cập nhật tính năng và dịch vụ mới.
              </li>
              <li className={lc(language, 'en')}>
                Updates to new features and services.
              </li>
              <li className={lc(language, 'vi')}>
                Điều chỉnh theo biến động thị trường và chi phí vận hành.
              </li>
              <li className={lc(language, 'en')}>
                Adjustments based on market fluctuations and operational costs.
              </li>
            </ul>
            <p className={`text-slate-700 ${lc(language, 'vi')}`}>
              DIGISO sẽ thông báo cho người dùng về việc điều chỉnh giá ít nhất 30 ngày trước khi áp dụng bằng email và thông báo trên nền tảng.
            </p>
            <p className={`text-slate-700 ${lc(language, 'en')}`}>
              DIGISO will notify users of price adjustments at least 30 days before implementation via email and platform notifications.
            </p>
          </section>

          {/* Section 6: Contact */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              6. Liên hệ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              6. Contact
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Nếu bạn có câu hỏi về Chính sách Giá, vui lòng liên hệ:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              If you have questions about the Pricing Policy, please contact:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2">
              <li>
                <strong>Email:</strong> <a href="mailto:info@digiso.vn" className="text-orange-600 hover:underline">info@digiso.vn</a>
              </li>
              <li>
                <strong>Điện thoại:</strong> 0877909606
              </li>
              <li>
                <strong>Website:</strong> <a href="https://founderai.biz" className="text-orange-600 hover:underline">founderai.biz</a>
              </li>
            </ul>
          </section>

          {/* Contact Block */}
          <div className="mt-10 overflow-hidden rounded-2xl border border-slate-700/30 bg-gradient-to-b from-slate-900 to-slate-950 px-5 py-8 text-white shadow-xl sm:px-8 sm:py-10">
            <div className="mb-6 max-w-2xl">
              <h2 className={`text-lg font-bold tracking-tight text-white sm:text-xl ${lc(language, 'vi')}`}>
                Liên hệ hỗ trợ
              </h2>
              <h2 className={`text-lg font-bold tracking-tight text-white sm:text-xl ${lc(language, 'en')}`}>
                Contact Support
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Email</div>
                <div className="break-words text-[13.5px]">
                  <a href="mailto:info@digiso.vn" className="text-orange-400 hover:underline">info@digiso.vn</a>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Điện thoại</div>
                <div className="break-words text-[13.5px] text-slate-100">0877909606</div>
              </div>
            </div>
          </div>
        </div>

        <footer className="border-t border-slate-200 bg-white px-5 py-8 text-center text-[12px] text-slate-500">
          <p className={lc(language, 'vi')}>
            © 2026 Công ty TNHH Giải pháp số DIGISO. Mọi quyền được bảo lưu.
          </p>
          <p className={lc(language, 'en')}>
            © 2026 DIGISO Digital Solutions Co., Ltd. All rights reserved.
          </p>
          <p className={`mt-2 text-slate-400 ${lc(language, 'vi')}`}>
            Chính sách này được cập nhật và có hiệu lực từ ngày 10/09/2026.
          </p>
          <p className={`mt-2 text-slate-400 ${lc(language, 'en')}`}>
            This policy was last updated and effective from September 10, 2026.
          </p>
        </footer>
      </div>
    </div>
  );
}

export default PricingPolicy;
