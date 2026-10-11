import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import toast from 'react-hot-toast';
import axios from 'axios';
import AllCustomersTab from '../AllCustomersTab';
import customerApiService from '../../services/customerApi.service';

/**
 * Tab "Tất cả khách" (PR-C3 việc 1–3): lọc gọi đúng query, badge huỷ/bounce, xuất theo bộ lọc, xoá bị chặn 409.
 * `t` trả lại khoá (kèm tham số) và PHẢI ổn định giữa các lần render.
 */
const mockT = vi.hoisted(() => (key, params) => (params ? `${key}${JSON.stringify(params)}` : key));
const mockCtx = vi.hoisted(() => ({ t: null }));
vi.mock('../../../../i18n', () => ({
  useI18n: () => mockCtx,
}));
mockCtx.t = mockT;

vi.mock('react-hot-toast', () => {
  const toast = vi.fn();
  toast.success = vi.fn();
  toast.error = vi.fn();
  return { default: toast };
});

vi.mock('../../services/customerApi.service', () => ({
  default: {
    getCustomers: vi.fn(),
    exportCustomersCsv: vi.fn(),
    deleteCustomer: vi.fn(),
    createCustomer: vi.fn(),
    updateCustomer: vi.fn(),
    bulkUpsertCustomers: vi.fn(),
  },
}));

const makeCustomer = (overrides = {}) => ({
  id: 1,
  fullName: 'Nguyễn An',
  email: 'an@example.com',
  phone: '0912345678',
  consentSource: 'manual',
  emailSubscribed: true,
  emailHardBounced: false,
  emailUnsubscribedAt: null,
  createdAt: '2026-10-01T03:00:00.000Z',
  ...overrides,
});

const listResponse = (items, pagination = {}) => ({
  data: { data: { items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1, ...pagination } } },
});

const lastListCall = () => {
  const calls = customerApiService.getCustomers.mock.calls;
  return calls[calls.length - 1];
};

describe('AllCustomersTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    customerApiService.getCustomers.mockResolvedValue(listResponse([makeCustomer()]));
  });

  describe('danh sách + bộ lọc', () => {
    it('mở tab → gọi API trang 1, limit 20, chưa có bộ lọc, kèm signal huỷ', async () => {
      render(<AllCustomersTab />);
      await screen.findByText('Nguyễn An');
      const [params, config] = lastListCall();
      expect(params).toEqual({ page: 1, limit: 20 });
      expect(config.signal).toBeInstanceOf(AbortSignal);
    });

    it('tìm kiếm gửi `search` đã trim và quay về trang 1', async () => {
      render(<AllCustomersTab />);
      await screen.findByText('Nguyễn An');
      fireEvent.change(screen.getByLabelText('customers.searchPlaceholder'), { target: { value: '  an@ex  ' } });
      fireEvent.click(screen.getByText('common.search'));
      await waitFor(() => expect(lastListCall()[0]).toEqual({ page: 1, limit: 20, search: 'an@ex' }));
    });

    it('chọn nguồn dữ liệu → consentSource; chọn trạng thái email → emailStatus; bộ lọc cộng dồn', async () => {
      render(<AllCustomersTab />);
      await screen.findByText('Nguyễn An');
      fireEvent.change(screen.getByLabelText('customers.all.source'), { target: { value: 'form_submission' } });
      await waitFor(() => expect(lastListCall()[0]).toEqual({ page: 1, limit: 20, consentSource: 'form_submission' }));
      fireEvent.change(screen.getByLabelText('customers.all.emailStatus'), { target: { value: 'unsubscribed' } });
      await waitFor(() => expect(lastListCall()[0]).toEqual({
        page: 1, limit: 20, consentSource: 'form_submission', emailStatus: 'unsubscribed',
      }));
    });

    it('đổi bộ lọc khi đang ở trang 2 → quay về trang 1', async () => {
      customerApiService.getCustomers.mockResolvedValue(listResponse([makeCustomer()], { total: 45, totalPages: 3 }));
      render(<AllCustomersTab />);
      await screen.findByText('Nguyễn An');
      fireEvent.click(screen.getByLabelText('common.next'));
      await waitFor(() => expect(lastListCall()[0].page).toBe(2));
      fireEvent.change(screen.getByLabelText('customers.all.emailStatus'), { target: { value: 'bounced' } });
      await waitFor(() => expect(lastListCall()[0]).toEqual({ page: 1, limit: 20, emailStatus: 'bounced' }));
    });

    it('đổi bộ lọc huỷ lượt cũ (signal của lượt trước bị abort)', async () => {
      render(<AllCustomersTab />);
      await screen.findByText('Nguyễn An');
      const firstSignal = customerApiService.getCustomers.mock.calls[0][1].signal;
      fireEvent.change(screen.getByLabelText('customers.all.emailStatus'), { target: { value: 'bounced' } });
      await waitFor(() => expect(customerApiService.getCustomers.mock.calls.length).toBeGreaterThan(1));
      expect(firstSignal.aborted).toBe(true);
    });

    it('API lỗi → toast lỗi tải', async () => {
      customerApiService.getCustomers.mockRejectedValueOnce(new Error('boom'));
      render(<AllCustomersTab />);
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('customers.loadFailed'));
    });

    it('lượt bị HUỶ (đổi bộ lọc giữa chừng) không bị báo là lỗi tải', async () => {
      customerApiService.getCustomers.mockRejectedValueOnce(new axios.CanceledError('canceled'));
      render(<AllCustomersTab />);
      await waitFor(() => expect(customerApiService.getCustomers).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('rỗng: chưa có khách vs không khớp bộ lọc', async () => {
      customerApiService.getCustomers.mockResolvedValue(listResponse([], { total: 0 }));
      render(<AllCustomersTab />);
      await screen.findByText('customers.all.empty');
      fireEvent.change(screen.getByLabelText('customers.all.source'), { target: { value: 'zalo' } });
      await screen.findByText('customers.all.emptyFiltered');
      fireEvent.click(screen.getByText('customers.all.clearFilters'));
      await waitFor(() => expect(lastListCall()[0]).toEqual({ page: 1, limit: 20 }));
    });
  });

  describe('badge trạng thái email', () => {
    it('đã huỷ đăng ký → badge "huỷ nhận email" kèm ngày huỷ; bounce → badge bounce; bình thường → "đang nhận"', async () => {
      customerApiService.getCustomers.mockResolvedValue(listResponse([
        makeCustomer({ id: 1, fullName: 'Khách huỷ', emailSubscribed: false, emailUnsubscribedAt: '2026-10-05T03:00:00.000Z' }),
        makeCustomer({ id: 2, fullName: 'Khách bounce', emailHardBounced: true }),
        makeCustomer({ id: 3, fullName: 'Khách thường' }),
        makeCustomer({ id: 4, fullName: 'Khách không email', email: null }),
      ]));
      render(<AllCustomersTab />);
      await screen.findByText('Khách huỷ');
      const rows = screen.getAllByTestId('customer-row');
      expect(within(rows[0]).getByTestId('badge-unsubscribed').textContent).toBe('customers.all.badgeUnsubscribed');
      expect(within(rows[0]).getByTestId('badge-unsubscribed').getAttribute('title'))
        .toContain('customers.all.badgeUnsubscribedAt');
      expect(within(rows[0]).queryByTestId('badge-bounced')).toBeNull();
      expect(within(rows[1]).getByTestId('badge-bounced').textContent).toBe('customers.all.badgeBounced');
      expect(within(rows[2]).queryByTestId('badge-unsubscribed')).toBeNull();
      expect(within(rows[2]).queryByTestId('badge-bounced')).toBeNull();
      expect(within(rows[2]).getByText('customers.all.badgeSubscribed')).toBeTruthy();
      expect(within(rows[3]).queryByText('customers.all.badgeSubscribed')).toBeNull();
    });
  });

  describe('xuất CSV', () => {
    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => 'blob:x');
      URL.revokeObjectURL = vi.fn();
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    });

    it('gọi API xuất với ĐÚNG bộ lọc đang chọn (không kèm page/limit) rồi tải file', async () => {
      customerApiService.exportCustomersCsv.mockResolvedValue({
        data: new Blob(['x']),
        headers: { 'content-disposition': 'attachment; filename="khach-hang-20261011.csv"', 'x-export-row-count': '7', 'x-export-truncated': 'false' },
      });
      render(<AllCustomersTab />);
      await screen.findByText('Nguyễn An');
      fireEvent.change(screen.getByLabelText('customers.all.source'), { target: { value: 'import' } });
      fireEvent.change(screen.getByLabelText('customers.all.emailStatus'), { target: { value: 'bounced' } });
      await waitFor(() => expect(lastListCall()[0].emailStatus).toBe('bounced'));
      fireEvent.change(screen.getByLabelText('customers.searchPlaceholder'), { target: { value: 'an' } });
      fireEvent.click(screen.getByText('common.search'));
      await waitFor(() => expect(lastListCall()[0].search).toBe('an'));

      fireEvent.click(screen.getByText('customers.exportFlow.button'));
      await waitFor(() => expect(customerApiService.exportCustomersCsv).toHaveBeenCalledTimes(1));
      expect(customerApiService.exportCustomersCsv).toHaveBeenCalledWith({
        search: 'an', consentSource: 'import', emailStatus: 'bounced',
      });
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('customers.exportFlow.success{"count":7}'));
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalled(); // không bị cắt → không có cảnh báo
    });

    it('server báo bị cắt ở 10.000 dòng → cảnh báo thu hẹp bộ lọc', async () => {
      customerApiService.exportCustomersCsv.mockResolvedValue({
        data: new Blob(['x']),
        headers: { 'x-export-row-count': '10000', 'x-export-truncated': 'true' },
      });
      render(<AllCustomersTab />);
      await screen.findByText('Nguyễn An');
      fireEvent.click(screen.getByText('customers.exportFlow.button'));
      await waitFor(() => expect(toast).toHaveBeenCalledWith('customers.exportFlow.truncated', expect.any(Object)));
    });

    it('xuất lỗi → toast lỗi, không tải file', async () => {
      customerApiService.exportCustomersCsv.mockRejectedValue(new Error('500'));
      render(<AllCustomersTab />);
      await screen.findByText('Nguyễn An');
      fireEvent.click(screen.getByText('customers.exportFlow.button'));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('customers.exportFlow.failed'));
      expect(URL.createObjectURL).not.toHaveBeenCalled();
    });
  });

  describe('xoá khách', () => {
    const clickDeleteAndConfirm = async () => {
      fireEvent.click(await screen.findByText('customers.all.delete'));
      fireEvent.click(await screen.findByText('common.delete'));
    };

    it('xoá thành công → gọi API đúng id, toast, tải lại danh sách', async () => {
      customerApiService.deleteCustomer.mockResolvedValue({ data: { success: true } });
      render(<AllCustomersTab />);
      await screen.findByText('Nguyễn An');
      const callsBefore = customerApiService.getCustomers.mock.calls.length;
      await clickDeleteAndConfirm();
      await waitFor(() => expect(customerApiService.deleteCustomer).toHaveBeenCalledWith(1));
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('customers.deleteSuccess'));
      await waitFor(() => expect(customerApiService.getCustomers.mock.calls.length).toBeGreaterThan(callsBefore));
    });

    it('409 (khách đã có đơn) → hiện ĐÚNG lý do backend trả, không phải lỗi chung', async () => {
      const reason = 'Không thể xoá khách hàng đã có 2 đơn mua/quan tâm.';
      customerApiService.deleteCustomer.mockRejectedValue({ response: { status: 409, data: { message: reason } } });
      render(<AllCustomersTab />);
      await screen.findByText('Nguyễn An');
      await clickDeleteAndConfirm();
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(reason, { duration: 8000 }));
      expect(toast.error).not.toHaveBeenCalledWith('customers.deleteFailed');
    });

    it('409 không kèm message → dùng lý do dự phòng, vẫn không phải lỗi chung', async () => {
      customerApiService.deleteCustomer.mockRejectedValue({ response: { status: 409, data: {} } });
      render(<AllCustomersTab />);
      await screen.findByText('Nguyễn An');
      await clickDeleteAndConfirm();
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('customers.delete.blocked', { duration: 8000 }));
    });

    it('lỗi khác 409 → báo lỗi xoá chung', async () => {
      customerApiService.deleteCustomer.mockRejectedValue({ response: { status: 500, data: {} } });
      render(<AllCustomersTab />);
      await screen.findByText('Nguyễn An');
      await clickDeleteAndConfirm();
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('customers.deleteFailed'));
    });
  });

  describe('thêm / sửa mở modal đúng chế độ', () => {
    it('"Thêm khách" mở form thêm; "Sửa" mở form với dữ liệu hàng', async () => {
      render(<AllCustomersTab />);
      await screen.findByText('Nguyễn An');
      fireEvent.click(screen.getByText('customers.addCustomer'));
      expect(await screen.findByText('customers.form.addTitle')).toBeTruthy();
      fireEvent.click(screen.getAllByText('common.cancel')[0]);
      await waitFor(() => expect(screen.queryByText('customers.form.addTitle')).toBeNull());

      fireEvent.click(screen.getByText('customers.all.edit'));
      expect(await screen.findByText('customers.form.editTitle')).toBeTruthy();
      expect(screen.getByLabelText('customers.form.email').value).toBe('an@example.com');
    });
  });
});
