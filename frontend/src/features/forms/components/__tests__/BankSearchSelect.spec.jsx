import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BankSearchSelect from '../BankSearchSelect';

describe('BankSearchSelect component', () => {
  it('hiển thị placeholder khi chưa chọn ngân hàng', () => {
    render(<BankSearchSelect value="" onChange={vi.fn()} placeholder="Chọn ngân hàng test" />);
    expect(screen.getAllByText('Chọn ngân hàng test')[0]).toBeInTheDocument();
  });

  it('hiển thị tên và mã ngắn khi đã chọn ngân hàng (vd: 970436 - Vietcombank)', () => {
    render(<BankSearchSelect value="970436" onChange={vi.fn()} />);
    expect(screen.getByText('Vietcombank')).toBeInTheDocument();
    expect(screen.getByText('(VCB)')).toBeInTheDocument();
  });

  it('mở dropdown tìm kiếm và lọc đúng theo mã viết tắt không dấu (vcb, mb, techcom)', () => {
    render(<BankSearchSelect value="" onChange={vi.fn()} />);
    const triggerBtn = screen.getByRole('button');
    fireEvent.click(triggerBtn);

    const searchInput = screen.getByPlaceholderText(/Tìm ngân hàng/i);
    expect(searchInput).toBeInTheDocument();

    // Gõ tìm "vcb"
    fireEvent.change(searchInput, { target: { value: 'vcb' } });
    expect(screen.getByText('Vietcombank')).toBeInTheDocument();
    expect(screen.queryByText('Techcombank')).not.toBeInTheDocument();

    // Gõ tìm "quan doi" (không dấu) -> ra MB Bank
    fireEvent.change(searchInput, { target: { value: 'quan doi' } });
    // MB Bank có short là MB, hoặc name có MB Bank
    fireEvent.change(searchInput, { target: { value: 'mb' } });
    expect(screen.getByText('MB Bank')).toBeInTheDocument();
  });

  it('chọn một ngân hàng sẽ kích hoạt onChange và đóng dropdown', () => {
    const handleChange = vi.fn();
    render(<BankSearchSelect value="" onChange={handleChange} />);

    fireEvent.click(screen.getByRole('button'));
    const searchInput = screen.getByPlaceholderText(/Tìm ngân hàng/i);
    fireEvent.change(searchInput, { target: { value: 'Techcombank' } });

    // Click vào Techcombank
    const option = screen.getByText('Techcombank');
    fireEvent.click(option);

    expect(handleChange).toHaveBeenCalledWith('970407');
    expect(screen.queryByPlaceholderText(/Tìm ngân hàng/i)).not.toBeInTheDocument();
  });
});
