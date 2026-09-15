import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Notice from '../Notice';

describe('Notice', () => {
  it('mặc định (info) hiện tiêu đề và nội dung', () => {
    render(<Notice title="Tiêu đề thông tin">Nội dung</Notice>);
    expect(screen.getByText('Tiêu đề thông tin')).toBeInTheDocument();
    expect(screen.getByText('Nội dung')).toBeInTheDocument();
  });

  it('variant warning: nền/viền/chữ đúng tông amber, đủ tương phản (không dùng amber-200/300 cho chữ)', () => {
    const { container } = render(<Notice variant="warning" title="Cảnh báo">Chi tiết</Notice>);
    const wrap = container.firstChild;
    expect(wrap).toHaveClass('bg-amber-50');
    expect(wrap).toHaveClass('border-amber-200');
    expect(screen.getByText('Cảnh báo')).toHaveClass('text-amber-900');
    expect(screen.getByText('Chi tiết')).toHaveClass('text-amber-800');
  });

  it('variant danger: đổi sang tông đỏ', () => {
    const { container } = render(<Notice variant="danger" title="Lỗi">Mô tả lỗi</Notice>);
    expect(container.firstChild).toHaveClass('bg-red-50');
    expect(screen.getByText('Lỗi')).toHaveClass('text-red-900');
  });

  it('action hiện khi có, không hiện khi không truyền', () => {
    const { rerender } = render(
      <Notice title="Có action" action={<button type="button">Xem</button>} />
    );
    expect(screen.getByRole('button', { name: 'Xem' })).toBeInTheDocument();

    rerender(<Notice title="Không action" />);
    expect(screen.queryByRole('button', { name: 'Xem' })).not.toBeInTheDocument();
  });
});
