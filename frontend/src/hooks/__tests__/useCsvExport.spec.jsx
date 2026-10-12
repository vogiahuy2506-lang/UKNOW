import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../i18n';

const { toastFn, downloadCsvFromRequest } = vi.hoisted(() => {
  const toast = vi.fn();
  toast.success = vi.fn();
  toast.error = vi.fn();
  return { toastFn: toast, downloadCsvFromRequest: vi.fn() };
});
vi.mock('react-hot-toast', () => ({ default: toastFn }));

vi.mock('../../utils/csvExportDownload', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, downloadCsvFromRequest: (...args) => downloadCsvFromRequest(...args) };
});

const { default: useCsvExport } = await import('../useCsvExport');

const wrapper = ({ children }) => <I18nProvider>{children}</I18nProvider>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useCsvExport', () => {
  it('thành công → toast.success nêu số dòng; truyền đúng request + tên dự phòng', async () => {
    downloadCsvFromRequest.mockResolvedValue({ rowCount: 1250, total: 1250, truncated: false });
    const { result } = renderHook(() => useCsvExport(), { wrapper });
    const request = Promise.resolve({});
    const factory = vi.fn(() => request);

    await act(async () => { await result.current.exportCsv(factory, 'du-phong.csv'); });

    expect(factory).toHaveBeenCalledTimes(1);
    expect(downloadCsvFromRequest).toHaveBeenCalledWith(request, 'du-phong.csv');
    expect(toastFn.success).toHaveBeenCalledWith(expect.stringContaining('1.250'));
    expect(toastFn.error).not.toHaveBeenCalled();
    expect(result.current.isExporting).toBe(false);
  });

  it('bị cắt ở trần → toast cảnh báo nêu số đã xuất, tổng và trần 20.000 (không phải toast thành công)', async () => {
    downloadCsvFromRequest.mockResolvedValue({ rowCount: 20000, total: 25000, truncated: true });
    const { result } = renderHook(() => useCsvExport(), { wrapper });

    await act(async () => { await result.current.exportCsv(() => Promise.resolve({})); });

    expect(toastFn).toHaveBeenCalledTimes(1);
    const message = toastFn.mock.calls[0][0];
    expect(message).toContain('20.000');
    expect(message).toContain('25.000');
    expect(toastFn.success).not.toHaveBeenCalled();
  });

  it('không có dòng nào khớp → thông báo rỗng, không báo "đã xuất 0 dòng"', async () => {
    downloadCsvFromRequest.mockResolvedValue({ rowCount: 0, total: 0, truncated: false });
    const { result } = renderHook(() => useCsvExport(), { wrapper });

    await act(async () => { await result.current.exportCsv(() => Promise.resolve({})); });

    expect(toastFn).toHaveBeenCalledTimes(1);
    expect(toastFn.success).not.toHaveBeenCalled();
  });

  it('lỗi → toast.error với message của server; thiếu message thì dùng câu chung', async () => {
    downloadCsvFromRequest.mockRejectedValueOnce(Object.assign(new Error('x'), { response: { data: { message: 'Không tìm thấy biểu mẫu' } } }));
    const { result } = renderHook(() => useCsvExport(), { wrapper });
    await act(async () => { await result.current.exportCsv(() => Promise.resolve({})); });
    expect(toastFn.error).toHaveBeenLastCalledWith('Không tìm thấy biểu mẫu');

    downloadCsvFromRequest.mockRejectedValueOnce(new Error('Network Error'));
    await act(async () => { await result.current.exportCsv(() => Promise.resolve({})); });
    expect(toastFn.error).toHaveBeenLastCalledWith('Không thể xuất file CSV. Vui lòng thử lại.');
    expect(result.current.isExporting).toBe(false);
  });

  it('bấm liên tiếp khi đang xuất → chỉ MỘT lệnh chạy (không tạo nhiều tệp)', async () => {
    let finish;
    downloadCsvFromRequest.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useCsvExport(), { wrapper });

    let first;
    await act(async () => {
      first = result.current.exportCsv(() => Promise.resolve({}));
      await result.current.exportCsv(() => Promise.resolve({})); // lần bấm thứ hai bị bỏ qua
    });
    expect(downloadCsvFromRequest).toHaveBeenCalledTimes(1);
    expect(result.current.isExporting).toBe(true);

    await act(async () => { finish({ rowCount: 1, total: 1, truncated: false }); await first; });
    expect(result.current.isExporting).toBe(false);
  });
});
