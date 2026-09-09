import { describe, expect, it } from 'vitest';
import vi from '../vi.js';
import en from '../en.js';

/**
 * Modal "Bổ sung số điện thoại" là lời nhắc đóng được (ad809325, 04/09/2026), KHÔNG phải cổng
 * chặn. Ngày 07/09 một commit "fix lint" (1a992e76) xoá khoá `later` vì bị trùng sau merge và
 * khôi phục câu mô tả cũ → nút "Để sau" hiện khoá thô, không đóng được, chặn cả app (sếp gặp
 * sáng 09/09). Test này canh đúng hai thứ đó ở cả hai ngôn ngữ.
 */
describe('i18n phoneRequired — lời nhắc đóng được, không phải cổng chặn', () => {
  it.each([
    ['vi', vi],
    ['en', en],
  ])('%s có khoá later và mô tả không nói "để tiếp tục sử dụng hệ thống"', (_name, dict) => {
    expect(typeof dict.phoneRequired?.later).toBe('string');
    expect(dict.phoneRequired.later.trim().length).toBeGreaterThan(0);
    expect(dict.phoneRequired.description).not.toMatch(/tiếp tục sử dụng hệ thống|to continue using the system/i);
  });
});
