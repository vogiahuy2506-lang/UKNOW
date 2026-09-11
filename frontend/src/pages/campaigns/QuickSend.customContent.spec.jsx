import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import QuickSend from './QuickSend';

// PLAN "Gửi nhanh — soạn nội dung mới không cần mẫu" (2026-09-11): bước 2 ("Nội dung") thêm
// lựa chọn "Soạn nội dung mới" bên cạnh "Chọn mẫu có sẵn" — người dùng gửi Email/Zalo/Zalo nhóm
// mà không cần tạo/chọn mẫu trước. contentMode ('template'|'custom') tách customContent khỏi
// templateContent để chuyển qua lại không mất bản nháp; activeContent/activeTemplate/
// activeAttachments là nguồn duy nhất mọi nơi validate/preview/gửi phải đọc qua.

const m = vi.hoisted(() => ({
  navigate: vi.fn(),
  locationState: null,
  getEmailTemplates: vi.fn(),
  getEmailTemplateById: vi.fn(),
  getZaloTemplates: vi.fn(),
  getZaloTemplateById: vi.fn(),
  listEmailSettings: vi.fn(),
  listZaloAccounts: vi.fn(),
  sendEmail: vi.fn(),
  sendZaloMessage: vi.fn(),
  sendZaloGroupMessage: vi.fn(),
  getQuickSendEstimate: vi.fn(),
  testSendQuickCampaign: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => m.navigate,
  useLocation: () => ({ pathname: '/app/quick-send', state: m.locationState }),
}));

// `t` PHẢI ổn định giữa các lần render (bản thật dùng useCallback([locale])) — resolveGroupNames/
// loadZaloContactsAndResolve là useCallback([t]) rồi lại nằm trong dependency của useEffect;
// t đổi tham chiếu mỗi render sẽ làm effect đó chạy lại vô hạn (đã tự bắt được lỗi này khi viết
// test: mock t không ổn định làm kênh Zalo nhóm treo cứng do resolveGroupNames -> setSelectedGroups
// -> re-render -> t mới -> resolveGroupNames mới -> effect chạy lại, lặp mãi).
const stableT = (key, params) => {
  if (params && Object.keys(params).length > 0) {
    return `${key}:${JSON.stringify(params)}`;
  }
  return key;
};
vi.mock('../../i18n', () => ({ useI18n: () => ({ t: stableT }) }));

vi.mock('../../features/templates/services/emailTemplateApi.service', () => ({
  default: { getTemplates: m.getEmailTemplates, getTemplateById: m.getEmailTemplateById },
}));
vi.mock('../../features/templates/services/zaloTemplateApi.service', () => ({
  default: { getTemplates: m.getZaloTemplates, getTemplateById: m.getZaloTemplateById },
}));
vi.mock('../../features/settings/services/emailSettingsApi.service', () => ({
  default: { listEmailSettings: m.listEmailSettings, sendEmail: m.sendEmail },
}));
vi.mock('../../features/settings/services/zaloSettingsApi.service', () => ({
  default: {
    listAccounts: m.listZaloAccounts,
    sendMessage: m.sendZaloMessage,
    sendGroupMessage: m.sendZaloGroupMessage,
  },
}));
vi.mock('../../features/chatbot/services/chatbotApi.service', () => ({
  default: { getZaloFriends: vi.fn().mockResolvedValue({ data: { data: { items: [], totalPages: 1 } } }) },
}));
vi.mock('../../features/campaigns/services/campaignApi.service', () => ({
  default: {
    getQuickSendEstimate: m.getQuickSendEstimate,
    testSendQuickCampaign: m.testSendQuickCampaign,
  },
}));
vi.mock('../../features/campaigns/services/campaignBuilderApi.service', () => ({
  default: { getPreviewZaloGroups: vi.fn().mockResolvedValue({ data: { data: { groups: [] } } }) },
}));
vi.mock('../../features/ai/components/AiChatbotWizardCards.jsx', () => ({
  // Không cần picker thật — test nạp selectedGroups qua bản nháp AI (quickSendDraft), giống
  // đúng đường mà PR yêu cầu bảo toàn ("Draft từ AI tiếp tục gửi được mà không cần template").
  ZaloGroupPickerCard: () => null,
}));

const emailTemplate = {
  id: 501,
  templateName: 'Mẫu khuyến mãi',
  subject: 'Ưu đãi tháng này',
  bodyHtml: '<p>Nội dung mẫu</p>',
  attachments: [{ key: 'a1', name: 'brochure.pdf', size: 2048 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  m.locationState = null;
  m.getEmailTemplates.mockResolvedValue({ data: { data: { items: [emailTemplate] } } });
  m.getEmailTemplateById.mockResolvedValue({ data: { data: emailTemplate } });
  m.getZaloTemplates.mockResolvedValue({ data: { data: { items: [] } } });
  m.listEmailSettings.mockResolvedValue({ data: { data: { items: [{ id: 1, name: 'Sender', email: 'sender@x.com', isDefault: true }] } } });
  m.listZaloAccounts.mockResolvedValue({ data: { data: { items: [{ id: 9, name: 'Zalo chính', isDefault: true }] } } });
  m.sendEmail.mockResolvedValue({ data: { success: true } });
  m.sendZaloMessage.mockResolvedValue({ data: { data: { items: [{ status: 'success' }] } } });
  m.sendZaloGroupMessage.mockResolvedValue({ data: { data: { items: [{ status: 'success' }] } } });
  m.getQuickSendEstimate.mockResolvedValue({ data: { data: { unit: 'immediate' } } });
  m.testSendQuickCampaign.mockResolvedValue({ data: { message: 'ok' } });
});
afterEach(cleanup);

const clickNext = async () => {
  const btn = await screen.findByRole('button', { name: 'quickSend.next' });
  fireEvent.click(btn);
};

describe('QuickSend — soạn nội dung mới không cần mẫu', () => {
  it('Email tự soạn đi hết ba bước, gửi đúng subject/content/htmlContent', async () => {
    m.locationState = { quickSendDraft: { channel: 'email', recipients: ['a@example.com'] } };
    render(<QuickSend />);

    await waitFor(() => expect(m.listEmailSettings).toHaveBeenCalled());
    await clickNext(); // Recipients -> Content

    fireEvent.click(await screen.findByText('quickSend.contentModeCustom'));
    const subjectInput = screen.getByPlaceholderText('quickSend.customSubjectPlaceholder');
    const bodyTextarea = screen.getByPlaceholderText('quickSend.customBodyPlaceholder');
    fireEvent.change(subjectInput, { target: { value: 'Tiêu đề tự soạn' } });
    fireEvent.change(bodyTextarea, { target: { value: 'Nội dung tự soạn dòng 1' } });

    await clickNext(); // Content -> Preview
    await screen.findByText('Tiêu đề tự soạn');
    expect(screen.getByText('Nội dung tự soạn dòng 1')).toBeInTheDocument();

    const sendBtn = await screen.findByRole('button', { name: 'quickSend.sendNow' });
    await act(async () => { fireEvent.click(sendBtn); });

    await waitFor(() => expect(m.sendEmail).toHaveBeenCalled());
    const [payload] = m.sendEmail.mock.calls[0];
    expect(payload.subject).toBe('Tiêu đề tự soạn');
    expect(payload.content).toContain('Nội dung tự soạn dòng 1');
    expect(payload.htmlContent).toContain('Nội dung tự soạn dòng 1');
  });

  it('Zalo cá nhân tự soạn gửi đúng message', async () => {
    m.locationState = { quickSendDraft: { channel: 'zalo', recipients: ['0901234567'] } };
    render(<QuickSend />);

    await waitFor(() => expect(m.listZaloAccounts).toHaveBeenCalled());
    await clickNext();

    fireEvent.click(await screen.findByText('quickSend.contentModeCustom'));
    fireEvent.change(screen.getByPlaceholderText('quickSend.customBodyPlaceholder'), {
      target: { value: 'Chào bạn, đây là tin nhắn Zalo tự soạn' },
    });
    await clickNext();

    const sendBtn = await screen.findByRole('button', { name: 'quickSend.sendNow' });
    await act(async () => { fireEvent.click(sendBtn); });

    await waitFor(() => expect(m.sendZaloMessage).toHaveBeenCalled());
    const [payload] = m.sendZaloMessage.mock.calls[0];
    expect(payload.message).toBe('Chào bạn, đây là tin nhắn Zalo tự soạn');
  });

  it('Zalo nhóm tự soạn gửi đúng message', async () => {
    m.locationState = { quickSendDraft: { channel: 'zalo_group', recipients: ['group123'] } };
    render(<QuickSend />);

    await waitFor(() => expect(m.listZaloAccounts).toHaveBeenCalled());
    await clickNext();

    fireEvent.click(await screen.findByText('quickSend.contentModeCustom'));
    fireEvent.change(screen.getByPlaceholderText('quickSend.customBodyPlaceholder'), {
      target: { value: 'Thông báo tới cả nhóm' },
    });
    await clickNext();

    const sendBtn = await screen.findByRole('button', { name: 'quickSend.sendNow' });
    await act(async () => { fireEvent.click(sendBtn); });

    await waitFor(() => expect(m.sendZaloGroupMessage).toHaveBeenCalled());
    const [payload] = m.sendZaloGroupMessage.mock.calls[0];
    expect(payload.message).toBe('Thông báo tới cả nhóm');
    expect(payload.groupId).toBe('group123');
  });

  it('nội dung rỗng/khoảng trắng không cho đi tiếp', async () => {
    m.locationState = { quickSendDraft: { channel: 'email', recipients: ['a@example.com'] } };
    render(<QuickSend />);
    await waitFor(() => expect(m.listEmailSettings).toHaveBeenCalled());
    await clickNext();

    fireEvent.click(await screen.findByText('quickSend.contentModeCustom'));
    const nextBtn = screen.getByRole('button', { name: 'quickSend.next' });
    expect(nextBtn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('quickSend.customBodyPlaceholder'), {
      target: { value: '   ' },
    });
    expect(nextBtn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('quickSend.customBodyPlaceholder'), {
      target: { value: 'Có chữ rồi' },
    });
    expect(nextBtn).not.toBeDisabled();
  });

  it('chuyển giữa chọn mẫu và soạn mới không trộn nội dung', async () => {
    m.locationState = { quickSendDraft: { channel: 'email', recipients: ['a@example.com'] } };
    render(<QuickSend />);
    await waitFor(() => expect(m.listEmailSettings).toHaveBeenCalled());
    await clickNext();

    fireEvent.click(await screen.findByText('quickSend.contentModeCustom'));
    fireEvent.change(screen.getByPlaceholderText('quickSend.customBodyPlaceholder'), {
      target: { value: 'Bản nháp của tôi' },
    });

    fireEvent.click(screen.getByText('quickSend.contentModeTemplate'));
    fireEvent.click(await screen.findByText('Mẫu khuyến mãi'));
    await waitFor(() => expect(m.getEmailTemplateById).toHaveBeenCalled());

    fireEvent.click(screen.getByText('quickSend.contentModeCustom'));
    expect(screen.getByPlaceholderText('quickSend.customBodyPlaceholder').value).toBe('Bản nháp của tôi');
  });

  it('đổi kênh Email -> Zalo xoá nội dung tự soạn không tương thích', async () => {
    m.locationState = { quickSendDraft: { channel: 'email', recipients: ['a@example.com'] } };
    render(<QuickSend />);
    await waitFor(() => expect(m.listEmailSettings).toHaveBeenCalled());

    await clickNext();
    fireEvent.click(await screen.findByText('quickSend.contentModeCustom'));
    fireEvent.change(screen.getByPlaceholderText('quickSend.customBodyPlaceholder'), {
      target: { value: 'Nội dung email cũ' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'quickSend.back' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Zalo'));
    });
    await waitFor(() => expect(m.listZaloAccounts).toHaveBeenCalled());
    // manualEmails không đổi thành số điện thoại hợp lệ khi đổi kênh — phải tự nhập số Zalo
    // mới để nút "Tiếp tục" sáng lên (đây là hành vi có sẵn, không phải phần PR này đổi).
    fireEvent.change(screen.getByPlaceholderText(/0901234567/), { target: { value: '0909999999' } });
    fireEvent.click(screen.getByRole('button', { name: /quickSend.next/ }));

    // Sau khi đổi kênh, contentMode bị đưa về 'template' (mặc định) — không còn thấy nội
    // dung cũ dù có bấm lại "Soạn nội dung mới".
    fireEvent.click(await screen.findByText('quickSend.contentModeCustom'));
    expect(screen.getByPlaceholderText('quickSend.customBodyPlaceholder').value).toBe('');
  });

  it('luồng chọn mẫu và đính kèm hiện có vẫn hoạt động (hồi quy)', async () => {
    m.locationState = { quickSendDraft: { channel: 'email', recipients: ['a@example.com'] } };
    render(<QuickSend />);
    await waitFor(() => expect(m.listEmailSettings).toHaveBeenCalled());
    await clickNext();

    // contentMode mặc định 'template' — danh sách mẫu hiện ngay, không cần bấm chuyển.
    fireEvent.click(await screen.findByText('Mẫu khuyến mãi'));
    await waitFor(() => expect(m.getEmailTemplateById).toHaveBeenCalled());
    await screen.findByText('brochure.pdf');

    await clickNext();
    await screen.findByText('brochure.pdf');

    const sendBtn = await screen.findByRole('button', { name: 'quickSend.sendNow' });
    await act(async () => { fireEvent.click(sendBtn); });

    await waitFor(() => expect(m.sendEmail).toHaveBeenCalled());
    const [payload] = m.sendEmail.mock.calls[0];
    expect(payload.subject).toBe('Ưu đãi tháng này');
    expect(payload.attachments).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'a1' })]));
  });

  it('bản nháp AI (subject/body, không kèm template) đi thẳng tới Xem lại và gửi được', async () => {
    m.locationState = {
      quickSendDraft: {
        channel: 'email',
        recipients: ['ai-draft@example.com'],
        subject: 'AI soạn tiêu đề',
        body: 'AI soạn nội dung',
        startStep: 'preview',
      },
    };
    render(<QuickSend />);

    await screen.findByText('AI soạn tiêu đề');
    expect(screen.getByText('AI soạn nội dung')).toBeInTheDocument();

    const sendBtn = await screen.findByRole('button', { name: 'quickSend.sendNow' });
    await act(async () => { fireEvent.click(sendBtn); });

    await waitFor(() => expect(m.sendEmail).toHaveBeenCalled());
    const [payload] = m.sendEmail.mock.calls[0];
    expect(payload.subject).toBe('AI soạn tiêu đề');
    expect(payload.content).toContain('AI soạn nội dung');
  });

  it('response tải template Email cũ không được ghi đè sau khi đã đổi sang kênh Zalo (đóng race)', async () => {
    m.locationState = { quickSendDraft: { channel: 'email', recipients: ['a@example.com'] } };
    render(<QuickSend />);
    await waitFor(() => expect(m.listEmailSettings).toHaveBeenCalled());
    await clickNext();

    let resolveTemplateDetail;
    m.getEmailTemplateById.mockReturnValue(new Promise((resolve) => { resolveTemplateDetail = resolve; }));
    fireEvent.click(await screen.findByText('Mẫu khuyến mãi'));
    await waitFor(() => expect(m.getEmailTemplateById).toHaveBeenCalled());

    // Đổi kênh TRƯỚC KHI response Email về.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'quickSend.back' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Zalo'));
    });
    await waitFor(() => expect(m.listZaloAccounts).toHaveBeenCalled());

    // Giờ mới cho response Email cũ (đang treo) về — templateSelectionSeqRef phải đã bị
    // handleChannelChange() tăng lên, nên guard trong handleSelectTemplate phải bỏ qua nó.
    await act(async () => {
      resolveTemplateDetail({ data: { data: emailTemplate } });
    });

    fireEvent.change(screen.getByPlaceholderText(/0901234567/), { target: { value: '0909999999' } });
    fireEvent.click(screen.getByRole('button', { name: /quickSend.next/ }));

    // Không được thấy mẫu Email quay lại ở bước Nội dung của kênh Zalo.
    expect(screen.queryByText('Mẫu khuyến mãi')).not.toBeInTheDocument();
    expect(screen.queryByText('quickSend.selectedTemplate')).not.toBeInTheDocument();
  });

  it('id trùng giữa mẫu Email và mẫu Zalo (hai bảng độc lập) không làm response cũ thắng response mới', async () => {
    // email_templates và zalo_templates là hai bảng id tự tăng ĐỘC LẬP — Email id=501 và Zalo
    // id=501 hoàn toàn có thể cùng tồn tại. Guard staleness so bằng chính template.id (thay vì
    // số thứ tự) sẽ không phân biệt được hai request này, nên phải kiểm đúng kịch bản: Zalo về
    // TRƯỚC, Email (id trùng) về SAU — nếu vẫn dùng id, guard cũ ("id ref === id request") vẫn
    // khớp cho response Email trễ, ghi đè nhầm nội dung Zalo vừa hiện đúng.
    const zaloTemplateSameId = {
      id: emailTemplate.id, // CỐ Ý trùng id với emailTemplate (501).
      templateName: 'Mẫu Zalo trùng ID',
      bodyText: 'Nội dung Zalo thật',
    };
    m.getZaloTemplates.mockResolvedValue({ data: { data: { items: [zaloTemplateSameId] } } });

    m.locationState = { quickSendDraft: { channel: 'email', recipients: ['a@example.com'] } };
    render(<QuickSend />);
    await waitFor(() => expect(m.listEmailSettings).toHaveBeenCalled());
    await clickNext();

    let resolveEmail;
    m.getEmailTemplateById.mockReturnValue(new Promise((resolve) => { resolveEmail = resolve; }));
    fireEvent.click(await screen.findByText('Mẫu khuyến mãi'));
    await waitFor(() => expect(m.getEmailTemplateById).toHaveBeenCalled());
    // Request Email id=501 đang treo, CHƯA resolve.

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'quickSend.back' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Zalo'));
    });
    await waitFor(() => expect(m.listZaloAccounts).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText(/0901234567/), { target: { value: '0909999999' } });
    fireEvent.click(screen.getByRole('button', { name: /quickSend.next/ }));

    let resolveZalo;
    m.getZaloTemplateById.mockReturnValue(new Promise((resolve) => { resolveZalo = resolve; }));
    fireEvent.click(await screen.findByText('Mẫu Zalo trùng ID'));
    await waitFor(() => expect(m.getZaloTemplateById).toHaveBeenCalled());

    // Zalo (id=501) về TRƯỚC.
    await act(async () => { resolveZalo({ data: { data: zaloTemplateSameId } }); });
    await waitFor(() => expect(screen.getAllByText('Mẫu Zalo trùng ID').length).toBeGreaterThan(0));

    // Email cũ (CŨNG id=501) về SAU — điểm mấu chốt của bug đã sửa.
    await act(async () => { resolveEmail({ data: { data: emailTemplate } }); });

    // Nội dung/mẫu đang hiển thị vẫn phải là Zalo — Email không được lọt vào bất kỳ đâu.
    expect(screen.getAllByText('Mẫu Zalo trùng ID').length).toBeGreaterThan(0);
    expect(screen.queryByText('Mẫu khuyến mãi')).not.toBeInTheDocument();

    await clickNext();
    const sendBtn = await screen.findByRole('button', { name: 'quickSend.sendNow' });
    await act(async () => { fireEvent.click(sendBtn); });

    await waitFor(() => expect(m.sendZaloMessage).toHaveBeenCalled());
    const [payload] = m.sendZaloMessage.mock.calls[0];
    expect(payload.message).toBe('Nội dung Zalo thật');
  });

  it('chọn mẫu lỗi tải rồi chuyển "Soạn nội dung mới" — cả Gửi thử và Gửi ngay vẫn hoạt động', async () => {
    m.locationState = { quickSendDraft: { channel: 'email', recipients: ['a@example.com'] } };
    render(<QuickSend />);
    await waitFor(() => expect(m.listEmailSettings).toHaveBeenCalled());
    await clickNext();

    m.getEmailTemplateById.mockRejectedValueOnce(new Error('network down'));
    fireEvent.click(await screen.findByText('Mẫu khuyến mãi'));
    await waitFor(() => expect(m.getEmailTemplateById).toHaveBeenCalled());
    // templateDetailError=true tại đây (mẫu lỗi tải) — chuyển sang soạn mới, guard cũ (không
    // theo contentMode) đáng lẽ vẫn chặn cả hai nút gửi phía dưới.
    fireEvent.click(screen.getByText('quickSend.contentModeCustom'));
    fireEvent.change(screen.getByPlaceholderText('quickSend.customBodyPlaceholder'), {
      target: { value: 'Nội dung không phụ thuộc mẫu đã lỗi' },
    });
    await clickNext();

    fireEvent.change(screen.getByPlaceholderText('quickSend.testRecipientEmailPlaceholder'), {
      target: { value: 'test@example.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'quickSend.testSendButton' }));
    });
    await waitFor(() => expect(m.testSendQuickCampaign).toHaveBeenCalled());

    const sendBtn = await screen.findByRole('button', { name: 'quickSend.sendNow' });
    await act(async () => { fireEvent.click(sendBtn); });
    await waitFor(() => expect(m.sendEmail).toHaveBeenCalled());
  });

  it('đính kèm của bản nháp AI không lọt sang kênh mới sau khi đổi kênh', async () => {
    m.locationState = {
      quickSendDraft: {
        channel: 'email',
        recipients: ['a@example.com'],
        subject: 'Tiêu đề nháp',
        body: 'Nội dung nháp',
        attachments: [{ key: 'leak1', name: 'confidential.pdf', size: 4096 }],
      },
    };
    render(<QuickSend />);
    await waitFor(() => expect(m.listEmailSettings).toHaveBeenCalled());

    await clickNext(); // Recipients -> Content (contentMode đã là 'custom' nhờ draft)
    expect(screen.getByPlaceholderText('quickSend.customSubjectPlaceholder').value).toBe('Tiêu đề nháp');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'quickSend.back' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Zalo'));
    });
    await waitFor(() => expect(m.listZaloAccounts).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText(/0901234567/), { target: { value: '0909999999' } });
    fireEvent.click(screen.getByRole('button', { name: /quickSend.next/ }));

    fireEvent.click(await screen.findByText('quickSend.contentModeCustom'));
    fireEvent.change(screen.getByPlaceholderText('quickSend.customBodyPlaceholder'), {
      target: { value: 'Nội dung mới sau khi đổi kênh' },
    });
    await clickNext();

    const sendBtn = await screen.findByRole('button', { name: 'quickSend.sendNow' });
    await act(async () => { fireEvent.click(sendBtn); });

    await waitFor(() => expect(m.sendZaloMessage).toHaveBeenCalled());
    const [payload] = m.sendZaloMessage.mock.calls[0];
    expect(payload.attachments).toEqual([]);
  });

  it('nội dung tự soạn chứa thẻ dạng HTML phải được thoát ký tự, không gửi như HTML thô', async () => {
    m.locationState = { quickSendDraft: { channel: 'email', recipients: ['a@example.com'] } };
    render(<QuickSend />);
    await waitFor(() => expect(m.listEmailSettings).toHaveBeenCalled());
    await clickNext();

    fireEvent.click(await screen.findByText('quickSend.contentModeCustom'));
    fireEvent.change(screen.getByPlaceholderText('quickSend.customBodyPlaceholder'), {
      target: { value: '<p onclick="alert(1)">nguy hiểm</p>' },
    });
    await clickNext();

    const sendBtn = await screen.findByRole('button', { name: 'quickSend.sendNow' });
    await act(async () => { fireEvent.click(sendBtn); });

    await waitFor(() => expect(m.sendEmail).toHaveBeenCalled());
    const [payload] = m.sendEmail.mock.calls[0];
    expect(payload.htmlContent).not.toContain('<p onclick=');
    expect(payload.htmlContent).toContain('&lt;p onclick=');
  });
});
