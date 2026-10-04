/**
 * P12 — Studio DeployTab: ô "Zalo cá nhân" ẩn khi gói không có kênh Zalo (như WhatsApp/Telegram ở P9);
 * gói có Zalo (kể cả limit=1) vẫn hiện.
 *
 * 04/10/2026 (S-04): Facebook và Zalo OA đã gỡ khỏi Studio — ca cũ khẳng định "Facebook và Zalo OA vẫn còn" nay đảo lại:
 * hai ô đó KHÔNG còn, kể cả khi gói có đủ kênh.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import DeployTab from '../DeployTab';

const entitlementsState = { telegram: true, whatsapp: true, zalo: true, limits: {}, isLoading: false };
vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: { getChatbotChannels: vi.fn().mockResolvedValue({ data: { data: [] } }) },
}));
vi.mock('../../../hooks/queries/useChannelEntitlements', () => ({
  useChannelEntitlements: () => entitlementsState,
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../ChannelModals', () => ({ ChannelModal: () => null }));
vi.mock('../../../components/marketplace/ShareChatbotModal', () => ({ default: () => null }));
vi.mock('../../../components/marketplace/MarketplaceListingModal', () => ({ default: () => null }));
vi.mock('../../../i18n', async () => (await import('./studioTestI18n.js')).i18nMock);

const bot = { id: 9, name: 'Bot', widget_key: 'wk9', channels: [] };

describe('DeployTab — P12 quyền kênh Zalo', () => {
  beforeEach(() => {
    entitlementsState.zalo = true;
    entitlementsState.telegram = true;
    entitlementsState.whatsapp = true;
    entitlementsState.limits = {};
  });

  it('zalo:false -> không có ô "Zalo cá nhân"; Telegram và WhatsApp vẫn còn', () => {
    entitlementsState.zalo = false;
    render(<DeployTab chatbot={bot} onOpenWidgetSettings={() => {}} />);
    expect(screen.queryByText('Zalo cá nhân')).toBeNull();
    expect(screen.getByText('Telegram')).toBeTruthy();
    expect(screen.getByText('WhatsApp')).toBeTruthy();
  });

  it('zalo:true (limit=1) -> có ô "Zalo cá nhân"', () => {
    entitlementsState.limits = { zalo: 1 };
    render(<DeployTab chatbot={bot} onOpenWidgetSettings={() => {}} />);
    expect(screen.getByText('Zalo cá nhân')).toBeTruthy();
  });

  it('S-04: không còn ô Facebook và Zalo OA (kể cả khi gói có đủ kênh)', () => {
    render(<DeployTab chatbot={bot} onOpenWidgetSettings={() => {}} />);
    expect(screen.queryByText('Facebook')).toBeNull();
    expect(screen.queryByText('Zalo OA')).toBeNull();
    // Ba ô nhắn tin còn lại.
    expect(screen.getByText('Zalo cá nhân')).toBeTruthy();
    expect(screen.getByText('Telegram')).toBeTruthy();
    expect(screen.getByText('WhatsApp')).toBeTruthy();
  });

  it('S-04: không có chấm cam "chưa nối" — ô chỉ ghi chữ nhỏ "Chưa bật" / "Đang bật: N tài khoản"', () => {
    const { container } = render(
      <DeployTab chatbot={{ ...bot, zalo_personal_count: 2, telegram_count: 0 }} onOpenWidgetSettings={() => {}} />
    );
    expect(container.querySelector('.bg-amber-500')).toBeNull();
    expect(screen.getByText('Đang bật: 2 tài khoản')).toBeTruthy();
    // Telegram + WhatsApp chưa bật → hai chữ "Chưa bật".
    expect(screen.getAllByText('Chưa bật')).toHaveLength(2);
  });
});
