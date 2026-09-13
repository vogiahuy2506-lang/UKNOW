import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../../i18n';
import viDict from '../../../../i18n/vi.js';
import SystemInstructionAiWriter from '../SystemInstructionAiWriter';

const { mockGenerate, mockToastError } = vi.hoisted(() => ({
  mockGenerate: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('../../../../services/aiApi', () => ({
  default: { generateSystemInstruction: mockGenerate },
}));

vi.mock('react-hot-toast', () => ({
  default: { error: mockToastError, success: vi.fn() },
}));

// Nhãn đọc từ vi.js — gõ tay là đỏ giả khi ai đó sửa câu chữ.
const T = viDict.systemInstructionAiWriter;
const KET_QUA = 'Bạn là trợ lý tư vấn khoá học tiếng Anh cho [tên công ty].';

function renderWriter(props = {}) {
  const onApply = vi.fn();
  render(
    <I18nProvider>
      <SystemInstructionAiWriter currentValue="" onApply={onApply} {...props} />
    </I18nProvider>
  );
  return { onApply: props.onApply || onApply };
}

function moVaGo(hint = 'Trợ lý tư vấn khoá học tiếng Anh') {
  fireEvent.click(screen.getByRole('button', { name: T.toggle }));
  fireEvent.change(screen.getByLabelText(T.hintLabel), { target: { value: hint } });
}

describe('SystemInstructionAiWriter — "AI viết hộ" chỉ dẫn chatbot (PR-2)', () => {
  beforeEach(() => {
    localStorage.clear();
    mockGenerate.mockReset();
    mockToastError.mockReset();
    mockGenerate.mockResolvedValue({ success: true, data: { instruction: KET_QUA, businessContextUsed: true } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gợi ý rỗng → báo lỗi tại chỗ, KHÔNG gọi API (không trừ credit oan)', () => {
    renderWriter();
    fireEvent.click(screen.getByRole('button', { name: T.toggle }));
    fireEvent.click(screen.getByRole('button', { name: T.write }));

    expect(screen.getByRole('alert')).toHaveTextContent(T.hintRequired);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('viết → hiện XEM TRƯỚC, chưa áp vào ô nhập cho tới khi bấm "Dùng cái này"', async () => {
    const { onApply } = renderWriter();
    moVaGo();
    fireEvent.click(screen.getByRole('button', { name: T.write }));

    expect(await screen.findByTestId('system-instruction-ai-preview')).toHaveTextContent(KET_QUA);
    expect(mockGenerate).toHaveBeenCalledWith({ hint: 'Trợ lý tư vấn khoá học tiếng Anh', language: 'vi' });
    // Sếp chốt "xem trước rồi mới áp": chưa bấm Dùng thì chưa được đụng vào ô nhập.
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: T.apply }));
    expect(onApply).toHaveBeenCalledWith(KET_QUA);
    // Ô đang rỗng thì không cần hỏi xác nhận.
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('ca 9 — ô đang có nội dung: HỎI trước khi ghi đè; từ chối thì KHÔNG ghi', async () => {
    window.confirm.mockReturnValue(false);
    const { onApply } = renderWriter({ currentValue: 'Chỉ dẫn khách đã tự gõ dở' });
    moVaGo();
    fireEvent.click(screen.getByRole('button', { name: T.write }));
    await screen.findByTestId('system-instruction-ai-preview');

    fireEvent.click(screen.getByRole('button', { name: T.apply }));

    expect(window.confirm).toHaveBeenCalledWith(T.overwriteConfirm);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('ca 9 — ô đang có nội dung, đồng ý ghi đè → mới áp', async () => {
    const { onApply } = renderWriter({ currentValue: 'Nội dung cũ' });
    moVaGo();
    fireEvent.click(screen.getByRole('button', { name: T.write }));
    await screen.findByTestId('system-instruction-ai-preview');

    fireEvent.click(screen.getByRole('button', { name: T.apply }));

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(KET_QUA);
  });

  it('ca 10 — bấm "Bỏ": ô nhập KHÔNG đổi, bản xem trước biến mất', async () => {
    const { onApply } = renderWriter();
    moVaGo();
    fireEvent.click(screen.getByRole('button', { name: T.write }));
    await screen.findByTestId('system-instruction-ai-preview');

    fireEvent.click(screen.getByRole('button', { name: T.discard }));

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.queryByTestId('system-instruction-ai-preview')).not.toBeInTheDocument();
  });

  it('ca 11 — hai cú bấm sát nhau (trước khi React kịp render nút bị khoá) chỉ gọi API MỘT lần', async () => {
    let resolveFn;
    mockGenerate.mockReturnValue(new Promise((resolve) => { resolveFn = resolve; }));
    renderWriter();
    moVaGo();
    const nut = screen.getByRole('button', { name: T.write });

    // Hai lần click trong CÙNG một act: React chưa render lại nên thuộc tính disabled chưa kịp có —
    // chỉ cờ trong ref chặn được lần thứ hai. Nếu lọt, khách bị trừ hai credit cho một ý định.
    act(() => {
      nut.click();
      nut.click();
    });

    expect(mockGenerate).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFn({ success: true, data: { instruction: KET_QUA } });
    });
  });

  it('ca 11 — đang viết thì nút bị khoá và đổi nhãn', async () => {
    let resolveFn;
    mockGenerate.mockReturnValue(new Promise((resolve) => { resolveFn = resolve; }));
    renderWriter();
    moVaGo();
    fireEvent.click(screen.getByRole('button', { name: T.write }));

    expect(screen.getByRole('button', { name: T.writing })).toBeDisabled();

    await act(async () => {
      resolveFn({ success: true, data: { instruction: KET_QUA } });
    });
  });

  it('ca 12 — hết credit (402): báo đúng thông điệp của máy chủ, không phải lỗi chung chung', async () => {
    mockGenerate.mockRejectedValue({ response: { status: 402, data: { message: 'Đã hết lượt AI trong kỳ' } } });
    renderWriter();
    moVaGo();
    fireEvent.click(screen.getByRole('button', { name: T.write }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Đã hết lượt AI trong kỳ'));
    expect(screen.queryByTestId('system-instruction-ai-preview')).not.toBeInTheDocument();
  });

  it('giao diện tiếng Anh → gửi language: "en"', async () => {
    localStorage.setItem('uknow_locale', 'en');
    renderWriter();
    const en = (await import('../../../../i18n/en.js')).default.systemInstructionAiWriter;
    fireEvent.click(screen.getByRole('button', { name: en.toggle }));
    fireEvent.change(screen.getByLabelText(en.hintLabel), { target: { value: 'Sales assistant' } });
    fireEvent.click(screen.getByRole('button', { name: en.write }));

    await waitFor(() => expect(mockGenerate).toHaveBeenCalledWith({ hint: 'Sales assistant', language: 'en' }));
  });

  it('"Viết lại" gọi API thêm lần nữa và thay bản xem trước', async () => {
    renderWriter();
    moVaGo();
    fireEvent.click(screen.getByRole('button', { name: T.write }));
    await screen.findByTestId('system-instruction-ai-preview');

    mockGenerate.mockResolvedValue({ success: true, data: { instruction: 'Bản viết lại.' } });
    fireEvent.click(screen.getByRole('button', { name: T.rewrite }));

    await waitFor(() => expect(screen.getByTestId('system-instruction-ai-preview')).toHaveTextContent('Bản viết lại.'));
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });
});
