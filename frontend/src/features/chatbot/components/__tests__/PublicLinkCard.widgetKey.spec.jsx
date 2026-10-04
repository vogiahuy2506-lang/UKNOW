import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../../i18n';
import { PublicLinkCard } from '../ChatbotSettingsComponents';

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,AAAA') } }));

/**
 * A P1-5 (04/10/2026): id số tuần tự dò được → chatbot tạo từ migration 284 trở đi KHÔNG chat công khai được theo
 * `/chat/<id số>` (404). Link công khai + QR trong cấu hình chatbot phải dùng widget_key, nếu không bot mới nhận link chết.
 */
describe('PublicLinkCard — link công khai dùng widget_key, không dùng id số', () => {
  const renderCard = async (chatbot) => {
    render(
      <I18nProvider>
        <PublicLinkCard chatbot={chatbot} form={{}} />
      </I18nProvider>
    );
    // Chờ lượt dựng QR (async) xong để không rò cập nhật state ra ngoài ca test.
    await act(async () => {});
  };

  it('hiện https://founderai.biz/chat/<widget_key>', async () => {
    await renderCard({ id: 4821, widget_key: 'a1b2c3d4' });
    expect(screen.getByTitle('https://founderai.biz/chat/a1b2c3d4')).toBeTruthy();
    expect(screen.queryByTitle('https://founderai.biz/chat/4821')).toBeNull();
  });

  it('chatbot chưa có widget_key (dữ liệu cũ chưa được sinh key) → rơi về id số như trước', async () => {
    await renderCard({ id: 4821, widget_key: '' });
    expect(screen.getByTitle('https://founderai.biz/chat/4821')).toBeTruthy();
  });
});
