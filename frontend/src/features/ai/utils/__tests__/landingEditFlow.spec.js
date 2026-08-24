import { describe, expect, it } from 'vitest';
import {
  IS_NEW_LANDING_REQ_RE,
  getLastLandingPageMessage,
  isRecentLandingPageContext,
} from '../landingEditContext';

describe('landingEditFlow helpers', () => {
  describe('IS_NEW_LANDING_REQ_RE', () => {
    it('distinguishes between edit requests and create new requests', () => {
      // Edit requests (MUST NOT match IS_NEW_LANDING_REQ_RE)
      expect(IS_NEW_LANDING_REQ_RE.test('tôi muốn nền có màu tím')).toBe(false);
      expect(IS_NEW_LANDING_REQ_RE.test('giữ nguyên thiết kế cũ, chỉ đổi màu nền')).toBe(false);
      expect(IS_NEW_LANDING_REQ_RE.test('làm lại phần header cho gọn hơn')).toBe(false);
      expect(IS_NEW_LANDING_REQ_RE.test('đổi màu nền rồi làm lại phần CTA')).toBe(false);
      expect(IS_NEW_LANDING_REQ_RE.test('tạo lại trang này với tông xanh')).toBe(false);
      expect(IS_NEW_LANDING_REQ_RE.test('sửa tiêu đề thành Workshop AI 2026')).toBe(false);
      expect(IS_NEW_LANDING_REQ_RE.test('thêm nút liên hệ qua Zalo')).toBe(false);
      expect(IS_NEW_LANDING_REQ_RE.test('hạn mức Zalo của tôi còn bao nhiêu?')).toBe(false);

      // Create new requests (MUST match IS_NEW_LANDING_REQ_RE)
      expect(IS_NEW_LANDING_REQ_RE.test('tạo landing page mới về khoá học tiếng Anh')).toBe(true);
      expect(IS_NEW_LANDING_REQ_RE.test('tạo landing page về khoá học tiếng Anh')).toBe(true);
      expect(IS_NEW_LANDING_REQ_RE.test('làm cho tôi một landing page khác bán mỹ phẩm')).toBe(true);
      expect(IS_NEW_LANDING_REQ_RE.test('thiết kế landing page cho quán cafe')).toBe(true);
      expect(IS_NEW_LANDING_REQ_RE.test('tạo một trang đích bán đồ gia dụng')).toBe(true);
      expect(IS_NEW_LANDING_REQ_RE.test('tạo trang mới về mỹ phẩm')).toBe(true);
      expect(IS_NEW_LANDING_REQ_RE.test('làm một landing page khác cho dịch vụ spa')).toBe(true);
      expect(IS_NEW_LANDING_REQ_RE.test('tạo 1 landing page mới')).toBe(true);
      expect(IS_NEW_LANDING_REQ_RE.test('create a new landing page for real estate')).toBe(true);
      expect(IS_NEW_LANDING_REQ_RE.test('generate landing page about yoga courses')).toBe(true);
    });
  });

  describe('isRecentLandingPageContext', () => {
    const initialLandingMsg = {
      role: 'assistant',
      type: 'landing_page',
      data: { title: 'Workshop AI', html: '<div>Workshop AI 149k</div>' },
    };

    it('returns landing page context on 1st, 2nd, 3rd, and subsequent edits with landing_edit_ack', () => {
      // 0 edits
      let messages = [
        { role: 'user', content: 'Tạo landing page' },
        initialLandingMsg,
      ];
      expect(isRecentLandingPageContext(messages)?.message?.data?.title).toBe('Workshop AI');

      // 1st edit: user request + assistant landing_edit_ack
      messages = [
        ...messages,
        { role: 'user', content: 'đổi màu nền tím' },
        { role: 'assistant', type: 'landing_edit_ack', content: 'Đã cập nhật landing page.' },
      ];
      expect(isRecentLandingPageContext(messages)?.message?.data?.title).toBe('Workshop AI');

      // 2nd edit
      messages = [
        ...messages,
        { role: 'user', content: 'đổi nút CTA sang màu cam' },
        { role: 'assistant', type: 'landing_edit_ack', content: 'Đã cập nhật landing page.' },
      ];
      expect(isRecentLandingPageContext(messages)?.message?.data?.title).toBe('Workshop AI');

      // 3rd edit
      messages = [
        ...messages,
        { role: 'user', content: 'sửa học phí thành 199.000đ' },
        { role: 'assistant', type: 'landing_edit_ack', content: 'Đã cập nhật landing page.' },
      ];
      expect(isRecentLandingPageContext(messages)?.message?.data?.title).toBe('Workshop AI');

      // 4th edit
      messages = [
        ...messages,
        { role: 'user', content: 'thêm mục đánh giá học viên' },
        { role: 'assistant', type: 'landing_edit_ack', content: 'Đã cập nhật landing page.' },
      ];
      expect(isRecentLandingPageContext(messages)?.message?.data?.title).toBe('Workshop AI');
    });

    it('returns null if normal Q&A text message occurs after landing page', () => {
      const messages = [
        initialLandingMsg,
        { role: 'user', content: 'hạn mức Zalo của tôi còn bao nhiêu?' },
        { role: 'assistant', type: 'text', content: 'Bạn còn 500 tin nhắn Zalo trong tháng này.' },
      ];

      expect(isRecentLandingPageContext(messages)).toBeNull();
    });

    it('returns null if a wizard interactive card takes over', () => {
      const messages = [
        initialLandingMsg,
        { role: 'user', content: 'đổi màu nền tím' },
        { role: 'assistant', type: 'landing_edit_ack', content: 'Đã cập nhật landing page.' },
        { role: 'user', content: 'Tạo chiến dịch email cho tôi' },
        { role: 'assistant', type: 'ask_campaign_details', data: {} },
      ];

      expect(isRecentLandingPageContext(messages)).toBeNull();
    });

    it('returns null if no landing page exists in history', () => {
      const messages = [
        { role: 'user', content: 'Chào AI' },
        { role: 'assistant', type: 'text', content: 'Chào bạn!' },
      ];
      expect(isRecentLandingPageContext(messages)).toBeNull();
      expect(getLastLandingPageMessage(messages)).toBeNull();
    });
  });
});
