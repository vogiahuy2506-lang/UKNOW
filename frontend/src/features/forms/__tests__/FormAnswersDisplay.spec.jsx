import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import FormSubmissionsPage from '../pages/FormSubmissionsPage';
import FormLeadDetailModal from '../../../pages/landing-leads/FormLeadDetailModal';
import * as formAdminApi from '../services/formAdminApi.service';

/**
 * PR-4 (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11): màn bài nộp và modal chi tiết khách hiện đúng câu trả lời của loại
 * trường mới — rating "4/5 ★", yes_no Có / Không, time như nhập — và KHÔNG hiện khối hiển thị (tiêu đề / đoạn chữ / ngắt trang).
 */

vi.mock('../services/formAdminApi.service', () => ({
  fetchFormById: vi.fn(),
  fetchFormSubmissions: vi.fn(),
  cancelSubmission: vi.fn(),
  confirmPayment: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const FORM = {
  id: 'form-ans-1',
  title: 'Khảo sát sau khoá học',
  fields: [
    { key: 'f_h', label: 'Phần 1', type: 'heading' },
    { key: 'f_name', label: 'Họ tên', type: 'short_text' },
    { key: 'f_p', label: 'Lời dẫn', type: 'paragraph' },
    { key: 'f_rate', label: 'Hài lòng', type: 'rating' },
    { key: 'f_yn', label: 'Sẽ giới thiệu bạn bè?', type: 'yes_no' },
    { key: 'f_time', label: 'Giờ gọi lại', type: 'time' },
    { key: 'f_pb', label: 'Bước 2', type: 'page_break' },
  ],
};

const ANSWERS = {
  f_name: { label: 'Họ tên', type: 'short_text', value: 'Trần Lan' },
  f_rate: { label: 'Hài lòng', type: 'rating', value: 4 },
  f_yn: { label: 'Sẽ giới thiệu bạn bè?', type: 'yes_no', value: 'no' },
  f_time: { label: 'Giờ gọi lại', type: 'time', value: '14:30' },
  // Dữ liệu bẩn: khối hiển thị không bao giờ có câu trả lời, nhưng nếu lọt vào cũng không được hiện
  f_h: { label: 'Phần 1', type: 'heading', value: 'rác tiêu đề' },
  f_pb: { label: 'Bước 2', type: 'page_break', value: 'rác ngắt trang' },
};

describe('FormSubmissionsPage — câu trả lời loại trường mới (PR-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rating hiện "4/5 ★", yes_no hiện Không, time như nhập; khối hiển thị không hiện thành dòng nào', async () => {
    formAdminApi.fetchFormById.mockResolvedValue(FORM);
    formAdminApi.fetchFormSubmissions.mockResolvedValue({
      submissions: [
        {
          id: 'sub-1',
          respondentName: 'Trần Lan',
          respondentEmail: 'lan@example.com',
          marketingConsent: true,
          createdAt: '2026-10-11T08:00:00.000Z',
          answers: ANSWERS,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });

    render(
      <MemoryRouter initialEntries={['/app/forms/form-ans-1/submissions']}>
        <I18nProvider>
          <Routes>
            <Route path="/app/forms/:id/submissions" element={<FormSubmissionsPage />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('lan@example.com')).toBeInTheDocument());

    const row = screen.getByText('lan@example.com').closest('tr');
    const rowText = row.textContent;
    expect(rowText).toContain('Hài lòng: 4/5 ★');
    expect(rowText).toContain('Sẽ giới thiệu bạn bè?: Không');
    expect(rowText).toContain('Giờ gọi lại: 14:30');
    expect(rowText).toContain('Họ tên: Trần Lan');
    expect(rowText).not.toContain('rác tiêu đề');
    expect(rowText).not.toContain('rác ngắt trang');
    expect(within(row).queryByText('Phần 1:')).not.toBeInTheDocument();
    expect(within(row).queryByText('Bước 2:')).not.toBeInTheDocument();
  });

  it('ảnh chụp thiếu `type` thì lấy loại hiện tại của trường để định dạng', async () => {
    formAdminApi.fetchFormById.mockResolvedValue(FORM);
    formAdminApi.fetchFormSubmissions.mockResolvedValue({
      submissions: [
        {
          id: 'sub-2',
          respondentName: 'Không loại',
          respondentEmail: 'notype@example.com',
          marketingConsent: true,
          createdAt: '2026-10-11T08:00:00.000Z',
          answers: { f_rate: { label: 'Hài lòng', value: 5 }, f_yn: { label: 'Sẽ giới thiệu bạn bè?', value: 'yes' } },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });

    render(
      <MemoryRouter initialEntries={['/app/forms/form-ans-1/submissions']}>
        <I18nProvider>
          <Routes>
            <Route path="/app/forms/:id/submissions" element={<FormSubmissionsPage />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('notype@example.com')).toBeInTheDocument());
    const rowText = screen.getByText('notype@example.com').closest('tr').textContent;
    expect(rowText).toContain('Hài lòng: 5/5 ★');
    expect(rowText).toContain('Sẽ giới thiệu bạn bè?: Có');
  });
});

describe('FormLeadDetailModal — câu trả lời loại trường mới (PR-4)', () => {
  it('liệt kê rating "4/5 ★", yes_no Không, time; không có dòng của khối hiển thị', () => {
    render(
      <MemoryRouter>
        <I18nProvider>
          <FormLeadDetailModal
            submission={{
              id: 7,
              formId: 3,
              formTitle: 'Khảo sát',
              respondentName: 'Trần Lan',
              respondentEmail: 'lan@example.com',
              createdAt: '2026-10-11T08:00:00.000Z',
              status: 'submitted',
              marketingConsent: true,
              answers: ANSWERS,
            }}
            formFields={FORM.fields}
            onClose={() => {}}
          />
        </I18nProvider>
      </MemoryRouter>
    );

    const items = within(screen.getByTestId('form-lead-answer-list'))
      .getAllByRole('listitem')
      .map((li) => li.textContent.replace(/\s+/g, ' ').trim());
    expect(items).toEqual([
      'Họ tên: Trần Lan',
      'Hài lòng: 4/5 ★',
      'Sẽ giới thiệu bạn bè?: Không',
      'Giờ gọi lại: 14:30',
    ]);
  });

  it('chỉ có khối hiển thị trong answers (dữ liệu bẩn) → hiện "chưa có câu trả lời", không có dòng "nhãn: —"', () => {
    render(
      <MemoryRouter>
        <I18nProvider>
          <FormLeadDetailModal
            submission={{
              id: 8,
              formId: 3,
              formTitle: 'Khảo sát',
              createdAt: '2026-10-11T08:00:00.000Z',
              status: 'submitted',
              answers: { f_h: ANSWERS.f_h, f_pb: ANSWERS.f_pb },
            }}
            formFields={FORM.fields}
            onClose={() => {}}
          />
        </I18nProvider>
      </MemoryRouter>
    );
    expect(screen.queryByTestId('form-lead-answer-list')).not.toBeInTheDocument();
    expect(screen.getByTestId('form-lead-detail-modal')).toBeInTheDocument();
  });
});
