import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import FormEditorPage from '../pages/FormEditorPage';
import * as formAdminApi from '../services/formAdminApi.service';
import { openSettingsTab } from './formEditorTestUtils';

/**
 * PR-8b (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, mục 7): tab "Giao diện" có thêm màu chữ, kiểu nút, bo góc nút / khung,
 * kiểu ô nhập, ảnh nền + độ tối, cảnh báo tương phản. Chốt: (1) trình soạn gửi ĐỦ mọi khoá theme đã đặt (backend thay cả theme
 * mỗi lần lưu) kể cả khi chỉ đổi một khoá khác; (2) khoá chưa đặt vắng mặt; (3) xem trước sống phản ánh từng khoá.
 * Test hợp đồng payload cũ (FormEditorPage.payload.contract.spec.jsx) giữ nguyên.
 */

vi.mock('../services/formAdminApi.service', () => ({
  fetchFormById: vi.fn(),
  createForm: vi.fn(),
  updateForm: vi.fn(),
  uploadFormTempFile: vi.fn(),
  uploadFormAsset: vi.fn(),
}));

vi.mock('../../storage/useStorageQuota', () => ({
  default: () => ({ usage: null }),
}));

vi.mock('../../storage/storageEvents', () => ({
  notifyStorageQuotaRefresh: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const mockAuthState = { user: null, activeContext: { type: 'self' } };
vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector) => selector(mockAuthState),
}));

const BG_KEY = 'uploads/1/forms/nen_abc.jpg';
const BG_URL = 'https://cdn.example.com/lp-assets/uploads/1/forms/nen_abc.jpg';

const EXISTING_FORM = {
  id: 'form-extra-1',
  title: 'Biểu mẫu giao diện thêm',
  description: '',
  isPublished: true,
  fields: [{ key: 'f_name', label: 'Họ và tên', type: 'short_text', required: true, role: 'name' }],
  settings: { notifyOwner: true, consentEnabled: true, sendConfirmation: false, submitButtonText: 'Gửi', successMessage: 'Cảm ơn', redirectUrl: '' },
};

const FULL_EXTRA_THEME = {
  preset: 'classic',
  primaryColor: '#1D4ED8',
  backgroundColor: '#F8FAFC',
  textColor: '#0F172A',
  buttonStyle: 'outline',
  buttonRadius: 'full',
  cardRadius: 'lg',
  inputStyle: 'filled',
  backgroundImageKey: BG_KEY,
  backgroundImageUrl: BG_URL,
  backgroundImageOverlay: 55,
};

const NEW_KEYS = ['textColor', 'buttonStyle', 'buttonRadius', 'cardRadius', 'inputStyle', 'backgroundImageKey', 'backgroundImageOverlay'];

const renderEdit = async (theme) => {
  formAdminApi.fetchFormById.mockResolvedValue({ ...EXISTING_FORM, theme });
  formAdminApi.updateForm.mockResolvedValue({ ...EXISTING_FORM, theme });
  const utils = render(
    <MemoryRouter initialEntries={['/app/forms/form-extra-1/edit']}>
      <I18nProvider>
        <Routes>
          <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.getByDisplayValue('Biểu mẫu giao diện thêm')).toBeInTheDocument());
  return utils;
};

const renderNew = () => {
  formAdminApi.createForm.mockResolvedValue({ id: 'new-extra' });
  const utils = render(
    <MemoryRouter initialEntries={['/app/forms/new']}>
      <I18nProvider>
        <Routes>
          <Route path="/app/forms/new" element={<FormEditorPage />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>
  );
  fireEvent.click(screen.getByTestId('form-template-blank'));
  fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i), { target: { value: 'Biểu mẫu mới' } });
  return utils;
};

const saveAndGetUpdatePayload = async () => {
  fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));
  await waitFor(() => expect(formAdminApi.updateForm).toHaveBeenCalledTimes(1));
  return formAdminApi.updateForm.mock.calls[0][1];
};

const saveAndGetCreatePayload = async () => {
  fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));
  await waitFor(() => expect(formAdminApi.createForm).toHaveBeenCalledTimes(1));
  return formAdminApi.createForm.mock.calls[0][0];
};

/** Điều khiển (select / input) nằm trong cùng khối với nhãn `text` trong modal Cài đặt. */
const controlOf = (text, selector) => within(screen.getByRole('dialog')).getByText(text).closest('div').querySelector(selector);
const previewSubmit = () => within(screen.getByTestId('form-preview-pane')).getByRole('button', { name: 'Gửi thông tin' });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('Trình soạn biểu mẫu — giao diện thêm (PR-8b): payload', () => {
  it('nạp biểu mẫu có đủ khoá mới rồi Lưu không đổi gì -> payload.theme có ĐỦ cả 7 khoá mới, không có URL xem trước', async () => {
    await renderEdit(FULL_EXTRA_THEME);
    const payload = await saveAndGetUpdatePayload();

    expect(payload.theme).toEqual({
      preset: 'classic',
      primaryColor: '#1D4ED8',
      backgroundColor: '#F8FAFC',
      textColor: '#0F172A',
      buttonStyle: 'outline',
      buttonRadius: 'full',
      cardRadius: 'lg',
      inputStyle: 'filled',
      backgroundImageKey: BG_KEY,
      backgroundImageOverlay: 55,
    });
    expect(payload.theme).not.toHaveProperty('backgroundImageUrl');
  });

  it('chỉ đổi màu chủ đạo -> mọi khoá mới đã đặt vẫn đi theo (backend thay cả theme)', async () => {
    await renderEdit(FULL_EXTRA_THEME);
    openSettingsTab('theme');
    fireEvent.change(screen.getByPlaceholderText('#DF5C0E'), { target: { value: '#222222' } });
    const payload = await saveAndGetUpdatePayload();

    expect(payload.theme.primaryColor).toBe('#222222');
    for (const key of NEW_KEYS) expect(payload.theme).toHaveProperty(key);
    expect(payload.theme.backgroundImageKey).toBe(BG_KEY);
    expect(payload.theme.backgroundImageOverlay).toBe(55);
  });

  it('chọn mẫu dựng sẵn không đụng các khoá mới (mẫu chỉ gán màu / font / bố cục)', async () => {
    await renderEdit(FULL_EXTRA_THEME);
    openSettingsTab('theme');
    fireEvent.click(screen.getByRole('button', { name: /Tươi mới/i }));
    const payload = await saveAndGetUpdatePayload();

    expect(payload.theme.preset).toBe('fresh');
    expect(payload.theme.textColor).toBe('#0F172A');
    expect(payload.theme.buttonStyle).toBe('outline');
    expect(payload.theme.backgroundImageKey).toBe(BG_KEY);
  });

  it('biểu mẫu cũ (chỉ khoá cũ): lưu lại KHÔNG sinh thêm khoá mới nào', async () => {
    await renderEdit({ preset: 'classic', primaryColor: '#DF5C0E', backgroundColor: '#F9FAFB', fontFamily: 'Inter', layout: 'card' });
    const payload = await saveAndGetUpdatePayload();

    expect(payload.theme).toEqual({
      preset: 'classic',
      primaryColor: '#DF5C0E',
      backgroundColor: '#F9FAFB',
      fontFamily: 'Inter',
      layout: 'card',
    });
    for (const key of NEW_KEYS) expect(payload.theme).not.toHaveProperty(key);
  });

  it('đặt từng ô trong tab Giao diện rồi lưu -> payload mang đúng giá trị', async () => {
    renderNew();
    openSettingsTab('theme');

    fireEvent.change(screen.getByPlaceholderText('#1E293B'), { target: { value: '#123456' } });
    fireEvent.change(controlOf('Kiểu nút gửi', 'select'), { target: { value: 'outline' } });
    fireEvent.change(controlOf('Bo góc nút', 'select'), { target: { value: 'lg' } });
    fireEvent.change(controlOf('Bo góc khung biểu mẫu', 'select'), { target: { value: 'none' } });
    fireEvent.change(controlOf('Kiểu ô nhập', 'select'), { target: { value: 'filled' } });

    const payload = await saveAndGetCreatePayload();
    expect(payload.theme).toEqual({
      textColor: '#123456',
      buttonStyle: 'outline',
      buttonRadius: 'lg',
      cardRadius: 'none',
      inputStyle: 'filled',
    });
  });

  it('chọn lại "-- Mặc định --" -> khoá biến mất khỏi payload', async () => {
    await renderEdit({ buttonStyle: 'outline', buttonRadius: 'full', cardRadius: 'lg', inputStyle: 'filled', textColor: '#0F172A' });
    openSettingsTab('theme');
    fireEvent.change(controlOf('Kiểu nút gửi', 'select'), { target: { value: '' } });
    fireEvent.change(controlOf('Bo góc nút', 'select'), { target: { value: '' } });
    fireEvent.change(controlOf('Bo góc khung biểu mẫu', 'select'), { target: { value: '' } });
    fireEvent.change(controlOf('Kiểu ô nhập', 'select'), { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText('#1E293B'), { target: { value: '' } });

    const payload = await saveAndGetUpdatePayload();
    expect(payload.theme).toEqual({});
  });

  it('mã màu chữ chưa hợp lệ (gõ dở) -> không gửi textColor', async () => {
    renderNew();
    openSettingsTab('theme');
    fireEvent.change(screen.getByPlaceholderText('#1E293B'), { target: { value: '#12' } });
    const payload = await saveAndGetCreatePayload();
    expect(payload.theme).toEqual({});
  });
});

describe('Trình soạn biểu mẫu — ảnh nền (PR-8b)', () => {
  const mockUpload = () => {
    formAdminApi.uploadFormTempFile.mockResolvedValue({ tempId: 'temp-bg', originalName: 'nen.jpg', contentType: 'image/jpeg', size: 4096 });
    formAdminApi.uploadFormAsset.mockResolvedValue({ storageKey: BG_KEY, url: BG_URL, sizeBytes: 4096 });
  };

  it('tải ảnh nền: gọi đúng 2 API như banner, hiện ảnh + thanh trượt độ tối (mặc định 30), lưu kèm khoá + độ tối', async () => {
    mockUpload();
    renderNew();
    openSettingsTab('theme');

    const file = new File(['fake'], 'nen.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('theme-background-input'), { target: { files: [file] } });

    await waitFor(() => expect(formAdminApi.uploadFormAsset).toHaveBeenCalledTimes(1));
    expect(formAdminApi.uploadFormTempFile).toHaveBeenCalledWith(file);
    expect(formAdminApi.uploadFormAsset).toHaveBeenCalledWith({ tempId: 'temp-bg', originalName: 'nen.jpg', contentType: 'image/jpeg', size: 4096 });

    const slider = await screen.findByRole('slider');
    expect(slider).toHaveValue('30');
    expect(screen.getByTestId('theme-background-image').querySelector(`img[src="${BG_URL}"]`)).toBeTruthy();

    fireEvent.change(slider, { target: { value: '60' } });
    const payload = await saveAndGetCreatePayload();
    expect(payload.theme).toEqual({ backgroundImageKey: BG_KEY, backgroundImageOverlay: 60 });
  });

  it('tải ảnh nền KHÔNG đụng banner / logo', async () => {
    mockUpload();
    await renderEdit({ bannerKey: 'uploads/1/forms/b.png', bannerUrl: 'https://cdn.example.com/b.png', logoKey: 'uploads/1/forms/l.png', logoUrl: 'https://cdn.example.com/l.png' });
    openSettingsTab('theme');
    fireEvent.change(screen.getByTestId('theme-background-input'), { target: { files: [new File(['x'], 'nen.jpg', { type: 'image/jpeg' })] } });
    await screen.findByRole('slider');

    const payload = await saveAndGetUpdatePayload();
    expect(payload.theme.bannerKey).toBe('uploads/1/forms/b.png');
    expect(payload.theme.logoKey).toBe('uploads/1/forms/l.png');
    expect(payload.theme.backgroundImageKey).toBe(BG_KEY);
  });

  it('"Gỡ ảnh" ở ảnh nền -> payload không còn khoá ảnh nền lẫn độ tối; banner giữ nguyên', async () => {
    await renderEdit({ bannerKey: 'uploads/1/forms/b.png', bannerUrl: 'https://cdn.example.com/b.png', backgroundImageKey: BG_KEY, backgroundImageUrl: BG_URL, backgroundImageOverlay: 45 });
    openSettingsTab('theme');
    const bgBlock = within(screen.getByTestId('theme-background-image'));
    fireEvent.click(bgBlock.getByRole('button', { name: 'Gỡ ảnh' }));
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();

    const payload = await saveAndGetUpdatePayload();
    expect(payload.theme).not.toHaveProperty('backgroundImageKey');
    expect(payload.theme).not.toHaveProperty('backgroundImageOverlay');
    expect(payload.theme.bannerKey).toBe('uploads/1/forms/b.png');
  });

  it('ảnh nền cũ chưa có độ tối (khoá vắng mặt): thanh trượt hiện mặc định 30 nhưng KHÔNG tự gửi độ tối', async () => {
    await renderEdit({ backgroundImageKey: BG_KEY, backgroundImageUrl: BG_URL });
    openSettingsTab('theme');
    expect(screen.getByRole('slider')).toHaveValue('30');
    const payload = await saveAndGetUpdatePayload();
    expect(payload.theme).toEqual({ backgroundImageKey: BG_KEY });
  });

  it('xem trước sống: ảnh nền + lớp tối hiện ở vùng NGOÀI thẻ, và đổi theo thanh trượt', async () => {
    await renderEdit({ backgroundColor: '#F8FAFC', backgroundImageKey: BG_KEY, backgroundImageUrl: BG_URL, backgroundImageOverlay: 40 });
    const canvas = screen.getByTestId('form-preview-canvas');
    expect(canvas.getAttribute('style')).toContain(BG_URL);
    expect(canvas.getAttribute('style')).toContain('rgba(0, 0, 0, 0.4)');
    expect(canvas.style.backgroundColor).toBe('rgb(248, 250, 252)');

    openSettingsTab('theme');
    fireEvent.change(screen.getByRole('slider'), { target: { value: '70' } });
    expect(screen.getByTestId('form-preview-canvas').getAttribute('style')).toContain('rgba(0, 0, 0, 0.7)');
  });

  it('không có ảnh nền -> vùng xem trước y như trước (chỉ màu nền)', async () => {
    await renderEdit({ backgroundColor: '#F8FAFC' });
    const style = screen.getByTestId('form-preview-canvas').getAttribute('style');
    expect(style).toContain('background-color');
    expect(style).not.toContain('background-image');
  });
});

describe('Trình soạn biểu mẫu — xem trước phản ánh khoá mới (PR-8b)', () => {
  it('bo góc nút / kiểu nút / bo góc khung / ô nhập / màu chữ đổi tức thì trong khung xem trước', async () => {
    renderNew();
    const pane = within(screen.getByTestId('form-preview-pane'));
    expect(previewSubmit().className).toContain('rounded-xl');

    openSettingsTab('theme');
    fireEvent.change(controlOf('Bo góc nút', 'select'), { target: { value: 'full' } });
    expect(previewSubmit().className).toContain('rounded-full');

    fireEvent.change(controlOf('Kiểu nút gửi', 'select'), { target: { value: 'outline' } });
    expect(previewSubmit().className).toContain('bg-transparent');

    fireEvent.change(controlOf('Bo góc khung biểu mẫu', 'select'), { target: { value: 'lg' } });
    expect(screen.getByTestId('form-preview-frame').firstElementChild.className).toContain('rounded-3xl');

    fireEvent.change(controlOf('Kiểu ô nhập', 'select'), { target: { value: 'filled' } });
    expect(pane.getByLabelText(/Họ và tên/)).toHaveClass('bg-gray-100');

    fireEvent.change(screen.getByPlaceholderText('#1E293B'), { target: { value: '#112233' } });
    expect(pane.getByRole('heading', { level: 1 }).style.color).toBe('rgb(17, 34, 51)');
  });
});

describe('Trình soạn biểu mẫu — cảnh báo tương phản (PR-8b)', () => {
  it('mặc định / màu đủ đậm -> không cảnh báo', async () => {
    renderNew();
    openSettingsTab('theme');
    expect(screen.queryByTestId('theme-contrast-warnings')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('#1E293B'), { target: { value: '#111827' } });
    expect(screen.queryByTestId('theme-contrast-warnings')).not.toBeInTheDocument();
  });

  it('màu chữ nhạt (< 4.5:1 trên thẻ trắng) -> cảnh báo kèm tỉ lệ, NHƯNG vẫn lưu được', async () => {
    renderNew();
    openSettingsTab('theme');
    fireEvent.change(screen.getByPlaceholderText('#1E293B'), { target: { value: '#AAAAAA' } });

    const warning = within(screen.getByTestId('theme-contrast-warnings')).getByRole('status');
    expect(warning).toHaveAttribute('data-warning', 'text');
    expect(warning.textContent).toMatch(/Màu chữ này khó đọc/);
    expect(warning.textContent).toMatch(/2,3:1/); // #AAAAAA / trắng = 2,32 (dấu phẩy kiểu Việt)

    const payload = await saveAndGetCreatePayload(); // cảnh báo KHÔNG chặn lưu
    expect(payload.theme.textColor).toBe('#AAAAAA');
  });

  it('nút viền + màu chủ đạo nhạt -> cảnh báo chữ nút; bỏ kiểu viền thì cảnh báo biến mất', async () => {
    renderNew();
    openSettingsTab('theme');
    fireEvent.change(screen.getByPlaceholderText('#DF5C0E'), { target: { value: '#FFFF00' } });
    expect(screen.queryByTestId('theme-contrast-warnings')).not.toBeInTheDocument(); // nút đặc: chữ nút tự chọn tối -> đủ tương phản

    fireEvent.change(controlOf('Kiểu nút gửi', 'select'), { target: { value: 'outline' } });
    const warning = within(screen.getByTestId('theme-contrast-warnings')).getByRole('status');
    expect(warning).toHaveAttribute('data-warning', 'button');
    expect(warning.textContent).toMatch(/Chữ trên nút gửi khó đọc/);

    fireEvent.change(controlOf('Kiểu nút gửi', 'select'), { target: { value: '' } });
    expect(screen.queryByTestId('theme-contrast-warnings')).not.toBeInTheDocument();
  });

  it('cả hai cảnh báo cùng lúc', async () => {
    renderNew();
    openSettingsTab('theme');
    fireEvent.change(screen.getByPlaceholderText('#1E293B'), { target: { value: '#CCCCCC' } });
    fireEvent.change(controlOf('Kiểu nút gửi', 'select'), { target: { value: 'outline' } });
    const warnings = within(screen.getByTestId('theme-contrast-warnings')).getAllByRole('status');
    expect(warnings.map((w) => w.getAttribute('data-warning'))).toEqual(['text', 'button']);
  });
});
