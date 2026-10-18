/**
 * NodeConfigForm (tách khỏi NodeConfigModal — PLAN_THIET_LAP_CAU_HINH_TRUC_TIEP PR-A1):
 * form chỉ khởi tạo theo `node.id`, báo `onFormChange(formData, isDirty)`, chữ Hủy/Lưu qua i18n.
 */
import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../../../i18n';
import NodeConfigForm from '../NodeConfigForm';

vi.mock('../../services/campaignBuilderApi.service', () => ({
  default: new Proxy({}, { get: () => vi.fn().mockResolvedValue({ data: { data: { items: [] } } }) }),
}));

const conditionNode = (id = 'cond', label = 'Có email?') => ({ id, type: 'task', data: { nodeType: 'condition', label, config: {} } });

const Harness = ({ node, nodes, onFormChange, onSave = vi.fn(), onCancel = vi.fn(), variant = 'inline' }) => (
  <I18nProvider>
    <NodeConfigForm variant={variant} node={node} nodes={nodes} edges={[]} onSave={onSave} onCancel={onCancel} onFormChange={onFormChange} />
  </I18nProvider>
);

describe('NodeConfigForm', () => {
  it('đang gõ mà prop `nodes` đổi (khối khác cập nhật) → chữ còn nguyên, form KHÔNG dựng lại', () => {
    const node = conditionNode();
    const view = render(<Harness node={node} nodes={[node]} />);
    const input = screen.getByDisplayValue('Có email?');
    fireEvent.change(input, { target: { value: 'Đang gõ dở' } });
    expect(screen.getByDisplayValue('Đang gõ dở')).toBeInTheDocument();

    // Chạy thử cập nhật trạng thái khối khác → `nodes` và cả object `node` đổi identity, nhưng cùng id.
    const sibling = { id: 'other', type: 'task', data: { nodeType: 'tag_contact', label: 'Gắn tag', config: {}, status: 'success' } };
    view.rerender(<Harness node={{ ...node, data: { ...node.data } }} nodes={[{ ...node }, sibling]} />);
    expect(screen.getByDisplayValue('Đang gõ dở')).toBeInTheDocument();
  });

  it('đổi sang khối khác (node.id khác) → form khởi tạo lại theo khối mới', () => {
    const a = conditionNode('a', 'Khối A');
    const b = conditionNode('b', 'Khối B');
    const view = render(<Harness node={a} nodes={[a, b]} />);
    fireEvent.change(screen.getByDisplayValue('Khối A'), { target: { value: 'A sửa' } });
    view.rerender(<Harness node={b} nodes={[a, b]} />);
    expect(screen.getByDisplayValue('Khối B')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('A sửa')).not.toBeInTheDocument();
  });

  it('onFormChange: isDirty=false khi vừa mở, true sau khi gõ, về false khi gõ lại đúng giá trị cũ', () => {
    const node = conditionNode();
    const onFormChange = vi.fn();
    render(<Harness node={node} nodes={[node]} onFormChange={onFormChange} />);
    expect(onFormChange.mock.calls.at(-1)[1]).toBe(false);
    const input = screen.getByDisplayValue('Có email?');
    fireEvent.change(input, { target: { value: 'Khác' } });
    expect(onFormChange.mock.calls.at(-1)[1]).toBe(true);
    expect(onFormChange.mock.calls.at(-1)[0].label).toBe('Khác');
    fireEvent.change(input, { target: { value: 'Có email?' } });
    expect(onFormChange.mock.calls.at(-1)[1]).toBe(false);
  });

  it('nút Hủy / Lưu lấy chữ từ i18n và gọi đúng callback; variant inline không có khung cuộn 70vh', () => {
    const node = conditionNode();
    const onCancel = vi.fn();
    render(<Harness node={node} nodes={[node]} onCancel={onCancel} variant="inline" />);
    expect(screen.getByTestId('node-config-cancel')).toHaveTextContent('Hủy');
    expect(screen.getByTestId('node-config-save')).toHaveTextContent('Lưu');
    fireEvent.click(screen.getByTestId('node-config-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('node-config-form-inline').className).not.toContain('max-h-[70vh]');
  });

  it('variant modal giữ khung cuộn 70vh', () => {
    const node = conditionNode();
    const { container } = render(<Harness node={node} nodes={[node]} variant="modal" />);
    expect(container.querySelector('.max-h-\\[70vh\\]')).not.toBeNull();
  });

  it('bấm Lưu → onSave nhận form hiện tại', async () => {
    const node = conditionNode();
    const onSave = vi.fn();
    const Wrapper = () => {
      const [, setTick] = useState(0);
      return <Harness node={node} nodes={[node]} onSave={onSave} onFormChange={() => setTick((n) => n + 1)} />;
    };
    render(<Wrapper />);
    fireEvent.change(screen.getByDisplayValue('Có email?'), { target: { value: 'Tên mới' } });
    fireEvent.click(screen.getByTestId('node-config-save'));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].label).toBe('Tên mới');
  });
});
