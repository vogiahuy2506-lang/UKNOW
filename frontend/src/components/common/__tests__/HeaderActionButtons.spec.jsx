import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HiOutlineQrcode } from 'react-icons/hi';
import { HeaderActions, PrimaryActionButton, RefreshButton } from '../HeaderActionButtons';

vi.mock('../../../i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
}));

describe('HeaderActionButtons', () => {
  it('RefreshButton: nhãn mặc định là common.refresh, bấm gọi onClick', () => {
    const onClick = vi.fn();
    render(<RefreshButton onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'common.refresh' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('RefreshButton: loading khoá nút, icon quay, NHÃN GIỮ NGUYÊN (nút không đổi bề rộng)', () => {
    const { container } = render(<RefreshButton onClick={() => {}} loading />);
    const btn = screen.getByRole('button', { name: 'common.refresh' });
    expect(btn).toBeDisabled();
    expect(container.querySelector('svg')).toHaveClass('animate-spin');
  });

  it('RefreshButton: không loading thì icon không quay; label tuỳ biến thay nhãn mặc định', () => {
    const { container } = render(<RefreshButton label="Tải lại" />);
    expect(screen.getByRole('button', { name: 'Tải lại' })).not.toBeDisabled();
    expect(container.querySelector('svg')).not.toHaveClass('animate-spin');
  });

  it('PrimaryActionButton: vẽ icon + nhãn, chuyển disabled/title/onClick xuống thẻ button, mặc định type=button', () => {
    const onClick = vi.fn();
    const { container } = render(
      <PrimaryActionButton icon={HiOutlineQrcode} onClick={onClick} disabled title="chua san sang">
        Quét QR
      </PrimaryActionButton>
    );
    const btn = screen.getByRole('button', { name: 'Quét QR' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'chua san sang');
    expect(btn).toHaveAttribute('type', 'button');
    expect(container.querySelector('svg')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('PrimaryActionButton: có viền (trong suốt) như RefreshButton để hai nút cao bằng nhau', () => {
    render(
      <>
        <RefreshButton />
        <PrimaryActionButton>Thêm</PrimaryActionButton>
      </>
    );
    expect(screen.getByRole('button', { name: 'common.refresh' })).toHaveClass('border');
    expect(screen.getByRole('button', { name: 'Thêm' })).toHaveClass('border', 'border-transparent');
  });

  it('PrimaryActionButton: bật thì bấm được', () => {
    const onClick = vi.fn();
    render(<PrimaryActionButton onClick={onClick}>Thêm</PrimaryActionButton>);
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('HeaderActions: bọc con, cho xuống dòng khi hẹp', () => {
    const { container } = render(
      <HeaderActions>
        <button type="button">A</button>
        <button type="button">B</button>
      </HeaderActions>
    );
    expect(container.firstChild).toHaveClass('flex', 'flex-wrap');
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
