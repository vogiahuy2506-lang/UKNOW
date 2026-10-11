import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import CustomerImportModal from '../CustomerImportModal';
import customerApiService from '../../services/customerApi.service';
import { readSpreadsheetFile } from '../../utils/customerImport.helpers';

const mockT = vi.hoisted(() => (key, params) => (params ? `${key}${JSON.stringify(params)}` : key));
const mockCtx = vi.hoisted(() => ({ t: null }));
vi.mock('../../../../i18n', () => ({ useI18n: () => mockCtx }));
mockCtx.t = mockT;

vi.mock('../../services/customerApi.service', () => ({
  default: { bulkUpsertCustomers: vi.fn() },
}));

// Chỉ thay phần đọc file (cần Blob#text của trình duyệt); mọi logic nhận diện cột/chia lô là thật.
vi.mock('../../utils/customerImport.helpers', async (importOriginal) => ({
  ...(await importOriginal()),
  readSpreadsheetFile: vi.fn(),
}));

const HEADER = ['Họ tên', 'Email', 'SĐT'];
const makeMatrix = (count, { withBadRows = [] } = {}) => [
  HEADER,
  ...Array.from({ length: count }, (_, i) => (
    withBadRows.includes(i) ? ['Thiếu liên hệ', '', ''] : [`Khách ${i + 1}`, `k${i + 1}@example.com`, `09000${String(i).padStart(5, '0')}`]
  )),
];

const pickFile = async (matrix) => {
  readSpreadsheetFile.mockResolvedValue({ matrix, firstRowNumber: 1 });
  const input = screen.getByTestId('customer-import-file');
  fireEvent.change(input, { target: { files: [new File(['x'], 'khach.csv')] } });
};

describe('CustomerImportModal — nhập CSV/Excel', () => {
  const onClose = vi.fn();
  const onImported = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    customerApiService.bulkUpsertCustomers.mockImplementation(async (items) => ({
      data: { data: { inserted: items.length, updated: 0, skipped: 0, invalid: 0, errors: [] } },
    }));
  });

  it('xem trước đúng 20 dòng đầu trên tổng số, kèm số lô', async () => {
    render(<CustomerImportModal isOpen onClose={onClose} onImported={onImported} />);
    await pickFile(makeMatrix(45));
    const table = await screen.findByTestId('customer-import-preview');
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 20); // tiêu đề + 20 dòng
    expect(screen.getByText('customers.importFlow.previewTitle{"shown":20,"total":45}')).toBeTruthy();
    expect(screen.getByText('customers.importFlow.batchInfo{"batches":1,"size":2000}')).toBeTruthy();
    expect(customerApiService.bulkUpsertCustomers).not.toHaveBeenCalled(); // xem trước chưa gửi gì
  });

  it('dòng thiếu cả email lẫn SĐT: không gửi lên, nút nhập đếm đúng số dòng gửi được', async () => {
    render(<CustomerImportModal isOpen onClose={onClose} onImported={onImported} />);
    await pickFile(makeMatrix(5, { withBadRows: [1, 3] }));
    fireEvent.click(await screen.findByText('customers.importFlow.start{"count":3}'));
    await waitFor(() => expect(customerApiService.bulkUpsertCustomers).toHaveBeenCalledTimes(1));
    expect(customerApiService.bulkUpsertCustomers.mock.calls[0][0].map((i) => i.fullName))
      .toEqual(['Khách 1', 'Khách 3', 'Khách 5']);
  });

  it('2.500 dòng → chia 2 lô (2.000 + 500), mỗi lần gọi /bulk không vượt 2.000', async () => {
    render(<CustomerImportModal isOpen onClose={onClose} onImported={onImported} />);
    await pickFile(makeMatrix(2500));
    expect(await screen.findByText('customers.importFlow.batchInfo{"batches":2,"size":2000}')).toBeTruthy();
    fireEvent.click(screen.getByText('customers.importFlow.start{"count":2500}'));
    await screen.findByTestId('customer-import-summary');
    expect(customerApiService.bulkUpsertCustomers.mock.calls.map(([items]) => items.length)).toEqual([2000, 500]);
    expect(screen.getByTestId('customer-import-summary').textContent)
      .toBe('customers.importFlow.summary{"inserted":2500,"updated":0,"skipped":0,"invalid":0}');
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it('hiện lỗi THEO DÒNG từ `errors` của backend, quy ra số dòng trong file', async () => {
    customerApiService.bulkUpsertCustomers.mockResolvedValue({
      data: { data: { inserted: 1, updated: 0, skipped: 0, invalid: 2, errors: [
        { index: 0, field: 'email', message: 'Email không hợp lệ' },
        { index: 2, field: 'phone', message: 'Số điện thoại không hợp lệ' },
      ] } },
    });
    render(<CustomerImportModal isOpen onClose={onClose} onImported={onImported} />);
    await pickFile(makeMatrix(3));
    fireEvent.click(await screen.findByText('customers.importFlow.start{"count":3}'));
    const list = await screen.findByTestId('customer-import-errors');
    const lines = within(list).getAllByRole('listitem').map((li) => li.textContent);
    // dòng 2 và 4 trong file (tiêu đề là dòng 1)
    expect(lines).toEqual([
      // `t` giả trả lại chính khoá nên nhãn trường rơi về tên trường (đúng với trường lạ ngoài bản dịch)
      'customers.importFlow.errorLine{"row":2,"field":"email","message":"Email không hợp lệ"}',
      'customers.importFlow.errorLine{"row":4,"field":"phone","message":"Số điện thoại không hợp lệ"}',
    ]);
  });

  it('file không có cột email/SĐT → báo lỗi, không sang bước xem trước', async () => {
    render(<CustomerImportModal isOpen onClose={onClose} onImported={onImported} />);
    await pickFile([['Họ tên'], ['An']]);
    expect(await screen.findByText('customers.importFlow.noContactColumn')).toBeTruthy();
    expect(screen.queryByTestId('customer-import-preview')).toBeNull();
  });

  it('file không có dòng dữ liệu → báo lỗi', async () => {
    render(<CustomerImportModal isOpen onClose={onClose} onImported={onImported} />);
    await pickFile([HEADER]);
    expect(await screen.findByText('customers.importFlow.emptyFile')).toBeTruthy();
  });

  it('file quá nhiều dòng (> 20.000) → chặn trước khi gửi', async () => {
    render(<CustomerImportModal isOpen onClose={onClose} onImported={onImported} />);
    await pickFile(makeMatrix(20001));
    expect(await screen.findByText('customers.importFlow.fileTooManyRows{"total":20001,"max":20000}')).toBeTruthy();
  });

  it('đọc file lỗi → báo không đọc được', async () => {
    readSpreadsheetFile.mockRejectedValue(new Error('corrupt'));
    render(<CustomerImportModal isOpen onClose={onClose} onImported={onImported} />);
    fireEvent.change(screen.getByTestId('customer-import-file'), { target: { files: [new File(['x'], 'hong.xlsx')] } });
    expect(await screen.findByText('customers.importFlow.readFailed')).toBeTruthy();
  });

  it('lô lỗi mạng → báo lô nào lỗi, vẫn cho đóng', async () => {
    customerApiService.bulkUpsertCustomers
      .mockResolvedValueOnce({ data: { data: { inserted: 2000, updated: 0, skipped: 0, invalid: 0, errors: [] } } })
      .mockRejectedValueOnce({ response: { data: { message: 'Lỗi server' } } });
    render(<CustomerImportModal isOpen onClose={onClose} onImported={onImported} />);
    await pickFile(makeMatrix(2500));
    fireEvent.click(await screen.findByText('customers.importFlow.start{"count":2500}'));
    expect(await screen.findByText('customers.importFlow.batchFailed{"batch":2,"message":"Lỗi server"}')).toBeTruthy();
    expect(onImported).toHaveBeenCalledTimes(1); // lô 1 đã ghi → vẫn tải lại danh sách
  });
});
