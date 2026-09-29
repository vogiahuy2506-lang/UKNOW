/**
 * P8a — nút "Gửi thử" WhatsApp trên trang kênh. Ghim: gọi API với khoá NGẮN của phiên (không có tiền tố chủ) và SĐT
 * đã chuẩn hoá (0… -> 84…); SĐT sai không gọi API; lỗi máy chủ hiện đúng thông báo của máy chủ.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WhatsAppTestSend from '../WhatsAppTestSend';
import whatsappSettingsApiService from '../../services/whatsappSettingsApi.service';

vi.mock('../../../../i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
}));

vi.mock('../../services/whatsappSettingsApi.service', () => ({
  default: { sendBaileysTest: vi.fn() },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import toast from 'react-hot-toast';

const open = (sessionKey = '7-shop-wa') => {
  render(<WhatsAppTestSend sessionKey={sessionKey} />);
  fireEvent.click(screen.getByText('whatsAppSettings.testSend.toggle'));
};

const fillPhone = (value) => {
  fireEvent.change(screen.getByPlaceholderText('whatsAppSettings.testSend.phonePlaceholder'), { target: { value } });
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WhatsAppTestSend', () => {
  it('mặc định chỉ có nút mở; bấm mới hiện ô nhập', () => {
    render(<WhatsAppTestSend sessionKey="7-default" />);
    expect(screen.queryByTestId('whatsapp-test-send')).toBeNull();
    fireEvent.click(screen.getByText('whatsAppSettings.testSend.toggle'));
    expect(screen.getByTestId('whatsapp-test-send')).toBeTruthy();
  });

  it('gửi: khoá phiên NGẮN + SĐT 84… + nội dung mặc định khi để trống', async () => {
    whatsappSettingsApiService.sendBaileysTest.mockResolvedValue({ data: { success: true } });
    open('7-shop-wa');
    fillPhone('0912 345 678');
    fireEvent.click(screen.getByText('whatsAppSettings.testSend.send'));
    await waitFor(() => expect(whatsappSettingsApiService.sendBaileysTest).toHaveBeenCalledTimes(1));
    expect(whatsappSettingsApiService.sendBaileysTest).toHaveBeenCalledWith(
      'shop-wa',
      '84912345678',
      'whatsAppSettings.testSend.defaultText',
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('whatsAppSettings.testSend.success'));
  });

  it('SĐT sai định dạng hoặc nhiều số -> báo lỗi, KHÔNG gọi API', () => {
    open();
    fillPhone('12ab');
    fireEvent.click(screen.getByText('whatsAppSettings.testSend.send'));
    expect(screen.getByRole('alert').textContent).toBe('whatsAppSettings.testSend.invalidPhone');
    fillPhone('0912345678, 0987654321');
    fireEvent.click(screen.getByText('whatsAppSettings.testSend.send'));
    expect(whatsappSettingsApiService.sendBaileysTest).not.toHaveBeenCalled();
  });

  it('máy chủ từ chối (vd quá 10 lần/giờ) -> hiện đúng thông báo của máy chủ', async () => {
    whatsappSettingsApiService.sendBaileysTest.mockRejectedValue({
      response: { data: { message: 'Bạn đã đạt giới hạn 10 lần gửi thử WhatsApp trong 1 giờ.' } },
    });
    open();
    fillPhone('84912345678');
    fireEvent.click(screen.getByText('whatsAppSettings.testSend.send'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Bạn đã đạt giới hạn 10 lần gửi thử WhatsApp trong 1 giờ.'));
  });
});
