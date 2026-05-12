import { useState } from 'react';
import PrivacyPolicyProcessorPanel from './PrivacyPolicyProcessorPanel';
import PrivacyPolicyControllerPanel from './PrivacyPolicyControllerPanel';

/**
 * Trả về class hiển thị theo ngôn ngữ đang chọn.
 *
 * Luồng hoạt động:
 * 1. Nếu item cùng ngôn ngữ đang active thì trả về class rỗng để hiển thị.
 * 2. Ngược lại trả về `hidden` để ẩn đúng phần nội dung.
 *
 * @param {'vi' | 'en'} activeLang Ngôn ngữ hiện tại.
 * @param {'vi' | 'en'} itemLang Ngôn ngữ của block cần hiển thị.
 * @returns {string} Class điều khiển trạng thái hiển thị.
 */
function getLangClass(activeLang, itemLang) {
  return activeLang === itemLang ? '' : 'hidden';
}

/**
 * Trang chính sách bảo mật public render hoàn toàn bằng React — nội dung khớp file HTML `privacy-policy-digiso.html`.
 *
 * Luồng hoạt động:
 * 1. Quản lý ngôn ngữ (vi/en) bằng state — mặc định English.
 * 2. Quản lý tab chính sách (processor/controller) bằng state.
 * 3. Hai panel nội dung tách file `PrivacyPolicyProcessorPanel` / `PrivacyPolicyControllerPanel` để dễ bảo trì.
 *
 * @returns {JSX.Element} Trang privacy policy.
 */
function PrivacyPolicy() {
  const [language, setLanguage] = useState('en');
  const [policyType, setPolicyType] = useState('processor');
  const lc = getLangClass;

  return (
    <div className="min-h-screen bg-slate-100/90 text-slate-900 antialiased">
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap');
          .pp-body { font-family: 'Be Vietnam Pro', system-ui, sans-serif; line-height: 1.7; font-size: 15px; }
          /* Thẻ nội dung: bóng nhẹ, viền tinh để giống tài liệu pháp lý in trên nền sạch */
          .pp-section {
            border-radius: 0.75rem;
            border: 1px solid rgb(226 232 240 / 0.95);
            background: #fff;
            box-shadow: 0 1px 2px rgb(15 23 42 / 0.04), 0 8px 24px -4px rgb(15 23 42 / 0.06);
          }
          .pp-section:hover {
            box-shadow: 0 1px 2px rgb(15 23 42 / 0.05), 0 12px 32px -6px rgb(15 23 42 / 0.08);
          }
        `}
      </style>
      <div className="pp-body">
        {/* Thanh nhấn mạnh pháp lý + header tối giản, uy tín */}
        <header className="relative border-b border-slate-800/80 bg-slate-950 text-white">
          <div className="h-1 bg-gradient-to-r from-teal-600 via-sky-600 to-indigo-700" aria-hidden />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                'radial-gradient(ellipse 80% 50% at 50% -20%, rgb(45 212 191 / 0.12), transparent), radial-gradient(ellipse 60% 40% at 100% 0%, rgb(56 189 248 / 0.08), transparent)',
            }}
            aria-hidden
          />

          <div className="relative mx-auto max-w-4xl px-5 pb-12 pt-10 sm:px-8 sm:pb-14 sm:pt-12">
            <div className="mb-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[13px] text-slate-400">
              <span className="font-semibold tracking-wide text-slate-200">DIGISO</span>
              <span className="hidden sm:inline text-slate-600" aria-hidden>
                |
              </span>
              <span className="rounded-md border border-slate-600/80 bg-slate-900/50 px-2.5 py-1 text-slate-300">
                digiso.vn
              </span>
              <span className="text-slate-600">·</span>
              <span className="rounded-md border border-slate-600/80 bg-slate-900/50 px-2.5 py-1 text-slate-300">
                founderai.biz
              </span>
              <span className="text-slate-600">·</span>
              <span className="rounded-md border border-slate-600/80 bg-slate-900/50 px-2.5 py-1 text-slate-300">
                campaign.digiso.vn
              </span>
            </div>

            <h1
              className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'vi')}`}
            >
              Chính Sách <span className="text-teal-400">Bảo Mật</span>
            </h1>
            <h1
              className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'en')}`}
            >
              Privacy <span className="text-teal-400">Policy</span>
            </h1>

            <p className={`mt-3 text-center text-sm text-slate-400 ${lc(language, 'vi')}`}>
              Công ty TNHH Giải pháp số DIGISO
            </p>
            <p className={`mt-3 text-center text-sm text-slate-400 ${lc(language, 'en')}`}>
              DIGISO Digital Solutions Co., Ltd.
            </p>

            {/* Chuyển ngôn ngữ: dạng phân đoạn, không dùng emoji — trông trang trọng hơn */}
            <div className="mx-auto mt-8 flex w-full max-w-xs justify-center rounded-lg border border-slate-600/60 bg-slate-900/40 p-1 shadow-inner">
              <button
                type="button"
                onClick={() => setLanguage('vi')}
                className={`flex-1 rounded-md px-4 py-2.5 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
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
                className={`flex-1 rounded-md px-4 py-2.5 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
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
          {/* Tab chính sách: nền trắng, trạng thái active rõ ràng */}
          <div
            className="mb-8 flex overflow-hidden rounded-xl border border-slate-200/90 bg-white p-1 shadow-sm"
            role="tablist"
            aria-label={language === 'vi' ? 'Loại chính sách' : 'Policy type'}
          >
            <button
              type="button"
              role="tab"
              aria-selected={policyType === 'processor'}
              onClick={() => setPolicyType('processor')}
              className={`flex-1 rounded-lg px-3 py-3.5 text-center text-[13px] font-semibold leading-snug transition-colors sm:px-4 sm:text-sm ${
                policyType === 'processor'
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className={lc(language, 'vi')}>Chính sách xử lý dữ liệu – Bên xử lý</span>
              <span className={lc(language, 'en')}>Data Processing Policy – Processor</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={policyType === 'controller'}
              onClick={() => setPolicyType('controller')}
              className={`flex-1 rounded-lg px-3 py-3.5 text-center text-[13px] font-semibold leading-snug transition-colors sm:px-4 sm:text-sm ${
                policyType === 'controller'
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className={lc(language, 'vi')}>Chính sách xử lý dữ liệu – Bên kiểm soát</span>
              <span className={lc(language, 'en')}>Data Processing Policy – Controller</span>
            </button>
          </div>

          {/* Thanh meta: giữ nguyên câu chữ — chỉ căn chỉnh hiển thị */}
          <div className="mb-8 flex flex-wrap items-start gap-x-4 gap-y-3 rounded-xl border border-slate-200/90 bg-white px-5 py-4 shadow-sm">
            <span
              className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-teal-500 ring-4 ring-teal-500/15"
              aria-hidden
            />
            <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-slate-600">
              <span className={lc(language, 'vi')}>
                Cập nhật: <strong>01 tháng 04 năm 2026</strong>
                {'\u00a0'}|{'\u00a0'}
                Áp dụng cho: digiso.vn &nbsp;·&nbsp; founderai.biz &nbsp;·&nbsp; campaign.digiso.vn
              </span>
              <span className={lc(language, 'en')}>
                Last updated: <strong>April 01, 2026</strong>
                {'\u00a0'}|{'\u00a0'}
                Applies to: digiso.vn &nbsp;·&nbsp; founderai.biz &nbsp;·&nbsp; campaign.digiso.vn
              </span>
            </p>
          </div>

          {policyType === 'processor' ? (
            <PrivacyPolicyProcessorPanel language={language} lc={lc} />
          ) : (
            <PrivacyPolicyControllerPanel language={language} lc={lc} />
          )}

          {/* Khối liên hệ: tông tối chừng mực, lưới thẻ rõ ràng */}
          <div className="mt-10 overflow-hidden rounded-2xl border border-slate-700/30 bg-gradient-to-b from-slate-900 to-slate-950 px-5 py-8 text-white shadow-xl sm:px-8 sm:py-10">
            <div className="mb-6 max-w-2xl">
              <h2 className={`text-lg font-bold tracking-tight text-white sm:text-xl ${lc(language, 'vi')}`}>
                Liên hệ về Quyền riêng tư
              </h2>
              <h2 className={`text-lg font-bold tracking-tight text-white sm:text-xl ${lc(language, 'en')}`}>
                Privacy Contact
              </h2>
              <p className={`mt-2 text-[14px] leading-relaxed text-slate-300 ${lc(language, 'vi')}`}>
                Nếu bạn có câu hỏi hoặc yêu cầu liên quan đến chính sách bảo mật và dữ liệu cá nhân, vui lòng liên hệ:
              </p>
              <p className={`mt-2 text-[14px] leading-relaxed text-slate-300 ${lc(language, 'en')}`}>
                For questions or requests regarding this privacy policy and personal data, please contact:
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-teal-400/95">
                  Công ty / Company
                </div>
                <div className="break-words text-[13.5px] leading-snug text-slate-100">
                  Công ty TNHH Giải pháp số DIGISO
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-teal-400/95">Website</div>
                <div className="break-words text-[13.5px] leading-relaxed text-slate-100">
                  <a
                    href="https://digiso.vn"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-400 no-underline hover:underline"
                  >
                    digiso.vn
                  </a>
                  {'\u00a0'}·{'\u00a0'}
                  <a
                    href="https://founderai.biz"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-400 no-underline hover:underline"
                  >
                    founderai.biz
                  </a>
                  {'\u00a0'}·{'\u00a0'}
                  <a
                    href="https://campaign.digiso.vn"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-400 no-underline hover:underline"
                  >
                    campaign.digiso.vn
                  </a>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-teal-400/95">
                  Email Bảo mật / Privacy Email
                </div>
                <div className="break-words text-[13.5px]">
                  <a href="mailto:nhthong@digiso.vn" className="text-teal-400 no-underline hover:underline">
                    nhthong@digiso.vn
                  </a>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-teal-400/95">
                  Địa chỉ / Address
                </div>
                <div className="break-words text-[13.5px] text-slate-100">Việt Nam</div>
              </div>
            </div>
          </div>
        </div>

        <footer className="border-t border-slate-200 bg-white px-5 py-8 text-center text-[12px] text-slate-500">
          <p className={lc(language, 'vi')}>
            © 2026 Công ty TNHH Giải pháp số DIGISO. Mọi quyền được bảo lưu.
            {'\u00a0'}|{'\u00a0'}
            <a href="https://digiso.vn" className="font-medium text-slate-700 no-underline hover:underline">
              digiso.vn
            </a>
            {'\u00a0'}·{'\u00a0'}
            <a href="https://founderai.biz" className="font-medium text-slate-700 no-underline hover:underline">
              founderai.biz
            </a>
            {'\u00a0'}·{'\u00a0'}
            <a href="https://campaign.digiso.vn" className="font-medium text-slate-700 no-underline hover:underline">
              campaign.digiso.vn
            </a>
          </p>
          <p className={lc(language, 'en')}>
            © 2026 DIGISO Digital Solutions Co., Ltd. All rights reserved.
            {'\u00a0'}|{'\u00a0'}
            <a href="https://digiso.vn" className="font-medium text-slate-700 no-underline hover:underline">
              digiso.vn
            </a>
            {'\u00a0'}·{'\u00a0'}
            <a href="https://founderai.biz" className="font-medium text-slate-700 no-underline hover:underline">
              founderai.biz
            </a>
            {'\u00a0'}·{'\u00a0'}
            <a href="https://campaign.digiso.vn" className="font-medium text-slate-700 no-underline hover:underline">
              campaign.digiso.vn
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}

export default PrivacyPolicy;
