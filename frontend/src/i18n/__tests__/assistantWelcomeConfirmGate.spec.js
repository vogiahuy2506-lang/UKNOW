import { describe, expect, it } from 'vitest';
import vi from '../vi.js';
import en from '../en.js';

/**
 * Rà soát EXTRA-C1 — lời chào của trợ lý không được hứa "tự tạo và chạy chiến dịch".
 *
 * Từ rà soát C P1-4, MỌI chiến dịch trợ lý soạn đều đi qua thẻ xác nhận: người dùng xem nội dung, người nhận, bộ lọc
 * rồi tự bấm "Tạo" / "Tạo và chạy". Nhưng câu chào (`aiChatbot.welcomeUser`) vẫn viết "tôi sẽ tự tạo và chạy chiến dịch
 * cho bạn!" + dòng "Tạo và chạy chiến dịch tự động" — hứa một thứ hệ thống cố ý không làm, và khách tin theo.
 *
 * Giữ nguyên ý nghĩa, không giữ nguyên chữ: spec soi cụm hứa tự chạy (cấm) và cụm "xem lại + xác nhận" (bắt buộc),
 * cả hai ngôn ngữ — dịch lại câu chào thì vẫn phải qua hai chốt này.
 */
describe('aiChatbot.welcomeUser — không hứa tự chạy, nói rõ người dùng xác nhận', () => {
  const CUM_HUA_TU_CHAY_VI = [/tự\s+tạo\s+và\s+chạy/i, /tạo\s+và\s+chạy\s+chiến\s+dịch\s+tự\s+động/i, /chạy\s+chiến\s+dịch\s+cho\s+bạn/i];
  const CUM_HUA_TU_CHAY_EN = [/create\s+and\s+run\s+(?:automatic\s+)?campaigns?/i, /run\s+campaigns\s+for\s+you/i];

  it('vi: không có cụm hứa tự tạo/chạy; có "xem lại và xác nhận"', () => {
    const text = vi.aiChatbot.welcomeUser;
    CUM_HUA_TU_CHAY_VI.forEach((re) => expect(text).not.toMatch(re));
    expect(text).toMatch(/xem lại và xác nhận/);
  });

  it('en: không có cụm hứa tự tạo/chạy; có "review and confirm"', () => {
    const text = en.aiChatbot.welcomeUser;
    CUM_HUA_TU_CHAY_EN.forEach((re) => expect(text).not.toMatch(re));
    expect(text).toMatch(/review and confirm/i);
  });
});
