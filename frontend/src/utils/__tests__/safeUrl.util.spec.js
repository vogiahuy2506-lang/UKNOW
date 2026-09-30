import { describe, it, expect } from 'vitest';
import { getSafeLinkUrl, getSafeImageUrl } from '../safeUrl.util';

describe('getSafeLinkUrl', () => {
  it('giữ nguyên http/https/mailto/tel (đã trim)', () => {
    expect(getSafeLinkUrl('https://zalo.me/g/abc')).toBe('https://zalo.me/g/abc');
    expect(getSafeLinkUrl('  http://example.com/a?b=1  ')).toBe('http://example.com/a?b=1');
    expect(getSafeLinkUrl('mailto:hotro@example.com')).toBe('mailto:hotro@example.com');
    expect(getSafeLinkUrl('tel:+84901234567')).toBe('tel:+84901234567');
    expect(getSafeLinkUrl('HTTPS://EXAMPLE.COM')).toBe('HTTPS://EXAMPLE.COM');
  });

  it('chặn scheme không nằm trong danh sách cho phép', () => {
    expect(getSafeLinkUrl('javascript:alert(1)')).toBe('');
    expect(getSafeLinkUrl('JaVaScRiPt:alert(1)')).toBe('');
    expect(getSafeLinkUrl('vbscript:msgbox(1)')).toBe('');
    expect(getSafeLinkUrl('data:text/html,<b>x</b>')).toBe('');
    expect(getSafeLinkUrl('file:///etc/passwd')).toBe('');
    expect(getSafeLinkUrl('blob:https://example.com/uuid')).toBe('');
  });

  it('không bị lách bằng ký tự điều khiển, tab hay xuống dòng chen trong scheme', () => {
    expect(getSafeLinkUrl('\u0001javascript:alert(1)')).toBe('');
    expect(getSafeLinkUrl('java\tscript:alert(1)')).toBe('');
    expect(getSafeLinkUrl('java\nscript:alert(1)')).toBe('');
    expect(getSafeLinkUrl(' \u0000 javascript:alert(1)')).toBe('');
  });

  it('URL tương đối, rỗng hoặc không phải chuỗi → không an toàn', () => {
    expect(getSafeLinkUrl('/app/settings')).toBe('');
    expect(getSafeLinkUrl('//evil.example/x')).toBe('');
    expect(getSafeLinkUrl('&#106;avascript:alert(1)')).toBe('');
    expect(getSafeLinkUrl('')).toBe('');
    expect(getSafeLinkUrl(null)).toBe('');
    expect(getSafeLinkUrl(undefined)).toBe('');
    expect(getSafeLinkUrl({ href: 'https://example.com' })).toBe('');
  });

  it('có baseUrl → nhận link nội bộ tương đối, vẫn chặn scheme nguy hiểm', () => {
    const base = 'https://founderai.biz/app/campaigns';
    expect(getSafeLinkUrl('/uploads/a.pdf', base)).toBe('/uploads/a.pdf');
    expect(getSafeLinkUrl('https://cdn.example.com/a.pdf', base)).toBe('https://cdn.example.com/a.pdf');
    expect(getSafeLinkUrl('javascript:alert(1)', base)).toBe('');
    expect(getSafeLinkUrl(' java\nscript:alert(1)', base)).toBe('');
    expect(getSafeLinkUrl('', base)).toBe('');
  });
});

describe('getSafeImageUrl', () => {
  it('nhận http/https và data:image/*', () => {
    expect(getSafeImageUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
    expect(getSafeImageUrl('http://cdn.example.com/a.png')).toBe('http://cdn.example.com/a.png');
    expect(getSafeImageUrl('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(getSafeImageUrl('data:image/svg+xml,%3Csvg%3E%3C/svg%3E')).toBe('data:image/svg+xml,%3Csvg%3E%3C/svg%3E');
  });

  it('chặn data: không phải ảnh, javascript:, mailto: và URL tương đối', () => {
    expect(getSafeImageUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe('');
    expect(getSafeImageUrl('javascript:alert(1)')).toBe('');
    expect(getSafeImageUrl('mailto:a@b.c')).toBe('');
    expect(getSafeImageUrl('/uploads/a.png')).toBe('');
    expect(getSafeImageUrl('')).toBe('');
  });
});
