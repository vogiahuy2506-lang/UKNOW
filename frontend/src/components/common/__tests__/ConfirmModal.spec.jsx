import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmModal from '../ConfirmModal';

describe('ConfirmModal', () => {
  it('không render gì khi isOpen={false}', () => {
    render(
      <ConfirmModal
        isOpen={false}
        title="Xác nhận xóa"
        message="Bạn có chắc chắn?"
      />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('render tiêu đề, nội dung và các nút khi isOpen={true}', () => {
    render(
      <ConfirmModal
        isOpen={true}
        title="Xóa tài khoản Zalo"
        message="Hành động này không thể hoàn tác."
        confirmText="Xóa ngay"
        cancelText="Đóng"
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Xóa tài khoản Zalo')).toBeInTheDocument();
    expect(screen.getByText('Hành động này không thể hoàn tác.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xóa ngay' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeInTheDocument();
  });

  it('gọi onConfirm khi người dùng nhấn nút xác nhận', async () => {
    const user = userEvent.setup();
    const handleConfirm = vi.fn();

    render(
      <ConfirmModal
        isOpen={true}
        title="Cảnh báo"
        message="Tiếp tục thao tác?"
        confirmText="Đồng ý"
        onConfirm={handleConfirm}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Đồng ý' }));
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it('gọi onCancel khi người dùng nhấn nút hủy', async () => {
    const user = userEvent.setup();
    const handleCancel = vi.fn();

    render(
      <ConfirmModal
        isOpen={true}
        title="Cảnh báo"
        message="Hủy bỏ?"
        cancelText="Hủy bỏ"
        onCancel={handleCancel}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Hủy bỏ' }));
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it('gọi onCancel khi nhấn phím Escape', () => {
    const handleCancel = vi.fn();

    render(
      <ConfirmModal
        isOpen={true}
        title="Thoát bằng phím Esc"
        onCancel={handleCancel}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it('khi isLoading={true}: vô hiệu hóa các nút và không gọi onCancel khi nhấn Escape', () => {
    const handleCancel = vi.fn();

    render(
      <ConfirmModal
        isOpen={true}
        title="Đang xử lý"
        isLoading={true}
        confirmText="Đang xóa"
        cancelText="Hủy"
        onCancel={handleCancel}
      />
    );

    expect(screen.getByRole('button', { name: 'Hủy' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Đang xóa' })).toBeDisabled();

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(handleCancel).not.toHaveBeenCalled();
  });

  it('hỗ trợ các biến thể màu sắc (danger, warning, primary)', () => {
    const { rerender } = render(
      <ConfirmModal
        isOpen={true}
        title="Nguy hiểm"
        variant="danger"
        confirmText="Xác nhận"
      />
    );
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toHaveClass('bg-rose-600');

    rerender(
      <ConfirmModal
        isOpen={true}
        title="Cảnh báo"
        variant="warning"
        confirmText="Xác nhận"
      />
    );
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toHaveClass('bg-amber-600');

    rerender(
      <ConfirmModal
        isOpen={true}
        title="Thông tin"
        variant="primary"
        confirmText="Xác nhận"
      />
    );
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toHaveClass('bg-primary-600');
  });
});
