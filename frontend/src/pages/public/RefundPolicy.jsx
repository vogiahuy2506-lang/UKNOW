import { useState } from 'react';
import PolicyHistory from './components/PolicyHistory.jsx';

function getLangClass(activeLang, itemLang) {
  return activeLang === itemLang ? '' : 'hidden';
}

function RefundPolicy() {
  const [language, setLanguage] = useState('vi');
  const lc = getLangClass;

  const historyEntries = [
    {
      date: '2026-09-28',
      note: {
        vi: 'Đồng bộ ngày hiệu lực về 28/09/2026 theo yêu cầu cập nhật founderai.biz 25.09 (Nghị định 248/2026/NĐ-CP).',
        en: 'Aligned effective date to 28/09/2026 per the founderai.biz 25.09 update request (Decree 248/2026/NĐ-CP).',
      },
    },
    {
      date: '2026-10-13',
      note: {
        vi: 'Phiên bản trước — ngày hiệu lực 13/10/2026 (đã thay thế).',
        en: 'Previous version — effective 13/10/2026 (now superseded).',
      },
    },
  ];

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
              <span className={lc(language, 'vi')}>Cập nhật: <strong>28 tháng 9 năm 2026</strong> | Áp dụng cho: founderai.biz</span>
              <span className={lc(language, 'en')}>Last updated: <strong>September 28, 2026</strong> | Applies to: founderai.biz</span>
            </p>
          </div>

          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>1. Nguyên tắc hoàn tiền</h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>1. Refund Principles</h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO chỉ hoàn tiền khi lỗi thuộc về DIGISO, trong các trường hợp quy định tại mục 2.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO only issues refunds when the fault lies with DIGISO, in the cases specified in Section 2.
            </p>
            <p className={`text-slate-700 ${lc(language, 'vi')}`}>
              Các trường hợp chấm dứt dịch vụ xem tại{' '}
              <a href="/service-terms" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">Điều kiện cung cấp dịch vụ</a>
              , mục 4.
            </p>
            <p className={`text-slate-700 ${lc(language, 'en')}`}>
              See cases of service termination in the{' '}
              <a href="/service-terms" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">Service Terms</a>
              , Section 4.
            </p>
          </section>

          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>2. Điều kiện hoàn tiền</h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>2. Refund Conditions</h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>Hoàn tiền được áp dụng trong các trường hợp sau:</p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>Refunds apply in the following cases:</p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>DIGISO không thể cung cấp dịch vụ do sự cố kỹ thuật hoặc hạ tầng từ phía DIGISO kéo dài từ 7 ngày trở lên, hoặc không cung cấp được dịch vụ đã cam kết.</li>
              <li className={lc(language, 'en')}>DIGISO cannot provide the Service due to a technical or infrastructure issue on DIGISO's side lasting 7 days or more, or fails to provide the service as committed.</li>
              <li className={lc(language, 'vi')}>Khách hàng thanh toán thừa, thanh toán trùng hoặc giao dịch bị lỗi.</li>
              <li className={lc(language, 'en')}>The Customer overpays, pays twice, or the transaction fails due to an error.</li>
              <li className={lc(language, 'vi')}>Dịch vụ không đúng nội dung đã xác nhận khi mua.</li>
              <li className={lc(language, 'en')}>The service does not match what was confirmed at the time of purchase.</li>
              <li className={lc(language, 'vi')}>DIGISO chấm dứt dịch vụ trước thời hạn vì lý do thuộc về DIGISO: hoàn phần phí tương ứng với phần dịch vụ chưa cung cấp.</li>
              <li className={lc(language, 'en')}>DIGISO terminates the Service early for reasons attributable to DIGISO: DIGISO refunds the fee corresponding to the portion of the service not yet provided.</li>
            </ul>
          </section>

          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>3. Trường hợp không được hoàn tiền</h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>3. Non-Refundable Cases</h2>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>Khách hàng tự chấm dứt dịch vụ khi gói đã được kích hoạt (phần thời gian chưa sử dụng không được hoàn).</li>
              <li className={lc(language, 'en')}>The Customer terminates the Service on their own after the package has been activated (the unused portion of time is not refunded).</li>
              <li className={lc(language, 'vi')}>Dịch vụ bị chấm dứt do khách hàng vi phạm Điều khoản sử dụng hoặc pháp luật.</li>
              <li className={lc(language, 'en')}>The Service is terminated because the Customer violated the Terms of Use or the law.</li>
              <li className={lc(language, 'vi')}>Lượt AI (credit) đã sử dụng.</li>
              <li className={lc(language, 'en')}>AI usage (credits) already consumed.</li>
              <li className={lc(language, 'vi')}>Gói dùng thử miễn phí.</li>
              <li className={lc(language, 'en')}>Free trial packages.</li>
            </ul>
          </section>

          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>4. Quy trình hoàn tiền</h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>4. Refund Process</h2>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>Gửi yêu cầu hoàn tiền kèm thông tin nhận tiền (số tài khoản, tên chủ tài khoản, tên ngân hàng) qua email info@digiso.vn hoặc Hotline/Zalo 0877 909 606.</li>
              <li className={lc(language, 'en')}>Submit a refund request with your receiving information (account number, account holder name, bank name) via email to info@digiso.vn or Hotline/Zalo 0877 909 606.</li>
              <li className={lc(language, 'vi')}>DIGISO xác nhận tiếp nhận trong tối đa 24 giờ và phản hồi kết quả xét duyệt trong tối đa 02 ngày làm việc.</li>
              <li className={lc(language, 'en')}>DIGISO confirms receipt within 24 hours at most and responds with the review result within 02 business days at most.</li>
              <li className={lc(language, 'vi')}>Tiền hoàn được chuyển về tài khoản ngân hàng của khách hàng trong 07–10 ngày làm việc kể từ khi yêu cầu được duyệt. Khoản thanh toán thừa hoặc trùng được hoàn trong 07–10 ngày làm việc kể từ khi xác minh.</li>
              <li className={lc(language, 'en')}>The refund is transferred to the Customer's bank account within 07–10 business days of the request being approved. Overpayments or duplicate payments are refunded within 07–10 business days of verification.</li>
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
            Chính sách này được cập nhật và có hiệu lực từ ngày 28/09/2026.
          </p>
          <p className={`mt-2 text-slate-400 ${lc(language, 'en')}`}>
            This policy was last updated and effective from September 28, 2026.
          </p>
        </footer>
        <PolicyHistory language={language} lc={lc} entries={historyEntries} />
      </div>
    </div>
  );
}

export default RefundPolicy;
