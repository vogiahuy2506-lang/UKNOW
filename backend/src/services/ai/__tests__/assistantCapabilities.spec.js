import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import {
  classifyCapabilityProbe,
  classifyUnsupportedSendRequest,
  formatAssistantCapabilities,
  CORE_CAPABILITIES,
  GUIDE_ONLY,
  KNOWN_UNSUPPORTED,
} from '../assistantCapabilities.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSISTANT_CAPABILITIES_SOURCE = path.resolve(__dirname, '../assistantCapabilities.js');
const CAMPAIGN_CHANNEL_REGISTRY_SOURCE = path.resolve(__dirname, '../../campaign/campaignChannelRegistry.service.js');

describe('assistantCapabilities', () => {
  it('keeps every capability group localized', () => {
    for (const group of [CORE_CAPABILITIES, GUIDE_ONLY, KNOWN_UNSUPPORTED]) {
      expect(group.vi.length).toBeGreaterThan(0);
      expect(group.en.length).toBeGreaterThan(0);
    }
  });

  it.each([
    ['bạn có thể tạo landing page không', 'vi', 'core', 'landing_page'],
    ['bạn có thể thiết kế trang web không', 'vi', 'core', 'landing_page'],
    ['bạn có thể tạo website được không', 'vi', 'core', 'landing_page'],
    ['Can you build a web page?', 'en', 'core', 'landing_page'],
    ['hệ thống có làm trang đích không', 'vi', 'core', 'landing_page'],
    ['Can you create a landing page', 'en', 'core', 'landing_page'],
    ['Can I create a landing page?', 'vi', 'core', 'landing_page'],
    ['Bạn có thể tạo landing page cho tôi không', 'vi', 'core', 'landing_page'],
    ['Can you create a landing page for me?', 'en', 'core', 'landing_page'],
    ['hệ thống có gửi SMS không', 'vi', 'unsupported', 'unsupported_channel'],
    ['do you support A/B testing', 'vi', 'unsupported', 'ab_testing'],
    ['trợ lý hẹn giờ gửi được không', 'vi', 'guide', 'schedule'],
    ['bạn có thể tạo chiến dịch SMS không', 'vi', 'unsupported', 'unsupported_channel'],
    ['có gửi chiến dịch qua Telegram được không', 'vi', 'unsupported', 'unsupported_channel'],
    ['Do you support WhatsApp campaigns?', 'en', 'unsupported', 'unsupported_channel'],
    ['hệ thống có gửi tin hàng loạt qua Messenger không', 'vi', 'unsupported', 'unsupported_channel'],
    ['Can you create and schedule a Zalo campaign?', 'en', 'guide', 'schedule'],
  ])('classifies %s', (question, locale, kind, id) => {
    expect(classifyCapabilityProbe(question, locale)).toMatchObject({ kind, id });
  });

  it.each([
    'làm sao để tạo chiến dịch',
    'how can I create a campaign',
    'tạo landing page cho khóa học',
    'thiết kế trang web từ file này',
    'làm website bán hàng',
  ])('leaves how-to and command text for the existing router: %s', (question) => {
    expect(classifyCapabilityProbe(question, 'vi')).toBeNull();
  });

  // Chatbot nối được WhatsApp, Telegram, Facebook Messenger (tab Triển khai) — các câu này KHÔNG được
  // rơi vào câu cố định "chưa hỗ trợ"; trả null để bộ định tuyến + bài hướng dẫn trả lời.
  it.each([
    'chatbot có kết nối Telegram được không',
    'bot có trả lời trên WhatsApp được không',
    'hệ thống có hỗ trợ Telegram không',
    'Can you connect the chatbot to Facebook Messenger?',
  ])('does not call a chatbot channel unsupported: %s', (question) => {
    expect(classifyCapabilityProbe(question, 'vi')).toBeNull();
  });

  // Câu có cả "gửi tin" lẫn "chatbot": vẫn bị bộ khớp `campaign` (core) bắt vì chữ "gửi tin" — hành vi
  // có từ trước, ngoài phạm vi sửa này. Điều phải giữ: KHÔNG được kết luận là kênh không hỗ trợ.
  it('chatbot + "gửi tin" qua Telegram: không bị coi là kênh không hỗ trợ', () => {
    const probe = classifyCapabilityProbe('chatbot có gửi tin trả lời qua Telegram được không', 'vi');
    expect(probe?.kind).not.toBe('unsupported');
  });

  // PR-1 (PLAN_VA_TRO_LY_AI_2026-09-28) Việc 1 — bảng "Kết quả bắt buộc" của lệnh giao thợ: 11 câu
  // trước đây bị probe sai (câu hỏi thật có nội dung khác ngoài năng lực) phải ra null, đi tiếp bộ
  // định tuyến + RAG. Ghim từng câu riêng — không gộp — để đột biến nào làm hỏng 1 câu thì thấy
  // đúng câu đó, không phải đoán qua một `it.each` chung chung mất chi tiết.
  it('landing page có gắn được form đăng ký không → null (không phải "có, mình làm được tạo landing page")', () => {
    expect(classifyCapabilityProbe('landing page có gắn được form đăng ký không', 'vi')).toBeNull();
  });
  it('landing có gắn tên miền riêng được không → null', () => {
    expect(classifyCapabilityProbe('landing có gắn tên miền riêng được không', 'vi')).toBeNull();
  });
  it('trang web có thể thêm nút gọi điện không → null', () => {
    expect(classifyCapabilityProbe('trang web có thể thêm nút gọi điện không', 'vi')).toBeNull();
  });
  it('template email có chèn ảnh được không → null (không phải "tạo chiến dịch đa kênh")', () => {
    expect(classifyCapabilityProbe('template email có chèn ảnh được không', 'vi')).toBeNull();
  });
  it('mẫu email có thể thêm nút bấm không → null', () => {
    expect(classifyCapabilityProbe('mẫu email có thể thêm nút bấm không', 'vi')).toBeNull();
  });
  it('nhân viên có thể chạy chiến dịch không → null (câu hỏi phân quyền, không phải hỏi tạo chiến dịch)', () => {
    expect(classifyCapabilityProbe('nhân viên có thể chạy chiến dịch không', 'vi')).toBeNull();
  });
  it('có thể đổi tên chiến dịch không → null', () => {
    expect(classifyCapabilityProbe('có thể đổi tên chiến dịch không', 'vi')).toBeNull();
  });
  it('chatbot có đọc được file pdf không → null (hỏi về chatbot khách, không phải trợ lý)', () => {
    expect(classifyCapabilityProbe('chatbot có đọc được file pdf không', 'vi')).toBeNull();
  });
  it('chiến dịch của tôi bị dừng, có phải hết hạn mức không → null (đang báo sự cố, không hỏi năng lực)', () => {
    expect(classifyCapabilityProbe('chiến dịch của tôi bị dừng, có phải hết hạn mức không', 'vi')).toBeNull();
  });
  it('bạn có thể gửi tin zalo cho danh sách khách này không → null (còn "danh sách khách" — đúng ý, đi tiếp làm_giúp)', () => {
    expect(classifyCapabilityProbe('bạn có thể gửi tin zalo cho danh sách khách này không', 'vi')).toBeNull();
  });
  it('có thể dừng chiến dịch đang chạy không → null (còn "dừng" đứng riêng — kho bài trả lời được)', () => {
    expect(classifyCapabilityProbe('có thể dừng chiến dịch đang chạy không', 'vi')).toBeNull();
  });

  // 6 câu probe THUẦN phải giữ nguyên kết quả cũ (không có nội dung nào khác ngoài năng lực).
  it('bạn có thể tạo chiến dịch zalo cho tôi không → giữ core:campaign', () => {
    expect(classifyCapabilityProbe('bạn có thể tạo chiến dịch zalo cho tôi không', 'vi')).toMatchObject({ kind: 'core', id: 'campaign' });
  });
  it('bạn có thể tạo landing page không → giữ core:landing_page', () => {
    expect(classifyCapabilityProbe('bạn có thể tạo landing page không', 'vi')).toMatchObject({ kind: 'core', id: 'landing_page' });
  });
  it('chiến dịch có hẹn giờ được không → giữ guide:schedule', () => {
    expect(classifyCapabilityProbe('chiến dịch có hẹn giờ được không', 'vi')).toMatchObject({ kind: 'guide', id: 'schedule' });
  });
  it('sửa chiến dịch đã tạo được không → giữ guide:edit_existing ("đã tạo" không thêm nghĩa khác)', () => {
    expect(classifyCapabilityProbe('sửa chiến dịch đã tạo được không', 'vi')).toMatchObject({ kind: 'guide', id: 'edit_existing' });
  });
  it('có A/B test không → giữ unsupported:ab_testing (chữ "test" phải bị xoá cùng "A/B")', () => {
    expect(classifyCapabilityProbe('có A/B test không', 'vi')).toMatchObject({ kind: 'unsupported', id: 'ab_testing' });
  });
  it('gửi sms được không → giữ unsupported:unsupported_channel', () => {
    expect(classifyCapabilityProbe('gửi sms được không', 'vi')).toMatchObject({ kind: 'unsupported', id: 'unsupported_channel' });
  });

  // Regex campaign không còn khớp chữ trần "email"/"zalo" đứng riêng (28/09) — trước đây khớp qua
  // \bemail\b/zalo trần, nay phải null vì landing_page mới là năng lực đúng, mà "gắn form" còn lại
  // (ca "landing page có gắn..." ở trên) hoặc không khớp gì cả nếu không có năng lực nào khác.
  it('câu chỉ có "email" trần, không năng lực khác → null (không tự nhận là hỏi tạo chiến dịch)', () => {
    expect(classifyCapabilityProbe('email có gửi được không', 'vi')).toBeNull();
  });
  it('câu chỉ có "zalo" trần, không năng lực khác → null', () => {
    expect(classifyCapabilityProbe('zalo có dùng được không', 'vi')).toBeNull();
  });

  // Câu chứa CẢ hai từ khoá "chiến dịch" (campaign) lẫn "template" — phần-còn-lại không phân biệt
  // được (cả hai đều bị xoá, phần còn lại rỗng như nhau dù ai thắng), CHỈ thứ tự trong mảng `core`
  // mới quyết định `id` trả về. Ghim trực tiếp: template phải thắng (đúng Việc 1.2 "đưa template
  // lên trước campaign") — đột biến đảo thứ tự lại về cũ sẽ đỏ đúng ca này.
  it('template xét TRƯỚC campaign: "chiến dịch template được không" → core:template, không phải core:campaign', () => {
    expect(classifyCapabilityProbe('chiến dịch template được không', 'vi')).toMatchObject({ kind: 'core', id: 'template' });
  });

  // PR-1 Việc 1.4 — "ghim từng phần tử" bộ từ đệm: mỗi từ một câu riêng, neo vào core:landing_page
  // (không tự khớp năng lực nào khác — đã kiểm tay từng từ trước khi viết). Đột biến bỏ 1 từ khỏi
  // FILLER_WORDS phải làm ĐÚNG MỘT dòng dưới đây đỏ (còn lại từ đó làm hasMeaningfulRemainder=true).
  // Từ dài < 3 ký tự (à, ừ, ở, có, là, đã, se, to, on, my...) KHÔNG ghim được bằng cách này: ngưỡng
  // "≥ 3 ký tự" của thuật toán đã loại chúng dù có nằm trong danh sách hay không — liệt kê ở cuối để
  // không bỏ sót, không viết ca giả vờ ghim. "sms" cũng không ghim theo khuôn này: nó tự khớp
  // unsupported_channel qua chính pattern của nó (không cần có mặt trong FILLER_WORDS để bị xoá) —
  // đã có ca "hệ thống có gửi SMS không" (dòng 27) làm bằng chứng hành vi đúng.
  it.each([
    ['bạn', 'xưng hô'], ['mình', 'xưng hô'], ['tôi', 'xưng hô'], ['anh', 'xưng hô'], ['chị', 'xưng hô'],
    ['cho', 'xưng hô'], ['giúp', 'xưng hô'], ['nhé', 'xưng hô'], ['với', 'xưng hô'], ['của', 'xưng hô'],
    ['này', 'xưng hô'], ['kia', 'xưng hô'], ['thì', 'xưng hô'], ['hay', 'xưng hô'], ['hoặc', 'xưng hô'],
    ['qua', 'xưng hô'], ['bằng', 'xưng hô'], ['trên', 'xưng hô'], ['luôn', 'xưng hô'], ['ngay', 'xưng hô'],
    ['rất', 'xưng hô'], ['hơi', 'xưng hô'],
    ['không', 'dấu hiệu'], ['khong', 'dấu hiệu'], ['thể', 'dấu hiệu'], ['the', 'dấu hiệu/tiếng Anh'],
    ['được', 'dấu hiệu'], ['duoc', 'dấu hiệu'], ['chứ', 'dấu hiệu'], ['chu', 'dấu hiệu'], ['trợ', 'dấu hiệu'],
    ['tro', 'dấu hiệu'], ['phải', 'dấu hiệu'],
    ['tạo', 'làm hộ'], ['tao', 'làm hộ'], ['làm', 'làm hộ'], ['lam', 'làm hộ'], ['soạn', 'làm hộ'],
    ['soan', 'làm hộ'], ['viết', 'làm hộ'], ['viet', 'làm hộ'], ['thiết', 'làm hộ'], ['thiet', 'làm hộ'],
    ['dựng', 'làm hộ'], ['dung', 'làm hộ'], ['xây', 'làm hộ'], ['xay', 'làm hộ'], ['gửi', 'làm hộ'],
    ['gui', 'làm hộ'], ['nhắn', 'làm hộ'], ['nhan', 'làm hộ'], ['chạy', 'làm hộ'], ['chay', 'làm hộ'],
    ['lên', 'làm hộ'], ['len', 'làm hộ'], ['sửa', 'làm hộ (edit_existing)'], ['sua', 'làm hộ (edit_existing)'],
    ['đang', 'thì/trạng thái'], ['rồi', 'thì/trạng thái'], ['roi', 'thì/trạng thái'], ['vẫn', 'thì/trạng thái'],
    ['van', 'thì/trạng thái'], ['hiện', 'thì/trạng thái'], ['hien', 'thì/trạng thái'], ['mới', 'thì/trạng thái'],
    ['moi', 'thì/trạng thái'], ['giờ', 'thì/trạng thái'], ['gio', 'thì/trạng thái'],
    ['thống', 'chủ ngữ hệ thống'], ['thong', 'chủ ngữ hệ thống'], ['phần', 'chủ ngữ hệ thống'],
    ['mềm', 'chủ ngữ hệ thống'], ['app', 'chủ ngữ hệ thống'], ['founder', 'chủ ngữ hệ thống'],
    ['mail', 'tên kênh'],
    ['you', 'tiếng Anh'], ['and', 'tiếng Anh'], ['can', 'tiếng Anh'], ['could', 'tiếng Anh'],
    ['does', 'tiếng Anh'], ['are', 'tiếng Anh'], ['please', 'tiếng Anh'], ['help', 'tiếng Anh'],
    ['support', 'tiếng Anh'], ['supported', 'tiếng Anh'], ['possible', 'tiếng Anh'], ['create', 'tiếng Anh'],
    ['make', 'tiếng Anh'], ['build', 'tiếng Anh'], ['design', 'tiếng Anh'], ['send', 'tiếng Anh'],
    ['run', 'tiếng Anh'], ['this', 'tiếng Anh'], ['that', 'tiếng Anh'], ['for', 'tiếng Anh'],
    ['with', 'tiếng Anh'], ['your', 'tiếng Anh'],
  ])('từ đệm "%s" (%s) không cản probe: có %s landing page không → giữ core:landing_page', (word) => {
    expect(classifyCapabilityProbe(`có ${word} landing page không`, 'vi')).toMatchObject({ kind: 'core', id: 'landing_page' });
  });
});

// PR-3 (LENH_GIAO_TRO_LY_AI_PR3_2026-09-28) Việc 1 — classifyUnsupportedSendRequest: câu LỆNH
// gửi qua kênh chưa hỗ trợ, khác classifyCapabilityProbe ở chỗ không đòi CAPABILITY_MARKER_RE.
describe('classifyUnsupportedSendRequest', () => {
  it.each([
    ['gửi nhanh tin telegram cho nhóm học viên', 'unsupported_channel'],
    ['gửi tin whatsapp cho khách hàng', 'unsupported_channel'],
    ['gửi tin telegram cho khách', 'unsupported_channel'],
    ['muốn gửi chiến dịch qua messenger', 'unsupported_channel'],
    ['gửi sms cho 3 khách này', 'unsupported_channel'],
    ['send a WhatsApp broadcast to my customers', 'unsupported_channel'],
    ['chatbot telegram của tôi không trả lời', null],
    ['kết nối telegram cho chatbot', null],
    ['làm sao gửi tin telegram', null],
    ['gửi tin zalo cho khách', null],
    ['tạo chiến dịch email cho khách cũ', null],
    // Phát hiện lúc kiểm đột biến: 2 ca "chatbot" ở trên không có từ SEND_CONTEXT_RE
    // ("gửi"/"chiến dịch"/...) nên KHÔNG chạm nhánh loại trừ !CHATBOT_CONTEXT_RE — bỏ nhánh đó
    // (đột biến b) vẫn không làm chúng đỏ. Ca dưới có đủ cả 3: kênh (telegram) + gửi + chatbot.
    ['gửi tin nhắn cho chatbot qua telegram', null],
  ])('"%s" → %s', (text, expectedId) => {
    const result = classifyUnsupportedSendRequest(text, 'vi');
    if (expectedId === null) {
      expect(result).toBeNull();
    } else {
      expect(result).toMatchObject({ kind: 'unsupported', id: expectedId });
    }
  });
});

// PR-B (LENH_GIAO_TRO_LY_AI_PR4_2026-09-29) Việc 1 + Nghiệm thu mục 1 — cờ Telegram đọc lúc GỌI:
// đổi process.env giữa các ca trong CÙNG file phải đổi kết quả ngay, không dính giá trị cũ.
describe('cờ CAMPAIGN_CHANNEL_TELEGRAM_ENABLED (PR-B)', () => {
  const FLAG = 'CAMPAIGN_CHANNEL_TELEGRAM_ENABLED';
  let prevFlag;

  beforeEach(() => {
    prevFlag = process.env[FLAG];
  });

  afterEach(() => {
    if (prevFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = prevFlag;
  });

  it('dùng đúng tên biến env như campaignChannelRegistry.service.js (khuôn "đọc lúc gọi")', () => {
    const source = fs.readFileSync(ASSISTANT_CAPABILITIES_SOURCE, 'utf8');
    const registrySource = fs.readFileSync(CAMPAIGN_CHANNEL_REGISTRY_SOURCE, 'utf8');
    expect(source).toContain(`process.env.${FLAG}`);
    expect(registrySource).toContain(`process.env.${FLAG}`);
  });

  describe('cờ TẮT — hành vi phải Y NGUYÊN hôm nay', () => {
    beforeEach(() => {
      delete process.env[FLAG];
    });

    it.each([
      ['gửi tin telegram cho khách', 'unsupported_channel'],
      ['gửi nhanh tin telegram cho nhóm học viên', 'unsupported_channel'],
      ['gửi tin whatsapp cho khách hàng', 'unsupported_channel'],
      ['muốn gửi chiến dịch qua messenger', 'unsupported_channel'],
    ])('classifyUnsupportedSendRequest("%s") → unsupported:%s', (text, expectedId) => {
      expect(classifyUnsupportedSendRequest(text, 'vi')).toMatchObject({ kind: 'unsupported', id: expectedId });
    });

    it('có gửi chiến dịch qua Telegram được không → giữ unsupported:unsupported_channel', () => {
      expect(classifyCapabilityProbe('có gửi chiến dịch qua Telegram được không', 'vi'))
        .toMatchObject({ kind: 'unsupported', id: 'unsupported_channel' });
    });

    it('formatAssistantCapabilities("vi") KHÔNG có mục hướng dẫn Telegram, Telegram vẫn nằm trong KHÔNG HỖ TRỢ', () => {
      const prompt = formatAssistantCapabilities('vi');
      const guideSection = prompt.split('## KHÔNG HỖ TRỢ')[0];
      expect(guideSection).not.toContain('Telegram');
      expect(prompt).toContain('KHÔNG HỖ TRỢ');
      const unsupportedSection = prompt.split('## KHÔNG HỖ TRỢ')[1];
      expect(unsupportedSection).toContain('Telegram');
    });
  });

  describe('cờ BẬT — Telegram chuyển sang chỉ hướng dẫn', () => {
    beforeEach(() => {
      process.env[FLAG] = 'true';
    });

    it('gửi tin telegram cho khách → guide:telegram_campaign', () => {
      expect(classifyUnsupportedSendRequest('gửi tin telegram cho khách', 'vi'))
        .toMatchObject({ kind: 'guide', id: 'telegram_campaign' });
    });

    it('có gửi chiến dịch qua Telegram được không → guide:telegram_campaign', () => {
      expect(classifyCapabilityProbe('có gửi chiến dịch qua Telegram được không', 'vi'))
        .toMatchObject({ kind: 'guide', id: 'telegram_campaign' });
    });

    it('gửi tin whatsapp cho khách hàng → vẫn unsupported_channel (chỉ Telegram được gỡ)', () => {
      expect(classifyUnsupportedSendRequest('gửi tin whatsapp cho khách hàng', 'vi'))
        .toMatchObject({ kind: 'unsupported', id: 'unsupported_channel' });
    });

    it('chatbot telegram của tôi không trả lời → null (câu hỏi chatbot, không phải gửi chiến dịch)', () => {
      expect(classifyUnsupportedSendRequest('chatbot telegram của tôi không trả lời', 'vi')).toBeNull();
    });

    // Đột biến (a) trong Nghiệm thu — bỏ `!CHATBOT_CONTEXT_RE` khỏi telegram_campaign.matches: câu
    // này có đủ cả 3 (kênh telegram + gửi + chatbot) nên là ca DUY NHẤT lật đỏ nếu bỏ nhánh loại trừ đó.
    it('gửi tin nhắn cho chatbot qua telegram → null (có "gửi" NHƯNG là hỏi chatbot, không phải chiến dịch)', () => {
      expect(classifyUnsupportedSendRequest('gửi tin nhắn cho chatbot qua telegram', 'vi')).toBeNull();
    });

    it('formatAssistantCapabilities("vi") có Telegram trong CHỈ HƯỚNG DẪN, KHÔNG còn trong KHÔNG HỖ TRỢ', () => {
      const prompt = formatAssistantCapabilities('vi');
      const guideSection = prompt.split('## KHÔNG HỖ TRỢ')[0];
      const unsupportedSection = prompt.split('## KHÔNG HỖ TRỢ')[1];
      expect(guideSection).toContain('Telegram');
      expect(unsupportedSection).not.toContain('Telegram');
    });
  });
});
