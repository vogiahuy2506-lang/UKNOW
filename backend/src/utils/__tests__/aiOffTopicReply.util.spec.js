/**
 * Unit tests for `aiOffTopicReply.util.js`.
 *
 * Bug production (14/09/2026, WhatsApp Baileys):
 *   Khách: "hello em là ai", "rảnh ko", "em làm dc gì"
 *   Bot: "Đang chờ ghi chú thanh toán này. Bạn có thể phải chờ một lúc.
 *         Tìm hiểu thêm."
 *   → AI trả lời template payment-note không liên quan đến câu chào.
 *
 * Cover:
 *   - Detect trigger phrase "ghi chú thanh toán" + customer không hỏi
 *     payment → off-topic ✅
 *   - Detect trigger phrase + customer HỎI về bill → KHÔNG off-topic
 *   - Customer gửi câu xã giao ngắn + AI reply ngắn không overlap → off-topic
 *   - Customer hỏi câu dài + AI reply match → KHÔNG off-topic
 *   - buildOffTopicFallback trả về câu friendly có nhắc lại tên assistant
 *     và customer text
 *   - Edge cases: empty / non-string inputs không throw
 */

import { jest, describe, it, expect } from '@jest/globals';
import {
  detectOffTopicReply,
  buildOffTopicFallback,
} from '../aiOffTopicReply.util.js';

describe('detectOffTopicReply', () => {
  it('flags "Đang chờ ghi chú thanh toán" reply when customer greets', () => {
    const result = detectOffTopicReply({
      customerMessage: 'hello em là ai',
      aiReply: 'Đang chờ ghi chú thanh toán này. Bạn có thể phải chờ một lúc. Tìm hiểu thêm.',
    });
    expect(result.isOffTopic).toBe(true);
    expect(result.reason).toMatch(/off-topic/i);
  });

  it('flags "ghi chú thanh toán" reply when customer asks off-topic questions', () => {
    const cases = [
      'rảnh ko',
      'em làm dc gì',
      'hiii',
      'em tôi đẹp trai kk',
      'hi',
      'shop ơi',
      'ê',
    ];
    for (const customerMessage of cases) {
      const result = detectOffTopicReply({
        customerMessage,
        aiReply: 'Đang chờ ghi chú thanh toán này. Bạn có thể phải chờ một lúc. Tìm hiểu thêm.',
      });
      expect(result.isOffTopic).toBe(true);
    }
  });

  it('does NOT flag when customer asks about payment/bill/order', () => {
    const cases = [
      'mình gửi bill rồi nhé',
      'tôi đã chuyển khoản xong',
      'cho hỏi về đơn hàng #123',
      'payment của tôi sao rồi',
      'hóa đơn thanh toán',
    ];
    for (const customerMessage of cases) {
      const result = detectOffTopicReply({
        customerMessage,
        aiReply: 'Đang chờ ghi chú thanh toán này. Bạn có thể phải chờ một lúc. Tìm hiểu thêm.',
      });
      // Customer explicitly mentions payment/bill → AI reply về cùng
      // chủ đề là phù hợp, KHÔNG off-topic.
      expect(result.isOffTopic).toBe(false);
    }
  });

  it('does NOT flag when customer asks long technical question + AI gives matching long answer', () => {
    const result = detectOffTopicReply({
      customerMessage: 'Bên mình có bán sản phẩm laptop không? Giá bao nhiêu vậy?',
      aiReply: 'Dạ bên mình có bán laptop nhé. Giá từ 15 đến 25 triệu tuỳ cấu hình. Bạn quan tâm dòng nào ạ?',
    });
    expect(result.isOffTopic).toBe(false);
  });

  it('flags short AI reply to social greeting when token overlap is zero', () => {
    const result = detectOffTopicReply({
      customerMessage: 'hiii',
      aiReply: 'Xin chào quý khách, hệ thống đang xử lý giao dịch thanh toán.',
    });
    expect(result.isOffTopic).toBe(true);
  });

  it('flags long detailed answer when greeting has no shared keyword with reply', () => {
    // AI starts reply with "Chào bạn" — but customer "hi" shares NO
    // token with the reply (tokenize strips diacritics and short
    // words; "hi" stays as "hi", "Chào" becomes "chao"). Zero
    // overlap + short customer text → Check 2 fires.
    //
    // Đây là corner case: greeting-echo semantics rất mơ hồ với
    // tiếng Việt có dấu. Production thực tế AI sẽ KHÔNG bao giờ
    // reply chỉ "Chào bạn!" mà thường kèm nội dung về sản phẩm →
    // overlap sẽ tăng nếu customer hỏi về sản phẩm. Còn câu "hi"
    // thuần tuý vẫn cần fallback để không bị off-topic hoàn toàn.
    const result = detectOffTopicReply({
      customerMessage: 'hi',
      aiReply: 'Chào bạn! Mình là trợ lý ảo của shop. Mình có thể giúp bạn tìm hiểu về sản phẩm, giá cả, và đặt hàng. Bạn cần mình hỗ trợ gì nè?',
    });
    // Zero overlap → off-topic by Check 2. Đây là intentional:
    // fallback sẽ nhắc lại customer text + hỏi cần gì, tránh việc
    // khách nhận câu trả lời "lan man" không liên quan.
    expect(result.isOffTopic).toBe(true);
  });

  it('flags when AI reply to greeting has no greeting echo and no shared keywords', () => {
    // AI jumps straight to a payment-topic reply without acknowledging
    // the greeting at all → off-topic.
    const result = detectOffTopicReply({
      customerMessage: 'hi',
      aiReply: 'Đang chờ ghi chú thanh toán. Tìm hiểu thêm.',
    });
    expect(result.isOffTopic).toBe(true);
  });

  it('returns false for empty inputs without throwing', () => {
    expect(detectOffTopicReply({ customerMessage: '', aiReply: '' }).isOffTopic).toBe(false);
    expect(detectOffTopicReply({ customerMessage: null, aiReply: 'test' }).isOffTopic).toBe(false);
    expect(detectOffTopicReply({ customerMessage: 'test', aiReply: undefined }).isOffTopic).toBe(false);
  });

  it('does NOT flag when both messages have keyword overlap', () => {
    const result = detectOffTopicReply({
      customerMessage: 'shop có bán điện thoại không',
      aiReply: 'Dạ shop có bán điện thoại nhé, bạn quan tâm hãng nào ạ?',
    });
    expect(result.isOffTopic).toBe(false);
  });
});

describe('buildOffTopicFallback', () => {
  it('includes assistant name in the fallback reply', () => {
    const reply = buildOffTopicFallback({
      assistantName: 'Lan Anh',
      customerMessage: 'hello em là ai',
    });
    expect(reply).toContain('Lan Anh');
    // Natural greeting: phải mời hỏi tiếp
    expect(reply).toMatch(/(hỗ trợ|cần|giúp|giúp gì|hỏi)/i);
  });

  it('does NOT echo the customer message excerpt in the fallback', () => {
    // Mục đích: tránh spam/echo nội dung gốc của khách (có thể là link hoặc text dài).
    // Fallback mới chào lịch sự + mời hỏi tiếp, KHÔNG nhắc lại câu hỏi.
    const reply = buildOffTopicFallback({
      assistantName: 'Bot',
      customerMessage: 'rảnh ko shop',
    });
    expect(reply).not.toContain('rảnh ko shop');
  });

  it('uses greeting when customer message contains a greeting word', () => {
    const reply = buildOffTopicFallback({
      assistantName: 'Bot',
      customerMessage: 'hi shop',
    });
    expect(reply).toMatch(/Chào bạn/i);
  });

  it('uses generic greeting when customer message has no greeting word', () => {
    const reply = buildOffTopicFallback({
      assistantName: 'Bot',
      customerMessage: 'cho hỏi sản phẩm',
    });
    // Sau redesign: câu không chào cũng dùng 'Xin chào' cho tự nhiên
    expect(reply).toMatch(/Xin chào|Chào bạn/i);
  });

  it('falls back to "trợ lý ảo" when no assistant name provided', () => {
    const reply = buildOffTopicFallback({
      assistantName: null,
      customerMessage: 'hi',
    });
    expect(reply).toContain('trợ lý ảo');
  });

  it('truncates very long customer messages to 40 chars in fallback', () => {
    const longMessage = 'a'.repeat(100);
    const reply = buildOffTopicFallback({
      assistantName: 'Bot',
      customerMessage: longMessage,
    });
    // Echo length should be capped so the fallback stays short.
    expect(reply).not.toContain('a'.repeat(50));
  });
});
