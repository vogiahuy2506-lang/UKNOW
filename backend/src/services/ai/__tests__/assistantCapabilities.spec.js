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
    ['Can you create a landing page', 'en', 'core', 'landing_page'],
    ['Can I create a landing page?', 'vi', 'core', 'landing_page'],
    ['Bạn có thể tạo landing page cho tôi không', 'vi', 'core', 'landing_page'],
    ['Can you create a landing page for me?', 'en', 'core', 'landing_page'],
    ['hệ thống có gửi SMS không', 'vi', 'unsupported', 'unsupported_channel'],
    ['do you support A/B testing', 'vi', 'unsupported', 'ab_testing'],
    ['trợ lý hẹn giờ gửi được không', 'vi', 'guide', 'schedule'],
    ['bạn có thể tạo chiến dịch SMS không', 'vi', 'unsupported', 'unsupported_channel'],
    ['Can you create and schedule a Zalo campaign?', 'en', 'guide', 'schedule'],
  ])('classifies %s', (question, locale, kind, id) => {
    expect(classifyCapabilityProbe(question, locale)).toMatchObject({ kind, id });
  });

  it.each([
    'làm sao để tạo chiến dịch',
    'how can I create a campaign',
    'tạo landing page cho khóa học',
  ])('leaves how-to and command text for the existing router: %s', (question) => {
    expect(classifyCapabilityProbe(question, 'vi')).toBeNull();
  });
});
