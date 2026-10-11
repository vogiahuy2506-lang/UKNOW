import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import FormLeadsTab from '../FormLeadsTab';
import { fetchForms, fetchWorkspaceSubmissions } from '../../../features/forms/services/formAdminApi.service.js';

vi.mock('../../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  setAuthStore: vi.fn(),
}));
vi.mock('../../../features/forms/services/formAdminApi.service.js', () => ({
  fetchForms: vi.fn(),
  fetchWorkspaceSubmissions: vi.fn(),
}));

const FORMS = [
  {
    id: 7,
    title: 'Biểu mẫu tư vấn',
    fields: [
      { key: 'k_name', label: 'Họ và tên', type: 'short_text' },
      { key: 'k_service', label: 'Dịch vụ quan tâm', type: 'select' },
      { key: 'k_note', label: 'Ghi chú thêm', type: 'long_text' },
    ],
  },
  { id: 8, title: 'Đăng ký workshop', fields: [] },
];

const SUB_CONSULT = {
  id: 11,
  formId: 7,
  formTitle: 'Biểu mẫu tư vấn',
  respondentName: 'Nguyen Van A',
  respondentEmail: 'a@example.com',
  respondentPhone: '0901111111',
  status: 'submitted',
  holdExpiresAt: null,
  marketingConsent: true,
  consentWithdrawnAt: null,
  landingPageSlug: 'khoa-hoc',
  utmSource: 'facebook',
  createdAt: '2026-10-10T03:00:00Z',
  // Cố ý xếp lộn thứ tự khoá so với biểu mẫu + dùng cả hai dạng: ảnh chụp {label,value} và giá trị trần.
  answers: {
    k_note: 'Muốn học buổi tối',
    k_service: { label: 'Dịch vụ (nhãn cũ)', type: 'select', value: 'Khoá nâng cao' },
    k_name: 'Nguyen Van A',
    k_removed: { label: 'Câu hỏi đã xoá', type: 'short_text', value: 'vẫn còn trong bài nộp cũ' },
  },
};

const SUB_PENDING_EXPIRED = {
  id: 12,
  formId: 8,
  formTitle: 'Đăng ký workshop',
  respondentName: null,
  respondentEmail: null,
  respondentPhone: '0902222222',
  status: 'pending_payment',
  holdExpiresAt: '2020-01-01T00:00:00Z',
  marketingConsent: null,
  consentWithdrawnAt: null,
  landingPageSlug: null,
  utmSource: null,
  createdAt: '2026-10-09T03:00:00Z',
  answers: {},
};

function renderTab() {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <FormLeadsTab />
      </I18nProvider>
    </MemoryRouter>
  );
}

function lastCallArgs() {
  const calls = fetchWorkspaceSubmissions.mock.calls;
  return calls[calls.length - 1][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchForms.mockResolvedValue(FORMS);
  fetchWorkspaceSubmissions.mockResolvedValue({
    items: [SUB_CONSULT, SUB_PENDING_EXPIRED],
    total: 2,
    page: 1,
    limit: 20,
  });
});

describe('FormLeadsTab — tab "Từ biểu mẫu"', () => {
  it('bảng gọn: 6 cột đúng tên (có cột "Hành động"), mỗi dòng người nộp + biểu mẫu + nguồn + trạng thái', async () => {
    renderTab();

    expect(await screen.findByText('Nguyen Van A')).toBeInTheDocument();
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers).toEqual(['Thời gian', 'Người nộp', 'Biểu mẫu', 'Nguồn', 'Trạng thái', 'Hành động']);

    const rows = screen.getAllByTestId('form-lead-row');
    expect(rows).toHaveLength(2);
    const first = within(rows[0]);
    expect(first.getByText('Nguyen Van A')).toBeInTheDocument();
    // Email + SĐT là dòng phụ dưới tên.
    expect(first.getByText('a@example.com · 0901111111')).toBeInTheDocument();
    expect(first.getAllByText('Biểu mẫu tư vấn').length).toBeGreaterThan(0);
    expect(first.getByText('/khoa-hoc')).toBeInTheDocument();
    expect(first.getByText('facebook')).toBeInTheDocument();
    expect(first.getByTestId('form-lead-status')).toHaveAttribute('data-status', 'submitted');
    expect(first.getByRole('button', { name: 'Xem chi tiết' })).toBeInTheDocument();

    // Không tên: chữ "Chưa cung cấp"; không nguồn: gạch ngang.
    const second = within(rows[1]);
    expect(second.getByText('Chưa cung cấp')).toBeInTheDocument();
    expect(second.getByText('0902222222')).toBeInTheDocument();
    // pending_payment mà hết hạn giữ chỗ → hiện "Hết hạn thanh toán", không phải "Chờ thanh toán".
    expect(second.getByTestId('form-lead-status')).toHaveAttribute('data-status', 'hold_expired');
    expect(second.getByText('Hết hạn thanh toán')).toBeInTheDocument();
  });

  it('mở trang: gọi API trang 1, limit 20, chưa lọc gì', async () => {
    renderTab();
    await screen.findByText('Nguyen Van A');

    expect(fetchWorkspaceSubmissions).toHaveBeenCalledTimes(1);
    expect(fetchWorkspaceSubmissions).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      formId: undefined,
      from: undefined,
      to: undefined,
    });
  });

  it('lọc theo biểu mẫu (dropdown lấy từ GET /api/forms) → gọi lại với formId, về trang 1', async () => {
    renderTab();
    await screen.findByText('Nguyen Van A');
    await screen.findByRole('option', { name: 'Đăng ký workshop' });

    fireEvent.change(screen.getByLabelText('Biểu mẫu', { selector: 'select' }), { target: { value: '8' } });

    await waitFor(() => expect(fetchWorkspaceSubmissions).toHaveBeenCalledTimes(2));
    expect(lastCallArgs()).toMatchObject({ page: 1, formId: '8' });
  });

  it('lọc khoảng ngày → gọi lại với from/to; from sau to thì KHÔNG gọi API và báo lỗi', async () => {
    renderTab();
    await screen.findByText('Nguyen Van A');

    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-10-01' } });
    await waitFor(() => expect(fetchWorkspaceSubmissions).toHaveBeenCalledTimes(2));
    expect(lastCallArgs()).toMatchObject({ from: '2026-10-01', to: undefined });

    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-10-05' } });
    await waitFor(() => expect(fetchWorkspaceSubmissions).toHaveBeenCalledTimes(3));
    expect(lastCallArgs()).toMatchObject({ from: '2026-10-01', to: '2026-10-05' });

    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-10-09' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
    expect(fetchWorkspaceSubmissions).toHaveBeenCalledTimes(3);
  });

  it('"Xoá bộ lọc" đưa về không lọc', async () => {
    renderTab();
    await screen.findByText('Nguyen Van A');
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-10-01' } });
    await waitFor(() => expect(fetchWorkspaceSubmissions).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));

    await waitFor(() => expect(fetchWorkspaceSubmissions).toHaveBeenCalledTimes(3));
    expect(lastCallArgs()).toMatchObject({ formId: undefined, from: undefined, to: undefined, page: 1 });
  });

  it('phân trang: total 45 / limit 20 → 3 trang; "Trang sau" gọi page 2; nút Trang trước bị khoá ở trang 1', async () => {
    fetchWorkspaceSubmissions.mockResolvedValue({ items: [SUB_CONSULT], total: 45, page: 1, limit: 20 });
    renderTab();
    await screen.findByText('Nguyen Van A');

    expect(screen.getByText('Trang 1 / 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Trang trước/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Trang sau/ }));

    await waitFor(() => expect(fetchWorkspaceSubmissions).toHaveBeenCalledTimes(2));
    expect(lastCallArgs()).toMatchObject({ page: 2 });
  });

  it('đang ở trang 2 mà đổi bộ lọc (biểu mẫu hoặc ngày) → quay về trang 1, không kẹt ở trang không còn tồn tại', async () => {
    fetchWorkspaceSubmissions.mockResolvedValue({ items: [SUB_CONSULT], total: 45, page: 1, limit: 20 });
    renderTab();
    await screen.findByText('Nguyen Van A');
    await screen.findByRole('option', { name: 'Đăng ký workshop' });

    fireEvent.click(screen.getByRole('button', { name: /Trang sau/ }));
    await waitFor(() => expect(lastCallArgs()).toMatchObject({ page: 2 }));

    fireEvent.change(screen.getByLabelText('Biểu mẫu', { selector: 'select' }), { target: { value: '8' } });
    await waitFor(() => expect(lastCallArgs()).toMatchObject({ page: 1, formId: '8' }));

    fireEvent.click(screen.getByRole('button', { name: /Trang sau/ }));
    await waitFor(() => expect(lastCallArgs()).toMatchObject({ page: 2, formId: '8' }));
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-10-01' } });
    await waitFor(() => expect(lastCallArgs()).toMatchObject({ page: 1, from: '2026-10-01' }));
  });

  it('chỉ một trang → không hiện thanh phân trang', async () => {
    renderTab();
    await screen.findByText('Nguyen Van A');

    expect(screen.queryByRole('button', { name: /Trang sau/ })).not.toBeInTheDocument();
  });

  it('trống không lọc → "Chưa có ai điền biểu mẫu của bạn."; trống có lọc → "Không có bài nộp nào khớp bộ lọc."', async () => {
    fetchWorkspaceSubmissions.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    renderTab();
    expect(await screen.findByText('Chưa có ai điền biểu mẫu của bạn.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-10-01' } });
    expect(await screen.findByText('Không có bài nộp nào khớp bộ lọc.')).toBeInTheDocument();
  });

  it('API lỗi → hiện thông báo lỗi (ưu tiên message của server), bảng rỗng', async () => {
    fetchWorkspaceSubmissions.mockRejectedValue({ response: { data: { message: 'Máy chủ bận' } } });
    renderTab();

    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ bận');
    expect(screen.queryByTestId('form-lead-row')).not.toBeInTheDocument();
  });

  it('GET /api/forms lỗi → bảng vẫn dùng được (chỉ thiếu ô lọc biểu mẫu)', async () => {
    fetchForms.mockRejectedValue(new Error('boom'));
    renderTab();

    expect(await screen.findByText('Nguyen Van A')).toBeInTheDocument();
  });

  describe('modal chi tiết', () => {
    it('bấm nút mắt → modal hiện câu trả lời theo NHÃN trường, đúng thứ tự trường của biểu mẫu', async () => {
      renderTab();
      await screen.findByText('Nguyen Van A');
      await screen.findByRole('option', { name: 'Đăng ký workshop' });

      fireEvent.click(within(screen.getAllByTestId('form-lead-row')[0]).getByRole('button', { name: 'Xem chi tiết' }));

      const modal = await screen.findByTestId('form-lead-detail-modal');
      expect(within(modal).getByText('Chi tiết bài nộp')).toBeInTheDocument();
      const items = within(within(modal).getByTestId('form-lead-answer-list')).getAllByRole('listitem');
      expect(items.map((li) => li.textContent.replace(/\s+/g, ' ').trim())).toEqual([
        // k_name: giá trị trần → nhãn lấy từ trường của biểu mẫu
        'Họ và tên: Nguyen Van A',
        // k_service: có ảnh chụp nhãn lúc khách điền → giữ nhãn đó, không bị nhãn mới đè
        'Dịch vụ (nhãn cũ): Khoá nâng cao',
        'Ghi chú thêm: Muốn học buổi tối',
        // trường đã bị xoá khỏi biểu mẫu: không mất, xếp cuối, dùng nhãn trong ảnh chụp
        'Câu hỏi đã xoá: vẫn còn trong bài nộp cũ',
      ]);
      // Thông tin người nộp + nguồn
      expect(within(modal).getByText('a@example.com')).toBeInTheDocument();
      expect(within(modal).getByText('0901111111')).toBeInTheDocument();
      expect(within(modal).getByText('Biểu mẫu tư vấn')).toBeInTheDocument();
      expect(within(modal).getByText(/Nguồn quảng cáo: facebook/)).toBeInTheDocument();
    });

    it('thiếu danh sách trường của biểu mẫu → vẫn hiện được, nhãn rơi về ảnh chụp rồi tới chính khoá', async () => {
      fetchForms.mockResolvedValue([]);
      renderTab();
      await screen.findByText('Nguyen Van A');

      fireEvent.click(within(screen.getAllByTestId('form-lead-row')[0]).getByRole('button', { name: 'Xem chi tiết' }));

      const modal = await screen.findByTestId('form-lead-detail-modal');
      const text = within(within(modal).getByTestId('form-lead-answer-list')).getAllByRole('listitem').map((li) => li.textContent);
      expect(text.join('|')).toContain('Dịch vụ (nhãn cũ): Khoá nâng cao');
      expect(text.join('|')).toContain('k_note: Muốn học buổi tối');
    });

    it('nút "Mở trong biểu mẫu" dẫn tới /app/forms/:id/submissions của ĐÚNG biểu mẫu', async () => {
      renderTab();
      await screen.findByText('Nguyen Van A');

      fireEvent.click(within(screen.getAllByTestId('form-lead-row')[0]).getByRole('button', { name: 'Xem chi tiết' }));

      const link = await screen.findByRole('link', { name: /Mở trong biểu mẫu/ });
      expect(link).toHaveAttribute('href', '/app/forms/7/submissions');
    });

    it('bấm cả dòng cũng mở modal; Esc và nút Đóng đều đóng modal', async () => {
      renderTab();
      const name = await screen.findByText('Nguyen Van A');

      fireEvent.click(name.closest('tr'));
      expect(await screen.findByTestId('form-lead-detail-modal')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByTestId('form-lead-detail-modal')).not.toBeInTheDocument());

      fireEvent.click(name.closest('tr'));
      const modal = await screen.findByTestId('form-lead-detail-modal');
      fireEvent.click(within(modal).getAllByRole('button', { name: 'Đóng' }).pop());
      await waitFor(() => expect(screen.queryByTestId('form-lead-detail-modal')).not.toBeInTheDocument());
    });

    it('bài nộp không có câu trả lời → "Không có câu trả lời"', async () => {
      renderTab();
      await screen.findByText('Nguyen Van A');

      fireEvent.click(within(screen.getAllByTestId('form-lead-row')[1]).getByRole('button', { name: 'Xem chi tiết' }));

      const modal = await screen.findByTestId('form-lead-detail-modal');
      expect(within(modal).getByText('Không có câu trả lời')).toBeInTheDocument();
    });
  });
});
