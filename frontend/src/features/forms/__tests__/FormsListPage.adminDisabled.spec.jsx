import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import FormsListPage from '../pages/FormsListPage';
import * as formAdminApi from '../services/formAdminApi.service';

/**
 * PR-10 — chủ biểu mẫu bị admin tắt (admin_disabled_at) phải thấy "Đã bị tắt", không phải "Đã xuất bản".
 * Trước đây trang chỉ đọc `isPublished`: khách không nộp được nhưng chủ vẫn thấy huy hiệu xanh.
 */
vi.mock('../services/formAdminApi.service', () => ({
  fetchForms: vi.fn(),
  deleteForm: vi.fn(),
  publishForm: vi.fn(),
}));

vi.mock('../components/ShareModal', () => ({ default: () => null }));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const form = (over) => ({
  id: 'f-1',
  title: 'Biểu mẫu A',
  description: '',
  isPublished: true,
  adminDisabledAt: null,
  submissionCount: 0,
  ...over,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <I18nProvider>
        <FormsListPage />
      </I18nProvider>
    </MemoryRouter>
  );

describe('FormsListPage — trạng thái biểu mẫu bị admin tắt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adminDisabledAt có giá trị + isPublished=true → hiện "Đã bị tắt", KHÔNG hiện "Đã xuất bản"', async () => {
    formAdminApi.fetchForms.mockResolvedValue([
      form({ id: 'f-1', title: 'Biểu mẫu bị tắt', isPublished: true, adminDisabledAt: '2026-09-29T03:00:00.000Z' }),
    ]);
    renderPage();
    await screen.findByText('Biểu mẫu bị tắt');
    expect(screen.getByText('Đã bị tắt')).toBeInTheDocument();
    expect(screen.queryByText('Đã xuất bản')).toBeNull();
  });

  it('không bị admin tắt: giữ nguyên "Đã xuất bản" / "Bản nháp"', async () => {
    formAdminApi.fetchForms.mockResolvedValue([
      form({ id: 'f-1', title: 'Đang chạy', isPublished: true }),
      form({ id: 'f-2', title: 'Chưa xuất bản', isPublished: false }),
    ]);
    renderPage();
    await screen.findByText('Đang chạy');
    expect(screen.getByText('Đã xuất bản')).toBeInTheDocument();
    expect(screen.getByText('Bản nháp')).toBeInTheDocument();
    expect(screen.queryByText('Đã bị tắt')).toBeNull();
  });
});
