import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import LandingCanvasPage from '../LandingCanvasPage.jsx';
import { I18nProvider } from '../../../../i18n';
import { useAuthStore } from '../../../../stores/authStore';
import {
  fetchLandingPageAdminById,
  updateLandingPageAdmin,
} from '../../../landing-pages/services/landingPagesAdminApi.service.js';

/**
 * PR-F — lưu "Dùng biểu mẫu đã tạo" qua trình soạn thật (LandingCanvasPage → LandingCanvasEditor.saveLanding):
 * lựa chọn chờ lưu → body PUT có `linkedFormId` + HTML có đúng MỘT chỗ trống; không có lựa chọn → body/HTML như cũ.
 */
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

// Layout giả: lộ state form ra DOM + nút đặt lựa chọn / lưu.
vi.mock('../../components/LandingCanvasLayout.jsx', () => ({
  default: function FakeLayout({ form, setForm, onSave }) {
    return (
      <div>
        <div data-testid="html">{form.htmlContent}</div>
        <div data-testid="linked">
          {JSON.stringify({
            id: form.linkedFormId,
            title: form.linkedFormTitle,
            key: form.linkedFormPublicKey,
            source: form.linkedFormSource,
            choice: form.linkedFormChoice ?? null,
          })}
        </div>
        <button onClick={() => setForm((p) => ({ ...p, linkedFormChoice: { mode: 'linked', formId: 9, publicKey: 'XKEY', title: 'Biểu mẫu X' } }))}>
          choose-x
        </button>
        <button onClick={() => setForm((p) => ({ ...p, linkedFormChoice: { mode: 'basic' } }))}>choose-basic</button>
        <button onClick={onSave}>save</button>
      </div>
    );
  },
}));

const EMBED = (key) => `<section data-founderai-form-section>
  <div data-founderai-form="${key}"></div>
  <script src="https://app.example/form-embed.js" defer></script>
</section>`;

const serverPage = (over = {}) => ({
  id: 5,
  slug: 'abc',
  title: 'Trang đã lưu',
  htmlContent: `<html><body><h1>Trang</h1>${EMBED('AUTOKEY')}</body></html>`,
  isPublished: true,
  domainType: 'system',
  customDomainHostname: null,
  customDomainIsApex: false,
  leadFormConfig: null,
  linkedFormId: 7,
  linkedFormTitle: 'Form cơ bản tự sinh',
  linkedFormPublicKey: 'AUTOKEY',
  linkedFormSource: 'basic',
  updatedAt: 'T1',
  ...over,
});

function renderEditor() {
  window.history.replaceState(null, '', '/app/settings/landing-pages/5/edit');
  return render(
    <I18nProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/app/settings/landing-pages/:id/edit" element={<LandingCanvasPage />} />
          <Route path="*" element={<div data-testid="elsewhere" />} />
        </Routes>
      </BrowserRouter>
    </I18nProvider>
  );
}

const linkedState = () => JSON.parse(screen.getByTestId('linked').textContent);
const lastBody = () => updateLandingPageAdmin.mock.calls.at(-1)[1];
const slotCount = (html) => (String(html).match(/data-founderai-form-slot/g) || []).length;

describe('LandingCanvasPage — lưu biểu mẫu đã chọn', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: { id: 1 }, activeContext: { type: 'self' } });
    vi.clearAllMocks();
    fetchLandingPageAdminById.mockResolvedValue(serverPage());
  });
  afterEach(() => cleanup());

  it('đọc từ server: tên / khoá / nguồn của biểu mẫu đang gắn vào state, chưa có lựa chọn chờ lưu', async () => {
    renderEditor();
    await waitFor(() => expect(linkedState().id).toBe(7));
    expect(linkedState()).toEqual({ id: 7, title: 'Form cơ bản tự sinh', key: 'AUTOKEY', source: 'basic', choice: null });
  });

  it('chọn biểu mẫu X rồi Lưu → body có linkedFormId=9, khối nhúng cũ được đổi thành ĐÚNG MỘT chỗ trống (backend sẽ nhúng X vào đó)', async () => {
    updateLandingPageAdmin.mockResolvedValue({ id: 5, updatedAt: 'T2' });
    renderEditor();
    await waitFor(() => expect(linkedState().id).toBe(7));

    fireEvent.click(screen.getByText('choose-x'));
    fireEvent.click(screen.getByText('save'));

    await waitFor(() => expect(updateLandingPageAdmin).toHaveBeenCalledTimes(1));
    expect(updateLandingPageAdmin.mock.calls[0][0]).toBe(5);
    expect(lastBody().linkedFormId).toBe(9);
    expect(slotCount(lastBody().htmlContent)).toBe(1);
    expect(lastBody().htmlContent).not.toContain('AUTOKEY');
    expect(lastBody().htmlContent).not.toContain('data-founderai-form-section');
    // phần còn lại của trang giữ nguyên
    expect(lastBody().htmlContent).toContain('<h1>Trang</h1>');
  });

  it('trang chưa có khối nhúng nào + chọn biểu mẫu X → chỗ trống được chèn trước </body>', async () => {
    fetchLandingPageAdminById.mockResolvedValue(
      serverPage({
        htmlContent: '<html><body><h1>Trang</h1><form data-founderai-capture></form></body></html>',
        linkedFormId: null,
        linkedFormTitle: null,
        linkedFormPublicKey: null,
        linkedFormSource: null,
      })
    );
    updateLandingPageAdmin.mockResolvedValue({ id: 5, updatedAt: 'T2' });
    renderEditor();
    await waitFor(() => expect(screen.getByTestId('html').textContent).toContain('data-founderai-capture'));

    fireEvent.click(screen.getByText('choose-x'));
    fireEvent.click(screen.getByText('save'));

    await waitFor(() => expect(updateLandingPageAdmin).toHaveBeenCalledTimes(1));
    expect(lastBody().linkedFormId).toBe(9);
    expect(slotCount(lastBody().htmlContent)).toBe(1);
    // form đăng ký có sẵn của trang KHÔNG bị xoá
    expect(lastBody().htmlContent).toContain('data-founderai-capture');
    expect(lastBody().htmlContent.indexOf('data-founderai-form-slot')).toBeLessThan(lastBody().htmlContent.lastIndexOf('</body>'));
  });

  it('KHÔNG có lựa chọn → body PUT không có khoá linkedFormId và HTML gửi đi y nguyên bản đang soạn', async () => {
    updateLandingPageAdmin.mockResolvedValue({ id: 5, updatedAt: 'T2' });
    renderEditor();
    await waitFor(() => expect(linkedState().id).toBe(7));
    const htmlBefore = screen.getByTestId('html').textContent;

    fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(updateLandingPageAdmin).toHaveBeenCalledTimes(1));

    expect('linkedFormId' in lastBody()).toBe(false);
    expect(lastBody().htmlContent).toBe(htmlBefore);
  });

  it('chọn quay về Form cơ bản rồi Lưu → body có linkedFormId=null; chỗ trống thay khối nhúng của biểu mẫu đang gắn', async () => {
    fetchLandingPageAdminById.mockResolvedValue(
      serverPage({
        htmlContent: `<html><body>${EMBED('XKEY')}</body></html>`,
        linkedFormId: 9,
        linkedFormTitle: 'Biểu mẫu X',
        linkedFormPublicKey: 'XKEY',
        linkedFormSource: 'chosen',
      })
    );
    updateLandingPageAdmin.mockResolvedValue({ id: 5, updatedAt: 'T2' });
    renderEditor();
    await waitFor(() => expect(linkedState().id).toBe(9));

    fireEvent.click(screen.getByText('choose-basic'));
    fireEvent.click(screen.getByText('save'));

    await waitFor(() => expect(updateLandingPageAdmin).toHaveBeenCalledTimes(1));
    expect(lastBody()).toHaveProperty('linkedFormId', null);
    expect(slotCount(lastBody().htmlContent)).toBe(1);
    expect(lastBody().htmlContent).not.toContain('XKEY');
  });

  it('lưu thất bại (vd 409 biểu mẫu đang dùng ở trang khác) → GIỮ lựa chọn chờ lưu và HTML đang soạn, không báo đã lưu', async () => {
    updateLandingPageAdmin.mockRejectedValue({ response: { data: { message: 'Biểu mẫu đang dùng ở trang Trang Beta.' } } });
    renderEditor();
    await waitFor(() => expect(linkedState().id).toBe(7));
    const htmlBefore = screen.getByTestId('html').textContent;

    fireEvent.click(screen.getByText('choose-x'));
    fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(updateLandingPageAdmin).toHaveBeenCalledTimes(1));
    await Promise.resolve();

    expect(linkedState().choice).toMatchObject({ mode: 'linked', formId: 9 });
    expect(linkedState().id).toBe(7);
    expect(screen.getByTestId('html').textContent).toBe(htmlBefore);
  });
});
