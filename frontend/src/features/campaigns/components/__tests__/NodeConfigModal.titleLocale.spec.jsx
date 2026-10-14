/**
 * 14/10/2026 — tiêu đề hộp cấu hình khối đọc tên khối theo ngôn ngữ đang chọn.
 * Trước đó in thẳng `config.name` (tiếng Anh), nên giao diện tiếng Việt hiện "Cấu hình: Read Sheet Data",
 * "Cấu hình: Form Submissions Data" — trong khi bảng khối bên trái đã hiện "Đọc dữ liệu Sheet".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import NodeConfigModal from '../NodeConfigModal';
import viTranslations from '../../../../i18n/vi';

let mockLocale = 'vi';
const mockT = (key, params = {}) => {
  const val = key.split('.').reduce((acc, part) => acc?.[part], viTranslations);
  if (typeof val !== 'string') return key;
  return val.replace(/\{(\w+)\}/g, (_, name) => (params[name] ?? `{${name}}`));
};
// Giống useI18n thật: có namespace thì trả thẳng hàm t, không thì trả { t, locale }.
vi.mock('../../../../i18n', () => ({
  useI18n: (ns) => (ns ? (key, params) => mockT(`${ns}.${key}`, params) : { t: mockT, locale: mockLocale }),
}));
vi.mock('../../services/campaignBuilderApi.service', () => ({
  default: new Proxy({}, { get: () => vi.fn().mockResolvedValue({ data: { data: { items: [] } } }) }),
}));

const nodeOf = (nodeType) => ({ id: `node-${nodeType}`, data: { nodeType, label: 'x', config: {} } });
const renderModal = (node) => render(
  <NodeConfigModal isOpen node={node} onClose={vi.fn()} onSave={vi.fn()} nodes={[node]} edges={[]} />,
);
const titleName = () => screen.getByText('Cấu hình:').nextElementSibling;

describe('NodeConfigModal — tiêu đề theo ngôn ngữ', () => {
  beforeEach(() => { mockLocale = 'vi'; });

  it.each([
    ['read_sheet', 'Đọc dữ liệu Sheet'],
    ['read_form_submissions', 'Dữ liệu Biểu mẫu'],
    ['read_landing_leads', 'Dữ liệu landing page'],
  ])('tiếng Việt: khối %s hiện "%s", không hiện tên tiếng Anh', (nodeType, nameVi) => {
    renderModal(nodeOf(nodeType));
    expect(titleName()).toHaveTextContent(nameVi);
  });

  it('tiếng Anh: vẫn hiện tên tiếng Anh', () => {
    mockLocale = 'en';
    renderModal(nodeOf('read_sheet'));
    expect(titleName()).toHaveTextContent('Read Sheet Data');
  });
});
