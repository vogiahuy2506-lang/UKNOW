import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../../i18n';
import CampaignSettingsPanel from '../CampaignSettingsPanel';

const { mockSavedEstimate, mockRunEstimate } = vi.hoisted(() => ({
  mockSavedEstimate: vi.fn(),
  mockRunEstimate: vi.fn(),
}));

// Chỉ phần tra tên tài khoản gọi API → giả; ước tính giả để kiểm tra đúng nhánh nào được dùng.
vi.mock('../useSettingsAccountLookups', () => ({
  default: () => ({ zaloAccounts: [{ id: '5', displayName: 'Shop Hoa' }], telegramAccounts: [], whatsappAccounts: [] }),
}));
vi.mock('../../hooks/useCampaignEstimate', () => ({ default: (...args) => mockSavedEstimate(...args) }));
vi.mock('../useRunRemainingEstimate', () => ({ default: (...args) => mockRunEstimate(...args) }));

const node = (id, nodeType, config = {}, label = '', type = 'task') => ({ id, type, data: { label, nodeType, config } });
const edge = (source, target, label) => ({ id: `${source}-${target}`, source, target, ...(label ? { label } : {}) });

const EMAIL_FLOW = {
  nodes: [
    node('start', 'manual_trigger', {}, 'Khởi chạy', 'start'),
    node('sheet', 'read_sheet', { sheetUrl: 'https://docs.google.com/spreadsheets/d/x', sheetName: 'Tháng 10' }, 'Danh sách khách'),
    node('mail', 'send_email', {
      fromEmailId: 3,
      recipientSource: 'node',
      recipientNodeId: 'sheet',
      recipientField: 'email',
      sendMode: 'schedule',
      emailSteps: [
        { templateId: 7, delayValue: 0, delayUnit: 'minutes', delayFrom: 'start' },
        { templateId: 8, delayValue: 2, delayUnit: 'days', delayFrom: 'prev' },
      ],
    }, 'Gửi thư chăm sóc'),
  ],
  edges: [edge('start', 'sheet'), edge('sheet', 'mail')],
};

const baseProps = {
  campaignId: '391',
  campaignName: 'Chăm sóc khách mới',
  campaignType: 'email',
  campaignStatus: 'draft',
  nodes: EMAIL_FLOW.nodes,
  edges: EMAIL_FLOW.edges,
  emailTemplates: [{ id: 7, templateName: 'Chào mừng' }, { id: 8, templateName: 'Nhắc lại' }],
  emailSettings: [{ id: 3, name: 'CSKH', email: 'cskh@abc.vn' }],
};

const renderPanel = (props = {}) => render(
  <I18nProvider>
    <CampaignSettingsPanel {...baseProps} {...props} />
  </I18nProvider>,
);

beforeEach(() => {
  localStorage.clear();
  mockSavedEstimate.mockReset();
  mockSavedEstimate.mockReturnValue({ status: 'idle', estimate: null });
  mockRunEstimate.mockReset();
  mockRunEstimate.mockReturnValue({ status: 'idle', continuous: false, view: null });
});

describe('CampaignSettingsPanel — danh sách khối', () => {
  it('liệt kê khối theo thứ tự chạy, mỗi khối một thẻ với các dòng "Nhãn: giá trị" tường minh', () => {
    renderPanel();
    const cards = screen.getAllByTestId('settings-node-card');
    expect(cards.map((card) => card.getAttribute('data-node-id'))).toEqual(['start', 'sheet', 'mail']);
    const mail = within(cards[2]);
    expect(mail.getByText('Gửi thư chăm sóc')).toBeInTheDocument();
    expect(mail.getByText('CSKH (cskh@abc.vn)')).toBeInTheDocument();
    expect(mail.getByText('Từ khối “Danh sách khách”, cột “email”')).toBeInTheDocument();
    expect(mail.getByText('Chào mừng · gửi ngay')).toBeInTheDocument();
    expect(mail.getByText('Nhắc lại · 2 ngày sau tin trước')).toBeInTheDocument();
  });

  it('thứ tự theo luồng chứ không theo thứ tự mảng khối', () => {
    renderPanel({ nodes: [...EMAIL_FLOW.nodes].reverse() });
    expect(screen.getAllByTestId('settings-node-card').map((card) => card.getAttribute('data-node-id'))).toEqual(['start', 'sheet', 'mail']);
  });

  it('thiếu bắt buộc → dòng đỏ "Chưa chọn …"', () => {
    renderPanel({ nodes: [node('mail', 'send_email', {}, 'Gửi thư')], edges: [] });
    const missing = screen.getAllByTestId('settings-line').filter((line) => line.getAttribute('data-tone') === 'missing');
    expect(missing.map((line) => line.textContent)).toEqual([
      'Gửi từChưa chọn tài khoản gửi email',
      'Gửi choChưa chọn nguồn người nhận',
      'Tin 1Chưa chọn mẫu email',
    ]);
    expect(within(missing[0]).getByText('Chưa chọn tài khoản gửi email').className).toContain('text-rose-600');
  });

  it('nhánh điều kiện ghi nhãn nhánh + tên khối điều kiện', () => {
    const nodes = [
      node('start', 'manual_trigger', {}, 'Khởi chạy', 'start'),
      node('cond', 'condition', { rules: [{ field: 'email' }] }, 'Có email?'),
      node('yes', 'send_zalo_personal', { zaloRecipientSource: 'manual', zaloRecipientPhones: '0901', zaloMessage: 'Chào' }, 'Gửi Zalo'),
    ];
    renderPanel({ nodes, edges: [edge('start', 'cond'), edge('cond', 'yes', 'Không có email')] });
    expect(screen.getByTestId('settings-branch-label')).toHaveTextContent('Nhánh “Không có email” của “Có email?”');
    expect(within(screen.getAllByTestId('settings-node-card')[2]).getByTestId('settings-branch-label')).toBeInTheDocument();
  });

  it('khối chưa nối nằm ở nhóm riêng bên dưới', () => {
    renderPanel({ nodes: [...EMAIL_FLOW.nodes, node('lac', 'tag_contact', {}, 'Gắn tag lạc')] });
    const group = screen.getByTestId('settings-unconnected');
    expect(within(group).getByText('Chưa nối vào luồng')).toBeInTheDocument();
    expect(within(group).getByText('Gắn tag lạc')).toBeInTheDocument();
    expect(within(screen.getByTestId('settings-ordered-list')).queryByText('Gắn tag lạc')).not.toBeInTheDocument();
  });

  it('tên tài khoản Zalo tra từ danh sách đã tải', () => {
    renderPanel({
      campaignType: 'zalo',
      nodes: [node('acc', 'select_zalo_account', { zaloAccountId: '5' }, 'Chọn tài khoản')],
      edges: [],
    });
    expect(screen.getByText('Shop Hoa')).toBeInTheDocument();
  });
});

describe('CampaignSettingsPanel — nút Sửa', () => {
  it('bấm Sửa gọi onEditNode với đúng khối (trình dựng mở hộp cấu hình)', () => {
    const onEditNode = vi.fn();
    renderPanel({ onEditNode });
    fireEvent.click(screen.getByTestId('settings-edit-mail'));
    expect(onEditNode).toHaveBeenCalledTimes(1);
    expect(onEditNode.mock.calls[0][0]).toBe(EMAIL_FLOW.nodes[2]);
  });

  it('chỉ có quyền xem (canEdit=false) → không có nút Sửa và nút Lên lịch', () => {
    renderPanel({ canEdit: false });
    expect(screen.queryByTestId('settings-edit-mail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-open-schedule')).not.toBeInTheDocument();
  });
});

describe('CampaignSettingsPanel — chiến dịch rỗng', () => {
  it('hiện trạng thái rỗng + nút sang Sơ đồ khối; không có ước tính', () => {
    const onGoFlow = vi.fn();
    renderPanel({ nodes: [], edges: [], onGoFlow });
    expect(screen.getByTestId('settings-empty')).toHaveTextContent('Chiến dịch chưa có khối nào');
    expect(screen.queryByTestId('settings-ordered-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-overview-estimate')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('settings-go-flow'));
    expect(onGoFlow).toHaveBeenCalledTimes(1);
  });
});

describe('CampaignSettingsPanel — tổng quan', () => {
  it('tên, kênh, trạng thái; chưa có lịch thì nói rõ; bấm Lên lịch gọi onOpenSchedule', () => {
    const onOpenSchedule = vi.fn();
    renderPanel({ onOpenSchedule });
    expect(screen.getByTestId('settings-overview-name')).toHaveTextContent('Chăm sóc khách mới');
    expect(screen.getByTestId('settings-no-schedule')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-manage-schedules')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('settings-open-schedule'));
    expect(onOpenSchedule).toHaveBeenCalledTimes(1);
  });

  it('có lịch: liệt kê loại lịch + lần tới + trạng thái, có nút Quản lý lịch', () => {
    const onManageSchedules = vi.fn();
    renderPanel({
      schedules: [{ id: 1 }],
      describeSchedule: () => ({ pattern: 'Hàng tuần (Thứ Hai) — lúc 09:00', nextRun: new Date('2026-10-19T02:00:00Z'), statusLabel: 'Đang bật' }),
      onManageSchedules,
    });
    const item = screen.getByTestId('settings-schedule-item');
    expect(item).toHaveTextContent('Hàng tuần (Thứ Hai) — lúc 09:00');
    expect(item).toHaveTextContent('Đang bật');
    expect(item).toHaveTextContent('Lần tới:');
    fireEvent.click(screen.getByTestId('settings-manage-schedules'));
    expect(onManageSchedules).toHaveBeenCalledTimes(1);
  });

  it('chiến dịch mới chưa lưu: nhắc lưu trước, không gọi ước tính', () => {
    renderPanel({ campaignId: null, isNewCampaign: true });
    expect(screen.getByTestId('settings-overview-schedule')).toHaveTextContent('Lưu chiến dịch trước đã');
    expect(screen.queryByTestId('settings-overview-estimate')).not.toBeInTheDocument();
    expect(mockSavedEstimate).not.toHaveBeenCalled();
  });
});

describe('CampaignSettingsPanel — ước tính', () => {
  it('không chạy: ước tính của bản đã lưu, tải lại theo thời điểm lưu', () => {
    renderPanel({ lastSavedTime: '2026-10-17T10:00:00Z' });
    expect(mockSavedEstimate).toHaveBeenCalledWith(expect.objectContaining({ campaignId: '391', enabled: true, refreshKey: '2026-10-17T10:00:00Z' }));
    expect(mockRunEstimate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('settings-estimate-dirty')).not.toBeInTheDocument();
  });

  it('có thay đổi chưa lưu → dòng cảnh báo "ước tính theo bản đã lưu"', () => {
    renderPanel({ isDirty: true });
    expect(screen.getByTestId('settings-estimate-dirty')).toHaveTextContent('ước tính theo bản đã lưu');
  });

  it('đang chạy: hiện thời gian CÒN LẠI của lượt chạy, không dùng ước tính bản đã lưu', () => {
    mockRunEstimate.mockReturnValue({
      status: 'ready',
      continuous: false,
      view: { finishAtLatest: new Date(Date.now() + 3 * 3600 * 1000).toISOString(), warnings: [] },
    });
    renderPanel({ runningRunId: 88 });
    expect(mockRunEstimate).toHaveBeenCalledWith(88);
    expect(screen.getByTestId('settings-run-estimate')).toHaveTextContent('Dự kiến xong');
    expect(screen.getByTestId('settings-overview')).toHaveTextContent('Còn lại');
    expect(mockSavedEstimate).not.toHaveBeenCalled();
  });

  it('đang chạy chế độ liên tục: nói "chạy liên tục", không có con số', () => {
    mockRunEstimate.mockReturnValue({ status: 'ready', continuous: true, view: null });
    renderPanel({ runningRunId: 88 });
    expect(screen.getByTestId('settings-run-estimate-continuous')).toBeInTheDocument();
  });
});
