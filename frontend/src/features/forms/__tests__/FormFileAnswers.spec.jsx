import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import toast from 'react-hot-toast';
import { I18nProvider } from '../../../i18n';
import FormSubmissionsPage from '../pages/FormSubmissionsPage';
import FormAnswerFiles from '../components/FormAnswerFiles';
import FormLeadDetailModal from '../../../pages/landing-leads/FormLeadDetailModal';
import { buildAnswerEntries } from '../utils/formLeads.util';
import * as formAdminApi from '../services/formAdminApi.service';

/**
 * PR-4b (QĐ7): màn bài nộp + modal chi tiết khách hiện tệp khách tải lên: tên + cỡ + nút "Tải về" (xin link ngắn hạn qua API có
 * xác thực rồi mở bằng thẻ <a>); tệp chưa nhận được (chủ hết dung lượng / kho lỗi) hiện câu giải thích, link mua thêm dung lượng
 * CHỈ cho chủ tài khoản. Khoá kho (storageKey) không bao giờ hiện ra.
 */

vi.mock('../services/formAdminApi.service', () => ({
  fetchFormById: vi.fn(),
  fetchFormSubmissions: vi.fn(),
  cancelSubmission: vi.fn(),
  confirmPayment: vi.fn(),
  fetchSubmissionFileLink: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

let mockAuthState = { user: null, activeContext: { type: 'self' } };
vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector) => selector(mockAuthState),
}));

const FORM = {
  id: 'form-file-sub-1',
  title: 'Tuyển dụng',
  fields: [
    { key: 'f_name', label: 'Họ tên', type: 'short_text' },
    { key: 'f_cv', label: 'Hồ sơ', type: 'file' },
  ],
};

const RECEIVED = {
  f_name: { label: 'Họ tên', type: 'short_text', value: 'Trần Lan' },
  f_cv: {
    label: 'Hồ sơ',
    type: 'file',
    value: ['CV Trần Lan.pdf', 'anh.png'],
    fileStatus: 'received',
    files: [
      { name: 'CV Trần Lan.pdf', size: 2.5 * 1024 * 1024, contentType: 'application/pdf', storageKey: 'uploads/7/forms/3/submissions/9/aaa.pdf' },
      { name: 'anh.png', size: 850 * 1024, contentType: 'image/png', storageKey: 'uploads/7/forms/3/submissions/9/bbb.png' },
    ],
  },
};

const QUOTA = {
  f_name: { label: 'Họ tên', type: 'short_text', value: 'Lê Hết Chỗ' },
  f_cv: { label: 'Hồ sơ', type: 'file', value: [], files: [], fileStatus: 'quota_exceeded' },
};

const wrap = (ui) => (
  <MemoryRouter initialEntries={['/app/forms/form-file-sub-1/submissions']}>
    <I18nProvider>{ui}</I18nProvider>
  </MemoryRouter>
);

describe('buildAnswerEntries — trường file', () => {
  it('mục tệp mang files (tên + cỡ, KHÔNG có storageKey) và fileStatus; value là tên tệp nối bằng ", "', () => {
    const entries = buildAnswerEntries(RECEIVED, FORM.fields);
    const cv = entries.find((e) => e.key === 'f_cv');
    expect(cv).toEqual({
      key: 'f_cv',
      label: 'Hồ sơ',
      value: 'CV Trần Lan.pdf, anh.png',
      type: 'file',
      files: [
        { name: 'CV Trần Lan.pdf', size: 2.5 * 1024 * 1024 },
        { name: 'anh.png', size: 850 * 1024 },
      ],
      fileStatus: 'received',
    });
    expect(JSON.stringify(entries)).not.toContain('storageKey');
    expect(entries.find((e) => e.key === 'f_name')).not.toHaveProperty('files');
  });

  it('chủ hết dung lượng: files rỗng + fileStatus quota_exceeded', () => {
    const cv = buildAnswerEntries(QUOTA, FORM.fields).find((e) => e.key === 'f_cv');
    expect(cv).toMatchObject({ value: '', files: [], fileStatus: 'quota_exceeded' });
  });

  it('bài nộp cũ không có trường files (dữ liệu lạ) không làm vỡ', () => {
    const cv = buildAnswerEntries({ f_cv: { label: 'Hồ sơ', type: 'file', value: ['a.pdf'] } }, FORM.fields).find((e) => e.key === 'f_cv');
    expect(cv).toMatchObject({ value: 'a.pdf', files: [], fileStatus: '' });
  });
});

describe('FormAnswerFiles', () => {
  let clickSpy;
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState = { user: null, activeContext: { type: 'self' } };
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });
  afterEach(() => {
    clickSpy.mockRestore();
  });

  it('liệt kê tên + cỡ từng tệp, mỗi tệp một nút Tải về', () => {
    render(wrap(<FormAnswerFiles formId={3} submissionId={9} fieldKey="f_cv" files={[{ name: 'CV.pdf', size: 2.5 * 1024 * 1024 }, { name: 'anh.png', size: 850 * 1024 }]} fileStatus="received" />));
    const list = within(screen.getByTestId('answer-files-f_cv'));
    expect(list.getByText('CV.pdf')).toBeInTheDocument();
    expect(list.getByText('2,5 MB')).toBeInTheDocument();
    expect(list.getByText('850 KB')).toBeInTheDocument();
    expect(list.getAllByRole('button', { name: /^Tải về tệp / })).toHaveLength(2);
  });

  it('bấm Tải về → xin link theo (form, bài nộp, trường, chỉ số) rồi mở bằng thẻ <a> có href ngắn hạn', async () => {
    formAdminApi.fetchSubmissionFileLink.mockResolvedValue({ url: '/api/public/forms/files/tok.sig', fileName: 'anh.png', expiresAt: null });
    render(wrap(<FormAnswerFiles formId={3} submissionId={9} fieldKey="f_cv" files={[{ name: 'CV.pdf', size: 10 }, { name: 'anh.png', size: 20 }]} fileStatus="received" />));
    fireEvent.click(screen.getByRole('button', { name: 'Tải về tệp anh.png' }));
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    expect(formAdminApi.fetchSubmissionFileLink).toHaveBeenCalledWith(3, 9, 'f_cv', 1);
    const anchor = clickSpy.mock.instances[0];
    expect(anchor.getAttribute('href')).toBe('/api/public/forms/files/tok.sig');
    expect(anchor.getAttribute('rel')).toBe('noopener');
  });

  it('lỗi xin link → toast lỗi; tệp không còn trong kho (404 FILE_NOT_FOUND) → toast riêng; không mở <a>', async () => {
    formAdminApi.fetchSubmissionFileLink.mockRejectedValueOnce({ response: { data: { code: 'FILE_NOT_FOUND' } } });
    render(wrap(<FormAnswerFiles formId={3} submissionId={9} fieldKey="f_cv" files={[{ name: 'CV.pdf', size: 10 }]} fileStatus="received" />));
    fireEvent.click(screen.getByRole('button', { name: 'Tải về tệp CV.pdf' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Tệp không còn trong kho lưu trữ.'));

    formAdminApi.fetchSubmissionFileLink.mockRejectedValueOnce(new Error('boom'));
    fireEvent.click(screen.getByRole('button', { name: 'Tải về tệp CV.pdf' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không tải được tệp. Vui lòng thử lại.'));
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('chủ hết dung lượng: câu giải thích + link Mua thêm dung lượng tới /app/topup (chủ tài khoản)', () => {
    render(wrap(<FormAnswerFiles formId={3} submissionId={9} fieldKey="f_cv" files={[]} fileStatus="quota_exceeded" />));
    const note = screen.getByTestId('answer-files-missing-f_cv');
    expect(note).toHaveTextContent('Khách đã đính kèm tệp nhưng chưa lưu được vì tài khoản của bạn hết dung lượng.');
    expect(within(note).getByRole('link', { name: 'Mua thêm dung lượng' })).toHaveAttribute('href', '/app/topup');
  });

  it('nhân viên KHÔNG thấy link mua dung lượng (trang đó chỉ dành cho chủ)', () => {
    mockAuthState = { user: null, activeContext: { type: 'employee' } };
    render(wrap(<FormAnswerFiles formId={3} submissionId={9} fieldKey="f_cv" files={[]} fileStatus="quota_exceeded" />));
    expect(screen.getByTestId('answer-files-missing-f_cv')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mua thêm dung lượng' })).not.toBeInTheDocument();
  });

  it('kho lỗi: câu giải thích riêng, không có link mua dung lượng', () => {
    render(wrap(<FormAnswerFiles formId={3} submissionId={9} fieldKey="f_cv" files={[]} fileStatus="failed" />));
    expect(screen.getByTestId('answer-files-missing-f_cv')).toHaveTextContent('chưa lưu được do lỗi hệ thống');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('FormSubmissionsPage / FormLeadDetailModal — hiện tệp khách tải lên', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState = { user: null, activeContext: { type: 'self' } };
  });

  it('màn bài nộp: ô câu trả lời của trường file có tên + cỡ + nút Tải về; bài nộp hết dung lượng có câu giải thích', async () => {
    formAdminApi.fetchFormById.mockResolvedValue(FORM);
    formAdminApi.fetchFormSubmissions.mockResolvedValue({
      submissions: [
        { id: 11, respondentName: 'Trần Lan', respondentEmail: 'lan@example.com', marketingConsent: true, createdAt: '2026-10-12T08:00:00.000Z', answers: RECEIVED },
        { id: 12, respondentName: 'Lê Hết Chỗ', respondentEmail: 'het@example.com', marketingConsent: true, createdAt: '2026-10-12T08:05:00.000Z', answers: QUOTA },
      ],
      total: 2, page: 1, pageSize: 20, totalPages: 1,
    });
    render(
      <MemoryRouter initialEntries={['/app/forms/form-file-sub-1/submissions']}>
        <I18nProvider>
          <Routes>
            <Route path="/app/forms/:id/submissions" element={<FormSubmissionsPage />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('lan@example.com')).toBeInTheDocument());

    const rowOk = screen.getByText('lan@example.com').closest('tr');
    expect(within(rowOk).getByText('CV Trần Lan.pdf')).toBeInTheDocument();
    expect(within(rowOk).getByRole('button', { name: 'Tải về tệp CV Trần Lan.pdf' })).toBeInTheDocument();
    expect(within(rowOk).getByRole('button', { name: 'Tải về tệp anh.png' })).toBeInTheDocument();
    expect(rowOk.textContent).not.toContain('storageKey');
    expect(rowOk.textContent).not.toContain('uploads/');

    const rowQuota = screen.getByText('het@example.com').closest('tr');
    expect(within(rowQuota).getByTestId('answer-files-missing-f_cv')).toHaveTextContent('hết dung lượng');
    expect(within(rowQuota).queryByRole('button', { name: /^Tải về tệp/ })).not.toBeInTheDocument();
  });

  it('nút Tải về ở màn bài nộp gọi API với id biểu mẫu từ URL và id bài nộp của dòng', async () => {
    formAdminApi.fetchFormById.mockResolvedValue(FORM);
    formAdminApi.fetchFormSubmissions.mockResolvedValue({
      submissions: [{ id: 11, respondentName: 'Trần Lan', respondentEmail: 'lan@example.com', marketingConsent: true, createdAt: '2026-10-12T08:00:00.000Z', answers: RECEIVED }],
      total: 1, page: 1, pageSize: 20, totalPages: 1,
    });
    formAdminApi.fetchSubmissionFileLink.mockResolvedValue({ url: '/api/public/forms/files/x.y', fileName: 'anh.png', expiresAt: null });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(
      <MemoryRouter initialEntries={['/app/forms/form-file-sub-1/submissions']}>
        <I18nProvider>
          <Routes>
            <Route path="/app/forms/:id/submissions" element={<FormSubmissionsPage />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('lan@example.com')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Tải về tệp anh.png' }));
    await waitFor(() => expect(formAdminApi.fetchSubmissionFileLink).toHaveBeenCalledWith('form-file-sub-1', 11, 'f_cv', 1));
    clickSpy.mockRestore();
  });

  it('modal chi tiết khách: liệt kê tệp với nút Tải về theo formId + id bài nộp', async () => {
    formAdminApi.fetchSubmissionFileLink.mockResolvedValue({ url: '/api/public/forms/files/x.y', fileName: 'CV.pdf', expiresAt: null });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(
      <MemoryRouter>
        <I18nProvider>
          <FormLeadDetailModal
            submission={{
              id: 21, formId: 5, formTitle: 'Tuyển dụng', respondentName: 'Trần Lan', respondentEmail: 'lan@example.com',
              createdAt: '2026-10-12T08:00:00.000Z', status: 'submitted', marketingConsent: true, answers: RECEIVED,
            }}
            formFields={FORM.fields}
            onClose={() => {}}
          />
        </I18nProvider>
      </MemoryRouter>
    );
    const list = within(screen.getByTestId('form-lead-answer-list'));
    expect(list.getByText('CV Trần Lan.pdf')).toBeInTheDocument();
    fireEvent.click(list.getByRole('button', { name: 'Tải về tệp CV Trần Lan.pdf' }));
    await waitFor(() => expect(formAdminApi.fetchSubmissionFileLink).toHaveBeenCalledWith(5, 21, 'f_cv', 0));
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });
});
