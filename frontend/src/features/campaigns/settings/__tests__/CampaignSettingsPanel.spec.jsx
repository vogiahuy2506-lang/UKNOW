import { useState } from 'react';
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
// Danh sách tài khoản gửi (SenderAccountList → loadSenderAccounts) gọi API → giả.
vi.mock('../../simple/loadSenderAccounts', () => ({ loadSenderAccounts: (...args) => mockLoadSenders(...args) }));
vi.mock('../../hooks/useCampaignEstimate', () => ({ default: (...args) => mockSavedEstimate(...args) }));
vi.mock('../useRunRemainingEstimate', () => ({ default: (...args) => mockRunEstimate(...args) }));
vi.mock('../useCampaignLatestRun', () => ({ default: (...args) => mockLatestRun(...args) }));
// Hộp cài đặt khối thật có spec riêng (NodeConfigForm.spec.jsx); ở đây chỉ kiểm tab Thiết lập mở đúng khối / đúng mục và lưu qua onSaveNode.
vi.mock('../../components/NodeConfigModal', async () => {
  const { createNodeConfigFormData } = await import('../../utils/nodeConfigModal.helpers');
  return {
  default: ({ node, onSave, onClose, initialSection, campaignType }) => (
    <div data-testid="modal-stub" data-node-id={node.id} data-initial-section={initialSection ?? ''}>
      <button type="button" data-testid="stub-save" onClick={() => onSave({ ...(node.data.config || {}), label: node.data.label, edited: true })}>save</button>
      <button
        type="button"
        data-testid="stub-unchanged"
        onClick={() => onSave(createNodeConfigFormData({ config: node.data.config || {}, label: node.data.label, normalizeEmailSteps: true, nodeType: node.data.nodeType, campaignType }))}
      >
        unchanged
      </button>
      <button type="button" data-testid="stub-close" onClick={onClose}>close</button>
    </div>
  ),
  };
});

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

const MANUAL_EMAIL_FLOW = {
  nodes: [
    node('start', 'manual_trigger', {}, 'Khởi chạy', 'start'),
    node('mail', 'send_email', { fromEmailId: 3, recipientSource: 'manual', recipientEmails: 'a@x.vn\nb@x.vn', emailSteps: [{ templateId: 7, delayValue: 0, delayUnit: 'days', delayFrom: 'start' }] }, 'Gửi thư'),
  ],
  edges: [edge('start', 'mail')],
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

/** Trang thật giữ nodes/edges trong state và áp đồ thị mới trước khi lưu; harness làm đúng vậy để thẻ thấy khối vừa thêm. */
const Harness = ({ onApplyGraph, ...props }) => {
  const [graph, setGraph] = useState({ nodes: props.nodes, edges: props.edges });
  return (
    <CampaignSettingsPanel
      {...baseProps}
      {...props}
      nodes={graph.nodes}
      edges={graph.edges}
      onApplyGraph={async (nextNodes, nextEdges) => {
        setGraph({ nodes: nextNodes, edges: nextEdges });
        await onApplyGraph(nextNodes, nextEdges);
      }}
    />
  );
};
const renderHarness = (props) => render(<MemoryRouter><I18nProvider><Harness {...props} /></I18nProvider></MemoryRouter>);

const EMAIL_ACCOUNTS = [
  { id: 3, label: 'cskh@abc.vn', sublabel: 'CSKH', isDefault: true, usable: true, problem: null },
  { id: 9, label: 'sale@abc.vn', sublabel: '', isDefault: false, usable: true, problem: null },
];

beforeEach(() => {
  localStorage.clear();
  mockSavedEstimate.mockReset();
  mockSavedEstimate.mockReturnValue({ status: 'idle', estimate: null });
  mockRunEstimate.mockReset();
  mockRunEstimate.mockReturnValue({ status: 'idle', continuous: false, view: null });
  mockLatestRun.mockReset();
  mockLoadSenders.mockReset();
  mockLoadSenders.mockResolvedValue(EMAIL_ACCOUNTS);
  mockLatestRun.mockReturnValue({ status: 'ready', run: null });
});

const pickSender = async (id) => fireEvent.click(within(await screen.findByTestId(`simple-sender-${id}`)).getAllByRole('button')[0]);
const summaryOf = (key) => screen.getByTestId(`settings-section-summary-${key}`).textContent;
const statusOf = (key) => screen.getByTestId(`settings-section-${key}`).getAttribute('data-status');

describe('CampaignSettingsPanel — năm mục có biểu mẫu riêng', () => {
  it('hiện đúng 5 mục theo thứ tự, mỗi mục tóm tắt một dòng bằng chữ của người dùng; KHÔNG còn thẻ khối hay form khối', () => {
    renderPanel();
    const order = ['sender', 'audience', 'content', 'timing'].map((key) => screen.getByTestId(`settings-section-${key}`));
    order.reduce((prev, current) => {
      expect(prev.compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // eslint-disable-line no-bitwise
      return current;
    });
    expect(summaryOf('sender')).toBe('CSKH (cskh@abc.vn)');
    expect(summaryOf('audience')).toBe('Danh sách Google Sheet: https://docs.google.com/spreadsheets/d/x · Tháng 10');
    expect(screen.getByTestId('settings-content-list')).toHaveTextContent('Tin 1Chào mừng · gửi ngay');
    expect(screen.getByTestId('settings-content-list')).toHaveTextContent('Tin 2Nhắc lại · 2 ngày sau tin trước');
    expect(summaryOf('timing')).toBe('Chạy khi bạn bấm Chạy ngay');
    expect(screen.queryByTestId('settings-node-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-inline-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-ordered-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-checklist')).not.toBeInTheDocument();
  });

  it('chữ hiện cho người dùng không có "node", "khối" hay "Lấy từ node trước" (trừ tên tab Sơ đồ khối)', () => {
    renderPanel();
    const visible = screen.getByTestId('settings-sections').textContent.replace(/Sơ đồ khối/g, '').replace(/Cài đặt nâng cao/g, '');
    expect(visible).not.toMatch(/node|khối|Lấy từ/i);
    expect(screen.getByTestId('campaign-settings-panel').textContent).not.toMatch(/Lấy từ node trước/i);
  });

  it('dòng trạng thái: đủ → "Sẵn sàng chạy"; thiếu → đếm "Còn N mục" (Gửi từ · Gửi cho ai · Nội dung)', () => {
    const { unmount } = renderPanel();
    expect(screen.getByTestId('settings-status-summary')).toHaveTextContent('Sẵn sàng chạy');
    unmount();
    renderPanel({ emailSettings: [], nodes: [node('start', 'manual_trigger', {}, 'Khởi chạy', 'start'), node('mail', 'send_email', {}, 'Gửi thư')], edges: [edge('start', 'mail')] });
    expect(screen.getByTestId('settings-status')).toHaveAttribute('data-missing-count', '3');
    expect(screen.getByTestId('settings-status-summary')).toHaveTextContent('Còn 3 mục cần điền trước khi chạy');
    expect(statusOf('sender')).toBe('missing');
    expect(statusOf('audience')).toBe('missing');
    expect(statusOf('content')).toBe('missing');
    expect(summaryOf('audience')).toBe('Chưa chọn người nhận');
  });

  it('email trống tài khoản nhưng có tài khoản mặc định → Gửi từ ✓ "Tài khoản mặc định", sẵn sàng chạy', () => {
    renderPanel({ nodes: [node('mail', 'send_email', { recipientSource: 'manual', recipientEmails: 'a@x.vn', emailSteps: [{ templateId: 7 }] }, 'Gửi thư')], edges: [] });
    expect(statusOf('sender')).toBe('ok');
    expect(summaryOf('sender')).toBe('Tài khoản mặc định: CSKH (cskh@abc.vn)');
    expect(screen.getByTestId('settings-status-summary')).toHaveTextContent('Sẵn sàng chạy');
  });

  it('màn hẹp: các mục xếp TRƯỚC Tổng quan (order-1 / order-2)', () => {
    renderPanel();
    expect(screen.getByTestId('settings-sections').closest('div.order-1')).not.toBeNull();
    expect(screen.getByTestId('settings-overview').className).toContain('order-2');
  });

  it('chỉ có quyền xem → có tóm tắt nhưng không có nút Sửa / Lên lịch / Cài đặt nâng cao nào', () => {
    renderPanel({ canEdit: false });
    expect(screen.getByTestId('settings-section-sender')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-section-edit-sender')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-section-edit-audience')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-section-edit-timing')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-section-advanced-audience')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-open-schedule')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-content-edit-mail')).not.toBeInTheDocument();
  });

  it('rẽ nhánh: dải thông báo; Gửi cho ai không sửa nhanh được, chỉ tóm tắt + Cài đặt nâng cao', () => {
    const nodes = [
      node('start', 'manual_trigger', {}, 'Khởi chạy', 'start'),
      node('cond', 'condition', { rules: [{ field: 'email' }] }, 'Có email?'),
      node('yes', 'send_zalo_personal', { zaloRecipientSource: 'manual', zaloRecipientPhones: '0901', zaloMessage: 'Chào' }, 'Gửi Zalo'),
      node('no', 'send_email', { recipientSource: 'manual', recipientEmails: 'a@x.vn' }, 'Gửi thư'),
    ];
    renderPanel({ nodes, edges: [edge('start', 'cond'), edge('cond', 'yes', 'Có'), edge('cond', 'no', 'Không')] });
    expect(screen.getByTestId('settings-branch-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-section-edit-audience')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-section-reason-audience')).toHaveTextContent('rẽ nhánh');
    expect(screen.getByTestId('settings-section-advanced-audience')).toBeInTheDocument();
  });

  it('khối chưa nối vào luồng → dải nhắc bằng chữ thường', () => {
    renderPanel({ nodes: [...EMAIL_FLOW.nodes, node('lac', 'read_sheet', {}, 'Lạc trôi')], edges: EMAIL_FLOW.edges });
    expect(screen.getByTestId('settings-unconnected')).toHaveTextContent('chưa nối vào luồng chạy');
  });

  it('chưa có bước gửi nhưng có khối khác → báo chưa có bước gửi + nút sang Sơ đồ khối, không có biểu mẫu', () => {
    const onGoFlow = vi.fn();
    renderPanel({ nodes: [node('start', 'manual_trigger', {}, 'Khởi chạy', 'start'), node('s', 'read_sheet', { sheetUrl: 'u' }, 'Đọc')], edges: [edge('start', 's')], onGoFlow });
    expect(screen.getByTestId('settings-no-send')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-section-sender')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('settings-go-flow'));
    expect(onGoFlow).toHaveBeenCalledTimes(1);
  });
});

describe('CampaignSettingsPanel — Gửi từ', () => {
  it('Sửa mở danh sách tài khoản NGAY TRONG mục; chọn tài khoản khác + Lưu → onApplyGraph nhận đồ thị mới đúng fromEmailId', async () => {
    const onApplyGraph = vi.fn().mockResolvedValue(undefined);
    renderPanel({ onApplyGraph });
    fireEvent.click(screen.getByTestId('settings-section-edit-sender'));
    expect(screen.getByTestId('settings-sender-form')).toBeInTheDocument();
    expect(screen.getByTestId('settings-section-sender').getAttribute('data-editing')).toBe('true');
    expect(screen.getByTestId('settings-sender-save')).toBeDisabled();
    await pickSender('9');
    fireEvent.click(screen.getByTestId('settings-sender-save'));
    await waitFor(() => expect(onApplyGraph).toHaveBeenCalledTimes(1));
    const [nextNodes, nextEdges] = onApplyGraph.mock.calls[0];
    expect(nextNodes.find((item) => item.id === 'mail').data.config).toMatchObject({ fromEmailId: 9, recipientNodeId: 'sheet', recipientField: 'email' });
    expect(nextNodes.find((item) => item.id === 'mail').data.config.emailSteps).toEqual(EMAIL_FLOW.nodes[2].data.config.emailSteps);
    expect(nextNodes.find((item) => item.id === 'sheet')).toBe(EMAIL_FLOW.nodes[1]);
    expect(nextEdges).toBe(EMAIL_FLOW.edges);
    expect(screen.queryByTestId('settings-sender-form')).not.toBeInTheDocument();
  });

  it('Huỷ đóng biểu mẫu, không gọi onApplyGraph', async () => {
    const onApplyGraph = vi.fn();
    renderPanel({ onApplyGraph });
    fireEvent.click(screen.getByTestId('settings-section-edit-sender'));
    await pickSender('9');
    fireEvent.click(screen.getByTestId('settings-sender-cancel'));
    expect(screen.queryByTestId('settings-sender-form')).not.toBeInTheDocument();
    expect(onApplyGraph).not.toHaveBeenCalled();
  });

  it('mỗi lúc MỘT mục: đang mở Gửi từ thì Sửa của Gửi cho ai mờ + có title, bấm không mở thêm; báo trang khi có thay đổi dở', async () => {
    const onInlineDirtyChange = vi.fn();
    renderPanel({ onInlineDirtyChange });
    fireEvent.click(screen.getByTestId('settings-section-edit-sender'));
    const audienceEdit = screen.getByTestId('settings-section-edit-audience');
    expect(audienceEdit).toBeDisabled();
    expect(audienceEdit).toHaveAttribute('title', 'Lưu hoặc huỷ mục đang sửa trước');
    fireEvent.click(audienceEdit);
    expect(screen.queryByTestId('settings-audience-editor')).not.toBeInTheDocument();
    expect(onInlineDirtyChange).toHaveBeenLastCalledWith(false);
    await pickSender('9');
    await waitFor(() => expect(onInlineDirtyChange).toHaveBeenLastCalledWith(true));
    fireEvent.click(screen.getByTestId('settings-sender-cancel'));
    await waitFor(() => expect(onInlineDirtyChange).toHaveBeenLastCalledWith(false));
  });

  it('Zalo bật luân phiên nhiều tài khoản → tóm tắt "Gửi luân phiên N tài khoản", không có nút Sửa, có Cài đặt nâng cao', () => {
    const nodes = [
      node('start', 'manual_trigger', {}, 'Khởi chạy', 'start'),
      node('acc', 'select_zalo_account', { zaloPoolMultiAccountEnabled: true, zaloPoolAccountIds: ['5', '6'] }, 'Chọn tài khoản'),
      node('z', 'send_zalo_personal', { zaloRecipientSource: 'manual', zaloRecipientPhones: '0901234567', zaloPersonalTemplateSteps: [{ templateId: 21 }] }, 'Gửi Zalo'),
    ];
    renderPanel({ campaignType: 'zalo', nodes, edges: [edge('start', 'acc'), edge('acc', 'z')], zaloTemplates: [{ id: 21, templateName: 'Mời học' }] });
    expect(summaryOf('sender')).toBe('Gửi luân phiên 2 tài khoản');
    expect(screen.queryByTestId('settings-section-edit-sender')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('settings-section-advanced-sender'));
    expect(screen.getByTestId('modal-stub')).toHaveAttribute('data-node-id', 'acc');
  });
});

describe('CampaignSettingsPanel — Gửi cho ai', () => {
  it('email nhập tay: Sửa mở thẻ nguồn + ô nhập của trình từng bước; nhập thêm + Lưu → recipientEmails mới, mọi trường khác giữ', async () => {
    const onApplyGraph = vi.fn().mockResolvedValue(undefined);
    renderPanel({ nodes: MANUAL_EMAIL_FLOW.nodes, edges: MANUAL_EMAIL_FLOW.edges, onApplyGraph });
    expect(summaryOf('audience')).toBe('2 email nhập tay');
    fireEvent.click(screen.getByTestId('settings-section-edit-audience'));
    expect(screen.getByTestId('settings-audience-manual')).toHaveAttribute('aria-pressed', 'true');
    const box = screen.getByLabelText('Danh sách email');
    expect(box.value).toBe('a@x.vn\nb@x.vn');
    expect(screen.getByTestId('settings-audience-save')).toBeDisabled();
    fireEvent.change(box, { target: { value: 'a@x.vn\nb@x.vn\nc@x.vn' } });
    fireEvent.click(screen.getByTestId('settings-audience-save'));
    await waitFor(() => expect(onApplyGraph).toHaveBeenCalledTimes(1));
    const config = onApplyGraph.mock.calls[0][0].find((item) => item.id === 'mail').data.config;
    expect(config).toMatchObject({ recipientEmails: 'a@x.vn\nb@x.vn\nc@x.vn', recipientSource: 'manual', fromEmailId: 3 });
    expect(config.emailSteps).toEqual(MANUAL_EMAIL_FLOW.nodes[1].data.config.emailSteps);
  });

  it('không Lưu được khi còn mục sai định dạng (đúng luật của trình từng bước)', () => {
    renderPanel({ nodes: MANUAL_EMAIL_FLOW.nodes, edges: MANUAL_EMAIL_FLOW.edges });
    fireEvent.click(screen.getByTestId('settings-section-edit-audience'));
    fireEvent.change(screen.getByLabelText('Danh sách email'), { target: { value: 'a@x.vn\nkhong-phai-email' } });
    expect(screen.getByTestId('settings-audience-save')).toBeDisabled();
    expect(screen.getByTestId('simple-manual-invalid')).toBeInTheDocument();
  });

  it('đổi nguồn: nhập tay → khách đã lưu giữ tài khoản + mẫu, chèn khối nguồn (onApplyGraph nhận đồ thị mới)', async () => {
    const onApplyGraph = vi.fn().mockResolvedValue(undefined);
    renderPanel({ nodes: MANUAL_EMAIL_FLOW.nodes, edges: MANUAL_EMAIL_FLOW.edges, onApplyGraph });
    fireEvent.click(screen.getByTestId('settings-section-edit-audience'));
    fireEvent.click(screen.getByTestId('settings-audience-customers'));
    fireEvent.click(screen.getByTestId('settings-audience-save'));
    await waitFor(() => expect(onApplyGraph).toHaveBeenCalledTimes(1));
    const [nextNodes] = onApplyGraph.mock.calls[0];
    expect(nextNodes.map((item) => item.data.nodeType)).toEqual(['manual_trigger', 'send_email', 'read_interested_customers']);
    const mail = nextNodes.find((item) => item.id === 'mail').data.config;
    expect(mail).toMatchObject({ fromEmailId: 3, recipientSource: 'node', recipientField: 'email' });
    expect(mail.emailSteps[0].templateId).toBe(7);
  });

  it('cấu hình ngoài khả năng của panel (Google Sheet chọn cột riêng) → chỉ tóm tắt bằng chữ thường + lý do + Cài đặt nâng cao mở đúng khối nguồn; KHÔNG có nút Sửa', () => {
    const nodes = EMAIL_FLOW.nodes.map((item) => (item.id === 'mail' ? { ...item, data: { ...item.data, config: { ...item.data.config, recipientField: 'Mail lien he' } } } : item));
    renderPanel({ nodes });
    expect(summaryOf('audience')).toBe('Danh sách Google Sheet: https://docs.google.com/spreadsheets/d/x · Tháng 10 · cột “Mail lien he”');
    expect(screen.queryByTestId('settings-section-edit-audience')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-section-reason-audience')).toHaveTextContent('Mở Cài đặt nâng cao');
    fireEvent.click(screen.getByTestId('settings-section-advanced-audience'));
    expect(screen.getByTestId('modal-stub')).toHaveAttribute('data-node-id', 'sheet');
    expect(screen.getByTestId('modal-stub')).toHaveAttribute('data-initial-section', 'basic');
  });

  it('kênh khoá theo gói → bấm thẻ nguồn khác không đổi nguồn (vẫn ô nhập email, chưa có gì để Lưu)', () => {
    renderPanel({ nodes: MANUAL_EMAIL_FLOW.nodes, edges: MANUAL_EMAIL_FLOW.edges, allowedSendNodeTypes: new Set() });
    fireEvent.click(screen.getByTestId('settings-section-edit-audience'));
    fireEvent.click(screen.getByTestId('settings-audience-customers'));
    expect(screen.getByLabelText('Danh sách email')).toBeInTheDocument();
    expect(screen.getByTestId('settings-audience-save')).toBeDisabled();
  });
});

describe('CampaignSettingsPanel — Nội dung / Thời điểm / Sau khi gửi (E1: chỉ tóm tắt, chỗ sửa tạm là hộp cài đặt)', () => {
  it('Nội dung: Sửa mở hộp cài đặt của khối gửi ở mục mẫu; lưu qua onSaveNode; không đổi gì thì không lưu', async () => {
    const onSaveNode = vi.fn();
    renderPanel({ onSaveNode });
    fireEvent.click(screen.getByTestId('settings-content-edit-mail'));
    expect(screen.getByTestId('modal-stub')).toHaveAttribute('data-node-id', 'mail');
    expect(screen.getByTestId('modal-stub')).toHaveAttribute('data-initial-section', 'templates');
    fireEvent.click(screen.getByTestId('stub-unchanged'));
    expect(onSaveNode).not.toHaveBeenCalled();
    expect(screen.queryByTestId('modal-stub')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('settings-content-edit-mail'));
    fireEvent.click(screen.getByTestId('stub-save'));
    await waitFor(() => expect(onSaveNode).toHaveBeenCalledTimes(1));
    expect(onSaveNode.mock.calls[0][0].id).toBe('mail');
    expect(onSaveNode.mock.calls[0][1]).toMatchObject({ edited: true });
  });

  it('Thời điểm: nút Đặt lịch mở hộp lên lịch có sẵn; chiến dịch mới chưa lưu thì không có nút', () => {
    const onOpenSchedule = vi.fn();
    const { unmount } = renderPanel({ onOpenSchedule });
    fireEvent.click(screen.getByTestId('settings-section-edit-timing'));
    expect(onOpenSchedule).toHaveBeenCalledTimes(1);
    unmount();
    renderPanel({ isNewCampaign: true, campaignId: null });
    expect(screen.queryByTestId('settings-section-edit-timing')).not.toBeInTheDocument();
  });

  it('Sau khi gửi: thêm bước → onApplyGraph nhận đồ thị có bước mới nối cuối chuỗi, rồi mở hộp cài đặt của bước mới', async () => {
    const onApplyGraph = vi.fn().mockResolvedValue(undefined);
    renderHarness({ onApplyGraph, nodes: EMAIL_FLOW.nodes, edges: EMAIL_FLOW.edges });
    fireEvent.click(screen.getByTestId('settings-add-step-button'));
    fireEvent.click(screen.getByTestId('settings-add-step-tag_contact'));
    await waitFor(() => expect(onApplyGraph).toHaveBeenCalledTimes(1));
    const [nextNodes, nextEdges] = onApplyGraph.mock.calls[0];
    expect(nextNodes.map((item) => item.data.nodeType)).toEqual(['manual_trigger', 'read_sheet', 'send_email', 'tag_contact']);
    expect(nextEdges).toHaveLength(3);
    expect((await screen.findByTestId('modal-stub')).getAttribute('data-node-id')).toBe(nextNodes[3].id);
  });

  it('Sau khi gửi: bước phụ có Sửa + Xoá (xác nhận) → nối lại khối trước với khối sau; rẽ nhánh thì nút thêm bị tắt', async () => {
    const onApplyGraph = vi.fn().mockResolvedValue(undefined);
    const nodes = [...EMAIL_FLOW.nodes, node('tag', 'tag_contact', { tagName: 'vip', tagSourceNodeId: 'sheet' }, 'Gắn thẻ VIP')];
    const edges = [...EMAIL_FLOW.edges, edge('mail', 'tag')];
    renderPanel({ nodes, edges, onApplyGraph });
    expect(screen.getByTestId('settings-after-body')).toHaveTextContent('Gắn thẻ “vip”');
    fireEvent.click(screen.getByTestId('settings-remove-tag'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Xoá bước' }).pop());
    await waitFor(() => expect(onApplyGraph).toHaveBeenCalledTimes(1));
    expect(onApplyGraph.mock.calls[0][0].map((item) => item.id)).toEqual(['start', 'sheet', 'mail']);
  });

  it('Cài đặt nâng cao của hộp: mở hộp của đúng khối nguồn', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('settings-section-advanced-audience'));
    expect(screen.getByTestId('modal-stub')).toHaveAttribute('data-node-id', 'sheet');
    fireEvent.click(screen.getByTestId('stub-close'));
    expect(screen.queryByTestId('modal-stub')).not.toBeInTheDocument();
  });
});

describe('CampaignSettingsPanel — chiến dịch trống: Gửi từ + Gửi cho ai bằng biểu mẫu riêng', () => {
  const ACCOUNTS = {
    zalo: [
      { id: 5, label: 'Shop Hoa', sublabel: '', isDefault: false, usable: true, problem: null },
      { id: 6, label: 'Shop Bánh', sublabel: '', isDefault: false, usable: true, problem: null },
      { id: 7, label: 'Nick hỏng', sublabel: '', isDefault: false, usable: false, problem: 'disconnected' },
    ],
    whatsapp: [{ id: '40-default', label: '+84 912 345 678', sublabel: '', isDefault: false, usable: true, problem: null }],
  };
  const open = (campaignType, props = {}) => {
    if (ACCOUNTS[campaignType]) mockLoadSenders.mockResolvedValue(ACCOUNTS[campaignType]);
    const onApplyGraph = vi.fn().mockResolvedValue(undefined);
    renderPanel({ campaignType, nodes: [], edges: [], onApplyGraph, ...props });
    return onApplyGraph;
  };

  it('hiện Gửi từ (danh sách tài khoản) + Gửi cho ai (thẻ nguồn theo kênh + liên kết nhỏ sang Sơ đồ khối); Nội dung mờ; không có ước tính; không có form khối', async () => {
    const onGoFlow = vi.fn();
    open('email', { onGoFlow });
    expect(screen.getByTestId('settings-section-sender')).toBeInTheDocument();
    expect(await screen.findByTestId('simple-sender-3')).toBeInTheDocument();
    ['customers', 'landing', 'form', 'sheet', 'manual'].forEach((type) => expect(screen.getByTestId(`settings-audience-${type}`)).toBeInTheDocument());
    expect(screen.queryByTestId('settings-audience-zalo_groups')).not.toBeInTheDocument();
    expect(statusOf('content')).toBe('idle');
    expect(summaryOf('content')).toBe('Có sau khi chọn người nhận');
    expect(screen.queryByTestId('settings-overview-estimate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('modal-stub')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('settings-go-flow'));
    expect(onGoFlow).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['zalo', ['customers', 'landing', 'form', 'sheet', 'manual', 'zalo_friends', 'zalo_groups']],
    ['telegram', ['conversations', 'telegram_groups']],
    ['whatsapp', ['conversations', 'customers', 'landing', 'form', 'sheet', 'whatsapp_groups']],
  ])('kênh %s → đúng các nguồn của trình từng bước', (campaignType, types) => {
    open(campaignType);
    const every = ['customers', 'landing', 'form', 'sheet', 'manual', 'zalo_friends', 'zalo_groups', 'telegram_groups', 'whatsapp_groups', 'conversations'];
    const shown = every.filter((type) => screen.queryByTestId(`settings-audience-${type}`));
    expect(shown.sort()).toEqual([...types].sort());
  });

  it('email: chọn tài khoản + "Tự nhập danh sách" + gõ email + Tạo → khung dựng sẵn có fromEmailId + danh sách đã gõ; chỉ còn Nội dung thiếu', async () => {
    const onApplyGraph = open('email');
    await pickSender('9');
    expect(summaryOf('sender')).toBe('sale@abc.vn');
    fireEvent.click(screen.getByTestId('settings-audience-manual'));
    expect(screen.getByTestId('settings-audience-save')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Danh sách email'), { target: { value: 'a@x.vn, b@x.vn' } });
    fireEvent.click(screen.getByTestId('settings-audience-save'));
    await waitFor(() => expect(onApplyGraph).toHaveBeenCalledTimes(1));
    const [nextNodes, nextEdges] = onApplyGraph.mock.calls[0];
    expect(nextNodes.map((item) => item.data.nodeType)).toEqual(['manual_trigger', 'send_email']);
    expect(nextEdges).toHaveLength(1);
    expect(nextNodes[1].data.config).toMatchObject({ fromEmailId: 9, recipientSource: 'manual', recipientEmails: 'a@x.vn\nb@x.vn' });
  });

  it('email: không chọn tài khoản → khối gửi không có fromEmailId (= mặc định)', async () => {
    const onApplyGraph = open('email');
    fireEvent.click(screen.getByTestId('settings-audience-manual'));
    fireEvent.change(screen.getByLabelText('Danh sách email'), { target: { value: 'a@x.vn' } });
    fireEvent.click(screen.getByTestId('settings-audience-save'));
    await waitFor(() => expect(onApplyGraph).toHaveBeenCalledTimes(1));
    expect(onApplyGraph.mock.calls[0][0][1].data.config.fromEmailId).toBeUndefined();
  });

  it('Zalo: tài khoản vào khối chọn tài khoản; nick mất kết nối không chọn được; bạn bè / nhóm chưa có tài khoản → nhắc chọn Gửi từ trước', async () => {
    const onApplyGraph = open('zalo');
    expect(await screen.findByTestId('simple-sender-7')).toBeInTheDocument();
    expect(within(screen.getByTestId('simple-sender-7')).getAllByRole('button')[0]).toBeDisabled();
    fireEvent.click(screen.getByTestId('settings-audience-zalo_groups'));
    expect(screen.getByTestId('settings-audience-need-account')).toHaveTextContent('Hãy chọn tài khoản gửi ở mục Gửi từ trước');
    await pickSender('5');
    fireEvent.click(screen.getByTestId('settings-audience-manual'));
    fireEvent.change(screen.getByLabelText('Danh sách số điện thoại'), { target: { value: '0901234567' } });
    fireEvent.click(screen.getByTestId('settings-audience-save'));
    await waitFor(() => expect(onApplyGraph).toHaveBeenCalledTimes(1));
    const [nextNodes] = onApplyGraph.mock.calls[0];
    expect(nextNodes.map((item) => item.data.nodeType)).toEqual(['manual_trigger', 'select_zalo_account', 'send_zalo_personal']);
    expect(nextNodes[1].data.config.zaloAccountId).toBe(5);
    expect(nextNodes[2].data.config).toMatchObject({ zaloRecipientSource: 'manual', zaloRecipientPhones: '0901234567' });
  });

  it('báo trang có thay đổi dở khi đã chọn nguồn mà chưa Tạo', () => {
    const onInlineDirtyChange = vi.fn();
    open('email', { onInlineDirtyChange });
    fireEvent.click(screen.getByTestId('settings-audience-manual'));
    expect(onInlineDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it('chỉ có quyền xem hoặc loại chiến dịch lạ → vẫn là trạng thái rỗng (không có biểu mẫu), không tải danh sách tài khoản', () => {
    const { unmount } = renderPanel({ nodes: [], edges: [], canEdit: false });
    expect(screen.getByTestId('settings-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-section-sender')).not.toBeInTheDocument();
    expect(mockLoadSenders).not.toHaveBeenCalled();
    unmount();
    renderPanel({ campaignType: 'mixed', nodes: [], edges: [] });
    expect(screen.getByTestId('settings-empty')).toBeInTheDocument();
  });

  it('email: lượt tải danh sách tài khoản KHÁC khoá GET của trang (limit 100) để api.js không huỷ lượt của trang', async () => {
    open('email');
    await screen.findByTestId('simple-sender-3');
    expect(mockLoadSenders).toHaveBeenCalledWith('email', { email: { params: { status: 'active', page: 1, limit: 99 } } });
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

