/**
 * 04/10/2026 (S-21, S-22, S-14):
 *  - S-22: mỗi lần mở Cấu hình danh sách tài liệu chỉ được tải MỘT lần (trước đây hộp tải 1 lần rồi KnowledgeTab tải
 *          thêm vì initialDocuments là mảng rỗng → 2–3 lần).
 *  - S-21: không còn console.log (in cả response API) mỗi lần mở Cấu hình.
 *  - Bot lấy từ bản đệm offline (thiếu system_instruction) không được lưu đè lên bot thật.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import ChatbotConfigModal from '../ChatbotConfigModal';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';

vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: {
    updateChatbot: vi.fn(),
    listCustomChatDocuments: vi.fn(),
  },
}));
vi.mock('../../../features/auth/services/authApi.service', () => ({
  getMyProfile: vi.fn().mockResolvedValue({ data: null }),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../i18n', async () => (await import('./studioTestI18n.js')).i18nMock);
vi.mock('../../../features/chatbot/components/ChatbotReplyLimitsCard', () => ({ default: () => null }));
vi.mock('../../../features/chatbot/components/ChatbotActiveHoursCard', () => ({ default: () => null }));
vi.mock('../../../features/billing/AiHandoffAutoResumeCard', () => ({ default: () => null }));
vi.mock('../../../features/chatbot/components/AvatarUploader', () => ({ default: () => null }));

// Prop ổn định: object mới mỗi lần render làm effect nạp lại.
const CHATBOT = { id: 7, name: 'Bot thử', widget_key: 'wk_7', suggested_questions: [], system_instruction: 'Hướng dẫn' };

describe('ChatbotConfigModal — tải tài liệu một lần, không console.log', () => {
  let logSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    chatbotApi.listCustomChatDocuments.mockResolvedValue({
      data: { documents: [{ id: 1, title: 'Bảng giá', status: 'ready', source_type: 'text' }] },
    });
  });

  afterEach(() => logSpy.mockRestore());

  it('mở Cấu hình → listCustomChatDocuments chỉ được gọi đúng 1 lần, kể cả sau khi tài liệu đã về', async () => {
    render(<ChatbotConfigModal open chatbot={CHATBOT} onClose={() => {}} onUpdate={() => {}} />);

    expect(await screen.findByText('Bảng giá')).toBeTruthy();
    // Đợi thêm để mọi effect nạp lại (nếu còn) kịp chạy.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(chatbotApi.listCustomChatDocuments).toHaveBeenCalledTimes(1);
    expect(chatbotApi.listCustomChatDocuments).toHaveBeenCalledWith(7);
  });

  it('mở Cấu hình → không còn console.log nào của hộp này', async () => {
    render(<ChatbotConfigModal open chatbot={CHATBOT} onClose={() => {}} onUpdate={() => {}} />);
    await screen.findByText('Bảng giá');

    const mine = logSpy.mock.calls.filter((args) => String(args[0]).includes('[ChatbotConfigModal]'));
    expect(mine).toEqual([]);
  });
});

describe('ChatbotConfigModal — bot từ bản đệm offline không được lưu đè', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatbotApi.listCustomChatDocuments.mockResolvedValue({ data: { documents: [] } });
  });

  it('chatbot._offlineCache → bấm Lưu: báo lỗi, KHÔNG gọi PUT (kẻo ghi đè system_instruction thật bằng rỗng)', async () => {
    const onClose = vi.fn();
    const offlineBot = { id: 7, name: 'Bot đệm', _offlineCache: true };
    render(<ChatbotConfigModal open chatbot={offlineBot} onClose={onClose} onUpdate={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: /Lưu cấu hình/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error.mock.calls[0][0]).toMatch(/bản lưu tạm/);
    expect(chatbotApi.updateChatbot).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
