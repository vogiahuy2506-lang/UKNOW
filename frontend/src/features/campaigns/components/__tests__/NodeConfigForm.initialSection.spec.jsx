/**
 * NodeConfigForm — `initialSection` (PLAN_THIET_LAP_CAU_HINH_TRUC_TIEP PR-D): "Cài đặt nâng cao" của tab Thiết lập mở ĐÚNG mục cần điền và focus ô nhập đầu tiên.
 * Không truyền `initialSection` (Sơ đồ khối) → mục `basic` như cũ, không focus.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../../../../i18n';
import NodeConfigForm from '../NodeConfigForm';

vi.mock('../../services/campaignBuilderApi.service', () => ({
  default: new Proxy({}, { get: () => vi.fn().mockResolvedValue({ data: { data: { items: [] } } }) }),
}));

const node = (id, nodeType, config = {}) => ({ id, type: 'task', data: { nodeType, label: nodeType, config } });

const Harness = ({ target, ...rest }) => (
  <I18nProvider>
    <NodeConfigForm
      node={target}
      nodes={[target]}
      edges={[]}
      emailSettings={[{ id: 3, name: 'CSKH', email: 'cskh@abc.vn' }]}
      onSave={vi.fn()}
      onCancel={vi.fn()}
      {...rest}
    />
  </I18nProvider>
);

const EMAIL_MANUAL = node('mail', 'send_email', { recipientSource: 'manual', recipientEmails: '' });

describe('NodeConfigForm — initialSection', () => {
  it('email + initialSection "recipient" → mở ngay mục Email người nhận, ô nhập email được focus', () => {
    render(<Harness target={EMAIL_MANUAL} initialSection="recipient" />);
    expect(screen.getByRole('heading', { name: /Email người nhận/ })).toBeInTheDocument();
    const textarea = document.querySelector('textarea');
    expect(textarea).not.toBeNull();
    expect(document.activeElement).toBe(textarea);
  });

  it('email + initialSection "basic" → ô Gửi từ (không phải ô Tên khối) được focus', () => {
    render(<Harness target={EMAIL_MANUAL} initialSection="basic" />);
    const select = document.querySelector('select[data-section-focus]');
    expect(select).not.toBeNull();
    expect(document.activeElement).toBe(select);
  });

  it('email + initialSection "templates" → mở mục Danh sách email gửi, ô chọn mẫu được focus', () => {
    render(<Harness target={EMAIL_MANUAL} initialSection="templates" />);
    expect(screen.getByRole('heading', { name: 'Danh sách email gửi' })).toBeInTheDocument();
    expect(document.querySelector('textarea')).toBeNull();
    const picker = document.querySelector('button[data-section-focus]');
    expect(picker).not.toBeNull();
    expect(document.activeElement).toBe(picker);
  });

  it('KHÔNG truyền initialSection (Sơ đồ khối / hộp) → mục basic, không focus ô nào', () => {
    render(<Harness target={EMAIL_MANUAL} />);
    expect(document.querySelector('select[data-section-focus]')).not.toBeNull();
    expect(document.querySelector('textarea')).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it('đọc Google Sheet + "basic" → ô link sheet được focus', () => {
    render(<Harness target={node('sheet', 'read_sheet', { sheetUrl: '' })} initialSection="basic" />);
    const url = document.querySelector('input[type=url]');
    expect(url).not.toBeNull();
    expect(document.activeElement).toBe(url);
  });

  it('Zalo cá nhân: "basic" = ô nhập số điện thoại (focus), "templates" = danh sách mẫu tin, không còn ô số', () => {
    const zalo = node('zp', 'send_zalo_personal', { zaloRecipientSource: 'manual', zaloRecipientPhones: '' });
    const { unmount } = render(<Harness target={zalo} initialSection="basic" />);
    const textarea = document.querySelector('textarea');
    expect(textarea).not.toBeNull();
    expect(document.activeElement).toBe(textarea);
    unmount();
    render(<Harness target={zalo} initialSection="templates" />);
    expect(document.querySelector('textarea')).toBeNull();
    expect(screen.getAllByText('Danh sách template gửi').length).toBeGreaterThan(1);
  });

  it('Zalo nhóm "templates" mở thẳng danh sách mẫu (effect khởi tạo không kéo về basic)', () => {
    const group = node('zg', 'send_zalo_group', { zaloGroupSource: 'manual', zaloGroupIds: '' });
    render(<Harness target={group} initialSection="templates" />);
    expect(document.querySelector('textarea')).toBeNull();
    expect(screen.getAllByText('Danh sách template gửi').length).toBeGreaterThan(1);
  });

  it('loại khối không có thanh mục (điều kiện) → initialSection bị bỏ qua, form vẫn hiện bình thường', () => {
    render(<Harness target={node('c', 'condition')} initialSection="recipient" />);
    expect(screen.getByTestId('node-config-save')).toBeInTheDocument();
  });
});
