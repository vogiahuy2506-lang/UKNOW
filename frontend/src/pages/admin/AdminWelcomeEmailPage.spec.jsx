import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
const yearlyDayLabel = (n) => scheduleT.dayInputLabelYearly.replace('{index}', String(n));
const previewText = (days) => scheduleT.previewWithDays.replace('{days}', days);
const yearlyPreviewText = (days) => scheduleT.previewWithDaysYearly.replace('{days}', days);

// 11/10/2026 — bố cục mới (thanh trên + Cài đặt + Công cụ): Lịch nhắc hạn và Thông tin mẫu nằm trong modal
// Cài đặt, "Khôi phục mặc định" / "Cập nhật xem trước" nằm trong menu Công cụ, bộ chọn mẫu là tab ở thanh trên.
const openSettings = (tabName) => {
  fireEvent.click(screen.getByRole('button', { name: 'Cài đặt' }));
  const dialog = screen.getByRole('dialog');
  if (tabName) fireEvent.click(within(dialog).getByRole('button', { name: tabName }));
  return dialog;
};
const clickTool = (label) => {
  fireEvent.click(screen.getByRole('button', { name: 'Công cụ' }));
  fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(label) }));
};
const selectTemplateTab = (shortLabel) => fireEvent.click(screen.getByRole('tab', { name: shortLabel }));
const scheduleSaveButton = () => within(screen.getByRole('dialog')).getByRole('button', { name: 'Lưu' });

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
    mockGetScheduleSettings.mockResolvedValue(response({
      daysBefore: [7, 3], daysBeforeYearly: [30, 7, 3], updatedAt: null, updatedBy: null,
    }));
    mockUpdateScheduleSettings.mockImplementation(({ daysBefore, daysBeforeYearly }) => Promise.resolve(response({
      daysBefore,
      daysBeforeYearly,
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
    // Vị trí menu nằm trong Cài đặt → Thông tin (không còn chiếm chỗ ở vùng soạn).
    expect(screen.queryByText(/Quản trị hệ thống → AI & thông báo → Email chào mừng/)).not.toBeInTheDocument();
    const infoDialog = openSettings('Thông tin');
    expect(within(infoDialog).getByText(/Quản trị hệ thống → AI & thông báo → Email chào mừng/)).toBeInTheDocument();
    expect(within(infoDialog).getByText('Đang dùng bản mặc định')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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

    clickTool('Cập nhật xem trước');
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
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Đã lưu mẫu email chào mừng'));
    // Trạng thái "Đang dùng bản tùy chỉnh" nằm trong Cài đặt → Thông tin.
    expect(within(openSettings('Thông tin')).getByText('Đang dùng bản tùy chỉnh')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });

    clickTool('Khôi phục mặc định');
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

    selectTemplateTab('Sắp hết hạn');

    // Tên đầy đủ của mẫu hiện ở dòng phụ của thanh trên; tab "Sắp hết hạn" được chọn.
    expect(await screen.findByText('Email nhắc sắp hết hạn gói')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Sắp hết hạn' })).toHaveAttribute('aria-selected', 'true');
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

    selectTemplateTab('Sắp hết hạn');

    expect(window.confirm).toHaveBeenCalledWith('Nội dung đang sửa chưa được lưu. Chuyển mẫu khác sẽ bỏ các thay đổi này?');
    // Bị từ chối → vẫn ở mẫu welcome, nội dung đang sửa còn nguyên, KHÔNG gọi lại getTemplate.
    expect(screen.getByDisplayValue('Bản đang sửa, chưa lưu')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Chào mừng' })).toHaveAttribute('aria-selected', 'true');
    expect(mockGetTemplate).toHaveBeenCalledTimes(1);
  });

  // Dưới md thanh trên ẩn bộ chọn giữa → có ô chọn mẫu thư riêng; nó đi qua CÙNG handler (cùng hộp hỏi, cùng getTemplate).
  it('ô chọn mẫu thư trên màn nhỏ đổi mẫu qua cùng luồng với tab ở thanh trên', async () => {
    render(
      <I18nProvider>
        <AdminWelcomeEmailPage />
      </I18nProvider>
    );
    await screen.findByText('Email chào mừng thành viên');

    fireEvent.change(screen.getByRole('combobox', { name: 'Mẫu thư' }), { target: { value: 'plan_expired' } });

    await waitFor(() => expect(mockGetTemplate).toHaveBeenCalledWith('plan_expired'));
    expect(screen.getByRole('tab', { name: 'Đã hết hạn' })).toHaveAttribute('aria-selected', 'true');
  });

  // Cấu hình nằm trong Cài đặt: vùng soạn chỉ còn soạn + xem trước.
  it('vùng soạn không còn ô cấu hình lịch nhắc; chúng chỉ hiện sau khi mở Cài đặt', async () => {
    render(
      <I18nProvider>
        <AdminWelcomeEmailPage />
      </I18nProvider>
    );
    await screen.findByText('Email chào mừng thành viên');

    expect(screen.queryByLabelText(dayLabel(1))).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    openSettings();
    expect(await screen.findByLabelText(dayLabel(1))).toHaveValue(7);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  // PLAN_CAU_HINH_LICH_NHAC_HAN_2026-09-13.md, mục 5 (PR-2) — 9 ca nghiệm thu của bảng mục "Nghiệm
  // thu" trong plan. Nhãn tiếng Việt lấy từ vi.js (scheduleT/welcomeT), không gõ tay.
  describe('Lịch nhắc hạn (trong modal Cài đặt)', () => {
    async function openScheduleTab() {
      render(
        <I18nProvider>
          <AdminWelcomeEmailPage />
        </I18nProvider>
      );
      await screen.findByText('Email chào mừng thành viên');
      openSettings(scheduleT.tabLabel);
      await screen.findByLabelText(dayLabel(1));
    }

    it('ca 1 — mở Cài đặt → Lịch nhắc hạn → hiện đúng [7, 3] đọc từ API', async () => {
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

      fireEvent.click(scheduleSaveButton());

      // PLAN_MOC_NHAC_HAN_THEO_KY B5: lưu MỘT lần cả hai danh sách; gói năm không đụng tới vẫn được gửi nguyên [30, 7, 3].
      await waitFor(() => expect(mockUpdateScheduleSettings).toHaveBeenCalledWith({
        daysBefore: [10, 5, 2],
        daysBeforeYearly: [30, 7, 3],
      }));
      expect(mockToastSuccess).toHaveBeenCalledWith(scheduleT.saveSuccess);
    });

    it('ca 3 (đột biến bắt buộc: bỏ soi trùng mốc ở UI phải làm ca này đỏ) — nhập [7, 7] → báo lỗi tại chỗ, nút Lưu bị chặn, không gọi API', async () => {
      await openScheduleTab();

      fireEvent.change(screen.getByLabelText(dayLabel(2)), { target: { value: '7' } });

      expect(await screen.findByText(scheduleT.errorDuplicate)).toBeInTheDocument();
      expect(scheduleSaveButton()).toBeDisabled();
      expect(mockUpdateScheduleSettings).not.toHaveBeenCalled();
    });

    it('ca 4 — nhập 0 hoặc 400 → báo lỗi tại chỗ, không gọi API', async () => {
      await openScheduleTab();

      fireEvent.change(screen.getByLabelText(dayLabel(1)), { target: { value: '0' } });
      expect(await screen.findByText(scheduleT.errorRange)).toBeInTheDocument();
      expect(scheduleSaveButton()).toBeDisabled();

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
      expect(scheduleSaveButton()).toBeDisabled();
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
      expect(scheduleSaveButton()).not.toBeDisabled();

      fireEvent.click(scheduleSaveButton());
      await waitFor(() => expect(mockUpdateScheduleSettings).toHaveBeenCalledWith({
        daysBefore: [],
        daysBeforeYearly: [30, 7, 3],
      }));
    });

    it('ca 7 — API trả lỗi khi Lưu → hiện lỗi đọc được, KHÔNG mất dữ liệu đang nhập', async () => {
      mockUpdateScheduleSettings.mockRejectedValueOnce({ response: { data: { message: 'Máy chủ đang bận, thử lại sau' } } });
      await openScheduleTab();

      fireEvent.change(screen.getByLabelText(dayLabel(1)), { target: { value: '10' } });
      fireEvent.click(scheduleSaveButton());

      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Máy chủ đang bận, thử lại sau'));
      // Dữ liệu đang nhập KHÔNG mất — vẫn còn '10' trong ô, không bị reset về mẫu cũ.
      expect(screen.getByLabelText(dayLabel(1))).toHaveValue(10);
    });

    // 11/10/2026: Lịch nhắc hạn không còn là "tab" ngang hàng với nội dung thư mà nằm trong modal Cài đặt → hộp hỏi
    // khi chuyển tab đổi thành hộp hỏi khi ĐÓNG Cài đặt mà lịch đang sửa chưa Lưu (cùng mục đích: không bỏ quên bản nháp).
    it('ca 8 (đột biến bắt buộc: bỏ guard scheduleIsDirty phải làm ca này đỏ) — sửa lịch chưa lưu, đóng Cài đặt → hỏi xác nhận; từ chối thì modal còn mở và không mất giá trị đang sửa', async () => {
      window.confirm.mockReturnValue(false);
      await openScheduleTab();

      fireEvent.change(screen.getByLabelText(dayLabel(1)), { target: { value: '99' } });
      fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Đóng' })[0]);

      expect(window.confirm).toHaveBeenCalledWith(welcomeT.settingsCloseConfirm);
      // Từ chối → modal vẫn mở, giá trị đang sửa còn nguyên.
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByLabelText(dayLabel(1))).toHaveValue(99);
    });

    it('ca 8b — đồng ý bỏ thay đổi khi đóng Cài đặt → modal đóng và mở lại thấy lịch đã lưu [7, 3], không gọi API', async () => {
      window.confirm.mockReturnValue(true);
      await openScheduleTab();

      fireEvent.change(screen.getByLabelText(dayLabel(1)), { target: { value: '99' } });
      fireEvent.keyDown(document, { key: 'Escape' });

      expect(window.confirm).toHaveBeenCalledWith(welcomeT.settingsCloseConfirm);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      openSettings(scheduleT.tabLabel);
      expect(await screen.findByLabelText(dayLabel(1))).toHaveValue(7);
      expect(mockUpdateScheduleSettings).not.toHaveBeenCalled();
    });

    it('ca 8c — lịch KHÔNG thay đổi thì đóng Cài đặt không hỏi gì', async () => {
      await openScheduleTab();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(window.confirm).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Chiều ngược lại của ca 8 (trước: sửa thư chưa lưu → sang tab Lịch nhắc hạn cũng hỏi). Mở Cài đặt là mở modal CHỒNG lên
    // trang, nội dung thư vẫn nằm nguyên ở state phía sau → không có gì để mất nên KHÔNG hỏi; ghim lại để không ai chặn nhầm.
    it('chiều ngược lại của ca 8 — sửa nội dung thư chưa lưu rồi mở Cài đặt → KHÔNG hỏi, nội dung đang sửa còn nguyên sau khi đóng', async () => {
      render(
        <I18nProvider>
          <AdminWelcomeEmailPage />
        </I18nProvider>
      );
      await screen.findByText('Email chào mừng thành viên');

      fireEvent.change(screen.getByLabelText('Tiêu đề email'), { target: { value: 'Đang sửa, chưa lưu' } });
      openSettings(scheduleT.tabLabel);
      fireEvent.keyDown(document, { key: 'Escape' });

      expect(window.confirm).not.toHaveBeenCalled();
      expect(screen.getByDisplayValue('Đang sửa, chưa lưu')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Lưu' })).not.toBeDisabled();
    });

    // ── PLAN_MOC_NHAC_HAN_THEO_KY_2026-10-12.md B5 — HAI danh sách: Gói tháng + Gói năm ─────────────────────────────
    describe('hai danh sách mốc: Gói tháng và Gói năm', () => {
      it('hiện đủ hai danh sách đọc từ API: gói tháng [7, 3], gói năm [30, 7, 3]', async () => {
        await openScheduleTab();

        expect(screen.getByText(scheduleT.monthlyTitle)).toBeInTheDocument();
        expect(screen.getByText(scheduleT.yearlyTitle)).toBeInTheDocument();
        expect(screen.getByLabelText(dayLabel(1))).toHaveValue(7);
        expect(screen.getByLabelText(dayLabel(2))).toHaveValue(3);
        expect(screen.queryByLabelText(dayLabel(3))).not.toBeInTheDocument();
        expect(screen.getByLabelText(yearlyDayLabel(1))).toHaveValue(30);
        expect(screen.getByLabelText(yearlyDayLabel(2))).toHaveValue(7);
        expect(screen.getByLabelText(yearlyDayLabel(3))).toHaveValue(3);
        // Hai đoạn xem trước, mỗi đoạn theo danh sách của mình.
        expect(screen.getByText(previewText('7, 3'))).toBeInTheDocument();
        expect(screen.getByText(yearlyPreviewText('30, 7, 3'))).toBeInTheDocument();
      });

      it('(đột biến: bỏ daysBeforeYearly khỏi payload phải làm ca này đỏ) sửa gói năm thành [60, 30, 7, 1] và Lưu → PUT gửi CẢ HAI danh sách trong một lần', async () => {
        await openScheduleTab();

        fireEvent.change(screen.getByLabelText(yearlyDayLabel(1)), { target: { value: '60' } });
        fireEvent.change(screen.getByLabelText(yearlyDayLabel(2)), { target: { value: '30' } });
        fireEvent.change(screen.getByLabelText(yearlyDayLabel(3)), { target: { value: '7' } });
        fireEvent.click(screen.getByRole('button', { name: scheduleT.addDayYearly }));
        fireEvent.change(screen.getByLabelText(yearlyDayLabel(4)), { target: { value: '1' } });
        expect(await screen.findByText(yearlyPreviewText('60, 30, 7, 1'))).toBeInTheDocument();
        // Danh sách gói tháng KHÔNG bị kéo theo.
        expect(screen.getByLabelText(dayLabel(1))).toHaveValue(7);

        fireEvent.click(scheduleSaveButton());

        await waitFor(() => expect(mockUpdateScheduleSettings).toHaveBeenCalledTimes(1));
        expect(mockUpdateScheduleSettings).toHaveBeenCalledWith({
          daysBefore: [7, 3],
          daysBeforeYearly: [60, 30, 7, 1],
        });
        expect(mockToastSuccess).toHaveBeenCalledWith(scheduleT.saveSuccess);
        // Sau khi lưu thì không còn "chưa lưu": đóng Cài đặt không hỏi.
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(window.confirm).not.toHaveBeenCalled();
      });

      it('gói năm nhập mốc trùng [30, 30] → báo lỗi tại chỗ, nút Lưu bị chặn dù gói tháng hợp lệ, không gọi API', async () => {
        await openScheduleTab();

        fireEvent.change(screen.getByLabelText(yearlyDayLabel(2)), { target: { value: '30' } });

        expect(await screen.findByText(scheduleT.errorDuplicate)).toBeInTheDocument();
        expect(scheduleSaveButton()).toBeDisabled();
        expect(mockUpdateScheduleSettings).not.toHaveBeenCalled();
      });

      it('gói năm nhập 400 → báo lỗi khoảng 1-365; xoá hết mốc gói năm → cảnh báo riêng cho gói năm, vẫn cho lưu và gửi []', async () => {
        await openScheduleTab();

        fireEvent.change(screen.getByLabelText(yearlyDayLabel(1)), { target: { value: '400' } });
        expect(await screen.findByText(scheduleT.errorRange)).toBeInTheDocument();
        expect(scheduleSaveButton()).toBeDisabled();

        for (let i = 0; i < 3; i += 1) {
          fireEvent.click(screen.getAllByRole('button', { name: scheduleT.removeDayYearly })[0]);
        }
        expect(await screen.findByText(scheduleT.emptyWarningYearlyTitle)).toBeInTheDocument();
        expect(screen.getByText(scheduleT.emptyWarningYearlyBody)).toBeInTheDocument();
        expect(scheduleSaveButton()).not.toBeDisabled();

        fireEvent.click(scheduleSaveButton());
        await waitFor(() => expect(mockUpdateScheduleSettings).toHaveBeenCalledWith({
          daysBefore: [7, 3],
          daysBeforeYearly: [],
        }));
      });

      it('chỉ sửa gói năm rồi đóng Cài đặt mà chưa Lưu → vẫn hỏi xác nhận (gói năm cũng tính là "chưa lưu"); đồng ý thì mở lại thấy giá trị đã lưu', async () => {
        window.confirm.mockReturnValue(true);
        await openScheduleTab();

        fireEvent.change(screen.getByLabelText(yearlyDayLabel(1)), { target: { value: '99' } });
        fireEvent.keyDown(document, { key: 'Escape' });

        expect(window.confirm).toHaveBeenCalledWith(welcomeT.settingsCloseConfirm);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        openSettings(scheduleT.tabLabel);
        expect(await screen.findByLabelText(yearlyDayLabel(1))).toHaveValue(30);
        expect(mockUpdateScheduleSettings).not.toHaveBeenCalled();
      });

      it('API cũ chưa có daysBeforeYearly → gói năm hiện rỗng (cảnh báo riêng), không văng lỗi', async () => {
        mockGetScheduleSettings.mockResolvedValue(response({ daysBefore: [7, 3], updatedAt: null, updatedBy: null }));
        await openScheduleTab();

        expect(screen.queryByLabelText(yearlyDayLabel(1))).not.toBeInTheDocument();
        expect(screen.getByText(scheduleT.emptyWarningYearlyTitle)).toBeInTheDocument();
      });
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

/**
 * Ghim chữ mô tả của mẫu plan_expiring phải THEO lịch đang đặt.
 *
 * Trước 13/09/2026 hai chuỗi `templateMeta.plan_expiring.subtitle` và `.behaviorNote` ghi cứng
 * "còn 7 ngày và còn 3 ngày". Từ khi PR-2 cho sửa lịch, ghi cứng là tự mâu thuẫn NGAY TRONG MỘT
 * TRANG: sếp đặt [10, 5] ở Lịch nhắc hạn, quay lại thì chữ mô tả vẫn nói 7 và 3.
 *
 * Người implement có nêu chuyện này trong báo cáo nhưng xếp là "ngoài phạm vi". Thực ra nó là hệ
 * quả trực tiếp của chính tính năng PR-2, nên Claude sửa luôn lúc review.
 */
describe('AdminWelcomeEmailPage — mô tả mẫu plan_expiring bám theo lịch đã lưu', () => {
  it('lịch đang là [10, 5] thì chữ mô tả nói 10, 5 — KHÔNG còn 7 và 3', async () => {
    mockGetScheduleSettings.mockResolvedValue(
      response({ daysBefore: [10, 5], updatedAt: null, updatedBy: null })
    );

    render(
      <I18nProvider>
        <AdminWelcomeEmailPage />
      </I18nProvider>
    );
    await screen.findByText('Email chào mừng thành viên');

    // Chuyển sang mẫu "sắp hết hạn" rồi mở Cài đặt → Thông tin (chữ mô tả đã chuyển vào đó khỏi vùng soạn).
    selectTemplateTab(welcomeT.templateKeysShort.plan_expiring);
    await screen.findByText(welcomeT.templateMeta.plan_expiring.title);
    openSettings(welcomeT.settingsInfoTab);

    // CẢ HAI chỗ phải động: dòng mô tả (subtitle) và dòng giải thích hành vi (behaviorNote).
    const mota = await screen.findAllByText((_, el) => {
      const txt = el?.textContent || '';
      return el?.tagName === 'P' && txt.includes('10, 5') && txt.includes('ngày');
    });
    expect(mota).toHaveLength(2);

    // Không còn dấu vết chuỗi cứng cũ.
    expect(screen.queryByText(/còn 7 ngày và còn 3 ngày/)).not.toBeInTheDocument();
  });

  it('chữ mô tả nêu CẢ mốc gói năm đã lưu (PLAN_MOC_NHAC_HAN_THEO_KY B5): gói tháng [10, 5], gói năm [60, 30]', async () => {
    mockGetScheduleSettings.mockResolvedValue(
      response({ daysBefore: [10, 5], daysBeforeYearly: [60, 30], updatedAt: null, updatedBy: null })
    );

    render(
      <I18nProvider>
        <AdminWelcomeEmailPage />
      </I18nProvider>
    );
    await screen.findByText('Email chào mừng thành viên');
    selectTemplateTab(welcomeT.templateKeysShort.plan_expiring);
    await screen.findByText(welcomeT.templateMeta.plan_expiring.title);
    openSettings(welcomeT.settingsInfoTab);

    const mota = await screen.findAllByText((_, el) => {
      const txt = el?.textContent || '';
      return el?.tagName === 'P' && txt.includes('10, 5') && txt.includes('60, 30');
    });
    expect(mota).toHaveLength(2);
  });
});
