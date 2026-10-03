/**
 * G3b mục 2 (D-03): prompt tư vấn trang chủ KHÔNG được quảng cáo tính năng không có thật.
 *
 * Bản cũ khẳng định A/B testing, ZNS, chấm điểm lead, báo cáo Excel/PDF, "chatbot theo kịch bản", "500-5000 email/tháng" ghi
 * cứng, đăng ký ở digiso.vn và "đội ngũ DIGISO hỗ trợ thiết lập" — khách hỏi "có A/B test, có gửi ZNS không?" thì bot (mang
 * tên Founder AI) trả lời CÓ: quảng cáo sai tính năng. Spec này quét chuỗi prompt THẬT dựng từ hàm (không mock nội dung), và
 * một ca đi trọn đường processChat → body gửi Google, để chứng minh prompt chạy thật là prompt đã quét.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// Spec này không chạm CSDL: resolveAllowedModel đọc CSDL (xem heroConsultation.service.spec.js) nên giả lập policy.
jest.unstable_mockModule('../ai/aiModelPolicy.service.js', () => ({
  resolveAllowedModel: jest.fn().mockResolvedValue('gemini-3.5-flash'),
}));
const {
  default: heroConsultationService,
  buildHeroSystemPrompt,
  formatPlansForContext,
  HERO_PRICING_URL,
  HERO_REGISTER_URL,
  HERO_PLANS_UNAVAILABLE_TEXT,
} = await import('../heroConsultation.service.js');

/** Hàng `plans` đúng hình dạng pg trả: BIGINT (price) là chuỗi, INTEGER là số, NULL là null. */
const planRow = (over = {}) => ({
  id: 2,
  code: 'starter',
  name: 'Starter',
  price: '990000',
  price_yearly: null,
  duration_days: 30,
  features: [],
  monthly_email_limit: 5000,
  monthly_zalo_limit: null,
  max_landing_pages: 5,
  ai_credits_per_period: 300,
  ...over,
});

const FORBIDDEN_IN_FEATURES = [
  [/A\s*\/\s*B/i, 'A/B testing'],
  [/\bZNS\b/i, 'ZNS'],
  [/Excel|\bPDF\b/i, 'báo cáo Excel/PDF'],
  [/\bCRM\b/, 'CRM'],
  [/kịch bản/i, 'chatbot theo kịch bản'],
  [/chấm điểm/i, 'chấm điểm lead'],
  [/Google Analytics|Facebook Pixel|\bSEO\b/i, 'GA / Pixel / SEO'],
  [/Facebook/i, 'thống kê lead theo nguồn Facebook'],
  [/500\s*-\s*5000/, '500-5000 email/tháng ghi cứng'],
  [/24\/7/, 'cam kết 24/7'],
];

const featureBlockOf = (prompt) => {
  const start = prompt.indexOf('GIẢI PHÁP TỔNG HỢP');
  const end = prompt.indexOf('QUY TRÌNH SỬ DỤNG');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return prompt.slice(start, end);
};

const prompt = () => buildHeroSystemPrompt({
  plansText: formatPlansForContext([planRow()]),
  coursesText: 'Khoá học Marketing: 1.000.000 VND',
  message: 'Gói Starter có gì?',
});

describe('buildHeroSystemPrompt — khối tính năng CHỈ gồm thứ có thật', () => {
  it.each(FORBIDDEN_IN_FEATURES)('khối "GIẢI PHÁP TỔNG HỢP" không chứa %s (%s)', (re) => {
    expect(featureBlockOf(prompt())).not.toMatch(re);
  });

  it('cả prompt không còn ZNS, A/B, "chấm điểm", "kịch bản", "CRM" ở BẤT KỲ chỗ nào', () => {
    const p = prompt();
    expect(p).not.toMatch(/\bZNS\b/i);
    expect(p).not.toMatch(/A\s*\/\s*B/i);
    expect(p).not.toMatch(/chấm điểm/i);
    expect(p).not.toMatch(/kịch bản/i);
    expect(p).not.toMatch(/\bCRM\b/);
  });

  it('vẫn nêu đủ 7 nhóm tính năng có thật (landing, email, Zalo, khách hàng/lead, chiến dịch, chatbot, báo cáo)', () => {
    const block = featureBlockOf(prompt());
    expect(block).toContain('7 TÍNH NĂNG CHÍNH');
    for (const heading of ['1. LANDING PAGE', '2. EMAIL MARKETING', '3. ZALO', '4. QUẢN LÝ KHÁCH HÀNG VÀ LEAD', '5. CHIẾN DỊCH ĐA KÊNH', '6. CHATBOT AI', '7. BÁO CÁO']) {
      expect(block).toContain(heading);
    }
    // Chatbot dựa trên kho kiến thức (Gemini + RAG), không phải "kịch bản/flow".
    expect(block).toContain('kho kiến thức');
  });

  it('dặn model: tính năng không nằm trong danh sách thì KHÔNG khẳng định là có', () => {
    expect(featureBlockOf(prompt())).toMatch(/KHÔNG nằm trong danh sách này thì KHÔNG được khẳng định là có/);
  });

  it('hạn mức email/Zalo/landing/AI lấy từ cột plans, không còn "500-5000 email/tháng" ghi cứng trong khối tính năng', () => {
    const p = buildHeroSystemPrompt({
      plansText: formatPlansForContext([planRow({ monthly_email_limit: 12000 })]),
      coursesText: '',
      message: 'x',
    });
    expect(p).toContain('12.000 email/tháng');
    // Không còn con số hạn mức ghi cứng ("500-5000 email", "1.000 tin Zalo"...) — "2. EMAIL MARKETING" là đề mục, không tính.
    expect(featureBlockOf(p)).not.toMatch(/\b\d{1,3}(?:\.\d{3})+\s*(?:email|tin Zalo)|\b\d{3,}\s*(?:email|tin Zalo)/i);
  });
});

describe('buildHeroSystemPrompt — đăng ký, hỗ trợ, liên hệ, thanh toán', () => {
  it('bước đăng ký trỏ founderai.biz/register (route /register của App.jsx), KHÔNG phải digiso.vn', () => {
    const p = prompt();
    const step1 = p.split('\n').find((l) => l.startsWith('- Bước 1:'));
    expect(step1).toContain(HERO_REGISTER_URL);
    expect(HERO_REGISTER_URL).toBe('founderai.biz/register');
    expect(step1).not.toMatch(/digiso\.vn/i);
    expect(p).not.toMatch(/đăng ký[^\n]*digiso\.vn/i);
  });

  it('không còn cam kết "đội ngũ DIGISO hỗ trợ thiết lập" — thay bằng câu trung tính hướng tới liên hệ', () => {
    const p = prompt();
    expect(p).not.toMatch(/đội ngũ DIGISO hỗ trợ/i);
    const faq = p.split('\n').find((l) => l.startsWith('- "Có hỗ trợ thiết kế landing page không?"'));
    expect(faq).toContain('liên hệ');
    expect(faq).toContain('để được hướng dẫn');
    expect(faq).not.toMatch(/^[^:]*: Có,/);
  });

  it('liên hệ email / hotline / fanpage GIỮ NGUYÊN', () => {
    const p = prompt();
    expect(p).toContain('- Email: info@digiso.vn');
    expect(p).toContain('- Hotline: (+84) 877 909 606 (Thứ 2-6, 8h-17h)');
    expect(p).toContain('- Fanpage Facebook: facebook.com/digiso.vn');
  });

  it('phần thanh toán/VietQR (D-02 chờ sếp) KHÔNG đụng: quy tắc 7 còn nguyên văn', () => {
    expect(prompt()).toContain(
      '7. TUYỆT ĐỐI KHÔNG tự ý cung cấp thông tin thanh toán, mã QR, số tài khoản, hay bất kỳ thông tin tài chính nào. '
      + 'Hệ thống sẽ tự động hiển thị mã QR thanh toán khi khách nhập số tiền — bạn KHÔNG cần và KHÔNG ĐƯỢC tự tạo hoặc mô tả mã QR.'
    );
    expect(prompt()).toContain('- "Thanh toán như thế nào?": Hỗ trợ thanh toán theo tháng hoặc theo năm (tiết kiệm hơn). Liên hệ bộ phận kinh doanh để được hướng dẫn.');
  });

  it('câu hỏi của khách nằm cuối prompt, đúng chỗ như cũ', () => {
    expect(prompt()).toMatch(/Người dùng hỏi: Gói Starter có gì\?\n\nTrả lời \(tiếng Việt có dấu, không markdown\):$/);
  });
});

describe('formatPlansForContext — hạn mức từ cột plans, không giá ghi cứng', () => {
  it('đọc 4 cột hạn mức: giới hạn, không giới hạn (null), gói không có (0)', () => {
    const text = formatPlansForContext([
      planRow({ monthly_email_limit: 5000, monthly_zalo_limit: null, max_landing_pages: 5, ai_credits_per_period: 300 }),
      planRow({ id: 3, name: 'Basic', monthly_email_limit: 0, monthly_zalo_limit: 1500, max_landing_pages: null, ai_credits_per_period: null }),
    ]);

    expect(text).toContain('Hạn mức: 5.000 email/tháng; tin Zalo không giới hạn; 5 landing page; 300 lượt AI mỗi kỳ.');
    expect(text).toContain('Hạn mức: không gửi email; 1.500 tin Zalo/tháng; landing page không giới hạn; lượt AI không giới hạn.');
  });

  it('cột thiếu hẳn trong hàng thì bỏ qua, không bịa số', () => {
    const text = formatPlansForContext([{ name: 'Mới', code: 'moi', price: '100000' }]);
    expect(text).not.toContain('Hạn mức');
  });

  it('không có dữ liệu gói (DB lỗi): KHÔNG nêu giá nào, trỏ tới bảng giá thật founderai.biz/pricing', () => {
    for (const empty of [[], null, undefined]) {
      const text = formatPlansForContext(empty);
      expect(text).toBe(HERO_PLANS_UNAVAILABLE_TEXT);
      expect(text).toContain(HERO_PRICING_URL);
      expect(text).not.toMatch(/\d{2,}\.?\d{3}/); // không có số tiền nào
      expect(text).not.toMatch(/A\s*\/\s*B|CRM|Starter|Pro\b|Business/);
    }
    expect(HERO_PRICING_URL).toBe('founderai.biz/pricing');
  });
});

describe('processChat — prompt THẬT gửi tới Google là prompt đã quét (không mock nội dung)', () => {
  const originalFetch = global.fetch;
  let sentPrompt;

  beforeEach(() => {
    heroConsultationService._resetForTests(); // _skipDb: không có dữ liệu gói → đường "DB lỗi"
    process.env.GEMINI_API_KEY = 'mock_key';
    sentPrompt = null;
    global.fetch = jest.fn().mockImplementation(async (_url, init) => {
      sentPrompt = JSON.parse(init.body).contents[0].parts[0].text;
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Dạ ạ' }] } }] }) };
    });
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('khách hỏi "có A/B test, ZNS không?": prompt gửi đi không chứa A/B, ZNS, digiso.vn đăng ký; có bảng giá thật khi DB lỗi', async () => {
    const out = await heroConsultationService.processChat({ visitorId: 'v_prompt_1', message: 'Có A/B test, có gửi ZNS không?', ip: '10.0.0.7' });

    expect(out.success).toBe(true);
    // Chỉ quét phần hệ thống: câu hỏi của khách nằm cuối prompt và tự nó chứa "A/B", "ZNS".
    const system = sentPrompt.slice(0, sentPrompt.indexOf('Người dùng hỏi:'));
    expect(system).not.toMatch(/A\s*\/\s*B/i);
    expect(system).not.toMatch(/\bZNS\b/i);
    expect(system).not.toMatch(/đội ngũ DIGISO hỗ trợ/i);
    expect(system).toContain(HERO_REGISTER_URL);
    expect(system).toContain(HERO_PLANS_UNAVAILABLE_TEXT);
    expect(sentPrompt).toContain('Người dùng hỏi: Có A/B test, có gửi ZNS không?');
  });
});
