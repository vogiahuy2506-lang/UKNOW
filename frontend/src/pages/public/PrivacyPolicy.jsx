import { useMemo, useState } from 'react';

const PRIVACY_COPY = {
  vi: {
    title: 'Chính sách bảo mật',
    subtitle: 'Áp dụng cho hệ thống DIGISO và nền tảng campaign.digiso.vn',
    purposeTitle: '1. Mục đích',
    purposeText:
      'Chúng tôi cam kết bảo vệ thông tin cá nhân của người dùng khi truy cập và sử dụng dịch vụ. Chính sách này mô tả loại dữ liệu được thu thập, mục đích sử dụng và cách chúng tôi bảo vệ dữ liệu.',
    collectionTitle: '2. Dữ liệu có thể được thu thập',
    collectionItems: [
      'Thông tin liên hệ: họ tên, email, số điện thoại.',
      'Dữ liệu sử dụng: thời điểm truy cập, hành vi tương tác, thông tin thiết bị/trình duyệt.',
      'Dữ liệu chiến dịch: tương tác với email và nội dung chiến dịch.',
    ],
    processingTitle: '3. Mục đích xử lý dữ liệu',
    processingItems: [
      'Vận hành và cải thiện dịch vụ.',
      'Gửi thông báo, email dịch vụ hoặc chiến dịch khi có căn cứ phù hợp.',
      'Đảm bảo an toàn hệ thống và tuân thủ yêu cầu pháp lý.',
    ],
    rightsTitle: '4. Quyền của chủ thể dữ liệu',
    rightsItems: [
      'Yêu cầu truy cập, chỉnh sửa hoặc xóa dữ liệu theo quy định pháp luật.',
      'Rút lại đồng ý nhận email marketing bằng liên kết hủy đăng ký trong email.',
      'Gửi khiếu nại/liên hệ về quyền riêng tư qua email hỗ trợ.',
    ],
    contactTitle: 'Liên hệ về quyền riêng tư',
    contactText: 'Nếu bạn có câu hỏi về chính sách bảo mật, vui lòng liên hệ:',
    footerText: '© DIGISO. Chính sách có thể được cập nhật theo quy định hiện hành.',
    langVi: 'Tiếng Việt',
    langEn: 'English',
  },
  en: {
    title: 'Privacy Policy',
    subtitle: 'Applies to DIGISO systems and campaign.digiso.vn platform',
    purposeTitle: '1. Purpose',
    purposeText:
      'We are committed to protecting personal data when users access and use our services. This policy explains what data is collected, how it is used, and how we protect it.',
    collectionTitle: '2. Data we may collect',
    collectionItems: [
      'Contact data: full name, email address, phone number.',
      'Usage data: access time, interaction behavior, device/browser details.',
      'Campaign data: interactions with campaign emails and content.',
    ],
    processingTitle: '3. Data processing purposes',
    processingItems: [
      'Operate and improve services.',
      'Send service or campaign emails under appropriate legal basis.',
      'Ensure system security and legal compliance.',
    ],
    rightsTitle: '4. Data subject rights',
    rightsItems: [
      'Request access, correction, or deletion of data as permitted by law.',
      'Withdraw marketing consent through the unsubscribe link in email.',
      'Submit privacy requests via our support email.',
    ],
    contactTitle: 'Privacy contact',
    contactText: 'If you have any questions about this policy, please contact:',
    footerText: '© DIGISO. This policy may be updated to comply with regulations.',
    langVi: 'Tiếng Việt',
    langEn: 'English',
  },
};

/**
 * Trang hien thi chinh sach bao mat cho domain security.
 *
 * Luong hoat dong:
 * 1. Luu ngon ngu dang hien thi trong local state.
 * 2. Chon bo noi dung theo ngon ngu bang useMemo de tranh tinh lai khong can thiet.
 * 3. Render cac section noi dung va nut chuyen ngon ngu tren cung mot trang.
 *
 * @returns {JSX.Element} Trang privacy policy.
 */
function PrivacyPolicy() {
  const [language, setLanguage] = useState('vi');

  const copy = useMemo(() => PRIVACY_COPY[language] || PRIVACY_COPY.vi, [language]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-gradient-to-r from-slate-900 to-sky-900 px-4 py-10 text-center text-white">
        <h1 className="mb-2 text-3xl font-bold md:text-4xl">{copy.title}</h1>
        <p className="text-sm text-slate-200">{copy.subtitle}</p>
        <div className="mt-5 inline-flex overflow-hidden rounded-full border border-white/30">
          <button
            type="button"
            onClick={() => setLanguage('vi')}
            className={`px-4 py-2 text-sm font-semibold ${
              language === 'vi' ? 'bg-white text-slate-900' : 'text-white/80'
            }`}
          >
            {copy.langVi}
          </button>
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`px-4 py-2 text-sm font-semibold ${
              language === 'en' ? 'bg-white text-slate-900' : 'text-white/80'
            }`}
          >
            {copy.langEn}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-7 md:py-9">
        <section className="mb-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">{copy.purposeTitle}</h2>
          <p className="text-sm leading-7 text-slate-700">{copy.purposeText}</p>
        </section>

        <section className="mb-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">{copy.collectionTitle}</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-slate-700">
            {copy.collectionItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="mb-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">{copy.processingTitle}</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-slate-700">
            {copy.processingItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="mb-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">{copy.rightsTitle}</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-slate-700">
            {copy.rightsItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl bg-slate-900 p-5 text-white">
          <h2 className="mb-3 text-lg font-semibold">{copy.contactTitle}</h2>
          <p className="mb-3 text-sm text-slate-200">{copy.contactText}</p>
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-200">
            <li>
              Email:{' '}
              <a className="text-sky-300 hover:underline" href="mailto:privacy@digiso.vn">
                privacy@digiso.vn
              </a>
            </li>
            <li>
              Website:{' '}
              <a
                className="text-sky-300 hover:underline"
                href="https://digiso.vn"
                target="_blank"
                rel="noopener noreferrer"
              >
                digiso.vn
              </a>
            </li>
          </ul>
        </section>
      </main>

      <footer className="px-4 pb-6 text-center text-xs text-slate-500">{copy.footerText}</footer>
    </div>
  );
}

export default PrivacyPolicy;
