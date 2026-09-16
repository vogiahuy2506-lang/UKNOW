import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import QuickSend from '../QuickSend';
import emailTemplateApiService from '../../../features/templates/services/emailTemplateApi.service';
import zaloTemplateApiService from '../../../features/templates/services/zaloTemplateApi.service';
import emailSettingsApiService from '../../../features/settings/services/emailSettingsApi.service';
import zaloSettingsApiService from '../../../features/settings/services/zaloSettingsApi.service';
import campaignApiService from '../../../features/campaigns/services/campaignApi.service';
import api from '../../../services/api';
import toast from 'react-hot-toast';

const mockNavigate = vi.fn();
let mockLocationState = null;

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/app/quick-send', state: mockLocationState }),
  useNavigate: () => mockNavigate,
}));

const mockT = (key, params) => {
  if (params?.count !== undefined) return `${key} count=${params.count}`;
  if (params?.value !== undefined) return `${key} value=${params.value}`;
  return key;
};
const mockI18n = { t: mockT, locale: 'vi' };

vi.mock('../../../i18n', () => ({
  useI18n: () => mockI18n,
}));

vi.mock('../../../features/templates/services/emailTemplateApi.service', () => ({
  default: {
    getTemplates: vi.fn(),
    getTemplateById: vi.fn(),
  },
}));

vi.mock('../../../features/templates/services/zaloTemplateApi.service', () => ({
  default: {
    getTemplates: vi.fn(),
    getTemplateById: vi.fn(),
  },
}));

vi.mock('../../../features/settings/services/emailSettingsApi.service', () => ({
  default: {
    listEmailSettings: vi.fn(),
    sendEmail: vi.fn(),
  },
}));

vi.mock('../../../features/settings/services/zaloSettingsApi.service', () => ({
  default: {
    listAccounts: vi.fn(),
    sendMessage: vi.fn(),
  },
}));

vi.mock('../../../features/campaigns/services/campaignApi.service', () => ({
  default: {
    getQuickSendEstimate: vi.fn(),
    testSendQuickCampaign: vi.fn(),
    uploadQuickSendAttachment: vi.fn(),
  },
}));

vi.mock('../../../services/api');

vi.mock('../../../features/storage/useStorageQuota', () => ({
  default: () => ({ usage: null }),
}));

vi.mock('../../../features/storage/storageEvents', () => ({
  notifyStorageQuotaRefresh: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('QuickSend Attachments Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocationState = null;

    emailTemplateApiService.getTemplates.mockResolvedValue({
      data: { data: { items: [] } },
    });
    emailTemplateApiService.getTemplateById.mockResolvedValue({
      data: { data: null },
    });
    zaloTemplateApiService.getTemplates.mockResolvedValue({
      data: { data: { items: [] } },
    });
    zaloTemplateApiService.getTemplateById.mockResolvedValue({
      data: { data: null },
    });

    emailSettingsApiService.listEmailSettings.mockResolvedValue({
      data: {
        data: {
          items: [{ id: 1, name: 'Sender Email', email: 'sender@uknow.vn', isDefault: true }],
        },
      },
    });
    emailSettingsApiService.sendEmail.mockResolvedValue({ data: { success: true } });

    zaloSettingsApiService.listAccounts.mockResolvedValue({
      data: {
        data: {
          items: [{ id: 'z1', name: 'Zalo Account', isDefault: true, isLocked: false }],
        },
      },
    });
    zaloSettingsApiService.sendMessage.mockResolvedValue({ data: { success: true } });

    campaignApiService.getQuickSendEstimate.mockResolvedValue({
      data: {
        data: {
          unit: 'immediate',
          value: 0,
        },
      },
    });
  });

  it('khi chọn mẫu tin Email có đính kèm: gọi getTemplateById và hiển thị danh sách đính kèm', async () => {
    const sampleAttachment = {
      key: 'uploads/email/tai-lieu.pdf',
      originalName: 'tai-lieu.pdf',
      contentType: 'application/pdf',
      size: 2048576,
    };

    emailTemplateApiService.getTemplates.mockResolvedValue({
      data: {
        data: {
          items: [{ id: 10, templateName: 'Mẫu Email Báo Giá', subject: 'Báo giá tháng 8' }],
        },
      },
    });

    emailTemplateApiService.getTemplateById.mockResolvedValue({
      data: {
        data: {
          id: 10,
          templateName: 'Mẫu Email Báo Giá',
          subject: 'Báo giá tháng 8 đầy đủ',
          bodyHtml: '<p>Kính gửi quý khách báo giá</p>',
          attachments: [sampleAttachment],
        },
      },
    });

    render(<QuickSend />);

    // Nhập email người nhận vào textarea
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'client@example.com' } });

    // Bấm Tiếp tục sang bước Mẫu tin
    const nextBtn = screen.getByRole('button', { name: /quickSend\.next/i });
    fireEvent.click(nextBtn);

    // Chờ danh sách mẫu hiện và bấm chọn mẫu
    const templateBtn = await screen.findByText('Mẫu Email Báo Giá');
    fireEvent.click(templateBtn);

    // Xác nhận getTemplateById được gọi với ID 10
    await waitFor(() => {
      expect(emailTemplateApiService.getTemplateById).toHaveBeenCalledWith(10);
    });

    // Xác nhận file đính kèm được hiển thị trong UI
    await waitFor(() => {
      expect(screen.getAllByText(/tai-lieu\.pdf/i).length).toBeGreaterThan(0);
    });
  });

  it('khi chọn mẫu tin Zalo có đính kèm: gọi getTemplateById và hiển thị danh sách đính kèm', async () => {
    const sampleAttachment = {
      key: 'uploads/zalo/IMG_5292.jpeg',
      originalName: 'IMG_5292.jpeg',
      contentType: 'image/jpeg',
      size: 512000,
    };

    zaloTemplateApiService.getTemplates.mockResolvedValue({
      data: {
        data: {
          items: [{ id: 20, templateName: 'Mẫu Zalo Khuyến Mãi' }],
        },
      },
    });

    zaloTemplateApiService.getTemplateById.mockResolvedValue({
      data: {
        data: {
          id: 20,
          templateName: 'Mẫu Zalo Khuyến Mãi',
          bodyText: 'Nội dung khuyến mãi Zalo',
          attachments: [sampleAttachment],
        },
      },
    });

    render(<QuickSend />);

    // Chuyển sang kênh Zalo
    const zaloChannelBtn = screen.getByText('Zalo');
    fireEvent.click(zaloChannelBtn);

    // Nhập số điện thoại
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '0987654321' } });

    // Bấm Tiếp tục sang bước Mẫu tin
    const nextBtn = screen.getByRole('button', { name: /quickSend\.next/i });
    fireEvent.click(nextBtn);

    // Chọn mẫu Zalo
    const templateBtn = await screen.findByText('Mẫu Zalo Khuyến Mãi');
    fireEvent.click(templateBtn);

    // Xác nhận getTemplateById được gọi với ID 20 và hiển thị file
    await waitFor(() => {
      expect(zaloTemplateApiService.getTemplateById).toHaveBeenCalledWith(20);
      expect(screen.getAllByText(/IMG_5292\.jpeg/i).length).toBeGreaterThan(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Hai test dưới đây mới là thứ khoá đúng con bug sếp báo ngày 22/08/2026:
  // "Gửi nhanh" báo gửi thành công nhưng người nhận chỉ thấy chữ, không có ảnh.
  //
  // Hai test phía trên KHÔNG bắt được lỗi đó — đã kiểm bằng cách bỏ lại
  // `attachments` khỏi payload trong `handleSend`, cả hai vẫn xanh. Chúng chỉ
  // chứng minh mẫu tin được nạp và hiện lên màn hình, không chứng minh nó
  // được GỬI ĐI. Đừng xoá phần assert payload bên dưới.
  // ───────────────────────────────────────────────────────────────────────────

  /** Đi hết luồng tới bước "Xem lại" rồi bấm Gửi ngay. */
  async function walkToPreviewAndSend({ channel, recipient, templateName }) {
    render(<QuickSend />);

    if (channel === 'zalo') {
      fireEvent.click(screen.getByText('Zalo'));
    }

    fireEvent.change(screen.getByRole('textbox'), { target: { value: recipient } });
    fireEvent.click(screen.getByRole('button', { name: /quickSend\.next/i }));

    fireEvent.click(await screen.findByText(templateName));

    // Chờ nạp xong chi tiết mẫu — bấm Gửi sớm hơn sẽ bị chặn có chủ đích.
    await waitFor(() => {
      expect(screen.getAllByText(/quickSend\.attachments/i).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: /quickSend\.next/i }));
    fireEvent.click(await screen.findByRole('button', { name: /quickSend\.sendNow/i }));
  }

  it('handleSend gửi kèm attachments trong payload Email', async () => {
    const sampleAttachment = {
      key: 'uploads/email/tai-lieu.pdf',
      originalName: 'tai-lieu.pdf',
      contentType: 'application/pdf',
      size: 2048576,
    };

    emailTemplateApiService.getTemplates.mockResolvedValue({
      data: { data: { items: [{ id: 10, templateName: 'Mẫu Email Báo Giá' }] } },
    });
    emailTemplateApiService.getTemplateById.mockResolvedValue({
      data: {
        data: {
          id: 10,
          templateName: 'Mẫu Email Báo Giá',
          subject: 'Báo giá tháng 8',
          bodyHtml: '<p>Nội dung</p>',
          attachments: [sampleAttachment],
        },
      },
    });

    await walkToPreviewAndSend({
      channel: 'email',
      recipient: 'client@example.com',
      templateName: 'Mẫu Email Báo Giá',
    });

    await waitFor(() => {
      expect(emailSettingsApiService.sendEmail).toHaveBeenCalledTimes(1);
    });
    expect(emailSettingsApiService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'client@example.com',
        attachments: [sampleAttachment],
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    );
  });

  it('handleSend gửi kèm attachments trong payload Zalo', async () => {
    const sampleAttachment = {
      key: 'uploads/zalo/IMG_5292.jpeg',
      originalName: 'IMG_5292.jpeg',
      contentType: 'image/jpeg',
      size: 512000,
    };

    zaloTemplateApiService.getTemplates.mockResolvedValue({
      data: { data: { items: [{ id: 20, templateName: 'Mẫu Zalo Khuyến Mãi' }] } },
    });
    zaloTemplateApiService.getTemplateById.mockResolvedValue({
      data: {
        data: {
          id: 20,
          templateName: 'Mẫu Zalo Khuyến Mãi',
          bodyText: 'Nội dung khuyến mãi Zalo',
          attachments: [sampleAttachment],
        },
      },
    });

    await walkToPreviewAndSend({
      channel: 'zalo',
      recipient: '0987654321',
      templateName: 'Mẫu Zalo Khuyến Mãi',
    });

    await waitFor(() => {
      expect(zaloSettingsApiService.sendMessage).toHaveBeenCalledTimes(1);
    });
    expect(zaloSettingsApiService.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '0987654321',
        attachments: [sampleAttachment],
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    );
  });

  it('mẫu không có đính kèm vẫn gửi bình thường với attachments rỗng', async () => {
    emailTemplateApiService.getTemplates.mockResolvedValue({
      data: { data: { items: [{ id: 11, templateName: 'Mẫu Không Đính Kèm' }] } },
    });
    emailTemplateApiService.getTemplateById.mockResolvedValue({
      data: {
        data: {
          id: 11,
          templateName: 'Mẫu Không Đính Kèm',
          subject: 'Chào bạn',
          bodyHtml: '<p>Nội dung</p>',
        },
      },
    });

    render(<QuickSend />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'client@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /quickSend\.next/i }));
    fireEvent.click(await screen.findByText('Mẫu Không Đính Kèm'));
    await waitFor(() => {
      expect(emailTemplateApiService.getTemplateById).toHaveBeenCalledWith(11);
    });

    fireEvent.click(screen.getByRole('button', { name: /quickSend\.next/i }));
    fireEvent.click(await screen.findByRole('button', { name: /quickSend\.sendNow/i }));

    await waitFor(() => {
      expect(emailSettingsApiService.sendEmail).toHaveBeenCalledTimes(1);
    });
    expect(emailSettingsApiService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: [] }),
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    );
  });

  it('nạp chi tiết mẫu lỗi thì CHẶN gửi, không lặng lẽ gửi thiếu file', async () => {
    emailTemplateApiService.getTemplates.mockResolvedValue({
      data: { data: { items: [{ id: 12, templateName: 'Mẫu Lỗi Chi Tiết' }] } },
    });
    emailTemplateApiService.getTemplateById.mockRejectedValue(new Error('network down'));

    render(<QuickSend />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'client@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /quickSend\.next/i }));
    fireEvent.click(await screen.findByText('Mẫu Lỗi Chi Tiết'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('quickSend.templateLoadDetailFailed');
    });

    fireEvent.click(screen.getByRole('button', { name: /quickSend\.next/i }));
    fireEvent.click(await screen.findByRole('button', { name: /quickSend\.sendNow/i }));

    // Không được gọi API gửi.
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('quickSend.templateLoadDetailFailed');
    });
    expect(emailSettingsApiService.sendEmail).not.toHaveBeenCalled();
  });

  it('nạp quickSendDraft từ AI Assistant: tự động chuyển bước PREVIEW, hiển thị tiêu đề, nội dung, attachments và làm sạch location.state', async () => {
    const sampleAttachment = {
      key: 'uploads/email/hop-dong.docx',
      originalName: 'hop-dong.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 15360,
    };

    mockLocationState = {
      quickSendDraft: {
        channel: 'email',
        recipients: ['partner@digiso.vn'],
        subject: 'Hợp đồng dịch vụ 2026',
        body: 'Gửi bạn xem hợp đồng đính kèm nhé.',
        accountId: 1,
        attachments: [sampleAttachment],
        startStep: 'preview',
      },
    };

    render(<QuickSend />);

    // Kiểm tra đã gọi navigate để dọn sạch state
    expect(mockNavigate).toHaveBeenCalledWith('/app/quick-send', { replace: true, state: null });

    // Kiểm tra hiển thị thông tin ở bước Preview
    expect(await screen.findByText('Hợp đồng dịch vụ 2026')).toBeInTheDocument();
    expect(await screen.findByText('hop-dong.docx')).toBeInTheDocument();
    expect(await screen.findByText('partner@digiso.vn')).toBeInTheDocument();

    // Bấm Gửi ngay
    fireEvent.click(await screen.findByRole('button', { name: /quickSend\.sendNow/i }));

    await waitFor(() => {
      expect(emailSettingsApiService.sendEmail).toHaveBeenCalledTimes(1);
    });

    expect(emailSettingsApiService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        fromEmailId: 1,
        to: 'partner@digiso.vn',
        subject: 'Hợp đồng dịch vụ 2026',
        attachments: [sampleAttachment],
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PLAN_GUI_NHANH_DINH_KEM_TU_TAI_LEN_2026-09-16 — Việc 3: tự tải tệp đính kèm khi soạn
  // nội dung mới (không đi qua mẫu). Luồng: chọn tệp -> POST /uploads/temp -> POST
  // /campaigns/quick-send/attachments -> đẩy vào extraAttachments -> gửi kèm activeAttachments.
  // ───────────────────────────────────────────────────────────────────────────

  /** Đi tới bước Nội dung, chuyển "Soạn nội dung mới", nhập nội dung, rồi chọn 1 tệp. */
  async function walkToCustomContentAndSelectFile({
    channel = 'email',
    recipient = 'client@example.com',
    body = 'Nội dung tự soạn',
    file = new File(['noi dung'], 'bao-cao.pdf', { type: 'application/pdf' }),
  } = {}) {
    render(<QuickSend />);

    if (channel === 'zalo') {
      fireEvent.click(screen.getByText('Zalo'));
    }

    fireEvent.change(screen.getByRole('textbox'), { target: { value: recipient } });
    fireEvent.click(screen.getByRole('button', { name: /quickSend\.next/i }));

    fireEvent.click(await screen.findByText('quickSend.contentModeCustom'));

    const bodyTextarea = screen.getByPlaceholderText('quickSend.customBodyPlaceholder');
    fireEvent.change(bodyTextarea, { target: { value: body } });

    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [file] } });
  }

  it('tải 1 tệp: hiện chip + gửi kèm attachments đúng key (soạn nội dung mới)', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: { tempId: 'tmp_1', originalName: 'bao-cao.pdf', contentType: 'application/pdf', size: 1024 },
      },
    });
    campaignApiService.uploadQuickSendAttachment.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          key: 'uploads/5/quick-send/1700000000_ab12cd34_bao-cao.pdf',
          originalName: 'bao-cao.pdf',
          size: 1024,
          contentType: 'application/pdf',
        },
      },
    });

    await walkToCustomContentAndSelectFile();

    await waitFor(() => {
      expect(screen.getByText('bao-cao.pdf')).toBeInTheDocument();
    });
    expect(api.post).toHaveBeenCalledWith('/uploads/temp', expect.anything(), expect.anything());
    expect(campaignApiService.uploadQuickSendAttachment).toHaveBeenCalledWith({
      tempId: 'tmp_1',
      originalName: 'bao-cao.pdf',
      contentType: 'application/pdf',
      size: 1024,
    });

    fireEvent.click(screen.getByRole('button', { name: /quickSend\.next/i }));
    fireEvent.click(await screen.findByRole('button', { name: /quickSend\.sendNow/i }));

    await waitFor(() => {
      expect(emailSettingsApiService.sendEmail).toHaveBeenCalledTimes(1);
    });
    expect(emailSettingsApiService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({ key: 'uploads/5/quick-send/1700000000_ab12cd34_bao-cao.pdf' }),
        ],
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    );
  });

  it('tệp thứ 6 -> chặn ngay ở frontend, không gọi API tải lên', async () => {
    render(<QuickSend />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'client@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /quickSend\.next/i }));
    fireEvent.click(await screen.findByText('quickSend.contentModeCustom'));

    const sixFiles = Array.from({ length: 6 }, (_, i) =>
      new File(['x'], `f${i}.pdf`, { type: 'application/pdf' })
    );
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: sixFiles } });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('quickSend.attachmentTooMany');
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('server trả 409 hết dung lượng -> toast hiện đúng câu server trả, không dùng câu chung', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: { tempId: 'tmp_2', originalName: 'anh.png', contentType: 'image/png', size: 2048 },
      },
    });
    campaignApiService.uploadQuickSendAttachment.mockRejectedValueOnce({
      response: { status: 409, data: { message: 'Workspace đã dùng hết dung lượng lưu trữ' } },
    });

    await walkToCustomContentAndSelectFile({
      file: new File(['anh'], 'anh.png', { type: 'image/png' }),
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Workspace đã dùng hết dung lượng lưu trữ');
    });
    // Không phải câu chung attachmentUploadError — đúng lỗi 15/09 phải tránh lặp lại.
    expect(toast.error).not.toHaveBeenCalledWith('quickSend.attachmentUploadError');
  });

  it('xoá chip đính kèm -> payload gửi không còn tệp đó', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: { tempId: 'tmp_3', originalName: 'x.pdf', contentType: 'application/pdf', size: 500 },
      },
    });
    campaignApiService.uploadQuickSendAttachment.mockResolvedValueOnce({
      data: {
        success: true,
        data: { key: 'uploads/5/quick-send/999_x.pdf', originalName: 'x.pdf', size: 500, contentType: 'application/pdf' },
      },
    });

    await walkToCustomContentAndSelectFile({
      file: new File(['x'], 'x.pdf', { type: 'application/pdf' }),
    });
    await waitFor(() => expect(screen.getByText('x.pdf')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('quickSend.attachmentRemove'));
    expect(screen.queryByText('x.pdf')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /quickSend\.next/i }));
    fireEvent.click(await screen.findByRole('button', { name: /quickSend\.sendNow/i }));

    await waitFor(() => {
      expect(emailSettingsApiService.sendEmail).toHaveBeenCalledTimes(1);
    });
    expect(emailSettingsApiService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: [] }),
      expect.anything()
    );
  });
});
