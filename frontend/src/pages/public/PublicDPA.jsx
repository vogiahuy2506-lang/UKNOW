import { useState } from 'react';

/**
 * Returns CSS class based on language selection.
 */
function getLangClass(activeLang, itemLang) {
  return activeLang === itemLang ? '' : 'hidden';
}

/**
 * Public Data Processing Agreement (Public DPA) page.
 * Content based on VNG/Zalo Public DPA template.
 * Applies to DIGISO platforms.
 *
 * @returns {JSX.Element} Public DPA page.
 */
function PublicDPA() {
  const [language, setLanguage] = useState('vi');
  const lc = getLangClass;

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
              Thoả Thuận <span className="text-orange-400">Xử Lý Dữ Liệu</span> Công Khai
            </h1>
            <h1
              className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'en')}`}
            >
              Public <span className="text-orange-400">Data Processing</span> Agreement
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
                Cập nhật: <strong>04 tháng 08 năm 2026</strong>
                {'\u00a0'}|{'\u00a0'}
                Áp dụng cho: digiso.vn, founderai.biz
              </span>
              <span className={lc(language, 'en')}>
                Last updated: <strong>August 04, 2026</strong>
                {'\u00a0'}|{'\u00a0'}
                Applies to: digiso.vn, founderai.biz
              </span>
            </p>
          </div>

          {/* Section 1: Introduction */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              1. Mở đầu
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              1. Introduction
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Thoả Thuận Xử Lý Dữ Liệu Cá Nhân Công Khai ("<strong>Thoả Thuận</strong>") điều chỉnh về những vấn đề liên quan tới hoạt động Xử Lý Dữ Liệu Cá Nhân giữa <strong>Công ty TNHH Giải pháp số DIGISO</strong> ("<strong>Chúng Tôi</strong>" hoặc "<strong>DIGISO</strong>") và tất cả đối tượng có thực hiện hoạt động xử lý Dữ Liệu Cá Nhân, là đối tượng điều chỉnh của <strong>Nghị Định 13/2023/NĐ-CP</strong> về Bảo vệ Dữ Liệu Cá Nhân đang sử dụng sản phẩm, dịch vụ của Công ty TNHH Giải pháp số DIGISO, bao gồm nhưng không giới hạn: Người Dùng, Khách hàng, Developer, Nhà Phát Triển,... (được gọi chung là "<strong>Bạn</strong>").
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              This Public Personal Data Processing Agreement ("<strong>Agreement</strong>") governs matters related to Personal Data Processing activities between <strong>DIGISO Digital Solutions Co., Ltd.</strong> ("<strong>We</strong>", "<strong>Us</strong>", or "<strong>DIGISO</strong>") and all parties who process Personal Data, subject to <strong>Decree 13/2023/ND-CP</strong> on Personal Data Protection using products and services of DIGISO Digital Solutions Co., Ltd., including but not limited to: Users, Customers, Developers, App Developers,... (collectively referred to as "<strong>You</strong>").
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Thoả Thuận này bổ sung cho, và là bộ phận không thể tách rời của các thoả thuận, quy định, quy chế, chính sách của DIGISO. Trong trường hợp có bất kỳ xung đột hoặc không nhất quán nào với các điều khoản liên quan tới hoạt động xử lý Dữ Liệu Cá Nhân với bất kỳ thoả thuận, quy định, quy chế, chính sách khác của DIGISO, Thoả Thuận này sẽ được ưu tiên áp dụng.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              This Agreement is a supplement to, and an integral part of, all agreements, regulations, and policies of DIGISO. In the event of any conflict or inconsistency with any terms related to Personal Data Processing activities with any other agreements, regulations, and policies of DIGISO, this Agreement shall take precedence.
            </p>
            <p className={`text-slate-700 ${lc(language, 'vi')}`}>
              DIGISO cam kết tuân thủ các quy định pháp luật về bảo vệ Dữ Liệu Cá Nhân, không thực hiện bất kỳ hoạt động xử lý dữ liệu cá nhân nào trái theo quy định pháp luật. Đồng thời, DIGISO bảo lưu quyền đơn phương được sửa đổi, bổ sung bất kỳ và toàn bộ nội dung của Thoả Thuận này tại bất kỳ thời điểm nào.
            </p>
            <p className={`text-slate-700 ${lc(language, 'en')}`}>
              DIGISO commits to comply with all legal regulations on Personal Data Protection, and will not process any personal data in violation of legal regulations. Additionally, DIGISO reserves the right to unilaterally amend, supplement any or all contents of this Agreement at any time.
            </p>
          </section>

          {/* Section 2: Definitions */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              2. Giải thích từ ngữ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              2. Definitions
            </h2>
            <ul className="pp-list text-slate-700 space-y-3">
              <li className={lc(language, 'vi')}>
                <strong>"Luật Bảo Vệ Dữ Liệu Cá Nhân"</strong>: Bộ Luật Dân sự năm 2015; Luật Bảo vệ quyền lợi người tiêu dùng 2010; Luật an toàn thông tin mạng 2015; Luật An ninh mạng 2018; <strong>Nghị định số 13/2023/NĐ-CP</strong>, và các văn bản sửa đổi, bổ sung hoặc hướng dẫn thi hành Luật Bảo Vệ Dữ Liệu Cá Nhân và các quy định pháp luật khác có liên quan.
              </li>
              <li className={lc(language, 'en')}>
                <strong>"Personal Data Protection Law"</strong>: Civil Code 2015; Consumer Protection Law 2010; Network Information Security Law 2015; Cybersecurity Law 2018; <strong>Decree No. 13/2023/ND-CP</strong>, and amendments, supplements, or implementing guidelines for the Personal Data Protection Law and other relevant legal regulations.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>"Dữ Liệu Cá Nhân"</strong>: Thông tin dưới dạng ký hiệu, chữ viết, chữ số, hình ảnh, âm thanh hoặc dạng tương tự trên môi trường điện tử gắn liền với một con người cụ thể hoặc giúp xác định một con người cụ thể theo quy định tại Luật Bảo Vệ Dữ Liệu Cá Nhân, Nghị Định 13/2023/NĐ-CP hoặc các quy định pháp luật khác có liên quan được cập nhật tùy thời điểm.
              </li>
              <li className={lc(language, 'en')}>
                <strong>"Personal Data"</strong>: Information in the form of symbols, writing, numbers, images, sounds, or similar forms on electronic media associated with a specific individual or enabling identification of a specific individual as defined under the Personal Data Protection Law, Decree 13/2023/ND-CP, or other relevant legal regulations updated from time to time.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>"Chủ Thể Dữ Liệu"</strong>: Cá nhân được Dữ Liệu Cá Nhân phản ánh.
              </li>
              <li className={lc(language, 'en')}>
                <strong>"Data Subject"</strong>: An individual whose Personal Data is reflected.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>"Xử Lý Dữ Liệu Cá Nhân"</strong>: Một hoặc nhiều hoạt động tác động tới Dữ Liệu Cá Nhân, như: thu thập, ghi, phân tích, xác nhận, lưu trữ, chỉnh sửa, công khai, kết hợp, truy cập, truy xuất, thu hồi, mã hóa, giải mã, sao chép, chia sẻ, truyền đưa, cung cấp, chuyển giao, xóa, hủy Dữ Liệu Cá Nhân hoặc các hành động khác có liên quan theo quy định tại Nghị Định 13 hoặc các quy định pháp luật khác có liên quan được cập nhật tùy thời điểm.
              </li>
              <li className={lc(language, 'en')}>
                <strong>"Personal Data Processing"</strong>: One or more activities affecting Personal Data, such as: collection, recording, analysis, confirmation, storage, modification, disclosure, combination, access, retrieval, withdrawal, encryption, decryption, copying, sharing, transmission, provision, transfer, deletion, or destruction of Personal Data, or other related actions as defined under Decree 13 or other relevant legal regulations updated from time to time.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>"Bên Kiểm Soát và Xử Lý Dữ Liệu Cá Nhân"</strong>: Bên quyết định mục đích và phương tiện xử lý Dữ Liệu Cá Nhân.
              </li>
              <li className={lc(language, 'en')}>
                <strong>"Personal Data Controller and Processor"</strong>: The party that decides the purposes and means of processing Personal Data.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>"Bên Xử Lý Dữ Liệu Cá Nhân"</strong>: Tổ chức, cá nhân thực hiện việc xử lý dữ liệu thay mặt cho Bên Kiểm soát dữ liệu, thông qua một hợp đồng hoặc thoả thuận.
              </li>
              <li className={lc(language, 'en')}>
                <strong>"Personal Data Processor"</strong>: Organization or individual that processes data on behalf of the Data Controller, through a contract or agreement.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>"Cơ Quan Chuyên Trách Bảo Vệ Dữ Liệu Cá Nhân"</strong>: Cục An ninh mạng và Phòng, chống tội phạm sử dụng công nghệ cao - Bộ Công An hoặc cơ quan khác có trách nhiệm quản lý nhà nước về bảo vệ Dữ Liệu Cá Nhân theo quy định của pháp luật.
              </li>
              <li className={lc(language, 'en')}>
                <strong>"Personal Data Protection Authority"</strong>: The Cybersecurity and High-tech Crime Prevention Department - Ministry of Public Security, or other competent state authorities responsible for personal data protection under legal regulations.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>"Nền Tảng"</strong>: Tất cả các sản phẩm, dịch vụ thuộc DIGISO, bao gồm nhưng không giới hạn phần mềm và các sản phẩm, dịch vụ yêu cầu sử dụng Tài khoản trên digiso.vn, founderai.biz.
              </li>
              <li className={lc(language, 'en')}>
                <strong>"Platform"</strong>: All products and services of DIGISO, including but not limited to software and products, services requiring Account usage on digiso.vn, founderai.biz.
              </li>
            </ul>
          </section>

          {/* Section 3: General Obligations */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              3. Nghĩa vụ chung khi xử lý dữ liệu trên Nền Tảng
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              3. General Obligations for Data Processing on the Platform
            </h2>

            <h3 className={`text-lg font-semibold text-slate-800 mb-3 ${lc(language, 'vi')}`}>
              3.1. Tuân thủ quy định pháp luật
            </h3>
            <h3 className={`text-lg font-semibold text-slate-800 mb-3 ${lc(language, 'en')}`}>
              3.1. Legal Compliance
            </h3>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Khi xử lý dữ liệu trên Nền Tảng, Bạn có trách nhiệm thực hiện đầy đủ các biện pháp bảo vệ Dữ Liệu Cá Nhân phù hợp theo quy định của pháp luật, cụ thể như sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              When processing data on the Platform, You are responsible for implementing adequate personal data protection measures in accordance with applicable laws, specifically as follows:
            </p>
            <ol className="pp-list text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Bạn đồng ý, cam đoan và bảo đảm là mình có đầy đủ các giấy phép, phê duyệt, chấp thuận hoặc thực hiện các thủ tục pháp lý cần thiết khác tại các cơ quan Nhà nước có thẩm quyền để cung cấp Dữ Liệu Cá Nhân hợp pháp và cung cấp cho DIGISO khi có yêu cầu. Bạn đồng thời cam kết hoàn toàn chịu mọi trách nhiệm trước pháp luật liên quan đến hoạt động xử lý Dữ Liệu Cá Nhân và bảo vệ Dữ Liệu Cá Nhân của mình.
              </li>
              <li className={lc(language, 'en')}>
                You agree, warrant, and assure that You have all necessary licenses, approvals, consents, or other required legal procedures from competent State authorities to provide Personal Data lawfully and to provide it to DIGISO upon request. You also commit to taking full legal responsibility for Your Personal Data Processing activities and Personal Data protection.
              </li>
              <li className={lc(language, 'vi')}>
                Bạn đồng ý tự chịu mọi trách nhiệm trong trường hợp phát sinh bất kỳ hoạt động xử lý, cung cấp, chia sẻ Dữ Liệu Cá Nhân phát sinh từ Nền Tảng cho bất kỳ Bên Thứ Ba nào khác trong khuôn khổ hoạt động của Bạn trên Nền Tảng.
              </li>
              <li className={lc(language, 'en')}>
                You agree to take full responsibility for any processing, providing, or sharing of Personal Data arising from the Platform to any other Third Party within Your activities on the Platform.
              </li>
              <li className={lc(language, 'vi')}>
                Bạn đồng ý cam kết không xử lý Dữ Liệu Cá Nhân của trẻ em trái theo quy định pháp luật. Trong trường hợp Bạn xử lý Dữ Liệu Cá Nhân của trẻ em, Bạn có trách nhiệm thực hiện theo nguyên tắc bảo vệ các quyền và vì lợi ích tốt nhất của trẻ em, cam kết mọi hoạt động Xử Lý Dữ Liệu Cá Nhân của trẻ em là hợp pháp, và cần phải áp dụng các hoạt động bảo vệ Dữ Liệu Cá Nhân cần thiết, bao gồm nhưng không giới hạn: xác minh thông tin chủ thể, xác minh thông tin cha, mẹ hoặc người giám hộ, thu thập sự đồng ý của cha, mẹ, người giám hộ và xóa không khôi phục dữ liệu khi hết thời hạn.
              </li>
              <li className={lc(language, 'en')}>
                You agree to commit not to process children&apos;s Personal Data in violation of legal regulations. If You process children&apos;s Personal Data, You are responsible for implementing the principle of protecting children&apos;s rights and best interests, committing that all Personal Data Processing activities for children are lawful, and must apply necessary Personal Data protection measures, including but not limited to: verifying subject information, verifying information of parents or guardians, obtaining consent from parents or guardians, and permanently deleting data when the retention period expires.
              </li>
              <li className={lc(language, 'vi')}>
                Bạn đồng ý có trách nhiệm ghi lại và lưu trữ nhật ký hệ thống quá trình xử lý Dữ Liệu Cá Nhân đối với mọi hoạt động xử lý của mình trên Nền Tảng và cung cấp cho DIGISO khi có yêu cầu.
              </li>
              <li className={lc(language, 'en')}>
                You agree to be responsible for recording and storing system logs of Personal Data Processing activities for all Your processing activities on the Platform and providing them to DIGISO upon request.
              </li>
              <li className={lc(language, 'vi')}>
                Trường hợp Chủ Thể Dữ Liệu yêu cầu thực hiện các quyền đối với Dữ Liệu Cá Nhân theo quy định pháp luật (bao gồm nhưng không giới hạn quyền yêu cầu cung cấp dữ liệu, xóa dữ liệu, hạn chế xử lý dữ liệu, phản đối xử lý dữ liệu,…), Bạn đồng ý có trách nhiệm tự mình thực hiện theo yêu cầu của Chủ Thể Dữ Liệu trên cơ sở đảm bảo tuân thủ quy định pháp luật và thông báo, phối hợp với DIGISO ngay lập tức nhưng không trễ hơn <strong>72 giờ</strong> kể từ khi nhận được yêu cầu hợp lệ từ Chủ Thể Dữ Liệu.
              </li>
              <li className={lc(language, 'en')}>
                In case the Data Subject requests to exercise rights to Personal Data under legal regulations (including but not limited to the right to request data provision, data deletion, restriction of data processing, objection to data processing,...), You agree to be responsible for personally fulfilling the Data Subject&apos;s request while ensuring compliance with legal regulations, and notify and cooperate with DIGISO immediately but no later than <strong>72 hours</strong> from receiving a valid request from the Data Subject.
              </li>
              <li className={lc(language, 'vi')}>
                Ngừng xử lý/hạn chế xử lý/xóa Dữ Liệu Cá Nhân và yêu cầu các tổ chức, cá nhân có liên quan ngừng xử lý/hạn chế xử lý/xóa Dữ Liệu Cá Nhân khi nhận được yêu cầu của Chủ Thể Dữ Liệu hoặc từ cơ quan nhà nước có thẩm quyền, hoặc ngừng xử lý/xóa Dữ Liệu Cá Nhân khi Chủ Thể Dữ Liệu đã rút lại sự đồng ý theo đúng quy định tại Luật Bảo Vệ Dữ Liệu Cá Nhân.
              </li>
              <li className={lc(language, 'en')}>
                Stop processing/restrict processing/delete Personal Data and require related organizations and individuals to stop processing/restrict processing/delete Personal Data when receiving requests from Data Subjects or from competent state authorities, or stop processing/delete Personal Data when Data Subjects have withdrawn consent in accordance with the Personal Data Protection Law.
              </li>
            </ol>

            <h3 className={`text-lg font-semibold text-slate-800 mb-3 mt-6 ${lc(language, 'vi')}`}>
              3.2. Tuân thủ theo khuyến nghị của DIGISO
            </h3>
            <h3 className={`text-lg font-semibold text-slate-800 mb-3 mt-6 ${lc(language, 'en')}`}>
              3.2. Comply with DIGISO&apos;s Recommendations
            </h3>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Bạn đồng ý có trách nhiệm thực hiện đầy đủ các biện pháp bảo vệ Dữ Liệu Cá Nhân phù hợp theo các khuyến nghị của DIGISO:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              You agree to be responsible for implementing adequate personal data protection measures in accordance with DIGISO&apos;s recommendations:
            </p>
            <ol className="pp-list text-slate-700 space-y-2">
              <li className={lc(language, 'vi')}>
                Mục đích xử lý Dữ Liệu Cá Nhân của Bạn phải phù hợp với mục đích, phạm vi của các sản phẩm, dịch vụ của DIGISO. Đồng thời Bạn chỉ được thực hiện các hoạt động Xử Lý Dữ Liệu Cá Nhân phù hợp với mục đích, phạm vi, quyền và nghĩa vụ của Bạn theo các thoả thuận, chính sách, thông báo, quy chế của DIGISO.
              </li>
              <li className={lc(language, 'en')}>
                Your Personal Data Processing purposes must be consistent with the purposes and scope of DIGISO&apos;s products and services. Additionally, You may only perform Personal Data Processing activities consistent with Your purposes, scope, rights, and obligations under DIGISO&apos;s agreements, policies, notices, and regulations.
              </li>
              <li className={lc(language, 'vi')}>
                Bạn đồng ý cam kết chỉ nhận các dữ liệu cá nhân từ DIGISO (nếu có và dựa trên sự cho phép của chủ thể dữ liệu) trong phạm vi lãnh thổ nước Cộng Hoà Xã Hội Chủ Nghĩa Việt Nam. Trong trường hợp Bạn có thực hiện chuyển bất kỳ dữ liệu nào ra nước ngoài thì Bạn cần phải thực hiện các thủ tục theo quy định pháp luật của nước Cộng Hoà Xã Hội Chủ Nghĩa Việt Nam.
              </li>
              <li className={lc(language, 'en')}>
                You agree to commit to only receive personal data from DIGISO (if any and based on the data subject&apos;s permission) within the territory of the Socialist Republic of Vietnam. If You transfer any data abroad, You must follow the procedures under Vietnamese law.
              </li>
              <li className={lc(language, 'vi')}>
                Trong trường hợp Bạn có chỉ định/lựa chọn Bên Thứ Ba tham gia vào quá trình xử lý dữ liệu được chuyển giao (nếu có và dựa trên sự cho phép của chủ thể dữ liệu) từ Nền tảng của DIGISO, thì Bạn phải ngay lập tức thông báo cho DIGISO. Bên Thứ Ba chỉ được tham gia vào hoạt động Xử Lý Dữ Liệu Cá Nhân khi và chỉ khi được sự đồng ý của DIGISO.
              </li>
              <li className={lc(language, 'en')}>
                If You designate/select a Third Party to participate in the data processing transferred (if any and based on the data subject&apos;s permission) from DIGISO&apos;s Platform, You must immediately notify DIGISO. Third Party may only participate in Personal Data Processing activities when and only when DIGISO&apos;s consent is obtained.
              </li>
            </ol>
          </section>

          {/* Section 4: Controller Responsibilities */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              4. Trách nhiệm của Bạn khi là Bên Kiểm Soát Dữ Liệu Cá Nhân
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              4. Your Responsibilities when Acting as Personal Data Controller
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Bạn đồng ý có trách nhiệm thực hiện đầy đủ các biện pháp bảo vệ Dữ Liệu Cá Nhân phù hợp theo quy định của pháp luật với vai trò là Bên Kiểm Soát Dữ Liệu Cá Nhân, cụ thể như sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              You agree to be responsible for implementing adequate personal data protection measures in accordance with legal regulations as a Personal Data Controller, specifically as follows:
            </p>
            <ol className="pp-list text-slate-700 space-y-2">
              <li className={lc(language, 'vi')}>
                Đồng ý thực hiện đầy đủ các Nghĩa vụ chung khi xử lý dữ liệu trên Nền Tảng theo Điều 3 Thoả Thuận này.
              </li>
              <li className={lc(language, 'en')}>
                Agree to fully fulfill General Obligations when processing data on the Platform under Article 3 of this Agreement.
              </li>
              <li className={lc(language, 'vi')}>
                Đồng ý thực hiện các biện pháp tổ chức và kỹ thuật cùng các biện pháp an toàn, bảo mật phù hợp để đảm bảo, chứng minh các hoạt động xử lý dữ liệu đã được thực hiện, tuân thủ theo quy định của pháp luật về bảo vệ Dữ Liệu Cá Nhân, tiến hành rà soát và cập nhật các biện pháp này khi cần thiết.
              </li>
              <li className={lc(language, 'en')}>
                Agree to implement appropriate organizational and technical measures along with safety and security measures to ensure and demonstrate that data processing activities have been performed in compliance with Personal Data Protection laws, and review and update these measures when necessary.
              </li>
              <li className={lc(language, 'vi')}>
                Bạn đồng ý có trách nhiệm thông báo về hoạt động xử lý Dữ Liệu Cá Nhân với mục đích và phạm vi đã thông báo với Chủ Thể Dữ Liệu theo quy định của Luật Bảo Vệ Dữ Liệu Cá Nhân và cam kết, đảm bảo thu thập đầy đủ sự đồng ý của Chủ Thể Dữ Liệu một cách hợp pháp.
              </li>
              <li className={lc(language, 'en')}>
                You agree to be responsible for notifying Personal Data Processing activities with the purposes and scope notified to Data Subjects under the Personal Data Protection Law, and commit to ensuring lawful collection of full Data Subject consent.
              </li>
              <li className={lc(language, 'vi')}>
                Bạn đồng ý có trách nhiệm bảo đảm các quyền của Chủ Thể Dữ Liệu theo Luật Bảo Vệ Dữ Liệu Cá Nhân.
              </li>
              <li className={lc(language, 'en')}>
                You agree to be responsible for ensuring Data Subjects&apos; rights under the Personal Data Protection Law.
              </li>
              <li className={lc(language, 'vi')}>
                Trường hợp phát hiện về việc xảy ra vi phạm quy định về bảo vệ Dữ Liệu Cá Nhân (vi phạm rõ ràng hoặc tiềm tàng khả năng vi phạm), Bạn đồng ý có trách nhiệm: (i) Thông báo cho Cơ Quan Chuyên Trách Bảo Vệ Dữ Liệu Cá Nhân trong vòng <strong>72 giờ</strong> và (ii) Tích cực hỗ trợ, phản hồi, phối hợp, thông báo với DIGISO nhằm thực hiện các nghĩa vụ theo quy định pháp luật.
              </li>
              <li className={lc(language, 'en')}>
                Upon discovering any violation or potential violation of Personal Data Protection regulations, You agree to: (i) Notify the Personal Data Protection Authority within <strong>72 hours</strong> and (ii) Actively support, respond, cooperate, and notify DIGISO to fulfill legal obligations.
              </li>
            </ol>
          </section>

          {/* Section 5: Processor Responsibilities */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              5. Trách nhiệm của Bạn khi là Bên Xử Lý Dữ Liệu Cá Nhân
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              5. Your Responsibilities when Acting as Personal Data Processor
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Khi đóng vai trò là Bên Xử Lý Dữ Liệu Cá Nhân, Bạn đồng ý tuân thủ các trách nhiệm sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              When acting as a Personal Data Processor, You agree to comply with the following responsibilities:
            </p>
            <ol className="pp-list text-slate-700 space-y-2">
              <li className={lc(language, 'vi')}>
                Thực hiện đầy đủ các nghĩa vụ chung khi xử lý dữ liệu trên Nền Tảng theo Điều 3 Thoả Thuận này.
              </li>
              <li className={lc(language, 'en')}>
                Fully fulfill general obligations when processing data on the Platform under Article 3 of this Agreement.
              </li>
              <li className={lc(language, 'vi')}>
                Bạn chỉ được tiếp nhận, Xử Lý Dữ Liệu Cá Nhân sau khi đồng ý với toàn bộ nội dung tại Thoả Thuận này. Bạn cam kết xử lý Dữ Liệu Cá Nhân đúng theo các nội dung tại Thoả Thuận này và các quy định của pháp luật.
              </li>
              <li className={lc(language, 'en')}>
                You may only receive and process Personal Data after agreeing to all contents of this Agreement. You commit to processing Personal Data in accordance with this Agreement and legal regulations.
              </li>
              <li className={lc(language, 'vi')}>
                Đồng ý thực hiện đầy đủ các biện pháp bảo vệ Dữ Liệu Cá Nhân theo quy định của Luật Bảo Vệ Dữ Liệu Cá Nhân.
              </li>
              <li className={lc(language, 'en')}>
                Agree to implement adequate Personal Data protection measures under the Personal Data Protection Law.
              </li>
              <li className={lc(language, 'vi')}>
                Trường hợp Chủ Thể Dữ Liệu thực hiện các quyền đối với Dữ Liệu Cá Nhân theo quy định pháp luật, Bạn có nghĩa vụ tự mình thực hiện theo yêu cầu của Chủ Thể Dữ Liệu trên cơ sở đảm bảo tuân thủ quy định pháp luật sau khi thông báo, phối hợp với DIGISO ngay lập tức nhưng không trễ hơn <strong>72 giờ</strong> để xử lý yêu cầu này của Chủ Thể Dữ Liệu.
              </li>
              <li className={lc(language, 'en')}>
                When Data Subjects exercise their rights to Personal Data under legal regulations, You are obligated to personally fulfill the Data Subject&apos;s request while ensuring legal compliance, after notifying and coordinating with DIGISO immediately but no later than <strong>72 hours</strong> to handle the Data Subject&apos;s request.
              </li>
              <li className={lc(language, 'vi')}>
                Bạn đồng ý có trách nhiệm xóa, hoàn trả lại toàn bộ Dữ Liệu Cá Nhân cho DIGISO sau khi kết thúc Xử Lý Dữ Liệu Cá Nhân trên Nền tảng.
              </li>
              <li className={lc(language, 'en')}>
                You agree to be responsible for deleting or returning all Personal Data to DIGISO upon completion of Personal Data Processing on the Platform.
              </li>
              <li className={lc(language, 'vi')}>
                Trường hợp Bạn phát hiện về việc xảy ra vi phạm quy định về bảo vệ Dữ Liệu Cá Nhân (vi phạm rõ ràng hoặc tiềm tàng khả năng vi phạm), Bạn đồng ý có trách nhiệm: (i) Thông báo cho DIGISO ngay lập tức nhưng không được trễ hơn <strong>24 giờ</strong> kể từ khi xảy ra vi phạm và (ii) Tích cực hỗ trợ, phối hợp với DIGISO nhằm thực hiện các nghĩa vụ theo quy định pháp luật.
              </li>
              <li className={lc(language, 'en')}>
                Upon discovering any violation or potential violation of Personal Data Protection regulations, You agree to: (i) Notify DIGISO immediately but no later than <strong>24 hours</strong> from the occurrence of the violation and (ii) Actively support and cooperate with DIGISO to fulfill legal obligations.
              </li>
            </ol>
          </section>

          {/* Section 6: Security Measures */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              6. Biện pháp bảo mật
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              6. Security Measures
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO khuyến nghị Bạn phải có trách nhiệm áp dụng các biện pháp kiểm soát và bảo mật cần thiết theo tiêu chuẩn, yêu cầu của DIGISO. Các biện pháp kiểm soát, biện pháp bảo mật phải được áp dụng để bảo vệ và ngăn chặn xâm nhập/truy cập trái phép Dữ Liệu Cá Nhân và/hoặc chuyển giao Dữ Liệu Cá Nhân cho bất kỳ bên nào và/hoặc bên xử lý dữ liệu thứ cấp của mình (nếu có), bao gồm nhưng không giới hạn:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO recommends that You must be responsible for implementing necessary control and security measures according to DIGISO&apos;s standards and requirements. Control measures and security measures must be applied to protect and prevent unauthorized intrusion/access to Personal Data and/or transfer of Personal Data to any party and/or Your sub-data processors (if any), including but not limited to:
            </p>
            <ul className="pp-list text-slate-700 space-y-2">
              <li className={lc(language, 'vi')}>
                Các biện pháp phòng chống rủi ro thất thoát, virus cũng như các phần mềm mã hóa theo tiêu chuẩn cập nhật và hiện hành dành cho việc lưu trữ và chuyển giao/luân chuyển trong trường hợp Dữ Liệu Cá Nhân là dữ liệu điện tử và khi di chuyển qua mạng/Internet.
              </li>
              <li className={lc(language, 'en')}>
                Risk prevention measures against data loss, viruses, and encryption software according to updated and current standards for storage and transfer/transmission when Personal Data is electronic data and when transmitted over the network/Internet.
              </li>
              <li className={lc(language, 'vi')}>
                Dữ Liệu Cá Nhân phải được mã hóa hoặc có biện pháp bảo vệ để bảo mật thông tin trong quá trình tạo lập, trao đổi, lưu trữ, và/hoặc sử dụng các biện pháp mã hóa theo quy chuẩn kỹ thuật quốc gia về mã hóa dữ liệu hoặc tiêu chuẩn Quốc tế đã được công nhận.
              </li>
              <li className={lc(language, 'en')}>
                Personal Data must be encrypted or have protection measures to secure information during creation, exchange, storage, and/or use encryption measures according to national technical standards for data encryption or recognized international standards.
              </li>
              <li className={lc(language, 'vi')}>
                Các dữ liệu nhận và/hoặc được chuyển giao phải tuân theo định dạng đã thống nhất theo quy định và hướng dẫn, tùy thời điểm; bao gồm nhưng không giới hạn: mã hóa đối xứng (hai chiều/Encryption), mã hóa một chiều, hàm băm (Hash với 256 bits), ẩn danh dữ liệu (Anonymization), che dữ liệu (Data Masking), làm nhiễu dữ liệu.
              </li>
              <li className={lc(language, 'en')}>
                Data received and/or transferred must follow unified formats according to regulations and guidelines at each time; including but not limited to: symmetric encryption (two-way/Encryption), one-way encryption, hash function (Hash with 256 bits), data anonymization (Anonymization), data masking (Data Masking), data noise.
              </li>
              <li className={lc(language, 'vi')}>
                Theo dõi, gia cố, an toàn vật lý cho các hệ thống thuộc phạm vi tiếp nhận và xử lý dữ liệu.
              </li>
              <li className={lc(language, 'en')}>
                Monitor, reinforce, and ensure physical security for systems within the data receiving and processing scope.
              </li>
              <li className={lc(language, 'vi')}>
                Đảm bảo các lỗ hổng/rủi ro (nếu có) phải được cập nhật.
              </li>
              <li className={lc(language, 'en')}>
                Ensure vulnerabilities/risks (if any) are updated/patched.
              </li>
              <li className={lc(language, 'vi')}>
                Có biện pháp quản lý khóa mã hóa để bảo vệ Dữ Liệu Cá Nhân.
              </li>
              <li className={lc(language, 'en')}>
                Have encryption key management measures to protect Personal Data.
              </li>
            </ul>
          </section>

          {/* Section 7: Dispute Resolution */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              7. Tranh chấp, khiếu nại, khiếu kiện
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              7. Disputes, Complaints, and Legal Proceedings
            </h2>
            <ol className="pp-list text-slate-700 space-y-2">
              <li className={lc(language, 'vi')}>
                Trong trường hợp bất kỳ Bên nào có tranh chấp, khiếu nại hay khiếu kiện với Chủ Thể Dữ Liệu hay các bên liên quan khác về việc Xử Lý Dữ Liệu Cá Nhân, Bạn đồng ý có trách nhiệm hỗ trợ phù hợp cho DIGISO với sự nỗ lực tối đa trong quá trình thu thập, tập hợp chứng cứ và chứng minh về sự hợp pháp, hợp lệ trong việc Xử Lý Dữ Liệu Cá Nhân của Chủ Thể Dữ Liệu trong tranh chấp, khiếu nại hay khiếu kiện nói trên khi có yêu cầu từ DIGISO.
              </li>
              <li className={lc(language, 'en')}>
                In case any party has a dispute, complaint, or legal proceeding with the Data Subject or other related parties regarding Personal Data Processing, You agree to provide appropriate support to DIGISO with maximum effort in collecting, gathering evidence, and proving the legality and validity of the Data Subject&apos;s Personal Data Processing in the said dispute, complaint, or legal proceeding when requested by DIGISO.
              </li>
              <li className={lc(language, 'vi')}>
                Trong trường hợp Bạn có lỗi, vi phạm dẫn đến tranh chấp, khiếu nại hay khiếu kiện cho DIGISO, Bạn đồng ý sẽ phải bảo vệ DIGISO tránh khỏi, hoặc bồi thường đầy đủ cho DIGISO đối với: mọi thiệt hại, tổn thất, chi phí, phí tổn phát sinh từ các tranh chấp, khiếu nại hay khiếu kiện đó.
              </li>
              <li className={lc(language, 'en')}>
                In case You are at fault or violate regulations leading to disputes, complaints, or legal proceedings against DIGISO, You agree to defend DIGISO against, or fully compensate DIGISO for: all damages, losses, costs, and expenses arising from those disputes, complaints, or legal proceedings.
              </li>
              <li className={lc(language, 'vi')}>
                Bạn cam kết bồi thường và giữ cho DIGISO và toàn bộ các nhân viên, người quản lý, đối tác, đại lý, Bên tư vấn, công ty con và doanh nghiệp liên kết của DIGISO tránh khỏi bất kỳ thiệt hại, tổn thất, chi phí và phí tổn mà DIGISO phải hoặc có thể phải gánh chịu do việc vi phạm hoặc gây tổn thất của Bạn, bao gồm: (i) Các chi phí và phí tổn phát sinh liên quan đến việc thực hiện Thoả Thuận này (bao gồm cả chi phí pháp lý); và (ii) Tất cả các thiệt hại, chi phí và phí tổn phát sinh từ các yêu cầu bồi thường của Bên Thứ Ba, trong các vụ kiện, các cuộc thanh kiểm tra, các quy trình điều tra hình sự đối với các hành vi vi phạm pháp luật liên quan đến việc cung cấp Dữ Liệu Cá Nhân của Bạn hoặc việc Bạn không tuân thủ bất kỳ điều khoản nào theo quy định tại Thoả Thuận này.
              </li>
              <li className={lc(language, 'en')}>
                You commit to compensate and hold DIGISO and all of DIGISO&apos;s employees, managers, partners, agents, consultants, subsidiaries, and affiliates harmless from any damages, losses, costs, and expenses that DIGISO must or may incur due to Your violation or causing losses, including: (i) Costs and expenses arising related to this Agreement (including legal costs); and (ii) All damages, costs, and expenses arising from Third Party compensation claims, in lawsuits, audits, or criminal investigation processes regarding Your illegal actions related to providing Your Personal Data or Your failure to comply with any terms under this Agreement.
              </li>
            </ol>
          </section>

          {/* Section 8: General Provisions */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              8. Điều khoản chung
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              8. General Provisions
            </h2>
            <ol className="pp-list text-slate-700 space-y-2">
              <li className={lc(language, 'vi')}>
                <strong>Pháp Luật Điều Chỉnh và Điều Khoản Giải Quyết Tranh Chấp:</strong> Thoả Thuận này được điều chỉnh và giải thích theo quy định pháp luật Việt Nam. Bất kỳ tranh chấp nào phát sinh từ hoặc liên quan đến Thoả Thuận này, bao gồm bất kỳ vấn đề nào liên quan đến sự tồn tại, hiệu lực hoặc chấm dứt Thoả Thuận, sẽ được đưa ra giải quyết bởi tòa án có thẩm quyền tại <strong>Thành phố Hồ Chí Minh</strong>.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Governing Law and Dispute Resolution:</strong> This Agreement is governed by and interpreted in accordance with Vietnamese law. Any disputes arising from or related to this Agreement, including any issues related to the existence, validity, or termination of the Agreement, shall be submitted for resolution by competent courts in <strong>Ho Chi Minh City</strong>.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Thông báo:</strong> Mọi Thông Báo liên quan tới Dữ Liệu Cá Nhân cần phải được gửi tới: Người nhận: Bộ phận Bảo Vệ Dữ Liệu Cá Nhân - Công ty TNHH Giải pháp số DIGISO; Địa chỉ: Việt Nam; E-mail: <a href="mailto:hotro.digibook@gmail.com" className="text-orange-600 hover:underline">hotro.digibook@gmail.com</a>
              </li>
              <li className={lc(language, 'en')}>
                <strong>Notices:</strong> All Notices related to Personal Data must be sent to: Recipient: Personal Data Protection Department - DIGISO Digital Solutions Co., Ltd.; Address: Vietnam; Email: <a href="mailto:hotro.digibook@gmail.com" className="text-orange-600 hover:underline">hotro.digibook@gmail.com</a>
              </li>
              <li className={lc(language, 'vi')}>
                DIGISO được quyền từ chối cung cấp sản phẩm, dịch vụ cho Bạn trong trường hợp Bạn không tuân thủ bất kỳ quy định, thoả thuận nào tại Thoả Thuận này khi thực hiện hoạt động Xử Lý Dữ Liệu Cá Nhân.
              </li>
              <li className={lc(language, 'en')}>
                DIGISO has the right to refuse to provide products and services to You if You fail to comply with any regulations or agreements under this Agreement when performing Personal Data Processing activities.
              </li>
              <li className={lc(language, 'vi')}>
                Thoả Thuận này có hiệu lực trong toàn bộ thời gian DIGISO thực hiện hoạt động kinh doanh trên lãnh thổ Việt Nam. Khi cần thiết, DIGISO có thể sửa đổi, cập nhật hoặc điều chỉnh các nội dung trong Thoả Thuận này tại bất cứ thời điểm nào, và phiên bản mới nhất của Thoả Thuận sẽ được đăng tải trên Website, Nền Tảng của DIGISO. Bạn đồng ý rằng sẽ định kỳ kiểm tra trên Website hoặc Nền Tảng của DIGISO để luôn được tiếp cận với phiên bản được cập nhật gần nhất.
              </li>
              <li className={lc(language, 'en')}>
                This Agreement is effective for the entire time DIGISO conducts business operations in Vietnam. When necessary, DIGISO may modify, update, or adjust any contents of this Agreement at any time, and the latest version of the Agreement will be posted on DIGISO&apos;s Website and Platform. You agree to periodically check DIGISO&apos;s Website or Platform to always access the most recently updated version.
              </li>
            </ol>
          </section>

          {/* Contact Block */}
          <div className="mt-10 overflow-hidden rounded-2xl border border-slate-700/30 bg-gradient-to-b from-slate-900 to-slate-950 px-5 py-8 text-white shadow-xl sm:px-8 sm:py-10">
            <div className="mb-6 max-w-2xl">
              <h2 className={`text-lg font-bold tracking-tight text-white sm:text-xl ${lc(language, 'vi')}`}>
                Liên hệ về Dữ Liệu Cá Nhân
              </h2>
              <h2 className={`text-lg font-bold tracking-tight text-white sm:text-xl ${lc(language, 'en')}`}>
                Contact for Personal Data Matters
              </h2>
              <p className={`mt-2 text-[14px] leading-relaxed text-slate-300 ${lc(language, 'vi')}`}>
                Nếu bạn có câu hỏi hoặc yêu cầu liên quan đến Thoả thuận Xử lý Dữ liệu Công khai này, vui lòng liên hệ:
              </p>
              <p className={`mt-2 text-[14px] leading-relaxed text-slate-300 ${lc(language, 'en')}`}>
                If you have questions or requests regarding this Public Data Processing Agreement, please contact:
              </p>
            </div>
            {/* Grid cho tiếng Việt */}
            <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${lc(language, 'vi')}`}>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Công ty</div>
                <div className="break-words text-[13.5px] leading-snug text-slate-100">Công ty TNHH Giải pháp số DIGISO</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Email</div>
                <div className="break-words text-[13.5px]">
                  <a href="mailto:hotro.digibook@gmail.com" className="text-orange-400 no-underline hover:underline">hotro.digibook@gmail.com</a>
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
                  Phòng I.101B Toà nhà A, Khu Công nghệ Phần mềm Đại học Quốc gia Tp. Hồ Chí Minh
                </div>
              </div>
            </div>

            {/* Grid cho tiếng Anh */}
            <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${lc(language, 'en')}`}>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Company</div>
                <div className="break-words text-[13.5px] leading-snug text-slate-100">DIGISO Digital Solutions Co., Ltd.</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Email</div>
                <div className="break-words text-[13.5px]">
                  <a href="mailto:hotro.digibook@gmail.com" className="text-orange-400 no-underline hover:underline">hotro.digibook@gmail.com</a>
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
        </footer>
      </div>
    </div>
  );
}

export default PublicDPA;
