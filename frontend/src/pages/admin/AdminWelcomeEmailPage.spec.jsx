import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import viDict from '../../i18n/vi.js';
import AdminWelcomeEmailPage from './AdminWelcomeEmailPage';

const {
  mockGetTemplate,
  mockPreviewTemplate,
  mockResetTemplate,
  mockUpdateTemplate,
  mockToastSuccess,
  mockToastError,
  mockGetScheduleSettings,
  mockUpdateScheduleSettings,
} = vi.hoisted(() => ({
  mockGetTemplate: vi.fn(),
  mockPreviewTemplate: vi.fn(),
  mockResetTemplate: vi.fn(),
  mockUpdateTemplate: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockGetScheduleSettings: vi.fn(),
  mockUpdateScheduleSettings: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: mockToastSuccess,
    error: mockToastError,
  },
}));

vi.mock('../../features/admin/services/adminSystemEmailTemplateApi.service', () => ({
  default: {
    getTemplate: mockGetTemplate,
    previewTemplate: mockPreviewTemplate,
    resetTemplate: mockResetTemplate,
    updateTemplate: mockUpdateTemplate,
  },
}));

// PLAN_CAU_HINH_LICH_NHAC_HAN_2026-09-13.md, mục 5 (PR-2).
vi.mock('../../features/admin/services/adminSubscriptionReminderSettingsApi.service', () => ({
  default: {
    getSettings: mockGetScheduleSettings,
    updateSettings: mockUpdateScheduleSettings,
  },
}));

// Nhãn tiếng Việt đọc từ vi.js, đừng gõ tay (yêu cầu của task).
const scheduleT = viDict.adminSubscriptionReminderSchedule;
const welcomeT = viDict.adminWelcomeEmail;
const dayLabel = (n) => scheduleT.dayInputLabel.replace('{index}', String(n));
const previewText = (days) => scheduleT.previewWithDays.replace('{days}', days);

function response(data) {
  return { data: { data } };
}

const welcomeTemplate = {
  subject: 'Chào mừng đến với Founder AI!',
  bodyHtml: '<p>Xin chào {{user_name}}</p>',
  isCustomized: false,
  updatedAt: null,
  variables: ['user_name', 'user_email', 'login_url'],
};

const planExpiringTemplate = {
  subject: 'Còn {{days_left}} ngày là hết hạn gói {{plan_name}}',
  bodyHtml: '<p>{{user_name}} ơi, còn {{days_left}} ngày.</p>',
  isCustomized: false,
  updatedAt: null,
  variables: ['user_name', 'plan_name', 'days_left'],
};

// PR-2b (13/09/2026, PLAN_CANH_BAO_SAP_HET_HAN_GOI mục 4.2, mục 5 ca 14) — trang này giờ sửa
// được cả 3 mẫu thư (welcome/plan_expiring/plan_expired) qua bộ chọn mẫu, không chỉ welcome.
describe('AdminWelcomeEmailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTemplate.mockImplementation((key) => Promise.resolve(
      response(key === 'plan_expiring' ? planExpiringTemplate : welcomeTemplate)
    ));
    mockPreviewTemplate.mockImplementation((_key, template) => Promise.resolve(response({
      subject: `Preview: ${template.subject}`,
      html: `<html><body>${template.bodyHtml}</body></html>`,
    })));
    mockUpdateTemplate.mockImplementation((_key, template) => Promise.resolve(response({
      ...template,
      isCustomized: true,
      updatedAt: '2026-09-11T06:00:00.000Z',
    })));
    mockResetTemplate.mockImplementation(() => Promise.resolve(response(welcomeTemplate)));
    mockGetScheduleSettings.mockResolvedValue(response({ daysBefore: [7, 3], updatedAt: null, updatedBy: null }));
    mockUpdateScheduleSettings.mockImplementation((daysBefore) => Promise.resolve(response({
      daysBefore,
      updatedAt: '2026-09-14T08:00:00.000Z',
      updatedBy: 1,
    })));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('nêu đúng vị trí, cho sửa/preview/lưu và khôi phục mẫu mặc định (mẫu welcome)', async () => {
    render(
      <I18nProvider>
        <AdminWelcomeEmailPage />
      </I18nProvider>
    );

    expect(await screen.findByText('Email chào mừng thành viên')).toBeInTheDocument();
    expect(screen.getByText(/Quản trị hệ thống → AI & thông báo → Email chào mừng/)).toBeInTheDocument();
    expect(mockGetTemplate).toHaveBeenCalledWith('welcome');
    expect(mockPreviewTemplate).toHaveBeenCalledWith('welcome', {
      subject: welcomeTemplate.subject,
      bodyHtml: welcomeTemplate.bodyHtml,
    });

    fireEvent.change(screen.getByLabelText('Tiêu đề email'), {
      target: { value: 'Chào {{user_name}}' },
    });
    const body = screen.getByLabelText('Nội dung HTML');
    fireEvent.change(body, { target: { value: '<p>Nội dung mới</p>' } });
    fireEvent.click(screen.getByRole('button', { name: '{{user_email}}' }));
    expect(body.value).toContain('{{user_email}}');

    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật xem trước' }));
    await waitFor(() => expect(mockPreviewTemplate).toHaveBeenLastCalledWith('welcome', {
      subject: 'Chào {{user_name}}',
      bodyHtml: expect.stringContaining('{{user_email}}'),
    }));
    expect(screen.getByTitle('Bản xem trước email chào mừng')).toHaveAttribute(
      'srcdoc',
      expect.stringContaining('Nội dung mới')
    );

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(mockUpdateTemplate).toHaveBeenCalledWith('welcome', {
      subject: 'Chào {{user_name}}',
      bodyHtml: expect.stringContaining('{{user_email}}'),
    }));
    expect(await screen.findByText('Đang dùng bản tùy chỉnh')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục mặc định' }));
    await waitFor(() => expect(mockResetTemplate).toHaveBeenCalledWith('welcome'));
    expect(screen.getByDisplayValue(welcomeTemplate.subject)).toBeInTheDocument();
    expect(mockToastSuccess).toHaveBeenCalledWith('Đã khôi phục mẫu email mặc định');
  });

  // Ca 14 của mục 5: super admin sửa mẫu plan_expiring, bấm xem trước → thấy chữ mới,
  // {{days_left}} được thay (giả lập qua mockPreviewTemplate — phần thay biến thật đã có ca
  // riêng ở backend adminSystemEmailTemplates.test.js).
  it('ca 14 — chọn mẫu plan_expiring: tải đúng mẫu, đổi tiêu đề trang, preview theo đúng khoá', async () => {
    render(
      <I18nProvider>
        <AdminWelcomeEmailPage />
      </I18nProvider>
    );
    await screen.findByText('Email chào mừng thành viên');

    fireEvent.click(screen.getByRole('button', { name: 'Email nhắc sắp hết hạn gói' }));

    expect(await screen.findByText('Email nhắc sắp hết hạn gói', { selector: 'h1' })).toBeInTheDocument();
    await waitFor(() => expect(mockGetTemplate).toHaveBeenCalledWith('plan_expiring'));
    expect(screen.getByDisplayValue(planExpiringTemplate.subject)).toBeInTheDocument();
    await waitFor(() => expect(mockPreviewTemplate).toHaveBeenLastCalledWith('plan_expiring', {
      subject: planExpiringTemplate.subject,
      bodyHtml: planExpiringTemplate.bodyHtml,
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    // Chưa sửa gì nên nút Lưu vẫn disabled — không gọi updateTemplate.
    expect(mockUpdateTemplate).not.toHaveBeenCalled();
  });

  it('có nội dung chưa lưu mà đổi mẫu khác → hỏi xác nhận; từ chối thì giữ nguyên mẫu và không mất nội dung đang sửa', async () => {
    window.confirm.mockReturnValue(false);
    render(
      <I18nProvider>
        <AdminWelcomeEmailPage />
      </I18nProvider>
    );
    await screen.findByText('Email chào mừng thành viên');

    fireEvent.change(screen.getByLabelText('Tiêu đề email'), {
      target: { value: 'Bản đang sửa, chưa lưu' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Email nhắc sắp hết hạn gói' }));

    expect(window.confirm).toHaveBeenCalledWith('Nội dung đang sửa chưa được lưu. Chuyển mẫu khác sẽ bỏ các thay đổi này?');
    // Bị từ chối → vẫn ở mẫu welcome, nội dung đang sửa còn nguyên, KHÔNG gọi lại getTemplate.
    expect(screen.getByDisplayValue('Bản đang sửa, chưa lưu')).toBeInTheDocument();
    expect(mockGetTemplate).toHaveBeenCalledTimes(1);
  });

  // PLAN_CAU_HINH_LICH_NHAC_HAN_2026-09-13.md, mục 5 (PR-2) — 9 ca nghiệm thu của bảng mục "Nghiệm
  // thu" trong plan. Nhãn tiếng Việt lấy từ vi.js (scheduleT/welcomeT), không gõ tay.
  describe('Lịch nhắc hạn (tab riêng, cùng trang)', () => {
    async function openScheduleTab() {
      render(
        <I18nProvider>
          <AdminWelcomeEmailPage />
        </I18nProvider>
      );
      await screen.findByText('Email chào mừng thành viên');
      fireEvent.click(screen.getByRole('button', { name: scheduleT.tabLabel }));
      await screen.findByLabelText(dayLabel(1));
    }

    it('ca 1 — mở tab Lịch nhắc hạn → hiện đúng [7, 3] đọc từ API', async () => {
      await openScheduleTab();

      expect(mockGetScheduleSettings).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText(dayLabel(1))).toHaveValue(7);
      expect(screen.getByLabelText(dayLabel(2))).toHaveValue(3);
    });

    it('ca 2 — sửa thành [10, 5, 2], Lưu → gọi PUT đúng payload, hiện báo thành công', async () => {
      await openScheduleTab();

      fireEvent.change(screen.getByLabelText(dayLabel(1)), { target: { value: '10' } });
      fireEvent.change(screen.getByLabelText(dayLabel(2)), { target: { value: '5' } });
      fireEvent.click(screen.getByRole('button', { name: scheduleT.addDay }));
      fireEvent.change(screen.getByLabelText(dayLabel(3)), { target: { value: '2' } });

      fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

      await waitFor(() => expect(mockUpdateScheduleSettings).toHaveBeenCalledWith([10, 5, 2]));
      expect(mockToastSuccess).toHaveBeenCalledWith(scheduleT.saveSuccess);
    });

    it('ca 3 (đột biến bắt buộc: bỏ soi trùng mốc ở UI phải làm ca này đỏ) — nhập [7, 7] → báo lỗi tại chỗ, nút Lưu bị chặn, không gọi API', async () => {
      await openScheduleTab();

      fireEvent.change(screen.getByLabelText(dayLabel(2)), { target: { value: '7' } });

      expect(await screen.findByText(scheduleT.errorDuplicate)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();
      expect(mockUpdateScheduleSettings).not.toHaveBeenCalled();
    });

    it('ca 4 — nhập 0 hoặc 400 → báo lỗi tại chỗ, không gọi API', async () => {
      await openScheduleTab();

      fireEvent.change(screen.getByLabelText(dayLabel(1)), { target: { value: '0' } });
      expect(await screen.findByText(scheduleT.errorRange)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();

      fireEvent.change(screen.getByLabelText(dayLabel(1)), { target: { value: '400' } });
      expect(await screen.findByText(scheduleT.errorRange)).toBeInTheDocument();
      expect(mockUpdateScheduleSettings).not.toHaveBeenCalled();
    });

    it('ca 5 (đột biến bắt buộc: bỏ kẹp tối đa 5 mốc ở UI phải làm ca này đỏ) — nhập 6 mốc → báo lỗi tại chỗ, không gọi API', async () => {
      await openScheduleTab();

      for (let i = 0; i < 4; i += 1) {
        fireEvent.click(screen.getByRole('button', { name: scheduleT.addDay }));
      }
      fireEvent.change(screen.getByLabelText(dayLabel(3)), { target: { value: '30' } });
      fireEvent.change(screen.getByLabelText(dayLabel(4)), { target: { value: '60' } });
      fireEvent.change(screen.getByLabelText(dayLabel(5)), { target: { value: '90' } });
      fireEvent.change(screen.getByLabelText(dayLabel(6)), { target: { value: '120' } });

      expect(await screen.findByText(scheduleT.errorTooMany)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();
      expect(mockUpdateScheduleSettings).not.toHaveBeenCalled();
    });

    it('ca 6 (đột biến bắt buộc: bỏ cảnh báo khi danh sách rỗng phải làm ca này đỏ) — xoá hết mốc → cho lưu, nhưng cảnh báo rõ', async () => {
      await openScheduleTab();

      const removeButtons = screen.getAllByRole('button', { name: scheduleT.removeDay });
      fireEvent.click(removeButtons[0]);
      fireEvent.click(screen.getAllByRole('button', { name: scheduleT.removeDay })[0]);

      expect(await screen.findByText(scheduleT.emptyWarningTitle)).toBeInTheDocument();
      expect(screen.getByText(scheduleT.emptyWarningBody)).toBeInTheDocument();
      // Rỗng vẫn hợp lệ — nút Lưu KHÔNG bị chặn.
      expect(screen.getByRole('button', { name: 'Lưu' })).not.toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
      await waitFor(() => expect(mockUpdateScheduleSettings).toHaveBeenCalledWith([]));
    });

    it('ca 7 — API trả lỗi khi Lưu → hiện lỗi đọc được, KHÔNG mất dữ liệu đang nhập', async () => {
      mockUpdateScheduleSettings.mockRejectedValueOnce({ response: { data: { message: 'Máy chủ đang bận, thử lại sau' } } });
      await openScheduleTab();

      fireEvent.change(screen.getByLabelText(dayLabel(1)), { target: { value: '10' } });
      fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Máy chủ đang bận, thử lại sau'));
      // Dữ liệu đang nhập KHÔNG mất — vẫn còn '10' trong ô, không bị reset về mẫu cũ.
      expect(screen.getByLabelText(dayLabel(1))).toHaveValue(10);
    });

    it('ca 8 (đột biến bắt buộc: bỏ guard isDirty phải làm ca này đỏ) — sửa lịch chưa lưu, chuyển sang tab Nội dung thư → hỏi xác nhận; từ chối thì giữ tab lịch và không mất nội dung đang sửa', async () => {
      window.confirm.mockReturnValue(false);
      await openScheduleTab();

      fireEvent.change(screen.getByLabelText(dayLabel(1)), { target: { value: '99' } });
      fireEvent.click(screen.getByRole('button', { name: welcomeT.contentTabLabel }));

      expect(window.confirm).toHaveBeenCalledWith(welcomeT.tabSwitchConfirm);
      // Vẫn ở tab Lịch nhắc hạn, giá trị đang sửa còn nguyên.
      expect(screen.getByLabelText(dayLabel(1))).toHaveValue(99);
    });

    it('chiều ngược lại của ca 8 — sửa nội dung thư chưa lưu, chuyển sang tab Lịch nhắc hạn → cũng hỏi xác nhận', async () => {
      window.confirm.mockReturnValue(false);
      render(
        <I18nProvider>
          <AdminWelcomeEmailPage />
        </I18nProvider>
      );
      await screen.findByText('Email chào mừng thành viên');

      fireEvent.change(screen.getByLabelText('Tiêu đề email'), { target: { value: 'Đang sửa, chưa lưu' } });
      fireEvent.click(screen.getByRole('button', { name: scheduleT.tabLabel }));

      expect(window.confirm).toHaveBeenCalledWith(welcomeT.tabSwitchConfirm);
      expect(screen.getByDisplayValue('Đang sửa, chưa lưu')).toBeInTheDocument();
    });

    it('ca 9 — xem trước đổi ngay khi sửa mốc, chưa cần Lưu', async () => {
      await openScheduleTab();

      expect(screen.getByText(previewText('7, 3'))).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText(dayLabel(1)), { target: { value: '10' } });

      expect(await screen.findByText(previewText('10, 3'))).toBeInTheDocument();
      expect(mockUpdateScheduleSettings).not.toHaveBeenCalled();
    });
  });
});
