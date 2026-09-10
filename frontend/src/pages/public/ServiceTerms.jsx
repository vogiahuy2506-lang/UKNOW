import { useState } from 'react';

function getLangClass(activeLang, itemLang) {
  return activeLang === itemLang ? '' : 'hidden';
}

function ServiceTerms() {
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
              Điều kiện <span className="text-orange-400">Cung cấp Dịch vụ</span>
            </h1>
            <h1 className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'en')}`}>
              Terms of <span className="text-orange-400">Service</span>
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
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>1. Phạm vi dịch vụ</h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>1. Service Scope</h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO cung cấp nền tảng Marketing Automation tên founderai.biz bao gồm: Landing Page Builder, Email Marketing, Zalo Marketing, CRM, AI Chatbot, Analytics & Reports.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO provides the founderai.biz Marketing Automation platform including: Landing Page Builder, Email Marketing, Zalo Marketing, CRM, AI Chatbot, Analytics & Reports.
            </p>
          </section>

          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>2. Điều kiện cung cấp</h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>2. Service Conditions</h2>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>Người dùng phải đăng ký tài khoản hợp lệ và xác thực email.</li>
              <li className={lc(language, 'en')}>Users must register a valid account and verify their email.</li>
              <li className={lc(language, 'vi')}>Người dùng phải đồng ý với các điều khoản và chính sách của nền tảng.</li>
              <li className={lc(language, 'en')}>Users must agree to the platform's terms and policies.</li>
              <li className={lc(language, 'vi')}>Tuân thủ quy định pháp luật Việt Nam về thương mại điện tử và bảo vệ dữ liệu.</li>
              <li className={lc(language, 'en')}>Comply with Vietnamese law on e-commerce and data protection.</li>
            </ul>
          </section>

          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>3. Hạn chế dịch vụ</h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>3. Service Limitations</h2>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>Giới hạn số lượng email/tin nhắn theo từng gói dịch vụ.</li>
              <li className={lc(language, 'en')}>Email/message limits based on service package.</li>
              <li className={lc(language, 'vi')}>Giới hạn dung lượng lưu trữ theo từng gói.</li>
              <li className={lc(language, 'en')}>Storage limits based on package.</li>
              <li className={lc(language, 'vi')}>Không sử dụng cho mục đích spam, lừa đảo, vi phạm pháp luật.</li>
              <li className={lc(language, 'en')}>Not for spam, fraud, or illegal purposes.</li>
            </ul>
          </section>

          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>4. Chấm dứt dịch vụ</h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>4. Service Termination</h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO có quyền tạm ngừng hoặc chấm dứt dịch vụ trong các trường hợp: vi phạm điều khoản, không thanh toán, yêu cầu từ cơ quan chức năng, hoặc theo quyết định của DIGISO với thông báo trước ít nhất 30 ngày.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO may suspend or terminate service in cases: terms violation, non-payment, requests from authorities, or DIGISO's decision with at least 30 days prior notice.
            </p>
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

export default ServiceTerms;
