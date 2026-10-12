import { describe, it, expect } from '@jest/globals';
import {
  MAX_CAMPAIGN_FORM_IDS,
  normalizeFormIdList,
  normalizeCampaignFormIds,
} from '../campaignFormIds.util.js';

describe('campaignFormIds.util (PR-7b) — danh sách biểu mẫu của node read_form_submissions', () => {
  describe('normalizeFormIdList', () => {
    it('mảng số / chuỗi số → số nguyên dương, giữ thứ tự, bỏ trùng', () => {
      expect(normalizeFormIdList([3, '4', 3, 5, '5'])).toEqual([3, 4, 5]);
    });

    it('chuỗi "1,2,3" (query ?formIds=1,2,3) → [1,2,3]', () => {
      expect(normalizeFormIdList('1, 2,3')).toEqual([1, 2, 3]);
    });

    it('bỏ giá trị rác: 0, âm, thập phân, chữ, null, object, chuỗi số kèm chữ', () => {
      expect(normalizeFormIdList([0, -4, 1.5, 'abc', null, undefined, {}, [], '12abc', '', 7])).toEqual([7]);
    });

    it('không phải mảng/chuỗi → []', () => {
      expect(normalizeFormIdList(undefined)).toEqual([]);
      expect(normalizeFormIdList(5)).toEqual([]);
      expect(normalizeFormIdList({})).toEqual([]);
    });

    it(`chặn trần ${MAX_CAMPAIGN_FORM_IDS} biểu mẫu`, () => {
      const many = Array.from({ length: MAX_CAMPAIGN_FORM_IDS + 25 }, (_, i) => i + 1);
      const out = normalizeFormIdList(many);
      expect(out).toHaveLength(MAX_CAMPAIGN_FORM_IDS);
      expect(out[0]).toBe(1);
    });
  });

  describe('normalizeCampaignFormIds', () => {
    it('đồ thị CŨ chỉ có formId (số) → [formId]', () => {
      expect(normalizeCampaignFormIds({ formId: 12 })).toEqual([12]);
    });

    it('đồ thị cũ lưu formId dạng chuỗi (select FE) → số', () => {
      expect(normalizeCampaignFormIds({ formId: '12' })).toEqual([12]);
    });

    it('formIds hợp lệ THẮNG formId cũ còn sót', () => {
      expect(normalizeCampaignFormIds({ formIds: [5, 6], formId: 9 })).toEqual([5, 6]);
    });

    it('formIds rỗng hoặc toàn rác → rơi về formId cũ', () => {
      expect(normalizeCampaignFormIds({ formIds: [], formId: 9 })).toEqual([9]);
      expect(normalizeCampaignFormIds({ formIds: ['x', null], formId: 9 })).toEqual([9]);
    });

    it('không có gì hợp lệ / config rỗng / null → []', () => {
      expect(normalizeCampaignFormIds({})).toEqual([]);
      expect(normalizeCampaignFormIds(null)).toEqual([]);
      expect(normalizeCampaignFormIds(undefined)).toEqual([]);
      expect(normalizeCampaignFormIds({ formId: '', formIds: [] })).toEqual([]);
      expect(normalizeCampaignFormIds({ formId: 0 })).toEqual([]);
    });
  });
});
