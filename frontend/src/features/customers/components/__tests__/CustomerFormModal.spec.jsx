import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import CustomerFormModal from '../CustomerFormModal';
import customerApiService from '../../services/customerApi.service';

const mockT = vi.hoisted(() => (key, params) => (params ? `${key}${JSON.stringify(params)}` : key));
const mockCtx = vi.hoisted(() => ({ t: null }));
vi.mock('../../../../i18n', () => ({ useI18n: () => mockCtx }));
mockCtx.t = mockT;

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

vi.mock('../../services/customerApi.service', () => ({
  default: { createCustomer: vi.fn(), updateCustomer: vi.fn() },
}));

const fill = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('CustomerFormModal — thêm / sửa khách (payload gửi POST/PUT)', () => {
  const onClose = vi.fn();
  const onSaved = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    customerApiService.createCustomer.mockResolvedValue({ data: { success: true } });
    customerApiService.updateCustomer.mockResolvedValue({ data: { success: true } });
  });

  it('thêm: chỉ gửi trường có giá trị (đã trim), đóng modal và báo thành công', async () => {
    render(<CustomerFormModal isOpen customer={null} onClose={onClose} onSaved={onSaved} />);
    fill('customers.form.fullName', '  Lê Bình ');
    fill('customers.form.email', ' binh@example.com ');
    // phone để trống: POST từ chối phone rỗng nên KHÔNG được gửi khoá này
    fireEvent.click(screen.getByText('common.save'));

    await waitFor(() => expect(customerApiService.createCustomer).toHaveBeenCalledTimes(1));
    expect(customerApiService.createCustomer).toHaveBeenCalledWith({ fullName: 'Lê Bình', email: 'binh@example.com' });
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('customers.addSuccess');
  });

  it('thêm: không có cả email lẫn SĐT → chặn, không gọi API', async () => {
    render(<CustomerFormModal isOpen customer={null} onClose={onClose} onSaved={onSaved} />);
    fill('customers.form.fullName', 'Chỉ có tên');
    fireEvent.click(screen.getByText('common.save'));
    expect(await screen.findByText('customers.form.needContact')).toBeTruthy();
    expect(customerApiService.createCustomer).not.toHaveBeenCalled();
  });

  it('thêm: email sai định dạng → báo lỗi tại ô email, không gọi API', async () => {
    render(<CustomerFormModal isOpen customer={null} onClose={onClose} onSaved={onSaved} />);
    fill('customers.form.email', 'khong-phai-email');
    fireEvent.click(screen.getByText('common.save'));
    expect(await screen.findByText('customers.form.invalidEmail')).toBeTruthy();
    expect(customerApiService.createCustomer).not.toHaveBeenCalled();
  });

  it('chỉ có SĐT là đủ', async () => {
    render(<CustomerFormModal isOpen customer={null} onClose={onClose} onSaved={onSaved} />);
    fill('customers.form.phone', '0912345678');
    fireEvent.click(screen.getByText('common.save'));
    await waitFor(() => expect(customerApiService.createCustomer).toHaveBeenCalledWith({ phone: '0912345678' }));
  });

  it('sửa: nạp sẵn dữ liệu hàng, PUT đúng id với giá trị đã đổi', async () => {
    const customer = { id: 42, fullName: 'Cũ', email: 'cu@example.com', phone: '0911111111' };
    render(<CustomerFormModal isOpen customer={customer} onClose={onClose} onSaved={onSaved} />);
    expect(screen.getByText('customers.form.editTitle')).toBeTruthy();
    expect(screen.getByLabelText('customers.form.fullName').value).toBe('Cũ');
    fill('customers.form.fullName', 'Mới');
    fireEvent.click(screen.getByText('common.save'));

    await waitFor(() => expect(customerApiService.updateCustomer).toHaveBeenCalledTimes(1));
    expect(customerApiService.updateCustomer).toHaveBeenCalledWith(42, {
      fullName: 'Mới', email: 'cu@example.com', phone: '0911111111',
    });
    expect(customerApiService.createCustomer).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('customers.updateSuccess');
  });

  it('server từ chối → hiện message của server, modal vẫn mở', async () => {
    customerApiService.createCustomer.mockRejectedValue({ response: { data: { message: 'Email đã tồn tại' } } });
    render(<CustomerFormModal isOpen customer={null} onClose={onClose} onSaved={onSaved} />);
    fill('customers.form.email', 'trung@example.com');
    fireEvent.click(screen.getByText('common.save'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Email đã tồn tại'));
    expect(onClose).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
