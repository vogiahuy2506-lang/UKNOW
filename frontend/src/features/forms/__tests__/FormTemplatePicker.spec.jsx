import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import viDict from '../../../i18n/vi.js';
import FormTemplatePicker from '../components/FormTemplatePicker';
import * as formAdminApi from '../services/formAdminApi.service';

/**
 * Bố cục màn "Tạo biểu mẫu mới" theo màn tạo landing page (13/10/2026): hero + khung soạn lớn (Enter gửi, Shift+Enter xuống dòng)
 * + chip gợi ý + lưới 4 mẫu + hàng "Biểu mẫu trống". Logic AI (lỗi, bấm đúp, rời trang…) đã có ca ở FormAiDraft.spec.jsx;
 * file này ghim phần BỐ CỤC và phím tắt. Chữ đọc từ vi.js — gõ tay là đỏ giả khi ai đó sửa câu chữ.
 */

vi.mock('../services/formAdminApi.service', () => ({
  aiDraftForm: vi.fn(),
}));

const PICKER = viDict.forms.editorPage.ai.picker;
const TEMPLATES = viDict.forms.editorPage.templates;
const GRID_IDS = ['consult', 'booking', 'payment', 'survey'];
const DRAFT = { mode: 'create', kind: 'consult', title: 'x', fields: [{ label: 'Họ và tên', type: 'short_text', required: true }] };

const renderPicker = (props = {}) => {
  const onSelect = vi.fn();
  const onAiDraft = vi.fn();
  const onBack = vi.fn();
  const utils = render(
    <I18nProvider>
      <FormTemplatePicker onSelect={onSelect} onAiDraft={onAiDraft} onBack={onBack} {...props} />
    </I18nProvider>
  );
  return { onSelect, onAiDraft, onBack, ...utils };
};

const type = (text) => fireEvent.change(screen.getByTestId('form-ai-description'), { target: { value: text } });
// fireEvent trả về false khi sự kiện bị preventDefault — dùng để phân biệt "Enter gửi" với "Shift+Enter xuống dòng".
const press = (init) => fireEvent.keyDown(screen.getByTestId('form-ai-description'), { key: 'Enter', ...init });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('FormTemplatePicker — bố cục giống màn tạo landing page', () => {
  it('hero căn giữa: badge + câu hỏi lớn + phụ đề, khung soạn có nhãn cho trình đọc màn hình, thanh trên có nút quay lại', () => {
    const { onBack } = renderPicker();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(PICKER.heading);
    expect(screen.getByText(PICKER.badge)).toBeInTheDocument();
    expect(screen.getByText(PICKER.subtitle)).toBeInTheDocument();
    expect(screen.getByLabelText(PICKER.label)).toBe(screen.getByTestId('form-ai-description'));
    expect(screen.getByText(PICKER.shortcutHint)).toBeInTheDocument();
    expect(screen.getByText(viDict.forms.editorPage.ai.creditNote)).toBeInTheDocument();
    expect(screen.getByTestId('form-ai-draft-submit')).toHaveTextContent(PICKER.createButton);
    expect(screen.getByText(TEMPLATES.topbarTitle)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: viDict.forms.submissionsPage.backToForms }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('lưới chỉ có 4 mẫu (tư vấn, đặt lịch, thu tiền, khảo sát) kèm số đếm; mẫu Trống KHÔNG nằm trong lưới', () => {
    renderPicker();
    const grid = screen.getByTestId('form-template-grid');
    const ids = within(grid).getAllByRole('button').map((b) => b.getAttribute('data-testid'));
    expect(ids).toEqual(GRID_IDS.map((id) => `form-template-${id}`));
    expect(within(grid).queryByTestId('form-template-blank')).not.toBeInTheDocument();
    expect(screen.getByText(TEMPLATES.count.replace('{count}', '4'))).toBeInTheDocument();
    expect(screen.getByText(PICKER.templatesHeading)).toBeInTheDocument();
  });

  it('chọn mẫu trong lưới → onSelect đúng id mẫu đó', () => {
    const { onSelect } = renderPicker();
    fireEvent.click(screen.getByTestId('form-template-survey'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('survey');
  });

  it('hàng cuối "Muốn tự soạn từ đầu?" có nút "Biểu mẫu trống" → onSelect("blank")', () => {
    const { onSelect } = renderPicker();
    const row = screen.getByTestId('form-template-blank-row');
    expect(within(row).getByText(TEMPLATES.blankQuestion)).toBeInTheDocument();
    const blank = within(row).getByTestId('form-template-blank');
    expect(blank).toHaveTextContent(TEMPLATES.blankButton);

    fireEvent.click(blank);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('blank');
  });

  it('nhân viên: mẫu thu tiền khoá kèm câu giải thích, các mẫu khác và "Biểu mẫu trống" vẫn chọn được', () => {
    const { onSelect } = renderPicker({ isEmployee: true });
    const payment = screen.getByTestId('form-template-payment');
    expect(payment).toBeDisabled();
    expect(within(payment).getByText(viDict.forms.editorPage.payment.employeeReadOnlyNotice)).toBeInTheDocument();
    fireEvent.click(payment);
    expect(onSelect).not.toHaveBeenCalled();

    for (const id of ['consult', 'booking', 'survey', 'blank']) {
      expect(screen.getByTestId(`form-template-${id}`)).not.toBeDisabled();
    }
    fireEvent.click(screen.getByTestId('form-template-blank'));
    expect(onSelect).toHaveBeenCalledWith('blank');
  });

  it('chủ tài khoản: mẫu thu tiền chọn được, không có câu khoá', () => {
    const { onSelect } = renderPicker({ isEmployee: false });
    expect(screen.queryByText(viDict.forms.editorPage.payment.employeeReadOnlyNotice)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('form-template-payment'));
    expect(onSelect).toHaveBeenCalledWith('payment');
  });

  it('không truyền onAiDraft → không hero/khung soạn/chip; vẫn có tiêu đề thường, lưới 4 mẫu và nút "Biểu mẫu trống"', () => {
    const { onSelect } = renderPicker({ onAiDraft: undefined });
    expect(screen.queryByTestId('form-ai-draft-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('form-ai-description')).not.toBeInTheDocument();
    expect(screen.queryByText(PICKER.badge)).not.toBeInTheDocument();
    expect(screen.queryByTestId('form-ai-example-englishTrial')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(viDict.forms.createNew);
    expect(within(screen.getByTestId('form-template-grid')).getAllByRole('button')).toHaveLength(4);

    fireEvent.click(screen.getByTestId('form-template-blank'));
    expect(onSelect).toHaveBeenCalledWith('blank');
  });
});

describe('FormTemplatePicker — Enter gửi, Shift+Enter xuống dòng', () => {
  it('Enter gọi aiDraftForm đúng 1 lần với mô tả đã cắt khoảng trắng', async () => {
    formAdminApi.aiDraftForm.mockResolvedValue(DRAFT);
    const { onAiDraft } = renderPicker();
    type('  Form liên hệ cho tiệm hoa  ');

    const notPrevented = press();
    expect(notPrevented).toBe(false); // Enter bị chặn (không chèn xuống dòng vào ô)
    await act(async () => {});

    expect(formAdminApi.aiDraftForm).toHaveBeenCalledTimes(1);
    expect(formAdminApi.aiDraftForm).toHaveBeenCalledWith({ mode: 'create', description: 'Form liên hệ cho tiệm hoa', locale: 'vi' });
    expect(onAiDraft).toHaveBeenCalledWith(DRAFT);
  });

  it('Shift+Enter chỉ xuống dòng: KHÔNG gọi API, KHÔNG chặn hành vi mặc định của ô', async () => {
    renderPicker();
    type('Form liên hệ');

    const notPrevented = press({ shiftKey: true });
    expect(notPrevented).toBe(true);
    await act(async () => {});

    expect(formAdminApi.aiDraftForm).not.toHaveBeenCalled();
    expect(screen.queryByTestId('form-ai-draft-error')).not.toBeInTheDocument();
  });

  it('Enter hai lần sát nhau vẫn chỉ MỘT lời gọi (không trừ hai lượt AI)', async () => {
    let resolve;
    formAdminApi.aiDraftForm.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderPicker();
    type('Form liên hệ');

    act(() => { press(); press(); });
    expect(formAdminApi.aiDraftForm).toHaveBeenCalledTimes(1);

    await act(async () => { resolve(DRAFT); });
  });

  it('Enter khi mô tả trống → báo lỗi như bấm nút, không gọi API', () => {
    renderPicker();
    press();
    expect(screen.getByRole('alert')).toHaveTextContent(PICKER.descriptionRequired);
    expect(formAdminApi.aiDraftForm).not.toHaveBeenCalled();
  });

  it('Enter lúc bộ gõ đang chốt chữ (isComposing) không phải lệnh gửi', async () => {
    renderPicker();
    type('Form liên hệ');
    const notPrevented = press({ isComposing: true });
    await act(async () => {});
    expect(notPrevented).toBe(true);
    expect(formAdminApi.aiDraftForm).not.toHaveBeenCalled();
  });

  it('chip gợi ý chỉ điền sẵn mô tả: KHÔNG tự gửi, không tốn lượt AI', async () => {
    renderPicker();
    fireEvent.click(screen.getByTestId('form-ai-example-clinicBooking'));
    await act(async () => {});
    expect(screen.getByTestId('form-ai-description')).toHaveValue(PICKER.examples.clinicBooking.text);
    expect(formAdminApi.aiDraftForm).not.toHaveBeenCalled();
  });

  it('chip gợi ý nằm dưới khung soạn và xoá lỗi cũ khi bấm', () => {
    renderPicker();
    fireEvent.click(screen.getByTestId('form-ai-draft-submit'));
    expect(screen.getByTestId('form-ai-draft-error')).toBeInTheDocument();
    const card = screen.getByTestId('form-ai-draft-card');
    const position = screen.getByTestId('form-ai-description').compareDocumentPosition(screen.getByTestId('form-ai-example-englishTrial'));
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(card).getByTestId('form-ai-example-englishTrial')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('form-ai-example-englishTrial'));
    expect(screen.queryByTestId('form-ai-draft-error')).not.toBeInTheDocument();
  });
});

describe('FormTemplatePicker — bố cục cuộn', () => {
  it('khung cuộn KHÔNG dùng justify-center (nội dung cao hơn màn sẽ bị cắt mất phần đầu); khối trong căn giữa bằng my-auto', () => {
    renderPicker();
    const scroller = screen.getByTestId('form-template-scroll');
    expect(scroller.className).not.toMatch(/\bjustify-center\b/);
    expect(scroller.className).toMatch(/\boverflow-y-auto\b/);
    expect(scroller.firstElementChild.className).toMatch(/\bmy-auto\b/);
  });
});
