import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import toast from 'react-hot-toast';
import AllCustomersTab from '../AllCustomersTab';
import customerApiService from '../../services/customerApi.service';

/** PR-T1 — tag khách hàng ở tab "Tất cả khách": cột tag, lọc, gắn/bỏ hàng loạt, quản lý tag. `t` trả lại khoá. */
const mockT = vi.hoisted(() => (key, params) => (params ? `${key}${JSON.stringify(params)}` : key));
const mockCtx = vi.hoisted(() => ({ t: null }));
vi.mock('../../../../i18n', () => ({ useI18n: () => mockCtx }));
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
    getTags: vi.fn(),
    createTag: vi.fn(),
    updateTag: vi.fn(),
    deleteTag: vi.fn(),
    assignTags: vi.fn(),
    unassignTags: vi.fn(),
    getCustomerTags: vi.fn(),
    exportCustomersCsv: vi.fn(),
  },
}));

const VIP = { id: 1, name: 'VIP', color: '#ef4444', customerCount: 2 };
const LEAD = { id: 2, name: 'Lead nóng', color: null, customerCount: 1 };

const makeCustomer = (overrides = {}) => ({
  id: 1,
  fullName: 'Nguyễn An',
  email: 'an@example.com',
  phone: '0912345678',
  consentSource: 'manual',
  emailSubscribed: true,
  emailHardBounced: false,
  createdAt: '2026-10-01T03:00:00.000Z',
  tags: [],
  ...overrides,
});

const listResponse = (items) => ({
  data: { data: { items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 } } },
});

const lastListParams = () => {
  const calls = customerApiService.getCustomers.mock.calls;
  return calls[calls.length - 1][0];
};

describe('AllCustomersTab — tag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    customerApiService.getTags.mockResolvedValue({ data: { data: [VIP, LEAD] } });
    customerApiService.getCustomers.mockResolvedValue(listResponse([
      makeCustomer({ id: 1, tags: [VIP] }),
      makeCustomer({ id: 2, fullName: 'Trần Bình', email: 'binh@example.com', tags: [] }),
    ]));
    customerApiService.assignTags.mockResolvedValue({ data: { data: { assigned: 3 } } });
    customerApiService.unassignTags.mockResolvedValue({ data: { data: { removed: 1 } } });
  });

  it('hiện chip tag của từng khách; quá 3 tag thì gom thành "+n"', async () => {
    customerApiService.getCustomers.mockResolvedValue(listResponse([
      makeCustomer({
        id: 1,
        tags: [1, 2, 3, 4, 5].map((id) => ({ id, name: `T${id}`, color: null })),
      }),
    ]));
    render(<AllCustomersTab />);
    await screen.findByText('Nguyễn An');
    expect(screen.getAllByTestId('customer-tag-chip')).toHaveLength(3);
    expect(screen.getByText('customers.tags.more{"count":2}')).toBeInTheDocument();
  });

  it('lọc theo tag gửi `tagIds` dạng chuỗi phẩy (BẤT KỲ tag), quay về trang 1; bỏ lọc thì không gửi nữa', async () => {
    render(<AllCustomersTab />);
    await screen.findByText('Nguyễn An');
    expect(lastListParams()).toEqual({ page: 1, limit: 20 });

    fireEvent.click(screen.getByLabelText('customers.tags.filterLabel'));
    fireEvent.click(screen.getByLabelText(/VIP/));
    await waitFor(() => expect(lastListParams()).toEqual({ page: 1, limit: 20, tagIds: '1' }));
    fireEvent.click(screen.getByLabelText(/Lead nóng/));
    await waitFor(() => expect(lastListParams()).toEqual({ page: 1, limit: 20, tagIds: '1,2' }));

    fireEvent.click(screen.getByText('customers.all.clearFilters'));
    await waitFor(() => expect(lastListParams()).toEqual({ page: 1, limit: 20 }));
  });

  it('xuất CSV mang theo tagIds đang lọc', async () => {
    customerApiService.exportCustomersCsv.mockResolvedValue({ data: new Blob(['x']), headers: {} });
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    globalThis.URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<AllCustomersTab />);
    await screen.findByText('Nguyễn An');
    fireEvent.click(screen.getByLabelText('customers.tags.filterLabel'));
    fireEvent.click(screen.getByLabelText(/VIP/));
    await waitFor(() => expect(lastListParams().tagIds).toBe('1'));
    fireEvent.click(screen.getByText('customers.exportFlow.button'));
    await waitFor(() => expect(customerApiService.exportCustomersCsv).toHaveBeenCalledWith({ tagIds: '1' }));
  });

  it('chọn 2 khách → thanh thao tác; Gắn tag: chọn tag có sẵn + gõ tên mới → gửi đúng customerIds/tagIds/tagNames, rồi tải lại', async () => {
    render(<AllCustomersTab />);
    await screen.findByText('Nguyễn An');
    expect(screen.queryByTestId('customer-bulk-bar')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('customers.tags.selectAll'));
    const bar = screen.getByTestId('customer-bulk-bar');
    expect(within(bar).getByText('customers.tags.selectedCount{"count":2}')).toBeInTheDocument();

    const callsBefore = customerApiService.getCustomers.mock.calls.length;
    fireEvent.click(within(bar).getByText('customers.tags.assign'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText(/VIP/));
    fireEvent.change(within(dialog).getByLabelText('customers.tags.newTagLabel'), { target: { value: '  Khách   mới ' } });
    fireEvent.keyDown(within(dialog).getByLabelText('customers.tags.newTagLabel'), { key: 'Enter' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'customers.tags.assign' }));

    await waitFor(() => expect(customerApiService.assignTags).toHaveBeenCalledWith({
      customerIds: [1, 2], tagIds: [1], tagNames: ['Khách mới'],
    }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('customers.tags.assignSuccess{"assigned":3}'));
    await waitFor(() => expect(customerApiService.getCustomers.mock.calls.length).toBeGreaterThan(callsBefore));
    await waitFor(() => expect(screen.queryByTestId('customer-bulk-bar')).not.toBeInTheDocument());
  });

  it('gõ trùng tên tag có sẵn (khác hoa/thường) thì chọn tag đó, không thêm tên mới', async () => {
    render(<AllCustomersTab />);
    await screen.findByText('Nguyễn An');
    fireEvent.click(screen.getByLabelText('customers.tags.selectRow{"name":"Nguyễn An"}'));
    fireEvent.click(screen.getByText('customers.tags.assign'));
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText('customers.tags.newTagLabel');
    fireEvent.change(input, { target: { value: 'vip' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'customers.tags.assign' }));
    await waitFor(() => expect(customerApiService.assignTags).toHaveBeenCalledWith({
      customerIds: [1], tagIds: [1], tagNames: [],
    }));
  });

  it('Bỏ tag: không có ô gõ tên mới; gọi unassignTags với tag đã chọn', async () => {
    render(<AllCustomersTab />);
    await screen.findByText('Nguyễn An');
    fireEvent.click(screen.getByLabelText('customers.tags.selectAll'));
    fireEvent.click(within(screen.getByTestId('customer-bulk-bar')).getByText('customers.tags.unassign'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText('customers.tags.newTagLabel')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText(/VIP/));
    fireEvent.click(within(dialog).getByRole('button', { name: 'customers.tags.unassign' }));
    await waitFor(() => expect(customerApiService.unassignTags).toHaveBeenCalledWith({ customerIds: [1, 2], tagIds: [1] }));
  });

  it('không chọn gì thì nút xác nhận khoá', async () => {
    render(<AllCustomersTab />);
    await screen.findByText('Nguyễn An');
    fireEvent.click(screen.getByLabelText('customers.tags.selectAll'));
    fireEvent.click(within(screen.getByTestId('customer-bulk-bar')).getByText('customers.tags.assign'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'customers.tags.assign' })).toBeDisabled();
  });

  it('Quản lý tag: liệt kê kèm số khách, tạo tag mới, xoá có báo số khách đang mang', async () => {
    customerApiService.createTag.mockResolvedValue({ data: { data: { id: 3, name: 'Mới' } } });
    customerApiService.deleteTag.mockResolvedValue({ data: { data: { customerCount: 2 } } });
    render(<AllCustomersTab />);
    await screen.findByText('Nguyễn An');
    fireEvent.click(screen.getByText('customers.tags.manage'));
    const dialog = await screen.findByRole('dialog');
    const list = within(dialog).getByTestId('customer-tag-manage-list');
    expect(within(list).getByText('VIP')).toBeInTheDocument();
    expect(within(list).getByText('customers.tags.customerCount{"count":2}')).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('customers.tags.createPlaceholder'), { target: { value: ' Mới ' } });
    fireEvent.click(within(dialog).getByText('customers.tags.create'));
    await waitFor(() => expect(customerApiService.createTag).toHaveBeenCalledWith({ name: 'Mới', color: null }));

    fireEvent.click(within(list).getByLabelText('common.delete: VIP'));
    expect(await screen.findByText('customers.tags.deleteConfirm{"name":"VIP","count":2}')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('common.delete').pop());
    await waitFor(() => expect(customerApiService.deleteTag).toHaveBeenCalledWith(1));
  });

  it('trùng tên (409) hiện thông báo của backend', async () => {
    customerApiService.createTag.mockRejectedValue({ response: { status: 409, data: { message: 'Tag này đã tồn tại' } } });
    render(<AllCustomersTab />);
    await screen.findByText('Nguyễn An');
    fireEvent.click(screen.getByText('customers.tags.manage'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('customers.tags.createPlaceholder'), { target: { value: 'vip' } });
    fireEvent.click(within(dialog).getByText('customers.tags.create'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Tag này đã tồn tại'));
  });

  it('hồ sơ khách: sửa khách thấy tag của họ, thêm tag có sẵn gọi assignTags cho đúng khách', async () => {
    customerApiService.getCustomerTags.mockResolvedValue({ data: { data: [VIP, LEAD] } });
    render(<AllCustomersTab />);
    await screen.findByText('Nguyễn An');
    fireEvent.click(screen.getAllByText('customers.all.edit')[0]);
    const editor = await screen.findByTestId('customer-tag-editor');
    expect(within(editor).getByText('VIP')).toBeInTheDocument();
    fireEvent.change(within(editor).getByLabelText('customers.tags.profileAdd'), { target: { value: '2' } });
    await waitFor(() => expect(customerApiService.assignTags).toHaveBeenCalledWith({
      customerIds: [1], tagIds: [2], tagNames: [],
    }));
    await waitFor(() => expect(within(editor).getByText('Lead nóng')).toBeInTheDocument());
  });
});
