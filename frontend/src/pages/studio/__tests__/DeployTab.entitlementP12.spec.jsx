/**
 * P12 — Studio DeployTab: ô "Zalo cá nhân" ẩn khi gói không có kênh Zalo (như WhatsApp/Telegram ở P9);
 * gói có Zalo (kể cả limit=1) vẫn hiện.
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
    entitlementsState.limits = {};
  });

  it('zalo:false -> không có ô "Zalo cá nhân"; Facebook và Zalo OA vẫn còn', () => {
    entitlementsState.zalo = false;
    render(<DeployTab chatbot={bot} onOpenWidgetSettings={() => {}} />);
    expect(screen.queryByText('Zalo cá nhân')).toBeNull();
    expect(screen.getByText('Facebook')).toBeTruthy();
  });

  it('zalo:true (limit=1) -> có ô "Zalo cá nhân"', () => {
    entitlementsState.limits = { zalo: 1 };
    render(<DeployTab chatbot={bot} onOpenWidgetSettings={() => {}} />);
    expect(screen.getByText('Zalo cá nhân')).toBeTruthy();
  });
});
