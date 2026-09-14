import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import FormSubmissionsPage from '../pages/FormSubmissionsPage';
import * as formAdminApi from '../services/formAdminApi.service';

vi.mock('../services/formAdminApi.service', () => ({
  fetchFormById: vi.fn(),
  fetchFormSubmissions: vi.fn(),
}));

describe('FormSubmissionsPage component', () => {
  const mockForm = {
    id: 'form-sub-123',
    title: 'Biểu mẫu thu thập thông tin sự kiện',
    fields: [
      { key: 'f_name', label: 'Tên hiện tại (đã đổi)', type: 'short_text' },
      { key: 'f_new_field', label: 'Trường mới thêm sau này', type: 'short_text' },
    ],
  };

  const mockSubmissionsPage1 = {
    submissions: [
      {
        id: 'sub-001',
        respondentName: 'Trần Văn Snapshot',
        respondentEmail: 'snapshot@example.com',
        respondentPhone: '0987654321',
        marketingConsent: true,
        createdAt: '2026-09-14T08:00:00.000Z',
        // answers được lưu dưới dạng snapshot { [key]: { label, type, value } }
        answers: {
          f_name: {
            label: 'Họ tên lúc nộp (nhãn cũ)',
            type: 'short_text',
            value: 'Trần Văn Snapshot',
          },
          f_deleted_field: {
            label: 'Trường cũ đã bị chủ form xoá khỏi form sau đó',
            type: 'short_text',
            value: 'Dữ liệu của trường đã xoá',
          },
        },
      },
      {
        id: 'sub-002',
        respondentName: 'Nguyễn Không Đồng Ý',
        respondentEmail: 'no-consent@example.com',
        respondentPhone: null,
        marketingConsent: false,
        createdAt: '2026-09-14T08:15:00.000Z',
        answers: {
          f_name: {
            label: 'Họ tên lúc nộp (nhãn cũ)',
            type: 'short_text',
            value: 'Nguyễn Không Đồng Ý',
          },
        },
      },
      {
        id: 'sub-003',
        respondentName: 'Lê Chưa Chọn',
        respondentEmail: null,
        respondentPhone: null,
        marketingConsent: null, // Form không bật consent
        createdAt: '2026-09-14T08:30:00.000Z',
        answers: {},
      },
    ],
    total: 25,
    page: 1,
    pageSize: 20,
    totalPages: 2,
  };

  const mockSubmissionsPage2 = {
    submissions: [
      {
        id: 'sub-004',
        respondentName: 'Phạm Trang Hai',
        respondentEmail: 'page2@example.com',
        marketingConsent: true,
        createdAt: '2026-09-14T09:00:00.000Z',
        answers: {
          f_name: {
            label: 'Họ tên lúc nộp (nhãn cũ)',
            type: 'short_text',
            value: 'Phạm Trang Hai',
          },
        },
      },
    ],
    total: 25,
    page: 2,
    pageSize: 20,
    totalPages: 2,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hiển thị nhãn câu trả lời theo snapshot label trong bài nộp thay vì form definition hiện tại', async () => {
    formAdminApi.fetchFormById.mockResolvedValue(mockForm);
    formAdminApi.fetchFormSubmissions.mockResolvedValue(mockSubmissionsPage1);

    render(
      <MemoryRouter initialEntries={['/app/forms/form-sub-123/submissions']}>
        <I18nProvider>
          <Routes>
            <Route path="/app/forms/:id/submissions" element={<FormSubmissionsPage />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    );

    // Chờ dữ liệu load xong
    await waitFor(() => {
      expect(screen.getByText('snapshot@example.com')).toBeInTheDocument();
    });

    // Nhãn được hiển thị phải là nhãn snapshot được lưu lúc nộp:
    // "Họ tên lúc nộp (nhãn cũ)" chứ KHÔNG phải "Tên hiện tại (đã đổi)"
    expect(screen.getAllByText(/Họ tên lúc nộp \(nhãn cũ\):/i)).toHaveLength(2);
    expect(screen.queryByText(/Tên hiện tại \(đã đổi\):/i)).not.toBeInTheDocument();

    // Trường đã bị chủ form xoá sau này vẫn hiển thị đúng nhãn và giá trị đã lưu trong snapshot
    expect(screen.getByText(/Trường cũ đã bị chủ form xoá khỏi form sau đó:/i)).toBeInTheDocument();
    expect(screen.getByText('Dữ liệu của trường đã xoá')).toBeInTheDocument();
  });

  it('hiển thị đúng trạng thái cột đồng ý tiếp thị: true -> Có, false -> Không, null/undefined -> —', async () => {
    formAdminApi.fetchFormById.mockResolvedValue(mockForm);
    formAdminApi.fetchFormSubmissions.mockResolvedValue(mockSubmissionsPage1);

    render(
      <MemoryRouter initialEntries={['/app/forms/form-sub-123/submissions']}>
        <I18nProvider>
          <Routes>
            <Route path="/app/forms/:id/submissions" element={<FormSubmissionsPage />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('snapshot@example.com')).toBeInTheDocument();
    });

    // Có (marketingConsent = true)
    expect(screen.getByText('Có')).toBeInTheDocument();

    // Không (marketingConsent = false)
    expect(screen.getByText('Không')).toBeInTheDocument();

    // — (marketingConsent = null/undefined)
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('phân trang theo totalPages và chuyển trang thành công', async () => {
    formAdminApi.fetchFormById.mockResolvedValue(mockForm);
    formAdminApi.fetchFormSubmissions
      .mockResolvedValueOnce(mockSubmissionsPage1)
      .mockResolvedValueOnce(mockSubmissionsPage2);

    render(
      <MemoryRouter initialEntries={['/app/forms/form-sub-123/submissions']}>
        <I18nProvider>
          <Routes>
            <Route path="/app/forms/:id/submissions" element={<FormSubmissionsPage />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('snapshot@example.com')).toBeInTheDocument();
    });

    // Bấm nút chuyển trang tiếp theo
    const nextBtn = screen.getByRole('button', { name: /Trang sau/i });
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(formAdminApi.fetchFormSubmissions).toHaveBeenCalledWith('form-sub-123', {
        page: 2,
        pageSize: 20,
      });
      expect(screen.getByText('page2@example.com')).toBeInTheDocument();
    });
  });
});
