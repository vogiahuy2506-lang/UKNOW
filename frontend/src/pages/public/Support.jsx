import { useState } from 'react';

function getLangClass(activeLang, itemLang) {
  return activeLang === itemLang ? '' : 'hidden';
}

function Support() {
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
              Hỗ trợ <span className="text-orange-400">Trực tuyến</span>
            </h1>
            <h1 className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'en')}`}>
              Online <span className="text-orange-400">Support</span>
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
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>1. Kênh hỗ trợ trực tuyến</h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>1. Online Support Channels</h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>DIGISO cung cấp các kênh hỗ trợ trực tuyến sau:</p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>DIGISO provides the following online support channels:</p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}><strong>Live Chat:</strong> Chat trực tiếp trên website founderai.biz</li>
              <li className={lc(language, 'en')}><strong>Live Chat:</strong> Direct chat on founderai.biz website</li>
              <li className={lc(language, 'vi')}><strong>Email:</strong> info@digiso.vn</li>
              <li className={lc(language, 'en')}><strong>Email:</strong> info@digiso.vn</li>
              <li className={lc(language, 'vi')}><strong>Hotline:</strong> 0877909606</li>
              <li className={lc(language, 'en')}><strong>Hotline:</strong> 0877909606</li>
              <li className={lc(language, 'vi')}><strong>Trợ lý AI:</strong> AI Chatbot tích hợp trên nền tảng</li>
              <li className={lc(language, 'en')}><strong>AI Assistant:</strong> AI Chatbot integrated on the platform</li>
            </ul>
          </section>

          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>2. Thời gian hỗ trợ</h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>2. Support Hours</h2>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}><strong>Live Chat & Hotline:</strong> 8:00 - 22:00, Thứ 2 - Thứ 7</li>
              <li className={lc(language, 'en')}><strong>Live Chat & Hotline:</strong> 8:00 AM - 10:00 PM, Monday - Saturday</li>
              <li className={lc(language, 'vi')}><strong>Email:</strong> Hỗ trợ 24/7, phản hồi trong vòng 24 giờ làm việc</li>
              <li className={lc(language, 'en')}><strong>Email:</strong> 24/7 support, response within 24 business hours</li>
              <li className={lc(language, 'vi')}><strong>AI Chatbot:</strong> Hỗ trợ 24/7</li>
              <li className={lc(language, 'en')}><strong>AI Chatbot:</strong> 24/7 support</li>
            </ul>
          </section>

          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>3. Tài liệu hỗ trợ</h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>3. Documentation</h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>Bên cạnh hỗ trợ trực tiếp, DIGISO cung cấp:</p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>In addition to direct support, DIGISO provides:</p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2">
              <li className={lc(language, 'vi')}>Tài liệu hướng dẫn sử dụng</li>
              <li className={lc(language, 'en')}>User guides and tutorials</li>
              <li className={lc(language, 'vi')}>Video hướng dẫn</li>
              <li className={lc(language, 'en')}>Video tutorials</li>
              <li className={lc(language, 'vi')}>FAQ - Câu hỏi thường gặp</li>
              <li className={lc(language, 'en')}>FAQ - Frequently Asked Questions</li>
            </ul>
          </section>

          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>4. Cam kết chất lượng</h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>4. Quality Commitment</h2>
            <ul className="list-disc pl-6 text-slate-700 space-y-2">
              <li className={lc(language, 'vi')}>Phản hồi yêu cầu trong vòng 24 giờ làm việc.</li>
              <li className={lc(language, 'en')}>Response within 24 business hours.</li>
              <li className={lc(language, 'vi')}>Đội ngũ hỗ trợ chuyên nghiệp, tận tâm.</li>
              <li className={lc(language, 'en')}>Professional and dedicated support team.</li>
              <li className={lc(language, 'vi')}>Giải đáp mọi thắc mắc của khách hàng.</li>
              <li className={lc(language, 'en')}>Answer all customer inquiries.</li>
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

export default Support;
