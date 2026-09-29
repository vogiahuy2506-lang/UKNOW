/**
 * Chuỗi giao diện trang landing `/l` — bám mock `founder-landing-v2.html`, song ngữ VI/EN.
 * Cấu trúc: `LANDING_COPY.vi` / `LANDING_COPY.en` — cùng khóa để đổi ngôn ngữ an toàn.
 * Chỉ còn khối `form` (form đăng ký nhúng). Các khối nav/hero/about/benefits/courses/testimonials/finalCta/footer là copy chết, đã xoá 29/09/2026
 * (số liệu, lời chứng thực, ưu đãi chưa có bằng chứng).
 */

export const LANDING_COPY = {
  vi: {
    form: {
      /** Tiêu đề gọn khi form nhúng iframe (không dùng eyebrow/cardTitle dài). */
      embedTitle: 'Đăng ký nhận thông tin và ưu đãi miễn phí',
      cardEyebrow: 'Nhận tư vấn miễn phí',
      cardTitleLine1: 'Bắt đầu hành trình AI',
      cardTitleLine2: 'của bạn ngay hôm nay',
      cardSubtitle:
        'Điền thông tin để nhận lộ trình học cá nhân hóa & ưu đãi từ ThS. Ngô Hữu Thống.',
      lastName: 'Họ',
      firstName: 'Tên',
      fullName: 'Họ và tên',
      email: 'Email',
      phone: 'Số điện thoại',
      occupation: 'Nghề nghiệp hiện tại',
      interest: 'Lĩnh vực quan tâm',
      selectOccupation: '-- Chọn nghề nghiệp --',
      selectInterest: '-- Chọn chủ đề --',
      consentPrefix: 'Tôi đồng ý nhận thông tin khóa học & ưu đãi từ Founder AI qua email/SMS. Xem',
      privacyLink: 'Chính sách bảo mật',
      submit: 'Nhận tư vấn & ưu đãi miễn phí',
      submitting: 'Đang gửi...',
      secureNote: 'Thông tin của bạn được bảo mật tuyệt đối',
      successTitle: 'Đăng ký thành công!',
      successBody:
        'Cảm ơn bạn đã quan tâm đến Founder AI! Đội ngũ tư vấn sẽ liên hệ với bạn trong 24 giờ làm việc. Hãy kiểm tra email để nhận tài liệu AI miễn phí từ ThS. Ngô Hữu Thống.',
      /** Bản rút gọn cho iframe (không lấn nền ngoài khối form). */
      embedSuccessBody: 'Cảm ơn bạn! Đội ngũ tư vấn sẽ liên hệ trong thời gian sớm nhất.',
      placeholders: {
        lastName: 'Nguyễn',
        firstName: 'Văn A',
        email: 'example@gmail.com',
        phone: '0901 234 567',
      },
      validation: {
        fullName: 'Vui lòng nhập đầy đủ Họ và Tên',
        email: 'Email không hợp lệ',
        phone: 'Số điện thoại không hợp lệ',
        occupation: 'Vui lòng chọn nghề nghiệp',
        interest: 'Vui lòng chọn lĩnh vực quan tâm',
        consent: 'Cần đồng ý nhận thông tin tư vấn',
        genericError: 'Lỗi gửi form. Vui lòng thử lại.',
      },
    },
  },
  en: {
    form: {
      embedTitle: 'Sign up for information and free offers',
      cardEyebrow: 'Free consultation',
      cardTitleLine1: 'Start your AI journey',
      cardTitleLine2: 'today',
      cardSubtitle:
        'Share your details for a personalized roadmap and offers from M.Sc. Ngo Huu Thong.',
      lastName: 'Last name',
      firstName: 'First name',
      fullName: 'Full name',
      email: 'Email',
      phone: 'Phone',
      occupation: 'Current occupation',
      interest: 'Topic of interest',
      selectOccupation: '-- Select occupation --',
      selectInterest: '-- Select topic --',
      consentPrefix: 'I agree to receive course updates & offers from Founder AI via email/SMS. See',
      privacyLink: 'Privacy policy',
      submit: 'Get consultation & offer',
      submitting: 'Sending...',
      secureNote: 'Your information is kept strictly confidential',
      successTitle: 'Registration successful!',
      successBody:
        'Thank you for your interest in Founder AI! Our team will contact you within 24 business hours. Check your email for free AI materials from M.Sc. Ngo Huu Thong.',
      embedSuccessBody: 'Thank you! Our team will contact you soon.',
      placeholders: {
        lastName: 'Nguyen',
        firstName: 'A',
        email: 'example@gmail.com',
        phone: '+84 901 234 567',
      },
      validation: {
        fullName: 'Please enter your first and last name',
        email: 'Invalid email',
        phone: 'Invalid phone number',
        occupation: 'Please select an occupation',
        interest: 'Please select a topic',
        consent: 'Please agree to receive information',
        genericError: 'Could not submit. Try again.',
      },
    },
  },
};
