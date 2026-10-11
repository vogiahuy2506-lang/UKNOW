/**
 * H-12 (không Facebook, icon Telegram riêng, từ 5 kênh thành ô chọn) và sửa 11/10: bốn kênh Web / Zalo / WhatsApp /
 * Telegram LUÔN có tab, kênh chưa nối chỉ đánh dấu "Chưa kết nối" (không giấu); Zalo OA chỉ hiện khi tài khoản còn kênh đó.
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

  it('bốn kênh cố định luôn hiện: có Web chat + Zalo thì vẫn thấy cả WA và TG, không OA/FB, không ô chọn', () => {
    renderFilters({ availableChannels: ['web', 'zalo_personal'] });

    const tabs = screen.getAllByRole('button').filter((b) => b.hasAttribute('title'));
    expect(tabs.map((b) => b.textContent)).toEqual([
      'inbox.channelAllShort', 'inbox.webChatShort', 'inbox.zaloPersonalShort', 'WA', 'TG',
    ]);
    for (const hidden of ['OA', 'FB']) {
      expect(screen.queryByText(hidden)).not.toBeInTheDocument();
    }
    expect(screen.queryByText('inbox.channelFilterLabel:')).not.toBeInTheDocument();
  });

  it('chưa có kênh nào (hoặc server chưa trả) vẫn hiện đủ hàng tab: Tất cả + 4 kênh cố định', () => {
    const { container } = renderFilters({ availableChannels: [] });

    expect(container.querySelectorAll('button[title]').length).toBe(5);
    expect(screen.getByText('TG')).toBeInTheDocument();
    expect(screen.getByText('inbox.webChatShort')).toBeInTheDocument();
  });

  it('Zalo OA chỉ hiện khi tài khoản còn kênh đó; có OA → 5 kênh → gom thành ô chọn "Kênh"', () => {
    const { rerender, onChange } = renderFilters({ availableChannels: ['telegram'] });
    expect(screen.queryByText('OA')).not.toBeInTheDocument();
    expect(screen.queryByText('inbox.channelFilterLabel:')).not.toBeInTheDocument();

    rerender(<ConversationFilters filters={BASE} onChange={onChange} availableChannels={['zalo_oa']} />);
    expect(screen.getByText('inbox.channelFilterLabel:')).toBeInTheDocument();
    fireEvent.click(screen.getByText('inbox.channelFilterLabel:'));
    expect(screen.getByText('inbox.zaloOA')).toBeInTheDocument();
  });

  it('từ 5 kênh trở lên → gom thành ô chọn "Kênh", không còn hàng tab tràn ngang', () => {
    renderFilters({ availableChannels: ['web', 'zalo_personal', 'zalo_oa', 'whatsapp_baileys', 'telegram'] });

    expect(screen.getByText('inbox.channelFilterLabel:')).toBeInTheDocument();
    expect(screen.queryByText('TG')).not.toBeInTheDocument();
  });

  it('kênh chưa nối: nút giữ nguyên nhưng có tooltip "Chưa kết nối" + chấm xám có nhãn; kênh đã nối và "Tất cả" thì không', () => {
    renderFilters({ availableChannels: ['web', 'zalo_personal'] });

    // chưa nối: WhatsApp, Telegram
    expect(screen.getByTitle('WhatsApp — inbox.channelNotConnectedBadge')).toBeInTheDocument();
    expect(screen.getByTitle('Telegram — inbox.channelNotConnectedBadge')).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'inbox.channelNotConnectedBadge' })).toHaveLength(2);
    // đã nối + "Tất cả": tooltip trơn, không chấm
    expect(screen.getByTitle('inbox.webChat').querySelector('[role="img"]')).toBeNull();
    expect(screen.getByTitle('inbox.zaloPersonal').querySelector('[role="img"]')).toBeNull();
    expect(screen.getByTitle('inbox.allChannels').querySelector('[role="img"]')).toBeNull();
  });

  it('chưa biết kênh nào đã nối (channelsLoaded=false) → KHÔNG đánh dấu "Chưa kết nối" ở tab nào', () => {
    const { container } = renderFilters({ availableChannels: [], channelsLoaded: false });

    expect(container.querySelectorAll('button[title]').length).toBe(5);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByTitle(/channelNotConnectedBadge/)).not.toBeInTheDocument();
  });

  it('bấm tab kênh chưa nối vẫn đổi bộ lọc sang kênh đó (để trang hiện lời mời kết nối)', () => {
    const { onChange } = renderFilters({ availableChannels: ['web'] });

    fireEvent.click(screen.getByText('TG'));

    expect(onChange).toHaveBeenCalledWith({ ...BASE, channel: 'telegram' });
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
