import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleNodeSheetConnectionCheck } from '../nodeConfigModal.helpers';

/**
 * PLAN_TU_NHAN_TEN_SHEET_DAU_TIEN_2026-09-15, Việc 3: bấm "Kiểm tra kết nối" trên Builder cũng
 * tự điền ô Tên Sheet khi đang trống, dùng `worksheetNames[0]` mà backend `check` trả thêm.
 */
describe('handleNodeSheetConnectionCheck — tự điền tên tab đầu tiên khi ô Tên Sheet trống', () => {
  let setFormData;
  let toastNotifier;

  beforeEach(() => {
    setFormData = vi.fn();
    toastNotifier = { success: vi.fn(), error: vi.fn() };
  });

  it('ô Tên Sheet đang trống + check trả worksheetNames -> điền sheetName + sheetNameSource auto', async () => {
    const onCheckSheetConnection = vi.fn().mockResolvedValue({
      columns: ['Email', 'Tên'],
      worksheetNames: ['Khách tháng 9', 'Cũ'],
    });

    await handleNodeSheetConnectionCheck({
      onCheckSheetConnection,
      formData: { sheetUrl: 'https://docs.google.com/spreadsheets/d/abc/edit', sheetName: '' },
      setFormData,
      setIsCheckingSheet: vi.fn(),
      toastNotifier,
    });

    expect(setFormData).toHaveBeenCalledTimes(1);
    const updater = setFormData.mock.calls[0][0];
    const next = updater({ sheetName: '' });
    expect(next.columns).toEqual(['Email', 'Tên']);
    expect(next.sheetName).toBe('Khách tháng 9');
    expect(next.sheetNameSource).toBe('auto');
  });

  it('ô Tên Sheet ĐÃ CÓ tên -> không đổi, không gắn cờ auto dù check trả worksheetNames', async () => {
    const onCheckSheetConnection = vi.fn().mockResolvedValue({
      columns: ['Email'],
      worksheetNames: ['Tab khác'],
    });

    await handleNodeSheetConnectionCheck({
      onCheckSheetConnection,
      formData: { sheetUrl: 'https://docs.google.com/spreadsheets/d/abc/edit', sheetName: 'Đã đặt tay' },
      setFormData,
      setIsCheckingSheet: vi.fn(),
      toastNotifier,
    });

    const updater = setFormData.mock.calls[0][0];
    const next = updater({ sheetName: 'Đã đặt tay' });
    expect(next.sheetName).toBe('Đã đặt tay');
    expect(next.sheetNameSource).toBeUndefined();
  });

  it('check không trả worksheetNames (mảng rỗng/undefined) -> không điền, không throw', async () => {
    const onCheckSheetConnection = vi.fn().mockResolvedValue({ columns: ['Email'] });

    await handleNodeSheetConnectionCheck({
      onCheckSheetConnection,
      formData: { sheetUrl: 'https://docs.google.com/spreadsheets/d/abc/edit', sheetName: '' },
      setFormData,
      setIsCheckingSheet: vi.fn(),
      toastNotifier,
    });

    const updater = setFormData.mock.calls[0][0];
    const next = updater({ sheetName: '' });
    expect(next.sheetName).toBe('');
    expect(next.sheetNameSource).toBeUndefined();
  });
});
