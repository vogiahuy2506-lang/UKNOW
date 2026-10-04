import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConversationFilters, CHANNEL_OPTIONS } from '../ConversationFilters';
import ReplyInput from '../ReplyInput';
import {
  channelSupportsInboxAttachments,
  getExternalChannelName,
} from '../utils/channelInfo';

vi.mock('../../../i18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: 'vi' }),
}));

vi.mock('../../storage/useStorageQuota', () => ({
  default: () => ({ usage: null }),
}));

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

describe('Hộp thư — kênh Telegram (P1 PLAN_TG_WA_DAY_DU)', () => {
  it('có tab Telegram (TG) khi user CÓ kênh Telegram và bấm vào lọc đúng kênh telegram', () => {
    expect(CHANNEL_OPTIONS((k) => k).map((c) => c.value)).toContain('telegram');
    const onChange = vi.fn();
    render(
      <ConversationFilters
        filters={{ channel: '', date: 'all', kind: '', unreadOnly: false }}
        availableChannels={['web', 'zalo_personal', 'telegram']}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByText('TG'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ channel: 'telegram' }));
  });

  it('nhãn kênh ngoài: telegram → "Telegram", whatsapp_baileys → "WhatsApp", kênh lạ giữ mã', () => {
    expect(getExternalChannelName('telegram')).toBe('Telegram');
    expect(getExternalChannelName('whatsapp_baileys')).toBe('WhatsApp');
    expect(getExternalChannelName('zalo_oa')).toBe('Zalo OA');
    expect(getExternalChannelName('abc')).toBe('abc');
  });

  it('P5: Telegram và WhatsApp QR ĐÃ hỗ trợ tệp đính kèm (như các kênh khác)', () => {
    expect(channelSupportsInboxAttachments('telegram')).toBe(true);
    expect(channelSupportsInboxAttachments('whatsapp_baileys')).toBe(true);
    expect(channelSupportsInboxAttachments('zalo_oa')).toBe(true);
    expect(channelSupportsInboxAttachments('zalo_personal')).toBe(true);
    expect(channelSupportsInboxAttachments(undefined)).toBe(true);
  });

  it('ReplyInput allowAttachments=false → ẩn nút đính kèm; mặc định vẫn hiện', () => {
    const { rerender } = render(<ReplyInput onSend={vi.fn()} allowAttachments={false} />);
    expect(screen.queryByTitle('inbox.attachments')).not.toBeInTheDocument();
    rerender(<ReplyInput onSend={vi.fn()} />);
    expect(screen.getByTitle('inbox.attachments')).toBeInTheDocument();
  });
});
