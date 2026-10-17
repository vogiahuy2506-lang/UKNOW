/**
 * P12 — Studio DeployTab và quyền kênh theo gói. 11/10/2026 (PLAN_KENH_KHONG_AN_KHOA_VA_GOI_Y_MUA): ô Zalo cá nhân /
 * WhatsApp / Telegram KHÔNG còn bị ẩn khi gói không có kênh (hoặc gói hết hạn) — vẫn hiện, mờ + khoá, bấm mở modal gợi ý
 * mua slot / gia hạn. Hết lượt GỬI trong kỳ không khoá (kết nối tài khoản cho chatbot không tốn lượt gửi). Gói có Zalo
 * (kể cả limit=1) dùng được.
 *
 * Lịch sử:
 *  - 04/10/2026 (S-04): Facebook và Zalo OA gỡ khỏi Studio.
 *  - 05/10/2026: Facebook Messenger KHÔI PHỤC (Meta App đã có FACEBOOK_APP_ID/SECRET). Zalo OA vẫn gỡ.
 *    Ô Facebook không phụ thuộc entitlement gói nên không cần mock thêm; nó hiện với mọi gói.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DeployTab from '../DeployTab';
import { useAuthStore } from '../../../stores/authStore';

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
const renderTab = (chatbot = bot) => render(
  <MemoryRouter>
    <DeployTab chatbot={chatbot} onOpenWidgetSettings={() => {}} />
  </MemoryRouter>
);
const meter = (used, limit) => ({ used, limit });
const emptyUsage = () => ({
  email: meter(null, null),
  messaging: meter(null, null),
  telegram: meter(null, null),
  whatsapp: meter(null, null),
  combined: meter(null, null),
});

describe('DeployTab — P12 quyền kênh Zalo', () => {
  beforeEach(() => {
    entitlementsState.zalo = true;
    entitlementsState.telegram = true;
    entitlementsState.whatsapp = true;
    entitlementsState.limits = {};
    useAuthStore.setState({
      user: { id: 1, role: 'user' },
      activeContext: { type: 'self' },
      sendUsage: emptyUsage(),
      billingStatus: null,
      addons: null,
    });
  });

  it('zalo:false -> ô "Zalo cá nhân" VẪN hiện nhưng khoá (aria-disabled, nhãn "Chưa dùng được"); Telegram và WhatsApp dùng được', () => {
    entitlementsState.zalo = false;
    renderTab();
    expect(screen.getByText('Zalo cá nhân')).toBeTruthy();
    const zalo = screen.getByTestId('deploy-channel-zalo_personal');
    expect(zalo).toHaveAttribute('aria-disabled', 'true');
    expect(zalo.className).toContain('opacity-60');
    expect(within(zalo).getByText('Chưa dùng được')).toBeTruthy();
    expect(within(zalo).getByTestId('channel-lock-badge')).toBeTruthy();
    expect(screen.getByTestId('deploy-channel-telegram_personal')).not.toHaveAttribute('aria-disabled');
    expect(screen.getByTestId('deploy-channel-whatsapp')).not.toHaveAttribute('aria-disabled');
    expect(screen.getByTestId('deploy-channel-facebook')).not.toHaveAttribute('aria-disabled');
  });

  it('bấm ô bị khoá mở modal "Mở khoá Telegram" có nút mua slot, KHÔNG mở hộp cấu hình kênh', () => {
    entitlementsState.telegram = false;
    renderTab();
    fireEvent.click(screen.getByTestId('deploy-channel-telegram_personal'));
    const modal = screen.getByTestId('channel-unavailable-modal');
    expect(modal).toHaveAttribute('data-channel', 'telegram');
    expect(modal).toHaveAttribute('data-reason', 'not_in_plan');
    expect(within(modal).getByText('Mở khoá Telegram')).toBeTruthy();
    expect(within(modal).getByTestId('channel-unavailable-action-buySlot')).toBeTruthy();
  });

  it('gói không có cả Telegram và WhatsApp -> cả hai ô khoá (trước đây ẩn hẳn)', () => {
    entitlementsState.telegram = false;
    entitlementsState.whatsapp = false;
    renderTab();
    expect(screen.getByTestId('deploy-channel-telegram_personal')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('deploy-channel-whatsapp')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('deploy-channel-zalo_personal')).not.toHaveAttribute('aria-disabled');
  });

  it('gói HẾT HẠN: ba ô Zalo/WhatsApp/Telegram khoá, bấm mở modal "Gia hạn gói"; Facebook không phụ thuộc gói', () => {
    useAuthStore.setState({ billingStatus: { isFullyExpired: true, planRevokedAfterExpiry: false } });
    renderTab();
    for (const key of ['zalo_personal', 'whatsapp', 'telegram_personal']) {
      expect(screen.getByTestId(`deploy-channel-${key}`)).toHaveAttribute('aria-disabled', 'true');
    }
    expect(screen.getByTestId('deploy-channel-facebook')).not.toHaveAttribute('aria-disabled');
    fireEvent.click(screen.getByTestId('deploy-channel-whatsapp'));
    expect(screen.getByTestId('channel-unavailable-modal')).toHaveAttribute('data-reason', 'plan_expired');
  });

  it('hết lượt GỬI Zalo trong kỳ KHÔNG khoá ô (kết nối tài khoản cho chatbot không tốn lượt gửi)', () => {
    useAuthStore.setState({ sendUsage: { ...emptyUsage(), messaging: meter(300, 300) } });
    renderTab();
    expect(screen.getByTestId('deploy-channel-zalo_personal')).not.toHaveAttribute('aria-disabled');
  });

  it('zalo:true (limit=1) -> có ô "Zalo cá nhân" và dùng được', () => {
    entitlementsState.limits = { zalo: 1 };
    renderTab();
    expect(screen.getByText('Zalo cá nhân')).toBeTruthy();
    expect(screen.getByTestId('deploy-channel-zalo_personal')).not.toHaveAttribute('aria-disabled');
  });

  it('khôi phục 05/10/2026: có ô Facebook; Zalo OA vẫn không có (kể cả khi gói có đủ kênh)', () => {
    render(<DeployTab chatbot={bot} onOpenWidgetSettings={() => {}} />);
    expect(screen.getByText('Facebook')).toBeTruthy();
    expect(screen.queryByText('Zalo OA')).toBeNull();
    // Ba ô nhắn tin còn lại ngoài Facebook.
    expect(screen.getByText('Zalo cá nhân')).toBeTruthy();
    expect(screen.getByText('Telegram')).toBeTruthy();
    expect(screen.getByText('WhatsApp')).toBeTruthy();
  });

  it('ô Facebook đọc facebook_count để hiện "Đang bật: N tài khoản"', () => {
    render(<DeployTab chatbot={{ ...bot, facebook_count: 1 }} onOpenWidgetSettings={() => {}} />);
    expect(screen.getByText('Đang bật: 1 tài khoản')).toBeTruthy();
  });

  it('S-04: không có chấm cam "chưa nối" — ô chỉ ghi chữ nhỏ "Chưa bật" / "Đang bật: N tài khoản"', () => {
    const { container } = render(
      <DeployTab chatbot={{ ...bot, zalo_personal_count: 2, telegram_count: 0 }} onOpenWidgetSettings={() => {}} />
    );
    expect(container.querySelector('.bg-amber-500')).toBeNull();
    expect(screen.getByText('Đang bật: 2 tài khoản')).toBeTruthy();
    // Facebook + Telegram + WhatsApp chưa bật → ba chữ "Chưa bật".
    expect(screen.getAllByText('Chưa bật')).toHaveLength(3);
  });
});
