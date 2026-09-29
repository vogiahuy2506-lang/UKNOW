/**
 * ChatbotStudioPage.handleUpdateBot phải báo cột trái (studio:bot-updated), nếu không chọn lại bot vừa lưu
 * sẽ nhận object cũ từ danh sách (replies_enabled cũ → công tắc trả lời bị bật lại âm thầm).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatbotStudioPage from '../ChatbotStudioPage';

vi.mock('../ChatListSidebar', () => ({ default: () => null }));
vi.mock('../PlaygroundHeader', () => ({ default: () => null }));
vi.mock('../RightPanel', () => ({ default: () => null }));
vi.mock('../WidgetSettingsModal', () => ({ default: () => null }));
vi.mock('../ChatbotConfigModal', () => ({
  default: ({ onUpdate }) => (
    <button onClick={() => onUpdate({ id: 7, name: 'Mới', replies_enabled: false })}>luu-gia</button>
  ),
}));
vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({ default: {} }));
vi.mock('../../../features/storage/useStorageQuota', () => ({ default: () => ({}) }));
vi.mock('../../../hooks/useMediaQuery', () => ({ default: () => false }));
vi.mock('../../../i18n', () => ({ useI18n: () => ({ t: (k) => k }) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

describe('ChatbotStudioPage — handleUpdateBot', () => {
  it('phát studio:bot-updated với bot vừa lưu', () => {
    const seen = [];
    const listener = (e) => seen.push(e.detail);
    document.addEventListener('studio:bot-updated', listener);
    try {
      render(<ChatbotStudioPage />);
      fireEvent.click(screen.getByText('luu-gia'));
    } finally {
      document.removeEventListener('studio:bot-updated', listener);
    }
    expect(seen).toEqual([{ id: 7, name: 'Mới', replies_enabled: false }]);
  });
});
