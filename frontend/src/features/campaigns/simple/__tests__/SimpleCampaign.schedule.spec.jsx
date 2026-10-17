import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import toast from 'react-hot-toast';
import SimpleCampaign from '../../../../pages/campaigns/SimpleCampaign';
import campaignApiService from '../../services/campaignApi.service';
import campaignRunApiService from '../../services/campaignRunApi.service';
import campaignBuilderApiService from '../../services/campaignBuilderApi.service';
import emailTemplateApiService from '../../../templates/services/emailTemplateApi.service';
import zaloTemplateApiService from '../../../templates/services/zaloTemplateApi.service';
import customerApiService from '../../../customers/services/customerApi.service';
import chatbotApiService from '../../../chatbot/services/chatbotApi.service';

// ── Mock ranh giới: i18n từ điển thật (useI18n(ns) → hàm t; useI18n() → { t, locale }), cổng kênh, API ─────────────────────────
vi.mock('../../../../i18n', async () => (await import('../../../../test/realI18n.js')).realI18nModule());

const availabilityState = vi.hoisted(() => ({ value: null }));
vi.mock('../../../../hooks/queries/useChannelAvailability', async (importOriginal) => ({
  ...(await importOriginal()),
  useChannelAvailability: () => availabilityState.value,
}));

vi.mock('../../services/campaignApi.service', () => ({
  default: { previewSimpleCampaign: vi.fn(), createSimpleCampaign: vi.fn(), deleteCampaign: vi.fn() },
}));
vi.mock('../../services/campaignRunApi.service', () => ({
  default: { runCampaign: vi.fn(), createCampaignSchedule: vi.fn() },
}));
vi.mock('../../services/campaignBuilderApi.service', () => ({
  default: {
    getActiveEmailSettings: vi.fn(),
    getZaloAccounts: vi.fn(),
    listForms: vi.fn(),
    checkGoogleSheet: vi.fn(),
    getPreviewZaloGroups: vi.fn(),
  },
}));
vi.mock('../../../templates/services/emailTemplateApi.service', () => ({
  default: { getTemplates: vi.fn(), getTemplateById: vi.fn() },
}));
vi.mock('../../../templates/services/zaloTemplateApi.service', () => ({
  default: { getTemplates: vi.fn(), getTemplateById: vi.fn() },
}));
vi.mock('../../../customers/services/customerApi.service', () => ({ default: { getCustomers: vi.fn() } }));
vi.mock('../../../chatbot/services/chatbotApi.service', () => ({
  default: { getZaloFriends: vi.fn(), syncZaloContacts: vi.fn() },
}));
vi.mock('../../../landing/utils/landingLeadsSlugFilterOptions', () => ({
  fetchLandingLeadsSlugFilterOptions: vi.fn().mockResolvedValue([{ value: 'l', label: 'Landing React (/l)' }]),
}));
vi.mock('react-hot-toast', () => {
  const toastFn = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toastFn, toast: toastFn };
});

// ── Dữ liệu mẫu ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const FORMS = [
  { id: 7, title: 'Đăng ký học thử', submissionCount: 12, settings: { consentEnabled: true } },
];
const GROUPS = [{ groupId: 'g1', groupName: 'Nhóm Khách VIP' }];
const readyPreview = () => ({
  data: { success: true, data: { readyToCreate: true, issues: [], estimate: null, recipientCount: 12, summary: {} } },
});
const created = (id) => ({ data: { success: true, data: { campaignId: String(id), campaignName: 'Chiến dịch từng bước', channel: 'email', recipientCountHint: 12 } } });
const runOk = { data: { success: true, data: { runId: 5, campaignId: '900', status: 'running' } } };
const scheduleOk = { data: { success: true, data: { id: 3 } } };
const OVERLAP_MESSAGE = 'Lịch này sẽ chạy lúc 09:00 20/10 trong khi lượt trước còn chạy tới 11:30. Hãy chọn giờ khác.';
const overlapError = () => ({
  response: {
    status: 409,
    data: { success: false, code: 'SCHEDULE_OVERLAP', message: OVERLAP_MESSAGE, suggestions: ['spread_schedule', 'add_accounts'] },
  },
});

const openAvailability = () => ({
  email: { visible: true, available: true, reason: null, detail: null, used: null, limit: null },
  zalo: { visible: true, available: true, reason: null, detail: null, used: null, limit: null },
  telegram: { visible: false, available: true, reason: null },
  whatsapp: { visible: false, available: true, reason: null },
  adapterChannels: [],
  isLoading: false,
});

const renderPage = () => render(
  <MemoryRouter initialEntries={['/app/campaigns/simple']}>
    <Routes>
      <Route path="/app/campaigns/simple" element={<SimpleCampaign />} />
      <Route path="/app/campaigns" element={<div>DANH-SACH-CHIEN-DICH</div>} />
    </Routes>
  </MemoryRouter>,
);

/** Ngày/giờ Việt Nam cách hiện tại `offsetMinutes` phút: `{ date: 'YYYY-MM-DD', time: 'HH:mm' }`. */
const vietnamWallClock = (offsetMinutes) => {
  const iso = new Date(Date.now() + 7 * 60 * 60 * 1000 + offsetMinutes * 60 * 1000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
};

// ── Các bước điều khiển giao diện ───────────────────────────────────────────────────────────────────────────────────────────
const nextButton = () => screen.getByTestId('simple-next');
const enabledNext = async () => {
  await waitFor(() => expect(nextButton()).toBeEnabled());
  return nextButton();
};

async function chooseChannel(channel) {
  fireEvent.click(await screen.findByTestId(`simple-channel-${channel}`));
  fireEvent.click(await enabledNext());
}

async function chooseFormAudience() {
  fireEvent.click(await screen.findByTestId('simple-audience-form'));
  fireEvent.click(await screen.findByRole('checkbox', { name: /Đăng ký học thử/ }));
  fireEvent.click(await enabledNext());
}

async function chooseManualAudience() {
  fireEvent.click(await screen.findByTestId('simple-audience-manual'));
  fireEvent.change(await screen.findByLabelText('Danh sách email'), { target: { value: 'a@x.vn' } });
  fireEvent.click(await enabledNext());
}

async function chooseGroupAudience() {
  fireEvent.click(await screen.findByRole('checkbox', { name: /Nhóm Khách VIP/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Dùng các nhóm đã chọn' }));
  fireEvent.click(await enabledNext());
}

async function chooseTemplate(name) {
  fireEvent.click(await screen.findByTestId('simple-content-template'));
  fireEvent.click(await screen.findByText('-- Chọn mẫu --'));
  fireEvent.click(await screen.findByText(name));
  fireEvent.click(await enabledNext());
}

/** Email + biểu mẫu + mẫu có sẵn → dừng ở bước "Khi nào gửi?". */
async function reachWhenStepEmailForm() {
  renderPage();
  await chooseChannel('email');
  await chooseFormAudience();
  await chooseTemplate('Ưu đãi tháng 10');
  await screen.findByTestId('simple-when-now');
}

async function pickScheduledTime(wallClock) {
  fireEvent.click(await screen.findByTestId('simple-when-scheduled'));
  fireEvent.change(await screen.findByLabelText('Ngày gửi'), { target: { value: wallClock.date } });
  fireEvent.change(screen.getByLabelText('Giờ gửi'), { target: { value: wallClock.time } });
}

async function goToReview() {
  fireEvent.click(await enabledNext());
  const button = await screen.findByTestId('simple-start');
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

describe('Tạo chiến dịch từng bước (PR-3) — bước "Khi nào gửi?"', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    availabilityState.value = openAvailability();
    campaignBuilderApiService.getActiveEmailSettings.mockResolvedValue({
      data: { data: { items: [{ id: 11, name: 'Shop ABC', email: 'shop@abc.vn', status: 'active' }] } },
    });
    campaignBuilderApiService.getZaloAccounts.mockResolvedValue({
      data: { data: { items: [{ id: 21, displayName: 'Nick A', status: 'connected', isActive: true, isLocked: false }] } },
    });
    campaignBuilderApiService.listForms.mockResolvedValue({ data: { data: FORMS } });
    campaignBuilderApiService.getPreviewZaloGroups.mockResolvedValue({ data: { data: { groups: GROUPS } } });
    emailTemplateApiService.getTemplates.mockResolvedValue({
      data: { data: { items: [{ id: 5, templateName: 'Ưu đãi tháng 10', category: '' }] } },
    });
    emailTemplateApiService.getTemplateById.mockResolvedValue({
      data: { data: { id: 5, templateName: 'Ưu đãi tháng 10', subject: 'Giảm 20%', bodyText: 'Nội dung mẫu' } },
    });
    zaloTemplateApiService.getTemplates.mockResolvedValue({
      data: { data: { items: [{ id: 6, templateName: 'Mẫu Zalo chào mừng', category: '' }] } },
    });
    customerApiService.getCustomers.mockResolvedValue({ data: { data: { items: [], pagination: { total: 1234 } } } });
    chatbotApiService.getZaloFriends.mockResolvedValue({ data: { data: { items: [], total: 0, totalPages: 1, page: 1 } } });
    campaignApiService.previewSimpleCampaign.mockResolvedValue(readyPreview());
    campaignApiService.createSimpleCampaign.mockResolvedValue(created(900));
    campaignApiService.deleteCampaign.mockResolvedValue({ data: { success: true } });
    campaignRunApiService.runCampaign.mockResolvedValue(runOk);
    campaignRunApiService.createCampaignSchedule.mockResolvedValue(scheduleOk);
  });

  describe('thẻ nào hiện', () => {
    it('Email + biểu mẫu: đủ 4 thẻ, "Gửi ngay" chọn sẵn', async () => {
      await reachWhenStepEmailForm();
      for (const id of ['now', 'scheduled', 'continuous', 'recurring']) {
        expect(screen.getByTestId(`simple-when-${id}`)).toBeInTheDocument();
      }
      expect(screen.getByTestId('simple-when-now')).toHaveAttribute('aria-pressed', 'true');
      // Câu mô tả thẻ "tự động" nói đúng sự thật: gửi cho người đang có, rồi kiểm tra người mới.
      expect(screen.getByTestId('simple-when-continuous')).toHaveTextContent('Gửi cho những người đang có trong danh sách');
    });

    it('Email + Tự nhập danh sách: KHÔNG có thẻ "Tự động gửi cho người mới" (danh sách cố định)', async () => {
      renderPage();
      await chooseChannel('email');
      await chooseManualAudience();
      await chooseTemplate('Ưu đãi tháng 10');
      await screen.findByTestId('simple-when-now');
      expect(screen.getByTestId('simple-when-scheduled')).toBeInTheDocument();
      expect(screen.getByTestId('simple-when-recurring')).toBeInTheDocument();
      expect(screen.queryByTestId('simple-when-continuous')).toBeNull();
    });

    it('Zalo nhóm: KHÔNG có thẻ "Tự động gửi cho người mới"', async () => {
      renderPage();
      await chooseChannel('zalo_group');
      await chooseGroupAudience();
      await chooseTemplate('Mẫu Zalo chào mừng');
      await screen.findByTestId('simple-when-now');
      expect(screen.queryByTestId('simple-when-continuous')).toBeNull();
      expect(screen.getByTestId('simple-when-scheduled')).toBeInTheDocument();
    });
  });

  describe('hẹn một thời điểm', () => {
    it('giờ hẹn cách hiện tại dưới 2 phút → Tiếp tục bị khoá và báo lý do; hẹn xa hơn thì mở', async () => {
      await reachWhenStepEmailForm();
      await pickScheduledTime(vietnamWallClock(1));
      expect(await screen.findByTestId('simple-schedule-too-soon')).toHaveTextContent('ít nhất 2 phút');
      expect(nextButton()).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Giờ gửi'), { target: { value: vietnamWallClock(1440).time } });
      fireEvent.change(screen.getByLabelText('Ngày gửi'), { target: { value: vietnamWallClock(1440).date } });
      expect(screen.queryByTestId('simple-schedule-too-soon')).toBeNull();
      expect(nextButton()).toBeEnabled();
    });

    it('Đặt lịch: tạo chiến dịch rồi tạo lịch once đúng cron giờ VN, KHÔNG chạy ngay; màn xong nêu giờ hẹn + link Lịch chạy', async () => {
      await reachWhenStepEmailForm();
      const wall = { date: vietnamWallClock(1440).date, time: '08:30' };
      await pickScheduledTime(wall);
      const start = await goToReview();
      expect(start).toHaveTextContent('Đặt lịch');
      const [year, month, day] = wall.date.split('-');
      expect(screen.getByTestId('simple-summary')).toHaveTextContent(`hẹn gửi lúc 08:30 ngày ${day}/${month}/${year}`);

      // Ước tính theo giờ hẹn: preview mang startAt (08:30 VN = 01:30 UTC), body tạo thì không.
      const previewBody = campaignApiService.previewSimpleCampaign.mock.calls.at(-1)[0];
      expect(previewBody.startAt).toBe(`${wall.date}T01:30:00.000Z`);

      fireEvent.click(start);
      await waitFor(() => expect(campaignRunApiService.createCampaignSchedule).toHaveBeenCalledTimes(1));
      expect(campaignApiService.createSimpleCampaign.mock.calls[0][0]).not.toHaveProperty('startAt');
      expect(campaignRunApiService.createCampaignSchedule).toHaveBeenCalledWith({
        campaignId: '900',
        scheduleName: expect.any(String),
        scheduleType: 'once',
        cronExpression: `30 08 ${Number(day)} ${Number(month)} *`,
        enabled: true,
        activateCampaign: true,
      });
      expect(campaignRunApiService.runCampaign).not.toHaveBeenCalled();

      expect(await screen.findByTestId('simple-scheduled')).toBeInTheDocument();
      expect(screen.getByTestId('simple-scheduled-when')).toHaveTextContent(`hẹn gửi lúc 08:30 ngày ${day}/${month}/${year}`);
      expect(screen.getByText('Đã hẹn gửi')).toBeInTheDocument();
      expect(screen.getByTestId('simple-scheduled-list')).toHaveAttribute('href', '/app/campaigns?tab=schedules');
      expect(screen.queryByText(/Đang gửi chiến dịch/)).toBeNull();
    });
  });

  describe('lặp lại định kỳ', () => {
    it('cảnh báo "gửi lại cho toàn bộ danh sách" luôn hiện ngay khi chọn thẻ, và lặp lại ở màn Xem lại', async () => {
      await reachWhenStepEmailForm();
      expect(screen.queryByTestId('simple-recurring-warning')).toBeNull();
      fireEvent.click(screen.getByTestId('simple-when-recurring'));
      expect(await screen.findByTestId('simple-recurring-warning')).toHaveTextContent('Mỗi lần sẽ gửi lại cho toàn bộ danh sách');
      await goToReview();
      expect(screen.getByTestId('simple-recurring-warning')).toHaveTextContent('toàn bộ danh sách');
    });

    it('hằng tuần Thứ 2 09:00 → lịch weekly cron "00 09 * * 1"; nút "Đặt lịch"; câu tóm tắt nêu thứ + giờ', async () => {
      await reachWhenStepEmailForm();
      fireEvent.click(screen.getByTestId('simple-when-recurring'));
      fireEvent.click(await screen.findByTestId('simple-frequency-weekly'));
      fireEvent.change(screen.getByLabelText('Vào thứ'), { target: { value: '1' } });
      fireEvent.change(screen.getByLabelText('Lúc'), { target: { value: '09:00' } });
      const start = await goToReview();
      expect(start).toHaveTextContent('Đặt lịch');
      expect(screen.getByTestId('simple-summary')).toHaveTextContent('gửi lặp lại hằng tuần vào Thứ 2 lúc 09:00');

      fireEvent.click(start);
      await waitFor(() => expect(campaignRunApiService.createCampaignSchedule).toHaveBeenCalledTimes(1));
      expect(campaignRunApiService.createCampaignSchedule).toHaveBeenCalledWith(expect.objectContaining({
        campaignId: '900',
        scheduleType: 'weekly',
        cronExpression: '00 09 * * 1',
        enabled: true,
        activateCampaign: true,
      }));
      expect(campaignRunApiService.runCampaign).not.toHaveBeenCalled();
      expect(await screen.findByTestId('simple-scheduled')).toBeInTheDocument();
      expect(screen.getByTestId('simple-scheduled-when')).toHaveTextContent('hằng tuần vào Thứ 2 lúc 09:00');
    });

    it('hằng tháng: nhắc chỉ ngày 1; cron "15 07 1 * *"', async () => {
      await reachWhenStepEmailForm();
      fireEvent.click(screen.getByTestId('simple-when-recurring'));
      fireEvent.click(await screen.findByTestId('simple-frequency-monthly'));
      expect(screen.getByText('Hằng tháng gửi vào ngày 1 của mỗi tháng.')).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Lúc'), { target: { value: '07:15' } });
      fireEvent.click(await goToReview());
      await waitFor(() => expect(campaignRunApiService.createCampaignSchedule).toHaveBeenCalledTimes(1));
      expect(campaignRunApiService.createCampaignSchedule.mock.calls[0][0]).toMatchObject({ scheduleType: 'monthly', cronExpression: '15 07 1 * *' });
    });
  });

  describe('tự động gửi cho người mới', () => {
    it('chạy với continuousMode + chu kỳ quét mặc định 120–300 phút; preview mang continuous:true; vẫn là "Bắt đầu gửi"', async () => {
      await reachWhenStepEmailForm();
      fireEvent.click(screen.getByTestId('simple-when-continuous'));
      expect(await screen.findByTestId('simple-when-continuous-panel')).toHaveTextContent(/khoảng \d+ phút/);
      const start = await goToReview();
      expect(start).toHaveTextContent('Bắt đầu gửi');
      expect(campaignApiService.previewSimpleCampaign.mock.calls.at(-1)[0].continuous).toBe(true);

      fireEvent.click(start);
      await waitFor(() => expect(campaignRunApiService.runCampaign).toHaveBeenCalledTimes(1));
      const [id, body] = campaignRunApiService.runCampaign.mock.calls[0];
      expect(id).toBe('900');
      expect(body).toMatchObject({ source: 'campaign_run', autoActivate: true, continuousMode: true });
      expect(body.pollIntervalMinutes).toBeGreaterThanOrEqual(120);
      expect(body.pollIntervalMinutes).toBeLessThanOrEqual(300);
      expect(body.pollIntervalMs).toBe(body.pollIntervalMinutes * 60 * 1000);
      expect(body.continuousCycleMinutes).toBe(body.pollIntervalMinutes);
      expect(campaignRunApiService.createCampaignSchedule).not.toHaveBeenCalled();
      expect(await screen.findByTestId('simple-done')).toBeInTheDocument();
    });
  });

  describe('lỗi khi đặt lịch', () => {
    it('409 SCHEDULE_OVERLAP → hiện NGUYÊN câu server + gợi ý, không toast chung; giữ id nháp, lần bấm sau xoá nháp cũ rồi mới tạo lại', async () => {
      await reachWhenStepEmailForm();
      await pickScheduledTime({ date: vietnamWallClock(1440).date, time: '09:00' });
      const start = await goToReview();

      campaignRunApiService.createCampaignSchedule.mockRejectedValueOnce(overlapError());
      fireEvent.click(start);
      const alert = await screen.findByTestId('simple-submit-error');
      expect(alert).toHaveTextContent(OVERLAP_MESSAGE);
      const suggestions = screen.getByTestId('simple-overlap-suggestions');
      expect(suggestions).toHaveTextContent('Giãn lịch ra xa hơn.');
      expect(suggestions).toHaveTextContent('Thêm tài khoản gửi để chia sức gửi.');
      expect(toast.error).not.toHaveBeenCalled();
      expect(campaignApiService.deleteCampaign).not.toHaveBeenCalled();
      // Vẫn ở màn Xem lại, nút vẫn là "Đặt lịch" để thử lại.
      expect(screen.getByTestId('simple-start')).toHaveTextContent('Đặt lịch');

      campaignApiService.createSimpleCampaign.mockResolvedValueOnce(created(901));
      fireEvent.click(await screen.findByTestId('simple-start'));
      await waitFor(() => expect(campaignRunApiService.createCampaignSchedule).toHaveBeenCalledTimes(2));
      expect(campaignApiService.deleteCampaign).toHaveBeenCalledTimes(1);
      expect(campaignApiService.deleteCampaign).toHaveBeenCalledWith('900');
      expect(campaignApiService.deleteCampaign.mock.invocationCallOrder[0])
        .toBeLessThan(campaignApiService.createSimpleCampaign.mock.invocationCallOrder[1]);
      expect(campaignRunApiService.createCampaignSchedule.mock.calls[1][0].campaignId).toBe('901');
      expect(await screen.findByTestId('simple-scheduled')).toBeInTheDocument();
    });

    it('lỗi đặt lịch khác (không phải chồng lịch) → hiện message của server', async () => {
      await reachWhenStepEmailForm();
      await pickScheduledTime({ date: vietnamWallClock(1440).date, time: '09:00' });
      const start = await goToReview();
      campaignRunApiService.createCampaignSchedule.mockRejectedValueOnce({
        response: { status: 400, data: { success: false, message: 'Biểu thức cron không hợp lệ' } },
      });
      fireEvent.click(start);
      expect(await screen.findByTestId('simple-submit-error')).toHaveTextContent('Biểu thức cron không hợp lệ');
      expect(screen.queryByTestId('simple-overlap-suggestions')).toBeNull();
    });
  });
});
