import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import useLandingCanvasDraft, { DRAFT_WRITE_DEBOUNCE_MS } from '../useLandingCanvasDraft.js';
import { buildDraftKey, readDraft } from '../../utils/landingCanvasDraft.js';

const SCOPE = { userId: 1, ownerId: 1 };
const KEY = buildDraftKey(SCOPE, null);
const form = (html) => ({ title: 't', htmlContent: html, slug: '', isPublished: false, domainType: 'system' });
const msgs = [{ id: 'a', role: 'user', content: 'hi', status: 'sent' }];

const setup = (props) =>
  renderHook((p) => useLandingCanvasDraft({ scope: SCOPE, editingId: null, interruptedText: 'gián đoạn', ...p }), {
    initialProps: props,
  });

describe('useLandingCanvasDraft', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounce: chưa ghi trước 800ms, ghi sau 800ms', () => {
    setup({ form: form('<p>1</p>'), messages: msgs, dirty: true });
    expect(readDraft(KEY)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(DRAFT_WRITE_DEBOUNCE_MS - 10);
    });
    expect(readDraft(KEY)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(readDraft(KEY).form.htmlContent).toBe('<p>1</p>');
  });

  it('pagehide flush NGAY (F5 nhanh hơn 800ms vẫn giữ), không cần unmount', () => {
    setup({ form: form('<p>2</p>'), messages: msgs, dirty: true });
    expect(readDraft(KEY)).toBeNull();
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(readDraft(KEY).form.htmlContent).toBe('<p>2</p>');
  });

  it('visibilitychange → hidden flush ngay; visible thì không', () => {
    setup({ form: form('<p>3</p>'), messages: msgs, dirty: true });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(readDraft(KEY)).toBeNull();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(readDraft(KEY).form.htmlContent).toBe('<p>3</p>');
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('sạch + có hội thoại → ghi form:null; sạch + không hội thoại → xoá nháp', () => {
    const { rerender } = setup({ form: form(''), messages: msgs, dirty: false });
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    const d = readDraft(KEY);
    expect(d.form).toBeNull();
    expect(d.messages).toHaveLength(1);
    rerender({ form: form(''), messages: [], dirty: false });
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(readDraft(KEY)).toBeNull();
  });

  it('tin streaming được ghi thành lỗi gián đoạn', () => {
    setup({ form: form('x'), messages: [{ id: 's', role: 'ai', status: 'streaming', content: '' }], dirty: true });
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    const m = readDraft(KEY).messages[0];
    expect(m.status).toBe('error');
    expect(m.content).toBe('gián đoạn');
  });

  it('discard xoá nháp và dừng ghi (pagehide/unmount sau đó không ghi lại)', () => {
    const { result, unmount } = setup({ form: form('<p>4</p>'), messages: msgs, dirty: true });
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(readDraft(KEY)).not.toBeNull();
    act(() => result.current.discard());
    expect(readDraft(KEY)).toBeNull();
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    unmount();
    expect(readDraft(KEY)).toBeNull();
  });

  it('ghi thất bại → writeFailed=true', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    const { result } = setup({ form: form('<p>5</p>'), messages: msgs, dirty: true });
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(result.current.writeFailed).toBe(true);
    spy.mockRestore();
  });

  it('commitSaved (trang mới) chuyển hội thoại sang khoá của id và dừng ghi khoá new', () => {
    const { result } = setup({ form: form('<p>6</p>'), messages: msgs, dirty: true });
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    act(() => result.current.commitSaved({ newId: 9, updatedAt: 'U' }));
    expect(readDraft(KEY)).toBeNull();
    const moved = readDraft(buildDraftKey(SCOPE, 9));
    expect(moved.form).toBeNull();
    expect(moved.baseUpdatedAt).toBe('U');
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(readDraft(KEY)).toBeNull();
  });
});
