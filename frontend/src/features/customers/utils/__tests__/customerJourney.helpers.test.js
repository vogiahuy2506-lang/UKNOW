import { describe, it, expect } from 'vitest';
import {
  sanitizeEmailHtmlForPreview,
  normalizeStatusLabel,
  formatEventType,
  normalizeJourneyDescription,
} from '../customerJourney.helpers';

describe('sanitizeEmailHtmlForPreview', () => {
  it('empty/null → ""', () => {
    expect(sanitizeEmailHtmlForPreview(null)).toBe('');
    expect(sanitizeEmailHtmlForPreview('')).toBe('');
    expect(sanitizeEmailHtmlForPreview('   ')).toBe('');
  });

  it('xoá thẻ <img>', () => {
    const html = '<p>Hello</p><img src="x.jpg" alt="x" /><p>World</p>';
    const out = sanitizeEmailHtmlForPreview(html);
    expect(out).not.toContain('<img');
    expect(out).toContain('Hello');
    expect(out).toContain('World');
  });

  it('disable <a>: href=#, onclick return false, pointer-events none', () => {
    const html = '<a href="https://x.com">Link</a>';
    const out = sanitizeEmailHtmlForPreview(html);
    expect(out).toContain('href="#"');
    expect(out).toContain('onclick="return false;"');
    expect(out).toContain('pointer-events: none');
    expect(out).toContain('text-decoration: underline');
  });

  it('giữ nguyên text content và các thẻ khác', () => {
    const html = '<div><strong>Bold</strong></div>';
    const out = sanitizeEmailHtmlForPreview(html);
    expect(out).toContain('<strong>Bold</strong>');
  });

  it('nhiều <img> và <a> → xử lý tất cả', () => {
    const html = '<a href="1">a1</a><img src="1"/><a href="2">a2</a><img src="2"/>';
    const out = sanitizeEmailHtmlForPreview(html);
    expect(out.match(/<img/g)).toBeNull();
    expect((out.match(/href="#"/g) || []).length).toBe(2);
  });
});

describe('normalizeStatusLabel', () => {
  it('empty/null → "--"', () => {
    expect(normalizeStatusLabel(null)).toBe('--');
    expect(normalizeStatusLabel('')).toBe('--');
  });

  it('chứa "link" → "Đã nhấn link khóa học"', () => {
    expect(normalizeStatusLabel('Click link course')).toBe('Đã nhấn link khóa học');
  });

  it('chứa "email" → "Đã nhận email"', () => {
    expect(normalizeStatusLabel('email sent')).toBe('Đã nhận email');
  });

  it('chứa "on-hold"/"onhold"/"quan" → "Để lại thông tin"', () => {
    expect(normalizeStatusLabel('quan tâm')).toBe('Để lại thông tin');
    expect(normalizeStatusLabel('on-hold')).toBe('Để lại thông tin');
    expect(normalizeStatusLabel('onhold')).toBe('Để lại thông tin');
  });

  it('chứa "mua" → "Đã mua"', () => {
    expect(normalizeStatusLabel('Khách mua')).toBe('Đã mua');
  });

  it('không match → trả nguyên label trim', () => {
    expect(normalizeStatusLabel('  Other  ')).toBe('Other');
  });
});

describe('formatEventType', () => {
  it.each([
    ['email_sent', 'Email đã gửi'],
    ['email_opened', 'Email đã mở'],
    ['email_clicked', 'Email đã nhấp'],
    ['attachment_downloaded', 'Tải tệp đính kèm'],
    ['course_interest', 'Để lại thông tin'],
    ['course_purchase', 'Mua hàng thành công'],
    ['order_pending', 'Đơn hàng chờ xử lý'],
    ['order_completed', 'Đơn hàng hoàn thành'],
    ['zalo_sent', 'Tin nhắn Zalo đã gửi'],
    ['zalo_clicked', 'Đã nhấp link trong Zalo'],
  ])('%s → %s', (input, expected) => {
    expect(formatEventType(input)).toBe(expected);
  });

  it('case-insensitive (uppercase input)', () => {
    expect(formatEventType('EMAIL_SENT')).toBe('Email đã gửi');
  });

  it('không match → trả nguyên eventType hoặc fallback "Sự kiện"', () => {
    expect(formatEventType('weird_type')).toBe('weird_type');
    expect(formatEventType('')).toBe('Sự kiện');
    expect(formatEventType(null)).toBe('Sự kiện');
  });
});

describe('normalizeJourneyDescription', () => {
  it('eventType khớp → mô tả tiếng Việt cố định', () => {
    expect(normalizeJourneyDescription({ eventType: 'email_sent' })).toBe('Đã gửi email');
    expect(normalizeJourneyDescription({ eventType: 'email_opened' })).toBe('Khách hàng đã mở email');
    expect(normalizeJourneyDescription({ eventType: 'course_purchase' })).toBe('Khách hàng mua hàng thành công');
  });

  it('eventType khác + description chứa keyword (không dấu) → fuzzy match', () => {
    expect(normalizeJourneyDescription({ eventType: 'other', description: 'Khach hang da mo email' }))
      .toBe('Khách hàng đã mở email');
    expect(normalizeJourneyDescription({ eventType: 'other', description: 'Khach hang da click vao link' }))
      .toBe('Khách hàng đã nhấp vào link trong email');
    expect(normalizeJourneyDescription({ eventType: 'other', description: 'don hang on-hold' }))
      .toBe('Khách hàng để lại thông tin (đơn hàng on-hold)');
  });

  it('không match → trả description raw hoặc eventType', () => {
    expect(normalizeJourneyDescription({ eventType: 'unknown', description: 'plain text' })).toBe('plain text');
    expect(normalizeJourneyDescription({ eventType: 'unknown' })).toBe('unknown');
    expect(normalizeJourneyDescription({})).toBe('Sự kiện');
  });

  it('description chứa HTML entity → decode trước khi match', () => {
    expect(normalizeJourneyDescription({ eventType: 'x', description: 'Khach hang da mo email &amp; OK' }))
      .toBe('Khách hàng đã mở email');
  });
});
