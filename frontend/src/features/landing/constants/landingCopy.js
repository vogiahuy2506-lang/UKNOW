/**
 * Chuỗi giao diện trang landing `/l` — bám mock `founder-landing-v2.html`, song ngữ VI/EN.
 * Cấu trúc: `LANDING_COPY.vi` / `LANDING_COPY.en` — cùng khóa để đổi ngôn ngữ an toàn.
 */

export const LANDING_COPY = {
  vi: {
    nav: {
      brand: 'Founder AI',
      instructorPrefix: 'Giảng viên:',
      instructorName: 'ThS. Ngô Hữu Thống',
      /** Alt text cho avatar giảng viên */
      instructorPhotoAlt: 'ThS. Ngô Hữu Thống',
      register: 'Đăng ký ngay',
      langVi: 'VI',
      langEn: 'EN',
    },
    hero: {
      eyebrowTag: 'AI No.1',
      eyebrowText: 'Nền tảng AI hàng đầu Việt Nam',
      titleLine1: 'Thành thạo',
      titleHighlight: 'Trí Tuệ Nhân Tạo',
      titleLine2: 'trong',
      titleAccent: '30 ngày',
      subtitle:
        'Học cùng ThS. Ngô Hữu Thống — chuyên gia AI hàng đầu với hơn 10 năm kinh nghiệm. Hơn 10,000 học viên đã thay đổi sự nghiệp nhờ Founder AI.',
      instructorMini: {
        name: 'ThS. Ngô Hữu Thống',
        title: 'Chuyên gia AI & Chuyển đổi số',
        badge: 'Chủ nhân các khóa học Founder AI',
      },
      stats: [
        { value: '10K', sup: '+', label: 'Học viên' },
        { value: '50', sup: '+', label: 'Khóa học AI' },
        { value: '4.9', sup: '★', label: 'Đánh giá TB' },
      ],
      /** Alt cho ảnh trong thẻ giảng viên nhỏ hero */
      instructorPhotoAlt: 'Chân dung ThS. Ngô Hữu Thống',
    },
    about: {
      badge1: 'Chuyên gia AI\nHàng đầu Việt Nam',
      badge2: '10,000+\nHọc viên',
      label: 'Giảng viên chính',
      name: 'Ngô Hữu Thống',
      degree: 'ThS. Quản lý Khoa học & Công nghệ · Cử nhân Luật · Kỹ sư Kỹ thuật Viễn thông',
      photoName: 'ThS. Ngô Hữu Thống',
      photoDegree: 'Thạc sỹ Quản lý KH&CN · Cử nhân Luật · Kỹ sư Viễn thông',
      bioParagraphs: [
        'ThS. Ngô Hữu Thống là một trong những chuyên gia hàng đầu trong lĩnh vực chuyển đổi số và ứng dụng Trí tuệ Nhân tạo tại Việt Nam, với hơn 10 năm kinh nghiệm tư vấn quản trị tài sản trí tuệ, tài sản số và phát triển doanh nghiệp.',
        'Hiện là Chủ tịch DIGISO và Viện trưởng AIoV, anh còn là sáng lập viên cộng đồng "Xóa Mù A.I" — nơi hàng nghìn người Việt học AI miễn phí, dễ hiểu, dễ áp dụng.',
      ],
      tags: [
        'ChatGPT & Prompt Engineering',
        'AI cho Kinh doanh',
        'Chuyển đổi số Giáo dục',
        'Sở hữu Trí tuệ',
        'Mạng lưới Trí thức trẻ VN',
        'Tư vấn Khởi nghiệp',
      ],
      stats: [
        { value: '10+', label: 'Năm kinh nghiệm chuyên sâu' },
        { value: '50+', label: 'Khóa học AI được phát triển' },
        { value: '100+', label: 'Hội thảo, workshop đã tổ chức' },
      ],
    },
    benefits: {
      eyebrow: 'Tại sao chọn Founder AI',
      title: 'Học AI thực chiến,',
      titleLine2: 'không lý thuyết suông',
      subtitle:
        'Mỗi khóa học được ThS. Ngô Hữu Thống thiết kế để bạn ứng dụng ngay vào công việc và cuộc sống — không cần nền tảng kỹ thuật.',
      items: [
        {
          title: 'Học theo lộ trình cá nhân',
          desc: 'Hệ thống gợi ý khóa học phù hợp với mục tiêu và nghề nghiệp của từng học viên.',
        },
        {
          title: 'Chứng chỉ có giá trị',
          desc: 'Chứng chỉ hoàn thành có mộc đỏ, được công nhận rộng rãi trong cộng đồng doanh nghiệp.',
        },
        {
          title: 'Hỗ trợ 24/7',
          desc: 'Đội ngũ hỗ trợ luôn sẵn sàng giải đáp mọi thắc mắc trong suốt quá trình học.',
        },
        {
          title: 'Học mọi lúc mọi nơi',
          desc: 'Truy cập trên máy tính, điện thoại, tablet — video bài giảng không giới hạn thời gian.',
        },
        {
          title: 'Giảng viên thực chiến',
          desc: 'Được dạy bởi ThS. Ngô Hữu Thống — chuyên gia đang ứng dụng AI trong thực tế hàng ngày.',
        },
        {
          title: 'Cập nhật liên tục',
          desc: 'Nội dung bài học được cập nhật theo các công cụ và xu hướng AI mới nhất.',
        },
      ],
    },
    courses: {
      eyebrow: 'Khóa học nổi bật',
      title: 'Bắt đầu từ đâu cũng được',
      subtitle: 'Từ ChatGPT cơ bản đến AI nâng cao — ThS. Ngô Hữu Thống có khóa học phù hợp cho mọi cấp độ.',
      items: [
        {
          tag: 'Phổ biến nhất',
          title: 'Xóa Mù A.I — Khóa học dành cho người chưa biết gì',
          imageUrl: null,
          linkUrl: 'https://founderai.biz/',
        },
        {
          tag: 'Marketing & Kinh doanh',
          title: 'Kích hoạt tiềm năng ChatGPT-4o trong mọi công việc',
          imageUrl: null,
          linkUrl: 'https://founderai.biz/',
        },
        {
          tag: 'Thiết kế trình bày',
          title: 'Thiết kế Slide PowerPoint bằng A.I từ A–Z',
          imageUrl: null,
          linkUrl: 'https://founderai.biz/',
        },
      ],
      linkLabel: 'founderai.biz →',
      carouselPrevAria: 'Xem khóa học trước',
      carouselNextAria: 'Xem khóa học tiếp theo',
      detailCtaLabel: 'Xem chi tiết',
    },
    testimonials: {
      eyebrow: 'Học viên nói gì',
      title: 'Kết quả thực tế từ cộng đồng Founder AI',
      carouselPrevAria: 'Xem đánh giá trước',
      carouselNextAria: 'Xem đánh giá tiếp',
      /** Nhãn ảnh minh chứng (không phải avatar) */
      proofImageTapHint: 'Bấm để xem lớn',
      /** Đóng xem ảnh phóng to */
      lightboxCloseAria: 'Đóng',
      items: [
        {
          id: 't1',
          quote:
            'Thầy Thống chia sẻ về AI và ChatGPT thật sự tuyệt vời, ứng dụng vào thực hành ngay và luôn. Khóa học giúp tôi hiểu bản chất để dùng AI hiệu quả, không còn mông lung nữa.',
          name: 'Trần Minh Hoàng',
          role: 'Nhân viên Marketing, Hà Nội',
          avatarClass: 'av1',
          initials: 'TH',
        },
        {
          id: 't2',
          quote:
            'Em xin cảm ơn thầy Thống vì những hướng dẫn quý báu về ứng dụng AI trong học tập và làm việc. Khóa học rất dễ hiểu, ai cũng có thể tiếp thu được.',
          name: 'Lê Ngọc Anh',
          role: 'Sinh viên, Đại học Bách Khoa',
          avatarClass: 'av2',
          initials: 'LA',
        },
        {
          id: 't3',
          quote:
            'Thầy cho mình thêm rất nhiều công cụ AI hữu ích mà trước đây không biết. Rất giá trị! Sẽ tiếp tục đăng ký thêm các khóa học của Founder AI & thầy Ngô Hữu Thống.',
          name: 'Phạm Quốc Việt',
          role: 'Freelancer, TP. Hồ Chí Minh',
          avatarClass: 'av3',
          initials: 'PQ',
        },
        {
          id: 't4',
          quote:
            'Sau khóa học tôi tự tin dùng AI cho báo cáo và email trình sếp. Nội dung sát thực tế, không lan man.',
          name: 'Nguyễn Thu Hà',
          role: 'Kế toán trưởng, Đà Nẵng',
          avatarClass: 'av4',
          initials: 'NH',
        },
        {
          id: 't5',
          quote:
            'Cộng đồng Founder AI rất nhiệt tình, hỏi gì cũng được giải đáp. Thầy Thống truyền cảm hứng để mình học đều mỗi tuần.',
          name: 'Hoàng Văn Tú',
          role: 'Kỹ sư xây dựng, Cần Thơ',
          avatarClass: 'av1',
          initials: 'HT',
        },
        {
          id: 't6',
          quote:
            'Tôi làm content và tiết kiệm được hơn nửa thời gian nhờ prompt và workflow thầy hướng dẫn. Đáng đồng tiền!',
          name: 'Đặng Thị Mai',
          role: 'Content Creator, TP.HCM',
          avatarClass: 'av2',
          initials: 'DM',
        },
        {
          id: 't7',
          quote:
            'Ban đầu sợ AI khó nhưng thầy chia nhỏ từng bước, giờ team tôi đã áp dụng trong họp và giao việc hàng ngày.',
          name: 'Vũ Đức Anh',
          role: 'Trưởng nhóm vận hành, Hà Nội',
          avatarClass: 'av3',
          initials: 'VA',
        },
      ],
    },
    finalCta: {
      title: 'Sẵn sàng chinh phục AI',
      titleLine2: 'cùng ThS. Ngô Hữu Thống?',
      subtitle: 'Tham gia ngay hôm nay và nhận ưu đãi đặc biệt cho học viên mới từ Founder AI.',
      button: 'Đăng ký tư vấn miễn phí',
      buttonSecondary: 'Xem tất cả khóa học',
    },
    footer: {
      tagline: '© 2026 Founder AI Education. Nền tảng học AI hàng đầu Việt Nam.',
      instructorLine: 'Giảng viên: ThS. Ngô Hữu Thống —',
      privacy: 'Chính sách bảo mật',
      ngohuuLink: 'ngohuuthong.com →',
      visitSite: 'Ghé thăm ngohuuthong.com',
    },
    form: {
      /** Tiêu đề gọn khi form nhúng iframe (không dùng eyebrow/cardTitle dài). */
      embedTitle: 'Đăng ký nhận thông tin và ưu đãi miễn phí',
      cardEyebrow: 'Nhận tư vấn miễn phí',
      cardTitleLine1: 'Bắt đầu hành trình AI',
      cardTitleLine2: 'của bạn ngay hôm nay',
      cardSubtitle:
        'Điền thông tin để nhận lộ trình học cá nhân hóa & ưu đãi độc quyền từ ThS. Ngô Hữu Thống.',
      lastName: 'Họ',
      firstName: 'Tên',
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
    nav: {
      brand: 'Founder AI',
      instructorPrefix: 'Instructor:',
      instructorName: 'M.Sc. Ngo Huu Thong',
      instructorPhotoAlt: 'M.Sc. Ngo Huu Thong',
      register: 'Register now',
      langVi: 'VI',
      langEn: 'EN',
    },
    hero: {
      eyebrowTag: 'AI No.1',
      eyebrowText: 'Vietnam’s leading AI learning platform',
      titleLine1: 'Master',
      titleHighlight: 'Artificial Intelligence',
      titleLine2: 'in',
      titleAccent: '30 days',
      subtitle:
        'Learn with M.Sc. Ngo Huu Thong — a leading AI expert with 10+ years of experience. Over 10,000 learners have transformed their careers with Founder AI.',
      instructorMini: {
        name: 'M.Sc. Ngo Huu Thong',
        title: 'AI & digital transformation expert',
        badge: 'Creator of Founder AI courses',
      },
      stats: [
        { value: '10K', sup: '+', label: 'Learners' },
        { value: '50', sup: '+', label: 'AI courses' },
        { value: '4.9', sup: '★', label: 'Avg. rating' },
      ],
      instructorPhotoAlt: 'Portrait of M.Sc. Ngo Huu Thong',
    },
    about: {
      badge1: 'Leading AI\nexpert in Vietnam',
      badge2: '10,000+\nlearners',
      label: 'Lead instructor',
      name: 'Ngo Huu Thong',
      degree:
        'M.Sc. in S&T Management · Bachelor of Law · Telecommunications Engineer',
      photoName: 'M.Sc. Ngo Huu Thong',
      photoDegree: 'M.Sc. · Law · Telecommunications',
      bioParagraphs: [
        'M.Sc. Ngo Huu Thong is one of Vietnam’s leading experts in digital transformation and applied AI, with over 10 years of experience advising on intellectual property, digital assets, and business growth.',
        'Chairman of DIGISO and Director of AIoV, he also founded the “AI Literacy” community where thousands of Vietnamese learn AI for free — simply and practically.',
      ],
      tags: [
        'ChatGPT & prompt engineering',
        'AI for business',
        'Digital transformation in education',
        'Intellectual property',
        'Young professionals network',
        'Startup advisory',
      ],
      stats: [
        { value: '10+', label: 'Years of deep expertise' },
        { value: '50+', label: 'AI courses developed' },
        { value: '100+', label: 'Talks & workshops' },
      ],
    },
    benefits: {
      eyebrow: 'Why Founder AI',
      title: 'Hands-on AI learning,',
      titleLine2: 'not theory only',
      subtitle:
        'Every course is designed by M.Sc. Ngo Huu Thong so you can apply skills immediately — no technical background required.',
      items: [
        {
          title: 'Personalized learning paths',
          desc: 'Recommendations aligned with your goals and profession.',
        },
        {
          title: 'Recognized certificates',
          desc: 'Completion certificates valued across the business community.',
        },
        {
          title: '24/7 support',
          desc: 'Our team answers questions throughout your journey.',
        },
        {
          title: 'Learn anywhere',
          desc: 'Access on desktop, phone, or tablet — unlimited replays.',
        },
        {
          title: 'Practitioner instructor',
          desc: 'Learn from an expert who uses AI in real work every day.',
        },
        {
          title: 'Always up to date',
          desc: 'Content evolves with the latest AI tools and trends.',
        },
      ],
    },
    courses: {
      eyebrow: 'Featured courses',
      title: 'Start from anywhere',
      subtitle: 'From ChatGPT basics to advanced AI — there is a course for every level.',
      items: [
        {
          tag: 'Most popular',
          title: 'AI Literacy — for complete beginners',
          imageUrl: null,
          linkUrl: 'https://founderai.biz/',
        },
        {
          tag: 'Marketing & business',
          title: 'Unlock ChatGPT-4o for everyday work',
          imageUrl: null,
          linkUrl: 'https://founderai.biz/',
        },
        {
          tag: 'Presentation design',
          title: 'PowerPoint slides with AI from A to Z',
          imageUrl: null,
          linkUrl: 'https://founderai.biz/',
        },
      ],
      linkLabel: 'founderai.biz →',
      carouselPrevAria: 'Previous course',
      carouselNextAria: 'Next course',
      detailCtaLabel: 'View details',
    },
    testimonials: {
      eyebrow: 'Learner voices',
      title: 'Real outcomes from the Founder AI community',
      carouselPrevAria: 'Previous testimonials',
      carouselNextAria: 'Next testimonials',
      proofImageTapHint: 'Tap to enlarge',
      lightboxCloseAria: 'Close',
      items: [
        {
          id: 't1',
          quote:
            'Thong’s sessions on AI and ChatGPT are excellent — practical from day one. I finally understand how to use AI effectively.',
          name: 'Tran Minh Hoang',
          role: 'Marketing, Hanoi',
          avatarClass: 'av1',
          initials: 'TH',
        },
        {
          id: 't2',
          quote:
            'Thank you for the guidance on using AI in study and work. The course is easy to follow for everyone.',
          name: 'Le Ngoc Anh',
          role: 'Student, Hanoi University of Science and Technology',
          avatarClass: 'av2',
          initials: 'LA',
        },
        {
          id: 't3',
          quote:
            'So many useful AI tools I never knew before. I will keep joining Founder AI and M.Sc. Ngo Huu Thong’s courses.',
          name: 'Pham Quoc Viet',
          role: 'Freelancer, Ho Chi Minh City',
          avatarClass: 'av3',
          initials: 'PQ',
        },
        {
          id: 't4',
          quote:
            'After the course I confidently use AI for reports and emails to leadership. The content is practical and focused.',
          name: 'Nguyen Thu Ha',
          role: 'Chief accountant, Da Nang',
          avatarClass: 'av4',
          initials: 'NH',
        },
        {
          id: 't5',
          quote:
            'The Founder AI community is supportive — questions always get answered. M.Sc. Thong inspires me to learn every week.',
          name: 'Hoang Van Tu',
          role: 'Civil engineer, Can Tho',
          avatarClass: 'av1',
          initials: 'HT',
        },
        {
          id: 't6',
          quote:
            'I work in content and save more than half my time thanks to the prompts and workflows taught in class. Worth it!',
          name: 'Dang Thi Mai',
          role: 'Content creator, Ho Chi Minh City',
          avatarClass: 'av2',
          initials: 'DM',
        },
        {
          id: 't7',
          quote:
            'I feared AI would be hard, but the teacher breaks it into steps. Now our team uses it in meetings and daily tasks.',
          name: 'Vu Duc Anh',
          role: 'Operations lead, Hanoi',
          avatarClass: 'av3',
          initials: 'VA',
        },
      ],
    },
    finalCta: {
      title: 'Ready to master AI',
      titleLine2: 'with M.Sc. Ngo Huu Thong?',
      subtitle: 'Join today and get a special offer for new Founder AI learners.',
      button: 'Free consultation',
      buttonSecondary: 'Browse all courses',
    },
    footer: {
      tagline: '© 2026 Founder AI Education. Vietnam’s leading AI learning platform.',
      instructorLine: 'Instructor: M.Sc. Ngo Huu Thong —',
      privacy: 'Privacy policy',
      ngohuuLink: 'ngohuuthong.com →',
      visitSite: 'Visit ngohuuthong.com',
    },
    form: {
      embedTitle: 'Sign up for information and free offers',
      cardEyebrow: 'Free consultation',
      cardTitleLine1: 'Start your AI journey',
      cardTitleLine2: 'today',
      cardSubtitle:
        'Share your details for a personalized roadmap and exclusive offers from M.Sc. Ngo Huu Thong.',
      lastName: 'Last name',
      firstName: 'First name',
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
