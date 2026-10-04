/**
 * H-16 — gửi lỗi (hết hạn mức, rớt mạng) thì ô nhập GIỮ NGUYÊN nội dung; gửi được mới xoá.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReplyInput from '../ReplyInput';

vi.mock('../../../i18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: 'vi' }),
}));
vi.mock('../../storage/useStorageQuota', () => ({ default: () => ({ usage: null }) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const type = (text) => {
  const box = screen.getByPlaceholderText('inbox.typeMessage');
  fireEvent.change(box, { target: { value: text } });
  return box;
};

describe('ReplyInput — giữ nội dung khi gửi lỗi (H-16)', () => {
  it('onSend ném lỗi → nội dung còn nguyên trong ô nhập', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSend = vi.fn().mockRejectedValue(new Error('403 hết hạn mức'));
    render(<ReplyInput onSend={onSend} />);
    const box = type('Dạ em gửi báo giá ạ');

    fireEvent.keyDown(box, { key: 'Enter' });

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(box.value).toBe('Dạ em gửi báo giá ạ'));
  });

  it('onSend thành công → ô nhập được xoá', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<ReplyInput onSend={onSend} />);
    const box = type('xin chào');

    fireEvent.keyDown(box, { key: 'Enter' });

    await waitFor(() => expect(box.value).toBe(''));
    expect(onSend).toHaveBeenCalledWith('xin chào', undefined, []);
  });
});
