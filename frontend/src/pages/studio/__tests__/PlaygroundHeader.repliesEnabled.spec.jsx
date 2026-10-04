/**
 * PlaygroundHeader: huy hiệu trạng thái theo replies_enabled (công tắc trả lời), không theo is_active (xoá mềm).
 *
 * 04/10/2026 (S-05): "Online/Offline" nói quá — 63/63 bot hiện "Online" dù 45/63 chưa từng ra khách. Nay huy hiệu nói đúng
 * điều nó đo: "Đang bật trả lời" / "Đã tắt trả lời"; bot bị khoá sau hạ gói hiện "Tạm khoá (vượt gói)". Dưới tên bot có dòng
 * tóm tắt triển khai ("Chưa gắn kênh nào" hoặc "Đang chạy: Web · Zalo cá nhân (2)").
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PlaygroundHeader from '../PlaygroundHeader';

vi.mock('../../../i18n', async () => (await import('./studioTestI18n.js')).i18nMock);

describe('PlaygroundHeader — trạng thái trả lời', () => {
  it('replies_enabled:false → "Đã tắt trả lời" (không còn Offline)', () => {
    render(<PlaygroundHeader bot={{ id: 1, name: 'Bot', is_active: true, replies_enabled: false }} />);
    expect(screen.getByText('Đã tắt trả lời')).toBeInTheDocument();
    expect(screen.queryByText('Đang bật trả lời')).toBeNull();
    expect(screen.queryByText('Offline')).toBeNull();
  });

  it('replies_enabled:true hoặc thiếu → "Đang bật trả lời" (không còn Online)', () => {
    const { unmount } = render(<PlaygroundHeader bot={{ id: 1, name: 'Bot', replies_enabled: true }} />);
    expect(screen.getByText('Đang bật trả lời')).toBeInTheDocument();
    expect(screen.queryByText('Online')).toBeNull();
    unmount();
    render(<PlaygroundHeader bot={{ id: 1, name: 'Bot' }} />);
    expect(screen.getByText('Đang bật trả lời')).toBeInTheDocument();
  });

  it('bot bị khoá sau hạ gói (is_locked) → "Tạm khoá (vượt gói)", dù công tắc trả lời đang bật', () => {
    render(<PlaygroundHeader bot={{ id: 1, name: 'Bot', replies_enabled: true, is_locked: true }} />);
    expect(screen.getByText('Tạm khoá (vượt gói)')).toBeInTheDocument();
    expect(screen.queryByText('Đang bật trả lời')).toBeNull();
  });
});

describe('PlaygroundHeader — tóm tắt triển khai (S-05)', () => {
  const summary = () => screen.getByTestId('bot-deploy-summary').textContent;

  it('chưa gắn kênh nào, chưa có hội thoại web → "Chưa gắn kênh nào"', () => {
    render(<PlaygroundHeader bot={{ id: 1, name: 'Bot' }} />);
    expect(summary()).toBe('Chưa gắn kênh nào');
  });

  it('có hội thoại web + 2 Zalo cá nhân + 1 Telegram → "Đang chạy: Web · Zalo cá nhân (2) · Telegram"', () => {
    render(
      <PlaygroundHeader
        bot={{ id: 1, name: 'Bot', web_active: true, zalo_personal_count: 2, telegram_count: 1, whatsapp_count: 0 }}
      />
    );
    expect(summary()).toBe('Đang chạy: Web · Zalo cá nhân (2) · Telegram');
  });

  it('chỉ WhatsApp → "Đang chạy: WhatsApp"', () => {
    render(<PlaygroundHeader bot={{ id: 1, name: 'Bot', whatsapp_count: 1 }} />);
    expect(summary()).toBe('Đang chạy: WhatsApp');
  });
});

describe('PlaygroundHeader — nút hành động (S-02, S-06)', () => {
  it('có nút "Cuộc trò chuyện mới" (luôn hiện khi cha truyền onNewChat) và "Cấu hình" ở mọi cỡ màn hình', () => {
    const onNewChat = vi.fn();
    const onConfig = vi.fn();
    render(<PlaygroundHeader bot={{ id: 1, name: 'Bot' }} onNewChat={onNewChat} onConfig={onConfig} />);

    fireEvent.click(screen.getByTitle('Bắt đầu một cuộc trò chuyện thử mới'));
    expect(onNewChat).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTitle('Mở cấu hình chatbot'));
    expect(onConfig).toHaveBeenCalledTimes(1);
  });

  it('có nút "Triển khai" khi cha truyền onOpenDeploy (màn 1024–1279px dùng ngăn kéo)', () => {
    const onOpenDeploy = vi.fn();
    render(<PlaygroundHeader bot={{ id: 1, name: 'Bot' }} onOpenDeploy={onOpenDeploy} />);

    fireEvent.click(screen.getByTitle('Triển khai'));
    expect(onOpenDeploy).toHaveBeenCalledTimes(1);
  });

  it('không còn nút "Chia sẻ" / menu "..." chết ở đầu khung chat', () => {
    render(<PlaygroundHeader bot={{ id: 1, name: 'Bot' }} onConfig={() => {}} />);
    expect(screen.queryByTitle('Chia sẻ chatbot')).toBeNull();
    expect(screen.queryByTitle('Tùy chọn')).toBeNull();
  });
});
