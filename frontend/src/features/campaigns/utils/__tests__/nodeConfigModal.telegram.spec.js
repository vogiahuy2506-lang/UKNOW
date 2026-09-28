/**
 * PLAN_PR7_NODE_TELEGRAM_TRINH_DUNG_2026-09-28 Việc 4 — send_telegram trong nodeConfigModal.helpers.js:
 * createNodeConfigFormData (whitelist telegramAccountId/recipientKeys/steps, recipientSource mặc
 * định 'telegram_conversations') + handleNodeConfigSaveClick (kiểm tài khoản/nội dung/chat id).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createNodeConfigFormData,
  handleNodeConfigSaveClick,
} from '../nodeConfigModal.helpers';

describe('createNodeConfigFormData — send_telegram', () => {
  it('config rỗng + nodeType=send_telegram -> recipientSource mặc định telegram_conversations, steps có 1 bước rỗng', () => {
    const formData = createNodeConfigFormData({ config: {}, nodeType: 'send_telegram' });
    expect(formData.recipientSource).toBe('telegram_conversations');
    expect(formData.telegramAccountId).toBe('');
    expect(formData.recipientKeys).toBe('');
    expect(formData.steps).toEqual([{ message: '' }]);
  });

  it('nodeType khác send_telegram (vd send_email) -> recipientSource mặc định vẫn là manual (không đổi hành vi cũ)', () => {
    const formData = createNodeConfigFormData({ config: {}, nodeType: 'send_email' });
    expect(formData.recipientSource).toBe('manual');
  });

  it('không truyền nodeType (gọi kiểu cũ trước PR-7a) -> vẫn mặc định manual, không throw', () => {
    const formData = createNodeConfigFormData({ config: {} });
    expect(formData.recipientSource).toBe('manual');
  });

  it('mở lại hộp cấu hình (config đã có sẵn) -> giữ đủ telegramAccountId/recipientKeys/steps/recipientSource — KHÔNG bị whitelist làm mất cấu hình', () => {
    const config = {
      telegramAccountId: '42',
      recipientSource: 'manual',
      recipientKeys: '123456\n-1001234567890',
      steps: [{ message: 'Xin chào {{ten}}' }],
    };
    const formData = createNodeConfigFormData({ config, nodeType: 'send_telegram' });
    expect(formData.telegramAccountId).toBe('42');
    expect(formData.recipientSource).toBe('manual');
    expect(formData.recipientKeys).toBe('123456\n-1001234567890');
    expect(formData.steps).toEqual([{ message: 'Xin chào {{ten}}' }]);
  });

  it('recipientKeys lưu dạng mảng (từ backend) -> chuyển thành chuỗi nhiều dòng cho textarea', () => {
    const formData = createNodeConfigFormData({
      config: { recipientKeys: ['111', '-222'] },
      nodeType: 'send_telegram',
    });
    expect(formData.recipientKeys).toBe('111\n-222');
  });
});

describe('handleNodeConfigSaveClick — send_telegram', () => {
  const baseFormData = {
    telegramAccountId: '7',
    recipientSource: 'telegram_conversations',
    steps: [{ message: 'Xin chào {{ten}}' }],
  };

  const makeToast = () => ({ error: vi.fn(), success: vi.fn() });

  it('thiếu tài khoản -> báo lỗi, KHÔNG gọi onSave', async () => {
    const onSave = vi.fn();
    const toastNotifier = makeToast();
    await handleNodeConfigSaveClick({
      nodeType: 'send_telegram',
      formData: { ...baseFormData, telegramAccountId: '' },
      onSave,
      toastNotifier,
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(toastNotifier.error).toHaveBeenCalledWith(expect.stringContaining('tài khoản Telegram'));
  });

  it('nội dung rỗng -> báo lỗi, KHÔNG gọi onSave', async () => {
    const onSave = vi.fn();
    const toastNotifier = makeToast();
    await handleNodeConfigSaveClick({
      nodeType: 'send_telegram',
      formData: { ...baseFormData, steps: [{ message: '   ' }] },
      onSave,
      toastNotifier,
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(toastNotifier.error).toHaveBeenCalledWith(expect.stringContaining('nội dung'));
  });

  it('nội dung quá 4000 ký tự -> báo lỗi, KHÔNG gọi onSave', async () => {
    const onSave = vi.fn();
    const toastNotifier = makeToast();
    await handleNodeConfigSaveClick({
      nodeType: 'send_telegram',
      formData: { ...baseFormData, steps: [{ message: 'a'.repeat(4001) }] },
      onSave,
      toastNotifier,
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(toastNotifier.error).toHaveBeenCalledWith(expect.stringContaining('4000'));
  });

  it('nguồn nhập tay, chat id có ký tự chữ ("abc") -> báo lỗi, KHÔNG gọi onSave (backend bỏ im lặng nên phải chặn ở đây)', async () => {
    const onSave = vi.fn();
    const toastNotifier = makeToast();
    await handleNodeConfigSaveClick({
      nodeType: 'send_telegram',
      formData: { ...baseFormData, recipientSource: 'manual', recipientKeys: '123456\nabc\n-1001234' },
      onSave,
      toastNotifier,
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(toastNotifier.error).toHaveBeenCalledWith(expect.stringContaining('abc'));
  });

  it('nguồn nhập tay, danh sách rỗng -> báo lỗi, KHÔNG gọi onSave', async () => {
    const onSave = vi.fn();
    const toastNotifier = makeToast();
    await handleNodeConfigSaveClick({
      nodeType: 'send_telegram',
      formData: { ...baseFormData, recipientSource: 'manual', recipientKeys: '   ' },
      onSave,
      toastNotifier,
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('nguồn nhập tay hợp lệ (số dương + số âm) -> gọi onSave', async () => {
    const onSave = vi.fn();
    const toastNotifier = makeToast();
    await handleNodeConfigSaveClick({
      nodeType: 'send_telegram',
      formData: { ...baseFormData, recipientSource: 'manual', recipientKeys: '123456\n-1001234567890' },
      onSave,
      toastNotifier,
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(toastNotifier.error).not.toHaveBeenCalled();
  });

  it('nguồn hội thoại (mặc định), đủ tài khoản + nội dung -> gọi onSave, KHÔNG kiểm chat id', async () => {
    const onSave = vi.fn();
    const toastNotifier = makeToast();
    await handleNodeConfigSaveClick({
      nodeType: 'send_telegram',
      formData: baseFormData,
      onSave,
      toastNotifier,
    });
    expect(onSave).toHaveBeenCalledWith(baseFormData);
    expect(toastNotifier.error).not.toHaveBeenCalled();
  });
});
