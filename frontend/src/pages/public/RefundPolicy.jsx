import { useState } from 'react';

function getLangClass(activeLang, itemLang) {
  return activeLang === itemLang ? '' : 'hidden';
}

function RefundPolicy() {
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
              Chính sách <span className="text-orange-400">Hoàn tiền</span>
            </h1>
            <h1 className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'en')}`}>
              Refund <span className="text-orange-400">Policy</span>
            </h1>
            <p className={`mt-3 text-center text-sm text-slate-400 ${lc(language, 'vi')}`}>Công ty TNHH Giải pháp số DIGISO</p>
            <p className={`mt-3 text-center text-sm text-slate-400 ${lc(language, 'en')}`}>DIGISO Digital Solutions Co., Ltd.</p>
            <div className="mx-auto mt-8 flex w-full max-w-xs justify-center rounded-lg border border-slate-600/60 bg-slate-900/40 p-1 shadow-inner">
              <button type="button" onClick={() => setLanguage('vi')} className={`flex-1 rounded-md px-4 py-2.5 text-[13px] font-semibold transition-colors ${language === 'vi' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'}`}>Tiếng Việt</button>
              <button type="button" onClick={() => setLanguage('en')} className={`flex-1 rounded-md px-4 py-2.5 text-[13px] font-semibold transition-colors ${language === 'en' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'}`}>English</button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-4xl px-5 pb-24 pt-10 sm:px-8">
          <div className="mb-8 flex flex-wrap items-start gap-x-4 gap-y-3 rounded-xl border border-slate-200/90 bg-white px-5 py-4 shadow-sm">
            <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-orange-500 ring-4 ring-orange-500/15" aria-hidden />
            <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-slate-600">
              <span className={lc(language, 'vi')}>Cập nhật: <strong>10 tháng 09 năm 2026</strong> | Áp dụng cho: founderai.biz</span>
              <span className={lc(language, 'en')}>Last updated: <strong>September 10, 2026</strong> | Applies to: founderai.biz</span>
            </p>
          </div>

          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>1. Nguyên tắc hoàn tiền</h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>1. Refund Principles</h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO cam kết hỗ trợ hoàn tiền trong các trường hợp quy định tại chính sách này, đảm bảo quyền lợi chính đáng của khách hàng.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO commits to supporting refunds in cases specified in this policy, ensuring legitimate customer rights.
            </p>
          </section>

          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>2. Điều kiện hoàn tiền</h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>2. Refund Conditions</h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>Hoàn tiền được áp dụng trong các trường hợp sau:</p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>Refunds apply in the following cases:</p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>Sự cố kỹ thuật nghiêm trọng kéo dài từ 7 ngày trở lên khiến không thể sử dụng dịch vụ.</li>
              <li className={lc(language, 'en')}>Serious technical issues lasting 7 days or more preventing service use.</li>
              <li className={lc(language, 'vi')}>DIGISO không cung cấp được dịch vụ đã cam kết trong hợp đồng.</li>
              <li className={lc(language, 'en')}>DIGISO fails to provide services as committed in the contract.</li>
              <li className={lc(language, 'vi')}>Lỗi thanh toán do hệ thống gây ra (thu phí hai lần, thu sai số tiền).</li>
              <li className={lc(language, 'en')}>Payment errors caused by the system (double charge, incorrect amount).</li>
              <li className={lc(language, 'vi')}>Hủy đăng ký trong vòng 7 ngày đầu và chưa sử dụng dịch vụ.</li>
              <li className={lc(language, 'en')}>Cancel registration within 7 days and have not used the service.</li>
            </ul>
          </section>

          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>3. Trường hợp không được hoàn tiền</h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>3. Non-Refundable Cases</h2>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>Đã sử dụng dịch vụ quá 50% thời hạn gói.</li>
              <li className={lc(language, 'en')}>Service used for more than 50% of the package period.</li>
              <li className={lc(language, 'vi')}>Vi phạm các điều khoản sử dụng dịch vụ.</li>
              <li className={lc(language, 'en')}>Violation of service terms.</li>
              <li className={lc(language, 'vi')}>Yêu cầu hoàn tiền sau 30 ngày kể từ thanh toán.</li>
              <li className={lc(language, 'en')}>Refund request after 30 days from payment.</li>
              <li className={lc(language, 'vi')}>Gói dùng thử miễn phí (trial) không được hoàn tiền.</li>
              <li className={lc(language, 'en')}>Free trial packages are non-refundable.</li>
            </ul>
          </section>

          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>4. Quy trình hoàn tiền</h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>4. Refund Process</h2>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>Gửi yêu cầu hoàn tiền qua email info@digiso.vn với thông tin tài khoản và lý do.</li>
              <li className={lc(language, 'en')}>Send refund request via email to info@digiso.vn with account information and reason.</li>
              <li className={lc(language, 'vi')}>DIGISO xem xét yêu cầu trong vòng 5 ngày làm việc.</li>
              <li className={lc(language, 'en')}>DIGISO reviews the request within 5 business days.</li>
              <li className={lc(language, 'vi')}>Hoàn tiền qua phương thức thanh toán ban đầu trong vòng 7-14 ngày làm việc.</li>
              <li className={lc(language, 'en')}>Refund via original payment method within 7-14 business days.</li>
            </ul>
          </section>

          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>5. Liên hệ</h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>5. Contact</h2>
            <ul className="list-disc pl-6 text-slate-700 space-y-2">
              <li><strong>Email:</strong> <a href="mailto:info@digiso.vn" className="text-orange-600 hover:underline">info@digiso.vn</a></li>
              <li><strong>Điện thoại:</strong> 0877909606</li>
            </ul>
          </section>
        </div>

        <footer className="border-t border-slate-200 bg-white px-5 py-8 text-center text-[12px] text-slate-500">
          <p className={lc(language, 'vi')}>© 2026 Công ty TNHH Giải pháp số DIGISO. Mọi quyền được bảo lưu.</p>
          <p className={lc(language, 'en')}>© 2026 DIGISO Digital Solutions Co., Ltd. All rights reserved.</p>
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

export default RefundPolicy;
