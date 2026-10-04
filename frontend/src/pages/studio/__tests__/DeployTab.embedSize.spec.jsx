/**
 * Mã nhúng iFrame: height theo custom_chatbots.embed_size (small 480 / medium 600 / large 760).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DeployTab from '../DeployTab';

vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: { getChatbotChannels: vi.fn().mockResolvedValue({ data: { data: [] } }) },
}));
vi.mock('../../../hooks/queries/useChannelEntitlements', () => ({
  useChannelEntitlements: () => ({ telegram: true, whatsapp: true, limits: {}, isLoading: false }),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../ChannelModals', () => ({ ChannelModal: () => null }));
vi.mock('../../../components/marketplace/ShareChatbotModal', () => ({ default: () => null }));
vi.mock('../../../components/marketplace/MarketplaceListingModal', () => ({ default: () => null }));
vi.mock('../../../i18n', async () => (await import('./studioTestI18n.js')).i18nMock);

const base = { id: 9, name: 'Bot', widget_key: 'wk9', channels: [] };

function iframeCodeFor(bot) {
  const { container, unmount } = render(<DeployTab chatbot={bot} onOpenWidgetSettings={() => {}} />);
  fireEvent.click(screen.getByText('Khung chat trong trang'));
  const text = container.ownerDocument.querySelector('pre').textContent;
  unmount();
  return text;
}

describe('DeployTab — chiều cao mã iFrame', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['small', 480],
    ['medium', 600],
    ['large', 760],
  ])('embed_size %s → height="%i"', (size, h) => {
    expect(iframeCodeFor({ ...base, embed_size: size })).toContain(`height="${h}"`);
  });

  it('thiếu / sai embed_size → 600', () => {
    expect(iframeCodeFor(base)).toContain('height="600"');
    expect(iframeCodeFor({ ...base, embed_size: 'huge' })).toContain('height="600"');
  });
});
