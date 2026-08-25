/**
 * Bất biến: prompt do hệ thống tự sinh KHÔNG BAO GIỜ hiện ra như tin nhắn người dùng gõ.
 *
 * Các chuỗi dưới đây dựng lại đúng cách AiChatbot.jsx sinh chúng — nếu ai đổi câu chữ ở
 * nơi sinh mà quên cập nhật bộ nhận diện, test này đỏ trước khi người dùng nhìn thấy.
 */
import { describe, it, expect } from 'vitest';
import { isInternalAssistantPrompt } from '../internalPrompts';

describe('isInternalAssistantPrompt', () => {
  it('bắt prompt xin kế hoạch theo ngày (VI) — AiChatbot.jsx requestContentPlan', () => {
    const prompt = 'Hãy trả về content_plan JSON (kế hoạch từng ngày, không viết full nội dung tin) cho: Kênh gửi: email.\nLịch gửi: chuỗi 3 ngày, mỗi ngày 2 tin.';
    expect(isInternalAssistantPrompt(prompt)).toBe(true);
  });

  it('bắt prompt xin kế hoạch theo ngày (EN)', () => {
    const prompt = 'Return content_plan JSON only (day-by-day overview, no full message bodies) for: Channel: email.';
    expect(isInternalAssistantPrompt(prompt)).toBe(true);
  });

  it('bắt prompt soạn template từng slot — đúng chuỗi người dùng nhìn thấy ngày 25/08', () => {
    const prompt = 'Tạo chi tiết template cho ngày 1, slot 1 (Email). Mục tiêu ngày: Báo cáo tổng quan hoàn thành Task 4 và Trợ lý AI Tóm tắt ngày: … Khung giờ gửi: 08:30';
    expect(isInternalAssistantPrompt(prompt)).toBe(true);
  });

  it('bắt cả biến thể kênh Zalo', () => {
    expect(isInternalAssistantPrompt('Tạo chi tiết template cho ngày 3, slot 2 (Zalo cá nhân). Mục tiêu ngày: …')).toBe(true);
    expect(isInternalAssistantPrompt('Tạo chi tiết template cho ngày 2, slot 1 (Zalo nhóm). Mục tiêu ngày: …')).toBe(true);
  });

  it('KHÔNG bắt nhầm câu người dùng gõ thật', () => {
    expect(isInternalAssistantPrompt('tạo giúp tôi chiến dịch email')).toBe(false);
    expect(isInternalAssistantPrompt('tạo cho tôi chiến dịch zalo cá nhân')).toBe(false);
    // Nói VỀ template nhưng không phải prompt máy sinh — phải giữ hiển thị.
    expect(isInternalAssistantPrompt('bạn tạo chi tiết template giúp tôi nhé')).toBe(false);
    expect(isInternalAssistantPrompt('cho tôi xem content_plan')).toBe(false);
  });

  it('chuỗi rỗng / không phải chuỗi thì không bắt', () => {
    expect(isInternalAssistantPrompt('')).toBe(false);
    expect(isInternalAssistantPrompt('   ')).toBe(false);
    expect(isInternalAssistantPrompt(null)).toBe(false);
    expect(isInternalAssistantPrompt(undefined)).toBe(false);
  });
});
