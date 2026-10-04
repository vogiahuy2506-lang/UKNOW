/**
 * Rà soát C P2-7 — thẻ chọn landing của nguồn "Đăng ký từ Landing Page".
 * Hai đường trả lời RÕ RÀNG, không có mặc định ngầm: chọn ≥ 1 trang rồi bấm "Dùng N landing", hoặc nút riêng "Gửi cho TẤT CẢ landing".
 * Dữ liệu `data` dựng đúng hình dạng thẻ backend trả (aiCampaignWizard.service.js buildLandingLeadsQuestion).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LandingLeadsPickerCard } from '../AiChatbotWizardCards';
import viDict from '../../../../i18n/vi';

vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const t = (key, params = {}) => {
  let current = viDict;
  for (const part of key.split('.')) current = current?.[part];
  const text = typeof current === 'string' ? current : key;
  return text.replace(/\{(\w+)\}/g, (_, name) => (params[name] !== undefined ? String(params[name]) : `{${name}}`));
};

const DATA = {
  totalLeads: 205,
  maxSelect: 2,
  landings: [
    { slug: 'khoa-ielts', title: 'Khoá IELTS', isPublished: true, formId: null, leadCount: 120, formConsentedCount: 0 },
    { slug: 'khoa-toeic', title: 'Khoá TOEIC', isPublished: false, formId: null, leadCount: 80, formConsentedCount: 0 },
    { slug: 'dat-lich', title: 'Đặt lịch tư vấn', isPublished: true, formId: 3, leadCount: 0, formConsentedCount: 15 },
  ],
};

const renderCard = (props = {}) => {
  const onSubmit = vi.fn();
  render(<LandingLeadsPickerCard data={DATA} onSubmit={onSubmit} t={t} {...props} />);
  return onSubmit;
};

describe('LandingLeadsPickerCard', () => {
  it('liệt kê tên + slug + số lead; landing dùng Biểu mẫu hiện số người đã đồng ý; trang chưa xuất bản có nhãn', () => {
    renderCard();

    expect(screen.getByText('Khoá IELTS')).toBeInTheDocument();
    expect(screen.getByText('120 lead')).toBeInTheDocument();
    expect(screen.getByText('khoa-ielts')).toBeInTheDocument();
    expect(screen.getByText('15 người đã đồng ý (Biểu mẫu)')).toBeInTheDocument();
    expect(screen.getByText('khoa-toeic · chưa xuất bản')).toBeInTheDocument();
  });

  it('chưa chọn trang nào → nút "Dùng N landing" bị khoá (không có đường đi ngầm)', () => {
    const onSubmit = renderCard();

    const useButton = screen.getByRole('button', { name: /Dùng 0 landing đã chọn/ });
    expect(useButton).toBeDisabled();
    fireEvent.click(useButton);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('chọn 2 trang → onSubmit({ slugs, landings }) với đúng thứ tự đã chọn', () => {
    const onSubmit = renderCard();

    fireEvent.click(screen.getByLabelText(/Khoá TOEIC/));
    fireEvent.click(screen.getByLabelText(/Khoá IELTS/));
    fireEvent.click(screen.getByRole('button', { name: /Dùng 2 landing đã chọn/ }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].slugs).toEqual(['khoa-toeic', 'khoa-ielts']);
    expect(onSubmit.mock.calls[0][0].landings).toEqual(DATA.landings);
  });

  it('bỏ chọn một trang → không còn trong danh sách gửi đi', () => {
    const onSubmit = renderCard();

    fireEvent.click(screen.getByLabelText(/Khoá IELTS/));
    fireEvent.click(screen.getByLabelText(/Khoá TOEIC/));
    fireEvent.click(screen.getByLabelText(/Khoá IELTS/));
    fireEvent.click(screen.getByRole('button', { name: /Dùng 1 landing đã chọn/ }));

    expect(onSubmit.mock.calls[0][0].slugs).toEqual(['khoa-toeic']);
  });

  it('vượt trần maxSelect → không chọn thêm (lựa chọn thứ 3 bị từ chối)', () => {
    const onSubmit = renderCard();

    fireEvent.click(screen.getByLabelText(/Khoá IELTS/));
    fireEvent.click(screen.getByLabelText(/Khoá TOEIC/));
    fireEvent.click(screen.getByLabelText(/Đặt lịch tư vấn/));
    fireEvent.click(screen.getByRole('button', { name: /Dùng 2 landing đã chọn/ }));

    expect(onSubmit.mock.calls[0][0].slugs).toEqual(['khoa-ielts', 'khoa-toeic']);
  });

  it('"Gửi cho TẤT CẢ landing (N lead)" là nút RIÊNG, ghi số lead, và gửi { all: true } không kèm slug', () => {
    const onSubmit = renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Gửi cho TẤT CẢ landing (205 lead)' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ all: true });
  });

  it('thẻ không còn là thẻ cuối (isActive=false) → mờ và không bấm được', () => {
    const { container } = render(<LandingLeadsPickerCard data={DATA} onSubmit={vi.fn()} isActive={false} t={t} />);
    expect(container.firstChild.className).toContain('pointer-events-none');
  });

  it('có nút bỏ qua khi truyền onDismiss', () => {
    const onDismiss = vi.fn();
    renderCard({ onDismiss });

    fireEvent.click(screen.getByRole('button', { name: 'Không phải, tôi chỉ hỏi thôi' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('nhiều landing (> 6) → có ô tìm theo tên/slug, không phân biệt dấu', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ slug: `lp-${i}`, title: `Trang số ${i}`, isPublished: true, formId: null, leadCount: i, formConsentedCount: 0 }));
    render(<LandingLeadsPickerCard data={{ ...DATA, landings: [...many, DATA.landings[2]] }} onSubmit={vi.fn()} t={t} />);

    fireEvent.change(screen.getByPlaceholderText('Tìm landing...'), { target: { value: 'dat lich' } });

    expect(screen.getByText('Đặt lịch tư vấn')).toBeInTheDocument();
    expect(screen.queryByText('Trang số 3')).not.toBeInTheDocument();
  });
});
