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
    testSendQuickCampaign: vi.fn().mockResolvedValue({ data: { message: 'ok' } }),
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

    fireEvent.click(screen.getByRole('button', { name: 'quickSend.back' }));
    fireEvent.click(screen.getByText('Zalo'));
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
});
