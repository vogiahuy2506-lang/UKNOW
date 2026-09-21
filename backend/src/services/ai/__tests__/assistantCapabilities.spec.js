import { describe, expect, it } from '@jest/globals';
import {
  classifyCapabilityProbe,
  CORE_CAPABILITIES,
  GUIDE_ONLY,
  KNOWN_UNSUPPORTED,
} from '../assistantCapabilities.js';

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
});
