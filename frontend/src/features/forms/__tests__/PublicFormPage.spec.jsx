import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import PublicFormPage from '../pages/PublicFormPage';
import { fetchPublicForm } from '../services/formPublicApi.service';

vi.mock('../services/formPublicApi.service', () => ({
  fetchPublicForm: vi.fn(),
  submitPublicForm: vi.fn(),
  fetchPublicSlots: vi.fn(),
}));

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-5.
 *
 * jsdom không cài ResizeObserver (Node 22 + jsdom 24) — stub tối thiểu chỉ để
 * `new ResizeObserver(...)` trong useFormEmbedResize không throw; test tự gọi postMessage
 * bằng cách chờ effect chạy (post() gọi đồng bộ lúc mount + 2 setTimeout), không cần
 * ResizeObserver thật sự bắn callback.
 */
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const baseForm = {
  id: 'form-1',
  title: 'Form PR-5',
  fields: [{ key: 'f_email', label: 'Email', type: 'email', required: true, role: 'email' }],
  settings: { consentEnabled: false, submitButtonText: 'Gửi', successMessage: 'Cảm ơn!', redirectUrl: '' },
};

function renderPage(path) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/f/:publicKey" element={<PublicFormPage />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>
  );
}

describe('PublicFormPage — chế độ nhúng (?embed=1)', () => {
  let originalResizeObserver;
  let originalParent;
  let originalScrollHeightDescriptor;

  beforeEach(() => {
    vi.clearAllMocks();
    originalResizeObserver = window.ResizeObserver;
    window.ResizeObserver = StubResizeObserver;
    originalParent = window.parent;

    // jsdom không layout thật -> scrollHeight luôn 0 (useFormEmbedResize bỏ qua post() khi
    // < 40px để tránh gửi chiều cao rỗng lúc chưa kịp layout). Giả lập một chiều cao hợp lý.
    originalScrollHeightDescriptor = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'scrollHeight');
    Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return 600;
      },
    });
  });

  afterEach(() => {
    window.ResizeObserver = originalResizeObserver;
    Object.defineProperty(window, 'parent', { value: originalParent, configurable: true });
    if (originalScrollHeightDescriptor) {
      Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', originalScrollHeightDescriptor);
    }
    vi.useRealTimers();
  });

  it('mở trực tiếp (không ?embed=1) -> wrapper dùng min-h-screen như cũ, KHÔNG gửi postMessage dù đang "trong iframe"', async () => {
    const fakeParent = { postMessage: vi.fn() };
    Object.defineProperty(window, 'parent', { value: fakeParent, configurable: true });

    fetchPublicForm.mockResolvedValue(baseForm);

    const { container } = renderPage('/f/pub_abc');

    await waitFor(() => expect(screen.getByText('Form PR-5')).toBeInTheDocument());

    const wrapper = container.firstChild;
    expect(wrapper.className).toMatch(/min-h-screen/);
    expect(fakeParent.postMessage).not.toHaveBeenCalled();
  });

  it('?embed=1 -> wrapper KHÔNG còn min-h-screen, và gửi postMessage {type: founderai-form-resize, key, height} lên window.parent', async () => {
    const fakeParent = { postMessage: vi.fn() };
    Object.defineProperty(window, 'parent', { value: fakeParent, configurable: true });

    fetchPublicForm.mockResolvedValue(baseForm);

    const { container } = renderPage('/f/pub_abc?embed=1');

    await waitFor(() => expect(screen.getByText('Form PR-5')).toBeInTheDocument());

    const wrapper = container.firstChild;
    expect(wrapper.className).not.toMatch(/min-h-screen/);

    await waitFor(() => expect(fakeParent.postMessage).toHaveBeenCalled());
    const [data, targetOrigin] = fakeParent.postMessage.mock.calls[0];
    expect(data.type).toBe('founderai-form-resize');
    expect(data.key).toBe('pub_abc');
    expect(typeof data.height).toBe('number');
    // targetOrigin '*' cố ý — postMessage này không mang dữ liệu nhạy cảm (chỉ số nguyên
    // chiều cao + key công khai đã có sẵn trong URL iframe); form-embed.js phía nhận tự lọc
    // theo event.origin nên không cần biết trước origin trang nhúng để giới hạn targetOrigin.
    expect(targetOrigin).toBe('*');
  });

  it('?embed=1 trạng thái 404 -> wrapper cũng KHÔNG còn min-h-screen (đo cả màn lỗi, không chỉ màn form)', async () => {
    const notFoundError = new Error('not found');
    notFoundError.response = { status: 404 };
    fetchPublicForm.mockRejectedValue(notFoundError);

    const { container } = renderPage('/f/pub_missing?embed=1');

    await waitFor(() => expect(screen.getByText(/Không tìm thấy biểu mẫu/i)).toBeInTheDocument());

    const wrapper = container.firstChild;
    expect(wrapper.className).not.toMatch(/min-h-screen/);
  });
});
