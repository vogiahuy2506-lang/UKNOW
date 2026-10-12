import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import LandingCanvasPage from '../LandingCanvasPage.jsx';
import { I18nProvider } from '../../../../i18n';
import viDict from '../../../../i18n/vi.js';
import { useAuthStore } from '../../../../stores/authStore';
import { buildDraftKey, readDraft } from '../../utils/landingCanvasDraft.js';
import {
  createLandingPageAdmin,
  editLandingHtmlWithAi,
  fetchLandingPageAdminById,
  generateLandingHtmlWithAi,
  updateLandingPageAdmin,
} from '../../../landing-pages/services/landingPagesAdminApi.service.js';

vi.mock('../../../landing-pages/services/landingPagesAdminApi.service.js', () => ({
  fetchLandingPageAdminById: vi.fn(),
  createLandingPageAdmin: vi.fn(),
  updateLandingPageAdmin: vi.fn(),
  generateLandingHtmlWithAi: vi.fn(),
  editLandingHtmlWithAi: vi.fn(),
}));

vi.mock('react-hot-toast', () => {
  const toast = vi.fn();
  toast.success = vi.fn();
  toast.error = vi.fn();
  toast.custom = vi.fn();
  toast.dismiss = vi.fn();
  return { default: toast };
});

vi.mock('../../../ai/utils/layoutAudit.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runLayoutAudit: vi.fn().mockResolvedValue({ findings: [], timedOut: false, errors: [] }),
}));
vi.mock('../../components/SettingsModal.jsx', () => ({ default: () => null }));
vi.mock('../../components/ImportHtmlModal.jsx', () => ({ default: () => null }));
vi.mock('../../../landing-pages/components/TemplateGallery.jsx', () => ({ default: () => null }));
vi.mock('../../../landing-pages/components/SaveTemplateModal.jsx', () => ({ default: () => null }));
vi.mock('../../../landing-pages/components/VisualBlockEditor.jsx', () => ({ default: () => null }));
vi.mock('../../../landing-pages/components/LandingVersionModal.jsx', () => ({ default: () => null }));
vi.mock('../../../forms/services/formAdminApi.service.js', () => ({ fetchForms: vi.fn().mockResolvedValue([]) }));

const t = (key) => {
  let current = viDict;
  for (const part of key.split('.')) current = current?.[part];
  return current !== undefined ? current : key;
};

// Layout giả: giữ NGUYÊN hook hội thoại thật + danh sách biểu mẫu thật (LandingFormsList) để kiểm nháp biểu mẫu AI đi qua cả hai.
vi.mock('../../components/LandingCanvasLayout.jsx', async () => {
  const React = await import('react');
  const { default: useCanvasConversation } = await import('../../hooks/useCanvasConversation.js');
  const { default: LandingFormsList } = await import('../../components/LandingFormsList.jsx');
  function FakeLayout({ form, setForm, editingId, onSave, initialMessages, onMessagesChange, banner }) {
    const conv = useCanvasConversation({
      form,
      setForm,
      hasExistingHtml: Boolean(String(form.htmlContent || '').trim()),
      openTab: () => {},
      editingId,
      initialMessages,
    });
    React.useEffect(() => {
      onMessagesChange?.(conv.messages);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conv.messages]);
    return (
      <div>
        {banner}
        <div data-testid="html">{form.htmlContent}</div>
        <div data-testid="drafts">{JSON.stringify(form.formDrafts ?? null)}</div>
        <button onClick={() => conv.handleSend({ prompt: 'viet landing phong kham nha khoa cho khach dat lich kham va dat coc' })}>send</button>
        <button onClick={() => conv.handleSend({ prompt: 'thêm biểu mẫu khảo sát hài lòng lên trên cùng của trang giúp tôi nhé, cảm ơn' })}>send-more</button>
        <button onClick={onSave}>save</button>
        <LandingFormsList form={form} setForm={setForm} t={t} editingId={editingId} />
      </div>
    );
  }
  return { default: FakeLayout };
});

const SCOPE = { userId: 1, ownerId: 1 };
const NEW_KEY = buildDraftKey(SCOPE, null);

function renderApp() {
  return render(
    <I18nProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/app/settings/landing-pages/new" element={<LandingCanvasPage />} />
          <Route path="/app/settings/landing-pages/:id/edit" element={<LandingCanvasPage />} />
          <Route path="/app/settings/landing-pages" element={<div data-testid="list">LIST</div>} />
        </Routes>
      </BrowserRouter>
    </I18nProvider>
  );
}

const f5 = () => {
  act(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
  cleanup();
};

const slot = (kind) => (kind === 'bare' ? '<div data-founderai-form-slot></div>' : `<div data-founderai-form-slot="${kind}"></div>`);
const pageWith = (...kinds) => `<body>${kinds.map((k) => `<section>${slot(k)}</section>`).join('')}</body>`;
const draft = (slotIndex, kind, title, needsAttention = []) => ({
  slotIndex,
  kind,
  title,
  description: null,
  fields: [{ label: 'Họ và tên', type: 'short_text', required: true, role: 'name' }],
  settings: null,
  bookingConfig: null,
  needsAttention,
});
const BOOKING_DRAFT = draft(1, 'booking', 'Đặt lịch khám răng', ['booking']);
const PAYMENT_DRAFT = draft(2, 'payment', 'Giữ chỗ khoá niềng răng', ['payment']);

const draftsOnScreen = () => JSON.parse(screen.getByTestId('drafts').textContent);
const rowTitles = () => screen.queryAllByTestId('form-row').map((r) => r.querySelector('p').textContent);

const generateAndWait = async () => {
  fireEvent.click(await screen.findByText('send'));
  await waitFor(() => expect(screen.getByTestId('html').textContent).toContain('data-founderai-form-slot'));
};

describe('LandingCanvasPage — nháp biểu mẫu AI theo chỗ trống (PR-7a)', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/app/settings/landing-pages/new');
    useAuthStore.setState({ user: { id: 1 }, activeContext: { type: 'self' } });
    vi.clearAllMocks();
    generateLandingHtmlWithAi.mockResolvedValue({
      data: { html: pageWith('bare', 'booking', 'payment'), title: 'Nha khoa Sáng', formDrafts: [BOOKING_DRAFT, PAYMENT_DRAFT] },
    });
    createLandingPageAdmin.mockResolvedValue({ id: 77, updatedAt: 'U1' });
    updateLandingPageAdmin.mockResolvedValue({ id: 5, updatedAt: 'T2' });
    fetchLandingPageAdminById.mockResolvedValue({
      id: 5, slug: 'abc', title: 'Trang đã lưu', htmlContent: '<p>server</p>', isPublished: false, domainType: 'system',
      customDomainHostname: null, customDomainIsApex: false, leadFormConfig: null, linkedForms: [], updatedAt: 'T1',
    });
  });
  afterEach(() => cleanup());

  it('AI tạo trang: nháp vào state; danh sách "Biểu mẫu của trang" hiện TÊN NHÁP + nhãn "AI soạn sẵn câu hỏi" + nhắc khung giờ / tiền thay vì tên loại chung', async () => {
    renderApp();
    await generateAndWait();

    expect(draftsOnScreen().map((d) => [d.slotIndex, d.kind])).toEqual([[1, 'booking'], [2, 'payment']]);
    expect(rowTitles()).toEqual([
      'Biểu mẫu mới: Đăng ký tư vấn', // chỗ trống trần = consult, không có nháp → tên loại chung như PR-6
      'Biểu mẫu mới: Đặt lịch khám răng',
      'Biểu mẫu mới: Giữ chỗ khoá niềng răng',
    ]);
    const rows = screen.getAllByTestId('form-row');
    expect(within(rows[0]).queryByTestId('form-ai-draft-badge')).toBeNull();
    expect(within(rows[1]).getByTestId('form-ai-draft-badge')).toHaveTextContent('AI soạn sẵn câu hỏi');
    expect(within(rows[2]).getByTestId('form-ai-draft-badge')).toBeInTheDocument();
    expect(within(rows[1]).getByTestId('ai-draft-attention')).toHaveTextContent('Khung giờ đặt lịch đang là giờ mẫu');
    expect(within(rows[2]).getByTestId('ai-draft-attention')).toHaveTextContent('điền số tiền và tài khoản nhận tiền');
  });

  it('F5: nháp biểu mẫu sống qua F5 cùng nháp landing — tên nháp vẫn hiện trong danh sách', async () => {
    renderApp();
    await generateAndWait();
    f5();

    renderApp();
    await waitFor(() => expect(screen.getByTestId('html').textContent).toContain('data-founderai-form-slot="booking"'));
    expect(draftsOnScreen().map((d) => d.title)).toEqual(['Đặt lịch khám răng', 'Giữ chỗ khoá niềng răng']);
    expect(rowTitles()).toContain('Biểu mẫu mới: Đặt lịch khám răng');
    expect(screen.getByTestId('draft-restored-banner')).toBeTruthy();
  });

  it('nháp cũ không có khoá formDrafts (trước PR-7a) vẫn mở được, coi là không có nháp', async () => {
    localStorage.setItem(NEW_KEY, JSON.stringify({
      v: 1, savedAt: Date.now(), baseUpdatedAt: null, messages: [],
      form: { title: 'Cũ', slug: '', htmlContent: pageWith('booking'), isPublished: false, domainType: 'system', leadFormConfig: null, linkedFormsPending: [] },
    }));
    renderApp();
    await waitFor(() => expect(screen.getByTestId('html').textContent).toContain('booking'));
    expect(draftsOnScreen()).toEqual([]);
    expect(rowTitles()).toEqual(['Biểu mẫu mới: Đặt lịch hẹn']);
  });

  it('Lưu trang MỚI: body POST mang formDrafts (chỉ nháp của chỗ trống KHÔNG phải consult), nháp bị xoá khỏi nháp trình duyệt sau khi lưu', async () => {
    renderApp();
    await generateAndWait();
    fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(createLandingPageAdmin).toHaveBeenCalledTimes(1));

    const body = createLandingPageAdmin.mock.calls[0][0];
    expect(body.title).toBe('Nha khoa Sáng');
    expect(body.formDrafts.map((d) => [d.slotIndex, d.kind, d.title])).toEqual([
      [1, 'booking', 'Đặt lịch khám răng'],
      [2, 'payment', 'Giữ chỗ khoá niềng răng'],
    ]);
    await waitFor(() => expect(window.location.pathname).toBe('/app/settings/landing-pages/77/edit'));
    expect(localStorage.getItem(NEW_KEY)).toBeNull();
    // Sau khi lưu, nháp biểu mẫu AI đã dùng xong: dù nháp trình duyệt của trang vừa tạo có bị ghi thêm form hay không, KHÔNG còn nháp biểu mẫu nào.
    const moved = readDraft(buildDraftKey(SCOPE, 77));
    expect(moved.form?.formDrafts ?? []).toEqual([]);
  });

  it('Lưu lỗi (server từ chối) → nháp biểu mẫu VẪN giữ, lần Lưu thử lại vẫn gửi đủ', async () => {
    createLandingPageAdmin.mockRejectedValueOnce({ response: { data: { message: 'Slug trùng' } } });
    renderApp();
    await generateAndWait();
    fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(createLandingPageAdmin).toHaveBeenCalledTimes(1));
    expect(draftsOnScreen()).toHaveLength(2);

    fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(createLandingPageAdmin).toHaveBeenCalledTimes(2));
    expect(createLandingPageAdmin.mock.calls[1][0].formDrafts).toHaveLength(2);
  });

  it('người dùng BỎ biểu mẫu đặt lịch khỏi danh sách → nháp của nó mất, nháp thu tiền dịch chỉ số 2→1; body lưu chỉ còn nháp thu tiền ở chỉ số 1', async () => {
    renderApp();
    await generateAndWait();
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ khỏi trang: Biểu mẫu mới: Đặt lịch khám răng' }));

    await waitFor(() => expect(draftsOnScreen().map((d) => [d.slotIndex, d.kind])).toEqual([[1, 'payment']]));
    expect(rowTitles()).toEqual(['Biểu mẫu mới: Đăng ký tư vấn', 'Biểu mẫu mới: Giữ chỗ khoá niềng răng']);

    fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(createLandingPageAdmin).toHaveBeenCalledTimes(1));
    expect(createLandingPageAdmin.mock.calls[0][0].formDrafts.map((d) => [d.slotIndex, d.kind])).toEqual([[1, 'payment']]);
  });

  it('AI sửa thêm form khảo sát ĐỨNG ĐẦU trang: nháp cũ dịch chỉ số, nháp khảo sát mới ở chỉ số 0; body lưu đủ 3 nháp đúng chỗ', async () => {
    renderApp();
    await generateAndWait();
    editLandingHtmlWithAi.mockResolvedValue({
      data: { html: pageWith('survey', 'bare', 'booking', 'payment'), formDrafts: [draft(0, 'survey', 'Khảo sát hài lòng')] },
    });
    fireEvent.click(screen.getByText('send-more'));
    await waitFor(() => expect(draftsOnScreen()).toHaveLength(3));

    expect(draftsOnScreen().map((d) => [d.slotIndex, d.kind, d.title])).toEqual([
      [0, 'survey', 'Khảo sát hài lòng'],
      [2, 'booking', 'Đặt lịch khám răng'],
      [3, 'payment', 'Giữ chỗ khoá niềng răng'],
    ]);
    fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(createLandingPageAdmin).toHaveBeenCalledTimes(1));
    expect(createLandingPageAdmin.mock.calls[0][0].formDrafts.map((d) => [d.slotIndex, d.kind])).toEqual([[0, 'survey'], [2, 'booking'], [3, 'payment']]);
  });

  it('server KHÔNG trả formDrafts (cờ tắt / chỉ consult): body lưu y như trước — không có khoá formDrafts', async () => {
    generateLandingHtmlWithAi.mockResolvedValue({ data: { html: pageWith('bare'), title: 'Trang thường' } });
    renderApp();
    await generateAndWait();
    expect(draftsOnScreen()).toEqual([]);
    fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(createLandingPageAdmin).toHaveBeenCalledTimes(1));
    expect(createLandingPageAdmin.mock.calls[0][0]).not.toHaveProperty('formDrafts');
  });

  it('Lưu trang đang sửa (PUT) cũng mang formDrafts', async () => {
    window.history.replaceState(null, '', '/app/settings/landing-pages/5/edit');
    // trang sửa có sẵn HTML → "send" gọi EDIT (không phải generate)
    editLandingHtmlWithAi.mockResolvedValue({ data: { html: pageWith('payment'), formDrafts: [draft(0, 'payment', 'Thu cọc buổi học thử')] } });
    renderApp();
    fireEvent.click(await screen.findByText('send'));
    await waitFor(() => expect(draftsOnScreen()).toHaveLength(1));
    expect(generateLandingHtmlWithAi).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(updateLandingPageAdmin).toHaveBeenCalledTimes(1));
    const [id, body] = updateLandingPageAdmin.mock.calls[0];
    expect(id).toBe(5);
    expect(body.formDrafts.map((d) => [d.slotIndex, d.kind, d.title])).toEqual([[0, 'payment', 'Thu cọc buổi học thử']]);
  });
});
