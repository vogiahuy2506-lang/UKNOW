import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import KnowledgeTab from '../KnowledgeTab';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';

vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: {
    listCustomChatDocuments: vi.fn(),
    addCustomChatTextDocument: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../i18n', async () => (await import('./studioTestI18n.js')).i18nMock);

// Prop on dinh: mang moi moi lan render se lam effect tai lai vo han.
const CHATBOT = { id: 7, name: 'Bot' };
const NO_DOCS = [];

const doc = (id) => ({ id, title: `Doc ${id}`, status: 'ready', source_type: 'text' });

describe('KnowledgeTab - phat studio:knowledge-changed', () => {
  const events = [];
  const listener = (e) => events.push(e.detail);

  beforeEach(() => {
    vi.clearAllMocks();
    events.length = 0;
    document.addEventListener('studio:knowledge-changed', listener);
  });
  afterEach(() => document.removeEventListener('studio:knowledge-changed', listener));

  it('them van ban thanh cong -> phat su kien voi chatbotId va count moi', async () => {
    chatbotApi.listCustomChatDocuments
      .mockResolvedValueOnce({ data: { documents: [doc(1)] } })
      .mockResolvedValueOnce({ data: { documents: [doc(1), doc(2)] } });
    chatbotApi.addCustomChatTextDocument.mockResolvedValue({ data: { success: true } });

    render(<KnowledgeTab chatbot={CHATBOT} initialDocuments={NO_DOCS} />);
    await waitFor(() => expect(events).toContainEqual({ chatbotId: 7, count: 1, errorCount: 0 }));

    fireEvent.click(screen.getByText('Văn bản'));
    fireEvent.change(screen.getByPlaceholderText('Nhập nội dung kiến thức...'), {
      target: { value: 'noi dung' },
    });
    fireEvent.click(screen.getByText('Thêm'));

    await waitFor(() => expect(events).toContainEqual({ chatbotId: 7, count: 2, errorCount: 0 }));
  });

  // S-17: chi dem tai lieu SAN SANG; tai lieu loi/dang xu ly khong tinh vao count, loi bao rieng.
  it('chi dem tai lieu ready vao count; tai lieu error bao rieng o errorCount', async () => {
    chatbotApi.listCustomChatDocuments.mockResolvedValue({
      data: {
        documents: [
          doc(1),
          { ...doc(2), status: 'error' },
          { ...doc(3), status: 'processing' },
          doc(4),
        ],
      },
    });

    render(<KnowledgeTab chatbot={CHATBOT} />);

    await waitFor(() => expect(events).toContainEqual({ chatbotId: 7, count: 2, errorCount: 1 }));
  });

  it('khong truyen initialDocuments -> chi tai tai lieu MOT lan (mac dinh la mang co dinh)', async () => {
    chatbotApi.listCustomChatDocuments.mockResolvedValue({ data: { documents: [] } });

    render(<KnowledgeTab chatbot={CHATBOT} />);
    await waitFor(() => expect(chatbotApi.listCustomChatDocuments).toHaveBeenCalled());
    // Mac dinh `= []` tao mang moi moi lan render -> effect tai lai vo han; trong 300ms se goi hang chuc lan.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(chatbotApi.listCustomChatDocuments).toHaveBeenCalledTimes(1);
  });
});
