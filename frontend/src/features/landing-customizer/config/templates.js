/**
 * Landing Page Template Configuration
 * 
 * Mỗi landing page có cấu trúc:
 * - pageId: định danh page
 * - sections: mảng các section trong page
 *   - id: section id
 *   - label: tên hiển thị trong admin
 *   - elements: mảng các element có thể edit
 *     - key: storage key (section.elementName)
 *     - label: tên hiển thị
 *     - type: text | textarea | color | image | url | switch
 *     - defaultValue: giá trị mặc định
 *     - group: nhóm (để gom trong admin)
 */

const heroPageTemplate = {
  pageId: 'hero',
  pageName: 'Hero Page',
  pageNameVi: 'Trang Hero',
  path: '/',
  
  // Cấu hình background
  background: {
    type: 'video', // video | color | gradient | image
    videoUrl: 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260403_050628_c4e32401-fab4-4a27-b7a8-6e9291cd5959.mp4',
    fallbackColor: '#0a0a0a',
  },

  sections: [
    {
      id: 'hero_header',
      label: 'Header & Hero',
      labelVi: 'Header & Hero',
      elements: [
        { key: 'hero.tagline', label: 'Badge Text', labelVi: 'Badge', type: 'text', defaultValue: '🚀 Ứng dụng AI hàng đầu' },
        { key: 'hero.titleLine1', label: 'Title Line 1', labelVi: 'Tiêu đề dòng 1', type: 'text', defaultValue: 'Tạo Nội Dung' },
        { key: 'hero.titleAccent', label: 'Title Accent (Italic)', labelVi: 'Tiêu đề nhấn (In nghiêng)', type: 'text', defaultValue: 'Thông Minh' },
        { key: 'hero.titleLine2', label: 'Title Line 2', labelVi: 'Tiêu đề dòng 2', type: 'text', defaultValue: 'Trong Vài Giây' },
        { key: 'hero.subtitle', label: 'Subtitle', labelVi: 'Phụ đề', type: 'textarea', defaultValue: 'Công cụ AI giúp bạn tạo content chuyên nghiệp cho Zalo, Email, Landing Page chỉ trong vài giây.' },
      ],
    },
    {
      id: 'hero_stats',
      label: 'Statistics',
      labelVi: 'Thống kê',
      elements: [
        { key: 'stats.title', label: 'Section Title', labelVi: 'Tiêu đề', type: 'text', defaultValue: 'Được tin tưởng bởi' },
        { key: 'stats.businesses', label: 'Businesses Value', labelVi: 'Doanh nghiệp', type: 'text', defaultValue: '1,500+' },
        { key: 'stats.businessesLabel', label: 'Businesses Label', labelVi: 'Nhãn doanh nghiệp', type: 'text', defaultValue: 'Doanh nghiệp' },
        { key: 'stats.leads', label: 'Leads Value', labelVi: 'Leads', type: 'text', defaultValue: '5M+' },
        { key: 'stats.leadsLabel', label: 'Leads Label', labelVi: 'Nhãn leads', type: 'text', defaultValue: 'Leads đã gửi' },
        { key: 'stats.campaigns', label: 'Campaigns Value', labelVi: 'Chiến dịch', type: 'text', defaultValue: '500+' },
        { key: 'stats.campaignsLabel', label: 'Campaigns Label', labelVi: 'Nhãn chiến dịch', type: 'text', defaultValue: 'Chiến dịch' },
        { key: 'stats.uptime', label: 'Uptime Value', labelVi: 'Uptime', type: 'text', defaultValue: '99.9%' },
        { key: 'stats.uptimeLabel', label: 'Uptime Label', labelVi: 'Nhãn uptime', type: 'text', defaultValue: 'Uptime' },
      ],
    },
    {
      id: 'hero_features',
      label: 'Features',
      labelVi: 'Tính năng',
      elements: [
        { key: 'features.badge', label: 'Badge', labelVi: 'Badge', type: 'text', defaultValue: 'Tính năng' },
        { key: 'features.title', label: 'Title', labelVi: 'Tiêu đề', type: 'text', defaultValue: 'Mọi Thứ Bạn Cần Để' },
        { key: 'features.titleHighlight', label: 'Title Highlight', labelVi: 'Tiêu đề nhấn', type: 'text', defaultValue: 'Tiếp Cận Khách Hàng' },
        { key: 'features.subtitle', label: 'Subtitle', labelVi: 'Phụ đề', type: 'textarea', defaultValue: 'Giải pháp toàn diện giúp doanh nghiệp tiếp cận khách hàng mới một cách hiệu quả.' },
        
        // Feature 1
        { key: 'features.f1.icon', label: 'Feature 1 - Icon', labelVi: 'Tính năng 1 - Icon', type: 'text', defaultValue: 'FaLaptopCode' },
        { key: 'features.f1.title', label: 'Feature 1 - Title', labelVi: 'Tính năng 1 - Tiêu đề', type: 'text', defaultValue: 'Tạo Content Tự Động' },
        { key: 'features.f1.desc', label: 'Feature 1 - Description', labelVi: 'Tính năng 1 - Mô tả', type: 'textarea', defaultValue: 'AI tạo content chuyên nghiệp cho Zalo, Email, Landing Page từ vài từ khóa.' },
        { key: 'features.f1.color', label: 'Feature 1 - Color', labelVi: 'Tính năng 1 - Màu', type: 'color', defaultValue: '#ef4d23' },
        
        // Feature 2
        { key: 'features.f2.icon', label: 'Feature 2 - Icon', labelVi: 'Tính năng 2 - Icon', type: 'text', defaultValue: 'FaEnvelope' },
        { key: 'features.f2.title', label: 'Feature 2 - Title', labelVi: 'Tính năng 2 - Tiêu đề', type: 'text', defaultValue: 'Email Marketing' },
        { key: 'features.f2.desc', label: 'Feature 2 - Description', labelVi: 'Tính năng 2 - Mô tả', type: 'textarea', defaultValue: 'Thiết kế và gửi email marketing chuyên nghiệp với tỷ lệ mở cao.' },
        { key: 'features.f2.color', label: 'Feature 2 - Color', labelVi: 'Tính năng 2 - Màu', type: 'color', defaultValue: '#dc2626' },
        
        // Feature 3
        { key: 'features.f3.icon', label: 'Feature 3 - Icon', labelVi: 'Tính năng 3 - Icon', type: 'text', defaultValue: 'FaComments' },
        { key: 'features.f3.title', label: 'Feature 3 - Title', labelVi: 'Tính năng 3 - Tiêu đề', type: 'text', defaultValue: 'Zalo OA Marketing' },
        { key: 'features.f3.desc', label: 'Feature 3 - Description', labelVi: 'Tính năng 3 - Mô tả', type: 'textarea', defaultValue: 'Gửi tin nhắn Zalo OA hàng loạt, tự động hóa quy trình chăm sóc khách hàng.' },
        { key: 'features.f3.color', label: 'Feature 3 - Color', labelVi: 'Tính năng 3 - Màu', type: 'color', defaultValue: '#f59e0b' },
        
        // Feature 4
        { key: 'features.f4.icon', label: 'Feature 4 - Icon', labelVi: 'Tính năng 4 - Icon', type: 'text', defaultValue: 'FaUsers' },
        { key: 'features.f4.title', label: 'Feature 4 - Title', labelVi: 'Tính năng 4 - Tiêu đề', type: 'text', defaultValue: 'Quản Lý Khách Hàng' },
        { key: 'features.f4.desc', label: 'Feature 4 - Description', labelVi: 'Tính năng 4 - Mô tả', type: 'textarea', defaultValue: 'Lưu trữ và quản lý thông tin khách hàng tiềm năng một cách hiệu quả.' },
        { key: 'features.f4.color', label: 'Feature 4 - Color', labelVi: 'Tính năng 4 - Màu', type: 'color', defaultValue: '#f43f5e' },
        
        // Feature 5
        { key: 'features.f5.icon', label: 'Feature 5 - Icon', labelVi: 'Tính năng 5 - Icon', type: 'text', defaultValue: 'FaChartBar' },
        { key: 'features.f5.title', label: 'Feature 5 - Title', labelVi: 'Tính năng 5 - Tiêu đề', type: 'text', defaultValue: 'Báo Cáo Chi Tiết' },
        { key: 'features.f5.desc', label: 'Feature 5 - Description', labelVi: 'Tính năng 5 - Mô tả', type: 'textarea', defaultValue: 'Theo dõi hiệu quả chiến dịch với báo cáo trực quan, chi tiết.' },
        { key: 'features.f5.color', label: 'Feature 5 - Color', labelVi: 'Tính năng 5 - Màu', type: 'color', defaultValue: '#fb923c' },
        
        // Feature 6
        { key: 'features.f6.icon', label: 'Feature 6 - Icon', labelVi: 'Tính năng 6 - Icon', type: 'text', defaultValue: 'FaShieldAlt' },
        { key: 'features.f6.title', label: 'Feature 6 - Title', labelVi: 'Tính năng 6 - Tiêu đề', type: 'text', defaultValue: 'Bảo Mật Cao' },
        { key: 'features.f6.desc', label: 'Feature 6 - Description', labelVi: 'Tính năng 6 - Mô tả', type: 'textarea', defaultValue: 'Dữ liệu được mã hóa và bảo mật theo tiêu chuẩn quốc tế.' },
        { key: 'features.f6.color', label: 'Feature 6 - Color', labelVi: 'Tính năng 6 - Màu', type: 'color', defaultValue: '#475569' },
      ],
    },
    {
      id: 'hero_steps',
      label: 'How It Works',
      labelVi: 'Quy trình',
      elements: [
        { key: 'steps.badge', label: 'Badge', labelVi: 'Badge', type: 'text', defaultValue: 'Quy Trình' },
        { key: 'steps.title', label: 'Title', labelVi: 'Tiêu đề', type: 'text', defaultValue: 'Chỉ Cần 4 Bước Để' },
        { key: 'steps.subtitle', label: 'Subtitle', labelVi: 'Phụ đề', type: 'text', defaultValue: 'Bắt Đầu' },
        
        // Step 1
        { key: 'steps.s1.number', label: 'Step 1 - Number', labelVi: 'Bước 1 - Số', type: 'text', defaultValue: '01' },
        { key: 'steps.s1.icon', label: 'Step 1 - Icon', labelVi: 'Bước 1 - Icon', type: 'text', defaultValue: 'FaBolt' },
        { key: 'steps.s1.title', label: 'Step 1 - Title', labelVi: 'Bước 1 - Tiêu đề', type: 'text', defaultValue: 'Đăng Ký' },
        { key: 'steps.s1.desc', label: 'Step 1 - Description', labelVi: 'Bước 1 - Mô tả', type: 'textarea', defaultValue: 'Tạo tài khoản miễn phí trong 30 giây.' },
        
        // Step 2
        { key: 'steps.s2.number', label: 'Step 2 - Number', labelVi: 'Bước 2 - Số', type: 'text', defaultValue: '02' },
        { key: 'steps.s2.icon', label: 'Step 2 - Icon', labelVi: 'Bước 2 - Icon', type: 'text', defaultValue: 'FaCogs' },
        { key: 'steps.s2.title', label: 'Step 2 - Title', labelVi: 'Bước 2 - Tiêu đề', type: 'text', defaultValue: 'Kết Nối' },
        { key: 'steps.s2.desc', label: 'Step 2 - Description', labelVi: 'Bước 2 - Mô tả', type: 'textarea', defaultValue: 'Kết nối Zalo OA và Email của bạn.' },
        
        // Step 3
        { key: 'steps.s3.number', label: 'Step 3 - Number', labelVi: 'Bước 3 - Số', type: 'text', defaultValue: '03' },
        { key: 'steps.s3.icon', label: 'Step 3 - Icon', labelVi: 'Bước 3 - Icon', type: 'text', defaultValue: 'FaRocket' },
        { key: 'steps.s3.title', label: 'Step 3 - Title', labelVi: 'Bước 3 - Tiêu đề', type: 'text', defaultValue: 'Tạo Content' },
        { key: 'steps.s3.desc', label: 'Step 3 - Description', labelVi: 'Bước 3 - Mô tả', type: 'textarea', defaultValue: 'Sử dụng AI để tạo nội dung cho chiến dịch.' },
        
        // Step 4
        { key: 'steps.s4.number', label: 'Step 4 - Number', labelVi: 'Bước 4 - Số', type: 'text', defaultValue: '04' },
        { key: 'steps.s4.icon', label: 'Step 4 - Icon', labelVi: 'Bước 4 - Icon', type: 'text', defaultValue: 'FaChartBar' },
        { key: 'steps.s4.title', label: 'Step 4 - Title', labelVi: 'Bước 4 - Tiêu đề', type: 'text', defaultValue: 'Gửi & Theo Dõi' },
        { key: 'steps.s4.desc', label: 'Step 4 - Description', labelVi: 'Bước 4 - Mô tả', type: 'textarea', defaultValue: 'Gửi chiến dịch và theo dõi kết quả.' },
      ],
    },
    {
      id: 'hero_benefits',
      label: 'Benefits',
      labelVi: 'Lợi ích',
      elements: [
        { key: 'benefits.title', label: 'Section Title', labelVi: 'Tiêu đề', type: 'text', defaultValue: 'Tại Sao Chọn Chúng Tôi?' },
        
        // Benefit 1
        { key: 'benefits.b1.icon', label: 'Benefit 1 - Icon', labelVi: 'Lợi ích 1 - Icon', type: 'text', defaultValue: 'FaRocket' },
        { key: 'benefits.b1.title', label: 'Benefit 1 - Title', labelVi: 'Lợi ích 1 - Tiêu đề', type: 'text', defaultValue: 'Nhanh Chóng' },
        { key: 'benefits.b1.desc', label: 'Benefit 1 - Description', labelVi: 'Lợi ích 1 - Mô tả', type: 'textarea', defaultValue: 'Tạo content trong vài giây thay vì hàng giờ.' },
        
        // Benefit 2
        { key: 'benefits.b2.icon', label: 'Benefit 2 - Icon', labelVi: 'Lợi ích 2 - Icon', type: 'text', defaultValue: 'FaHeadset' },
        { key: 'benefits.b2.title', label: 'Benefit 2 - Title', labelVi: 'Lợi ích 2 - Tiêu đề', type: 'text', defaultValue: 'Hỗ Trợ 24/7' },
        { key: 'benefits.b2.desc', label: 'Benefit 2 - Description', labelVi: 'Lợi ích 2 - Mô tả', type: 'textarea', defaultValue: 'Đội ngũ hỗ trợ luôn sẵn sàng giúp bạn.' },
        
        // Benefit 3
        { key: 'benefits.b3.icon', label: 'Benefit 3 - Icon', labelVi: 'Lợi ích 3 - Icon', type: 'text', defaultValue: 'FaHandshake' },
        { key: 'benefits.b3.title', label: 'Benefit 3 - Title', labelVi: 'Lợi ích 3 - Tiêu đề', type: 'text', defaultValue: 'Dễ Sử Dụng' },
        { key: 'benefits.b3.desc', label: 'Benefit 3 - Description', labelVi: 'Lợi ích 3 - Mô tả', type: 'textarea', defaultValue: 'Giao diện trực quan, ai cũng có thể dùng.' },
        
        // Benefit 4
        { key: 'benefits.b4.icon', label: 'Benefit 4 - Icon', labelVi: 'Lợi ích 4 - Icon', type: 'text', defaultValue: 'FaCheckCircle' },
        { key: 'benefits.b4.title', label: 'Benefit 4 - Title', labelVi: 'Lợi ích 4 - Tiêu đề', type: 'text', defaultValue: 'Hiệu Quả Cao' },
        { key: 'benefits.b4.desc', label: 'Benefit 4 - Description', labelVi: 'Lợi ích 4 - Mô tả', type: 'textarea', defaultValue: 'Content chất lượng cao, tỷ lệ chuyển đổi tốt.' },
      ],
    },
    {
      id: 'hero_cta',
      label: 'CTA Section',
      labelVi: 'Phần CTA',
      elements: [
        { key: 'cta.title', label: 'Title', labelVi: 'Tiêu đề', type: 'text', defaultValue: 'Sẵn Sàng Bắt Đầu?' },
        { key: 'cta.subtitle', label: 'Subtitle', labelVi: 'Phụ đề', type: 'text', defaultValue: 'Đăng ký miễn phí và trải nghiệm ngay hôm nay' },
        { key: 'cta.button', label: 'Button Text', labelVi: 'Nút bấm', type: 'text', defaultValue: 'Bắt Đầu Miễn Phí' },
        { key: 'cta.note', label: 'Note Below Button', labelVi: 'Ghi chú dưới nút', type: 'text', defaultValue: 'Không cần thẻ tín dụng' },
        { key: 'cta.primaryColor', label: 'Primary Color', labelVi: 'Màu chính', type: 'color', defaultValue: '#f97316' },
      ],
    },
  ],
};

const contactPageTemplate = {
  pageId: 'contact',
  pageName: 'Contact Page',
  pageNameVi: 'Trang Liên hệ',
  path: '/contact',
  
  sections: [
    {
      id: 'contact_header',
      label: 'Header',
      labelVi: 'Header',
      elements: [
        { key: 'contact.title', label: 'Title', labelVi: 'Tiêu đề', type: 'text', defaultValue: 'Liên Hệ Với Chúng Tôi' },
        { key: 'contact.subtitle', label: 'Subtitle', labelVi: 'Phụ đề', type: 'textarea', defaultValue: 'Đội ngũ của chúng tôi luôn sẵn sàng hỗ trợ bạn 24/7' },
      ],
    },
    {
      id: 'contact_info',
      label: 'Contact Info',
      labelVi: 'Thông tin liên hệ',
      elements: [
        // Email
        { key: 'contact.email.label', label: 'Email - Label', labelVi: 'Email - Nhãn', type: 'text', defaultValue: 'Email' },
        { key: 'contact.email.value', label: 'Email - Value', labelVi: 'Email - Giá trị', type: 'text', defaultValue: 'hello@founderai.vn' },
        { key: 'contact.email.desc', label: 'Email - Description', labelVi: 'Email - Mô tả', type: 'text', defaultValue: 'Phản hồi trong 24h' },
        
        // Hotline
        { key: 'contact.hotline.label', label: 'Hotline - Label', labelVi: 'Hotline - Nhãn', type: 'text', defaultValue: 'Hotline' },
        { key: 'contact.hotline.value', label: 'Hotline - Value', labelVi: 'Hotline - Giá trị', type: 'text', defaultValue: '1900 6868' },
        { key: 'contact.hotline.desc', label: 'Hotline - Description', labelVi: 'Hotline - Mô tả', type: 'text', defaultValue: 'Tư vấn 24/7' },
        
        // Zalo
        { key: 'contact.zalo.label', label: 'Zalo - Label', labelVi: 'Zalo - Nhãn', type: 'text', defaultValue: 'Zalo' },
        { key: 'contact.zalo.value', label: 'Zalo - Value', labelVi: 'Zalo - Giá trị', type: 'text', defaultValue: 'Founder AI' },
        { key: 'contact.zalo.desc', label: 'Zalo - Description', labelVi: 'Zalo - Mô tả', type: 'text', defaultValue: 'Chat nhanh' },
        
        // Office
        { key: 'contact.office.label', label: 'Office - Label', labelVi: 'Văn phòng - Nhãn', type: 'text', defaultValue: 'Văn phòng' },
        { key: 'contact.office.value', label: 'Office - Value', labelVi: 'Văn phòng - Giá trị', type: 'textarea', defaultValue: 'Tầng 15, Tòa nhà ABC, 123 Nguyễn Huệ, Quận 1, TP.HCM' },
        { key: 'contact.office.desc', label: 'Office - Description', labelVi: 'Văn phòng - Mô tả', type: 'text', defaultValue: 'Thứ 2 - Thứ 6: 8h - 18h' },
      ],
    },
    {
      id: 'contact_form',
      label: 'Form',
      labelVi: 'Form liên hệ',
      elements: [
        { key: 'contact.form.title', label: 'Form Title', labelVi: 'Tiêu đề form', type: 'text', defaultValue: 'Gửi Tin Nhắn' },
        { key: 'contact.form.subtitle', label: 'Form Subtitle', labelVi: 'Phụ đề form', type: 'text', defaultValue: 'Chúng tôi sẽ liên hệ lại với bạn sớm nhất' },
      ],
    },
    {
      id: 'contact_cta',
      label: 'CTA Box',
      labelVi: 'Hộp CTA',
      elements: [
        { key: 'contact.cta.title', label: 'Title', labelVi: 'Tiêu đề', type: 'text', defaultValue: 'Sẵn Sàng Bắt Đầu?' },
        { key: 'contact.cta.subtitle', label: 'Subtitle', labelVi: 'Phụ đề', type: 'text', defaultValue: 'Dùng thử miễn phí 14 ngày' },
        { key: 'contact.cta.button1', label: 'Button 1 Text', labelVi: 'Nút 1', type: 'text', defaultValue: 'Đăng ký miễn phí' },
        { key: 'contact.cta.button2', label: 'Button 2 Text', labelVi: 'Nút 2', type: 'text', defaultValue: 'Xem bảng giá' },
      ],
    },
  ],
};

const pricingPageTemplate = {
  pageId: 'pricing',
  pageName: 'Pricing Page',
  pageNameVi: 'Trang Bảng giá',
  path: '/pricing',
  
  sections: [
    {
      id: 'pricing_header',
      label: 'Header',
      labelVi: 'Header',
      elements: [
        { key: 'pricing.badge', label: 'Badge', labelVi: 'Badge', type: 'text', defaultValue: 'Bảng Giá' },
        { key: 'pricing.title', label: 'Title', labelVi: 'Tiêu đề', type: 'text', defaultValue: 'Chọn Gói Phù Hợp' },
        { key: 'pricing.titleHighlight', label: 'Title Highlight', labelVi: 'Tiêu đề nhấn', type: 'text', defaultValue: 'Với Bạn' },
        { key: 'pricing.subtitle', label: 'Subtitle', labelVi: 'Phụ đề', type: 'textarea', defaultValue: 'Gói giá linh hoạt, phù hợp với mọi nhu cầu' },
      ],
    },
    {
      id: 'pricing_billing',
      label: 'Billing Toggle',
      labelVi: 'Chuyển đổi thanh toán',
      elements: [
        { key: 'pricing.monthlyLabel', label: 'Monthly Label', labelVi: 'Nhãn hàng tháng', type: 'text', defaultValue: 'Hàng tháng' },
        { key: 'pricing.yearlyLabel', label: 'Yearly Label', labelVi: 'Nhãn hàng năm', type: 'text', defaultValue: 'Hàng năm' },
        { key: 'pricing.saveLabel', label: 'Save Label', labelVi: 'Nhãn tiết kiệm', type: 'text', defaultValue: 'Tiết kiệm' },
        { key: 'pricing.perMonth', label: 'Per Month', labelVi: 'Mỗi tháng', type: 'text', defaultValue: '/ tháng' },
        { key: 'pricing.perYear', label: 'Per Year', labelVi: 'Mỗi năm', type: 'text', defaultValue: '/ năm' },
      ],
    },
    {
      id: 'pricing_plans',
      label: 'Plans (Read from DB)',
      labelVi: 'Các gói (đọc từ DB)',
      elements: [
        // Note: Plans are read from database, not editable here
        // But we can configure the CTA texts
        { key: 'pricing.startTrial', label: 'Start Trial Button', labelVi: 'Nút dùng thử', type: 'text', defaultValue: 'Dùng thử miễn phí' },
        { key: 'pricing.choosePlan', label: 'Choose Plan Button', labelVi: 'Nút chọn gói', type: 'text', defaultValue: 'Chọn gói này' },
        { key: 'pricing.getQuote', label: 'Get Quote Button', labelVi: 'Nút liên hệ', type: 'text', defaultValue: 'Liên hệ báo giá' },
        { key: 'pricing.mostPopular', label: 'Most Popular Badge', labelVi: 'Badge phổ biến', type: 'text', defaultValue: 'Phổ biến nhất' },
      ],
    },
    {
      id: 'pricing_trial',
      label: 'Trial Offer',
      labelVi: 'Ưu đãi dùng thử',
      elements: [
        { key: 'pricing.trialOffer', label: 'Trial Offer Text', labelVi: 'Text ưu đãi', type: 'text', defaultValue: '⭐ Dùng thử miễn phí 14 ngày - Không cần thẻ tín dụng' },
      ],
    },
  ],
};

// Export all templates
export const LANDING_PAGE_TEMPLATES = {
  hero: heroPageTemplate,
  contact: contactPageTemplate,
  pricing: pricingPageTemplate,
};

// Get template by page ID
export const getTemplate = (pageId) => LANDING_PAGE_TEMPLATES[pageId] || null;

// Get all templates
export const getAllTemplates = () => Object.values(LANDING_PAGE_TEMPLATES);

// Get default values from template
export const getDefaultValues = (pageId) => {
  const template = getTemplate(pageId);
  if (!template) return {};
  
  const defaults = {};
  template.sections.forEach(section => {
    section.elements.forEach(el => {
      defaults[el.key] = el.defaultValue;
    });
  });
  
  return defaults;
};

// Get all editable keys for a page
export const getEditableKeys = (pageId) => {
  const template = getTemplate(pageId);
  if (!template) return [];
  
  return template.sections.flatMap(section => 
    section.elements.map(el => ({
      key: el.key,
      label: el.label,
      labelVi: el.labelVi,
      type: el.type,
      section: section.label,
      sectionVi: section.labelVi,
    }))
  );
};

// Group elements by section for admin form
export const getGroupedElements = (pageId) => {
  const template = getTemplate(pageId);
  if (!template) return {};
  
  const grouped = {};
  template.sections.forEach(section => {
    grouped[section.id] = {
      label: section.label,
      labelVi: section.labelVi,
      elements: section.elements.map(el => ({
        key: el.key,
        label: el.label,
        labelVi: el.labelVi,
        type: el.type,
        defaultValue: el.defaultValue,
      })),
    };
  });
  
  return grouped;
};

export default LANDING_PAGE_TEMPLATES;
