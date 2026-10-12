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
    previewFormsSubmissions: vi.fn(),
    listLandingFormGroups: vi.fn(),
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
    formIds: [],
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

const previewOf = (columns, total = 0) => ({
  data: { data: { items: [], columns, pagination: { total, limit: 1, fetched: 0 } } },
});

const COLS_A = [
  { key: 'f_name', label: 'Họ tên', type: 'string' },
  { key: 'f_email', label: 'Email', type: 'string' },
];
const COLS_AB = [...COLS_A, { key: 'f_slot', label: 'Khung giờ', type: 'string' }];

const FORMS = [
  { id: 5, title: 'Form Tư Vấn', submissionCount: 10, settings: { consentEnabled: true } },
  { id: 6, title: 'Form Đặt Lịch', submissionCount: 4, settings: { consentEnabled: true } },
  { id: 7, title: 'Form Không Hỏi', submissionCount: 0, settings: { consentEnabled: false } },
];

describe('NodeConfigReadFormSubmissionsSection (PR-6b, PR-7b nhiều biểu mẫu)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    campaignBuilderApiService.listLandingFormGroups.mockResolvedValue({ data: { data: [] } });
  });

  it('tick một biểu mẫu -> formIds [5] (không còn formId), formColumnsSnapshot đúng, gọi preview MỘT biểu mẫu như trước', async () => {
    campaignBuilderApiService.listForms.mockResolvedValue({ data: { data: FORMS } });
    campaignBuilderApiService.previewFormSubmissions.mockResolvedValue(previewOf(COLS_A, 10));

    renderHarness();
    await waitFor(() => expect(screen.getByText(/Form Tư Vấn/)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/Form Tư Vấn/));

    await waitFor(() => {
      const fd = readFormData();
      expect(fd.formIds).toEqual([5]);
      expect(fd).not.toHaveProperty('formId');
      expect(fd.formColumnsSnapshot).toEqual(COLS_A);
      expect(fd.formConsentEnabled).toBe(true);
    });
    expect(campaignBuilderApiService.previewFormSubmissions).toHaveBeenCalledWith(5, { limit: 1 }, {});
    expect(campaignBuilderApiService.previewFormsSubmissions).not.toHaveBeenCalled();
  });

  it('tick thêm biểu mẫu thứ hai -> formIds [5,6], cột lấy từ preview GỘP, tóm tắt "Đã chọn 2 biểu mẫu"', async () => {
    campaignBuilderApiService.listForms.mockResolvedValue({ data: { data: FORMS } });
    campaignBuilderApiService.previewFormSubmissions.mockResolvedValue(previewOf(COLS_A, 10));
    campaignBuilderApiService.previewFormsSubmissions.mockResolvedValue(previewOf(COLS_AB, 12));

    renderHarness();
    await waitFor(() => expect(screen.getByText(/Form Tư Vấn/)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/Form Tư Vấn/));
    await waitFor(() => expect(readFormData().formIds).toEqual([5]));
    fireEvent.click(screen.getByLabelText(/Form Đặt Lịch/));

    await waitFor(() => {
      const fd = readFormData();
      expect(fd.formIds).toEqual([5, 6]);
      expect(fd.formColumnsSnapshot).toEqual(COLS_AB);
    });
    expect(campaignBuilderApiService.previewFormsSubmissions).toHaveBeenCalledWith([5, 6], { limit: 1 }, {});
    expect(screen.getByText('Đã chọn 2 biểu mẫu')).toBeInTheDocument();
  });

  it('bỏ tick -> gỡ khỏi formIds; bỏ hết -> formIds [] và snapshot rỗng; "Bỏ chọn tất cả" cũng vậy', async () => {
    campaignBuilderApiService.listForms.mockResolvedValue({ data: { data: FORMS } });
    campaignBuilderApiService.previewFormsSubmissions.mockResolvedValue(previewOf(COLS_AB));
    campaignBuilderApiService.previewFormSubmissions.mockResolvedValue(previewOf(COLS_A));

    renderHarness({ formIds: [5, 6], formColumnsSnapshot: COLS_AB, formConsentEnabled: true });
    await waitFor(() => expect(screen.getByText(/Form Tư Vấn/)).toBeInTheDocument());
    expect(screen.getByLabelText(/Form Tư Vấn/)).toBeChecked();
    expect(screen.getByLabelText(/Form Đặt Lịch/)).toBeChecked();

    fireEvent.click(screen.getByLabelText(/Form Tư Vấn/));
    await waitFor(() => expect(readFormData().formIds).toEqual([6]));

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ chọn tất cả' }));
    await waitFor(() => {
      const fd = readFormData();
      expect(fd.formIds).toEqual([]);
      expect(fd.formColumnsSnapshot).toEqual([]);
    });
  });

  it('ĐỒ THỊ CŨ chỉ có formId (chuỗi "5"): ô biểu mẫu 5 được tick, mở khung tải cột bằng preview MỘT biểu mẫu', async () => {
    campaignBuilderApiService.listForms.mockResolvedValue({ data: { data: FORMS } });
    campaignBuilderApiService.previewFormSubmissions.mockResolvedValue(previewOf(COLS_A, 10));

    renderHarness({ formIds: undefined, formId: '5' });
    await waitFor(() => expect(screen.getByText(/Form Tư Vấn/)).toBeInTheDocument());

    expect(screen.getByLabelText(/Form Tư Vấn/)).toBeChecked();
    expect(screen.getByLabelText(/Form Đặt Lịch/)).not.toBeChecked();
    await waitFor(() => expect(readFormData().formColumnsSnapshot).toEqual(COLS_A));
    expect(campaignBuilderApiService.previewFormSubmissions).toHaveBeenCalledWith(5, { limit: 1 }, {});
  });

  it('lối tắt "mọi biểu mẫu của landing": THÊM đủ biểu mẫu của landing vào lựa chọn, không trùng, không mất biểu mẫu đã chọn', async () => {
    campaignBuilderApiService.listForms.mockResolvedValue({ data: { data: FORMS } });
    campaignBuilderApiService.listLandingFormGroups.mockResolvedValue({
      data: {
        data: [
          { slug: 'landing-3', title: 'Landing ba biểu mẫu', formIds: [5, 6] },
          { slug: 'landing-rong', title: 'Landing rỗng', formIds: [] },
        ],
      },
    });
    campaignBuilderApiService.previewFormSubmissions.mockResolvedValue(previewOf(COLS_A));
    campaignBuilderApiService.previewFormsSubmissions.mockResolvedValue(previewOf(COLS_AB));

    renderHarness({ formIds: [7], formColumnsSnapshot: COLS_A });
    await waitFor(() => expect(screen.getByText(/Form Tư Vấn/)).toBeInTheDocument());
    const shortcut = await screen.findByLabelText('Chọn nhanh theo landing page');
    // Landing không có biểu mẫu bị ẩn khỏi lối tắt.
    expect(screen.queryByRole('option', { name: /Landing rỗng/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Landing ba biểu mẫu (2 biểu mẫu)' })).toBeInTheDocument();

    fireEvent.change(shortcut, { target: { value: 'landing-3' } });

    await waitFor(() => expect(readFormData().formIds).toEqual([7, 5, 6]));
    expect(campaignBuilderApiService.previewFormsSubmissions).toHaveBeenLastCalledWith([7, 5, 6], { limit: 1 }, {});

    // Chọn lại cùng landing: không nhân đôi.
    fireEvent.change(screen.getByLabelText('Chọn nhanh theo landing page'), { target: { value: 'landing-3' } });
    await waitFor(() => expect(campaignBuilderApiService.previewFormsSubmissions).toHaveBeenCalledTimes(2));
    expect(readFormData().formIds).toEqual([7, 5, 6]);
  });

  it('không tải được nhóm landing (403/lỗi mạng) -> không có lối tắt nhưng vẫn chọn biểu mẫu bình thường', async () => {
    campaignBuilderApiService.listForms.mockResolvedValue({ data: { data: FORMS } });
    campaignBuilderApiService.listLandingFormGroups.mockRejectedValue(new Error('403'));
    campaignBuilderApiService.previewFormSubmissions.mockResolvedValue(previewOf(COLS_A));

    renderHarness();
    await waitFor(() => expect(screen.getByText(/Form Tư Vấn/)).toBeInTheDocument());
    expect(screen.queryByLabelText('Chọn nhanh theo landing page')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Form Tư Vấn/));
    await waitFor(() => expect(readFormData().formIds).toEqual([5]));
  });

  it('tick nhanh hai biểu mẫu: lượt tải cột cũ trả về MUỘN không được ghi đè lượt mới', async () => {
    campaignBuilderApiService.listForms.mockResolvedValue({ data: { data: FORMS } });
    let resolveSlow;
    campaignBuilderApiService.previewFormSubmissions.mockImplementation(
      () => new Promise((resolve) => { resolveSlow = resolve; })
    );
    campaignBuilderApiService.previewFormsSubmissions.mockResolvedValue(previewOf(COLS_AB));

    renderHarness();
    await waitFor(() => expect(screen.getByText(/Form Tư Vấn/)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/Form Tư Vấn/)); // lượt 1: chậm
    fireEvent.click(screen.getByLabelText(/Form Đặt Lịch/)); // lượt 2: nhanh
    await waitFor(() => expect(readFormData().formColumnsSnapshot).toEqual(COLS_AB));

    resolveSlow(previewOf(COLS_A)); // lượt 1 về muộn
    await new Promise((r) => setTimeout(r, 20));
    expect(readFormData().formColumnsSnapshot).toEqual(COLS_AB);
  });

  it('biểu mẫu consentEnabled: false -> hiện cảnh báo; true -> không cảnh báo', async () => {
    campaignBuilderApiService.listForms.mockResolvedValue({ data: { data: FORMS } });
    campaignBuilderApiService.previewFormSubmissions.mockResolvedValue(previewOf([]));

    renderHarness();
    await waitFor(() => expect(screen.getByText(/Form Không Hỏi/)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/Form Tư Vấn/));
    await waitFor(() => expect(readFormData().formIds).toEqual([5]));
    expect(screen.queryByText(/chưa hỏi đồng ý nhận tin/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Form Tư Vấn/)); // bỏ
    fireEvent.click(screen.getByLabelText(/Form Không Hỏi/));
    await waitFor(() => expect(screen.getByText(/chưa hỏi đồng ý nhận tin/i)).toBeInTheDocument());
  });

  it('nhiều biểu mẫu: cảnh báo NÊU TÊN biểu mẫu chưa hỏi đồng ý (các biểu mẫu khác vẫn lấy được người)', async () => {
    campaignBuilderApiService.listForms.mockResolvedValue({ data: { data: FORMS } });
    campaignBuilderApiService.previewFormSubmissions.mockResolvedValue(previewOf([]));
    campaignBuilderApiService.previewFormsSubmissions.mockResolvedValue(previewOf([]));

    renderHarness();
    await waitFor(() => expect(screen.getByText(/Form Tư Vấn/)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/Form Tư Vấn/));
    fireEvent.click(screen.getByLabelText(/Form Không Hỏi/));

    await waitFor(() => {
      expect(screen.getByText(/Các biểu mẫu sau chưa hỏi đồng ý nhận tin nên không lấy được ai: Form Không Hỏi/)).toBeInTheDocument();
    });
    expect(readFormData().formConsentEnabled).toBe(false);
  });

  it('chọn trường "Email công ty" cho Email -> config.fieldMap.emailKey = KEY của trường, không phải nhãn', async () => {
    campaignBuilderApiService.listForms.mockResolvedValue({
      data: { data: [{ id: 7, title: 'Form 2 Email', submissionCount: 1, settings: { consentEnabled: true } }] },
    });
    campaignBuilderApiService.previewFormSubmissions.mockResolvedValue(
      previewOf([
        { key: 'f_personal_email', label: 'Email cá nhân', type: 'string' },
        { key: 'f_company_email', label: 'Email công ty', type: 'string' },
      ], 1)
    );

    renderHarness();
    await waitFor(() => expect(screen.getByText(/Form 2 Email/)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/Form 2 Email/));

    await waitFor(() => {
      expect(screen.getByLabelText('Trường Email')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Trường Email'), { target: { value: 'f_company_email' } });

    await waitFor(() => {
      const fd = readFormData();
      expect(fd.fieldMap.emailKey).toBe('f_company_email');
      expect(fd.fieldMap.emailKey).not.toBe('Email công ty');
    });
  });

  it('nhiều biểu mẫu: khung ánh xạ nói rõ ánh xạ áp cho mọi biểu mẫu (biểu mẫu thiếu trường rơi về vai trò)', async () => {
    campaignBuilderApiService.listForms.mockResolvedValue({ data: { data: FORMS } });
    campaignBuilderApiService.previewFormsSubmissions.mockResolvedValue(previewOf(COLS_AB));

    renderHarness({ formIds: [5, 6], formColumnsSnapshot: COLS_AB, formConsentEnabled: true });
    await waitFor(() => expect(screen.getByText(/Form Tư Vấn/)).toBeInTheDocument());

    expect(screen.getByText(/áp cho mọi biểu mẫu đã chọn/i)).toBeInTheDocument();
  });

  it('preview trả 404 (biểu mẫu đã bị xoá) -> khung báo lỗi, không vỡ (component vẫn render)', async () => {
    campaignBuilderApiService.listForms.mockResolvedValue({
      data: { data: [{ id: 3, title: 'Form Sẽ Xoá', submissionCount: 0, settings: { consentEnabled: true } }] },
    });
    const notFoundError = new Error('Không tìm thấy biểu mẫu');
    notFoundError.response = { status: 404, data: { message: 'Không tìm thấy biểu mẫu' } };
    campaignBuilderApiService.previewFormSubmissions.mockRejectedValue(notFoundError);

    renderHarness();
    await waitFor(() => expect(screen.getByText(/Form Sẽ Xoá/)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/Form Sẽ Xoá/));

    await waitFor(() => {
      expect(screen.getByText(/bị xoá/i)).toBeInTheDocument();
    });
    // Danh sách vẫn còn nguyên, không văng lỗi React
    expect(screen.getByLabelText(/Form Sẽ Xoá/)).toBeInTheDocument();
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

  it('chưa có biểu mẫu nào -> hướng dẫn tạo biểu mẫu mới', async () => {
    campaignBuilderApiService.listForms.mockResolvedValue({ data: { data: [] } });

    renderHarness();

    await waitFor(() => {
      expect(screen.getByText(/Tạo biểu mẫu mới/i)).toBeInTheDocument();
    });
  });
});
