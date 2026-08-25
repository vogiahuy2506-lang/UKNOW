import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import QuickSend from '../QuickSend';
import emailTemplateApiService from '../../../features/templates/services/emailTemplateApi.service';
import zaloTemplateApiService from '../../../features/templates/services/zaloTemplateApi.service';
import emailSettingsApiService from '../../../features/settings/services/emailSettingsApi.service';
import zaloSettingsApiService from '../../../features/settings/services/zaloSettingsApi.service';
import campaignApiService from '../../../features/campaigns/services/campaignApi.service';
import toast from 'react-hot-toast';

const mockNavigate = vi.fn();
let mockLocationState = null;

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/app/quick-send', state: mockLocationState }),
  useNavigate: () => mockNavigate,
}));

vi.mock('../../../i18n', () => ({
  useI18n: () => ({
    t: (key, params) => {
      if (params?.count !== undefined) return `${key} count=${params.count}`;
      if (params?.value !== undefined) return `${key} value=${params.value}`;
      return key;
    },
  }),
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
  },
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
      })
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
      })
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
      expect.objectContaining({ attachments: [] })
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
      })
    );
  });
});
