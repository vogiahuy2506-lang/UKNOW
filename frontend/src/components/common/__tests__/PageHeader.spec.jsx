import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HiOutlineChat } from 'react-icons/hi';
import PageHeader from '../PageHeader';

describe('PageHeader', () => {
  it('hiện tiêu đề và mô tả', () => {
    render(<PageHeader title="Chương trình đối tác" subtitle="Mô tả trang" />);
    expect(screen.getByRole('heading', { name: 'Chương trình đối tác' })).toBeInTheDocument();
    expect(screen.getByText('Mô tả trang')).toBeInTheDocument();
  });

  it('không có subtitle thì không render đoạn mô tả', () => {
    render(<PageHeader title="Không mô tả" />);
    expect(screen.queryByText('Mô tả trang')).not.toBeInTheDocument();
  });

  it('có icon thì vẽ icon cam cạnh tiêu đề', () => {
    const { container } = render(<PageHeader title="Có icon" icon={HiOutlineChat} />);
    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass('text-orange-500');
  });

  it('actions hiện khi có, không hiện khi không truyền', () => {
    const { rerender } = render(
      <PageHeader title="Có actions" actions={<button type="button">Hành động</button>} />
    );
    expect(screen.getByRole('button', { name: 'Hành động' })).toBeInTheDocument();

    rerender(<PageHeader title="Không actions" />);
    expect(screen.queryByRole('button', { name: 'Hành động' })).not.toBeInTheDocument();
  });

  it('gọi onBack khi bấm nút quay lại', () => {
    const handleBack = vi.fn();
    render(<PageHeader title="Có quay lại" onBack={handleBack} />);
    const backBtn = screen.getByRole('button', { name: 'Quay lại' });
    expect(backBtn).toBeInTheDocument();
    backBtn.click();
    expect(handleBack).toHaveBeenCalledTimes(1);
  });

  it('backLabel đổi nhãn nút quay lại (trang truyền t(...) để theo ngôn ngữ)', () => {
    render(<PageHeader title="Has back" onBack={() => {}} backLabel="Back" />);
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quay lại' })).not.toBeInTheDocument();
  });
});
