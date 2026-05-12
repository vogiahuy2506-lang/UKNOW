import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  readCampaignDraft,
  writeCampaignDraft,
  clearCampaignDraft,
} from '../campaignDraftStorage';

const STORAGE_KEY = 'founder_ai_campaign_builder_draft';

describe('campaignDraftStorage (sessionStorage)', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('writeCampaignDraft', () => {
    it('lưu object dưới dạng JSON', () => {
      writeCampaignDraft({ name: 'X', nodes: [{ id: 1 }] });
      expect(sessionStorage.getItem(STORAGE_KEY)).toBe('{"name":"X","nodes":[{"id":1}]}');
    });

    it('null/undefined → lưu "{}" (fallback)', () => {
      writeCampaignDraft(null);
      expect(sessionStorage.getItem(STORAGE_KEY)).toBe('{}');
      writeCampaignDraft(undefined);
      expect(sessionStorage.getItem(STORAGE_KEY)).toBe('{}');
    });

    it('storage quota fail → swallow (không throw)', () => {
      const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });
      expect(() => writeCampaignDraft({ x: 1 })).not.toThrow();
      setSpy.mockRestore();
    });
  });

  describe('readCampaignDraft', () => {
    it('chưa có key → trả null', () => {
      expect(readCampaignDraft()).toBeNull();
    });

    it('JSON hợp lệ → trả object', () => {
      sessionStorage.setItem(STORAGE_KEY, '{"foo":"bar","n":42}');
      expect(readCampaignDraft()).toEqual({ foo: 'bar', n: 42 });
    });

    it('JSON hỏng → trả null (swallow)', () => {
      sessionStorage.setItem(STORAGE_KEY, '{invalid');
      expect(readCampaignDraft()).toBeNull();
    });

    it('JSON parsed nhưng không phải object (string/number/null) → null', () => {
      sessionStorage.setItem(STORAGE_KEY, '"hello"');
      expect(readCampaignDraft()).toBeNull();
      sessionStorage.setItem(STORAGE_KEY, '123');
      expect(readCampaignDraft()).toBeNull();
      sessionStorage.setItem(STORAGE_KEY, 'null');
      expect(readCampaignDraft()).toBeNull();
    });

    it('round-trip write → read', () => {
      const payload = { name: 'Camp', steps: ['a', 'b'] };
      writeCampaignDraft(payload);
      expect(readCampaignDraft()).toEqual(payload);
    });
  });

  describe('clearCampaignDraft', () => {
    it('xoá key đã có', () => {
      sessionStorage.setItem(STORAGE_KEY, '{"x":1}');
      clearCampaignDraft();
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('key chưa có → no-op (không throw)', () => {
      expect(() => clearCampaignDraft()).not.toThrow();
    });
  });
});
