/**
 * PLAN_TRO_LY_CHINH_LANDING_TRON_GOI_2026-09-13.md, "Trạng thái PR-2" việc 1 — bug tìm thấy khi
 * review: các đường UPDATE (toggle publish / "Cập nhật trang đã lưu") gửi thẳng `domainType:'system'`
 * + htmlContent CŨ của thẻ chat, có thể âm thầm trả trang về subdomain hệ thống và đè mất bản sửa
 * ở trang soạn (tên miền riêng, nội dung mới). Test này khoá đúng hành vi đã sửa:
 *   - đọc lại bản thật trên server (fetchLandingPageAdminById) trước mọi lượt update;
 *   - toggle: title/htmlContent lấy từ SERVER, chỉ đổi isPublished, không domainType;
 *   - "Cập nhật trang đã lưu": title/htmlContent lấy từ THẺ, isPublished/slug giữ theo server,
 *     không domainType;
 *   - sau toggle nếu html server khác html thẻ thì đồng bộ lại thẻ + báo cho người dùng biết.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AiChatbot from '../AiChatbot';
import aiApi from '../../../services/aiApi';
import api from '../../../services/api';
import * as landingPagesAdminApi from '../../landing-pages/services/landingPagesAdminApi.service.js';

vi.mock('../../../services/aiApi');
vi.mock('../../../services/api');
vi.mock('../../landing-pages/services/landingPagesAdminApi.service.js');
vi.mock('../../../hooks/useIsMobile', () => ({ default: () => false }));
vi.mock('../../../i18n', () => ({
  useI18n: (namespace = null) => {
    const t = (key) => (namespace ? `${namespace}.${key}` : key);
    if (namespace) return t;
    return { t, locale: 'vi' };
  },
}));
vi.mock('../../../stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 1, role: 'user' },
    isAuthenticated: true,
    fetchAiCredits: vi.fn().mockResolvedValue(undefined),
    refreshAiCredits: vi.fn().mockResolvedValue(undefined),
    billingStatus: 'active',
    aiCredits: 100,
    addons: null,
    activeContext: null,
  }),
}));
vi.mock('../../storage/useStorageQuota', () => ({
  default: () => ({ usage: null, refreshQuota: vi.fn() }),
}));
vi.mock('../../settings/services/zaloSettingsApi.service', () => ({
  default: { getChannels: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../../services/help.service', () => ({
  getHelpArticle: vi.fn().mockResolvedValue(null),
}));

const { toastMock } = vi.hoisted(() => ({
  toastMock: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock('react-hot-toast', () => ({ toast: toastMock }));

const SAVED_PAGE_DATA = {
  title: 'Trang test (chat)',
  html: '<div>Nội dung cũ ở thẻ chat</div>',
  source: 'pasted',
  landingPageId: 42,
  slug: 'trang-test',
  isPublished: true,
};

async function openSavedSession() {
  aiApi.getSessions.mockResolvedValue({ data: [{ id: 'sess_1', title: 'Phiên landing' }] });
  aiApi.getSessionMessages.mockResolvedValue({
    data: [
      { id: 1, role: 'user', content: '[Dán HTML có sẵn: "Trang test (chat)", 30 ký tự]' },
      { id: 2, role: 'assistant', type: 'landing_page', data: SAVED_PAGE_DATA },
    ],
  });

  render(
    <MemoryRouter>
      <AiChatbot isOpen={true} />
    </MemoryRouter>
  );

  const sessionTab = await screen.findByText('Phiên landing');
  fireEvent.mouseUp(sessionTab);

  await waitFor(() => {
    expect(screen.getByText('landingPageCard.save.unpublish')).toBeInTheDocument();
  });
}

describe('AiChatbot — handleSaveAndPublishLandingPage đọc lại bản thật trên server trước khi update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    aiApi.getBusinessProfile = vi.fn().mockResolvedValue({ data: null });
    api.get.mockResolvedValue({ data: {} });
  });

  it('toggle "Ẩn trang" → fetch current trước, gửi title/htmlContent CỦA SERVER (không phải của thẻ), KHÔNG domainType', async () => {
    const currentOnServer = {
      id: 42,
      slug: 'trang-test',
      title: 'Trang đã sửa ở trang soạn',
      htmlContent: '<div>Đã sửa ở trang soạn, khác thẻ chat</div>',
      isPublished: true,
      leadFormConfig: { fixedFields: [], customFields: [] },
    };
    landingPagesAdminApi.fetchLandingPageAdminById.mockResolvedValue(currentOnServer);
    landingPagesAdminApi.updateLandingPageAdmin.mockResolvedValue({ id: 42, slug: 'trang-test', isPublished: false });

    await openSavedSession();
    fireEvent.click(screen.getByText('landingPageCard.save.unpublish'));

    await waitFor(() => {
      expect(landingPagesAdminApi.updateLandingPageAdmin).toHaveBeenCalledTimes(1);
    });
    expect(landingPagesAdminApi.fetchLandingPageAdminById).toHaveBeenCalledWith(42);

    const [id, body] = landingPagesAdminApi.updateLandingPageAdmin.mock.calls[0];
    expect(id).toBe(42);
    expect(body).not.toHaveProperty('domainType');
    expect(body).not.toHaveProperty('domainSubtype');
    expect(body.title).toBe(currentOnServer.title);
    expect(body.htmlContent).toBe(currentOnServer.htmlContent);
    expect(body.slug).toBe('trang-test');
    expect(body.isPublished).toBe(false);
    expect(body.leadFormConfig).toEqual(currentOnServer.leadFormConfig);
    // KHÔNG gửi htmlContent của THẺ (bản cũ) — đây chính là bug bị bắt ở review.
    expect(body.htmlContent).not.toContain(SAVED_PAGE_DATA.html);

    // html trên server khác html thẻ đang giữ → đồng bộ lại thẻ + báo cho người dùng biết.
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith('aiChatbot.landingHtmlSyncedFromEditor', expect.anything());
    });
  });

  it('"Cập nhật trang đã lưu" → gửi title/htmlContent CỦA THẺ, isPublished/slug giữ theo server, KHÔNG domainType', async () => {
    const currentOnServer = {
      id: 42,
      slug: 'trang-test',
      title: 'Trang trên server',
      htmlContent: '<div>HTML trên server</div>',
      isPublished: true,
      leadFormConfig: { fixedFields: [], customFields: [] },
    };
    landingPagesAdminApi.fetchLandingPageAdminById.mockResolvedValue(currentOnServer);
    landingPagesAdminApi.updateLandingPageAdmin.mockResolvedValue({ id: 42, slug: 'trang-test', isPublished: true });

    await openSavedSession();
    fireEvent.click(screen.getByText('landingPageCard.save.updateButton'));

    await waitFor(() => {
      expect(landingPagesAdminApi.updateLandingPageAdmin).toHaveBeenCalledTimes(1);
    });
    const [, body] = landingPagesAdminApi.updateLandingPageAdmin.mock.calls[0];
    expect(body).not.toHaveProperty('domainType');
    expect(body).not.toHaveProperty('domainSubtype');
    expect(body.title).toBe(SAVED_PAGE_DATA.title);
    expect(body.htmlContent).toContain(SAVED_PAGE_DATA.html);
    expect(body.isPublished).toBe(currentOnServer.isPublished);
    expect(body.slug).toBe(currentOnServer.slug);
  });

  it('create (chưa có landingPageId) vẫn gửi domainType:"system" như cũ — KHÔNG fetch current (trang chưa tồn tại)', async () => {
    aiApi.getSessions.mockResolvedValue({ data: [] });
    aiApi.landingFromHtml.mockResolvedValue({
      success: true,
      data: {
        sessionId: 501,
        sessionTitle: 'Trang mới',
        message: {
          content: 'Đã nhận trang HTML.',
          type: 'landing_page',
          data: { title: 'Trang mới', html: '<div>Nội dung</div>', source: 'pasted' },
        },
      },
    });
    landingPagesAdminApi.createLandingPageAdmin.mockResolvedValue({ id: 99, slug: 'trang-moi', isPublished: false });

    render(
      <MemoryRouter>
        <AiChatbot isOpen={true} />
      </MemoryRouter>
    );

    const textarea = await screen.findByPlaceholderText('aiChatbot.inputPlaceholder');
    const html = '<!doctype html><html><body><div>Nội dung</div></body></html>';
    fireEvent.change(textarea, { target: { value: html } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(screen.getAllByText('Trang mới').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByText('landingPageCard.save.button'));
    fireEvent.click(screen.getByText('landingPageCard.save.submit'));

    await waitFor(() => {
      expect(landingPagesAdminApi.createLandingPageAdmin).toHaveBeenCalledTimes(1);
    });
    expect(landingPagesAdminApi.fetchLandingPageAdminById).not.toHaveBeenCalled();
    const body = landingPagesAdminApi.createLandingPageAdmin.mock.calls[0][0];
    expect(body.domainType).toBe('system');
  });
});
