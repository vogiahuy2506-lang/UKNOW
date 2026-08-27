// Mock conversation data for trial demo
// 3 flows: campaign creation, message template, landing page
// Supports bilingual: vi (Vietnamese) and en (English)

export const MOCK_CONVERSATIONS = {
  vi: {
    campaign: {
      title: 'Tạo chiến dịch',
      description: 'Tạo chiến dịch marketing tự động với AI',
      icon: 'campaign',
      steps: [
        {
          role: 'bot',
          content: 'Chào bạn! Tôi là Founder AI Assistant. Tôi có thể giúp bạn tạo chiến dịch marketing hiệu quả.\n\nBạn muốn tạo chiến dịch gửi qua kênh nào?',
          cards: [
            {
              type: 'channel_picker',
              options: [
                { id: 'email', label: 'Email', icon: 'email' },
                { id: 'zalo', label: 'Zalo cá nhân', icon: 'zalo' },
                { id: 'zalo_group', label: 'Zalo nhóm', icon: 'zalo_group' },
              ],
            },
          ],
        },
        {
          role: 'user',
          content: 'Tôi muốn gửi qua Zalo cá nhân',
          displayed: 'Tôi muốn gửi qua Zalo cá nhân',
        },
        {
          role: 'bot',
          content: 'Tuyệt vời! Để bắt đầu, tôi cần bạn kết nối tài khoản Zalo cá nhân của mình.\n\nBạn đã có tài khoản Zalo chưa?',
          cards: [
            {
              type: 'action_buttons',
              options: [
                { id: 'connect', label: 'Kết nối Zalo', variant: 'primary' },
                { id: 'skip', label: 'Bỏ qua', variant: 'secondary' },
              ],
            },
          ],
        },
        {
          role: 'user',
          content: 'Kết nối Zalo OA',
          displayed: 'Kết nối Zalo OA',
        },
        {
          role: 'bot',
          content: 'Đã kết nối thành công tài khoản **UKNOW Official**!\n\nBây giờ, bạn muốn gửi tin nhắn đến đối tượng nào?',
          cards: [
            {
              type: 'data_source_picker',
              options: [
                { id: 'landing', label: 'Khách đăng ký từ Landing Page', icon: 'landing' },
                { id: 'sheet', label: 'Danh sách từ Excel/Sheet', icon: 'sheet' },
                { id: 'existing', label: 'Danh sách khách hàng có sẵn', icon: 'db' },
              ],
            },
          ],
        },
        {
          role: 'user',
          content: 'Gửi cho khách đăng ký từ Landing Page',
          displayed: 'Gửi cho khách đăng ký từ Landing Page',
        },
        {
          role: 'bot',
          content: 'Đã sẵn sàng! Tôi sẽ tạo chiến dịch gửi đến **150 khách hàng** từ Landing Page.\n\nHãy mô tả nội dung tin nhắn bạn muốn gửi, hoặc để tôi giúp bạn soạn?',
          cards: [
            {
              type: 'template_suggestions',
              suggestions: [
                'Mẫu chào hàng',
                'Mẫu chương trình khuyến mãi',
                'Mẫu giới thiệu sản phẩm mới',
              ],
            },
          ],
        },
        {
          role: 'user',
          content: 'Tạo mẫu chương trình khuyến mãi',
          displayed: 'Tạo mẫu chương trình khuyến mãi',
        },
        {
          role: 'bot',
          content: 'Đây là mẫu tin nhắn tôi đã soạn cho bạn:\n\n---\n**CHƯƠNG TRÌNH KHUYẾN MÃI ĐẶC BIỆT**\n\nXin chào {{name}}!\n\nUKNOW gửi bạn ưu đãi **GIẢM 30%** cho tất cả các khóa học trong tháng này.\n\n🎁 Mã giảm giá: **SUMMER30**\n⏰ Hạn sử dụng: 30/08/2026\n\nĐăng ký ngay: https://uknow.vn/dang-ky\n\n---\n\nBạn có muốn điều chỉnh gì không?',
          cards: [
            {
              type: 'action_buttons',
              options: [
                { id: 'approve', label: 'Đồng ý', variant: 'primary' },
                { id: 'edit', label: 'Chỉnh sửa', variant: 'secondary' },
                { id: 'regenerate', label: 'Tạo lại', variant: 'secondary' },
              ],
            },
          ],
        },
        {
          role: 'user',
          content: 'Đồng ý',
          displayed: 'Đồng ý',
        },
        {
          role: 'bot',
          content: 'Chiến dịch đã được tạo thành công! 🎉\n\n**Chiến dịch:** Khuyến mãi Summer 2026\n**Kênh:** Zalo cá nhân\n**Người nhận:** 150 khách hàng\n**Thời gian gửi:** Ngay bây giờ\n\nChiến dịch sẽ bắt đầu gửi trong giây lát.',
          cards: [
            {
              type: 'campaign_result',
              status: 'success',
              stats: {
                sent: 0,
                pending: 150,
                delivered: 0,
                failed: 0,
              },
            },
          ],
        },
      ],
    },

    template: {
      title: 'Soạn mẫu tin',
      description: 'Soạn mẫu tin nhắn chuyên nghiệp với AI',
      icon: 'template',
      steps: [
        {
          role: 'bot',
          content: 'Chào bạn! Tôi có thể giúp bạn soạn mẫu tin nhắn chuyên nghiệp cho Zalo hoặc Email.\n\nBạn muốn tạo mẫu tin cho kênh nào?',
          cards: [
            {
              type: 'channel_picker',
              options: [
                { id: 'zalo', label: 'Zalo', icon: 'zalo' },
                { id: 'email', label: 'Email', icon: 'email' },
              ],
            },
          ],
        },
        {
          role: 'user',
          content: 'Tạo mẫu Zalo',
          displayed: 'Tạo mẫu Zalo',
        },
        {
          role: 'bot',
          content: 'Bạn muốn tạo mẫu tin cho mục đích gì?',
          cards: [
            {
              type: 'template_type_picker',
              options: [
                { id: 'welcome', label: 'Chào mừng khách hàng mới', icon: 'wave' },
                { id: 'promotion', label: 'Khuyến mãi / Ưu đãi', icon: 'gift' },
                { id: 'followup', label: 'Theo dõi / Chăm sóc khách', icon: 'heart' },
                { id: 'announcement', label: 'Thông báo / Cập nhật', icon: 'megaphone' },
              ],
            },
          ],
        },
        {
          role: 'user',
          content: 'Tạo mẫu khuyến mãi',
          displayed: 'Tạo mẫu khuyến mãi',
        },
        {
          role: 'bot',
          content: 'Hãy cho tôi biết thêm về chương trình khuyến mãi của bạn:\n\n- Tên chương trình?\n- Mức giảm giá / ưu đãi?\n- Thời hạn?\n- Sản phẩm/dịch vụ được áp dụng?',
        },
        {
          role: 'user',
          content: 'Chương trình Summer Sale, giảm 25%, hết hạn 31/08, áp dụng tất cả khóa học',
          displayed: 'Chương trình Summer Sale, giảm 25%, hết hạn 31/08, áp dụng tất cả khóa học',
        },
        {
          role: 'bot',
          content: 'Đây là mẫu tin nhắn tôi đã soạn cho bạn:\n\n---\n🔥 **SUMMER SALE - GIẢM 25%**\n\nXin chào {{name}}!\n\nUKNOW gửi bạn deal hè cực hot! 🌞\n\n✨ **Giảm ngay 25%** cho tất cả khóa học\n📅 Chương trình kết thúc: **31/08/2026**\n🎯 Áp dụng: Tất cả khóa học\n\n👉 Đăng ký ngay: https://uknow.vn/summer\n\n---\n\n📊 **Tối ưu cho Zalo:**\n- Ưu tiên emoji để thu hút sự chú ý\n- CTA rõ ràng, dễ nhấn\n- Thời hạn tạo cảm giác gấp',
          cards: [
            {
              type: 'action_buttons',
              options: [
                { id: 'copy', label: 'Sao chép', variant: 'primary' },
                { id: 'edit', label: 'Chỉnh sửa', variant: 'secondary' },
                { id: 'more', label: 'Tạo thêm biến thể', variant: 'secondary' },
              ],
            },
          ],
        },
      ],
    },

    landingPage: {
      title: 'Tạo Landing Page',
      description: 'Tạo landing page bán hàng với AI',
      icon: 'landing',
      steps: [
        {
          role: 'bot',
          content: 'Chào bạn! Tôi có thể giúp bạn tạo landing page bán hàng chuyên nghiệp chỉ trong vài phút.\n\nBạn bán sản phẩm/dịch vụ gì?',
          cards: [
            {
              type: 'product_picker',
              options: [
                { id: 'course', label: 'Khóa học online' },
                { id: 'product', label: 'Sản phẩm' },
                { id: 'service', label: 'Dịch vụ' },
                { id: 'consult', label: 'Tư vấn 1-1' },
              ],
            },
          ],
        },
        {
          role: 'user',
          content: 'Khóa học online',
          displayed: 'Khóa học online',
        },
        {
          role: 'bot',
          content: 'Tuyệt vời! Khóa học online rất phù hợp với mô hình online.\n\nBạn muốn landing page nhắm đến đối tượng nào?',
          cards: [
            {
              type: 'audience_picker',
              options: [
                { id: 'beginner', label: 'Người mới bắt đầu' },
                { id: 'student', label: 'Học sinh / Sinh viên' },
                { id: 'career', label: 'Người muốn chuyển nghề' },
                { id: 'professional', label: 'Lập trình viên muốn nâng cao' },
              ],
            },
          ],
        },
        {
          role: 'user',
          content: 'Người mới bắt đầu',
          displayed: 'Người mới bắt đầu',
        },
        {
          role: 'bot',
          content: 'Đã hiểu! Landing page sẽ nhắm đến người mới bắt đầu với thông điệp dễ tiếp cận.\n\nMục tiêu chính của landing page là gì?',
          cards: [
            {
              type: 'goal_picker',
              options: [
                { id: 'register', label: 'Đăng ký học thử miễn phí' },
                { id: 'buy', label: 'Bán khóa học' },
                { id: 'consult', label: 'Tư vấn 1-1' },
                { id: 'download', label: 'Tải tài liệu miễn phí' },
              ],
            },
          ],
        },
        {
          role: 'user',
          content: 'Đăng ký học thử miễn phí',
          displayed: 'Đăng ký học thử miễn phí',
        },
        {
          role: 'bot',
          content: 'Tôi đang tạo landing page cho bạn... Vui lòng chờ trong giây lát! ⚡',
          typingOnly: true,
        },
        {
          role: 'bot',
          content: 'Landing page của bạn đã sẵn sàng! 🚀',
          cards: [
            {
              type: 'landing_preview',
              title: 'Khóa Học Lập Trình Cho Người Mới',
              features: [
                'Giao diện hiện đại, chuyên nghiệp',
                'Form đăng ký nổi bật',
                'Section giới thiệu khóa học',
                'Testimonials từ học viên',
                'Pricing table với ưu đãi',
              ],
            },
          ],
        },
        {
          role: 'bot',
          content: '**Tính năng đã bao gồm:**\n- Hero section với headline thu hút\n- Form đăng ký học thử\n- Giới thiệu khóa học\n- Testimonials\n- Pricing với ưu đãi\n- Responsive trên mọi thiết bị',
          cards: [
            {
              type: 'action_buttons',
              options: [
                { id: 'view_html', label: 'Xem code HTML', variant: 'secondary' },
                { id: 'edit', label: 'Chỉnh sửa với AI', variant: 'primary' },
                { id: 'save', label: 'Lưu vào thư viện', variant: 'secondary' },
                { id: 'restart', label: 'Tạo lại từ đầu', variant: 'secondary' },
              ],
            },
          ],
        },
        {
          role: 'bot',
          content: 'Bạn có thể xem code HTML preview chi tiết bên dưới:',
          cards: [
            { type: 'code_preview' },
          ],
        },
        {
          role: 'bot',
          content: 'Trên đây là toàn bộ quy trình tạo landing page với Founder AI.\n\nĐăng ký ngay để sử dụng tính năng này và nhiều tính năng khác!',
          cards: [
            {
              type: 'action_buttons',
              options: [
                { id: 'signup', label: 'Đăng ký dùng thử miễn phí', variant: 'primary' },
                { id: 'restart', label: 'Trải nghiệm lại từ đầu', variant: 'secondary' },
              ],
            },
          ],
        },
      ],
    },
  },

  en: {
    campaign: {
      title: 'Create Campaign',
      description: 'Create automated marketing campaigns with AI',
      icon: 'campaign',
      steps: [
        {
          role: 'bot',
          content: 'Hi there! I\'m the Founder AI Assistant. I can help you create effective marketing campaigns.\n\nWhich channel would you like to create a campaign for?',
          cards: [
            {
              type: 'channel_picker',
              options: [
                { id: 'email', label: 'Email', icon: 'email' },
                { id: 'zalo', label: 'Personal Zalo', icon: 'zalo' },
                { id: 'zalo_group', label: 'Zalo Group', icon: 'zalo_group' },
              ],
            },
          ],
        },
        {
          role: 'user',
          content: 'I want to send via Personal Zalo',
          displayed: 'I want to send via Personal Zalo',
        },
        {
          role: 'bot',
          content: 'Great! To get started, I need you to connect your Personal Zalo account.\n\nDo you already have a Zalo account?',
          cards: [
            {
              type: 'action_buttons',
              options: [
                { id: 'connect', label: 'Connect Zalo', variant: 'primary' },
                { id: 'skip', label: 'Skip', variant: 'secondary' },
              ],
            },
          ],
        },
        {
          role: 'user',
          content: 'Connect Zalo OA',
          displayed: 'Connect Zalo OA',
        },
        {
          role: 'bot',
          content: 'Successfully connected **UKNOW Official** account!\n\nNow, who would you like to send messages to?',
          cards: [
            {
              type: 'data_source_picker',
              options: [
                { id: 'landing', label: 'Landing Page subscribers', icon: 'landing' },
                { id: 'sheet', label: 'List from Excel/Sheet', icon: 'sheet' },
                { id: 'existing', label: 'Existing customer list', icon: 'db' },
              ],
            },
          ],
        },
        {
          role: 'user',
          content: 'Send to Landing Page subscribers',
          displayed: 'Send to Landing Page subscribers',
        },
        {
          role: 'bot',
          content: 'Ready! I\'ll create a campaign to send to **150 customers** from Landing Page.\n\nDescribe the message content you want to send, or let me help you draft it?',
          cards: [
            {
              type: 'template_suggestions',
              suggestions: [
                'Sales pitch template',
                'Promotion template',
                'New product announcement template',
              ],
            },
          ],
        },
        {
          role: 'user',
          content: 'Create promotion template',
          displayed: 'Create promotion template',
        },
        {
          role: 'bot',
          content: 'Here\'s the message template I\'ve drafted for you:\n\n---\n**SPECIAL PROMOTION**\n\nHello {{name}}!\n\nUKNOW brings you **30% OFF** on all courses this month.\n\n🎁 Coupon code: **SUMMER30**\n⏰ Valid until: 08/30/2026\n\nRegister now: https://uknow.vn/register\n\n---\n\nWould you like to make any adjustments?',
          cards: [
            {
              type: 'action_buttons',
              options: [
                { id: 'approve', label: 'Approve', variant: 'primary' },
                { id: 'edit', label: 'Edit', variant: 'secondary' },
                { id: 'regenerate', label: 'Regenerate', variant: 'secondary' },
              ],
            },
          ],
        },
        {
          role: 'user',
          content: 'Approve',
          displayed: 'Approve',
        },
        {
          role: 'bot',
          content: 'Campaign created successfully! 🎉\n\n**Campaign:** Summer 2026 Promotion\n**Channel:** Personal Zalo\n**Recipients:** 150 customers\n**Send time:** Now\n\nThe campaign will start sending shortly.',
          cards: [
            {
              type: 'campaign_result',
              status: 'success',
              stats: {
                sent: 0,
                pending: 150,
                delivered: 0,
                failed: 0,
              },
            },
          ],
        },
      ],
    },

    template: {
      title: 'Create Template',
      description: 'Create professional message templates with AI',
      icon: 'template',
      steps: [
        {
          role: 'bot',
          content: 'Hi there! I can help you create professional message templates for Zalo or Email.\n\nWhich channel would you like to create a template for?',
          cards: [
            {
              type: 'channel_picker',
              options: [
                { id: 'zalo', label: 'Zalo', icon: 'zalo' },
                { id: 'email', label: 'Email', icon: 'email' },
              ],
            },
          ],
        },
        {
          role: 'user',
          content: 'Create Zalo template',
          displayed: 'Create Zalo template',
        },
        {
          role: 'bot',
          content: 'What\'s the purpose of your template?',
          cards: [
            {
              type: 'template_type_picker',
              options: [
                { id: 'welcome', label: 'Welcome new customers', icon: 'wave' },
                { id: 'promotion', label: 'Promotion / Offer', icon: 'gift' },
                { id: 'followup', label: 'Follow-up / Care', icon: 'heart' },
                { id: 'announcement', label: 'Announcement / Update', icon: 'megaphone' },
              ],
            },
          ],
        },
        {
          role: 'user',
          content: 'Create promotion template',
          displayed: 'Create promotion template',
        },
        {
          role: 'bot',
          content: 'Tell me more about your promotion:\n\n- Campaign name?\n- Discount rate / offer?\n- Validity period?\n- Products/services included?',
        },
        {
          role: 'user',
          content: 'Summer Sale program, 25% off, expires 08/31, applies to all courses',
          displayed: 'Summer Sale program, 25% off, expires 08/31, applies to all courses',
        },
        {
          role: 'bot',
          content: 'Here\'s the message template I\'ve drafted for you:\n\n---\n🔥 **SUMMER SALE - 25% OFF**\n\nHello {{name}}!\n\nUKNOW brings you an amazing summer deal! 🌞\n\n✨ **25% OFF** on all courses\n📅 Offer ends: **08/31/2026**\n🎯 Valid for: All courses\n\n👉 Register now: https://uknow.vn/summer\n\n---\n\n📊 **Optimized for Zalo:**\n- Emojis to grab attention\n- Clear, easy-to-tap CTA\n- Urgency with deadline',
          cards: [
            {
              type: 'action_buttons',
              options: [
                { id: 'copy', label: 'Copy', variant: 'primary' },
                { id: 'edit', label: 'Edit', variant: 'secondary' },
                { id: 'more', label: 'Create more variants', variant: 'secondary' },
              ],
            },
          ],
        },
      ],
    },

    landingPage: {
      title: 'Create Landing Page',
      description: 'Create sales landing pages with AI',
      icon: 'landing',
      steps: [
        {
          role: 'bot',
          content: 'Hi there! I can help you create professional sales landing pages in just a few minutes.\n\nWhat product/service are you selling?',
          cards: [
            {
              type: 'product_picker',
              options: [
                { id: 'course', label: 'Online course' },
                { id: 'product', label: 'Product' },
                { id: 'service', label: 'Service' },
                { id: 'consult', label: '1-1 Consultation' },
              ],
            },
          ],
        },
        {
          role: 'user',
          content: 'Online course',
          displayed: 'Online course',
        },
        {
          role: 'bot',
          content: 'Great! Online courses work perfectly with digital models.\n\nWho is your landing page targeting?',
          cards: [
            {
              type: 'audience_picker',
              options: [
                { id: 'beginner', label: 'Beginners' },
                { id: 'student', label: 'Students' },
                { id: 'career', label: 'Career changers' },
                { id: 'professional', label: 'Professionals leveling up' },
              ],
            },
          ],
        },
        {
          role: 'user',
          content: 'Beginners',
          displayed: 'Beginners',
        },
        {
          role: 'bot',
          content: 'Got it! The landing page will target beginners with an accessible message.\n\nWhat\'s the main goal of the landing page?',
          cards: [
            {
              type: 'goal_picker',
              options: [
                { id: 'register', label: 'Free trial registration' },
                { id: 'buy', label: 'Sell course' },
                { id: 'consult', label: '1-1 consultation' },
                { id: 'download', label: 'Free resource download' },
              ],
            },
          ],
        },
        {
          role: 'user',
          content: 'Free trial registration',
          displayed: 'Free trial registration',
        },
        {
          role: 'bot',
          content: 'I\'m creating your landing page... Please wait a moment! ⚡',
          typingOnly: true,
        },
        {
          role: 'bot',
          content: 'Your landing page is ready! 🚀',
          cards: [
            {
              type: 'landing_preview',
              title: 'Programming Course For Beginners',
              features: [
                'Modern, professional design',
                'Eye-catching registration form',
                'Course introduction section',
                'Student testimonials',
                'Pricing table with offers',
              ],
            },
          ],
        },
        {
          role: 'bot',
          content: '**Included features:**\n- Hero section with compelling headline\n- Free trial registration form\n- Course introduction\n- Testimonials\n- Pricing with offers\n- Responsive on all devices',
          cards: [
            {
              type: 'action_buttons',
              options: [
                { id: 'view_html', label: 'View HTML code', variant: 'secondary' },
                { id: 'edit', label: 'Edit with AI', variant: 'primary' },
                { id: 'save', label: 'Save to library', variant: 'secondary' },
                { id: 'restart', label: 'Restart from beginning', variant: 'secondary' },
              ],
            },
          ],
        },
        {
          role: 'bot',
          content: 'You can view the detailed HTML preview code below:',
          cards: [
            { type: 'code_preview' },
          ],
        },
        {
          role: 'bot',
          content: 'That\'s the complete landing page creation flow with Founder AI.\n\nSign up now to use this feature and many more!',
          cards: [
            {
              type: 'action_buttons',
              options: [
                { id: 'signup', label: 'Sign up free trial', variant: 'primary' },
                { id: 'restart', label: 'Restart demo', variant: 'secondary' },
              ],
            },
          ],
        },
      ],
    },
  },
};

// Attach a stable id to each conversation so the chatbot can detect flow switches
const decorateConversations = (convos, locale) => {
  Object.keys(convos).forEach((flowKey) => {
    const convo = convos[flowKey];
    if (convo && !convo.id) convo.id = `${locale}:${flowKey}`;
  });
  return convos;
};

decorateConversations(MOCK_CONVERSATIONS.vi, 'vi');
decorateConversations(MOCK_CONVERSATIONS.en, 'en');

// Helper to get conversation data
export const getConversation = (locale = 'vi', flow) => {
  const localeData = MOCK_CONVERSATIONS[locale] || MOCK_CONVERSATIONS.vi;
  return localeData[flow] || localeData.campaign;
};

export const getInitialBotMessage = (locale = 'vi', flow) => {
  const conversation = getConversation(locale, flow);
  return conversation?.steps[0] || null;
};

export const getTotalSteps = (locale = 'vi', flow) => {
  const conversation = getConversation(locale, flow);
  return conversation?.steps.length || 0;
};

export const FLOW_IDS = ['campaign', 'template', 'landingPage'];
