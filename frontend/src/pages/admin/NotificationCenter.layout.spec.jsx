import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import toast from 'react-hot-toast';
import { I18nProvider } from '../../i18n';
import { useAuthStore } from '../../stores/authStore.js';
import { TYPE_TEMPLATES } from '../../features/admin/utils/notificationTemplates.util';
import NotificationCenter from './NotificationCenter';

/**
 * Bố cục trình soạn (11/10/2026): thanh trên (3 chế độ + Cài đặt + Công cụ + nút chính) và modal Cài đặt.
 * Phần cứng của ca test này: CHỈ ĐỔI BỐ CỤC — kênh / đối tượng / lịch chọn trong Cài đặt vẫn đi vào payload y như bản trước.
 * Khác NotificationCenter.channels.spec.jsx (giả TargetingPanel/ScheduleSelector), ở đây dùng THẬT hai ô đó để chứng minh cả đường đi.
 */

const {
  mockGetNotifications,
  mockListTemplates,
  mockGetEvents,
  mockUpdateEvent,
  mockGetAllUsers,
  mockSendDirect,
  mockCreate,
  mockSchedule,
  mockCreateTemplate,
} = vi.hoisted(() => ({
  mockGetNotifications: vi.fn(),
  mockListTemplates: vi.fn(),
  mockGetEvents: vi.fn(),
  mockUpdateEvent: vi.fn(),
  mockGetAllUsers: vi.fn(),
  mockSendDirect: vi.fn(),
  mockCreate: vi.fn(),
  mockSchedule: vi.fn(),
  mockCreateTemplate: vi.fn(),
}));

vi.mock('../../features/admin/services/adminNotificationApi.service', () => ({
  default: {
    getNotifications: mockGetNotifications,
    listTemplates: mockListTemplates,
    getNotificationEvents: mockGetEvents,
    updateNotificationEvent: mockUpdateEvent,
    getAllUsers: mockGetAllUsers,
    sendDirect: mockSendDirect,
    createNotification: mockCreate,
    scheduleNotification: mockSchedule,
    createTemplate: mockCreateTemplate,
  },
}));

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

// Chỉ giả các modal ngoài phạm vi; TargetingPanel / ScheduleSelector / NotificationChannelSelector / bảng lịch sử là bản THẬT.
vi.mock('../../features/admin/components', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    EmailPreviewModal: () => null,
    EmailLogsModal: () => null,
    SaveAsTemplateModal: ({ open, onSubmit, initial }) => (open ? (
      <div data-testid="save-as-stub" data-subject={initial.subject} data-type={initial.typeKey}>
        <button type="button" onClick={() => onSubmit({ name: 'Mẫu thử', slug: 'mau-thu', description: 'mô tả' })}>stub-xac-nhan-luu</button>
      </div>
    ) : null),
  };
});

const ENTRY = (key, settings = {}) => ({
  key,
  label: `Nhãn ${key}`,
  labelEn: `Label ${key}`,
  description: `Mô tả ${key}`,
  audience: 'user',
  catalogUserCanDisableEmail: true,
  settings: { inAppEnabled: true, emailEnabled: true, userCanDisableEmail: true, isDefault: true, ...settings },
});

const USERS = [
  // Hình dạng THẬT của GET /admin/members (camelCase) — xem adminMembers.repository.js findAllMembers.
  { id: 41, fullName: 'Khách A', email: 'a@example.com', status: 'active', planCode: 'starter', planName: 'Starter' },
  { id: 42, fullName: 'Khách B', email: 'b@example.com', status: 'active', planCode: 'professional', planName: 'Professional' },
];

const NOTIFICATION = {
  id: 7,
  type: 'promotion',
  status: 'sent',
  title: 'Ưu đãi tháng 10',
  channels: ['email'],
  recipient_count: 3,
  sent_count: 3,
  created_at: '2026-10-09T08:00:00Z',
};

function renderPage() {
  return render(
    <I18nProvider defaultLocale="vi">
      <NotificationCenter />
    </I18nProvider>,
  );
}

// ---- helpers dùng chung: đi qua giao diện thật (thanh trên → Cài đặt → tab) ----
const clickMode = async (name) => fireEvent.click(await screen.findByRole('tab', { name }));
const openSettings = () => fireEvent.click(screen.getByRole('button', { name: 'Cài đặt' }));
const dialog = () => screen.getByRole('dialog');
const gotoSettingsTab = (name) => fireEvent.click(within(dialog()).getByRole('button', { name }));
// Danh sách người dùng của tab Đối tượng luôn hiện, không còn nút "Xong" riêng: chỉ có nút Xong của modal.
const closeSettings = () => fireEvent.click(within(dialog()).getByRole('button', { name: 'Xong' }));

async function openSendMode() {
  renderPage();
  await clickMode(/Gửi chiến dịch/);
  await screen.findByRole('button', { name: /Gửi ngay/ });
}

describe('NotificationCenter - bố cục trình soạn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: 1, role: 'admin', roleCode: 'admin' } });
    mockGetNotifications.mockResolvedValue({ data: { success: true, data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } } });
    mockListTemplates.mockResolvedValue({ data: { success: true, data: [] } });
    mockGetEvents.mockResolvedValue({ data: { success: true, data: [ENTRY('admin_broadcast'), ENTRY('plan_expiring')] } });
    mockGetAllUsers.mockResolvedValue({ data: { success: true, data: USERS } });
    mockSendDirect.mockResolvedValue({ data: { success: true, message: 'ok' } });
    mockCreate.mockResolvedValue({ data: { success: true, data: { id: 5 } } });
    mockSchedule.mockResolvedValue({ data: { success: true } });
    mockCreateTemplate.mockResolvedValue({ data: { success: true } });
  });

  describe('khung + Cài đặt', () => {
    it('thanh trên có 3 chế độ; Cấu hình kênh không còn là tab ngang hàng', async () => {
      renderPage();
      const tabs = await screen.findAllByRole('tab');
      expect(tabs.map((tab) => tab.textContent)).toEqual(['Lịch sử', 'Soạn mẫu', 'Gửi chiến dịch']);
      expect(screen.getByRole('tab', { name: 'Lịch sử' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.queryByRole('tab', { name: /Cấu hình kênh/ })).not.toBeInTheDocument();
      expect(screen.getByTestId('admin-editor-shell')).toBeInTheDocument();
    });

    it('Gửi chiến dịch: vùng chính KHÔNG còn ô kênh/đối tượng/lịch — chúng nằm trong Cài đặt (mở bằng nút hoặc nút Sửa trên tóm tắt)', async () => {
      await openSendMode();
      expect(screen.queryByRole('checkbox', { name: /^Email/ })).not.toBeInTheDocument();
      expect(screen.queryByText('Nhắm đối tượng')).not.toBeInTheDocument();
      expect(screen.queryByText('Thời gian gửi')).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      openSettings();
      expect(dialog()).toBeInTheDocument();
      expect(within(dialog()).getByRole('checkbox', { name: /^Email/ })).toBeChecked();
      expect(within(dialog()).getByRole('checkbox', { name: /Chuông thông báo/ })).toBeChecked();
      for (const name of ['Kênh gửi', 'Đối tượng', 'Lịch gửi', 'Cấu hình kênh']) {
        expect(within(dialog()).getByRole('button', { name })).toBeInTheDocument();
      }
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      // nút "Sửa" trên dòng tóm tắt cũng mở Cài đặt
      fireEvent.click(screen.getByRole('button', { name: /Sửa/ }));
      expect(within(dialog()).getByRole('checkbox', { name: /^Email/ })).toBeInTheDocument();
    });

    it('tóm tắt một dòng đổi theo Cài đặt: kênh · đối tượng · thời gian', async () => {
      await openSendMode();
      const summary = screen.getByRole('group', { name: 'Tóm tắt sẽ gửi' });
      expect(summary).toHaveTextContent('Kênh: Email + Chuông');
      expect(summary).toHaveTextContent('Đối tượng: chưa chọn');
      expect(summary).toHaveTextContent('Thời gian: gửi ngay');

      openSettings();
      fireEvent.click(within(dialog()).getByRole('checkbox', { name: /^Email/ }));
      gotoSettingsTab('Đối tượng');
      fireEvent.click(await within(dialog()).findByText('Khách A'));
      fireEvent.click(within(dialog()).getByText('Khách B'));
      closeSettings();

      expect(summary).toHaveTextContent('Kênh: Chuông');
      expect(summary).toHaveTextContent('Đối tượng: 2 người nhận');
    });

    it('màn hẹp: dải chế độ (nút aria-pressed) đổi chế độ giống tab trên thanh', async () => {
      renderPage();
      await screen.findAllByRole('tab');
      fireEvent.click(screen.getByRole('button', { name: 'Soạn mẫu' }));
      expect(screen.getByRole('tab', { name: 'Soạn mẫu' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('button', { name: 'Soạn mẫu' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('Mã HTML email')).toBeInTheDocument();
    });
  });

  describe('Gửi chiến dịch — payload không đổi khi cấu hình đi qua Cài đặt', () => {
    it('hẹn giờ: dạng + kênh (bỏ Email) + liên kết chuông + 2 người nhận thật + lịch hẹn → createNotification đúng từng trường rồi scheduleNotification', async () => {
      await openSendMode();
      // dạng email chọn ở vùng chính
      fireEvent.click(screen.getByRole('button', { name: 'Khuyến mãi' }));

      openSettings();
      // Kênh gửi: bỏ Email, chỉ còn Chuông + liên kết
      fireEvent.click(within(dialog()).getByRole('checkbox', { name: /^Email/ }));
      fireEvent.change(within(dialog()).getByLabelText(/Liên kết khi bấm/), { target: { value: ' /app/plans ' } });
      // Đối tượng: chọn 2 người từ danh sách thật
      gotoSettingsTab('Đối tượng');
      fireEvent.click(await within(dialog()).findByText('Khách A'));
      fireEvent.click(within(dialog()).getByText('Khách B'));
      // Lịch gửi: hẹn giờ
      gotoSettingsTab('Lịch gửi');
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Hẹn giờ' }));
      const when = '2030-01-15T09:30';
      fireEvent.change(dialog().querySelector('input[type="datetime-local"]'), { target: { value: when } });
      closeSettings();

      fireEvent.click(screen.getByRole('button', { name: 'Hẹn giờ' }));

      await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
      const promo = TYPE_TEMPLATES.promotion;
      const payload = mockCreate.mock.calls[0][0];
      expect(payload).toEqual({
        type: 'promotion',
        title: promo.subject.trim(),
        title_en: '',
        message: expect.any(String),
        message_en: '',
        html_content: promo.bodyHtml.trim(),
        channels: ['in_app'],
        metadata: { link: '/app/plans' },
        target_user_ids: [41, 42],
        schedule_type: 'scheduled',
        scheduled_at: when,
      });
      // `message` là text thuần rút từ HTML, không còn thẻ
      expect(payload.message.length).toBeGreaterThan(10);
      expect(payload.message).not.toMatch(/<[a-z!/]/i);
      expect(mockSendDirect).not.toHaveBeenCalled();
      await waitFor(() => expect(mockSchedule).toHaveBeenCalledWith(5, new Date(when).toISOString()));
    });

    it('định kỳ: nút chính đổi nhãn "Lên lịch định kỳ", payload mang recurrence_pattern + ngày kết thúc, KHÔNG gọi scheduleNotification', async () => {
      await openSendMode();
      openSettings();
      gotoSettingsTab('Đối tượng');
      fireEvent.click(await within(dialog()).findByText('Khách A'));
      gotoSettingsTab('Lịch gửi');
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Lặp lại' }));
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Hàng tuần' }));
      closeSettings();

      expect(screen.getByRole('group', { name: 'Tóm tắt sẽ gửi' })).toHaveTextContent('Thời gian: lặp hàng tuần');
      fireEvent.click(screen.getByRole('button', { name: /Lên lịch định kỳ/ }));

      await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
      expect(mockCreate.mock.calls[0][0]).toMatchObject({
        type: 'announcement',
        schedule_type: 'recurring',
        recurrence_pattern: 'weekly',
        target_user_ids: [41],
        channels: ['email', 'in_app'],
      });
      expect(mockSchedule).not.toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Đã tạo thông báo định kỳ thành công');
    });

    it('gửi ngay: người nhận chọn trong Cài đặt → sendDirect; xong thì về chế độ Lịch sử', async () => {
      await openSendMode();
      openSettings();
      gotoSettingsTab('Đối tượng');
      fireEvent.click(await within(dialog()).findByText('Khách B'));
      closeSettings();
      fireEvent.click(screen.getByRole('button', { name: /Gửi ngay/ }));

      await waitFor(() => expect(mockSendDirect).toHaveBeenCalledTimes(1));
      expect(mockSendDirect.mock.calls[0][0]).toMatchObject({
        type: 'announcement',
        channels: ['email', 'in_app'],
        target_user_ids: [42],
        schedule_type: 'now',
      });
      await waitFor(() => expect(screen.getByRole('tab', { name: 'Lịch sử' })).toHaveAttribute('aria-selected', 'true'));
    });

    it('chưa chọn người nhận → báo lỗi như cũ, không gọi API', async () => {
      await openSendMode();
      fireEvent.click(screen.getByRole('button', { name: /Gửi ngay/ }));
      expect(toast.error).toHaveBeenCalledWith('Vui lòng chọn ít nhất một người nhận (user IDs hoặc email)');
      expect(mockSendDirect).not.toHaveBeenCalled();
    });

    it('chọn mẫu đã lưu ở vùng chính → điền subject + HTML của dạng đó vào bản gửi', async () => {
      mockListTemplates.mockResolvedValue({
        data: { success: true, data: [{ id: 9, name: 'Mẫu bảo trì tháng 10', type_key: 'maintenance', subject: 'Tiêu đề từ mẫu đã lưu', body_html: '<p>Nội dung từ mẫu đã lưu</p>' }] },
      });
      await openSendMode();
      const select = await screen.findByLabelText(/Dùng mẫu đã lưu/);
      await screen.findByRole('option', { name: /Mẫu bảo trì tháng 10/ });
      fireEvent.change(select, { target: { value: '9' } });
      expect(toast.success).toHaveBeenCalledWith('Đã fill mẫu "Mẫu bảo trì tháng 10" vào form');
      expect(screen.getByRole('button', { name: 'Bảo trì' })).toHaveAttribute('aria-pressed', 'true');

      openSettings();
      gotoSettingsTab('Đối tượng');
      fireEvent.click(await within(dialog()).findByText('Khách A'));
      closeSettings();
      fireEvent.click(screen.getByRole('button', { name: /Gửi ngay/ }));

      await waitFor(() => expect(mockSendDirect).toHaveBeenCalledTimes(1));
      expect(mockSendDirect.mock.calls[0][0]).toMatchObject({
        type: 'maintenance',
        title: 'Tiêu đề từ mẫu đã lưu',
        html_content: '<p>Nội dung từ mẫu đã lưu</p>',
      });
    });
  });

  describe('Soạn mẫu', () => {
    const subjectBox = () => screen.getByLabelText('Tiêu đề email');
    const htmlBox = () => screen.getByLabelText('Mã HTML email');

    it('soạn tiêu đề + HTML, bấm "Lưu thành mẫu" trên thanh → createTemplate đúng payload cũ', async () => {
      renderPage();
      await clickMode('Soạn mẫu');
      fireEvent.click(screen.getByRole('button', { name: 'Khuyến mãi' }));
      fireEvent.change(subjectBox(), { target: { value: 'Tiêu đề mới' } });
      fireEvent.change(htmlBox(), { target: { value: '<p>Nội dung mới {{user_name}}</p>' } });

      fireEvent.click(screen.getByRole('button', { name: /Lưu thành mẫu/ }));
      const stub = await screen.findByTestId('save-as-stub');
      expect(stub).toHaveAttribute('data-subject', 'Tiêu đề mới');
      expect(stub).toHaveAttribute('data-type', 'promotion');
      fireEvent.click(screen.getByText('stub-xac-nhan-luu'));

      await waitFor(() => expect(mockCreateTemplate).toHaveBeenCalledTimes(1));
      expect(mockCreateTemplate.mock.calls[0][0]).toEqual({
        type_key: 'promotion',
        slug: 'mau-thu',
        name: 'Mẫu thử',
        description: 'mô tả',
        subject: 'Tiêu đề mới',
        body_html: '<p>Nội dung mới {{user_name}}</p>',
        schedule_type: 'now',
      });
    });

    it('không phải super admin → nút "Lưu thành mẫu" bị khoá', async () => {
      useAuthStore.setState({ user: { id: 2, role: 'user', roleCode: 'user' } });
      renderPage();
      await clickMode('Soạn mẫu');
      expect(screen.getByRole('button', { name: /Lưu thành mẫu/ })).toBeDisabled();
    });

    it('menu Công cụ: "Xoá trắng" xoá bản soạn của dạng đang chọn, "Dùng mẫu …" chép lại mẫu gốc', async () => {
      renderPage();
      await clickMode('Soạn mẫu');
      const original = TYPE_TEMPLATES.announcement;
      expect(subjectBox()).toHaveValue(original.subject);

      fireEvent.click(screen.getByRole('button', { name: /Công cụ/ }));
      fireEvent.click(screen.getByRole('menuitem', { name: /Xoá trắng/ }));
      expect(subjectBox()).toHaveValue('');
      expect(htmlBox()).toHaveValue('');
      expect(screen.getByText('Chưa có nội dung để xem trước')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Công cụ/ }));
      fireEvent.click(screen.getByRole('menuitem', { name: /Dùng mẫu Thông báo/ }));
      expect(subjectBox()).toHaveValue(original.subject);
      expect(htmlBox()).toHaveValue(original.bodyHtml);
    });

    it('chip biến số chèn {{…}} tại con trỏ; mỗi dạng giữ bản soạn riêng', async () => {
      renderPage();
      await clickMode('Soạn mẫu');
      fireEvent.change(htmlBox(), { target: { value: 'AB' } });
      htmlBox().setSelectionRange(1, 1);
      fireEvent.click(screen.getByRole('button', { name: '{{user_name}}' }));
      expect(htmlBox()).toHaveValue('A{{user_name}}B');

      // sang dạng khác: bản soạn của dạng "Thông báo" vẫn còn khi quay lại
      fireEvent.click(screen.getByRole('button', { name: 'Cảnh báo' }));
      expect(subjectBox()).toHaveValue(TYPE_TEMPLATES.warning.subject);
      fireEvent.click(screen.getByRole('button', { name: 'Thông báo' }));
      expect(htmlBox()).toHaveValue('A{{user_name}}B');
    });

    it('"Sang Gửi chiến dịch" mang dạng + bản soạn sang chế độ gửi: payload dùng đúng subject vừa sửa', async () => {
      renderPage();
      await clickMode('Soạn mẫu');
      fireEvent.click(screen.getByRole('button', { name: 'Nhắc nhở' }));
      fireEvent.change(subjectBox(), { target: { value: 'Nhắc nhở đã sửa' } });
      fireEvent.click(screen.getByRole('button', { name: /Sang Gửi chiến dịch/ }));

      await screen.findByRole('button', { name: /Gửi ngay/ });
      expect(screen.getByRole('tab', { name: 'Gửi chiến dịch' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('button', { name: 'Nhắc nhở' })).toHaveAttribute('aria-pressed', 'true');

      openSettings();
      gotoSettingsTab('Đối tượng');
      fireEvent.click(await within(dialog()).findByText('Khách A'));
      closeSettings();
      fireEvent.click(screen.getByRole('button', { name: /Gửi ngay/ }));

      await waitFor(() => expect(mockSendDirect).toHaveBeenCalledTimes(1));
      expect(mockSendDirect.mock.calls[0][0]).toMatchObject({ type: 'reminder', title: 'Nhắc nhở đã sửa' });
    });
  });

  describe('Lịch sử', () => {
    it('hiện bảng lịch sử toàn chiều rộng; "Sao chép" đưa dạng đó sang chế độ Soạn mẫu', async () => {
      mockGetNotifications.mockResolvedValue({ data: { success: true, data: { data: [NOTIFICATION], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } } });
      renderPage();
      expect(await screen.findByText('Ưu đãi tháng 10')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Sao chép' }));

      await waitFor(() => expect(screen.getByRole('tab', { name: 'Soạn mẫu' })).toHaveAttribute('aria-selected', 'true'));
      expect(screen.getByRole('button', { name: 'Khuyến mãi' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('Tiêu đề email')).toHaveValue(TYPE_TEMPLATES.promotion.subject);
    });
  });

  describe('Cấu hình kênh theo sự kiện (tab trong Cài đặt)', () => {
    it('lưu cấu hình admin_broadcast trong Cài đặt → tab Kênh gửi khoá kênh vừa tắt (tính năng của main giữ nguyên)', async () => {
      const updated = ENTRY('admin_broadcast', { inAppEnabled: false, isDefault: false });
      mockUpdateEvent.mockResolvedValue({ data: { success: true, data: updated } });
      await openSendMode();
      await waitFor(() => expect(mockGetEvents).toHaveBeenCalled());

      openSettings();
      gotoSettingsTab('Cấu hình kênh');
      const row = await within(dialog()).findByTestId('event-row-admin_broadcast');
      fireEvent.click(within(row).getByRole('switch', { name: /Chuông/ }));
      fireEvent.click(within(row).getByRole('button', { name: /Lưu/ }));
      await waitFor(() => expect(mockUpdateEvent).toHaveBeenCalledWith('admin_broadcast', {
        inAppEnabled: false,
        emailEnabled: true,
        userCanDisableEmail: true,
      }));

      gotoSettingsTab('Kênh gửi');
      const bell = within(dialog()).getByRole('checkbox', { name: /Chuông thông báo/ });
      await waitFor(() => expect(bell).toBeDisabled());
      expect(bell).not.toBeChecked();
      expect(within(dialog()).getByRole('checkbox', { name: /^Email/ })).toBeChecked();
    });
  });
});
