/**
 * Pure text / intent heuristics for AI campaign assistant.
 * Moved out of aiCampaign.service.js (god-object split PR2).
 */

export function langInstruction(locale) {
  return locale === 'en'
    ? 'Always respond in English. All "content" fields in JSON must be written in English.'
    : 'Luôn trả lời bằng tiếng Việt. Tất cả trường "content" trong JSON phải viết bằng tiếng Việt.';
}

export function lastUserMessageContent(history = []) {
  const lastUserMessage = [...history].reverse().find((message) => message?.role === 'user');
  return String(lastUserMessage?.content || '');
}

export function hasExplicitCustomerSource(text = '') {
  const normalized = String(text || '').toLowerCase();
  return /google\s*sheet|spreadsheet|docs\.google\.com\/spreadsheets|excel|xlsx|xls|csv|file|t[eệ]p|tập tin|landing page|khách hàng trong hệ thống|database|db|crm/.test(normalized);
}

export function looksLikeCampaignRequest(text = '') {
  const normalized = String(text || '').toLowerCase();
  return /chiến dịch|chien dich|campaign|email|zalo|khách|khach|customer|tour|chuyến đi|chuyen di|du lịch|du lich/.test(normalized);
}

export function asksOnlyForGoogleSheet(response) {
  const text = [
    response?.content,
    ...(Array.isArray(response?.missing_fields) ? response.missing_fields : []),
  ].join(' ').toLowerCase();

  return response?.type === 'ask_more'
    && /google\s*sheet|spreadsheet|sheet\s*url|đường dẫn google sheet|docs\.google\.com\/spreadsheets/.test(text);
}

export function buildCampaignDataSourceQuestion(locale = 'vi') {
  const isEnglish = locale === 'en';
  return {
    type: 'ask_campaign_details',
    content: isEnglish
      ? 'I can create this customer care campaign. Before setting it up, please choose where the customer list should come from.'
      : 'Tôi có thể tạo chiến dịch chăm sóc khách hàng này. Trước khi thiết lập, bạn chọn giúp tôi nguồn danh sách khách hàng nhé.',
    missing_fields: [],
    data: {
      campaignName: isEnglish ? 'Travel customer care campaign' : 'Chiến dịch chăm sóc khách du lịch',
      description: isEnglish
        ? 'Send thank-you messages after a trip and a follow-up promotion later.'
        : 'Gửi lời cảm ơn sau chuyến đi và gửi ưu đãi tour mới sau một khoảng thời gian.',
      questions: [
        {
          id: 'dataSource',
          label: isEnglish ? 'Where should the customer list come from?' : 'Lấy danh sách khách từ đâu?',
          options: [
            {
              value: 'db',
              label: isEnglish ? 'Saved customer list' : 'Danh sách khách hàng',
              description: isEnglish
                ? 'People already in your account (from past campaigns, courses, or CRM)'
                : 'Khách đã có trong tài khoản (từ chiến dịch cũ, khóa học, CRM)',
            },
            {
              value: 'sheet',
              label: isEnglish ? 'Excel / Google Sheet' : 'File Excel / Google Sheet',
              description: isEnglish
                ? 'A spreadsheet file or Google Sheet link you provide'
                : 'File hoặc link bảng tính bạn tự cung cấp',
            },
            {
              value: 'landing',
              label: isEnglish ? 'Landing page sign-ups' : 'Đăng ký từ Landing Page',
              description: isEnglish
                ? 'People who submitted the form on your landing page (name, phone, email)'
                : 'Người điền form trên trang landing (tên, SĐT, email)',
            },
          ],
        },
      ],
    },
  };
}

export function isMultiDaySeriesRequest(text = '') {
  const normalized = String(text || '').toLowerCase();
  return /\d+\s*(tin nhắn|tin|email|ngày|ngay|message|messages|day|days)/i.test(normalized)
    && /(zalo|email|chiến dịch|chien dich|campaign|chăm sóc|cham soc|drip|đăng ký|dang ky|kêu gọi|keu goi|nhóm zalo|zalo nhóm|zalo group)/i.test(normalized);
}

export function looksLikeInlineSeriesDraft(content = '') {
  const matches = String(content || '').match(/tin nhắn\s*\d+|ngày\s*\d+|email\s*\d+|message\s*\d+|day\s*\d+/gi) || [];
  return matches.length >= 2;
}
