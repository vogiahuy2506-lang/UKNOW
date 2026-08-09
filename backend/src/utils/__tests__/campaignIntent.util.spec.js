import { describe, expect, it } from '@jest/globals';
import {
  asksOnlyForGoogleSheet,
  buildCampaignDataSourceQuestion,
  hasExplicitCustomerSource,
  isMultiDaySeriesRequest,
  langInstruction,
  lastUserMessageContent,
  looksLikeCampaignRequest,
  looksLikeInlineSeriesDraft,
} from '../campaignIntent.util.js';

describe('campaignIntent.util', () => {
  it('langInstruction switches by locale', () => {
    expect(langInstruction('en')).toMatch(/English/);
    expect(langInstruction('vi')).toMatch(/tiếng Việt/);
  });

  it('lastUserMessageContent finds last user turn', () => {
    expect(lastUserMessageContent([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
    ])).toBe('c');
    expect(lastUserMessageContent([])).toBe('');
  });

  it('hasExplicitCustomerSource detects sheet/file/db', () => {
    expect(hasExplicitCustomerSource('dùng Google Sheet này')).toBe(true);
    expect(hasExplicitCustomerSource('xin chào')).toBe(false);
  });

  it('looksLikeCampaignRequest', () => {
    expect(looksLikeCampaignRequest('tạo chiến dịch email')).toBe(true);
    expect(looksLikeCampaignRequest('thời tiết hôm nay')).toBe(false);
  });

  it('asksOnlyForGoogleSheet only on ask_more sheet prompts', () => {
    expect(asksOnlyForGoogleSheet({
      type: 'ask_more',
      content: 'Cho mình đường dẫn Google Sheet',
      missing_fields: [],
    })).toBe(true);
    expect(asksOnlyForGoogleSheet({ type: 'text', content: 'Google Sheet' })).toBe(false);
  });

  it('buildCampaignDataSourceQuestion returns ask_campaign_details', () => {
    const vi = buildCampaignDataSourceQuestion('vi');
    expect(vi.type).toBe('ask_campaign_details');
    expect(vi.data.questions[0].id).toBe('dataSource');
    const en = buildCampaignDataSourceQuestion('en');
    expect(en.content).toMatch(/customer list/i);
  });

  it('isMultiDaySeriesRequest', () => {
    expect(isMultiDaySeriesRequest('Soạn chiến dịch 5 tin nhắn Zalo trong 5 ngày')).toBe(true);
    expect(isMultiDaySeriesRequest('5 ngày nghỉ')).toBe(false);
  });

  it('looksLikeInlineSeriesDraft', () => {
    expect(looksLikeInlineSeriesDraft('Tin nhắn 1: a\nTin nhắn 2: b')).toBe(true);
    expect(looksLikeInlineSeriesDraft('Tin nhắn 1: a')).toBe(false);
  });
});
