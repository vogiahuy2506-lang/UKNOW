import { describe, expect, it } from '@jest/globals';
import {
  isQuickSendRequest,
  inferQuickSendChannel,
  inferCampaignBriefFromText,
  isMultiDaySeriesRequestLocal,
} from '../campaignQuickSend.util.js';

describe('campaignQuickSend.util', () => {
  describe('isQuickSendRequest', () => {
    it('matches narrow VI markers', () => {
      expect(isQuickSendRequest('Gửi nhanh 1 email cảm ơn đơn hàng')).toBe(true);
      expect(isQuickSendRequest('gửi nhanh email thông báo')).toBe(true);
      expect(isQuickSendRequest('Gửi 1 email cảm ơn')).toBe(true);
      expect(isQuickSendRequest('gui nhanh 1 tin zalo')).toBe(true);
    });

    it('matches narrow EN markers', () => {
      expect(isQuickSendRequest('Quick send one email thank you')).toBe(true);
      expect(isQuickSendRequest('send one email confirmation')).toBe(true);
      expect(isQuickSendRequest('Send a single message reminder')).toBe(true);
    });

    it('does not match generic campaign requests', () => {
      expect(isQuickSendRequest('Tạo chiến dịch email chăm sóc khách')).toBe(false);
      expect(isQuickSendRequest('Create an email campaign for leads')).toBe(false);
      expect(isQuickSendRequest('Gửi email khuyến mãi khóa học')).toBe(false);
    });

    it('multi-day series wins over quick-send wording', () => {
      expect(isMultiDaySeriesRequestLocal('Gửi nhanh 5 email trong 5 ngày')).toBe(true);
      expect(isQuickSendRequest('Gửi nhanh 5 email trong 5 ngày')).toBe(false);
      expect(isQuickSendRequest('Tạo chiến dịch 5 email trong 5 ngày')).toBe(false);
      expect(isQuickSendRequest('Quick send 5 messages in 5 days drip')).toBe(false);
    });
  });

  describe('inferQuickSendChannel', () => {
    it('infers email / zalo / zalo_group', () => {
      expect(inferQuickSendChannel('Gửi nhanh 1 email cảm ơn')).toBe('email');
      expect(inferQuickSendChannel('Quick send one zalo message')).toBe('zalo');
      expect(inferQuickSendChannel('Gửi nhanh tin nhóm zalo')).toBe('zalo_group');
    });
  });

  describe('inferCampaignBriefFromText', () => {
    const courses = [
      { id: 1, name: 'Khóa AI Cơ Bản' },
      { id: 2, name: 'Khóa Marketing' },
      { id: 3, name: 'Email Mastery' },
    ];

    it('prefers exact catalog name match (single)', () => {
      const brief = inferCampaignBriefFromText('Gửi nhanh 1 email về Khóa AI Cơ Bản', courses);
      expect(brief).toMatchObject({
        contentMode: 'single_product',
        productMode: 'catalog',
        productIds: [1],
        flowMode: 'quick_send',
      });
    });

    it('prefers exact catalog names (multi)', () => {
      const brief = inferCampaignBriefFromText(
        'Gửi nhanh email về Khóa AI Cơ Bản và Khóa Marketing',
        courses
      );
      expect(brief).toMatchObject({
        contentMode: 'multiple_products',
        productMode: 'catalog_set',
        productIds: [1, 2],
      });
    });

    it('infers context for known non-product purpose', () => {
      const brief = inferCampaignBriefFromText('Gửi nhanh 1 email cảm ơn đơn hàng', courses);
      expect(brief).toMatchObject({
        contentMode: 'context',
        productMode: 'context',
        flowMode: 'quick_send',
      });
      expect(brief.topicText).toBeNull();
    });

    it('does not treat bare "nhiều" as multiple_products', () => {
      expect(inferCampaignBriefFromText('Gửi nhanh 1 email cảm ơn rất nhiều', courses)).toMatchObject({
        contentMode: 'context',
      });
      expect(inferCampaignBriefFromText('Gửi nhanh email đến nhiều khách hàng cảm ơn', courses)).toMatchObject({
        contentMode: 'context',
      });
    });

    it('matches explicit nhiều sản phẩm / multiple products', () => {
      expect(inferCampaignBriefFromText('Gửi nhanh email nhiều sản phẩm', courses)).toMatchObject({
        contentMode: 'multiple_products',
        productMode: 'catalog_set',
      });
      expect(inferCampaignBriefFromText('Quick send multiple courses promo', courses)).toMatchObject({
        contentMode: 'multiple_products',
      });
    });

    it('returns null when purpose is unclear', () => {
      expect(inferCampaignBriefFromText('Gửi nhanh 1 email', courses)).toBeNull();
      expect(inferCampaignBriefFromText('Quick send one email', [])).toBeNull();
    });

    it('does not false-match catalog name inside another word', () => {
      // "AI" must not match inside "email" after normalize
      const brief = inferCampaignBriefFromText('Gửi nhanh 1 email cảm ơn', [
        { id: 9, name: 'AI' },
      ]);
      expect(brief.contentMode).toBe('context');
      expect(brief.productIds).toEqual([]);
    });
  });

  describe('isQuickSendRequest negation', () => {
    it('rejects negated quick-send phrasing', () => {
      expect(isQuickSendRequest('Đừng gửi nhanh, tạo chiến dịch bình thường')).toBe(false);
      expect(isQuickSendRequest('Không gửi nhanh — làm drip 5 ngày')).toBe(false);
      expect(isQuickSendRequest("Don't quick send, create a normal campaign")).toBe(false);
    });

    it('rejects negation with intervening want/use words (VI/EN)', () => {
      expect(isQuickSendRequest('Tôi không muốn gửi nhanh')).toBe(false);
      expect(isQuickSendRequest('Không sử dụng gửi nhanh')).toBe(false);
      expect(isQuickSendRequest('Tôi không cần gửi nhanh email này')).toBe(false);
      expect(isQuickSendRequest('Please do not use quick send')).toBe(false);
      expect(isQuickSendRequest("I don't want a quick send")).toBe(false);
      expect(isQuickSendRequest('We should not use quick send for this')).toBe(false);
      expect(isQuickSendRequest('không muốn chỉ gửi nhanh')).toBe(false);
      expect(isQuickSendRequest("don't want to just quick send")).toBe(false);
    });

    it('keeps positive quick-send when negation is in a prior contrast clause', () => {
      expect(isQuickSendRequest('Không quảng bá sản phẩm mà gửi nhanh email cảm ơn')).toBe(true);
      expect(isQuickSendRequest('Do not build a campaign just quick send one email')).toBe(true);
    });

    it('still matches positive quick-send', () => {
      expect(isQuickSendRequest('Gửi nhanh 1 email cảm ơn')).toBe(true);
      expect(isQuickSendRequest('Quick send one email thank you')).toBe(true);
    });
  });
});
