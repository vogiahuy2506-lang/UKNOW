/**
 * PLAN_TG_WA_DAY_DU_2026-09-29 P4 — khối "Giới hạn gửi/ngày + Tốc độ gửi" của tài khoản Telegram/WhatsApp.
 * Ghim: hiện đã gửi hôm nay/trần; cảnh báo vàng CHỈ khi vượt ngưỡng BE trả (Telegram 150, WhatsApp 100 — FE không tự
 * giữ con số); để trống = gửi null tường minh; chọn tốc độ gửi ĐÚNG tên mức; lỗi tải thì không hiện gì.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChannelAccountSendSettings from '../ChannelAccountSendSettings';
import channelSendSettingsApiService from '../../services/channelSendSettingsApi.service';

vi.mock('../../../../i18n', () => ({
  useI18n: () => ({ t: (key, params) => (params ? `${key}|${JSON.stringify(params)}` : key) }),
}));

vi.mock('../../services/channelSendSettingsApi.service', () => ({
  default: { get: vi.fn(), update: vi.fn() },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import toast from 'react-hot-toast';

const view = (over = {}) => ({
  channel: 'telegram',
  accountKey: '12',
  userDailySendLimit: null,
  sendSpeed: 'safe',
  delayMinMs: null,
  delayMaxMs: null,
  sentToday: 0,
  warnThreshold: 150,
  dailyLimitMax: 100000,
  hardFloorMs: 2000,
  ...over,
});

const renderBlock = async (data, props = { channel: 'telegram', accountRef: 12 }) => {
  channelSendSettingsApiService.get.mockResolvedValue({ data: { data } });
  render(<ChannelAccountSendSettings {...props} />);
  await waitFor(() => expect(channelSendSettingsApiService.get).toHaveBeenCalled());
  return screen.findByText('channelSendSettings.title');
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ChannelAccountSendSettings', () => {
  it('gọi GET đúng kênh + tài khoản; hiện ô trống (không giới hạn) và đã gửi hôm nay', async () => {
    await renderBlock(view({ sentToday: 4 }));
    expect(channelSendSettingsApiService.get).toHaveBeenCalledWith('telegram', 12);
    expect(screen.getByLabelText(/channelSendSettings.dailyLimit/).value).toBe('');
    expect(screen.getByTestId('channel-send-telegram-12-sent-today').textContent)
      .toContain('channelSendSettings.sentTodayNoLimit|{"sent":"4"}');
  });

  it('có trần: hiện "đã gửi/trần"; chạm trần -> nhắc tiếp tục từ 00:00 ngày mai', async () => {
    await renderBlock(view({ userDailySendLimit: 30, sentToday: 30 }));
    expect(screen.getByLabelText(/channelSendSettings.dailyLimit/).value).toBe('30');
    expect(screen.getByTestId('channel-send-telegram-12-sent-today').textContent)
      .toContain('channelSendSettings.sentTodayWithLimit|{"sent":"30","limit":"30"}');
    expect(screen.getByText('channelSendSettings.limitReached')).toBeTruthy();
  });

  it('cảnh báo vàng CHỈ khi vượt warnThreshold do BE trả (Telegram 150): 150 không, 151 có', async () => {
    await renderBlock(view());
    const input = screen.getByLabelText(/channelSendSettings.dailyLimit/);
    fireEvent.change(input, { target: { value: '150' } });
    expect(screen.queryByTestId('channel-send-telegram-12-limit-warn')).toBeNull();
    fireEvent.change(input, { target: { value: '151' } });
    const warn = screen.getByTestId('channel-send-telegram-12-limit-warn');
    expect(warn.textContent).toContain('channelSendSettings.dailyLimitWarnTelegram|{"threshold":"150"}');
  });

  it('WhatsApp dùng ngưỡng 100 của BE và câu cảnh báo riêng của WhatsApp', async () => {
    await renderBlock(
      view({ channel: 'whatsapp', accountKey: '3-main', warnThreshold: 100, hardFloorMs: 3000 }),
      { channel: 'whatsapp', accountRef: '3-main' }
    );
    const input = screen.getByLabelText(/channelSendSettings.dailyLimit/);
    fireEvent.change(input, { target: { value: '100' } });
    expect(screen.queryByTestId('channel-send-whatsapp-3-main-limit-warn')).toBeNull();
    fireEvent.change(input, { target: { value: '101' } });
    expect(screen.getByTestId('channel-send-whatsapp-3-main-limit-warn').textContent)
      .toContain('channelSendSettings.dailyLimitWarnWhatsapp|{"threshold":"100"}');
  });

  it('Lưu trần = số -> PATCH { userDailySendLimit: số }; để trống -> null TƯỜNG MINH', async () => {
    channelSendSettingsApiService.update.mockResolvedValue({ data: { success: true } });
    await renderBlock(view({ userDailySendLimit: 50 }));
    const input = screen.getByLabelText(/channelSendSettings.dailyLimit/);
    const saveButtons = screen.getAllByText('common.save');

    fireEvent.change(input, { target: { value: '90' } });
    fireEvent.click(saveButtons[0]);
    await waitFor(() => expect(channelSendSettingsApiService.update).toHaveBeenCalledWith('telegram', 12, { userDailySendLimit: 90 }));

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(saveButtons[0]);
    await waitFor(() => expect(channelSendSettingsApiService.update).toHaveBeenLastCalledWith('telegram', 12, { userDailySendLimit: null }));
  });

  it('trần không hợp lệ (0, vượt trần) -> báo lỗi, KHÔNG gọi API', async () => {
    await renderBlock(view());
    const input = screen.getByLabelText(/channelSendSettings.dailyLimit/);
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.click(screen.getAllByText('common.save')[0]);
    fireEvent.change(input, { target: { value: '100001' } }); // vượt dailyLimitMax (ô chỉ nhận chữ số nên không còn gõ '2.5')
    fireEvent.click(screen.getAllByText('common.save')[0]);
    expect(channelSendSettingsApiService.update).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it('chọn tốc độ very_fast + Lưu -> PATCH { sendSpeed: "very_fast" } và hiện cảnh báo đỏ', async () => {
    channelSendSettingsApiService.update.mockResolvedValue({ data: { success: true } });
    await renderBlock(view());
    fireEvent.change(screen.getByLabelText(/channelSendSettings.speed/), { target: { value: 'very_fast' } });
    expect(screen.getByText('channelSendSettings.speedVeryFastWarningTelegram')).toBeTruthy();
    fireEvent.click(screen.getAllByText('common.save')[1]);
    await waitFor(() => expect(channelSendSettingsApiService.update).toHaveBeenCalledWith('telegram', 12, { sendSpeed: 'very_fast' }));
  });

  it('mức "custom" do quản trị đặt: nút Lưu tốc độ tắt cho tới khi chọn lại 1 trong 3 mức', async () => {
    await renderBlock(view({ sendSpeed: 'custom', delayMinMs: 2500, delayMaxMs: 5000 }));
    const speedSave = screen.getAllByText('common.save')[1];
    expect(speedSave.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/channelSendSettings.speed/), { target: { value: 'fast' } });
    expect(screen.getAllByText('common.save')[1].disabled).toBe(false);
  });

  it('lỗi tải (403/404) -> không hiện khối nào', async () => {
    channelSendSettingsApiService.get.mockRejectedValue({ response: { status: 403 } });
    const { container } = render(<ChannelAccountSendSettings channel="telegram" accountRef={12} />);
    await waitFor(() => expect(channelSendSettingsApiService.get).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });
});
