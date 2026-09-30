import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HiOutlineAcademicCap } from 'react-icons/hi';
import PageContainer from '../PageContainer';

describe('PageContainer', () => {
  it('render nội dung con', () => {
    render(
      <PageContainer>
        <div data-testid="child-content">Nội dung trang</div>
      </PageContainer>
    );
    expect(screen.getByTestId('child-content')).toHaveTextContent('Nội dung trang');
  });

  it('tự dựng PageHeader khi có tiêu đề và icon', () => {
    const { container } = render(
      <PageContainer
        title="Quản lý khoá học"
        subtitle="Mô tả khoá học"
        icon={HiOutlineAcademicCap}
      >
        <div>Body</div>
      </PageContainer>
    );
    expect(screen.getByRole('heading', { name: 'Quản lý khoá học' })).toBeInTheDocument();
    expect(screen.getByText('Mô tả khoá học')).toBeInTheDocument();
    expect(container.querySelector('svg.text-orange-500')).toBeInTheDocument();
  });

  it('hỗ trợ nút hành động và nút quay lại qua PageHeader', () => {
    const handleBack = vi.fn();
    render(
      <PageContainer
        title="Trang chi tiết"
        onBack={handleBack}
        actions={<button type="button">Tạo mới</button>}
      >
        <div>Body</div>
      </PageContainer>
    );
    expect(screen.getByRole('button', { name: 'Tạo mới' })).toBeInTheDocument();
    const backBtn = screen.getByRole('button', { name: 'Quay lại' });
    expect(backBtn).toBeInTheDocument();
    backBtn.click();
    expect(handleBack).toHaveBeenCalledTimes(1);
  });

  it('không truyền title/icon/onBack thì không render PageHeader', () => {
    render(
      <PageContainer>
        <p>Chỉ có nội dung</p>
      </PageContainer>
    );
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('Chỉ có nội dung')).toBeInTheDocument();
  });
});
