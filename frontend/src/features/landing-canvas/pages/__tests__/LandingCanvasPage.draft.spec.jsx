import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import LandingCanvasPage from '../LandingCanvasPage.jsx';
import { I18nProvider } from '../../../../i18n';
import { useAuthStore } from '../../../../stores/authStore';
import { buildDraftKey, readDraft, writeDraft } from '../../utils/landingCanvasDraft.js';
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

// Bỏ các modal nặng của Editor (không liên quan nháp).
// B-9: sau lượt AI canvas chạy bộ đo hiển thị (iframe thật) — jsdom không có layout và iframe đòi tải Tailwind CDN; mock để spec không rò mạng.
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

// Layout giả: giữ NGUYÊN hook hội thoại thật + banner + onMessagesChange; bỏ Monaco/iframe/topbar.
vi.mock('../../components/LandingCanvasLayout.jsx', async () => {
  const React = await import('react');
  const { default: useCanvasConversation } = await import('../../hooks/useCanvasConversation.js');
  function FakeLayout({ form, setForm, editingId, onClose, onSave, initialMessages, onMessagesChange, banner }) {
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
        <div data-testid="title">{form.title}</div>
        <ul data-testid="msgs">
          {conv.messages.map((m) => (
            <li key={m.id} data-status={m.status} data-undo={m.previousHtml != null ? '1' : '0'}>
              {m.content}
            </li>
          ))}
        </ul>
        <button onClick={() => conv.handleSend({ prompt: 'viet landing ban khoa hoc ielts cho nguoi di lam' })}>send</button>
        <button onClick={onClose}>close</button>
        <button onClick={onSave}>save</button>
        <button onClick={() => setForm((p) => ({ ...p, title: 'Tên tay' }))}>type-title</button>
      </div>
    );
  }
  return { default: FakeLayout };
});

const SCOPE = { userId: 1, ownerId: 1 };
const NEW_KEY = buildDraftKey(SCOPE, null);

function Other() {
  const navigate = useNavigate();
  const loc = useLocation();
  return (
    <div>
      <span data-testid="other">{loc.pathname}</span>
      <button onClick={() => navigate('/app/settings/landing-pages/new')}>to-new</button>
    </div>
  );
}

function SideMenu() {
  const navigate = useNavigate();
  return <button onClick={() => navigate('/somewhere')}>menu-navigate</button>;
}

function renderApp() {
  return render(
    <I18nProvider>
      <BrowserRouter>
        <SideMenu />
        <Routes>
          <Route path="/app/settings/landing-pages/new" element={<LandingCanvasPage />} />
          <Route path="/app/settings/landing-pages/:id/edit" element={<LandingCanvasPage />} />
          <Route path="/app/settings/landing-pages" element={<div data-testid="list">LIST</div>} />
          <Route path="*" element={<Other />} />
        </Routes>
      </BrowserRouter>
    </I18nProvider>
  );
}

const f5 = () => {
  // F5: hộp thoại đóng (pagehide flush) rồi mount lại với cùng localStorage + history.state.
  act(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
  cleanup();
};

const serverPage = (over = {}) => ({
  id: 5,
  slug: 'abc',
  title: 'Trang đã lưu',
  htmlContent: '<p>server</p>',
  isPublished: false,
  domainType: 'system',
  customDomainHostname: null,
  customDomainIsApex: false,
  leadFormConfig: null,
  linkedFormId: null,
  updatedAt: 'T1',
  ...over,
});

const appliedMsg = (over = {}) => ({
  id: 'm1',
  role: 'ai',
  status: 'applied',
  content: 'đã sửa',
  previousHtml: '<p>truoc</p>',
  suggestedHtml: '<p>draft</p>',
  ...over,
});

const sendAndWait = async () => {
  fireEvent.click(await screen.findByText('send'));
  await waitFor(() =>
    expect(screen.getByTestId('msgs').querySelector('[data-status="applied"]')).not.toBeNull()
  );
};

describe('LandingCanvasPage — nháp F5 + modal rời trang', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/app/settings/landing-pages/new');
    useAuthStore.setState({ user: { id: 1 }, activeContext: { type: 'self' } });
    vi.clearAllMocks();
    generateLandingHtmlWithAi.mockResolvedValue({ html: '<p>ai</p>', title: 'Khoá IELTS', summary: 'xong' });
    editLandingHtmlWithAi.mockResolvedValue({ html: '<p>ai</p>', summary: 'đã sửa' });
    fetchLandingPageAdminById.mockResolvedValue(serverPage());
  });
  afterEach(() => cleanup());

  it('F5 sau khi AI tạo trang: giữ HTML + hội thoại, hiện banner; tên điền từ result.title', async () => {
    renderApp();
    await sendAndWait();
    expect(screen.getByTestId('title').textContent).toBe('Khoá IELTS');
    f5();

    renderApp();
    await waitFor(() => expect(screen.getByTestId('html').textContent).toBe('<p>ai</p>'));
    expect(screen.getByTestId('title').textContent).toBe('Khoá IELTS');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByTestId('draft-restored-banner')).toBeTruthy();
    // Hoàn tác tin cuối còn dùng được
    expect(screen.getByTestId('msgs').querySelector('[data-status="applied"]').getAttribute('data-undo')).toBe('1');
  });

  it('F5 lúc AI đang trả lời: tin AI thành lỗi "Bị gián đoạn", tin trước còn', async () => {
    generateLandingHtmlWithAi.mockReturnValue(new Promise(() => {}));
    renderApp();
    fireEvent.click(await screen.findByText('send'));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    f5();

    renderApp();
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    const items = screen.getAllByRole('listitem');
    expect(items[1].getAttribute('data-status')).toBe('error');
    expect(items[1].textContent).toContain('Bị gián đoạn');
  });

  it('aiDraft chỉ dùng MỘT lần: state bị replace; F5 sau khi sửa tiếp không áp lại aiDraft', async () => {
    window.history.replaceState(
      { usr: { aiDraft: { html: '<div>AI-DRAFT</div>', title: 'Từ trợ lý' } }, key: 'k1', idx: 0 },
      '',
      '/app/settings/landing-pages/new'
    );
    renderApp();
    await waitFor(() => expect(screen.getByTestId('html').textContent).toContain('AI-DRAFT'));
    // history.state đã bị xoá aiDraft
    await waitFor(() => expect(window.history.state?.usr?.aiDraft).toBeUndefined());

    await sendAndWait(); // sửa tiếp → '<p>ai</p>'
    expect(screen.getByTestId('html').textContent).toBe('<p>ai</p>');
    f5();

    renderApp();
    await waitFor(() => expect(screen.getByTestId('html').textContent).toBe('<p>ai</p>'));
    expect(screen.getByTestId('html').textContent).not.toContain('AI-DRAFT');
  });

  it('trang sửa: baseUpdatedAt khớp → áp nháp form + hội thoại (Hoàn tác còn)', async () => {
    window.history.replaceState(null, '', '/app/settings/landing-pages/5/edit');
    writeDraft(buildDraftKey(SCOPE, 5), {
      baseUpdatedAt: 'T1',
      form: { title: 'Nháp', htmlContent: '<p>draft</p>', slug: 'abc', isPublished: false, domainType: 'system', leadFormConfig: null },
      messages: [appliedMsg()],
    });
    renderApp();
    await waitFor(() => expect(screen.getByTestId('html').textContent).toBe('<p>draft</p>'));
    expect(screen.getByTestId('draft-restored-banner')).toBeTruthy();
    expect(screen.getByTestId('msgs').querySelector('li').getAttribute('data-undo')).toBe('1');
  });

  it('trang sửa: baseUpdatedAt lệch → bỏ form nháp, tắt Hoàn tác, báo trang đã lưu nơi khác', async () => {
    window.history.replaceState(null, '', '/app/settings/landing-pages/5/edit');
    writeDraft(buildDraftKey(SCOPE, 5), {
      baseUpdatedAt: 'T0',
      form: { title: 'Nháp', htmlContent: '<p>draft</p>', slug: 'abc', isPublished: false, domainType: 'system', leadFormConfig: null },
      messages: [appliedMsg()],
    });
    renderApp();
    await waitFor(() => expect(screen.getByTestId('html').textContent).toBe('<p>server</p>'));
    expect(screen.queryByTestId('draft-restored-banner')).toBeNull();
    expect(screen.getByTestId('msgs').querySelector('li').getAttribute('data-undo')).toBe('0');
    expect(toast).toHaveBeenCalled();
  });

  it('"Bắt đầu trang mới" xoá nháp: form + hội thoại rỗng, F5 không hiện lại', async () => {
    renderApp();
    await sendAndWait();
    f5();
    renderApp();
    fireEvent.click(await screen.findByText('Bắt đầu trang mới'));
    await waitFor(() => expect(screen.getByTestId('html').textContent).toBe(''));
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(localStorage.getItem(NEW_KEY)).toBeNull();
    f5();
    renderApp();
    await waitFor(() => expect(screen.getByTestId('html')).toBeTruthy());
    expect(screen.getByTestId('html').textContent).toBe('');
    expect(screen.queryByTestId('draft-restored-banner')).toBeNull();
  });

  it('nháp của người khác (user khác) không được khôi phục', async () => {
    renderApp();
    await sendAndWait();
    f5();
    act(() => useAuthStore.setState({ user: { id: 2 }, activeContext: { type: 'self' } }));
    renderApp();
    await waitFor(() => expect(screen.getByTestId('html')).toBeTruthy());
    expect(screen.getByTestId('html').textContent).toBe('');
  });

  it('storage ném lỗi: trang vẫn chạy', async () => {
    const real = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (k, v) {
      if (String(k).startsWith('founderai:landingCanvasDraft:')) throw new Error('denied');
      return real.call(this, k, v);
    });
    try {
      renderApp();
      await sendAndWait();
      expect(screen.getByTestId('html').textContent).toBe('<p>ai</p>');
      act(() => {
        window.dispatchEvent(new Event('pagehide'));
      });
    } finally {
      spy.mockRestore();
    }
  });

  describe('modal rời trang', () => {
    it('bẩn + bấm Đóng → modal, URL chưa đổi; Ở lại → không điều hướng', async () => {
      renderApp();
      await sendAndWait();
      fireEvent.click(screen.getByText('close'));
      expect(await screen.findByText('Lưu landing page trước khi rời đi?')).toBeTruthy();
      expect(window.location.pathname).toBe('/app/settings/landing-pages/new');
      fireEvent.click(screen.getByText('Ở lại'));
      expect(screen.queryByText('Lưu landing page trước khi rời đi?')).toBeNull();
      expect(window.location.pathname).toBe('/app/settings/landing-pages/new');
    });

    it('menu trái dùng navigate() bằng code khi bẩn → modal, URL chưa đổi', async () => {
      renderApp();
      await sendAndWait();
      fireEvent.click(screen.getByText('menu-navigate'));
      expect(await screen.findByText('Lưu landing page trước khi rời đi?')).toBeTruthy();
      expect(window.location.pathname).toBe('/app/settings/landing-pages/new');
    });

    it('Không lưu → nháp xoá + điều hướng tới đích đã bấm; quay lại /new → rỗng, không banner', async () => {
      renderApp();
      await sendAndWait();
      fireEvent.click(screen.getByText('menu-navigate'));
      fireEvent.click(await screen.findByText('Không lưu'));
      await waitFor(() => expect(screen.getByTestId('other').textContent).toBe('/somewhere'));
      expect(localStorage.getItem(NEW_KEY)).toBeNull();
      fireEvent.click(screen.getByText('to-new'));
      await waitFor(() => expect(screen.getByTestId('html')).toBeTruthy());
      expect(screen.getByTestId('html').textContent).toBe('');
      expect(screen.queryByTestId('draft-restored-banner')).toBeNull();
    });

    it('Lưu và rời đi, tên trống → ô tên bắt buộc; lưu OK → tới ĐÍCH đã bấm (không phải /edit), hội thoại sang khoá trang mới', async () => {
      generateLandingHtmlWithAi.mockResolvedValue({ html: '<p>ai</p>', summary: 'xong' }); // không title
      createLandingPageAdmin.mockResolvedValue({ id: 77, updatedAt: 'U1' });
      renderApp();
      await sendAndWait();
      fireEvent.click(screen.getByText('menu-navigate'));
      await screen.findByText('Lưu landing page trước khi rời đi?');
      const input = screen.getByLabelText('Tên landing page');
      fireEvent.click(screen.getByText('Lưu và rời đi'));
      expect(await screen.findByText('Vui lòng nhập tên landing page.')).toBeTruthy();
      expect(createLandingPageAdmin).not.toHaveBeenCalled();
      fireEvent.change(input, { target: { value: 'Trang của tôi' } });
      fireEvent.click(screen.getByText('Lưu và rời đi'));
      await waitFor(() => expect(screen.getByTestId('other').textContent).toBe('/somewhere'));
      expect(createLandingPageAdmin).toHaveBeenCalledWith(expect.objectContaining({ title: 'Trang của tôi' }));
      expect(localStorage.getItem(NEW_KEY)).toBeNull();
      const moved = readDraft(buildDraftKey(SCOPE, 77));
      expect(moved.form).toBeNull();
      expect(moved.baseUpdatedAt).toBe('U1');
      expect(moved.messages.length).toBe(2);
    });

    it('Lưu và rời đi lỗi server → giữ modal, không điều hướng', async () => {
      createLandingPageAdmin.mockRejectedValue({ response: { data: { message: 'Slug trùng' } } });
      renderApp();
      await sendAndWait();
      fireEvent.click(screen.getByText('menu-navigate'));
      await screen.findByText('Lưu landing page trước khi rời đi?');
      fireEvent.click(screen.getByText('Lưu và rời đi'));
      expect(await screen.findByText('Slug trùng')).toBeTruthy();
      expect(window.location.pathname).toBe('/app/settings/landing-pages/new');
    });

    it('lưu bằng nút Lưu (trang mới) → KHÔNG modal, sang /:id/edit, hội thoại còn khi mở lại', async () => {
      createLandingPageAdmin.mockResolvedValue({ id: 77, updatedAt: 'U1' });
      fetchLandingPageAdminById.mockResolvedValue(serverPage({ id: 77, updatedAt: 'U1', htmlContent: '<p>ai</p>' }));
      renderApp();
      await sendAndWait();
      fireEvent.click(screen.getByText('save'));
      await waitFor(() => expect(window.location.pathname).toBe('/app/settings/landing-pages/77/edit'));
      expect(screen.queryByText('Lưu landing page trước khi rời đi?')).toBeNull();
      await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
      expect(screen.queryByTestId('draft-restored-banner')).toBeNull();
    });

    it('lưu trang đang sửa bằng nút Lưu → về danh sách, không modal', async () => {
      window.history.replaceState(null, '', '/app/settings/landing-pages/5/edit');
      updateLandingPageAdmin.mockResolvedValue({ id: 5, updatedAt: 'T2' });
      renderApp();
      await sendAndWait();
      fireEvent.click(screen.getByText('save'));
      await waitFor(() => expect(screen.getByTestId('list')).toBeTruthy());
      expect(screen.queryByText('Lưu landing page trước khi rời đi?')).toBeNull();
      const d = readDraft(buildDraftKey(SCOPE, 5));
      expect(d.form).toBeNull();
      expect(d.baseUpdatedAt).toBe('T2');
    });

    // PLAN_TEN_MIEN_RIENG PR-D: tên miền đổi qua API tên miền riêng (Cài đặt trang), không qua lần lưu nội dung. Form có thể
    // mang domainType CŨ (vừa kết nối / gỡ tên miền trong modal, hoặc ở tab khác) và backend đổi hàng domain theo nó:
    // gửi 'system' lên trang vừa kết nối tên miền riêng sẽ thay tên miền của khách bằng link miễn phí.
    it('lưu trang đã có: KHÔNG gửi domainType / customDomain* (kể cả khi form còn giữ giá trị cũ)', async () => {
      window.history.replaceState(null, '', '/app/settings/landing-pages/5/edit');
      fetchLandingPageAdminById.mockResolvedValue(
        serverPage({ domainType: 'system', customDomainHostname: 'abc.founderai.biz', customDomainIsApex: false })
      );
      updateLandingPageAdmin.mockResolvedValue({ id: 5, updatedAt: 'T2' });
      renderApp();
      fireEvent.click(await screen.findByText('save'));
      await waitFor(() => expect(updateLandingPageAdmin).toHaveBeenCalledTimes(1));

      const [id, body] = updateLandingPageAdmin.mock.calls[0];
      expect(id).toBe(5);
      expect(body).toEqual(expect.objectContaining({ slug: 'abc', title: 'Trang đã lưu', htmlContent: '<p>server</p>', isPublished: false }));
      expect(body).not.toHaveProperty('domainType');
      expect(body).not.toHaveProperty('customDomainHostname');
      expect(body).not.toHaveProperty('customDomainIsApex');
    });

    it('không bẩn → Đóng đi thẳng, không modal', async () => {
      renderApp();
      fireEvent.click(await screen.findByText('close'));
      await waitFor(() => expect(screen.getByTestId('list')).toBeTruthy());
    });
  });
});
