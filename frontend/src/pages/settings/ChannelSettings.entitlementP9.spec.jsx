/**
 * P9 — trang Kênh: tab Telegram/WhatsApp có 2 trạng thái theo quyền kênh của gói.
 * Không có quyền (trần 0): thông báo "Gói hiện tại không có ..." + nút mua thêm/nâng gói, KHÔNG có nút quét QR/quét lại/đăng nhập lại.
 * Có quyền: giữ nguyên (nút quét QR có mặt, không có thông báo).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../i18n';
import ChannelSettings from './ChannelSettings.jsx';

const entitlementsState = { telegram: true, whatsapp: true, zalo: true, limits: {}, isLoading: false };
vi.mock('../../hooks/queries/useChannelEntitlements', () => ({
  useChannelEntitlements: () => entitlementsState,
}));

vi.mock('./EmailSettings', () => ({ default: () => null }));
vi.mock('../../features/settings/services/zaloSettingsApi.service', () => ({
  default: {
    listAccounts: vi.fn().mockResolvedValue({
      data: {
        data: {
          items: [
            { id: 8, displayName: 'Zalo Cũ', status: 'disconnected', isActive: true, isDefault: false },
            { id: 9, displayName: 'Zalo Nối', status: 'connected', isActive: true, isDefault: true },
          ],
        },
      },
    }),
    deleteAccount: vi.fn(),
    setDefaultAccount: vi.fn(),
  },
}));
vi.mock('./FacebookSettings', () => ({ default: () => null }));
vi.mock('../../features/settings/components/ChannelAccountSendSettings', () => ({ default: () => null }));
vi.mock('../../features/settings/components/WhatsAppTestSend', () => ({ default: () => null }));

vi.mock('../../features/chatbot/services/chatbotApi.service', () => ({
  default: {
    listTelegramAccounts: vi.fn().mockResolvedValue({
      data: {
        data: [{
          id: 5, telegram_user_id: 99, username: 'cu', is_active: true, session_ok: false, is_loaded: false,
        }],
      },
    }),
    getPersonalAccountsHealth: vi.fn().mockResolvedValue({ data: { data: { channels: { telegram: null } } } }),
    getTelegramAccountStatus: vi.fn().mockResolvedValue({ data: { data: { canStartLogin: true, hasSecret: true } } }),
    initTelegramLogin: vi.fn(),
    checkTelegramLoginStatus: vi.fn(),
    cancelTelegramLogin: vi.fn(),
    deleteTelegramAccount: vi.fn(),
    logoutTelegramAccount: vi.fn(),
  },
}));

vi.mock('../../features/settings/services/whatsappSettingsApi.service', () => ({
  default: {
    listBaileysSessions: vi.fn().mockResolvedValue({
      data: { data: [{ sessionKey: '1-abc', phone: '84900000000', status: 'close', name: 'Cũ' }] },
    }),
    openBaileysSession: vi.fn(),
  },
}));

vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

const SCAN_QR = /quét qr|scan qr/i;
const RELOGIN = /đăng nhập lại|log in again|re-?login/i;

function renderAt(hash) {
  window.location.hash = hash;
  return render(
    <I18nProvider>
      <MemoryRouter>
        <ChannelSettings />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('ChannelSettings — P9 quyền kênh theo gói', () => {
  beforeEach(() => {
    entitlementsState.telegram = true;
    entitlementsState.whatsapp = true;
    entitlementsState.zalo = true;
    entitlementsState.isLoading = false;
  });

  it('Telegram trần 0: có thông báo + link mua thêm/nâng gói, KHÔNG có nút quét QR/đăng nhập lại (tài khoản cũ vẫn hiện)', async () => {
    entitlementsState.telegram = false;
    renderAt('#telegram');
    expect(screen.getByTestId('channel-not-in-plan')).toBeTruthy();
    expect(screen.getByRole('link', { name: /mua thêm slot|buy more slots/i }).getAttribute('href')).toBe('/app/topup');
    expect(screen.getByRole('link', { name: /nâng gói|upgrade plan/i }).getAttribute('href')).toBe('/app/billing');
    await waitFor(() => expect(screen.getByText('@cu')).toBeTruthy());
    expect(screen.queryByRole('button', { name: SCAN_QR })).toBeNull();
    expect(screen.queryByRole('button', { name: RELOGIN })).toBeNull();
  });

  it('Telegram có quyền: không có thông báo, có nút quét QR', async () => {
    renderAt('#telegram');
    await waitFor(() => expect(screen.getByText('@cu')).toBeTruthy());
    expect(screen.queryByTestId('channel-not-in-plan')).toBeNull();
    expect(screen.getAllByRole('button', { name: SCAN_QR }).length).toBeGreaterThan(0);
  });

  it('WhatsApp trần 0: có thông báo, KHÔNG có nút quét QR / quét lại', async () => {
    entitlementsState.whatsapp = false;
    renderAt('#whatsapp');
    expect(screen.getByTestId('channel-not-in-plan')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Cũ' })).toBeTruthy());
    expect(screen.queryByRole('button', { name: SCAN_QR })).toBeNull();
    expect(screen.queryByRole('button', { name: /quét lại|rescan|scan again/i })).toBeNull();
  });

  it('WhatsApp có quyền: có nút quét QR và quét lại cho phiên đóng', async () => {
    renderAt('#whatsapp');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Cũ' })).toBeTruthy());
    expect(screen.queryByTestId('channel-not-in-plan')).toBeNull();
    expect(screen.getAllByRole('button', { name: SCAN_QR }).length).toBeGreaterThan(0);
  });

  // P12 — Zalo cá nhân vào cùng cổng quyền kênh theo gói.
  it('P12 Zalo trần 0: có thông báo nhắc Zalo + link mua thêm, KHÔNG có nút Tạo QR / Kết nối lại / khôi phục phiên (tài khoản cũ vẫn hiện, xoá vẫn được)', async () => {
    entitlementsState.zalo = false;
    renderAt('#zalo');
    expect(screen.getByTestId('channel-not-in-plan').textContent).toMatch(/Zalo/);
    expect(screen.getByRole('link', { name: /mua thêm slot|buy more slots/i }).getAttribute('href')).toBe('/app/topup');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Zalo Cũ' })).toBeTruthy());
    expect(screen.queryByRole('button', { name: /tạo qr|create qr/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /kết nối lại|reconnect/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /khôi phục|restore/i })).toBeNull();
    expect(screen.getAllByTitle(/xóa|xoá|delete/i).length).toBeGreaterThan(0);
  });

  it('P12 Zalo có quyền (kể cả limit=1): không thông báo, có nút Tạo QR và Kết nối lại cho tài khoản mất kết nối', async () => {
    entitlementsState.zalo = true;
    entitlementsState.limits = { zalo: 1 };
    renderAt('#zalo');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Zalo Cũ' })).toBeTruthy());
    expect(screen.queryByTestId('channel-not-in-plan')).toBeNull();
    expect(screen.getAllByRole('button', { name: /tạo qr|create qr/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /kết nối lại|reconnect/i }).length).toBeGreaterThan(0);
    entitlementsState.limits = {};
  });

  it('đang tải quyền: chưa vẽ nội dung kênh (không nhấp nháy nút quét QR)', () => {
    entitlementsState.isLoading = true;
    renderAt('#whatsapp');
    expect(screen.queryByRole('button', { name: SCAN_QR })).toBeNull();
    expect(screen.queryByTestId('channel-not-in-plan')).toBeNull();
  });
});
