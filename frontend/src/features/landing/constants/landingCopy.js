/**
 * Toàn bộ chuỗi giao diện trang landing `/l` theo từng ngôn ngữ.
 * Cấu trúc: `LANDING_COPY.vi` / `LANDING_COPY.en` — cùng khóa để đổi ngôn ngữ an toàn.
 * Nội dung mang tính giới thiệu (tham chiếu tinh thần uknow.edu.vn / đào tạo AI), không sao chép nguyên văn bên thứ ba.
 */

/** @typedef {typeof LANDING_COPY.vi} LandingCopy */

export const LANDING_COPY = {
  vi: {
    nav: {
      brand: 'UKnow.edu.vn',
      register: 'Đăng ký',
      langVi: 'Tiếng Việt',
      langEn: 'English',
    },
    hero: {
      badge: 'Nền tảng học & đào tạo ứng dụng AI',
      titleLine1: 'Đồng hành cùng bạn',
      titleHighlight: 'làm chủ AI',
      titleLine2: 'trong công việc và học tập',
      subtitle:
        'Chương trình được thiết kế thực chiến: từ nền tảng đến ứng dụng sâu — phù hợp doanh nghiệp, cá nhân và đội nhóm.',
      ctaPrimary: 'Đăng ký tư vấn',
      ctaSecondary: 'Xem lộ trình học',
      imageAlt: 'Không gian học tập hiện đại với công nghệ và con người',
      socialProof: 'Học viên và đối tác đồng hành cùng chúng tôi mỗi tuần',
    },
    stats: {
      eyebrow: 'Con số nổi bật',
      title: 'Một hệ sinh thái học tập mở',
      subtitle: 'Kết hợp khóa học trực tuyến, hội thảo và huấn luyện theo nhu cầu.',
      items: [
        { value: '150+', label: 'Bài giảng & tài liệu' },
        { value: '15+', label: 'Chủ đề khóa học' },
        { value: '200+', label: 'Học viên tham gia' },
      ],
    },
    mission: {
      eyebrow: 'Sứ mệnh',
      title: 'Bình dân hóa ứng dụng AI',
      titleLine2: 'trao quyền tiếp cận cho mọi đối tượng',
      body:
        'Chúng tôi tin AI không chỉ dành cho kỹ sư — mà cho mọi người làm việc, giảng dạy và khởi nghiệp. UKnow đặt trọng tâm vào hành động: bài học ngắn gọn, ví dụ cụ thể, và hỗ trợ khi bạn cần.',
    },
    programs: {
      eyebrow: 'Hình thức đào tạo',
      title: 'Chọn đúng định dạng cho mục tiêu của bạn',
      subtitle: 'Từ đào tạo nội bộ doanh nghiệp đến học online linh hoạt và coaching 1:1.',
      items: [
        {
          title: 'Đào tạo in-house & hội thảo',
          desc: 'Chương trình theo đơn vị: nâng năng lực ứng dụng AI cho đội ngũ với lộ trình rõ ràng.',
          badge: 'Doanh nghiệp',
        },
        {
          title: 'Khóa học trực tuyến',
          desc: 'Học mọi lúc, nội dung cập nhật theo công cụ mới; phù hợp cá nhân và nhóm nhỏ.',
          badge: 'Linh hoạt',
        },
        {
          title: 'Coaching 1:1',
          desc: 'Đồng hành sâu theo từng người: mục tiêu cụ thể, bài tập thực hành và phản hồi trực tiếp.',
          badge: 'Cá nhân hóa',
        },
      ],
    },
    courses: {
      eyebrow: 'Khóa học tiêu biểu',
      title: 'Bắt đầu từ đâu cũng được',
      subtitle: 'Từ nền tảng đến chuyên sâu — phù hợp nhiều ngành nghề.',
      items: [
        {
          tag: 'Phổ biến',
          title: 'AI Landing Page & trợ lý AI — thực chiến không cần code',
          meta: 'Cập nhật theo công cụ mới',
          badge: 'Hot',
        },
        {
          tag: 'Webinar',
          title: 'Ứng dụng AI hành chính — nâng cao hiệu suất công việc',
          meta: 'Phù hợp văn phòng & công chức',
          badge: 'Mới',
        },
        {
          tag: 'Sales & Marketing',
          title: 'Kỹ năng AI trong Sales & Marketing — nâng cao',
          meta: 'Ứng dụng trong pipeline & nội dung',
          badge: 'Pro',
        },
      ],
    },
    testimonials: {
      eyebrow: 'Cảm nhận',
      title: 'Học viên và đối tác chia sẻ',
      items: [
        {
          quote: 'Nội dung dễ hiểu, áp dụng được ngay vào công việc hàng ngày.',
          name: 'Nguyễn Minh K.',
          role: 'Học viên',
        },
        {
          quote: 'Tư duy ứng dụng AI rõ ràng, tránh lan man — rất giá trị cho đội sales.',
          name: 'Phạm Quang D.',
          role: 'CEO',
        },
        {
          quote: 'Tôi thích phần thực hành: có ví dụ cụ thể, không chỉ lý thuyết.',
          name: 'Trần Thu H.',
          role: 'Người làm nội dung',
        },
      ],
    },
    finalCta: {
      title: 'Khơi mở thế giới AI cùng UKnow',
      subtitle: 'Đăng ký tư vấn hoặc khám phá khóa học trên nền tảng uknow.edu.vn.',
      button: 'Đăng ký tư vấn',
      buttonSecondary: 'Xem khóa học',
    },
    policyTeaser: {
      eyebrow: 'Chính sách & dữ liệu',
      title: 'Minh bạch trong cách thu thập và sử dụng thông tin',
      body:
        'Khi bạn đăng ký tư vấn, chúng tôi chỉ dùng thông tin để liên hệ và gửi tài liệu phù hợp. Bạn có thể đọc đầy đủ điều khoản tại trang chính sách bảo mật của DIGISO / UKnow.',
      link: 'Đọc chính sách bảo mật',
    },
    footer: {
      tagline: 'Khơi mở thế giới AI cùng UKnow',
      contactLine: 'Liên hệ: uknow@digiso.vn',
      address: 'TP. Hồ Chí Minh, Việt Nam',
      copyright: 'Bản quyền thuộc về chương trình UKnow — định hướng bởi DIGISO.',
      visitSite: 'Ghé uknow.edu.vn',
    },
    form: {
      cardEyebrow: 'Tư vấn miễn phí',
      cardTitle: 'Bắt đầu hành trình của bạn',
      cardSubtitle: 'Điền thông tin để nhận lộ trình gợi ý và ưu đãi đặc quyền.',
      lastName: 'Họ',
      firstName: 'Tên',
      email: 'Email',
      phone: 'Số điện thoại',
      occupation: 'Nghề nghiệp hiện tại',
      interest: 'Lĩnh vực quan tâm',
      selectOccupation: '-- Chọn nghề nghiệp --',
      selectInterest: '-- Chọn chủ đề --',
      consentPrefix: 'Tôi đồng ý nhận thông tin khóa học & ưu đãi từ UKnow qua email/SMS. Xem',
      privacyLink: 'Chính sách bảo mật',
      submit: 'Nhận tư vấn & ưu đãi miễn phí →',
      submitting: 'Đang gửi...',
      secureNote: 'Thông tin của bạn được bảo mật tuyệt đối',
      successTitle: 'Đăng ký thành công!',
      successBody:
        'Cảm ơn bạn đã quan tâm đến UKnow. Đội ngũ tư vấn sẽ liên hệ trong 24 giờ làm việc. Hãy kiểm tra email để nhận tài liệu tham khảo.',
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
        consent: 'Cần đồng ý nhận thông tin từ UKnow',
        genericError: 'Không thể gửi thông tin. Thử lại sau.',
      },
    },
  },
  en: {
    nav: {
      brand: 'UKnow.edu.vn',
      register: 'Register',
      langVi: 'Tiếng Việt',
      langEn: 'English',
    },
    hero: {
      badge: 'Learning platform for applied AI',
      titleLine1: 'We help you',
      titleHighlight: 'master AI',
      titleLine2: 'for work and study',
      subtitle:
        'Hands-on programs from foundations to advanced use: built for teams, professionals, and individuals.',
      ctaPrimary: 'Book a consultation',
      ctaSecondary: 'See learning paths',
      imageAlt: 'Modern learning space with technology and collaboration',
      socialProof: 'Learners and partners join us every week',
    },
    stats: {
      eyebrow: 'Highlights',
      title: 'An open learning ecosystem',
      subtitle: 'Online courses, workshops, and tailored training in one place.',
      items: [
        { value: '150+', label: 'Lessons & materials' },
        { value: '15+', label: 'Course topics' },
        { value: '200+', label: 'Active learners' },
      ],
    },
    mission: {
      eyebrow: 'Mission',
      title: 'Democratizing applied AI',
      titleLine2: 'and broadening access for everyone',
      body:
        'We believe AI is not only for engineers — it is for anyone who works, teaches, or builds. UKnow focuses on action: concise lessons, concrete examples, and support when you need it.',
    },
    programs: {
      eyebrow: 'Formats',
      title: 'Choose the format that fits your goal',
      subtitle: 'From in-house training to flexible online learning and 1:1 coaching.',
      items: [
        {
          title: 'In-house training & workshops',
          desc: 'Programs for organizations: upskill teams with a clear roadmap for applied AI.',
          badge: 'Enterprise',
        },
        {
          title: 'Online courses',
          desc: 'Learn anytime; content evolves with new tools — ideal for individuals and small groups.',
          badge: 'Flexible',
        },
        {
          title: '1:1 coaching',
          desc: 'Deep support per person: clear goals, practical exercises, and direct feedback.',
          badge: 'Personalized',
        },
      ],
    },
    courses: {
      eyebrow: 'Featured courses',
      title: 'Start anywhere on the map',
      subtitle: 'From foundations to advanced — relevant across industries.',
      items: [
        {
          tag: 'Popular',
          title: 'AI landing pages & AI assistants — hands-on without code',
          meta: 'Updated with the latest tools',
          badge: 'Hot',
        },
        {
          tag: 'Webinar',
          title: 'AI for administrative work — boost productivity',
          meta: 'Great for office & public sector roles',
          badge: 'New',
        },
        {
          tag: 'Sales & Marketing',
          title: 'AI in sales & marketing — advanced track',
          meta: 'Apply to pipeline and content workflows',
          badge: 'Pro',
        },
      ],
    },
    testimonials: {
      eyebrow: 'Testimonials',
      title: 'What learners and partners say',
      items: [
        {
          quote: 'Clear content and easy to apply to daily work.',
          name: 'Minh K.',
          role: 'Learner',
        },
        {
          quote: 'Practical AI thinking for our sales team — high signal, no fluff.',
          name: 'Quang D.',
          role: 'CEO',
        },
        {
          quote: 'I love the exercises: concrete examples, not just theory.',
          name: 'Thu H.',
          role: 'Content creator',
        },
      ],
    },
    finalCta: {
      title: 'Open the world of AI with UKnow',
      subtitle: 'Book a consultation or explore courses on uknow.edu.vn.',
      button: 'Book a consultation',
      buttonSecondary: 'Browse courses',
    },
    policyTeaser: {
      eyebrow: 'Policy & data',
      title: 'Transparent about how we use your information',
      body:
        'When you register for a consultation, we use your details only to respond and follow up with relevant materials. Read the full privacy policy on the DIGISO / UKnow policy page.',
      link: 'Read privacy policy',
    },
    footer: {
      tagline: 'Open the world of AI with UKnow',
      contactLine: 'Contact: uknow@digiso.vn',
      address: 'Ho Chi Minh City, Vietnam',
      copyright: '© UKnow program — by DIGISO.',
      visitSite: 'Visit uknow.edu.vn',
    },
    form: {
      cardEyebrow: 'Free consultation',
      cardTitle: 'Start your journey',
      cardSubtitle: 'Tell us about you — we will suggest a path and exclusive offers.',
      lastName: 'Last name',
      firstName: 'First name',
      email: 'Email',
      phone: 'Phone',
      occupation: 'Current occupation',
      interest: 'Area of interest',
      selectOccupation: '-- Select occupation --',
      selectInterest: '-- Select topic --',
      consentPrefix: 'I agree to receive course updates and offers from UKnow via email/SMS. See',
      privacyLink: 'Privacy policy',
      submit: 'Get consultation & offers →',
      submitting: 'Sending...',
      secureNote: 'Your information is kept confidential',
      successTitle: 'Thank you!',
      successBody:
        'We have received your details. Our team will reach out within one business day. Please check your email for follow-up materials.',
      placeholders: {
        lastName: 'Nguyen',
        firstName: 'Van A',
        email: 'you@example.com',
        phone: '+84 901 234 567',
      },
      validation: {
        fullName: 'Please enter your full name',
        email: 'Invalid email address',
        phone: 'Invalid phone number',
        occupation: 'Please select an occupation',
        interest: 'Please select an area of interest',
        consent: 'You need to agree to receive information from UKnow',
        genericError: 'Could not send your details. Please try again later.',
      },
    },
  },
};
