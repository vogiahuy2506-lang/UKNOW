import { renderHook } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { useFormFont } from '../useFormFont';

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-4b mục 3.
 */
describe('useFormFont', () => {
  afterEach(() => {
    document.querySelectorAll('link[id^="form-google-font-"]').forEach((el) => el.remove());
  });

  it('font hợp lệ (Lora) -> chèn đúng 1 <link> Google Fonts, URL nạp đủ 400;500;600;700', () => {
    renderHook(() => useFormFont('Lora'));
    const links = document.querySelectorAll('link[id^="form-google-font-"]');
    expect(links).toHaveLength(1);
    expect(links[0].href).toContain('family=Lora:wght@400;500;600;700');
    expect(links[0].rel).toBe('stylesheet');
  });

  it('render lại cùng font -> KHÔNG chèn thêm <link> (id cố định chặn trùng)', () => {
    const { rerender } = renderHook(({ font }) => useFormFont(font), {
      initialProps: { font: 'Lora' },
    });
    rerender({ font: 'Lora' });
    rerender({ font: 'Lora' });
    expect(document.querySelectorAll('link[id^="form-google-font-"]')).toHaveLength(1);
  });

  it('fontFamily lạ ("Comic Sans MS", không thuộc whitelist) -> KHÔNG chèn <link> nào', () => {
    renderHook(() => useFormFont('Comic Sans MS'));
    expect(document.querySelectorAll('link[id^="form-google-font-"]')).toHaveLength(0);
  });

  it('fontFamily null/undefined -> không chèn gì, không throw', () => {
    expect(() => renderHook(() => useFormFont(null))).not.toThrow();
    expect(() => renderHook(() => useFormFont(undefined))).not.toThrow();
    expect(document.querySelectorAll('link[id^="form-google-font-"]')).toHaveLength(0);
  });

  it('đổi từ font A sang font B -> có cả 2 <link> (không gỡ link cũ)', () => {
    const { rerender } = renderHook(({ font }) => useFormFont(font), {
      initialProps: { font: 'Lora' },
    });
    rerender({ font: 'Quicksand' });
    const links = document.querySelectorAll('link[id^="form-google-font-"]');
    expect(links).toHaveLength(2);
  });

  it('font tên nhiều từ (Be Vietnam Pro, Playfair Display) -> URL dùng dấu + thay khoảng trắng', () => {
    renderHook(() => useFormFont('Be Vietnam Pro'));
    const link = document.getElementById('form-google-font-be-vietnam-pro');
    expect(link).toBeTruthy();
    expect(link.href).toContain('family=Be+Vietnam+Pro:wght@400;500;600;700');
  });
});
