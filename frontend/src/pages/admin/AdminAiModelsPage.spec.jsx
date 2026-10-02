import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import toast from 'react-hot-toast';
import { I18nProvider } from '../../i18n';
import AdminAiModelsPage from './AdminAiModelsPage';

const {
  mockList,
  mockUpdate,
  mockSync,
  mockSetSystemModel,
  mockSetFallbackModel,
} = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockUpdate: vi.fn(),
  mockSync: vi.fn(),
  mockSetSystemModel: vi.fn(),
  mockSetFallbackModel: vi.fn(),
}));

vi.mock('../../features/admin/services/adminAiModelsApi.service', () => ({
  default: {
    list: mockList,
    update: mockUpdate,
    sync: mockSync,
    setSystemModel: mockSetSystemModel,
    setFallbackModel: mockSetFallbackModel,
  },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function listResponse(models = []) {
  return {
    data: {
      data: {
        models,
        avgPromptTokens: 10000,
        avgOutputTokens: 500,
        basis: 'estimate',
        usdVndRate: 24000,
      },
    },
  };
}

function renderPage() {
  return render(
    <I18nProvider defaultLocale="vi">
      <AdminAiModelsPage />
    </I18nProvider>
  );
}

describe('AdminAiModelsPage — Fallback model selection and retired warnings (PR-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('3 model: A bật, B dự phòng, C thường -> mặc định bảng có A + B (B có huy hiệu), KHÔNG có C', async () => {
    const models = [
      { modelId: 'model-a', displayName: 'Model A', isEnabled: true, isFallback: false, supportsGenerateContent: true },
      { modelId: 'model-b', displayName: 'Model B', isEnabled: false, isFallback: true, supportsGenerateContent: true },
      { modelId: 'model-c', displayName: 'Model C', isEnabled: false, isFallback: false, supportsGenerateContent: true },
    ];
    mockList.mockResolvedValueOnce(listResponse(models));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('model-a')).toBeInTheDocument();
      expect(screen.getByText('model-b')).toBeInTheDocument();
    });

    expect(screen.queryByText('model-c')).not.toBeInTheDocument();

    const badge = screen.getByText('Dự phòng');
    expect(badge).toBeInTheDocument();
  });

  it('ô chọn model dự phòng có "Không dùng", B, C; KHÔNG có A; D không hỗ trợ cũng không có', async () => {
    const models = [
      { modelId: 'model-a', displayName: 'Model A', isEnabled: true, isFallback: false, supportsGenerateContent: true },
      { modelId: 'model-b', displayName: 'Model B', isEnabled: false, isFallback: true, supportsGenerateContent: true },
      { modelId: 'model-c', displayName: 'Model C', isEnabled: false, isFallback: false, supportsGenerateContent: true },
      { modelId: 'model-d', displayName: 'Model D', isEnabled: false, isFallback: false, supportsGenerateContent: false },
    ];
    mockList.mockResolvedValueOnce(listResponse(models));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('model-a')).toBeInTheDocument();
    });

    const select = screen.getByLabelText('Model dự phòng');
    const options = Array.from(select.querySelectorAll('option')).map((opt) => ({
      value: opt.value,
      text: opt.textContent,
    }));

    expect(options.map((o) => o.value)).toEqual(['', 'model-b', 'model-c']);
    expect(options.find((o) => o.value === 'model-a')).toBeUndefined();
    expect(options.find((o) => o.value === 'model-d')).toBeUndefined();
    expect(select.value).toBe('model-b');
  });

  it('chọn C -> gọi setFallbackModel("model-c") và huy hiệu chuyển sang C', async () => {
    const models = [
      { modelId: 'model-a', displayName: 'Model A', isEnabled: true, isFallback: false, supportsGenerateContent: true },
      { modelId: 'model-b', displayName: 'Model B', isEnabled: false, isFallback: true, supportsGenerateContent: true },
      { modelId: 'model-c', displayName: 'Model C', isEnabled: false, isFallback: false, supportsGenerateContent: true },
    ];
    mockList.mockResolvedValueOnce(listResponse(models));
    mockSetFallbackModel.mockResolvedValueOnce({ data: { success: true, data: { fallbackModel: 'model-c' } } });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('model-a')).toBeInTheDocument();
    });

    const select = screen.getByLabelText('Model dự phòng');
    fireEvent.change(select, { target: { value: 'model-c' } });

    await waitFor(() => {
      expect(mockSetFallbackModel).toHaveBeenCalledWith('model-c');
    });

    expect(toast.success).toHaveBeenCalledWith('Đã đặt model-c làm model dự phòng');
    expect(select.value).toBe('model-c');

    // C hiện lên trong bảng và có huy hiệu Dự phòng
    expect(screen.getByText('model-c')).toBeInTheDocument();
    expect(screen.getByText('Dự phòng')).toBeInTheDocument();
  });

  it('chọn "Không dùng" -> gọi setFallbackModel(null)', async () => {
    const models = [
      { modelId: 'model-a', displayName: 'Model A', isEnabled: true, isFallback: false, supportsGenerateContent: true },
      { modelId: 'model-b', displayName: 'Model B', isEnabled: false, isFallback: true, supportsGenerateContent: true },
    ];
    mockList.mockResolvedValueOnce(listResponse(models));
    mockSetFallbackModel.mockResolvedValueOnce({ data: { success: true, data: { fallbackModel: null } } });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('model-a')).toBeInTheDocument();
    });

    const select = screen.getByLabelText('Model dự phòng');
    fireEvent.change(select, { target: { value: '' } });

    await waitFor(() => {
      expect(mockSetFallbackModel).toHaveBeenCalledWith(null);
    });

    expect(toast.success).toHaveBeenCalledWith('Đã bỏ model dự phòng');
    expect(select.value).toBe('');
    expect(screen.queryByText('Dự phòng')).not.toBeInTheDocument();
  });

  it('API ném lỗi kèm message -> ô chọn trả về B; toast.error nhận đúng message server', async () => {
    const models = [
      { modelId: 'model-a', displayName: 'Model A', isEnabled: true, isFallback: false, supportsGenerateContent: true },
      { modelId: 'model-b', displayName: 'Model B', isEnabled: false, isFallback: true, supportsGenerateContent: true },
      { modelId: 'model-c', displayName: 'Model C', isEnabled: false, isFallback: false, supportsGenerateContent: true },
    ];
    mockList.mockResolvedValueOnce(listResponse(models));
    mockSetFallbackModel.mockRejectedValueOnce({
      response: { data: { message: 'Model dự phòng không hợp lệ' } },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('model-a')).toBeInTheDocument();
    });

    const select = screen.getByLabelText('Model dự phòng');
    expect(select.value).toBe('model-b');

    fireEvent.change(select, { target: { value: 'model-c' } });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Model dự phòng không hợp lệ');
    });

    // Ô chọn phải được khôi phục về B
    expect(select.value).toBe('model-b');
  });

  it('chọn B làm model hệ thống -> B mất huy hiệu dự phòng; ô chọn về "Không dùng"', async () => {
    const models = [
      { modelId: 'model-a', displayName: 'Model A', isEnabled: true, isFallback: false, supportsGenerateContent: true },
      { modelId: 'model-b', displayName: 'Model B', isEnabled: false, isFallback: true, supportsGenerateContent: true },
    ];
    mockList.mockResolvedValueOnce(listResponse(models));
    mockSetSystemModel.mockResolvedValueOnce({ data: { success: true } });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('model-b')).toBeInTheDocument();
    });

    const radioButtons = screen.getAllByRole('radio');
    // Radio thứ hai thuộc về model-b
    fireEvent.click(radioButtons[1]);

    await waitFor(() => {
      expect(mockSetSystemModel).toHaveBeenCalledWith('model-b');
    });

    // B không còn huy hiệu dự phòng
    expect(screen.queryByText('Dự phòng')).not.toBeInTheDocument();

    // Ô chọn tự về "Không dùng"
    const select = screen.getByLabelText('Model dự phòng');
    expect(select.value).toBe('');
  });

  it('A bật nhưng !supportsGenerateContent, B dự phòng -> dải cảnh báo nêu A và nêu B đang chạy', async () => {
    const models = [
      { modelId: 'model-a', displayName: 'Model A', isEnabled: true, isFallback: false, supportsGenerateContent: false },
      { modelId: 'model-b', displayName: 'Model B', isEnabled: false, isFallback: true, supportsGenerateContent: true },
    ];
    mockList.mockResolvedValueOnce(listResponse(models));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Google đã ngừng cung cấp model hệ thống \(model-a\)/)).toBeInTheDocument();
    });

    const bannerText = screen.getByText(/Google đã ngừng cung cấp model hệ thống/).textContent;
    expect(bannerText).toContain('model-a');
    expect(bannerText).toContain('model-b');
  });

  it('A bật nhưng !supportsGenerateContent, không có dự phòng -> dải cảnh báo nêu "model mặc định của hệ thống"', async () => {
    const models = [
      { modelId: 'model-a', displayName: 'Model A', isEnabled: true, isFallback: false, supportsGenerateContent: false },
      { modelId: 'model-c', displayName: 'Model C', isEnabled: false, isFallback: false, supportsGenerateContent: true },
    ];
    mockList.mockResolvedValueOnce(listResponse(models));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Google đã ngừng cung cấp model hệ thống \(model-a\)/)).toBeInTheDocument();
    });

    const bannerText = screen.getByText(/Google đã ngừng cung cấp model hệ thống/).textContent;
    expect(bannerText).toContain('model-a');
    expect(bannerText).toContain('model mặc định của hệ thống');
  });

  it('B dự phòng nhưng !supportsGenerateContent -> dải cảnh báo dự phòng bị khai tử', async () => {
    const models = [
      { modelId: 'model-a', displayName: 'Model A', isEnabled: true, isFallback: false, supportsGenerateContent: true },
      { modelId: 'model-b', displayName: 'Model B', isEnabled: false, isFallback: true, supportsGenerateContent: false },
    ];
    mockList.mockResolvedValueOnce(listResponse(models));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Model dự phòng \(model-b\) đã bị Google ngừng cung cấp/)).toBeInTheDocument();
    });
  });
});

// PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-8 (C-16): cot gia la "chi phi moi LUOT GOI Gemini", uu tien so THUC DO 30 ngay.
describe('AdminAiModelsPage - chi phi moi luot goi (thuc do 30 ngay)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const priced = (over = {}) => ({
    configured: true,
    inputUsdPerM: 1.5,
    outputUsdPerM: 9,
    costPerAnswerVnd: 468,
    measured: null,
    ...over,
  });

  it('cot doi ten "Chi phi moi luot goi (30 ngay)", khong con "Gia moi luot tra loi"', async () => {
    mockList.mockResolvedValueOnce(listResponse([
      { modelId: 'model-a', displayName: 'A', isEnabled: true, isFallback: false, supportsGenerateContent: true, pricing: priced() },
    ]));
    renderPage();
    await waitFor(() => expect(screen.getByText('model-a')).toBeInTheDocument());
    expect(screen.getByText('Chi phí mỗi lượt gọi (30 ngày)')).toBeInTheDocument();
    expect(screen.queryByText('Giá mỗi lượt trả lời')).not.toBeInTheDocument();
  });

  it('model co luot goi thuc: hien so THUC DO + so luot goi (khong hien so uoc tinh)', async () => {
    mockList.mockResolvedValueOnce(listResponse([
      {
        modelId: 'model-a', displayName: 'A', isEnabled: true, isFallback: false, supportsGenerateContent: true,
        pricing: priced({ measured: { calls: 1593, costPerCallVnd: 1320 } }),
      },
    ]));
    renderPage();
    await waitFor(() => expect(screen.getByText('model-a')).toBeInTheDocument());
    const row = screen.getByText('model-a').closest('tr');
    expect(within(row).getByText('~1.320đ')).toBeInTheDocument();
    expect(within(row).getByText(/Thực đo · 1\.593 lượt gọi trong 30 ngày/)).toBeInTheDocument();
    expect(within(row).queryByText(/468/)).not.toBeInTheDocument();
    expect(within(row).queryByText(/ước tính/)).not.toBeInTheDocument();
    // gia niem yet van hien
    expect(within(row).getByText(/\$1\.50 \/ \$9\.00/)).toBeInTheDocument();
  });

  it('model chua co luot goi: hien so UOC TINH ghi ro "uoc tinh" thay vi bo trong', async () => {
    mockList.mockResolvedValueOnce(listResponse([
      {
        modelId: 'model-b', displayName: 'B', isEnabled: true, isFallback: false, supportsGenerateContent: true,
        pricing: priced({ costPerAnswerVnd: 225, measured: null }),
      },
    ]));
    renderPage();
    await waitFor(() => expect(screen.getByText('model-b')).toBeInTheDocument());
    const row = screen.getByText('model-b').closest('tr');
    expect(within(row).getByText(/~225đ/)).toBeInTheDocument();
    expect(within(row).getByText('(ước tính)')).toBeInTheDocument();
    expect(within(row).getByText(/Chưa có lượt gọi trong 30 ngày/)).toBeInTheDocument();
  });

  it('model chua co gia: van bao "Chua co gia", khong hien so nao', async () => {
    mockList.mockResolvedValueOnce(listResponse([
      {
        modelId: 'model-c', displayName: 'C', isEnabled: true, isFallback: false, supportsGenerateContent: true,
        pricing: { configured: false, inputUsdPerM: null, outputUsdPerM: null, costPerAnswerVnd: null, measured: null },
      },
    ]));
    renderPage();
    await waitFor(() => expect(screen.getByText('model-c')).toBeInTheDocument());
    const row = screen.getByText('model-c').closest('tr');
    expect(within(row).getByText(/Chưa có giá/)).toBeInTheDocument();
    expect(within(row).queryByText(/~\d/)).not.toBeInTheDocument();
  });

  // PLAN_GOP_MAU_TIN_MEDIA_VA_VIEC_LE_2026-10-03, PR-L / L1: giá một model đổi theo ngày (3.8-flash hết khuyến mãi 31/12/2026).
  it('model co muc gia sap toi: hien gia DANG ap dung + dong "Tu 01/01/2027: $1.50 / $7.50 moi 1tr token"', async () => {
    mockList.mockResolvedValueOnce(listResponse([
      {
        modelId: 'model-d', displayName: 'D', isEnabled: true, isFallback: false, supportsGenerateContent: true,
        pricing: priced({
          inputUsdPerM: 0.75,
          outputUsdPerM: 3.75,
          costPerAnswerVnd: 225,
          upcoming: { from: '2027-01-01', inputUsdPerM: 1.5, outputUsdPerM: 7.5 },
        }),
      },
    ]));
    renderPage();
    const row = (await screen.findByText('model-d', {}, { timeout: 5000 })).closest('tr');
    expect(within(row).getByText(/\$0\.75 \/ \$3\.75/)).toBeInTheDocument();
    expect(within(row).getByTestId('upcoming-price-model-d')).toHaveTextContent('Từ 01/01/2027: $1.50 / $7.50 mỗi 1tr token');
  });

  it('model gia khong doi (khong co muc sap toi): khong co dong "Tu ..."', async () => {
    mockList.mockResolvedValueOnce(listResponse([
      {
        modelId: 'model-e', displayName: 'E', isEnabled: true, isFallback: false, supportsGenerateContent: true,
        pricing: priced({ upcoming: null }),
      },
    ]));
    renderPage();
    const row = (await screen.findByText('model-e', {}, { timeout: 5000 })).closest('tr');
    expect(within(row).getByText(/\$1\.50 \/ \$9\.00/)).toBeInTheDocument();
    expect(within(row).queryByTestId('upcoming-price-model-e')).not.toBeInTheDocument();
    expect(within(row).queryByText(/^Từ /)).not.toBeInTheDocument();
  });
});
