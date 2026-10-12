import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import LandingCanvasEditor from '../LandingCanvasEditor.jsx';
import { I18nProvider } from '../../../../i18n';
import { defaultLeadFormConfig } from '../../../landing-pages/utils/landingLeadFormConfig.js';
import { createLandingPageAdmin, updateLandingPageAdmin } from '../../../landing-pages/services/landingPagesAdminApi.service.js';

vi.mock('../../../landing-pages/services/landingPagesAdminApi.service.js', () => ({
  createLandingPageAdmin: vi.fn(),
  updateLandingPageAdmin: vi.fn(),
}));
vi.mock('react-hot-toast', () => {
  const toast = vi.fn();
  toast.success = vi.fn();
  toast.error = vi.fn();
  toast.custom = vi.fn();
  toast.dismiss = vi.fn();
  return { default: toast };
});
vi.mock('../SettingsModal.jsx', () => ({ default: () => null }));
vi.mock('../ImportHtmlModal.jsx', () => ({ default: () => null }));
vi.mock('../../../landing-pages/components/TemplateGallery.jsx', () => ({ default: () => null }));
vi.mock('../../../landing-pages/components/SaveTemplateModal.jsx', () => ({ default: () => null }));
vi.mock('../../../landing-pages/components/VisualBlockEditor.jsx', () => ({ default: () => null }));
vi.mock('../../../landing-pages/components/LandingVersionModal.jsx', () => ({ default: () => null }));
vi.mock('../LandingCanvasLayout.jsx', () => ({
  default: ({ onSave }) => <button onClick={onSave}>save</button>,
}));

/**
 * PR-7a — Editor gửi `formDrafts` (chỉ nháp còn khớp một chỗ trống KHÔNG phải consult) kèm POST/PUT và XOÁ chúng khỏi state sau khi lưu
 * thành công; lưu lỗi thì giữ nguyên. Chỉ ghi vào body khi có nháp (không có → body y như trước PR-7a).
 */
const slot = (kind) => `<div data-founderai-form-slot="${kind}"></div>`;
const HTML = `<body>${slot('consult')}${slot('booking')}${slot('payment')}</body>`;
const DRAFTS = [
  { slotIndex: 0, kind: 'consult', title: 'Không dùng cho consult' },
  { slotIndex: 1, kind: 'booking', title: 'Đặt lịch khám răng' },
  { slotIndex: 2, kind: 'payment', title: 'Giữ chỗ' },
  { slotIndex: 2, kind: 'survey', title: 'Lệch loại — không khớp chỗ trống' },
];

const baseForm = (over = {}) => ({
  slug: 'abc',
  title: 'Trang',
  htmlContent: HTML,
  isPublished: false,
  domainType: 'system',
  customDomainHostname: null,
  customDomainIsApex: false,
  leadFormConfig: defaultLeadFormConfig(),
  leadFormPersistedMeta: { keys: [], optionValuesByKey: {} },
  leadFormFieldErrors: {},
  linkedForms: [],
  linkedFormsPending: [],
  formDrafts: DRAFTS,
  ...over,
});

function renderEditor({ editingId, form }) {
  const setForm = vi.fn();
  const onClose = vi.fn();
  render(
    <I18nProvider>
      <BrowserRouter>
        <LandingCanvasEditor
          editingId={editingId}
          form={form}
          setForm={setForm}
          onClose={onClose}
          scope={{ userId: 1, ownerId: 1 }}
          baseline={null}
        />
      </BrowserRouter>
    </I18nProvider>
  );
  return { setForm, onClose };
}

/** Áp mọi lần gọi setForm (hàm cập nhật) lên form hiện tại → state sau cùng. */
const finalState = (setForm, start) => setForm.mock.calls.reduce((state, [updater]) => (typeof updater === 'function' ? updater(state) : updater), start);

describe('LandingCanvasEditor — formDrafts khi Lưu (PR-7a)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    createLandingPageAdmin.mockResolvedValue({ id: 77, updatedAt: 'U1' });
    updateLandingPageAdmin.mockResolvedValue({ id: 5, updatedAt: 'T2' });
  });

  it('tạo mới: POST mang chỉ nháp khớp chỗ trống không phải consult; lưu xong nháp bị xoá khỏi state', async () => {
    const form = baseForm();
    const { setForm, onClose } = renderEditor({ editingId: null, form });
    fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(createLandingPageAdmin).toHaveBeenCalledTimes(1));

    expect(createLandingPageAdmin.mock.calls[0][0].formDrafts.map((d) => [d.slotIndex, d.kind, d.title])).toEqual([
      [1, 'booking', 'Đặt lịch khám răng'],
      [2, 'payment', 'Giữ chỗ'],
    ]);
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(77));
    expect(finalState(setForm, form).formDrafts).toEqual([]);
  });

  it('cập nhật trang đã lưu: PUT mang nháp; lưu xong nháp bị xoá khỏi state', async () => {
    const form = baseForm();
    const { setForm, onClose } = renderEditor({ editingId: 5, form });
    fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(updateLandingPageAdmin).toHaveBeenCalledTimes(1));

    const [id, body] = updateLandingPageAdmin.mock.calls[0];
    expect(id).toBe(5);
    expect(body.formDrafts.map((d) => d.kind)).toEqual(['booking', 'payment']);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(finalState(setForm, form).formDrafts).toEqual([]);
  });

  it('lưu LỖI → không đụng state (nháp còn nguyên để thử lại)', async () => {
    updateLandingPageAdmin.mockRejectedValueOnce({ response: { data: { message: 'Slug trùng' } } });
    const form = baseForm();
    const { setForm, onClose } = renderEditor({ editingId: 5, form });
    fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(updateLandingPageAdmin).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('save')).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    expect(setForm).not.toHaveBeenCalled(); // không có lần nào ghi lại form → nháp biểu mẫu còn nguyên để Lưu thử lại
  });

  it('không có nháp nào còn khớp → body KHÔNG có khoá formDrafts (y như trước PR-7a)', async () => {
    renderEditor({ editingId: 5, form: baseForm({ formDrafts: [{ slotIndex: 1, kind: 'survey', title: 'Lệch loại' }] }) });
    fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(updateLandingPageAdmin).toHaveBeenCalledTimes(1));
    expect(updateLandingPageAdmin.mock.calls[0][1]).not.toHaveProperty('formDrafts');
  });
});
