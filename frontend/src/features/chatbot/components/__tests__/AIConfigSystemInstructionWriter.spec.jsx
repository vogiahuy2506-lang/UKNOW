import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../../i18n';
import viDict from '../../../../i18n/vi.js';
import { AIConfig } from '../ChatbotSettingsComponents';

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn() }));

vi.mock('../../../../services/aiApi', () => ({
  default: { generateSystemInstruction: mockGenerate },
}));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

const T = viDict.systemInstructionAiWriter;

/**
 * Ghim MẮT XÍCH NỐI: kết quả "AI viết hộ" phải chảy vào đúng khoá `system_instruction` của cấu hình.
 *
 * Spec của SystemInstructionAiWriter test component đứng một mình — nó không biết AIConfig có render
 * nó không, hay nối onApply vào khoá nào. Trong phiên 13/09/2026 đúng loại mắt xích này bị sót nhiều
 * lần (mẫu thư sửa được mà thư vẫn ra chữ cũ, test vẫn xanh), nên phải có ca riêng.
 */
describe('AIConfig — nối "AI viết hộ" vào ô Hướng dẫn AI', () => {
  beforeEach(() => {
    mockGenerate.mockReset();
    mockGenerate.mockResolvedValue({ success: true, data: { instruction: 'Bạn là trợ lý bán hàng.' } });
  });

  it('bấm Dùng → onChange nhận system_instruction = bản AI viết, giữ nguyên các khoá khác', async () => {
    const onChange = vi.fn();
    render(
      <I18nProvider>
        <AIConfig config={{ system_instruction: '', temperature: 0.5 }} onChange={onChange} />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: T.toggle }));
    fireEvent.change(screen.getByLabelText(T.hintLabel), { target: { value: 'Trợ lý bán hàng' } });
    fireEvent.click(screen.getByRole('button', { name: T.write }));
    await screen.findByTestId('system-instruction-ai-preview');
    fireEvent.click(screen.getByRole('button', { name: T.apply }));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ system_instruction: 'Bạn là trợ lý bán hàng.', temperature: 0.5 })
    );
  });
});
