import { useState } from 'react';
import PolicyHistory from './components/PolicyHistory.jsx';

function getLangClass(activeLang, itemLang) {
  return activeLang === itemLang ? '' : 'hidden';
}

/**
 * Thỏa thuận Xử lý Dữ liệu Cá nhân Công Khai (Public DPA).
 * Nội dung cập nhật theo Luật 91/2025/QH15 và Nghị định 356/2025/NĐ-CP.
 * Tham khảo Mẫu số 01 — Tờ khai thông báo nền tảng TMĐT kinh doanh trực tiếp.
 * Áp dụng cho: DIGISO (vừa là Bên xử lý, vừa là Bên kiểm soát dữ liệu).
 */
function PublicDPA() {
  const [language, setLanguage] = useState('vi');
  const lc = getLangClass;

  const historyEntries = [
    {
      date: '2026-09-28',
      note: {
        vi: 'Viết lại toàn bộ nội dung theo Luật 91/2025/QH15 và Nghị định 356/2025/NĐ-CP (Mẫu số 01). Tham chiếu đúng văn bản pháp luật hiện hành, tách rõ vai trò Bên xử lý và Bên kiểm soát dữ liệu.',
        en: 'Full rewrite per Law 91/2025/QH15 and Decree 356/2025/NĐ-CP (Template No. 01). Correct legal references, separated Processor and Controller roles.',
      },
    },
    {
      date: '2026-08-04',
      note: {
        vi: 'Phiên bản trước — ngày hiệu lực 04/08/2026 (đã thay thế).',
        en: 'Previous version — effective 04/08/2026 (now superseded).',
      },
    },
  ];

  return (
    <div className="min-h-screen bg-slate-100/90 text-slate-900 antialiased">
      <style>
        {`
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
          .pp-tab-btn {
            transition: all 0.2s ease;
          }
        `}
      </style>
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
                digiso.vn
              </span>
              <span className="text-slate-600">·</span>
              <span className="rounded-md border border-slate-600/80 bg-slate-900/50 px-2.5 py-1 text-slate-300">
                founderai.biz
              </span>
            </div>

            <h1
              className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'vi')}`}
            >
              Thỏa Thuận <span className="text-orange-400">Xử Lý Dữ Liệu</span> Cá Nhân
            </h1>
            <h1
              className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'en')}`}
            >
              Personal Data <span className="text-orange-400">Processing</span> Agreement
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
                Cập nhật: <strong>28 tháng 9 năm 2026</strong>
                {'\u00a0'}|{'\u00a0'}
                Luật 91/2025/QH15 · Nghị định 356/2025/NĐ-CP
              </span>
              <span className={lc(language, 'en')}>
                Last updated: <strong>September 28, 2026</strong>
                {'\u00a0'}|{'\u00a0'}
                Law 91/2025/QH15 · Decree 356/2025/NĐ-CP
              </span>
            </p>
          </div>

          {/* ===== PHẦN A: BÊN XỬ LÝ DỮ LIỆU ===== */}

          {/* A.1. Lời nói đầu */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              Phần A — Chính sách xử lý dữ liệu cá nhân: Bên xử lý dữ liệu
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              Part A — Personal Data Processing Policy: Data Processor
            </h2>

            <h3 className={`text-lg font-semibold text-orange-600 mb-3 ${lc(language, 'vi')}`}>
              Lời nói đầu
            </h3>
            <h3 className={`text-lg font-semibold text-orange-600 mb-3 ${lc(language, 'en')}`}>
              Preamble
            </h3>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Chính sách xử lý dữ liệu cá nhân – Bên xử lý dữ liệu quy định về những thông tin
              mà Công ty TNHH Giải pháp số DIGISO thu thập trên hoặc thông qua các website:
              founderai.biz và các ứng dụng, dịch vụ liên quan. Chính sách này được áp dụng
              khi DIGISO đóng vai trò là <strong>Bên xử lý dữ liệu cá nhân</strong>.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              Personal Data Processing Policy – Data Processor governs information collected by
              DIGISO Digital Solutions Co., Ltd. through websites: founderai.biz and related
              applications and services. This Policy applies when DIGISO acts as the{' '}
              <strong>Personal Data Processor</strong>.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Trường hợp bạn là người dùng của khách hàng đã ký hợp đồng với DIGISO,
              Chính sách này áp dụng cho bạn.
            </p>
            <p className={`text-slate-700 ${lc(language, 'en')}`}>
              If you are a user of a customer who has signed a contract with DIGISO,
              this Policy applies to you.
            </p>
          </section>

          {/* A.2. Định nghĩa */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              1. Định nghĩa
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              1. Definitions
            </h2>
            <ul className="pp-list text-slate-700 space-y-3">
              <li className={lc(language, 'vi')}>
                <strong>DIGISO / chúng tôi:</strong> Công ty TNHH Giải pháp số DIGISO, đơn vị cung cấp các giải pháp số và nền tảng công nghệ cho doanh nghiệp Việt Nam.
              </li>
              <li className={lc(language, 'en')}>
                <strong>DIGISO / we / us:</strong> DIGISO Digital Solutions Co., Ltd., a digital solutions and technology platform provider for Vietnamese enterprises.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Khách hàng:</strong> Tổ chức hoặc cá nhân ký hợp đồng với DIGISO, đóng vai trò là Bên kiểm soát dữ liệu cá nhân.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Customer:</strong> Organization or individual who signs a contract with DIGISO, acting as the Personal Data Controller.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Người dùng:</strong> Cá nhân truy cập, sử dụng các dịch vụ của DIGISO dưới sự quản lý của Khách hàng.
              </li>
              <li className={lc(language, 'en')}>
                <strong>User:</strong> Individual who accesses or uses DIGISO's services under the management of the Customer.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Chủ thể dữ liệu:</strong> Cá nhân được dữ liệu cá nhân phản ánh, là đối tượng của hoạt động xử lý dữ liệu.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Data Subject:</strong> Individual reflected by personal data, the subject of data processing activities.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Dữ liệu cá nhân:</strong> Dữ liệu cá nhân là dữ liệu số hoặc thông tin dưới dạng khác xác định hoặc giúp xác định một con người cụ thể, bao gồm: dữ liệu cá nhân cơ bản và dữ liệu cá nhân nhạy cảm.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Personal Data:</strong> Digital data or information in other forms that identifies or helps identify a specific person, including: basic personal data and sensitive personal data.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Xử lý dữ liệu cá nhân:</strong> là hoạt động tác động đến dữ liệu cá nhân, bao gồm: thu thập, phân tích, tổng hợp, mã hóa, giải mã, chỉnh sửa, xóa, hủy, khử nhận dạng, cung cấp, công khai, chuyển giao dữ liệu cá nhân và hoạt động khác tác động đến dữ liệu cá nhân.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Personal Data Processing:</strong> activity that affects personal data, including: collection, analysis, synthesis, encryption, decryption, modification, deletion, destruction, de-identification, provision, disclosure, transfer of personal data, and other activities affecting personal data.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Bên kiểm soát dữ liệu cá nhân:</strong> là cơ quan, tổ chức, cá nhân quyết định mục đích và phương tiện xử lý dữ liệu cá nhân.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Personal Data Controller:</strong> agency, organization, or individual that decides the purpose and means of personal data processing.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Bên xử lý dữ liệu cá nhân:</strong> là cơ quan, tổ chức, cá nhân thực hiện việc xử lý dữ liệu cá nhân theo yêu cầu của Bên kiểm soát dữ liệu cá nhân.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Personal Data Processor:</strong> agency, organization, or individual that processes personal data at the request of the Personal Data Controller.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Bên kiểm soát và xử lý dữ liệu cá nhân:</strong> là cơ quan, tổ chức, cá nhân quyết định mục đích, phương tiện và trực tiếp xử lý dữ liệu cá nhân.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Personal Data Controller and Processor:</strong> agency, organization, or individual that decides the purpose, means, and directly processes personal data.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Bên thứ ba:</strong> là tổ chức, cá nhân ngoài chủ thể dữ liệu cá nhân, Bên kiểm soát dữ liệu cá nhân, Bên kiểm soát và xử lý dữ liệu cá nhân, Bên xử lý dữ liệu cá nhân tham gia vào việc xử lý dữ liệu cá nhân theo quy định pháp luật.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Third Party:</strong> organization or individual outside the data subject, Personal Data Controller, Personal Data Controller and Processor, or Personal Data Processor involved in personal data processing under legal regulations.
              </li>
            </ul>
          </section>

          {/* A.3. Dữ liệu DIGISO xử lý */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              2. Dữ liệu cá nhân DIGISO xử lý
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              2. Personal Data Processed by DIGISO
            </h2>

            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              2.1. Dữ liệu do Khách hàng cung cấp
            </h3>
            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              2.1. Data Provided by the Customer
            </h3>
            <p className={`text-slate-700 mb-3 ${lc(language, 'vi')}`}>
              Với tư cách Bên xử lý, DIGISO không chủ động thu thập dữ liệu cá nhân mà xử lý dữ liệu theo ủy thác của Bên kiểm soát thông qua Hợp đồng. Khi sử dụng dịch vụ, Khách hàng có thể cung cấp các loại dữ liệu cá nhân sau của Người dùng:
            </p>
            <p className={`text-slate-700 mb-3 ${lc(language, 'en')}`}>
              As a Processor, DIGISO does not proactively collect personal data but processes data under mandate from the Controller through a Contract. When using the service, the Customer may provide the following types of personal data of Users:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-1 mb-4">
              <li className={lc(language, 'vi')}>Thông tin nhân thân: Họ tên đầy đủ, ngày tháng năm sinh, giới tính, quốc tịch, dân tộc, tôn giáo (nếu có)</li>
              <li className={lc(language, 'en')}>Personal information: Full name, date of birth, gender, nationality, ethnicity, religion (if any)</li>
              <li className={lc(language, 'vi')}>Thông tin liên lạc: Số điện thoại di động, địa chỉ email, địa chỉ liên hệ, địa chỉ thường trú, địa chỉ tạm trú</li>
              <li className={lc(language, 'en')}>Contact information: Mobile phone number, email address, contact address, permanent residence, temporary residence</li>
              <li className={lc(language, 'vi')}>Giấy tờ tùy thân: Hình ảnh cá nhân, số CMND/CCCD, số hộ chiếu, số giấy phép lái xe, số mã số thuế, số BHXH</li>
              <li className={lc(language, 'en')}>Identity documents: Personal photos, ID card/Citizen ID number, passport number, driver license number, tax ID, social insurance number</li>
              <li className={lc(language, 'vi')}>Thông tin tài khoản: Thông tin tài khoản ngân hàng, lịch sử hoạt động trực tuyến, địa chỉ IP, cookie</li>
              <li className={lc(language, 'en')}>Account information: Bank account information, online activity history, IP address, cookies</li>
              <li className={lc(language, 'vi')}>Dữ liệu học tập (founderai.biz): Tiến độ khóa học, kết quả kiểm tra, bài tập, chứng chỉ hoàn thành, lịch sử học tập</li>
              <li className={lc(language, 'en')}>Learning data (founderai.biz): Course progress, test results, assignments, completion certificates, learning history</li>
              <li className={lc(language, 'vi')}>Dữ liệu chiến dịch marketing: Thông tin đăng ký sự kiện, phản hồi chiến dịch, lịch sử tương tác với email, SMS, Zalo</li>
              <li className={lc(language, 'en')}>Marketing campaign data: Event registration info, campaign responses, interaction history with email, SMS, Zalo</li>
            </ul>
            <p className={`text-slate-700 text-sm italic mb-4 ${lc(language, 'vi')}`}>
              Khách hàng chịu trách nhiệm về tính hợp pháp của việc thu thập và cung cấp các dữ liệu này cho founderai.biz.
            </p>
            <p className={`text-slate-700 text-sm italic mb-4 ${lc(language, 'en')}`}>
              The Customer is responsible for the legality of collecting and providing this data to founderai.biz.
            </p>

            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              2.2. Dữ liệu tự động thu thập
            </h3>
            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              2.2. Automatically Collected Data
            </h3>
            <p className={`text-slate-700 mb-3 ${lc(language, 'vi')}`}>
              Khi Người dùng sử dụng Dịch vụ, DIGISO tự động thu thập một số thông tin kỹ thuật:
            </p>
            <p className={`text-slate-700 mb-3 ${lc(language, 'en')}`}>
              When Users use the Service, DIGISO automatically collects some technical information:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-1">
              <li className={lc(language, 'vi')}>Địa chỉ IP: Địa chỉ giao thức Internet của thiết bị khi kết nối với máy chủ DIGISO</li>
              <li className={lc(language, 'en')}>IP address: Internet Protocol address of the device when connecting to DIGISO servers</li>
              <li className={lc(language, 'vi')}>Thông tin thiết bị: Loại thiết bị (máy tính, điện thoại, máy tính bảng), hệ điều hành, loại trình duyệt và phiên bản</li>
              <li className={lc(language, 'en')}>Device information: Device type (computer, phone, tablet), operating system, browser type and version</li>
              <li className={lc(language, 'vi')}>Hành vi truy cập: Các trang đã truy cập, thời gian truy cập, liên kết đã nhấp, từ khóa tìm kiếm</li>
              <li className={lc(language, 'en')}>Access behavior: Pages visited, access time, links clicked, search keywords</li>
              <li className={lc(language, 'vi')}>Cookie: Mã định danh phiên, mã định danh người dùng, tùy chọn ngôn ngữ, lịch sử hoạt động</li>
              <li className={lc(language, 'en')}>Cookies: Session identifier, user identifier, language preferences, activity history</li>
            </ul>

            <h3 className={`text-base font-semibold text-slate-800 mb-2 mt-4 ${lc(language, 'vi')}`}>
              2.3. Dữ liệu từ dịch vụ tích hợp
            </h3>
            <h3 className={`text-base font-semibold text-slate-800 mb-2 mt-4 ${lc(language, 'en')}`}>
              2.3. Data from Integrated Services
            </h3>
            <p className={`text-slate-700 ${lc(language, 'vi')}`}>
              Người dùng có thể đăng nhập qua Google hoặc Apple ID. Khi đó, DIGISO tiếp nhận: Họ và tên, địa chỉ email, ngày sinh (nếu được cung cấp), giới tính (nếu được cung cấp), ảnh đại diện.
            </p>
            <p className={`text-slate-700 ${lc(language, 'en')}`}>
              Users may log in via Google or Apple ID. In that case, DIGISO receives: Full name, email address, date of birth (if provided), gender (if provided), profile picture.
            </p>
          </section>

          {/* A.4. Mục đích xử lý dữ liệu */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              3. Mục đích xử lý dữ liệu
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              3. Data Processing Purposes
            </h2>
            <p className={`text-slate-700 mb-3 ${lc(language, 'vi')}`}>
              DIGISO xử lý dữ liệu cá nhân cho các mục đích sau, theo đúng phạm vi được ủy quyền từ Khách hàng:
            </p>
            <p className={`text-slate-700 mb-3 ${lc(language, 'en')}`}>
              DIGISO processes personal data for the following purposes, strictly within the scope authorized by the Customer:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2">
              <li className={lc(language, 'vi')}>
                <strong>Vận hành dịch vụ:</strong> Duy trì và cung cấp đầy đủ tính năng của các nền tảng digiso.vn, founderai.biz, đảm bảo hệ thống hoạt động ổn định, an toàn và liên tục.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Service operation:</strong> Maintaining and providing full features of digiso.vn and founderai.biz platforms, ensuring stable, safe, and continuous system operation.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Cải thiện sản phẩm:</strong> Phân tích hành vi người dùng để hiểu nhu cầu, nâng cao trải nghiệm người dùng và phát triển các tính năng mới phù hợp với thị trường Việt Nam.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Product improvement:</strong> Analyzing user behavior to understand needs, enhance user experience, and develop new features suitable for the Vietnamese market.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Giao tiếp và hỗ trợ:</strong> Gửi thông báo dịch vụ, cập nhật tính năng, phản hồi yêu cầu hỗ trợ khách hàng, xử lý khiếu nại và tranh chấp.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Communication and support:</strong> Sending service notifications, feature updates, responding to customer support requests, handling complaints and disputes.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Marketing:</strong> Quản lý và theo dõi hiệu quả các chiến dịch marketing, gửi email/SMS/Zalo notification đến người dùng đã đồng ý, đo lường tỷ lệ chuyển đổi và ROI.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Marketing:</strong> Managing and tracking marketing campaign effectiveness, sending email/SMS/Zalo notifications to consenting users, measuring conversion rates and ROI.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Đào tạo (founderai.biz):</strong> Quản lý tiến độ học tập của học viên, cấp chứng chỉ điện tử, theo dõi kết quả học tập, phân tích dữ liệu để cải thiện chất lượng khóa học.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Training (founderai.biz):</strong> Managing student learning progress, issuing electronic certificates, tracking learning results, analyzing data to improve course quality.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Phân tích thống kê:</strong> Sử dụng Google Analytics để phân tích lưu lượng truy cập, hành vi người dùng trên website.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Statistical analysis:</strong> Using Google Analytics to analyze website traffic and user behavior.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Bảo mật và giám sát:</strong> Phát hiện và ngăn chặn các hoạt động gian lận, lạm dụng hệ thống, tấn công mạng; đảm bảo tuân thủ các quy định pháp luật.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Security and monitoring:</strong> Detecting and preventing fraud, system abuse, and cyber attacks; ensuring compliance with legal regulations.
              </li>
            </ul>
          </section>

          {/* A.5. Tiết lộ dữ liệu cho bên thứ ba */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              4. Tiết lộ dữ liệu cho bên thứ ba
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              4. Data Disclosure to Third Parties
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO cam kết không tiết lộ dữ liệu cá nhân của Người dùng mà không có sự chấp thuận của Khách hàng. Việc tiết lộ chỉ được thực hiện trong các trường hợp đặc biệt theo quy định dưới đây:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO commits not to disclose Users' personal data without Customer's approval. Disclosure is only made in special cases as follows:
            </p>

            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              4.1. Nhà cung cấp dịch vụ
            </h3>
            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              4.1. Service Providers
            </h3>
            <p className={`text-slate-700 mb-3 ${lc(language, 'vi')}`}>
              DIGISO sử dụng các nhà cung cấp bên thứ ba để vận hành hạ tầng và dịch vụ:
            </p>
            <p className={`text-slate-700 mb-3 ${lc(language, 'en')}`}>
              DIGISO uses third-party service providers to operate infrastructure and services:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-1 mb-4">
              <li className={lc(language, 'vi')}>Google Cloud Platform (GCP): Lưu trữ dữ liệu tại Singapore, cung cấp các dịch vụ điện toán đám mây</li>
              <li className={lc(language, 'en')}>Google Cloud Platform (GCP): Data storage in Singapore, providing cloud computing services</li>
              <li className={lc(language, 'vi')}>Microsoft Azure: Các dịch vụ xác thực và quản lý identity</li>
              <li className={lc(language, 'en')}>Microsoft Azure: Authentication and identity management services</li>
              <li className={lc(language, 'vi')}>Twilio SendGrid: Dịch vụ gửi email thông báo và chiến dịch email marketing</li>
              <li className={lc(language, 'en')}>Twilio SendGrid: Email notification and marketing campaign services</li>
              <li className={lc(language, 'vi')}>FPT Smart Cloud: Máy chủ đặt tại Việt Nam, cung cấp hạ tầng nội địa</li>
              <li className={lc(language, 'en')}>FPT Smart Cloud: Servers located in Vietnam, providing domestic infrastructure</li>
              <li className={lc(language, 'vi')}>PayOS: Cổng thanh toán và hóa đơn điện tử (Mắt Bão e-Invoice)</li>
              <li className={lc(language, 'en')}>PayOS: Payment gateway and e-invoice (Mat Bao e-Invoice)</li>
            </ul>
            <p className={`text-slate-700 text-sm italic mb-4 ${lc(language, 'vi')}`}>
              Các nhà cung cấp này chỉ tiếp cận dữ liệu đã được mã hóa hoặc ẩn danh, trong phạm vi tối thiểu cần thiết để thực hiện dịch vụ.
            </p>
            <p className={`text-slate-700 text-sm italic mb-4 ${lc(language, 'en')}`}>
              These providers only access encrypted or anonymized data, within the minimum scope necessary to perform the service.
            </p>

            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              4.2. Người dùng nội bộ cùng hệ thống
            </h3>
            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              4.2. Internal System Users
            </h3>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Quản trị viên trong tổ chức của Khách hàng có thể truy cập một số dữ liệu cơ bản của Người dùng theo phân quyền đã thiết lập. DIGISO không chịu trách nhiệm về quyết định truy cập của Khách hàng.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              Administrators within the Customer's organization may access some basic User data according to established permissions. DIGISO is not responsible for the Customer's access decisions.
            </p>

            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              4.3. Cơ quan nhà nước có thẩm quyền
            </h3>
            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              4.3. Competent State Authorities
            </h3>
            <p className={`text-slate-700 ${lc(language, 'vi')}`}>
              Khi có quyết định, yêu cầu bằng văn bản từ cơ quan tố tụng hoặc cơ quan nhà nước có thẩm quyền theo quy định của pháp luật Việt Nam.
            </p>
            <p className={`text-slate-700 ${lc(language, 'en')}`}>
              When there is a written decision or request from investigative authorities or competent state agencies under Vietnamese law.
            </p>
          </section>

          {/* A.6. Quyền và nghĩa vụ của chủ thể dữ liệu */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              5. Quyền và nghĩa vụ của chủ thể dữ liệu
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              5. Data Subject Rights and Obligations
            </h2>

            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              5.1. Quyền của chủ thể dữ liệu
            </h3>
            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              5.1. Data Subject Rights
            </h3>
            <p className={`text-slate-700 mb-3 ${lc(language, 'vi')}`}>
              Theo quy định của Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15, chủ thể dữ liệu có các quyền sau:
            </p>
            <p className={`text-slate-700 mb-3 ${lc(language, 'en')}`}>
              Under Law 91/2025/QH15 on Personal Data Protection, data subjects have the following rights:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-1">
              <li className={lc(language, 'vi')}>Quyền được biết: Được biết về hoạt động xử lý dữ liệu cá nhân của mình</li>
              <li className={lc(language, 'en')}>Right to be informed: Know about personal data processing activities</li>
              <li className={lc(language, 'vi')}>Quyền đồng ý hoặc không đồng ý: Đồng ý hoặc không đồng ý cho phép xử lý dữ liệu cá nhân</li>
              <li className={lc(language, 'en')}>Right to consent or refuse: Consent or refuse to allow personal data processing</li>
              <li className={lc(language, 'vi')}>Quyền truy cập: Được xem, chỉnh sửa dữ liệu cá nhân của mình</li>
              <li className={lc(language, 'en')}>Right to access: View and edit personal data</li>
              <li className={lc(language, 'vi')}>Quyền rút lại sự đồng ý: Rút lại sự đồng ý bất kỳ lúc nào</li>
              <li className={lc(language, 'en')}>Right to withdraw consent: Withdraw consent at any time</li>
              <li className={lc(language, 'vi')}>Quyền xóa dữ liệu: Yêu cầu xóa dữ liệu cá nhân trong các trường hợp pháp luật cho phép</li>
              <li className={lc(language, 'en')}>Right to erasure: Request deletion of personal data in legally permitted cases</li>
              <li className={lc(language, 'vi')}>Quyền hạn chế xử lý: Yêu cầu tạm ngừng một phần hoặc toàn bộ việc xử lý dữ liệu</li>
              <li className={lc(language, 'en')}>Right to restrict processing: Request partial or full suspension of data processing</li>
              <li className={lc(language, 'vi')}>Quyền phản đối: Phản đối việc xử lý dữ liệu cho mục đích marketing</li>
              <li className={lc(language, 'en')}>Right to object: Object to data processing for marketing purposes</li>
              <li className={lc(language, 'vi')}>Quyền yêu cầu cung cấp dữ liệu: Yêu cầu DIGISO cung cấp dữ liệu của mình</li>
              <li className={lc(language, 'en')}>Right to data portability: Request DIGISO to provide their data</li>
              <li className={lc(language, 'vi')}>Quyền bồi thường: Yêu cầu bồi thường khi có thiệt hại do vi phạm</li>
              <li className={lc(language, 'en')}>Right to compensation: Request compensation for damages caused by violations</li>
              <li className={lc(language, 'vi')}>Quyền khiếu nại, tố cáo, khởi kiện: Khiếu nại, tố cáo hoặc khởi kiện về hành vi vi phạm</li>
              <li className={lc(language, 'en')}>Right to complain, denounce, or sue: File complaints, denouncements, or lawsuits about violations</li>
            </ul>
            <p className={`text-slate-700 text-sm italic mt-4 mb-3 ${lc(language, 'vi')}`}>
              <strong>Thực thi quyền:</strong> Để thực hiện quyền của mình, chủ thể dữ liệu vui lòng liên hệ trực tiếp với Khách hàng (Bên kiểm soát dữ liệu) — đơn vị đã ủy quyền cho DIGISO xử lý dữ liệu. Mọi yêu cầu gửi trực tiếp về DIGISO sẽ được chuyển tiếp đến Khách hàng tương ứng để xử lý.
            </p>
            <p className={`text-slate-700 text-sm italic mt-4 mb-3 ${lc(language, 'en')}`}>
              <strong>Exercising rights:</strong> To exercise your rights, please contact the Customer (Data Controller) directly — the entity that has authorized DIGISO to process data. Any requests sent directly to DIGISO will be forwarded to the relevant Customer for handling.
            </p>
            <p className={`text-slate-700 text-sm italic ${lc(language, 'vi')}`}>
              Rút lại đồng ý tiếp thị cho khách hàng tiềm năng (lead): Chủ thể dữ liệu có quyền yêu cầu rút lại đồng ý tiếp thị bất kỳ lúc nào qua liên kết hủy nhận tin trong mỗi thông điệp tiếp thị.
            </p>
            <p className={`text-slate-700 text-sm italic ${lc(language, 'en')}`}>
              Withdrawing marketing consent for leads: Data subjects have the right to withdraw marketing consent at any time via the unsubscribe link in each marketing message.
            </p>

            <h3 className={`text-base font-semibold text-slate-800 mb-2 mt-4 ${lc(language, 'vi')}`}>
              5.2. Nghĩa vụ của chủ thể dữ liệu
            </h3>
            <h3 className={`text-base font-semibold text-slate-800 mb-2 mt-4 ${lc(language, 'en')}`}>
              5.2. Data Subject Obligations
            </h3>
            <ul className="list-disc pl-6 text-slate-700 space-y-1">
              <li className={lc(language, 'vi')}>Trách nhiệm về thông tin: Tự chịu trách nhiệm về tính đúng đắn, chính xác của thông tin đã cung cấp cho Bên kiểm soát</li>
              <li className={lc(language, 'en')}>Information responsibility: Responsible for the accuracy of information provided to the Controller</li>
              <li className={lc(language, 'vi')}>Tuân thủ quy định: Tuân thủ các quy định bảo vệ dữ liệu của Bên kiểm soát và Bên xử lý</li>
              <li className={lc(language, 'en')}>Compliance: Comply with data protection regulations of the Controller and Processor</li>
              <li className={lc(language, 'vi')}>Thông báo vi phạm: Kịp thời thông báo cho Bên kiểm soát khi phát hiện dấu hiệu vi phạm bảo mật dữ liệu</li>
              <li className={lc(language, 'en')}>Report violations: Promptly notify the Controller when detecting data security breaches</li>
              <li className={lc(language, 'vi')}>Bảo mật tài khoản: Bảo mật thông tin đăng nhập, mật khẩu và không chia sẻ cho người khác</li>
              <li className={lc(language, 'en')}>Account security: Keep login information and passwords confidential</li>
            </ul>
          </section>

          {/* A.7. Bảo vệ dữ liệu */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              6. Bảo vệ dữ liệu
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              6. Data Protection
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO áp dụng các biện pháp kỹ thuật và tổ chức tiên tiến để bảo vệ dữ liệu cá nhân:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO applies advanced technical and organizational measures to protect personal data:
            </p>

            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              6.1. Mã hóa dữ liệu
            </h3>
            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              6.1. Data Encryption
            </h3>
            <ul className="list-disc pl-6 text-slate-700 space-y-1 mb-4">
              <li className={lc(language, 'vi')}>Mã hóa dữ liệu tại tầng vật lý (encrypt-at-rest) sử dụng AES-256</li>
              <li className={lc(language, 'en')}>Data encryption at rest (encrypt-at-rest) using AES-256</li>
              <li className={lc(language, 'vi')}>Mã hóa dữ liệu tại tầng truyền tải (encrypt-in-transit) sử dụng HTTPS SSL/TLS</li>
              <li className={lc(language, 'en')}>Data encryption in transit (encrypt-in-transit) using HTTPS SSL/TLS</li>
              <li className={lc(language, 'vi')}>Mã hóa các bản sao lưu (backup encryption)</li>
              <li className={lc(language, 'en')}>Encrypted backups</li>
            </ul>

            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              6.2. Hạ tầng đám mây
            </h3>
            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              6.2. Cloud Infrastructure
            </h3>
            <ul className="list-disc pl-6 text-slate-700 space-y-1 mb-4">
              <li className={lc(language, 'vi')}>Google Cloud Platform (GCP Singapore): Hạ tầng cloud toàn cầu với tính năng bảo mật nâng cao</li>
              <li className={lc(language, 'en')}>Google Cloud Platform (GCP Singapore): Global cloud infrastructure with advanced security features</li>
              <li className={lc(language, 'vi')}>FPT Smart Cloud: Máy chủ đặt tại Việt Nam, đáp ứng yêu cầu lưu trữ dữ liệu trong nước</li>
              <li className={lc(language, 'en')}>FPT Smart Cloud: Servers in Vietnam, meeting domestic data storage requirements</li>
            </ul>

            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              6.3. Xác thực và kiểm soát truy cập
            </h3>
            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              6.3. Authentication and Access Control
            </h3>
            <ul className="list-disc pl-6 text-slate-700 space-y-1 mb-4">
              <li className={lc(language, 'vi')}>Xác thực 2 yếu tố (2FA) cho tài khoản quản trị</li>
              <li className={lc(language, 'en')}>Two-factor authentication (2FA) for admin accounts</li>
              <li className={lc(language, 'vi')}>Kiểm soát truy cập theo địa chỉ IP (IP whitelist)</li>
              <li className={lc(language, 'en')}>IP-based access control (IP whitelist)</li>
              <li className={lc(language, 'vi')}>Single Sign-On (SSO) qua SAML 2.0 cho doanh nghiệp</li>
              <li className={lc(language, 'en')}>Single Sign-On (SSO) via SAML 2.0 for enterprise</li>
              <li className={lc(language, 'vi')}>Phân quyền theo vai trò (Role-Based Access Control)</li>
              <li className={lc(language, 'en')}>Role-Based Access Control (RBAC)</li>
            </ul>

            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              6.4. Giám sát và sao lưu
            </h3>
            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              6.4. Monitoring and Backup
            </h3>
            <ul className="list-disc pl-6 text-slate-700 space-y-1">
              <li className={lc(language, 'vi')}>Giám sát bảo mật liên tục 24/7</li>
              <li className={lc(language, 'en')}>24/7 continuous security monitoring</li>
              <li className={lc(language, 'vi')}>Sao lưu dữ liệu định kỳ hàng ngày</li>
              <li className={lc(language, 'en')}>Daily periodic data backups</li>
              <li className={lc(language, 'vi')}>Kiểm thử xâm nhập định kỳ (penetration testing)</li>
              <li className={lc(language, 'en')}>Periodic penetration testing</li>
              <li className={lc(language, 'vi')}>Cập nhật bản vá bảo mật kịp thời</li>
              <li className={lc(language, 'en')}>Timely security patch updates</li>
            </ul>
            <p className={`text-slate-700 text-sm italic mt-4 ${lc(language, 'vi')}`}>
              Khi phát hiện sự cố bảo mật, DIGISO sẽ thông báo cho chủ thể dữ liệu và trình báo cơ quan chức năng trong thời gian sớm nhất theo quy định của Luật Bảo vệ dữ liệu cá nhân.
            </p>
            <p className={`text-slate-700 text-sm italic mt-4 ${lc(language, 'en')}`}>
              When a security incident is detected, DIGISO will notify data subjects and report to authorities as soon as possible under the Personal Data Protection Law.
            </p>
          </section>

          {/* A.8. Lưu trữ & Chuyển dữ liệu */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              7. Lưu trữ & Chuyển dữ liệu
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              7. Storage & Data Transfer
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Dữ liệu cá nhân chỉ được lưu trữ trong thời gian tài khoản còn hoạt động hoặc trong thời gian cần thiết theo mục đích thu thập ban đầu và quy định pháp luật. DIGISO không sở hữu dữ liệu của Khách hàng và Người dùng — dữ liệu này thuộc về Khách hàng.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              Personal data is stored only for the duration of account activity or for the time necessary according to the original collection purpose and legal requirements. DIGISO does not own Customer and User data — this data belongs to the Customer.
            </p>

            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              7.1. Thời gian lưu trữ
            </h3>
            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              7.1. Retention Period
            </h3>
            <ul className="list-disc pl-6 text-slate-700 space-y-1 mb-4">
              <li className={lc(language, 'vi')}>Khách hàng do người dùng đưa vào: Lưu trữ trong thời gian tài khoản còn hoạt động và tối đa 90 ngày sau khi tài khoản người dùng chấm dứt để hỗ trợ trích xuất dữ liệu trước khi xóa an toàn vĩnh viễn.</li>
              <li className={lc(language, 'en')}>Customer-managed users: Stored during account activity and up to 90 days after account termination to support data export before permanent secure deletion.</li>
              <li className={lc(language, 'vi')}>Khách hàng tiềm năng (lead) từ trang đích: Lưu trữ trong vòng 24 tháng kể từ lần tương tác cuối cùng.</li>
              <li className={lc(language, 'en')}>Leads from landing pages: Stored for 24 months from the last interaction.</li>
              <li className={lc(language, 'vi')}>Lịch sử gửi chiến dịch (email, tin nhắn, thông báo): Lưu trữ trong vòng 24 tháng phục vụ đối soát, thống kê và báo cáo hiệu quả.</li>
              <li className={lc(language, 'en')}>Campaign sending history (email, SMS, notifications): Stored for 24 months for reconciliation and effectiveness reporting.</li>
              <li className={lc(language, 'vi')}>Dữ liệu giao dịch và chứng từ liên quan: Lưu trữ tối thiểu theo thời hạn quy định của pháp luật kế toán và thuế.</li>
              <li className={lc(language, 'en')}>Transaction data and related documents: Stored at minimum per accounting and tax law requirements.</li>
            </ul>

            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              7.2. Địa điểm lưu trữ
            </h3>
            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              7.2. Storage Location
            </h3>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Dữ liệu được lưu trữ tại GCP Singapore và máy chủ đặt tại Việt Nam (FPT Smart Cloud) theo cơ chế backup.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              Data is stored at GCP Singapore and servers in Vietnam (FPT Smart Cloud) under a backup mechanism.
            </p>

            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              7.3. Chuyển dữ liệu xuyên biên giới
            </h3>
            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              7.3. Cross-border Data Transfer
            </h3>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Khi có chuyển dữ liệu ra nước ngoài, DIGISO đảm bảo tuân thủ đầy đủ quy định pháp luật Việt Nam về chuyển dữ liệu cá nhân ra nước ngoài, bao gồm đánh giá tác động và các thủ tục cần thiết theo Luật 91/2025/QH15 và Nghị định 356/2025/NĐ-CP.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              When transferring data abroad, DIGISO ensures full compliance with Vietnamese law on cross-border personal data transfer, including impact assessment and necessary procedures under Law 91/2025/QH15 and Decree 356/2025/NĐ-CP.
            </p>

            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              7.4. Xóa dữ liệu
            </h3>
            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              7.4. Data Deletion
            </h3>
            <p className={`text-slate-700 ${lc(language, 'vi')}`}>
              Sau khi hết thời hạn lưu trữ hoặc theo yêu cầu của Khách hàng, dữ liệu sẽ được xóa an toàn không thể phục hồi hoặc ẩn danh hóa theo tiêu chuẩn.
            </p>
            <p className={`text-slate-700 ${lc(language, 'en')}`}>
              After the retention period expires or upon Customer's request, data will be securely and irreversibly deleted or anonymized according to standards.
            </p>
          </section>

          {/* A.9. Cập nhật chính sách */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              8. Cập nhật chính sách — Phần A
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              8. Policy Updates — Part A
            </h2>
            <p className={`text-slate-700 ${lc(language, 'vi')}`}>
              DIGISO sẽ cập nhật Chính sách này định kỳ hoặc khi có thay đổi về quy định pháp luật, công nghệ hoặc hoạt động kinh doanh. Mọi thay đổi quan trọng sẽ được thông báo qua email hoặc thông báo nổi bật trên website ít nhất 15 ngày trước khi có hiệu lực. Trong trường hợp Người dùng không đồng ý với các sửa đổi, Người dùng có quyền ngừng sử dụng dịch vụ, yêu cầu đóng tài khoản và rút lại sự đồng ý cho phép xử lý dữ liệu.
            </p>
            <p className={`text-slate-700 ${lc(language, 'en')}`}>
              DIGISO will update this Policy periodically or when there are changes in legal regulations, technology, or business operations. Significant changes will be notified via email or prominent notices on the website at least 15 days before taking effect. If Users disagree with amendments, they may stop using the service, request account closure, and withdraw consent for data processing.
            </p>
          </section>

          {/* ===== PHẦN B: BÊN KIỂM SOÁT DỮ LIỆU ===== */}

          {/* B.1. Lời nói đầu */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              Phần B — Chính sách xử lý dữ liệu cá nhân: Bên kiểm soát dữ liệu
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              Part B — Personal Data Processing Policy: Data Controller
            </h2>

            <h3 className={`text-lg font-semibold text-orange-600 mb-3 ${lc(language, 'vi')}`}>
              Lời nói đầu
            </h3>
            <h3 className={`text-lg font-semibold text-orange-600 mb-3 ${lc(language, 'en')}`}>
              Preamble
            </h3>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Chính sách xử lý dữ liệu cá nhân – Bên kiểm soát dữ liệu này quy định mục đích và phương tiện mà Công ty TNHH Giải pháp số DIGISO sử dụng để xử lý dữ liệu cá nhân với tư cách Bên kiểm soát và xử lý dữ liệu cá nhân, thông qua các website founderai.biz và các kênh giao tiếp liên quan. DIGISO là <strong>Bên kiểm soát và xử lý dữ liệu cá nhân</strong> khi trực tiếp thu thập và xử lý dữ liệu từ người dùng mà không thông qua Khách hàng (bên kiểm soát).
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              Personal Data Processing Policy – Data Controller governs the purposes and means that DIGISO Digital Solutions Co., Ltd. uses to process personal data as the Personal Data Controller and Processor, through founderai.biz websites and related communication channels. DIGISO is the <strong>Personal Data Controller and Processor</strong> when directly collecting and processing data from users without going through a Customer (controller).
            </p>
            <p className={`text-slate-700 ${lc(language, 'vi')}`}>
              Nếu bạn là người dùng của Khách hàng đã ký hợp đồng với DIGISO, vui lòng tham khảo Phần A để biết cách DIGISO xử lý dữ liệu thay mặt cho Khách hàng của bạn.
            </p>
            <p className={`text-slate-700 ${lc(language, 'en')}`}>
              If you are a user of a Customer who has signed a contract with DIGISO, please refer to Part A for how DIGISO processes data on behalf of your Customer.
            </p>
          </section>

          {/* B.2. Dữ liệu DIGISO thu thập & xử lý */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              1. Dữ liệu DIGISO thu thập & xử lý
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              1. Data Collected & Processed by DIGISO
            </h2>

            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              1.1. Dữ liệu cá nhân cơ bản
            </h3>
            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              1.1. Basic Personal Data
            </h3>
            <ul className="list-disc pl-6 text-slate-700 space-y-1 mb-4">
              <li className={lc(language, 'vi')}>Thông tin nhân thân: Họ tên đầy đủ, ngày tháng năm sinh, giới tính, quốc tịch, dân tộc, nơi ở, địa chỉ thường trú, địa chỉ tạm trú</li>
              <li className={lc(language, 'en')}>Personal information: Full name, date of birth, gender, nationality, ethnicity, place of residence, permanent address, temporary address</li>
              <li className={lc(language, 'vi')}>Thông tin liên lạc: Số điện thoại di động, địa chỉ email, địa chỉ liên hệ, địa chỉ giao hàng (nếu có)</li>
              <li className={lc(language, 'en')}>Contact information: Mobile phone, email address, contact address, delivery address (if any)</li>
              <li className={lc(language, 'vi')}>Giấy tờ tùy thân: Hình ảnh cá nhân, số CMND/CCCD, số hộ chiếu, số giấy phép lái xe (GPLX), số mã số thuế, số BHXH, số tài khoản ngân hàng</li>
              <li className={lc(language, 'en')}>Identity documents: Personal photos, ID card/Citizen ID number, passport number, driver license number, tax ID, social insurance number, bank account number</li>
              <li className={lc(language, 'vi')}>Thông tin tài khoản: Thông tin tài khoản người dùng trên nền tảng, lịch sử hoạt động trực tuyến, địa chỉ IP, cookie, tùy chọn ngôn ngữ</li>
              <li className={lc(language, 'en')}>Account information: Platform user account, online activity history, IP address, cookies, language preferences</li>
              <li className={lc(language, 'vi')}>Dữ liệu học tập (founderai.biz): Tiến độ khóa học, kết quả kiểm tra, bài tập, chứng chỉ hoàn thành, lịch sử học tập</li>
              <li className={lc(language, 'en')}>Learning data (founderai.biz): Course progress, test results, assignments, completion certificates, learning history</li>
              <li className={lc(language, 'vi')}>Dữ liệu chiến dịch marketing: Thông tin đăng ký sự kiện, phản hồi chiến dịch, lịch sử tương tác với email, SMS, Zalo</li>
              <li className={lc(language, 'en')}>Marketing campaign data: Event registration info, campaign responses, interaction history with email, SMS, Zalo</li>
              <li className={lc(language, 'vi')}>Dữ liệu biểu mẫu liên hệ: Họ tên, địa chỉ email, số điện thoại, tên doanh nghiệp, nội dung yêu cầu và địa chỉ IP tại thời điểm gửi biểu mẫu</li>
              <li className={lc(language, 'en')}>Contact form data: Name, email, phone, business name, request content, and IP address at time of submission</li>
            </ul>

            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              1.2. Dữ liệu cá nhân nhạy cảm (có sự đồng ý)
            </h3>
            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              1.2. Sensitive Personal Data (with consent)
            </h3>
            <ul className="list-disc pl-6 text-slate-700 space-y-1 mb-4">
              <li className={lc(language, 'vi')}>Thông tin sinh trắc học: Dữ liệu vân tay, khuôn mặt (nếu sử dụng tính năng xác thực sinh trắc học)</li>
              <li className={lc(language, 'en')}>Biometric information: Fingerprint data, facial data (if using biometric authentication)</li>
              <li className={lc(language, 'vi')}>Dữ liệu vị trí: Thông tin vị trí địa lý từ dịch vụ định vị (nếu người dùng cho phép)</li>
              <li className={lc(language, 'en')}>Location data: Geographic location from positioning services (if user permits)</li>
            </ul>
            <p className={`text-slate-700 text-sm italic mb-4 ${lc(language, 'vi')}`}>
              <strong>Lưu ý:</strong> DIGISO tuyệt đối không thu thập dữ liệu liên quan đến tôn giáo, quan điểm chính trị, đời tư cá nhân không liên quan đến dịch vụ.
            </p>
            <p className={`text-slate-700 text-sm italic mb-4 ${lc(language, 'en')}`}>
              <strong>Note:</strong> DIGISO absolutely does not collect data related to religion, political opinions, or unrelated personal privacy matters.
            </p>

            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              1.3. Dữ liệu tiếp thị
            </h3>
            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              1.3. Marketing Data
            </h3>
            <ul className="list-disc pl-6 text-slate-700 space-y-1">
              <li className={lc(language, 'vi')}>Cookie và tracking: Dữ liệu cookie, clickstream, lịch sử duyệt web, hành vi trên website</li>
              <li className={lc(language, 'en')}>Cookies and tracking: Cookie data, clickstream, browsing history, website behavior</li>
              <li className={lc(language, 'vi')}>Dữ liệu email marketing: Phản hồi với email marketing, tỷ lệ mở email, tỷ lệ nhấp liên kết, lựa chọn hủy đăng ký</li>
              <li className={lc(language, 'en')}>Email marketing data: Email marketing responses, open rates, click-through rates, unsubscriptions</li>
              <li className={lc(language, 'vi')}>Phân tích: Thông tin từ Google Analytics và các công cụ phân tích khác</li>
              <li className={lc(language, 'en')}>Analytics: Information from Google Analytics and other analytics tools</li>
            </ul>
          </section>

          {/* B.3. Cách thức thu thập dữ liệu */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              2. Cách thức thu thập dữ liệu
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              2. Methods of Data Collection
            </h2>
            <ul className="list-disc pl-6 text-slate-700 space-y-2">
              <li className={lc(language, 'vi')}>
                <strong>Giao kết hợp đồng:</strong> Khi ký kết hợp đồng cung cấp dịch vụ với DIGISO, khách hàng cung cấp: tên công ty, địa chỉ, mã số thuế, thông tin người đại diện, email, số điện thoại, thông tin tài khoản ngân hàng.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Contract execution:</strong> When signing a service contract with DIGISO, customers provide: company name, address, tax ID, representative information, email, phone, bank account details.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Đăng ký dịch vụ:</strong> Thông tin cung cấp khi đăng ký tài khoản trên founderai.biz, bao gồm thông tin cá nhân, thông tin công ty, thông tin thanh toán.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Service registration:</strong> Information provided when registering an account on founderai.biz, including personal information, company information, payment information.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Điền form trên website:</strong> Thông tin cung cấp khi điền các biểu mẫu trên website như form liên hệ, form đăng ký tư vấn, form tham gia sự kiện, webinar.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Filling forms on website:</strong> Information provided when filling forms on the website such as contact forms, consultation registration, event registration, webinar registration.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Tự động thu thập:</strong> Cookie, địa chỉ IP, thông tin thiết bị, lịch sử truy cập website và dữ liệu thống kê lượt xem trang đích.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Automatic collection:</strong> Cookies, IP address, device information, website access history, and landing page view statistics.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Dịch vụ tích hợp bên thứ ba:</strong> Google, Apple ID khi đăng nhập qua tài khoản bên thứ ba.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Third-party integrated services:</strong> Google, Apple ID when logging in via third-party accounts.
              </li>
            </ul>
          </section>

          {/* B.4. Mục đích xử lý dữ liệu */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              3. Mục đích xử lý dữ liệu
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              3. Data Processing Purposes
            </h2>
            <ul className="list-disc pl-6 text-slate-700 space-y-2">
              <li className={lc(language, 'vi')}>
                <strong>Vận hành dịch vụ:</strong> Cung cấp và duy trì đầy đủ tính năng của các nền tảng digiso.vn, founderai.biz.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Service operation:</strong> Providing and maintaining full features of digiso.vn and founderai.biz platforms.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Cải thiện sản phẩm:</strong> Phân tích xu hướng sử dụng, nghiên cứu hành vi người dùng, phát triển tính năng mới.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Product improvement:</strong> Analyzing usage trends, studying user behavior, developing new features.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Giao tiếp và thông báo:</strong> Gửi thông báo dịch vụ, cập nhật tính năng, thông tin quan trọng về tài khoản; gửi email marketing (chỉ khi có sự đồng ý rõ ràng).
              </li>
              <li className={lc(language, 'en')}>
                <strong>Communication and notifications:</strong> Sending service notifications, feature updates, important account information; sending marketing emails (only with explicit consent).
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Dịch vụ Marketing:</strong> Quản lý, đo lường và tối ưu hóa chiến dịch quảng cáo; gửi email, SMS, Zalo notification.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Marketing services:</strong> Managing, measuring, and optimizing advertising campaigns; sending email, SMS, Zalo notifications.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Đào tạo (founderai.biz):</strong> Quản lý học viên và tiến độ học tập; cấp chứng chỉ điện tử.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Training (founderai.biz):</strong> Managing students and learning progress; issuing electronic certificates.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Tuân thủ pháp lý:</strong> Theo yêu cầu của cơ quan có thẩm quyền, quy định pháp luật về thuế, kế toán.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Legal compliance:</strong> Upon request from authorities, tax and accounting legal requirements.
              </li>
            </ul>
          </section>

          {/* B.5. Tiết lộ dữ liệu */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              4. Tiết lộ dữ liệu
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              4. Data Disclosure
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO cam kết không tiết lộ dữ liệu cá nhân khi không có sự chấp thuận của chủ thể dữ liệu, ngoại trừ các trường hợp đặc biệt theo quy định pháp luật:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO commits not to disclose personal data without the data subject's approval, except in special cases provided by law:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2">
              <li className={lc(language, 'vi')}>
                <strong>Nhà cung cấp dịch vụ:</strong> Google (GCP), Microsoft Azure, Twilio SendGrid, FPT Smart Cloud, PayOS — chỉ tiếp cập trong phạm vi tối thiểu cần thiết.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Service providers:</strong> Google (GCP), Microsoft Azure, Twilio SendGrid, FPT Smart Cloud, PayOS — only accessed within minimum necessary scope.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Dữ liệu tổng hợp và ẩn danh:</strong> DIGISO có thể chia sẻ cho bên thứ ba phục vụ báo cáo, nghiên cứu thị trường. Dữ liệu này không thể nhận dạng cá nhân cụ thể.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Aggregated and anonymized data:</strong> May be shared with third parties for reporting and market research. This data cannot identify specific individuals.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Yêu cầu pháp lý:</strong> Theo lệnh tòa án, yêu cầu từ cơ quan nhà nước có thẩm quyền.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Legal requests:</strong> By court order, requests from competent state agencies.
              </li>
            </ul>
          </section>

          {/* B.6. Quyền và nghĩa vụ */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              5. Quyền và nghĩa vụ của chủ thể dữ liệu
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              5. Data Subject Rights and Obligations
            </h2>

            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              5.1. Quyền của chủ thể dữ liệu
            </h3>
            <h3 className={`text-base font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              5.1. Data Subject Rights
            </h3>
            <p className={`text-slate-700 mb-3 ${lc(language, 'vi')}`}>
              Theo quy định của Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15, bạn có các quyền sau:
            </p>
            <p className={`text-slate-700 mb-3 ${lc(language, 'en')}`}>
              Under Law 91/2025/QH15 on Personal Data Protection, you have the following rights:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-1">
              <li className={lc(language, 'vi')}>Quyền được biết, đồng ý, truy cập, chỉnh sửa, rút lại đồng ý, xóa dữ liệu, hạn chế xử lý, phản đối, cung cấp dữ liệu, bồi thường, khiếu nại/tố cáo/khởi kiện</li>
              <li className={lc(language, 'en')}>Rights to be informed, consent, access, correct, withdraw consent, erasure, restrict processing, object, data portability, compensation, complain/denounce/sue</li>
              <li className={lc(language, 'vi')}>Quyền hủy đăng ký email: Hủy nhận email marketing bất kỳ lúc nào qua link "Unsubscribe" trong mỗi email</li>
              <li className={lc(language, 'en')}>Right to unsubscribe: Unsubscribe from marketing emails at any time via the "Unsubscribe" link in each email</li>
            </ul>
            <p className={`text-slate-700 text-sm italic mt-4 ${lc(language, 'vi')}`}>
              Để thực thi các quyền, vui lòng liên hệ DIGISO qua email <strong>info@digiso.vn</strong> hoặc sử dụng các tính năng tự phục vụ trên website. DIGISO sẽ phản hồi trong thời gian sớm nhất theo quy định pháp luật.
            </p>
            <p className={`text-slate-700 text-sm italic mt-4 ${lc(language, 'en')}`}>
              To exercise your rights, please contact DIGISO via email <strong>info@digiso.vn</strong> or use self-service features on the website. DIGISO will respond as soon as possible under legal regulations.
            </p>

            <h3 className={`text-base font-semibold text-slate-800 mb-2 mt-4 ${lc(language, 'vi')}`}>
              5.2. Nghĩa vụ của chủ thể dữ liệu
            </h3>
            <h3 className={`text-base font-semibold text-slate-800 mb-2 mt-4 ${lc(language, 'en')}`}>
              5.2. Data Subject Obligations
            </h3>
            <ul className="list-disc pl-6 text-slate-700 space-y-1">
              <li className={lc(language, 'vi')}>Tự chịu trách nhiệm về tính chính xác, đầy đủ của thông tin đã cung cấp; thông báo ngay khi thông tin thay đổi</li>
              <li className={lc(language, 'en')}>Responsible for the accuracy and completeness of provided information; notify immediately when information changes</li>
              <li className={lc(language, 'vi')}>Tuân thủ các quy định bảo vệ dữ liệu cá nhân của DIGISO và pháp luật Việt Nam</li>
              <li className={lc(language, 'en')}>Comply with DIGISO's personal data protection regulations and Vietnamese law</li>
              <li className={lc(language, 'vi')}>Bảo mật thông tin đăng nhập, mật khẩu, không chia sẻ cho người khác, đăng xuất khi sử dụng thiết bị chung</li>
              <li className={lc(language, 'en')}>Keep login information and passwords confidential, log out when using shared devices</li>
              <li className={lc(language, 'vi')}>Thông báo kịp thời cho DIGISO khi phát hiện bất kỳ vi phạm bảo mật dữ liệu nào liên quan đến tài khoản</li>
              <li className={lc(language, 'en')}>Promptly notify DIGISO when detecting any data security breach related to the account</li>
            </ul>
          </section>

          {/* B.7. Bảo vệ dữ liệu */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              6. Bảo vệ dữ liệu
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              6. Data Protection
            </h2>
            <p className={`text-slate-700 mb-3 ${lc(language, 'vi')}`}>
              DIGISO áp dụng các biện pháp bảo vệ dữ liệu cá nhân tiên tiến và phù hợp với các tiêu chuẩn quốc tế:
            </p>
            <p className={`text-slate-700 mb-3 ${lc(language, 'en')}`}>
              DIGISO applies advanced personal data protection measures in line with international standards:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-1">
              <li className={lc(language, 'vi')}>Mã hóa SSL/TLS cho toàn bộ kết nối trên digiso.vn, founderai.biz</li>
              <li className={lc(language, 'en')}>SSL/TLS encryption for all connections on digiso.vn and founderai.biz</li>
              <li className={lc(language, 'vi')}>Mã hóa dữ liệu tại tầng vật lý (encrypt-at-rest) sử dụng AES-256</li>
              <li className={lc(language, 'en')}>Data encryption at rest (encrypt-at-rest) using AES-256</li>
              <li className={lc(language, 'vi')}>Phân quyền theo vai trò (RBAC), xác thực 2 lớp (2FA), SSO qua SAML 2.0, kiểm soát truy cập theo IP</li>
              <li className={lc(language, 'en')}>Role-Based Access Control (RBAC), two-factor authentication (2FA), SSO via SAML 2.0, IP-based access control</li>
              <li className={lc(language, 'vi')}>Giám sát bảo mật liên tục 24/7, sao lưu dữ liệu định kỳ hàng ngày, kiểm thử xâm nhập định kỳ</li>
              <li className={lc(language, 'en')}>24/7 continuous security monitoring, daily periodic backups, periodic penetration testing</li>
            </ul>
            <p className={`text-slate-700 text-sm italic mt-4 ${lc(language, 'vi')}`}>
              Khi xảy ra sự cố bảo mật, DIGISO sẽ thông báo tới chủ thể dữ liệu trong thời gian sớm nhất và phối hợp với cơ quan chức năng theo quy định của Luật Bảo vệ dữ liệu cá nhân.
            </p>
            <p className={`text-slate-700 text-sm italic mt-4 ${lc(language, 'en')}`}>
              In case of a security incident, DIGISO will notify data subjects as soon as possible and coordinate with authorities under the Personal Data Protection Law.
            </p>
          </section>

          {/* B.8. Lưu trữ & Chuyển dữ liệu */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              7. Lưu trữ & Chuyển dữ liệu
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              7. Storage & Data Transfer
            </h2>
            <ul className="list-disc pl-6 text-slate-700 space-y-2">
              <li className={lc(language, 'vi')}>
                <strong>Thống kê lượt xem trang đích:</strong> Lưu trữ trong 13 tháng.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Landing page view statistics:</strong> Stored for 13 months.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Dữ liệu biểu mẫu liên hệ:</strong> Lưu trữ trong 24 tháng kể từ ngày gửi.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Contact form data:</strong> Stored for 24 months from date of submission.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Chứng từ kế toán:</strong> Lưu trữ tối thiểu 10 năm theo quy định của Luật Kế toán và pháp luật thuế.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Accounting documents:</strong> Stored for a minimum of 10 years per accounting and tax law requirements.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Dữ liệu tài khoản người dùng:</strong> Lưu trữ trong suốt thời gian tài khoản hoạt động và được xóa hoặc ẩn danh hóa an toàn sau khi chấm dứt tài khoản.
              </li>
              <li className={lc(language, 'en')}>
                <strong>User account data:</strong> Stored throughout account activity and securely deleted or anonymized after account termination.
              </li>
            </ul>
            <p className={`text-slate-700 mt-4 ${lc(language, 'vi')}`}>
              Dữ liệu được lưu trữ tại Việt Nam (FPT Smart Cloud) và GCP Singapore theo cơ chế backup. Mọi chuyển dữ liệu ra nước ngoài đều tuân thủ đầy đủ quy định pháp luật Việt Nam, bao gồm đánh giá tác động và các thủ tục cần thiết theo Luật 91/2025/QH15 và Nghị định 356/2025/NĐ-CP.
            </p>
            <p className={`text-slate-700 mt-4 ${lc(language, 'en')}`}>
              Data is stored in Vietnam (FPT Smart Cloud) and GCP Singapore under a backup mechanism. All cross-border data transfers comply fully with Vietnamese law, including impact assessments and necessary procedures under Law 91/2025/QH15 and Decree 356/2025/NĐ-CP.
            </p>
          </section>

          {/* B.9. Cam kết của DIGISO */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              8. Cam kết của DIGISO
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              8. DIGISO's Commitments
            </h2>
            <ul className="list-disc pl-6 text-slate-700 space-y-2">
              <li className={lc(language, 'vi')}>
                <strong>Không thu thập dữ liệu nhạy cảm không liên quan:</strong> DIGISO tuyệt đối không thu thập dữ liệu cá nhân nhạy cảm liên quan đến tôn giáo, quan điểm chính trị, nguồn gốc sắc tộc, hoặc các thông tin riêng tư không liên quan đến dịch vụ.
              </li>
              <li className={lc(language, 'en')}>
                <strong>No unrelated sensitive data collection:</strong> DIGISO absolutely does not collect sensitive personal data related to religion, political opinions, ethnic origin, or unrelated personal privacy matters.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Không bán dữ liệu:</strong> DIGISO cam kết không bán, không chuyển nhượng dữ liệu cá nhân của người dùng cho bất kỳ bên thứ ba nào vì mục đích thương mại.
              </li>
              <li className={lc(language, 'en')}>
                <strong>No data selling:</strong> DIGISO commits not to sell or transfer users' personal data to any third party for commercial purposes.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Chỉ sử dụng đúng mục đích:</strong> DIGISO không sử dụng dữ liệu cá nhân cho các mục đích khác ngoài các mục đích đã được thông báo và có sự đồng ý.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Use only for stated purposes:</strong> DIGISO does not use personal data for purposes other than those notified and consented to.
              </li>
            </ul>
            <p className={`text-slate-700 text-sm italic mt-4 ${lc(language, 'vi')}`}>
              Nếu bạn phát hiện DIGISO đang xử lý dữ liệu ngoài phạm vi cho phép hoặc có bất kỳ lo ngại nào về việc bảo vệ dữ liệu cá nhân, vui lòng liên hệ ngay qua email <strong>info@digiso.vn</strong>.
            </p>
            <p className={`text-slate-700 text-sm italic mt-4 ${lc(language, 'en')}`}>
              If you discover DIGISO is processing data beyond the permitted scope or have any concerns about personal data protection, please contact us immediately at <strong>info@digiso.vn</strong>.
            </p>
          </section>

          {/* B.10. Cập nhật chính sách */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              9. Cập nhật chính sách — Phần B
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              9. Policy Updates — Part B
            </h2>
            <p className={`text-slate-700 ${lc(language, 'vi')}`}>
              DIGISO sẽ cập nhật Chính sách này định kỳ hoặc khi có thay đổi về quy định pháp luật, công nghệ hoặc hoạt động kinh doanh. Mọi thay đổi quan trọng sẽ được thông báo qua email hoặc thông báo nổi bật trên website ít nhất 15 ngày trước khi có hiệu lực. Trong trường hợp Người dùng không đồng ý với các sửa đổi, Người dùng có quyền ngừng sử dụng dịch vụ, yêu cầu đóng tài khoản và rút lại sự đồng ý cho phép xử lý dữ liệu.
            </p>
            <p className={`text-slate-700 ${lc(language, 'en')}`}>
              DIGISO will update this Policy periodically or when there are changes in legal regulations, technology, or business operations. Significant changes will be notified via email or prominent notices on the website at least 15 days before taking effect. If Users disagree with amendments, they may stop using the service, request account closure, and withdraw consent for data processing.
            </p>
          </section>

          {/* Contact Block */}
          <div className="mt-10 overflow-hidden rounded-2xl border border-slate-700/30 bg-gradient-to-b from-slate-900 to-slate-950 px-5 py-8 text-white shadow-xl sm:px-8 sm:py-10">
            <div className="mb-6 max-w-2xl">
              <h2 className={`text-lg font-bold tracking-tight text-white sm:text-xl ${lc(language, 'vi')}`}>
                Liên hệ về Dữ liệu Cá nhân
              </h2>
              <h2 className={`text-lg font-bold tracking-tight text-white sm:text-xl ${lc(language, 'en')}`}>
                Contact for Personal Data Matters
              </h2>
              <p className={`mt-2 text-[14px] leading-relaxed text-slate-300 ${lc(language, 'vi')}`}>
                Nếu bạn có câu hỏi hoặc yêu cầu liên quan đến Thỏa thuận Xử lý Dữ liệu Cá nhân này, vui lòng liên hệ:
              </p>
              <p className={`mt-2 text-[14px] leading-relaxed text-slate-300 ${lc(language, 'en')}`}>
                If you have questions or requests regarding this Personal Data Processing Agreement, please contact:
              </p>
            </div>
            {/* Grid tiếng Việt */}
            <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${lc(language, 'vi')}`}>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Công ty</div>
                <div className="break-words text-[13.5px] leading-snug text-slate-100">Công ty TNHH Giải pháp số DIGISO</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Email</div>
                <div className="break-words text-[13.5px]">
                  <a href="mailto:info@digiso.vn" className="text-orange-400 no-underline hover:underline">info@digiso.vn</a>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Website</div>
                <div className="break-words text-[13.5px] leading-relaxed text-slate-100">
                  <a href="https://digiso.vn" target="_blank" rel="noopener noreferrer" className="text-orange-400 no-underline hover:underline">digiso.vn</a>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Điện thoại</div>
                <div className="break-words text-[13.5px] text-slate-100">0877 909 606</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">MST</div>
                <div className="break-words text-[13.5px] text-slate-100">0316725362</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Địa chỉ</div>
                <div className="break-words text-[13.5px] text-slate-100 leading-relaxed">
                  Phòng I.101B Toà nhà A, Khu Công nghệ Phần mềm ĐH Quốc gia Tp.HCM, Đ. Võ Trường Toản, KP.33, P. Linh Xuân, TP.HCM
                </div>
              </div>
            </div>

            {/* Grid tiếng Anh */}
            <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${lc(language, 'en')}`}>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Company</div>
                <div className="break-words text-[13.5px] leading-snug text-slate-100">DIGISO Digital Solutions Co., Ltd.</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Email</div>
                <div className="break-words text-[13.5px]">
                  <a href="mailto:info@digiso.vn" className="text-orange-400 no-underline hover:underline">info@digiso.vn</a>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Website</div>
                <div className="break-words text-[13.5px] leading-relaxed text-slate-100">
                  <a href="https://digiso.vn" target="_blank" rel="noopener noreferrer" className="text-orange-400 no-underline hover:underline">digiso.vn</a>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Phone</div>
                <div className="break-words text-[13.5px] text-slate-100">0877 909 606</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Tax ID</div>
                <div className="break-words text-[13.5px] text-slate-100">0316725362</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Address</div>
                <div className="break-words text-[13.5px] text-slate-100 leading-relaxed">
                  Room I.101B, Building A, Software Technology Park, Vietnam National University HCMC
                </div>
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
          </p>
          <p className={lc(language, 'vi')}>
            Thỏa thuận này được cập nhật và có hiệu lực từ ngày 28/09/2026.
            Cập nhật theo Luật 91/2025/QH15 và Nghị định 356/2025/NĐ-CP.
          </p>
          <p className={lc(language, 'en')}>
            This agreement was last updated and effective from September 28, 2026.
            Updated per Law 91/2025/QH15 and Decree 356/2025/NĐ-CP.
          </p>
        </footer>
        <PolicyHistory language={language} lc={lc} entries={historyEntries} />
      </div>
    </div>
  );
}

export default PublicDPA;
