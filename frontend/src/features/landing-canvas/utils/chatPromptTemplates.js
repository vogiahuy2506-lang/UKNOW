/**
 * Quick-pick AI templates — copy từ LandingPageFullEditor AI_TEMPLATES.
 * Hiển thị khi chat panel rỗng (messages.length === 0).
 */
export const CHAT_QUICK_PICKS = [
  {
    id: 'saas',
    name: 'SaaS / Phần mềm',
    shortDesc: 'Landing chuyên nghiệp cho sản phẩm tech',
    iconName: 'code',
    color: '#3b82f6',
    prompt:
      'Tạo landing page cho một sản phẩm SaaS với các section: Hero với headline mạnh, Tính năng chính 3 cột, Đánh giá khách hàng, FAQ, Form đăng ký, và Footer. Sử dụng tone chuyên nghiệp, hiện đại.',
  },
  {
    id: 'course',
    name: 'Khóa học online',
    shortDesc: 'Trang bán khóa học hiệu quả',
    iconName: 'lightbulb',
    color: '#8b5cf6',
    prompt:
      'Tạo landing page cho khóa học online với: Hero với tiêu đề hấp dẫn, Giới thiệu khóa học, Lợi ích khi học, Testimonials từ học viên, FAQ, Form đăng ký, và Footer. Sử dụng tone truyền cảm hứng, đáng tin cậy.',
  },
  {
    id: 'ecommerce',
    name: 'Cửa hàng online',
    shortDesc: 'Giới thiệu sản phẩm bán hàng',
    iconName: 'sparkles',
    color: '#10b981',
    prompt:
      'Tạo landing page cho cửa hàng online với: Hero với sản phẩm nổi bật, Cam kết của cửa hàng, Danh mục sản phẩm, Đánh giá khách hàng, Ưu đãi đặc biệt, Form liên hệ, và Footer. Sử dụng tone thân thiện, đáng tin.',
  },
  {
    id: 'agency',
    name: 'Dịch vụ / Agency',
    shortDesc: 'Portfolio dịch vụ chuyên nghiệp',
    iconName: 'pencil',
    color: '#f59e0b',
    prompt:
      'Tạo landing page cho agency dịch vụ với: Hero với USP rõ ràng, Dịch vụ cung cấp, Case study thành công, Đội ngũ chuyên gia, Quy trình làm việc, Form tư vấn, và Footer. Sử dụng tone chuyên nghiệp, đáng tin.',
  },
  {
    id: 'event',
    name: 'Sự kiện / Hội thảo',
    shortDesc: 'Trang đăng ký sự kiện',
    iconName: 'photo',
    color: '#ec4899',
    prompt:
      'Tạo landing page cho sự kiện/hội thảo với: Hero với thông tin sự kiện, Diễn giả nổi bật, Lịch trình sự kiện, Địa điểm và thời gian, Testimonials, Form đăng ký tham gia, và Footer. Sử dụng tone năng động, hấp dẫn.',
  },
  {
    id: 'portfolio',
    name: 'Portfolio cá nhân',
    shortDesc: 'Giới thiệu bản thân ấn tượng',
    iconName: 'color',
    color: '#06b6d4',
    prompt:
      'Tạo landing page portfolio cá nhân với: Hero với ảnh và tagline, Giới thiệu bản thân, Kinh nghiệm & kỹ năng, Dự án nổi bật, Liên hệ, và Footer. Sử dụng tone chuyên nghiệp, sáng tạo.',
  },
];
