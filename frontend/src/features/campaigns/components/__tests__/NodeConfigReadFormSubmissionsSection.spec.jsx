import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../../i18n';
import { NodeConfigReadFormSubmissionsSection } from '../NodeConfigReadFormSubmissionsSection';
import campaignBuilderApiService from '../../services/campaignBuilderApi.service';

vi.mock('../../services/campaignBuilderApi.service', () => ({
  default: {
    listForms: vi.fn(),
    previewFormSubmissions: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function Harness({ initial = {} }) {
  const [formData, setFormData] = useState({
    formId: '',
    fieldMap: {},
    formColumnsSnapshot: [],
    formConsentEnabled: false,
    dataSelectedColumns: [],
    formSubmissionsLimit: 1000,
    ...initial,
  });
  return (
    <div>
      <NodeConfigReadFormSubmissionsSection formData={formData} setFormData={setFormData} />
      <pre data-testid="form-data-json">{JSON.stringify(formData)}</pre>
    </div>
  );
}

function renderHarness(initial = {}) {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <Harness initial={initial} />
      </I18nProvider>
    </MemoryRouter>
  );
}

const readFormData = () => JSON.parse(screen.getByTestId('form-data-json').textContent);

describe('NodeConfigReadFormSubmissionsSection (PR-6b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('chọn form -> config có formId + formColumnsSnapshot đúng columns của preview', async () => {
    campaignBuilderApiService.listForms.mockResolvedValue({
      data: {
        data: [
          { id: 5, title: 'Form Tư Vấn', submissionCount: 10, settings: { consentEnabled: true } },
        ],
      },
    });
    campaignBuilderApiService.previewFormSubmissions.mockResolvedValue({
      data: {
        data: {
          items: [],
          columns: [
            { key: 'f_name', label: 'Họ tên', type: 'string' },
            { key: 'f_email', label: 'Email', type: 'string' },
          ],
          pagination: { total: 10, limit: 1, fetched: 0 },
        },
      },
    });

    renderHarness();

    await waitFor(() => {
      expect(screen.getByText(/Form Tư Vấn/)).toBeInTheDocument();
    });

    const select = screen.getByLabelText('Chọn biểu mẫu');
    fireEvent.change(select, { target: { value: '5' } });

    await waitFor(() => {
      const fd = readFormData();
      expect(fd.formId).toBe('5');
      expect(fd.formColumnsSnapshot).toEqual([
        { key: 'f_name', label: 'Họ tên', type: 'string' },
        { key: 'f_email', label: 'Email', type: 'string' },
      ]);
    });
    expect(campaignBuilderApiService.previewFormSubmissions).toHaveBeenCalledWith('5', { limit: 1 });
  });

  it('form consentEnabled: false -> hiện cảnh báo; true -> không cảnh báo', async () => {
    campaignBuilderApiService.listForms.mockResolvedValue({
      data: {
        data: [
          { id: 1, title: 'Form Không Hỏi', submissionCount: 0, settings: { consentEnabled: false } },
        ],
      },
    });
    campaignBuilderApiService.previewFormSubmissions.mockResolvedValue({
      data: { data: { items: [], columns: [], pagination: { total: 0 } } },
    });

    renderHarness();
    await waitFor(() => expect(screen.getByText(/Form Không Hỏi/)).toBeInTheDocument());

    const select = screen.getByLabelText('Chọn biểu mẫu');
    fireEvent.change(select, { target: { value: '1' } });

    await waitFor(() => {
      expect(screen.getByText(/chưa hỏi đồng ý nhận tin/i)).toBeInTheDocument();
    });
  });

  it('form consentEnabled: true -> KHÔNG hiện cảnh báo', async () => {
    campaignBuilderApiService.listForms.mockResolvedValue({
      data: {
        data: [{ id: 2, title: 'Form Đã Hỏi', submissionCount: 3, settings: { consentEnabled: true } }],
      },
    });
    campaignBuilderApiService.previewFormSubmissions.mockResolvedValue({
      data: { data: { items: [], columns: [], pagination: { total: 3 } } },
    });

    renderHarness();
    await waitFor(() => expect(screen.getByText(/Form Đã Hỏi/)).toBeInTheDocument());

    const select = screen.getByLabelText('Chọn biểu mẫu');
    fireEvent.change(select, { target: { value: '2' } });

    await waitFor(() => {
      const fd = readFormData();
      expect(fd.formConsentEnabled).toBe(true);
    });
    expect(screen.queryByText(/chưa hỏi đồng ý nhận tin/i)).not.toBeInTheDocument();
  });

  it('chọn trường "Email công ty" cho Email -> config.fieldMap.emailKey = KEY của trường, không phải nhãn', async () => {
    campaignBuilderApiService.listForms.mockResolvedValue({
      data: {
        data: [{ id: 7, title: 'Form 2 Email', submissionCount: 1, settings: { consentEnabled: true } }],
      },
    });
    campaignBuilderApiService.previewFormSubmissions.mockResolvedValue({
      data: {
        data: {
          items: [],
          columns: [
            { key: 'f_personal_email', label: 'Email cá nhân', type: 'string' },
            { key: 'f_company_email', label: 'Email công ty', type: 'string' },
          ],
          pagination: { total: 1 },
        },
      },
    });

    renderHarness();
    await waitFor(() => expect(screen.getByText(/Form 2 Email/)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Chọn biểu mẫu'), { target: { value: '7' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Trường Email')).toBeInTheDocument();
    });

    const emailFieldSelect = screen.getByLabelText('Trường Email');
    fireEvent.change(emailFieldSelect, { target: { value: 'f_company_email' } });

    await waitFor(() => {
      const fd = readFormData();
      expect(fd.fieldMap.emailKey).toBe('f_company_email');
      expect(fd.fieldMap.emailKey).not.toBe('Email công ty');
    });
  });

  it('preview trả 404 (form đã bị xoá) -> khung báo lỗi, không vỡ (component vẫn render)', async () => {
    campaignBuilderApiService.listForms.mockResolvedValue({
      data: { data: [{ id: 3, title: 'Form Sẽ Xoá', submissionCount: 0, settings: { consentEnabled: true } }] },
    });
    const notFoundError = new Error('Không tìm thấy biểu mẫu');
    notFoundError.response = { status: 404, data: { message: 'Không tìm thấy biểu mẫu' } };
    campaignBuilderApiService.previewFormSubmissions.mockRejectedValue(notFoundError);

    renderHarness();
    await waitFor(() => expect(screen.getByText(/Form Sẽ Xoá/)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Chọn biểu mẫu'), { target: { value: '3' } });

    await waitFor(() => {
      expect(screen.getByText(/bị xoá/i)).toBeInTheDocument();
    });
    // Modal/section vẫn còn nguyên, không văng lỗi React
    expect(screen.getByLabelText('Chọn biểu mẫu')).toBeInTheDocument();
  });

  it('GET /api/forms trả 403 -> câu báo cần quyền Biểu mẫu', async () => {
    const forbiddenError = new Error('Forbidden');
    forbiddenError.response = { status: 403 };
    campaignBuilderApiService.listForms.mockRejectedValue(forbiddenError);

    renderHarness();

    await waitFor(() => {
      expect(screen.getByText(/quyền Biểu mẫu/i)).toBeInTheDocument();
    });
  });

  it('chưa có form nào -> hướng dẫn tạo form mới', async () => {
    campaignBuilderApiService.listForms.mockResolvedValue({ data: { data: [] } });

    renderHarness();

    await waitFor(() => {
      expect(screen.getByText(/Tạo biểu mẫu mới/i)).toBeInTheDocument();
    });
  });
});
