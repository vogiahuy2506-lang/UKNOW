/**
 * H-12 (tab kênh chỉ hiện kênh user có, không Facebook, icon Telegram riêng, từ 5 kênh thành ô chọn),
 * H-13 (chip Chưa đọc / Cá nhân / Nhóm + Thời gian; bỏ Trạng thái và Sắp xếp).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConversationFilters, CHANNEL_OPTIONS } from '../ConversationFilters';

vi.mock('../../../i18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: 'vi' }),
}));

const BASE = { channel: '', search: '', date: 'all', kind: '', unreadOnly: false };

const renderFilters = (props = {}) => {
  const onChange = vi.fn();
  const utils = render(<ConversationFilters filters={BASE} onChange={onChange} {...props} />);
  return { onChange, ...utils };
};

describe('ConversationFilters — tab kênh (H-12)', () => {
  it('không có Facebook trong danh sách kênh; Telegram dùng icon máy bay giấy riêng (không phải tam giác cảnh báo)', () => {
    const options = CHANNEL_OPTIONS((k) => k);
    expect(options.map((o) => o.value)).not.toContain('facebook');
    const telegram = options.find((o) => o.value === 'telegram');
    expect(telegram.Icon.name || telegram.Icon.displayName || '').not.toBe('HiOutlinePaperAirplane');
    const { container } = render(<telegram.Icon />);
    // Logo Telegram của react-icons/fa là biểu tượng đặc (fill), không phải nét viền path "M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
    expect(container.querySelector('path').getAttribute('d')).not.toContain('M12 19l9 2-9-18-9 18 9-2zm0 0v-8');
  });

  it('chỉ hiện tab của kênh user có: Web chat + Zalo → 3 nút (Tất cả, Web chat, Zalo), không OA/FB/WA/TG', () => {
    renderFilters({ availableChannels: ['web', 'zalo_personal'] });

    expect(screen.getByText('inbox.channelAllShort')).toBeInTheDocument();
    expect(screen.getByText('inbox.webChatShort')).toBeInTheDocument();
    expect(screen.getByText('inbox.zaloPersonalShort')).toBeInTheDocument();
    for (const hidden of ['OA', 'FB', 'WA', 'TG']) {
      expect(screen.queryByText(hidden)).not.toBeInTheDocument();
    }
  });

  it('user chỉ có một kênh (hoặc chưa tải xong) → không hiện hàng tab kênh nào', () => {
    const { container, rerender, onChange } = renderFilters({ availableChannels: ['zalo_personal'] });
    expect(screen.queryByText('inbox.channelAllShort')).not.toBeInTheDocument();

    rerender(<ConversationFilters filters={BASE} onChange={onChange} availableChannels={[]} />);
    expect(screen.queryByText('inbox.channelAllShort')).not.toBeInTheDocument();
    expect(container.querySelectorAll('button[title]').length).toBe(0);
  });

  it('từ 5 kênh trở lên → gom thành ô chọn "Kênh", không còn hàng tab tràn ngang', () => {
    renderFilters({ availableChannels: ['web', 'zalo_personal', 'zalo_oa', 'whatsapp_baileys', 'telegram'] });

    expect(screen.getByText('inbox.channelFilterLabel:')).toBeInTheDocument();
    expect(screen.queryByText('TG')).not.toBeInTheDocument();
  });

  it('bấm tab Web chat lọc đúng kênh web, giữ các bộ lọc khác', () => {
    const { onChange } = renderFilters({ filters: { ...BASE, unreadOnly: true }, availableChannels: ['web', 'zalo_personal'] });

    fireEvent.click(screen.getByText('inbox.webChatShort'));

    expect(onChange).toHaveBeenCalledWith({ ...BASE, unreadOnly: true, channel: 'web' });
  });
});

describe('ConversationFilters — chip lọc (H-13)', () => {
  it('không còn ô "Trạng thái" và "Sắp xếp"', () => {
    renderFilters({ availableChannels: [] });

    expect(screen.queryByText('inbox.status:')).not.toBeInTheDocument();
    expect(screen.queryByText('inbox.sort:')).not.toBeInTheDocument();
  });

  it('bấm chip Chưa đọc bật/tắt unreadOnly', () => {
    const { onChange, rerender } = renderFilters();

    fireEvent.click(screen.getByText('inbox.chipUnread'));
    expect(onChange).toHaveBeenLastCalledWith({ ...BASE, unreadOnly: true });

    rerender(<ConversationFilters filters={{ ...BASE, unreadOnly: true }} onChange={onChange} />);
    expect(screen.getByText('inbox.chipUnread').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByText('inbox.chipUnread'));
    expect(onChange).toHaveBeenLastCalledWith({ ...BASE, unreadOnly: false });
  });

  it('Cá nhân và Nhóm loại trừ nhau; bấm lại chip đang bật thì bỏ lọc', () => {
    const { onChange, rerender } = renderFilters();

    fireEvent.click(screen.getByText('inbox.chipPersonal'));
    expect(onChange).toHaveBeenLastCalledWith({ ...BASE, kind: 'personal' });

    rerender(<ConversationFilters filters={{ ...BASE, kind: 'personal' }} onChange={onChange} />);
    fireEvent.click(screen.getByText('inbox.chipGroup'));
    expect(onChange).toHaveBeenLastCalledWith({ ...BASE, kind: 'group' });

    rerender(<ConversationFilters filters={{ ...BASE, kind: 'group' }} onChange={onChange} />);
    fireEvent.click(screen.getByText('inbox.chipGroup'));
    expect(onChange).toHaveBeenLastCalledWith({ ...BASE, kind: '' });
  });

  it('có nút "Xoá bộ lọc" khi đang lọc và nó trả chip + thời gian về mặc định (giữ kênh và từ khoá)', () => {
    const { onChange } = renderFilters({
      filters: { ...BASE, channel: 'web', search: 'abc', date: 'week', kind: 'group', unreadOnly: true },
    });

    fireEvent.click(screen.getByText('inbox.clearFilters'));

    expect(onChange).toHaveBeenCalledWith({ ...BASE, channel: 'web', search: 'abc', date: 'all', kind: '', unreadOnly: false });
  });

  it('không lọc gì thì không hiện nút "Xoá bộ lọc"', () => {
    renderFilters();
    expect(screen.queryByText('inbox.clearFilters')).not.toBeInTheDocument();
  });
});
