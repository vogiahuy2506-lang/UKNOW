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
import { addFormSlot, addPendingForm } from '../../utils/landingFormLink.js';

/**
 * PR-6 (thay PR-F "một biểu mẫu") — lưu danh sách NHIỀU biểu mẫu qua trình soạn thật (LandingCanvasPage →
 * LandingCanvasEditor.saveLanding): HTML đang soạn đã mang đủ khối nhúng / chỗ trống có loại nên gửi NGUYÊN VĂN; chỉ biểu mẫu CÓ
 * SẴN vừa chọn (`linkedFormsPending`) gửi thêm `linkedFormIds`. Không có thay đổi biểu mẫu → body/HTML như cũ.
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

// Layout giả: lộ state form ra DOM + nút mô phỏng thao tác của danh sách biểu mẫu (cùng hàm thuần mà LandingFormsList dùng).
vi.mock('../../components/LandingCanvasLayout.jsx', () => ({
  default: function FakeLayout({ form, setForm, onSave }) {
    return (
      <div>
        <div data-testid="html">{form.htmlContent}</div>
        <div data-testid="linked">
          {JSON.stringify({
            ids: (form.linkedForms || []).map((f) => f.id),
            keys: (form.linkedForms || []).map((f) => f.publicKey),
            pending: form.linkedFormsPending ?? null,
          })}
        </div>
        <button onClick={() => setForm((p) => ({ ...p, linkedFormsPending: addPendingForm(p.linkedFormsPending, { id: 9, publicKey: 'XKEY', title: 'Biểu mẫu X' }) }))}>
          add-existing-x
        </button>
        <button onClick={() => setForm((p) => ({ ...p, linkedFormsPending: addPendingForm(p.linkedFormsPending, { id: 10, publicKey: 'YKEY', title: 'Biểu mẫu Y' }) }))}>
          add-existing-y
        </button>
        <button onClick={() => setForm((p) => ({ ...p, htmlContent: addFormSlot(p.htmlContent, 'booking') }))}>add-slot-booking</button>
        <button onClick={() => setForm((p) => ({ ...p, htmlContent: addFormSlot(p.htmlContent, 'payment') }))}>add-slot-payment</button>
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
  htmlContent: `<html><body><h1>Trang</h1>${EMBED('AUTOKEY')}${EMBED('SECONDKEY')}</body></html>`,
  isPublished: true,
  domainType: 'system',
  customDomainHostname: null,
  customDomainIsApex: false,
  leadFormConfig: null,
  linkedForms: [
    { id: 7, title: 'Form tư vấn', publicKey: 'AUTOKEY', isPublished: true, kind: 'consult', position: 0, needsPaymentSetup: false },
    { id: 8, title: 'Form thu cọc', publicKey: 'SECONDKEY', isPublished: true, kind: 'payment', position: 1, needsPaymentSetup: true },
  ],
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
const slotKinds = (html) => [...String(html).matchAll(/data-founderai-form-slot(?:="([a-z]*)")?/g)].map((m) => m[1] ?? 'bare');

describe('LandingCanvasPage — lưu danh sách biểu mẫu của trang', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: { id: 1 }, activeContext: { type: 'self' } });
    vi.clearAllMocks();
    fetchLandingPageAdminById.mockResolvedValue(serverPage());
  });
  afterEach(() => cleanup());

  it('đọc từ server: TẤT CẢ biểu mẫu đang nhúng vào state (linkedForms), chưa có biểu mẫu nào chờ gắn', async () => {
    renderEditor();
    await waitFor(() => expect(linkedState().ids).toEqual([7, 8]));
    expect(linkedState()).toEqual({ ids: [7, 8], keys: ['AUTOKEY', 'SECONDKEY'], pending: [] });
  });

  it('server cũ chỉ trả khoá đơn linkedFormId (deploy lệch) → vẫn dựng danh sách 1 biểu mẫu', async () => {
    fetchLandingPageAdminById.mockResolvedValue(
      serverPage({
        linkedForms: undefined,
        linkedFormId: 7,
        linkedFormTitle: 'Form cơ bản tự sinh',
        linkedFormPublicKey: 'AUTOKEY',
        linkedFormSource: 'basic',
      })
    );
    renderEditor();
    await waitFor(() => expect(linkedState().ids).toEqual([7]));
  });

  it('thêm biểu mẫu CÓ SẴN X và Y rồi Lưu → body có linkedFormIds=[9,10] (đúng thứ tự thêm), HTML gửi đi nguyên văn, KHÔNG có khoá linkedFormId cũ', async () => {
    updateLandingPageAdmin.mockResolvedValue({ id: 5, updatedAt: 'T2' });
    renderEditor();
    await waitFor(() => expect(linkedState().ids).toEqual([7, 8]));
    const htmlBefore = screen.getByTestId('html').textContent;

    fireEvent.click(screen.getByText('add-existing-x'));
    fireEvent.click(screen.getByText('add-existing-y'));
    fireEvent.click(screen.getByText('add-existing-x')); // thêm trùng → bỏ qua
    expect(linkedState().pending.map((p) => p.formId)).toEqual([9, 10]);
    fireEvent.click(screen.getByText('save'));

    await waitFor(() => expect(updateLandingPageAdmin).toHaveBeenCalledTimes(1));
    expect(updateLandingPageAdmin.mock.calls[0][0]).toBe(5);
    expect(lastBody().linkedFormIds).toEqual([9, 10]);
    expect('linkedFormId' in lastBody()).toBe(false);
    expect(lastBody().htmlContent).toBe(htmlBefore); // chưa đụng HTML: backend nối khối nhúng vào cuối trang
    expect(lastBody().htmlContent).toContain('AUTOKEY');
    expect(lastBody().htmlContent).toContain('SECONDKEY');
  });

  it('thêm biểu mẫu MỚI theo mẫu (booking, payment) rồi Lưu → HTML gửi đi có đúng 2 chỗ trống có loại, đủ khối nhúng cũ, KHÔNG gửi linkedFormIds', async () => {
    updateLandingPageAdmin.mockResolvedValue({ id: 5, updatedAt: 'T2' });
    renderEditor();
    await waitFor(() => expect(linkedState().ids).toEqual([7, 8]));

    fireEvent.click(screen.getByText('add-slot-booking'));
    fireEvent.click(screen.getByText('add-slot-payment'));
    fireEvent.click(screen.getByText('save'));

    await waitFor(() => expect(updateLandingPageAdmin).toHaveBeenCalledTimes(1));
    expect(slotKinds(lastBody().htmlContent)).toEqual(['booking', 'payment']);
    expect(lastBody().htmlContent).toContain('data-founderai-form="AUTOKEY"');
    expect(lastBody().htmlContent).toContain('data-founderai-form="SECONDKEY"');
    expect('linkedFormIds' in lastBody()).toBe(false);
    expect('linkedFormId' in lastBody()).toBe(false);
    // chỗ trống nằm SAU khối nhúng cuối cùng (các biểu mẫu nằm gần nhau)
    expect(lastBody().htmlContent.indexOf('"booking"')).toBeGreaterThan(lastBody().htmlContent.indexOf('SECONDKEY'));
  });

  it('KHÔNG đổi gì về biểu mẫu → body PUT không có linkedFormIds / linkedFormId và HTML y nguyên bản đang soạn', async () => {
    updateLandingPageAdmin.mockResolvedValue({ id: 5, updatedAt: 'T2' });
    renderEditor();
    await waitFor(() => expect(linkedState().ids).toEqual([7, 8]));
    const htmlBefore = screen.getByTestId('html').textContent;

    fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(updateLandingPageAdmin).toHaveBeenCalledTimes(1));

    expect('linkedFormIds' in lastBody()).toBe(false);
    expect('linkedFormId' in lastBody()).toBe(false);
    expect(lastBody().htmlContent).toBe(htmlBefore);
  });

  it('lưu thất bại → GIỮ biểu mẫu chờ gắn và HTML đang soạn, không báo đã lưu', async () => {
    updateLandingPageAdmin.mockRejectedValue({ response: { data: { message: 'Biểu mẫu này đang bị quản trị viên khoá nên không dùng được.' } } });
    renderEditor();
    await waitFor(() => expect(linkedState().ids).toEqual([7, 8]));

    fireEvent.click(screen.getByText('add-existing-x'));
    fireEvent.click(screen.getByText('add-slot-booking'));
    const htmlAfterAdd = screen.getByTestId('html').textContent;
    fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(updateLandingPageAdmin).toHaveBeenCalledTimes(1));
    await Promise.resolve();

    expect(linkedState().pending.map((p) => p.formId)).toEqual([9]);
    expect(linkedState().ids).toEqual([7, 8]);
    expect(screen.getByTestId('html').textContent).toBe(htmlAfterAdd);
  });
});
