/**
 * S-16 (10/2026) — Studio ở locale `en` không còn chữ tiếng Việt ở các vùng chính.
 *
 * Trước đây 8 tệp Studio viết cứng ~225 dòng tiếng Việt nên chọn tiếng Anh vẫn đọc tiếng Việt. Spec này dựng
 * `useI18n` bằng từ điển `en.js` THẬT (khoá thiếu trả lại chính khoá, giống I18nProvider — nên một khoá quên khai báo ở
 * en.js hiện ra thành chuỗi `chatbot.studio.xxx`, không phải tiếng Việt: ca "mọi khoá đã dịch" bắt trường hợp này).
 * Dữ liệu giả (tên bot, lời chào, câu hỏi gợi ý) dùng tiếng Anh để mọi chữ có dấu còn sót chỉ có thể là chuỗi cứng.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import en from '../../../i18n/en.js';
import ChatbotStudioPage from '../ChatbotStudioPage';
import { ChannelModal } from '../ChannelModals';
import WidgetSettingsModal from '../WidgetSettingsModal';
import KnowledgeTab from '../KnowledgeTab';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';
import { useAuthStore } from '../../../stores/authStore';

// Chữ cái tiếng Việt có dấu (không có trong tiếng Anh thường).
const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

function translateEn(key, params = {}) {
  let value = en;
  for (const part of String(key).split('.')) {
    value = value && typeof value === 'object' ? value[part] : undefined;
  }
  if (typeof value !== 'string') return key;
  return value.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`);
}

vi.mock('../../../i18n', () => ({
  useI18n: () => ({ t: globalThis.__translateEn, locale: 'en' }),
}));
vi.mock('../../../hooks/useMediaQuery', () => ({
  default: (query) => query.includes('min-width: 1280') || query.includes('min-width: 1024'),
}));
vi.mock('../ChatListSidebar', () => ({
  default: ({ onSelectBot }) => (
    <button onClick={() => onSelectBot(globalThis.__studioBot)}>pick-bot</button>
  ),
}));
vi.mock('../ChatbotConfigModal', () => ({ default: () => null }));
vi.mock('../../../hooks/queries/useChannelEntitlements', () => ({
  useChannelEntitlements: () => ({ telegram: true, whatsapp: true, zalo: true, limits: {}, isLoading: false }),
}));
vi.mock('../../../components/marketplace/ShareChatbotModal', () => ({ default: () => null }));
vi.mock('../../../components/marketplace/MarketplaceListingModal', () => ({ default: () => null }));
vi.mock('../../../features/storage/useStorageQuota', () => ({ default: () => ({}) }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: {
    getChatbotStudioConversations: vi.fn(),
    getChatbotStudioMessages: vi.fn(),
    createChatbotStudioConversation: vi.fn(),
    addChatbotStudioMessage: vi.fn(),
    deleteChatbotStudioConversation: vi.fn(),
    sendCustomChat: vi.fn(),
    listChatbots: vi.fn(),
    listZaloAccountsWithChatbotSettings: vi.fn(),
    listCustomChatDocuments: vi.fn(),
  },
}));

const BOT = {
  id: 7,
  name: 'Shop Bot',
  widget_key: 'wk7',
  replies_enabled: true,
  document_count: 0,
  greeting_msg: 'Hello! How can I help?',
  suggested_questions: ['How much is it?'],
};

function expectNoVietnamese(container, area) {
  const text = container.textContent || '';
  const titles = [...container.querySelectorAll('[title],[placeholder],[aria-label]')]
    .map((el) => [el.getAttribute('title'), el.getAttribute('placeholder'), el.getAttribute('aria-label')].join(' '))
    .join(' ');
  expect(`${area}: ${text} ${titles}`.match(VIETNAMESE)?.input?.slice(0, 400) ?? null).toBeNull();
  // Khoá chưa dịch hiện ra thành `chatbot.studio.xxx`.
  expect(`${text} ${titles}`).not.toMatch(/chatbot\.studio\./);
}

describe('Studio ở locale en — không còn chữ Việt ở các vùng chính', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.__translateEn = translateEn;
    globalThis.__studioBot = BOT;
    Element.prototype.scrollIntoView = vi.fn();
    useAuthStore.setState({ user: { id: 1 }, activeContext: { type: 'self' }, aiCredits: { used: 0, limit: null } });
    chatbotApi.getChatbotStudioConversations.mockResolvedValue({ data: { data: { items: [] } } });
    chatbotApi.listZaloAccountsWithChatbotSettings.mockResolvedValue({ data: { data: [] } });
    chatbotApi.listCustomChatDocuments.mockResolvedValue({ data: { documents: [], data: [] } });
  });

  it('chưa chọn bot: khung giữa và cột phải', () => {
    const { container } = render(<ChatbotStudioPage />);
    expect(screen.getByText(en.chatbot.studio.emptySelectBot)).toBeTruthy();
    expectNoVietnamese(container, 'empty');
  });

  it('đã chọn bot: header khung chat, khung nhập, cột "Đưa chatbot tới khách" (Deliver the chatbot to customers)', async () => {
    const { container } = render(<ChatbotStudioPage />);
    fireEvent.click(screen.getByText('pick-bot'));
    await screen.findByTestId('welcome-bubble');

    expect(screen.getByText(en.chatbot.studio.deployTitle)).toBeTruthy();
    expect(screen.getByPlaceholderText(en.chatbot.studio.typeMessagePlaceholder)).toBeTruthy();
    expect(screen.getByTitle(en.chatbot.studio.openConfigTitle)).toBeTruthy();
    expectNoVietnamese(container, 'playground+deploy');
  });

  it('hộp kênh Zalo cá nhân', async () => {
    const { container } = render(
      <ChannelModal open channel="zalo_personal" chatbot={BOT} onClose={() => {}} />,
    );
    await waitFor(() => expect(screen.getByText(en.chatbot.studio.zaloNotLinked)).toBeTruthy());
    expect(screen.getByText(en.chatbot.studio.zaloCfgTitle)).toBeTruthy();
    expectNoVietnamese(container, 'zalo-channel');
  });

  it('hộp Giao diện widget', () => {
    const { container } = render(
      <WidgetSettingsModal open chatbot={BOT} embedKind="script" onClose={() => {}} onUpdate={() => {}} />,
    );
    expect(screen.getByText(en.chatbot.studio.wTitle)).toBeTruthy();
    expectNoVietnamese(container, 'widget-settings');
  });

  it('tab Kiến thức', async () => {
    const { container } = render(<KnowledgeTab chatbot={BOT} />);
    await waitFor(() => expect(screen.getByText(en.chatbot.studio.kbEmptyTitle)).toBeTruthy());
    expectNoVietnamese(container, 'knowledge');
  });

  it('mọi khoá chatbot.studio.* có ở cả vi và en (t() trả lại khoá khi thiếu bản dịch)', async () => {
    const vi_ = (await import('../../../i18n/vi.js')).default;
    const viKeys = Object.keys(vi_.chatbot.studio).sort();
    const enKeys = Object.keys(en.chatbot.studio).sort();
    expect(enKeys.filter((k) => !viKeys.includes(k))).toEqual([]);
    expect(viKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
  });
});
