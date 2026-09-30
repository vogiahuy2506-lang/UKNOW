import { useState } from 'react';
import PolicyHistory from './components/PolicyHistory.jsx';

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
              Chính sách về <span className="text-orange-400">giá</span>
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
                Cập nhật ngày <strong>29/09/2026</strong> — Áp dụng từ <strong>29/09/2026</strong>
                {' · '}<a href="#lich-su-cap-nhat" className="font-medium text-orange-600 hover:underline">Các phiên bản đã lưu trữ</a>
                {'\u00a0'}|{'\u00a0'}
                Áp dụng cho: founderai.biz
              </span>
              <span className={lc(language, 'en')}>
                Last updated on <strong>September 29, 2026</strong> — Effective from <strong>September 29, 2026</strong>
                {' · '}<a href="#lich-su-cap-nhat" className="font-medium text-orange-600 hover:underline">Archived versions</a>
                {'\u00a0'}|{'\u00a0'}
                Applies to: founderai.biz
              </span>
            </p>
          </div>

          {/* Section 1 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              1. Quy định chung về Giá
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              1. General Pricing Regulations
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO cam kết minh bạch trong việc công bố giá dịch vụ. Tất cả các mức giá được hiển thị trên nền tảng founderai.biz là giá cuối cùng bạn thanh toán. Dịch vụ phần mềm của Founder AI thuộc đối tượng <strong>không chịu thuế giá trị gia tăng (GTGT)</strong> theo Luật Thuế GTGT, nên không có khoản thuế cộng thêm; hoá đơn điện tử ghi thuế suất KCT.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO commits to transparency in service pricing. All prices displayed on the founderai.biz platform are the final amount you pay. Founder AI's software service is <strong>not subject to value-added tax (VAT)</strong> under Vietnam's VAT Law, so no tax is added; the e-invoice shows the tax rate as KCT (not subject to VAT).
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Thuế GTGT:</strong> Dịch vụ không chịu thuế GTGT, hoá đơn ghi KCT, không có khoản thuế cộng thêm.
              </li>
              <li className={lc(language, 'en')}>
                <strong>VAT:</strong> The service is not subject to VAT, the invoice shows KCT, and no tax is added.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Đơn vị tiền tệ:</strong> Tất cả giá được niêm yết bằng Đồng Việt Nam (VND).
              </li>
              <li className={lc(language, 'en')}>
                <strong>Currency:</strong> All prices are listed in Vietnamese Dong (VND).
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Thay đổi giá:</strong> DIGISO có quyền thay đổi giá dịch vụ với thông báo trước ít nhất 30 ngày, trừ trường hợp cập nhật ngay để tuân thủ quy định pháp luật về thuế hoặc áp dụng chương trình khuyến mãi, ưu đãi. Thay đổi giá được công khai trên nền tảng trước thời điểm áp dụng theo mục 5.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Price changes:</strong> DIGISO reserves the right to change service prices with at least 30 days' prior notice, except for changes made immediately to comply with tax laws or to apply promotional programs and offers. Price changes are published on the platform before they take effect, as described in section 5.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Chi phí vận chuyển:</strong> Không áp dụng. Dịch vụ được cung cấp dưới dạng số (SaaS) hoàn toàn trên nền tảng trực tuyến, Người dùng không phải trả thêm bất kỳ khoản phí vận chuyển, giao nhận vật lý nào.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Shipping fees:</strong> Not applicable. Services are delivered as digital SaaS products entirely online; Users do not pay any physical shipping or delivery fees.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Phát sinh ngoài gói:</strong> Mọi khoản phát sinh ngoài gói dịch vụ (nếu có) sẽ được thông báo rõ ràng và chỉ phát sinh khi có sự đồng ý của Người dùng.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Out-of-package charges:</strong> Any charges outside the subscribed package (if any) will be clearly communicated and only incurred with the User's consent.
              </li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              2. Các gói dịch vụ và Bảng giá
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              2. Service Packages and Pricing
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Biểu giá các gói dịch vụ được công bố công khai tại trang <a href="/pricing" className="text-orange-600 hover:underline">Bảng giá</a> của nền tảng. Gói dịch vụ có thời hạn theo tháng hoặc theo năm; giá theo tháng và giá theo năm của từng gói được niêm yết riêng trên trang Bảng giá.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              The price list of service packages is published on the platform's <a href="/pricing" className="text-orange-600 hover:underline">Pricing</a> page. Packages have a monthly or yearly term; the monthly and yearly price of each package are listed separately on the Pricing page.
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Gói Dùng thử:</strong> Trải nghiệm nền tảng với hạn mức giới hạn, không thu phí.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Trial package:</strong> Try the platform with limited quotas, free of charge.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Gói Starter:</strong> Gói cơ bản dành cho cá nhân và freelancer quản lý khách hàng.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Starter package:</strong> A basic package for individuals and freelancers managing customers.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Gói Basic:</strong> Phù hợp cho cá nhân hoặc doanh nghiệp nhỏ mới bắt đầu.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Basic package:</strong> Suitable for individuals or small businesses just starting out.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Gói Professional:</strong> Dành cho doanh nghiệp cần quản lý khách hàng và chiến dịch nâng cao.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Professional package:</strong> For businesses requiring advanced customer and campaign management.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Gói Enterprise:</strong> Giải pháp toàn diện cho tổ chức lớn với nhu cầu tùy chỉnh cao.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Enterprise package:</strong> A comprehensive solution for large organisations with high customisation needs.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Gói Tùy chọn:</strong> Khách hàng tự chọn số tin Zalo, email, lượt AI, tài khoản… và thanh toán ngay. Giá được xác định theo cấu hình khách hàng chọn, hiển thị và được khách hàng xác nhận trước khi đặt hàng.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Custom package:</strong> The customer chooses the number of Zalo messages, emails, AI usage, accounts, etc. and pays immediately. The price is determined by the configuration chosen, and is displayed and confirmed by the customer before placing the order.
              </li>
            </ul>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Cách tính giá: giá của từng gói là mức phí trọn gói cho một kỳ (một tháng hoặc một năm), thu một lần khi đặt mua; giá áp dụng là mức hiển thị trên nền tảng tại thời điểm khách hàng xác nhận đặt hàng và bắt đầu áp dụng từ thời điểm gói được kích hoạt.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              How prices are calculated: the price of each package is an all-inclusive fee for one term (one month or one year), collected once at purchase; the applicable price is the one displayed on the platform when the customer confirms the order, and applies from the time the package is activated.
            </p>
          </section>

          {/* Section 3 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              3. Phương thức Thanh toán
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              3. Payment Methods
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO hỗ trợ các phương thức thanh toán sau (chi tiết xem <a href="/payment-policy" className="text-orange-600 hover:underline">Chính sách về thanh toán</a>):
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO supports the following payment methods (see the <a href="/payment-policy" className="text-orange-600 hover:underline">Payment Policy</a> for details):
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Thanh toán qua mã QR (cổng PayOS):</strong> Sử dụng ứng dụng ngân hàng để quét mã QR.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Payment via QR code (PayOS gateway):</strong> Use a banking application to scan the QR code.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Chuyển khoản ngân hàng:</strong> Thông tin tài khoản nhận được cung cấp khi tạo đơn hàng.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Bank transfer:</strong> The receiving account information is provided when the order is created.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              4. Chu kỳ Thanh toán
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              4. Billing Cycles
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO cung cấp các chu kỳ thanh toán sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO offers the following billing cycles:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Gói theo tháng:</strong> thời hạn 30 ngày kể từ ngày gói được kích hoạt. Phí được thu một lần khi đặt mua; Founder AI không tự động trừ tiền để gia hạn — khi hết hạn, bạn chủ động đặt mua gia hạn.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Monthly packages:</strong> a 30-day term from the date the package is activated. The fee is collected once at purchase; Founder AI does not automatically charge to renew — when the term ends, you choose whether to purchase a renewal.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Gói theo năm:</strong> thanh toán trước cho 12 tháng (365 ngày kể từ ngày kích hoạt) với ưu đãi giảm giá so với mua theo tháng.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Yearly packages:</strong> prepay for 12 months (365 days from the activation date) with a discount compared with buying monthly.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Hạn mức sử dụng:</strong> hạn mức của gói (số tin, lượt AI…) được làm mới theo chu kỳ 30 ngày tính từ ngày kích hoạt gói.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Usage quotas:</strong> the package quotas (messages, AI usage, etc.) are refreshed every 30 days counted from the package activation date.
              </li>
            </ul>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              <strong>Khi chuyển đổi gói:</strong> Nâng lên gói cao hơn: gói mới có hiệu lực ngay, thời hạn tính lại từ ngày nâng cấp; thời gian còn lại của gói cũ không được quy đổi hay hoàn tiền. Chuyển xuống gói thấp hơn: bạn thanh toán trước cho gói mới, gói hiện tại được dùng hết chu kỳ và gói mới tự kích hoạt khi chu kỳ kết thúc; lệnh hẹn này không huỷ được và không hoàn tiền.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              <strong>When changing packages:</strong> Upgrading to a higher-tier package: the new package takes effect immediately and its term restarts from the upgrade date; the remaining time on the old package cannot be converted or refunded. Downgrading to a lower-tier package: you prepay for the new package, the current package continues until the end of its cycle and the new package activates automatically when that cycle ends; this scheduled change cannot be cancelled and is not refundable.
            </p>
          </section>

          {/* Section 5 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              5. Khuyến mại, ưu đãi và điều chỉnh Giá
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              5. Promotions, Offers and Price Adjustments
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Khi có chương trình khuyến mại, ưu đãi (bao gồm mã giảm giá), DIGISO công khai mức giá áp dụng, điều kiện, phạm vi và thời gian áp dụng của từng đợt trên nền tảng, và thông tin đầy đủ hoặc tóm tắt về hình thức khuyến mại được hiển thị cho người mua trước khi đặt hàng.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              When a promotion or offer (including discount codes) is available, DIGISO publishes on the platform the applicable price, conditions, scope and period of each campaign, and full or summary information on the promotion is shown to the buyer before ordering.
            </p>
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
                Updates to features and new services.
              </li>
              <li className={lc(language, 'vi')}>
                Điều chỉnh theo biến động thị trường và chi phí vận hành.
              </li>
              <li className={lc(language, 'en')}>
                Adjustments based on market fluctuations and operating costs.
              </li>
              <li className={lc(language, 'vi')}>
                Áp dụng chương trình khuyến mại.
              </li>
              <li className={lc(language, 'en')}>
                Application of promotional programs.
              </li>
            </ul>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO thông báo cho người dùng về việc điều chỉnh giá ít nhất 30 ngày trước khi áp dụng bằng email và thông báo trên nền tảng (không ít hơn 20 ngày công khai theo Điều 8 Nghị định 248/2026/NĐ-CP), trừ trường hợp thay đổi để tuân thủ quy định pháp luật về thuế hoặc theo thời gian của chương trình khuyến mại. Việc điều chỉnh giá không làm thay đổi khoản phí đã thanh toán cho thời hạn gói đã mua, trừ khi có thỏa thuận khác.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO notifies users of price adjustments at least 30 days before they apply, by email and platform notification (in any case no less than the 20 days' public notice required by Article 8 of Decree 248/2026/NĐ-CP), except for changes made to comply with tax law or in line with the duration of a promotion. A price adjustment does not change the fee already paid for the term of a purchased package, unless otherwise agreed.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Đối với dịch vụ cung cấp liên tục, định kỳ, người dùng có quyền ngừng sử dụng hoặc chấm dứt dịch vụ nếu không đồng ý với mức phí mới trước ngày mức phí đó có hiệu lực; việc tiếp tục sử dụng sau ngày hiệu lực được xem là chấp nhận mức phí mới.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              For continuously or periodically provided services, users may stop using or terminate the service if they do not agree to the new fee before it takes effect; continued use after the effective date is deemed acceptance of the new fee.
            </p>
          </section>

          {/* Section 6 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              6. Liên hệ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              6. Contact
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Nếu bạn có câu hỏi về Chính sách về giá, vui lòng liên hệ:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              If you have questions about the Pricing Policy, please contact:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Email:</strong> <a href="mailto:info@digiso.vn" className="text-orange-600 hover:underline">info@digiso.vn</a>
              </li>
              <li className={lc(language, 'en')}>
                <strong>Email:</strong> <a href="mailto:info@digiso.vn" className="text-orange-600 hover:underline">info@digiso.vn</a>
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Điện thoại:</strong> 0877909606
              </li>
              <li className={lc(language, 'en')}>
                <strong>Phone:</strong> 0877909606
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Website:</strong> <a href="https://founderai.biz" className="text-orange-600 hover:underline">founderai.biz</a>
              </li>
              <li className={lc(language, 'en')}>
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
            Chính sách này được cập nhật và có hiệu lực từ ngày 29/09/2026.
          </p>
          <p className={`mt-2 text-slate-400 ${lc(language, 'en')}`}>
            This policy was last updated and effective from September 29, 2026.
          </p>
        </footer>
        <PolicyHistory slug="pricing" language={language} lc={lc} />
      </div>
    </div>
  );
}

export default PricingPolicy;
