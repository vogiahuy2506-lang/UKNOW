import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../services/landingPagePublicApi.service.js', () => ({
  postLandingView: vi.fn(),
}));

vi.mock('../../utils/landingVisitorId.js', () => ({
  getOrCreateLandingVisitorId: vi.fn(() => 'VISITOR-123'),
}));

import { postLandingView } from '../../services/landingPagePublicApi.service.js';
import { getOrCreateLandingVisitorId } from '../../utils/landingVisitorId.js';
import { useRecordLandingView } from '../useRecordLandingView';

beforeEach(() => {
  vi.clearAllMocks();
  postLandingView.mockResolvedValue();
});

describe('useRecordLandingView', () => {
  it('slug rỗng → KHÔNG POST', () => {
    renderHook(() => useRecordLandingView(''));
    expect(postLandingView).not.toHaveBeenCalled();
  });

  it('slug chỉ chứa whitespace → KHÔNG POST', () => {
    renderHook(() => useRecordLandingView('   '));
    expect(postLandingView).not.toHaveBeenCalled();
  });

  it('slug null/undefined → KHÔNG POST', () => {
    renderHook(() => useRecordLandingView(null));
    renderHook(() => useRecordLandingView(undefined));
    expect(postLandingView).not.toHaveBeenCalled();
  });

  it('slug hợp lệ → POST 1 lần với slug lowercase trim + visitorId', () => {
    renderHook(() => useRecordLandingView('  My-Slug  '));
    expect(postLandingView).toHaveBeenCalledTimes(1);
    expect(getOrCreateLandingVisitorId).toHaveBeenCalled();
    const payload = postLandingView.mock.calls[0][0];
    expect(payload.slug).toBe('my-slug');
    expect(payload.visitorId).toBe('VISITOR-123');
  });

  it('document.referrer có giá trị → gửi kèm referrer', () => {
    const ref = 'https://google.com';
    const originalDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'referrer');
    Object.defineProperty(document, 'referrer', { value: ref, configurable: true });
    renderHook(() => useRecordLandingView('promo'));
    expect(postLandingView.mock.calls[0][0].referrer).toBe(ref);
    if (originalDescriptor) {
      Object.defineProperty(Document.prototype, 'referrer', originalDescriptor);
    }
  });

  it('document.referrer rỗng → KHÔNG gắn referrer vào payload', () => {
    Object.defineProperty(document, 'referrer', { value: '', configurable: true });
    renderHook(() => useRecordLandingView('promo'));
    const payload = postLandingView.mock.calls[0][0];
    expect(payload.referrer).toBeUndefined();
  });

  it('postLandingView reject → swallow error, không crash', async () => {
    postLandingView.mockRejectedValueOnce(new Error('Network'));
    expect(() => renderHook(() => useRecordLandingView('x'))).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });

  it('chỉ POST 1 lần dù re-render với slug giống nhau (sent ref guard)', () => {
    const { rerender } = renderHook(({ slug }) => useRecordLandingView(slug), {
      initialProps: { slug: 'page-a' },
    });
    rerender({ slug: 'page-a' });
    rerender({ slug: 'page-a' });
    expect(postLandingView).toHaveBeenCalledTimes(1);
  });
});
