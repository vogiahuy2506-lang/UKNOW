import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../../i18n';
import CampaignSettingsPanel from '../CampaignSettingsPanel';

const { mockSavedEstimate, mockRunEstimate, mockLatestRun, mockLoadSenders } = vi.hoisted(() => ({
  mockLoadSenders: vi.fn(),
  mockSavedEstimate: vi.fn(),
  mockRunEstimate: vi.fn(),
  mockLatestRun: vi.fn(),
}));

// Chỉ phần tra tên tài khoản gọi API → giả; ước tính giả để kiểm tra đúng nhánh nào được dùng.
vi.mock('../useSettingsAccountLookups', () => ({
  default: () => ({ zaloAccounts: [{ id: '5', displayName: 'Shop Hoa' }], telegramAccounts: [], whatsappAccounts: [] }),
}));
// Danh sách tài khoản gửi của thẻ bắt đầu (SenderAccountList → loadSenderAccounts) gọi API → giả.
vi.mock('../../simple/loadSenderAccounts', () => ({ loadSenderAccounts: (...args) => mockLoadSenders(...args) }));
vi.mock('../../hooks/useCampaignEstimate', () => ({ default: (...args) => mockSavedEstimate(...args) }));
vi.mock('../useRunRemainingEstimate', () => ({ default: (...args) => mockRunEstimate(...args) }));
vi.mock('../useCampaignLatestRun', () => ({ default: (...args) => mockLatestRun(...args) }));
// Form thật có spec riêng (NodeConfigForm.spec.jsx); ở đây chỉ kiểm cách Panel mở / đóng / lưu / hỏi xác nhận quanh form.
vi.mock('../../components/NodeConfigForm', () => ({
  default: ({ node, onSave, onCancel, onFormChange }) => (
    <div data-testid="form-stub" data-node-id={node.id}>
      <button type="button" data-testid="stub-type" onClick={() => onFormChange?.({ label: 'x' }, true)}>type</button>
      <button
        type="button"
        data-testid="stub-save"
        onClick={() => onSave({ ...(node.data.config || {}), label: node.data.label, edited: true })}
      >
        save
      </button>
      <button type="button" data-testid="stub-cancel" onClick={onCancel}>cancel</button>
    </div>
  ),
}));

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
  <MemoryRouter>
    <I18nProvider>
      <CampaignSettingsPanel {...baseProps} {...props} />
    </I18nProvider>
  </MemoryRouter>,
);

beforeEach(() => {
  localStorage.clear();
  mockSavedEstimate.mockReset();
  mockSavedEstimate.mockReturnValue({ status: 'idle', estimate: null });
  mockRunEstimate.mockReset();
  mockRunEstimate.mockReturnValue({ status: 'idle', continuous: false, view: null });
  mockLatestRun.mockReset();
  mockLoadSenders.mockReset();
  mockLoadSenders.mockResolvedValue([]);
  mockLatestRun.mockReturnValue({ status: 'ready', run: null });
});

describe('CampaignSettingsPanel — danh sách khối', () => {
  it('liệt kê khối theo thứ tự chạy, mỗi khối một thẻ với các dòng "Nhãn: giá trị" tường minh', () => {
    renderPanel();
    const cards = screen.getAllByTestId('settings-node-card');
    expect(cards.map((card) => card.getAttribute('data-node-id'))).toEqual(['sheet', 'mail']);
    const mail = within(cards[1]);
    expect(mail.getByText('Gửi thư chăm sóc')).toBeInTheDocument();
    expect(mail.getByText('CSKH (cskh@abc.vn)')).toBeInTheDocument();
    expect(mail.getByText('Từ khối “Danh sách khách”, cột “email”')).toBeInTheDocument();
    expect(mail.getByText('Chào mừng · gửi ngay')).toBeInTheDocument();
    expect(mail.getByText('Nhắc lại · 2 ngày sau tin trước')).toBeInTheDocument();
  });

  it('thứ tự theo luồng chứ không theo thứ tự mảng khối', () => {
    renderPanel({ nodes: [...EMAIL_FLOW.nodes].reverse() });
    expect(screen.getAllByTestId('settings-node-card').map((card) => card.getAttribute('data-node-id'))).toEqual(['sheet', 'mail']);
  });

  it('thiếu bắt buộc → dòng đỏ "Chưa chọn …"', () => {
    renderPanel({ emailSettings: [], nodes: [node('mail', 'send_email', {}, 'Gửi thư')], edges: [] });
    const missing = screen.getAllByTestId('settings-line').filter((line) => line.getAttribute('data-tone') === 'missing');
    expect(missing.map((line) => line.textContent)).toEqual([
      'Gửi từChưa chọn tài khoản gửi email',
      'Gửi choChưa chọn nguồn người nhận',
      'Tin 1Chưa chọn mẫu email',
    ]);
    expect(within(missing[0]).getByText('Chưa chọn tài khoản gửi email').className).toContain('text-rose-600');
  });

  it('email trống tài khoản gửi nhưng có tài khoản mặc định → dòng thường "Tài khoản mặc định", checklist Gửi từ ✓', () => {
    renderPanel({ nodes: [node('mail', 'send_email', { recipientSource: 'manual', recipientEmails: 'a@x.vn', emailSteps: [{ templateId: 7 }] }, 'Gửi thư')], edges: [] });
    expect(screen.getByTestId('settings-checklist-row-sender').getAttribute('data-status')).toBe('ok');
    expect(screen.getByTestId('settings-checklist-summary-sender')).toHaveTextContent('Tài khoản mặc định: CSKH (cskh@abc.vn)');
    expect(screen.getByTestId('settings-checklist-summary')).toHaveTextContent('Sẵn sàng chạy');
  });

  it('nhánh điều kiện ghi nhãn nhánh + tên khối điều kiện', () => {
    const nodes = [
      node('start', 'manual_trigger', {}, 'Khởi chạy', 'start'),
      node('cond', 'condition', { rules: [{ field: 'email' }] }, 'Có email?'),
      node('yes', 'send_zalo_personal', { zaloRecipientSource: 'manual', zaloRecipientPhones: '0901', zaloMessage: 'Chào' }, 'Gửi Zalo'),
    ];
    renderPanel({ nodes, edges: [edge('start', 'cond'), edge('cond', 'yes', 'Không có email')] });
    expect(screen.getByTestId('settings-branch-label')).toHaveTextContent('Nhánh “Không có email” của “Có email?”');
    expect(within(screen.getAllByTestId('settings-node-card')[1]).getByTestId('settings-branch-label')).toBeInTheDocument();
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
    // Một lần ở thẻ khối, một lần ở dòng "Gửi từ" của checklist.
    expect(within(screen.getByTestId('settings-node-card')).getByText('Shop Hoa')).toBeInTheDocument();
    expect(screen.getByTestId('settings-checklist-summary-sender')).toHaveTextContent('Shop Hoa');
  });
});

describe('CampaignSettingsPanel — nút Sửa', () => {
  it('bấm Sửa mở form NGAY TRONG thẻ (không overlay), ẩn các dòng tóm tắt của thẻ đó', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('settings-edit-mail'));
    const mailCard = screen.getAllByTestId('settings-node-card').find((card) => card.getAttribute('data-node-id') === 'mail');
    expect(mailCard.getAttribute('data-editing')).toBe('true');
    expect(within(mailCard).getByTestId('form-stub')).toBeInTheDocument();
    expect(within(mailCard).queryAllByTestId('settings-line')).toHaveLength(0);
    expect(screen.getAllByTestId('form-stub')).toHaveLength(1);
  });

  it('chỉ có quyền xem (canEdit=false) → không có nút Sửa và nút Lên lịch', () => {
    renderPanel({ canEdit: false });
    expect(screen.queryByTestId('settings-edit-mail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-open-schedule')).not.toBeInTheDocument();
  });
});

describe('CampaignSettingsPanel — chiến dịch rỗng', () => {
  it('hiện thẻ "Gửi cho ai?" theo kênh + liên kết nhỏ sang Sơ đồ khối; không có ước tính', () => {
    const onGoFlow = vi.fn();
    renderPanel({ nodes: [], edges: [], onGoFlow });
    expect(screen.getByTestId('settings-start')).toHaveTextContent('Gửi cho ai?');
    ['customers', 'landing', 'form', 'sheet', 'manual'].forEach((type) => expect(screen.getByTestId(`settings-start-${type}`)).toBeInTheDocument());
    expect(screen.queryByTestId('settings-start-zalo_groups')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-ordered-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-overview-estimate')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('settings-go-flow'));
    expect(onGoFlow).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['zalo', ['customers', 'landing', 'form', 'sheet', 'manual', 'zalo_friends', 'zalo_groups']],
    ['telegram', ['conversations', 'telegram_groups']],
    ['whatsapp', ['conversations', 'customers', 'landing', 'form', 'sheet', 'whatsapp_groups']],
  ])('kênh %s → đúng các nguồn của trình từng bước', (campaignType, types) => {
    renderPanel({ campaignType, nodes: [], edges: [] });
    const shown = screen.getAllByTestId(/^settings-start-/).map((el) => el.getAttribute('data-testid').replace('settings-start-', '')).filter((id) => id !== 'go-flow');
    expect(shown.sort()).toEqual([...types].sort());
  });

  it('chọn nguồn → onApplyGraph nhận đồ thị MỚI đúng chuỗi khối, rồi mở thẻ thiếu đầu tiên', async () => {
    const onApplyGraph = vi.fn().mockResolvedValue(undefined);
    renderPanel({ nodes: [], edges: [], onApplyGraph });
    fireEvent.click(screen.getByTestId('settings-start-sheet'));
    await waitFor(() => expect(onApplyGraph).toHaveBeenCalledTimes(1));
    const [nextNodes, nextEdges] = onApplyGraph.mock.calls[0];
    expect(nextNodes.map((n) => n.data.nodeType)).toEqual(['manual_trigger', 'read_sheet', 'send_email']);
    expect(nextEdges).toHaveLength(2);
  });

  it('kênh khoá theo gói → thẻ nguồn có ổ khoá, bấm không dựng khung', async () => {
    const onApplyGraph = vi.fn();
    renderPanel({ campaignType: 'telegram', nodes: [], edges: [], onApplyGraph, allowedSendNodeTypes: new Set() });
    fireEvent.click(screen.getByTestId('settings-start-conversations'));
    expect(onApplyGraph).not.toHaveBeenCalled();
  });

  it('màn hẹp: thẻ "Gửi cho ai?" xếp ngay sau Checklist (order-1), còn khi đã có khối thì danh sách khối xếp sau Tổng quan (order-3)', () => {
    const { unmount } = renderPanel({ nodes: [], edges: [] });
    expect(screen.getByTestId('settings-start').parentElement.className).toContain('order-1');
    unmount();
    renderPanel();
    expect(screen.getByTestId('settings-ordered-list').closest('div.order-3')).not.toBeNull();
  });

  it('chỉ có quyền xem hoặc loại chiến dịch lạ → vẫn là trạng thái rỗng cũ (không có thẻ nguồn)', () => {
    const { unmount } = renderPanel({ nodes: [], edges: [], canEdit: false });
    expect(screen.getByTestId('settings-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-start')).not.toBeInTheDocument();
    unmount();
    renderPanel({ campaignType: 'mixed', nodes: [], edges: [] });
    expect(screen.getByTestId('settings-empty')).toBeInTheDocument();
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

  it('ước tính trả về nhưng rỗng (không đếm được gì, không cảnh báo) → nói "chưa ước tính được", không để khung trống chỉ có tiêu đề', () => {
    mockSavedEstimate.mockReturnValue({ status: 'ready', estimate: { totalActions: 0, warnings: [], perDay: [] } });
    renderPanel();
    expect(screen.getByTestId('campaign-estimate-unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('campaign-estimate')).not.toBeInTheDocument();
  });

  it('ước tính có số liệu → hiện khối ước tính đầy đủ', () => {
    mockSavedEstimate.mockReturnValue({
      status: 'ready',
      estimate: { startAt: '2026-10-17T03:00:00Z', finishAtLatest: '2026-10-17T05:00:00Z', totalActions: 40, perDay: [], warnings: [], accounts: [] },
    });
    renderPanel();
    expect(screen.getByTestId('campaign-estimate')).toBeInTheDocument();
    expect(screen.getByTestId('campaign-estimate-finish')).toBeInTheDocument();
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

describe('CampaignSettingsPanel — Lần chạy gần nhất', () => {
  const RUN = { runId: 9, campaignId: 391, status: 'completed', startedAt: '2026-10-17T03:05:00.000Z', waitingUntil: null, waitingReason: null, sent: 42, failed: 3, planned: 50 };

  it('chưa chạy lần nào → "Chưa chạy lần nào", không có liên kết Giám sát', () => {
    renderPanel();
    expect(mockLatestRun).toHaveBeenCalledWith('391', null);
    expect(screen.getByTestId('settings-latest-run-none')).toHaveTextContent('Chưa chạy lần nào');
    expect(screen.queryByTestId('settings-latest-run-link')).not.toBeInTheDocument();
  });

  it('chiến dịch mới (chưa lưu) → không có mục này', () => {
    renderPanel({ campaignId: null, isNewCampaign: true });
    expect(screen.queryByTestId('settings-overview-latest-run')).not.toBeInTheDocument();
  });

  it('lượt đã xong: trạng thái, lúc bắt đầu (giờ VN), đã gửi / dự kiến, chưa gửi được — đúng số hook trả (nguồn sendStats)', () => {
    mockLatestRun.mockReturnValue({ status: 'ready', run: RUN });
    renderPanel();
    expect(screen.getByTestId('settings-latest-run-status')).toHaveTextContent('Xong');
    expect(screen.getByTestId('settings-latest-run')).toHaveTextContent('Bắt đầu 17/10 10:05');
    expect(screen.getByTestId('settings-latest-run-counts')).toHaveTextContent('Đã gửi 42 / 50 · Chưa gửi được 3');
  });

  it('không biết số cần gửi (planned null) → chỉ "Đã gửi N"', () => {
    mockLatestRun.mockReturnValue({ status: 'ready', run: { ...RUN, planned: null } });
    renderPanel();
    expect(screen.getByTestId('settings-latest-run-counts')).toHaveTextContent(/^Đã gửi 42 · Chưa gửi được 3$/);
  });

  it('lượt đang chạy', () => {
    mockLatestRun.mockReturnValue({ status: 'ready', run: { ...RUN, status: 'running' } });
    renderPanel();
    expect(screen.getByTestId('settings-latest-run-status')).toHaveTextContent('Đang gửi');
  });

  it('lượt đang chờ: nêu lý do và tới khi nào', () => {
    mockLatestRun.mockReturnValue({
      status: 'ready',
      run: { ...RUN, status: 'running', waitingUntil: new Date(Date.now() + 3600 * 1000).toISOString(), waitingReason: 'quiet_hours' },
    });
    renderPanel();
    expect(screen.getByTestId('settings-latest-run-status')).toHaveTextContent(/^Đang chờ: đang trong khung giờ yên lặng đến (\d{2}\/\d{2} )?\d{2}:\d{2}$/);
  });

  it('lượt đã dừng', () => {
    mockLatestRun.mockReturnValue({ status: 'ready', run: { ...RUN, status: 'stopped' } });
    renderPanel();
    expect(screen.getByTestId('settings-latest-run-status')).toHaveTextContent('Đã dừng');
  });

  it('liên kết "Xem chi tiết ở Giám sát gửi tin" gọi onOpenDeliveryMonitor', () => {
    mockLatestRun.mockReturnValue({ status: 'ready', run: RUN });
    const onOpenDeliveryMonitor = vi.fn();
    renderPanel({ onOpenDeliveryMonitor });
    fireEvent.click(screen.getByRole('link', { name: 'Xem chi tiết ở Giám sát gửi tin' }));
    expect(onOpenDeliveryMonitor).toHaveBeenCalledTimes(1);
  });

  it('lỗi tải → nói chưa tải được, không bịa số', () => {
    mockLatestRun.mockReturnValue({ status: 'error', run: null });
    renderPanel();
    expect(screen.getByTestId('settings-latest-run-error')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-latest-run-counts')).not.toBeInTheDocument();
  });
});

describe('CampaignSettingsPanel — sửa tại chỗ', () => {
  it('mỗi lúc MỘT thẻ: đang mở thẻ A thì nút Sửa của thẻ khác bị khoá + có title; bấm cũng không mở thêm', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('settings-edit-mail'));
    const other = screen.getByTestId('settings-edit-sheet');
    expect(other).toBeDisabled();
    expect(other.getAttribute('title')).toBe('Lưu hoặc huỷ mục đang sửa trước');
    fireEvent.click(other);
    expect(screen.getAllByTestId('form-stub')).toHaveLength(1);
    expect(screen.getByTestId('form-stub').getAttribute('data-node-id')).toBe('mail');
  });

  it('Hủy đóng thẻ, nút Sửa của các thẻ mở lại', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('settings-edit-mail'));
    fireEvent.click(screen.getByTestId('stub-cancel'));
    expect(screen.queryByTestId('form-stub')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-edit-sheet')).not.toBeDisabled();
  });

  it('Lưu khi form ĐÃ đổi → onSaveNode(node, formData) đúng một lần và thẻ đóng', async () => {
    const onSaveNode = vi.fn();
    renderPanel({ onSaveNode });
    fireEvent.click(screen.getByTestId('settings-edit-mail'));
    fireEvent.click(screen.getByTestId('stub-type'));
    fireEvent.click(screen.getByTestId('stub-save'));
    await waitFor(() => expect(onSaveNode).toHaveBeenCalledTimes(1));
    expect(onSaveNode.mock.calls[0][0]).toBe(EMAIL_FLOW.nodes[2]);
    expect(onSaveNode.mock.calls[0][1].edited).toBe(true);
    expect(screen.queryByTestId('form-stub')).not.toBeInTheDocument();
  });

  it('Lưu khi form KHÔNG đổi → đóng thẻ, không gọi onSaveNode', async () => {
    const onSaveNode = vi.fn();
    renderPanel({ onSaveNode });
    fireEvent.click(screen.getByTestId('settings-edit-mail'));
    fireEvent.click(screen.getByTestId('stub-save'));
    await waitFor(() => expect(screen.queryByTestId('form-stub')).not.toBeInTheDocument());
    expect(onSaveNode).not.toHaveBeenCalled();
  });

  it('báo trang khi thẻ có thay đổi dở (true) và khi đóng (false)', () => {
    const onInlineDirtyChange = vi.fn();
    renderPanel({ onInlineDirtyChange });
    fireEvent.click(screen.getByTestId('settings-edit-mail'));
    fireEvent.click(screen.getByTestId('stub-type'));
    expect(onInlineDirtyChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByTestId('stub-cancel'));
    expect(onInlineDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('Sửa ở dòng checklist khi thẻ khác đang dở → hỏi xác nhận; "Tiếp tục sửa" giữ nguyên, "Bỏ thay đổi" chuyển thẻ', () => {
    renderPanel({ nodes: [...EMAIL_FLOW.nodes.slice(0, 2), node('mail', 'send_email', {}, 'Gửi thư')], edges: EMAIL_FLOW.edges });
    fireEvent.click(screen.getByTestId('settings-edit-sheet'));
    fireEvent.click(screen.getByTestId('stub-type'));
    fireEvent.click(screen.getByTestId('settings-checklist-edit-sender'));
    expect(screen.getByText('Bỏ thay đổi đang sửa?')).toBeInTheDocument();
    expect(screen.getByTestId('form-stub').getAttribute('data-node-id')).toBe('sheet');

    fireEvent.click(screen.getByText('Tiếp tục sửa'));
    expect(screen.queryByText('Bỏ thay đổi đang sửa?')).not.toBeInTheDocument();
    expect(screen.getByTestId('form-stub').getAttribute('data-node-id')).toBe('sheet');

    fireEvent.click(screen.getByTestId('settings-checklist-edit-sender'));
    fireEvent.click(screen.getByText('Bỏ thay đổi'));
    expect(screen.getByTestId('form-stub').getAttribute('data-node-id')).toBe('mail');
  });

  it('thẻ chưa đổi gì → Sửa ở checklist chuyển thẳng, không hỏi', () => {
    renderPanel({ nodes: [...EMAIL_FLOW.nodes.slice(0, 2), node('mail', 'send_email', {}, 'Gửi thư')], edges: EMAIL_FLOW.edges });
    fireEvent.click(screen.getByTestId('settings-edit-sheet'));
    fireEvent.click(screen.getByTestId('settings-checklist-edit-content'));
    expect(screen.queryByText('Bỏ thay đổi đang sửa?')).not.toBeInTheDocument();
    expect(screen.getByTestId('form-stub').getAttribute('data-node-id')).toBe('mail');
  });
});

describe('CampaignSettingsPanel — checklist "Trước khi chạy"', () => {
  it('chiến dịch đủ → "Sẵn sàng chạy", 4 dòng, khối khởi chạy không hiện thành thẻ', () => {
    renderPanel();
    expect(screen.getByTestId('settings-checklist-summary')).toHaveTextContent('Sẵn sàng chạy');
    ['sender', 'audience', 'content', 'timing'].forEach((key) => {
      expect(screen.getByTestId(`settings-checklist-row-${key}`).getAttribute('data-status')).toBe('ok');
    });
    expect(screen.getAllByTestId('settings-node-card').some((card) => card.getAttribute('data-node-type') === 'manual_trigger')).toBe(false);
  });

  it('thiếu → đếm "Còn N mục", dòng ⚠ đỏ, thẻ khối thiếu có nhãn "Còn thiếu"', () => {
    renderPanel({ emailSettings: [], nodes: [node('start', 'manual_trigger', {}, 'Khởi chạy', 'start'), node('mail', 'send_email', {}, 'Gửi thư')], edges: [edge('start', 'mail')] });
    expect(screen.getByTestId('settings-checklist-summary')).toHaveTextContent('Còn 3 mục cần điền trước khi chạy');
    expect(screen.getByTestId('settings-checklist-row-sender').getAttribute('data-status')).toBe('missing');
    expect(screen.getByTestId('settings-checklist-summary-sender').className).toContain('text-rose-600');
    expect(within(screen.getByTestId('settings-node-card')).getByTestId('settings-card-missing')).toBeInTheDocument();
  });

  it('Sửa ở dòng checklist mở đúng thẻ giữ dòng thiếu đầu tiên của vai', () => {
    const nodes = [
      node('start', 'manual_trigger', {}, 'Khởi chạy', 'start'),
      node('sheetA', 'read_sheet', { sheetUrl: 'https://docs.google.com/spreadsheets/d/x' }, 'Sheet A'),
      node('sheetB', 'read_sheet', {}, 'Sheet B'),
      node('mail', 'send_email', { fromEmailId: 3, recipientSource: 'node', recipientNodeId: 'sheetA', recipientField: 'email', emailSteps: [{ templateId: 7 }] }, 'Gửi'),
    ];
    renderPanel({ nodes, edges: [edge('start', 'sheetA'), edge('sheetA', 'sheetB'), edge('sheetB', 'mail')] });
    fireEvent.click(screen.getByTestId('settings-checklist-edit-audience'));
    expect(screen.getByTestId('form-stub').getAttribute('data-node-id')).toBe('sheetB');
  });

  it('Thời điểm luôn ✓; Sửa mở hộp lên lịch', () => {
    const onOpenSchedule = vi.fn();
    renderPanel({ onOpenSchedule });
    expect(screen.getByTestId('settings-checklist-row-timing').getAttribute('data-status')).toBe('ok');
    fireEvent.click(screen.getByTestId('settings-checklist-edit-timing'));
    expect(onOpenSchedule).toHaveBeenCalledTimes(1);
  });

  it('chiến dịch trống → không còn dòng đỏ "Chưa có": Gửi từ (mặc định) ✓, Gửi cho ai chờ chọn, Nội dung mờ; hiện thẻ Gửi từ + Gửi cho ai', () => {
    renderPanel({ nodes: [], edges: [] });
    expect(screen.getByTestId('settings-checklist-summary')).toHaveTextContent('Còn 1 mục cần điền trước khi chạy');
    expect(screen.getByTestId('settings-checklist-summary-sender')).toHaveTextContent('Tài khoản mặc định: CSKH (cskh@abc.vn)');
    expect(screen.getByTestId('settings-checklist-summary-audience')).toHaveTextContent('Chọn ở bên dưới');
    expect(screen.getByTestId('settings-checklist-summary-content')).toHaveTextContent('Có sau khi chọn Gửi cho ai');
    expect(screen.getByTestId('settings-checklist-row-content').getAttribute('data-status')).toBe('idle');
    expect(screen.queryByTestId('settings-checklist-edit-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-start')).toBeInTheDocument();
    expect(screen.getByTestId('settings-sender-part')).toBeInTheDocument();
    expect(screen.getByTestId('settings-audience-part')).toBeInTheDocument();
  });

  it('chiến dịch trống: nút của dòng Gửi từ / Gửi cho ai đưa tới đúng phần bên dưới', () => {
    const scrolled = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function scroll() { scrolled.push(this.getAttribute('data-testid')); };
    try {
      renderPanel({ nodes: [], edges: [] });
      fireEvent.click(screen.getByTestId('settings-checklist-edit-audience'));
      fireEvent.click(screen.getByTestId('settings-checklist-edit-sender'));
      expect(scrolled).toEqual(['settings-audience-part', 'settings-sender-part']);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('email chưa có tài khoản nào: Gửi từ cũng chờ chọn → còn 2 mục', () => {
    renderPanel({ nodes: [], edges: [], emailSettings: [] });
    expect(screen.getByTestId('settings-checklist-summary')).toHaveTextContent('Còn 2 mục cần điền trước khi chạy');
    expect(screen.getByTestId('settings-checklist-summary-sender')).toHaveTextContent('Chọn ở bên dưới');
  });

  it('chỉ có quyền xem → checklist hiện nhưng không có nút Sửa nào', () => {
    renderPanel({ canEdit: false });
    expect(screen.getByTestId('settings-checklist')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-checklist-edit-sender')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-checklist-edit-timing')).not.toBeInTheDocument();
  });
});

describe('CampaignSettingsPanel — chiến dịch trống: chọn "Gửi từ" (PR-C)', () => {
  const ACCOUNTS = {
    email: [
      { id: 3, label: 'cskh@abc.vn', sublabel: 'CSKH', isDefault: true, usable: true, problem: null },
      { id: 9, label: 'sale@abc.vn', sublabel: '', isDefault: false, usable: true, problem: null },
    ],
    zalo: [
      { id: 5, label: 'Shop Hoa', sublabel: '', isDefault: false, usable: true, problem: null },
      { id: 6, label: 'Shop Bánh', sublabel: '', isDefault: false, usable: true, problem: null },
      { id: 7, label: 'Nick hỏng', sublabel: '', isDefault: false, usable: false, problem: 'disconnected' },
    ],
    whatsapp: [
      { id: '40-default', label: '+84 912 345 678', sublabel: '', isDefault: false, usable: true, problem: null },
      { id: '41-x', label: '+84 900 000 000', sublabel: '', isDefault: false, usable: true, problem: null },
    ],
  };
  const pick = async (id) => fireEvent.click(within(await screen.findByTestId(`simple-sender-${id}`)).getAllByRole('button')[0]);
  const open = async (campaignType, props = {}) => {
    mockLoadSenders.mockResolvedValue(ACCOUNTS[campaignType === 'zalo_group' ? 'zalo' : campaignType]);
    const onApplyGraph = vi.fn().mockResolvedValue(undefined);
    renderPanel({ campaignType, nodes: [], edges: [], onApplyGraph, ...props });
    return onApplyGraph;
  };

  it('email: chọn tài khoản rồi chọn nguồn → khối gửi có fromEmailId; checklist hiện đúng tài khoản', async () => {
    const onApplyGraph = await open('email');
    await pick('9');
    expect(screen.getByTestId('settings-checklist-summary-sender')).toHaveTextContent('sale@abc.vn');
    fireEvent.click(screen.getByTestId('settings-start-sheet'));
    await waitFor(() => expect(onApplyGraph).toHaveBeenCalledTimes(1));
    const send = onApplyGraph.mock.calls[0][0].find((n) => n.data.nodeType === 'send_email');
    expect(send.data.config.fromEmailId).toBe(9);
  });

  it('email: không chọn tài khoản → khối gửi không có fromEmailId (= mặc định)', async () => {
    const onApplyGraph = await open('email');
    await screen.findByTestId('simple-sender-9');
    fireEvent.click(screen.getByTestId('settings-start-sheet'));
    await waitFor(() => expect(onApplyGraph).toHaveBeenCalledTimes(1));
    const send = onApplyGraph.mock.calls[0][0].find((n) => n.data.nodeType === 'send_email');
    expect(send.data.config.fromEmailId).toBeUndefined();
  });

  it('Zalo: tài khoản vào khối Chọn tài khoản Zalo; tài khoản mất kết nối không chọn được', async () => {
    const onApplyGraph = await open('zalo');
    expect(await screen.findByTestId('simple-sender-7')).toHaveTextContent('Nick hỏng');
    expect(within(screen.getByTestId('simple-sender-7')).getAllByRole('button')[0]).toBeDisabled();
    await pick('6');
    fireEvent.click(screen.getByTestId('settings-start-customers'));
    await waitFor(() => expect(onApplyGraph).toHaveBeenCalledTimes(1));
    const nodes = onApplyGraph.mock.calls[0][0];
    expect(nodes.find((n) => n.data.nodeType === 'select_zalo_account').data.config.zaloAccountId).toBe(6);
    expect(nodes.find((n) => n.data.nodeType === 'send_zalo_personal').data.config.zaloAccountId).toBeUndefined();
  });

  it('Zalo nhóm: dùng danh sách tài khoản Zalo, tài khoản vào khối chọn tài khoản', async () => {
    const onApplyGraph = await open('zalo_group');
    await pick('5');
    fireEvent.click(screen.getByTestId('settings-start-zalo_groups'));
    await waitFor(() => expect(onApplyGraph).toHaveBeenCalledTimes(1));
    const nodes = onApplyGraph.mock.calls[0][0];
    expect(nodes.map((n) => n.data.nodeType)).toEqual(['manual_trigger', 'select_zalo_account', 'get_all_groups', 'send_zalo_group']);
    expect(nodes[1].data.config.zaloAccountId).toBe(5);
  });

  it('chọn nguồn TRƯỚC, không chọn tài khoản → Zalo để trống (thẻ sẽ báo thiếu)', async () => {
    const onApplyGraph = await open('zalo');
    await screen.findByTestId('simple-sender-5');
    fireEvent.click(screen.getByTestId('settings-start-customers'));
    await waitFor(() => expect(onApplyGraph).toHaveBeenCalledTimes(1));
    expect(onApplyGraph.mock.calls[0][0].find((n) => n.data.nodeType === 'select_zalo_account').data.config.zaloAccountId).toBe('');
  });

  it('WhatsApp: whatsappSessionKey (chuỗi) vào khối gửi', async () => {
    const onApplyGraph = await open('whatsapp');
    await pick('41-x');
    fireEvent.click(screen.getByTestId('settings-start-conversations'));
    await waitFor(() => expect(onApplyGraph).toHaveBeenCalledTimes(1));
    expect(onApplyGraph.mock.calls[0][0].find((n) => n.data.nodeType === 'send_whatsapp').data.config.whatsappSessionKey).toBe('41-x');
  });

  it('email: lượt tải danh sách tài khoản KHÁC khoá GET của trang (limit 100) để api.js không huỷ lượt của trang', async () => {
    await open('email');
    await screen.findByTestId('simple-sender-9');
    expect(mockLoadSenders).toHaveBeenCalledWith('email', { email: { params: { status: 'active', page: 1, limit: 99 } } });
  });

  it('chỉ có quyền xem → không có phần chọn Gửi từ, không tải danh sách tài khoản', () => {
    mockLoadSenders.mockClear();
    renderPanel({ nodes: [], edges: [], canEdit: false });
    expect(screen.queryByTestId('settings-sender-part')).not.toBeInTheDocument();
    expect(mockLoadSenders).not.toHaveBeenCalled();
  });
});
