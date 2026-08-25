import { describe, it, expect } from 'vitest';
import {
  WIZARD_ASSISTANT_TYPES,
  findLastWizardCardIndex,
  shouldKeepWizardCard,
} from '../wizardCardHistory.js';

/**
 * Regression (bug thật 25/08/2026): sau khi F5, mọi thẻ cổng đã trả lời hiện lại và xếp chồng
 * trong khung chat — kèm nút mờ "Chọn hết các mục bên trên để tiếp tục", còn câu trả lời của
 * người dùng là marker ẩn nên không thấy đâu.
 *
 * Gốc: lúc chạy live `stripWizardCards` bỏ thẻ cũ mỗi khi thẻ mới xuất hiện, nhưng đường dựng
 * lại từ DB không áp cùng luật.
 */
describe('wizardCardHistory — chỉ giữ thẻ cổng cuối cùng', () => {
  const gate = (type, content) => ({ role: 'assistant', type, content });

  it('tìm đúng thẻ cổng cuối cùng', () => {
    const messages = [
      { role: 'user', content: 'tạo chiến dịch' },
      gate('ask_campaign_details', 'Kênh nào?'),
      { role: 'user', content: '[wizard]{"gate":"channel"}' },
      gate('ask_sender_account', 'Tài khoản nào?'),
      { role: 'user', content: '[wizard]{"gate":"senderAccount"}' },
      gate('ask_campaign_details', 'Người nhận từ đâu?'),
    ];

    expect(findLastWizardCardIndex(messages)).toBe(5);
  });

  it('không có thẻ cổng nào → -1', () => {
    expect(findLastWizardCardIndex([{ role: 'user', content: 'chào' }])).toBe(-1);
    expect(findLastWizardCardIndex([])).toBe(-1);
    expect(findLastWizardCardIndex(null)).toBe(-1);
  });

  it('thẻ cổng đã trả lời (không phải thẻ cuối) thì KHÔNG giữ', () => {
    const older = gate('ask_campaign_details', 'Kênh nào?');
    expect(shouldKeepWizardCard(older, 1, 5)).toBe(false);
  });

  it('thẻ cổng cuối cùng thì GIỮ', () => {
    const latest = gate('ask_campaign_details', 'Người nhận từ đâu?');
    expect(shouldKeepWizardCard(latest, 5, 5)).toBe(true);
  });

  /**
   * Ranh giới quan trọng: sản phẩm cuối (template, kế hoạch, landing) KHÔNG phải câu hỏi đã
   * trả lời — người dùng cần xem lại chúng sau khi F5.
   */
  it('template_draft / content_plan / landing_page luôn được giữ', () => {
    ['template_draft', 'content_plan', 'landing_page', 'confirm_create'].forEach((type) => {
      expect(WIZARD_ASSISTANT_TYPES.has(type)).toBe(false);
      expect(shouldKeepWizardCard(gate(type, 'x'), 0, 99)).toBe(true);
    });
  });

  it('tin nhắn của người dùng không bao giờ bị đụng tới', () => {
    expect(shouldKeepWizardCard({ role: 'user', content: 'x' }, 0, 99)).toBe(true);
  });

  it('mọi loại thẻ cổng đều nằm trong luật, kể cả picker Zalo', () => {
    ['zalo_group_picker', 'zalo_friend_picker', 'email_setup_guide', 'zalo_qr_login'].forEach((type) => {
      expect(shouldKeepWizardCard(gate(type, 'x'), 1, 5)).toBe(false);
    });
  });
});
