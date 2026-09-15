import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useSearchParams } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import PublicFormPage from '../pages/PublicFormPage';
import { fetchPublicForm, submitPublicForm } from '../services/formPublicApi.service';

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

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-4b phản biện điểm 2 — nền ngoài theo
 * `theme.backgroundColor` khi mở trực tiếp, KHÔNG tô khi nhúng (?embed=1).
 */
describe('PublicFormPage — nền ngoài theo theme.backgroundColor', () => {
  let originalResizeObserver;

  beforeEach(() => {
    vi.clearAllMocks();
    originalResizeObserver = window.ResizeObserver;
    window.ResizeObserver = StubResizeObserver;
  });

  afterEach(() => {
    window.ResizeObserver = originalResizeObserver;
  });

  const themedForm = {
    ...baseForm,
    theme: { backgroundColor: '#fdf2e9' },
  };

  it('mở trực tiếp (không nhúng) + theme.backgroundColor -> wrapper có style backgroundColor', async () => {
    fetchPublicForm.mockResolvedValue(themedForm);

    const { container } = renderPage('/f/pub_theme');

    await waitFor(() => expect(screen.getByText('Form PR-5')).toBeInTheDocument());

    const wrapper = container.firstChild;
    expect(wrapper.style.backgroundColor).toBe('rgb(253, 242, 233)');
  });

  it('?embed=1 + theme.backgroundColor -> wrapper KHÔNG có style backgroundColor (không tô đè nền landing)', async () => {
    fetchPublicForm.mockResolvedValue(themedForm);

    const { container } = renderPage('/f/pub_theme?embed=1');

    await waitFor(() => expect(screen.getByText('Form PR-5')).toBeInTheDocument());

    const wrapper = container.firstChild;
    expect(wrapper.style.backgroundColor).toBe('');
  });

  it('không có theme.backgroundColor -> wrapper không có style backgroundColor', async () => {
    fetchPublicForm.mockResolvedValue(baseForm);

    const { container } = renderPage('/f/pub_notheme');

    await waitFor(() => expect(screen.getByText('Form PR-5')).toBeInTheDocument());

    const wrapper = container.firstChild;
    expect(wrapper.style.backgroundColor).toBe('');
  });
});

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-7a mục 6 — PublicFormPage đọc `lp`/`utm_*` từ
 * searchParams của CHÍNH trang (đúng cho cả nhúng lẫn link trực tiếp), thêm vào payload trước
 * `submitPublicForm`.
 */
describe('PublicFormPage — nguồn landing + UTM vào payload (PR-7a)', () => {
  let originalResizeObserver;

  beforeEach(() => {
    vi.clearAllMocks();
    originalResizeObserver = window.ResizeObserver;
    window.ResizeObserver = StubResizeObserver;
  });

  afterEach(() => {
    window.ResizeObserver = originalResizeObserver;
  });

  it('?embed=1&lp=khoa-hoc&utm_source=fb -> payload gửi đi có landingPageSlug + utmSource', async () => {
    fetchPublicForm.mockResolvedValue(baseForm);
    submitPublicForm.mockResolvedValue({ id: 'sub-1' });

    renderPage('/f/pub_abc?embed=1&lp=khoa-hoc&utm_source=fb');

    await waitFor(() => expect(screen.getByText('Form PR-5')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(submitPublicForm).toHaveBeenCalledTimes(1));
    const [, payload] = submitPublicForm.mock.calls[0];
    expect(payload.landingPageSlug).toBe('khoa-hoc');
    expect(payload.utmSource).toBe('fb');
    expect(payload).not.toHaveProperty('utmMedium');
  });

  it('mở link trực tiếp không nhúng /f/KEY?utm_source=zalo -> payload vẫn có utmSource (không chỉ khi nhúng)', async () => {
    fetchPublicForm.mockResolvedValue(baseForm);
    submitPublicForm.mockResolvedValue({ id: 'sub-2' });

    renderPage('/f/pub_abc?utm_source=zalo');

    await waitFor(() => expect(screen.getByText('Form PR-5')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(submitPublicForm).toHaveBeenCalledTimes(1));
    const [, payload] = submitPublicForm.mock.calls[0];
    expect(payload.utmSource).toBe('zalo');
  });

  it('không có lp/utm_* trên URL -> payload KHÔNG có các khoá đó', async () => {
    fetchPublicForm.mockResolvedValue(baseForm);
    submitPublicForm.mockResolvedValue({ id: 'sub-3' });

    renderPage('/f/pub_abc');

    await waitFor(() => expect(screen.getByText('Form PR-5')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(submitPublicForm).toHaveBeenCalledTimes(1));
    const [, payload] = submitPublicForm.mock.calls[0];
    expect(payload).not.toHaveProperty('landingPageSlug');
    expect(payload).not.toHaveProperty('utmSource');
    expect(payload).not.toHaveProperty('utmMedium');
    expect(payload).not.toHaveProperty('utmCampaign');
    expect(payload).not.toHaveProperty('utmContent');
    expect(payload).not.toHaveProperty('utmTerm');
  });

  it('đủ cả 5 UTM trên URL -> payload có đủ 5 khoá camelCase tương ứng', async () => {
    fetchPublicForm.mockResolvedValue(baseForm);
    submitPublicForm.mockResolvedValue({ id: 'sub-4' });

    renderPage(
      '/f/pub_abc?utm_source=fb&utm_medium=cpc&utm_campaign=t9&utm_content=banner1&utm_term=khoa-hoc-ai'
    );

    await waitFor(() => expect(screen.getByText('Form PR-5')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(submitPublicForm).toHaveBeenCalledTimes(1));
    const [, payload] = submitPublicForm.mock.calls[0];
    expect(payload.utmSource).toBe('fb');
    expect(payload.utmMedium).toBe('cpc');
    expect(payload.utmCampaign).toBe('t9');
    expect(payload.utmContent).toBe('banner1');
    expect(payload.utmTerm).toBe('khoa-hoc-ai');
  });
});

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-3b.
 *
 * Route đích /f/:publicKey/s/:accessToken được thay bằng 1 component đánh dấu đơn giản
 * (thay vì FormSubmissionStatusPage thật) để test này chỉ đo hành vi điều hướng của
 * PublicFormPage — không phụ thuộc/đo lẫn logic trang trạng thái (đã có spec riêng).
 */
function StatusPageMarker() {
  const [params] = useSearchParams();
  return <div data-testid="status-page-marker">status-page:{params.get('embed') || ''}</div>;
}

function renderPagePr3b(path) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/f/:publicKey" element={<PublicFormPage />} />
          <Route path="/f/:publicKey/s/:accessToken" element={<StatusPageMarker />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>
  );
}

describe('PublicFormPage — PR-3b thanh toán giữ chỗ', () => {
  let originalResizeObserver;

  beforeEach(() => {
    vi.clearAllMocks();
    originalResizeObserver = window.ResizeObserver;
    window.ResizeObserver = StubResizeObserver;
  });

  afterEach(() => {
    window.ResizeObserver = originalResizeObserver;
  });

  const paymentForm = {
    ...baseForm,
    payment: { enabled: true, amount: 150000 },
  };

  it('form có payment.enabled -> hiện dòng thông báo "Cần chuyển khoản {amount} để giữ chỗ" trước khi gửi', async () => {
    fetchPublicForm.mockResolvedValue(paymentForm);

    renderPagePr3b('/f/pub_pay');

    await waitFor(() => expect(screen.getByText('Form PR-5')).toBeInTheDocument());

    expect(screen.getByText((text) => text.includes('150.000') && text.includes('đ'))).toBeInTheDocument();
  });

  it('form KHÔNG bật payment -> không hiện dòng thông báo giữ chỗ', async () => {
    fetchPublicForm.mockResolvedValue(baseForm);

    renderPagePr3b('/f/pub_nopay');

    await waitFor(() => expect(screen.getByText('Form PR-5')).toBeInTheDocument());

    expect(screen.queryByText(/Cần chuyển khoản/i)).not.toBeInTheDocument();
  });

  it('nộp xong trả về payment+accessToken -> chuyển tới /f/:publicKey/s/:accessToken (không ?embed=1 khi mở trực tiếp)', async () => {
    fetchPublicForm.mockResolvedValue(paymentForm);
    submitPublicForm.mockResolvedValue({
      id: 'sub-1',
      payment: { code: 'ABC123', amount: 150000 },
      accessToken: 'tok-xyz',
    });

    renderPagePr3b('/f/pub_pay');

    await waitFor(() => expect(screen.getByText('Form PR-5')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(screen.getByTestId('status-page-marker')).toBeInTheDocument());
    expect(screen.getByTestId('status-page-marker').textContent).toBe('status-page:');
  });

  it('nộp xong trả về payment+accessToken trong chế độ nhúng (?embed=1) -> URL đích giữ ?embed=1', async () => {
    fetchPublicForm.mockResolvedValue(paymentForm);
    submitPublicForm.mockResolvedValue({
      id: 'sub-1',
      payment: { code: 'ABC123', amount: 150000 },
      accessToken: 'tok-xyz',
    });

    renderPagePr3b('/f/pub_pay?embed=1');

    await waitFor(() => expect(screen.getByText('Form PR-5')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(screen.getByTestId('status-page-marker')).toBeInTheDocument());
    expect(screen.getByTestId('status-page-marker').textContent).toBe('status-page:1');
  });

  it('nộp xong KHÔNG có payment trong response -> giữ màn thành công cũ của FormRenderer, không điều hướng', async () => {
    fetchPublicForm.mockResolvedValue(baseForm);
    submitPublicForm.mockResolvedValue({ id: 'sub-2' });

    renderPagePr3b('/f/pub_nopay');

    await waitFor(() => expect(screen.getByText('Form PR-5')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(screen.getByText('Cảm ơn!')).toBeInTheDocument());
    expect(screen.queryByTestId('status-page-marker')).not.toBeInTheDocument();
  });

  it('nộp bài lỗi 429 với code FORM_TOO_MANY_PENDING_HOLDS -> hiện thông báo riêng, không phải thông báo 429 chung', async () => {
    fetchPublicForm.mockResolvedValue(paymentForm);
    const err = new Error('too many');
    err.response = { status: 429, data: { code: 'FORM_TOO_MANY_PENDING_HOLDS' } };
    submitPublicForm.mockRejectedValue(err);

    renderPagePr3b('/f/pub_pay');

    await waitFor(() => expect(screen.getByText('Form PR-5')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() =>
      expect(
        screen.getByText(/quá nhiều lượt giữ chỗ chưa thanh toán/i)
      ).toBeInTheDocument()
    );
    expect(screen.queryByText(/Quá nhiều lần gửi form/i)).not.toBeInTheDocument();
  });

  it('nộp bài lỗi 429 KHÔNG kèm code đặc biệt -> hiện thông báo 429 chung như cũ', async () => {
    fetchPublicForm.mockResolvedValue(baseForm);
    const err = new Error('rate limited');
    err.response = { status: 429, data: {} };
    submitPublicForm.mockRejectedValue(err);

    renderPagePr3b('/f/pub_nopay');

    await waitFor(() => expect(screen.getByText('Form PR-5')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() =>
      expect(screen.getByText(/Quá nhiều lần gửi form/i)).toBeInTheDocument()
    );
  });
});

/**
 * Review PR-3b 15/09 — ca đầu-cuối trên PublicFormPage thật (không giả onSubmit): form thu tiền có
 * redirectUrl, nộp xong phải ở lại trang trạng thái. Thiếu `return { navigated: true }` ở
 * handleSubmit thì FormRenderer gán window.location.href sang trang cảm ơn, khách không thấy QR —
 * ca ở FormRenderer.spec giả onSubmit nên không bắt được việc PublicFormPage quên trả tín hiệu.
 */
describe('PublicFormPage — PR-3b form thu tiền có redirectUrl', () => {
  let originalResizeObserver;
  let originalLocation;

  beforeEach(() => {
    vi.clearAllMocks();
    originalResizeObserver = window.ResizeObserver;
    window.ResizeObserver = StubResizeObserver;
    originalLocation = window.location;
    delete window.location;
    window.location = {
      href: 'http://localhost:5174/f/pub_pay',
      origin: 'http://localhost:5174',
      pathname: '/f/pub_pay',
      search: '',
      hash: '',
    };
  });

  afterEach(() => {
    window.location = originalLocation;
    window.ResizeObserver = originalResizeObserver;
  });

  const withRedirect = (extra) => ({
    ...baseForm,
    settings: { ...baseForm.settings, redirectUrl: 'https://example.com/cam-on' },
    ...extra,
  });

  it('form thu tiền: sang trang trạng thái, KHÔNG chuyển tới redirectUrl', async () => {
    fetchPublicForm.mockResolvedValue(withRedirect({ payment: { enabled: true, amount: 150000 } }));
    submitPublicForm.mockResolvedValue({ id: 'sub-1', accessToken: 'tok-xyz', payment: { code: 'ABC123', amount: 150000 } });

    renderPagePr3b('/f/pub_pay');
    await waitFor(() => expect(screen.getByText('Form PR-5')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(screen.getByTestId('status-page-marker')).toBeInTheDocument());
    expect(window.location.href).toBe('http://localhost:5174/f/pub_pay');
  });

  it('đối chứng — form KHÔNG thu tiền: vẫn chuyển tới redirectUrl như cũ', async () => {
    fetchPublicForm.mockResolvedValue(withRedirect());
    submitPublicForm.mockResolvedValue({ id: 'sub-2', accessToken: 'tok-abc', payment: null });

    renderPagePr3b('/f/pub_pay');
    await waitFor(() => expect(screen.getByText('Form PR-5')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(window.location.href).toBe('https://example.com/cam-on'));
  });
});
