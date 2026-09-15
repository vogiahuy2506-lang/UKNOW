import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../i18n';
import AdminFormsPage from './AdminFormsPage';

const { mockList, mockDisable, mockEnable } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockDisable: vi.fn(),
  mockEnable: vi.fn(),
}));

vi.mock('../../features/admin/services/adminFormsApi.service', () => ({
  default: {
    list: mockList,
    disable: mockDisable,
    enable: mockEnable,
  },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function listResponse({ forms = [], total = forms.length } = {}) {
  return { data: { data: { forms, total } } };
}

const activeForm = {
  id: 'form-1',
  title: 'Form tư vấn 1-1',
  publicKey: 'pub_abc123',
  createdAt: '2026-09-01T00:00:00.000Z',
  ownerEmail: 'owner1@example.com',
  hasPayment: true,
  submissionCount: 12,
  isPublished: true,
  adminDisabledAt: null,
};

const disabledForm = {
  id: 'form-2',
  title: 'Form nghi lừa đảo',
  publicKey: 'pub_xyz789',
  createdAt: '2026-09-05T00:00:00.000Z',
  ownerEmail: 'owner2@example.com',
  hasPayment: true,
  submissionCount: 0,
  isPublished: true,
  adminDisabledAt: '2026-09-10T00:00:00.000Z',
};

const draftFormNoPayment = {
  id: 'form-3',
  title: 'Form nháp không thu tiền',
  publicKey: 'pub_draft001',
  createdAt: '2026-09-12T00:00:00.000Z',
  ownerEmail: 'owner3@example.com',
  hasPayment: false,
  submissionCount: 0,
  isPublished: false,
  adminDisabledAt: null,
};

function renderPage() {
  return render(
    <I18nProvider>
      <AdminFormsPage />
    </I18nProvider>
  );
}

describe('AdminFormsPage component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tải danh sách lúc mount, hiện đúng cột: mã biểu mẫu, chủ TK, thu tiền, số bài nộp, trạng thái', async () => {
    mockList.mockResolvedValue(listResponse({ forms: [activeForm, disabledForm, draftFormNoPayment] }));

    renderPage();

    await waitFor(() => expect(screen.getByText('Form tư vấn 1-1')).toBeInTheDocument());
    expect(mockList).toHaveBeenCalledWith({ q: undefined, page: 1, pageSize: 20 });

    expect(screen.getByText('pub_abc123')).toBeInTheDocument();
    expect(screen.getByText('owner1@example.com')).toBeInTheDocument();
    expect(screen.getAllByText('Có')).toHaveLength(2); // activeForm + disabledForm đều hasPayment

    expect(screen.getByText('Đang hoạt động')).toBeInTheDocument();
    expect(screen.getByText('Đã bị tắt')).toBeInTheDocument();
    expect(screen.getByText('Bản nháp')).toBeInTheDocument();
  });

  it('ô tìm kiếm: gõ rồi bấm Tìm gửi q lên API, reset về trang 1', async () => {
    mockList.mockResolvedValue(listResponse({ forms: [activeForm] }));

    renderPage();

    await waitFor(() => expect(screen.getByText('Form tư vấn 1-1')).toBeInTheDocument());
    mockList.mockClear();

    fireEvent.change(screen.getByPlaceholderText('Mã biểu mẫu hoặc email chủ...'), {
      target: { value: '  pub_abc123  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm' }));

    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));
    expect(mockList).toHaveBeenCalledWith({ q: 'pub_abc123', page: 1, pageSize: 20 });
  });

  it('nút Tắt: hỏi xác nhận trước, gọi disable(id) đúng, tải lại danh sách sau khi xác nhận', async () => {
    mockList.mockResolvedValue(listResponse({ forms: [activeForm] }));
    mockDisable.mockResolvedValue({});

    renderPage();

    await waitFor(() => expect(screen.getByText('Form tư vấn 1-1')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Tắt/i }));

    // Hỏi xác nhận trước, CHƯA gọi API
    expect(screen.getByText('Tắt biểu mẫu này? Khách sẽ không truy cập/nộp bài được nữa.')).toBeInTheDocument();
    expect(mockDisable).not.toHaveBeenCalled();

    mockList.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => expect(mockDisable).toHaveBeenCalledWith('form-1'));
    // Tải lại danh sách sau khi tắt thành công
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));
  });

  it('nút Bật: hỏi xác nhận riêng cho form đã tắt, gọi enable(id) đúng', async () => {
    mockList.mockResolvedValue(listResponse({ forms: [disabledForm] }));
    mockEnable.mockResolvedValue({});

    renderPage();

    await waitFor(() => expect(screen.getByText('Form nghi lừa đảo')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Bật/i }));
    expect(screen.getByText('Bật lại biểu mẫu này? Khách sẽ nộp bài được ngay.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => expect(mockEnable).toHaveBeenCalledWith('form-2'));
  });

  it('bấm Thôi trong hộp xác nhận: huỷ, không gọi API', async () => {
    mockList.mockResolvedValue(listResponse({ forms: [activeForm] }));

    renderPage();

    await waitFor(() => expect(screen.getByText('Form tư vấn 1-1')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Tắt/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Thôi' }));

    expect(mockDisable).not.toHaveBeenCalled();
    expect(
      screen.queryByText('Tắt biểu mẫu này? Khách sẽ không truy cập/nộp bài được nữa.')
    ).not.toBeInTheDocument();
  });

  it('danh sách rỗng -> hiện thông báo trống, không lỗi', async () => {
    mockList.mockResolvedValue(listResponse({ forms: [] }));

    renderPage();

    await waitFor(() => expect(screen.getByText('Không tìm thấy biểu mẫu nào')).toBeInTheDocument());
  });

  it('phân trang: hiện khi có nhiều hơn 1 trang, bấm Trang sau gọi lại API với page 2', async () => {
    mockList.mockResolvedValue(listResponse({ forms: [activeForm], total: 45 }));

    renderPage();

    await waitFor(() => expect(screen.getByText('Form tư vấn 1-1')).toBeInTheDocument());
    expect(screen.getByText('Trang 1 / 3 (45 biểu mẫu)')).toBeInTheDocument();

    mockList.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));

    await waitFor(() => expect(mockList).toHaveBeenCalledWith({ q: undefined, page: 2, pageSize: 20 }));
  });
});
