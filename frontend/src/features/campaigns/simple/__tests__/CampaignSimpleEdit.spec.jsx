import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CampaignSimpleEdit from '../../../../pages/campaigns/CampaignSimpleEdit';
import campaignApiService from '../../services/campaignApi.service';
import campaignRunApiService from '../../services/campaignRunApi.service';
import campaignBuilderApiService from '../../services/campaignBuilderApi.service';
import emailTemplateApiService from '../../../templates/services/emailTemplateApi.service';
import zaloTemplateApiService from '../../../templates/services/zaloTemplateApi.service';
import customerApiService from '../../../customers/services/customerApi.service';
import chatbotApiService from '../../../chatbot/services/chatbotApi.service';

// PLAN_HAI_TAB_TUNG_BUOC_SO_DO_2026-10-17, PR-B: tab Từng bước của MỘT chiến dịch đã có (chế độ sửa). API mock theo hợp đồng §3.1.

vi.mock('../../../../i18n', async () => (await import('../../../../test/realI18n.js')).realI18nModule());

const availabilityState = vi.hoisted(() => ({ value: null }));
vi.mock('../../../../hooks/queries/useChannelAvailability', async (importOriginal) => ({
  ...(await importOriginal()),
  useChannelAvailability: () => availabilityState.value,
}));

const authState = vi.hoisted(() => ({ activeContext: null }));
vi.mock('../../../../stores/authStore', () => ({ useAuthStore: () => ({ activeContext: authState.activeContext }) }));

vi.mock('../../services/campaignApi.service', () => ({
  default: { previewSimpleCampaign: vi.fn(), getSimpleCampaign: vi.fn(), updateSimpleCampaign: vi.fn() },
}));
vi.mock('../../services/campaignRunApi.service', () => ({
  default: {
    runCampaign: vi.fn(),
    createCampaignSchedule: vi.fn(),
    updateCampaignSchedule: vi.fn(),
    deleteCampaignSchedule: vi.fn(),
  },
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
vi.mock('../../../landing-pages/services/landingPagesAdminApi.service', () => ({
  fetchLandingPagesAdminList: vi.fn().mockResolvedValue([]),
}));
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toast, toast };
});

// ── Dữ liệu mẫu ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const baseData = () => ({
  editable: true,
  readOnlyReasons: [],
  running: false,
  campaignName: 'Chiến dịch A',
  channel: 'email',
  status: 'draft',
  form: {
    senderId: 11,
    audience: { type: 'manual', emails: ['a@x.vn', 'b@x.vn'] },
    content: { mode: 'custom', subject: 'Chào', body: 'Nội dung gốc' },
    followUps: [],
  },
  schedules: [],
});
const getResponse = (patch = {}) => ({ data: { success: true, data: { ...baseData(), ...patch } } });
const readyPreview = (patch = {}) => ({
  data: { success: true, data: { readyToCreate: true, issues: [], estimate: null, recipientCount: 2, summary: {}, ...patch } },
});
const apiError = (message, status = 409, extra = {}) => ({ response: { status, data: { success: false, message, ...extra } } });

const openAvailability = () => ({
  email: { visible: true, available: true, reason: null, detail: null, used: null, limit: null },
  zalo: { visible: true, available: true, reason: null, detail: null, used: null, limit: null },
  telegram: { visible: false, available: true, reason: null },
  whatsapp: { visible: false, available: true, reason: null },
  adapterChannels: [],
  isLoading: false,
});

const renderEdit = (path = '/app/campaigns/7/simple') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/app/campaigns/:id/simple" element={<CampaignSimpleEdit />} />
      <Route path="/app/campaigns/:id/builder" element={<div>TRANG-SO-DO-KHOI</div>} />
      <Route path="/app/campaigns" element={<div>DANH-SACH-CHIEN-DICH</div>} />
    </Routes>
  </MemoryRouter>,
);

const openStep = (id) => fireEvent.click(within(screen.getByTestId(`simple-step-${id}`)).getByRole('button'));
const saveButton = () => screen.getByTestId('simple-edit-save');
const waitReviewReady = async () => {
  await screen.findByTestId('simple-summary');
  await waitFor(() => expect(screen.getByTestId('simple-edit-save-run')).toBeEnabled());
};

/** Đổi nội dung tự soạn (bước Nội dung) rồi quay về bước Xem lại — tạo "thay đổi chưa lưu". */
async function makeDirtyAndReturnToReview(newBody = 'Nội dung mới') {
  await screen.findByTestId('simple-summary');
  openStep('content');
  fireEvent.change(await screen.findByLabelText('Nội dung', { selector: 'textarea' }), { target: { value: newBody } });
  openStep('review');
  await waitFor(() => expect(saveButton()).toBeEnabled());
}

const futureDate = () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe('Chi tiết chiến dịch — tab Từng bước (chế độ sửa)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authState.activeContext = null;
    availabilityState.value = openAvailability();
    campaignBuilderApiService.getActiveEmailSettings.mockResolvedValue({
      data: { data: { items: [{ id: 11, name: 'Shop ABC', email: 'shop@abc.vn', status: 'active' }] } },
    });
    campaignBuilderApiService.getZaloAccounts.mockResolvedValue({ data: { data: { items: [] } } });
    campaignBuilderApiService.listForms.mockResolvedValue({ data: { data: [] } });
    emailTemplateApiService.getTemplates.mockResolvedValue({
      data: { data: { items: [{ id: 5, templateName: 'Ưu đãi tháng 10', category: '' }] } },
    });
    zaloTemplateApiService.getTemplates.mockResolvedValue({ data: { data: { items: [] } } });
    customerApiService.getCustomers.mockResolvedValue({ data: { data: { items: [], pagination: { total: 3 } } } });
    chatbotApiService.getZaloFriends.mockResolvedValue({ data: { data: { items: [], total: 0, totalPages: 1, page: 1 } } });
    campaignApiService.getSimpleCampaign.mockResolvedValue(getResponse());
    campaignApiService.previewSimpleCampaign.mockResolvedValue(readyPreview());
    campaignApiService.updateSimpleCampaign.mockResolvedValue({ data: { success: true, data: { campaignId: '7' } } });
    campaignRunApiService.runCampaign.mockResolvedValue({ data: { success: true, data: { runId: 5 } } });
    campaignRunApiService.createCampaignSchedule.mockResolvedValue({ data: { success: true } });
    campaignRunApiService.updateCampaignSchedule.mockResolvedValue({ data: { success: true } });
    campaignRunApiService.deleteCampaignSchedule.mockResolvedValue({ data: { success: true } });
  });

  describe('mở chiến dịch sửa được', () => {
    it('gọi GET đúng id, điền sẵn mọi bước, mở ở bước Xem lại với câu tóm tắt có tên tài khoản và tiêu đề thư', async () => {
      renderEdit();
      const summary = await screen.findByTestId('simple-summary');
      expect(campaignApiService.getSimpleCampaign).toHaveBeenCalledWith('7');
      await waitFor(() => expect(summary).toHaveTextContent('shop@abc.vn'));
      expect(summary).toHaveTextContent('Chào');
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chiến dịch A');
      expect(screen.getByLabelText('Tên chiến dịch')).toHaveValue('Chiến dịch A');
      // Chưa đổi gì → không có gì để lưu; hai nút chạy vẫn dùng được.
      expect(saveButton()).toBeDisabled();
      expect(screen.queryByTestId('simple-edit-dirty')).not.toBeInTheDocument();
    });

    it('thanh bước nhảy tự do (kể cả tới bước chưa qua) và mỗi bước đã điền sẵn từ server', async () => {
      renderEdit();
      await screen.findByTestId('simple-summary');
      openStep('audience');
      expect(await screen.findByDisplayValue(/a@x\.vn/)).toBeInTheDocument();
      openStep('content');
      expect(await screen.findByDisplayValue('Nội dung gốc')).toBeInTheDocument();
      expect(screen.getByLabelText('Tiêu đề thư')).toHaveValue('Chào');
      openStep('channel');
      const account = await screen.findByTestId('simple-sender-11');
      expect(within(account).getByRole('button', { pressed: true })).toHaveTextContent('shop@abc.vn');
      // Kênh của chiến dịch đã tạo không đổi được.
      expect(screen.getByTestId('simple-channel-edit-note')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('simple-channel-zalo'));
      expect(screen.getByTestId('simple-channel-email')).toHaveAttribute('aria-pressed', 'true');
    });

    it('sửa nội dung → hiện "Chưa lưu"; Lưu thay đổi gửi PUT đúng id + đúng body, rồi nạp lại từ server', async () => {
      renderEdit();
      await makeDirtyAndReturnToReview('Nội dung mới');
      expect(screen.getByTestId('simple-edit-dirty')).toBeInTheDocument();
      fireEvent.click(saveButton());

      await waitFor(() => expect(campaignApiService.updateSimpleCampaign).toHaveBeenCalledTimes(1));
      expect(campaignApiService.updateSimpleCampaign).toHaveBeenCalledWith('7', {
        channel: 'email',
        senderId: 11,
        audience: { type: 'manual', emails: ['a@x.vn', 'b@x.vn'] },
        content: { mode: 'custom', subject: 'Chào', body: 'Nội dung mới' },
        campaignName: 'Chiến dịch A',
      });
      // Không đụng lịch khi lịch không đổi.
      expect(campaignRunApiService.createCampaignSchedule).not.toHaveBeenCalled();
      expect(campaignRunApiService.updateCampaignSchedule).not.toHaveBeenCalled();
      expect(campaignRunApiService.deleteCampaignSchedule).not.toHaveBeenCalled();
      await waitFor(() => expect(campaignApiService.getSimpleCampaign).toHaveBeenCalledTimes(2));
      expect(await screen.findByTestId('simple-edit-saved')).toBeInTheDocument();
      expect(screen.queryByTestId('simple-edit-dirty')).not.toBeInTheDocument();
    });

    it('tin sau chờ theo phút: nạp lại đúng đơn vị phút (không rơi về ngày) và tóm tắt "trong 30 phút"', async () => {
      const followUps = [{ delayValue: 30, delayUnit: 'minutes', content: { mode: 'template', templateId: 5 } }];
      campaignApiService.getSimpleCampaign.mockResolvedValue(getResponse({ form: { ...baseData().form, followUps } }));
      renderEdit();
      await screen.findByTestId('simple-summary');
      expect(screen.getByTestId('simple-summary')).toHaveTextContent('chuỗi 2 tin trong 30 phút');
      openStep('content');
      expect(await screen.findByTestId('simple-followup-unit-0')).toHaveValue('minutes');
      expect(screen.getByTestId('simple-followup-delay-0')).toHaveValue(30);
    });

    it('chiến dịch nhiều tin: nạp followUps thành thẻ tin sau (có tên mẫu), sửa độ trễ tin 2 rồi PUT gửi lại đúng', async () => {
      const followUps = [
        { delayValue: 2, delayUnit: 'days', content: { mode: 'template', templateId: 5 } },
        { delayValue: 3, delayUnit: 'hours', content: { mode: 'custom', subject: 'Tiêu đề 3', body: 'Thân tin 3' } },
      ];
      campaignApiService.getSimpleCampaign.mockResolvedValue(getResponse({ form: { ...baseData().form, followUps } }));
      renderEdit();
      await screen.findByTestId('simple-summary');
      expect(screen.getByTestId('simple-summary')).toHaveTextContent('chuỗi 3 tin trong 3 ngày');
      openStep('content');
      // Hết ghi chú "chỉ sửa được tin đầu".
      expect(screen.queryByTestId('simple-followups-note')).not.toBeInTheDocument();
      expect(await screen.findByTestId('simple-followup-0')).toHaveTextContent('Tin 2');
      expect(screen.getByTestId('simple-followup-1')).toHaveTextContent('Tin 3');
      expect(screen.getByTestId('simple-followup-delay-0')).toHaveValue(2);
      expect(screen.getByTestId('simple-followup-unit-1')).toHaveValue('hours');
      expect(screen.getByDisplayValue('Thân tin 3')).toBeInTheDocument();

      fireEvent.change(screen.getByTestId('simple-followup-delay-0'), { target: { value: '4' } });
      openStep('review');
      await waitFor(() => expect(saveButton()).toBeEnabled());
      fireEvent.click(saveButton());

      await waitFor(() => expect(campaignApiService.updateSimpleCampaign).toHaveBeenCalledTimes(1));
      const [, body] = campaignApiService.updateSimpleCampaign.mock.calls[0];
      expect(body.followUps).toEqual([
        { delayValue: 4, delayUnit: 'days', content: { mode: 'template', templateId: 5 } },
        { delayValue: 3, delayUnit: 'hours', content: { mode: 'custom', subject: 'Tiêu đề 3', body: 'Thân tin 3' } },
      ]);
      expect(body.content.body).toBe('Nội dung gốc');
    });

    describe('tên mẫu khi mở lại chiến dịch (mẫu server tự tạo, không nằm trong danh sách mẫu)', () => {
      const templated = () => getResponse({
        form: {
          ...baseData().form,
          content: { mode: 'template', templateId: 7 },
          followUps: [{ delayValue: 2, delayUnit: 'days', content: { mode: 'template', templateId: 8 } }],
        },
      });

      it('câu tóm tắt ở bước Xem lại nêu TIÊU ĐỀ của mẫu email (tra theo id), không bao giờ ghi "#7"; thẻ mẫu của tin 1 và tin sau cũng hiện đúng tên', async () => {
        campaignApiService.getSimpleCampaign.mockResolvedValue(templated());
        emailTemplateApiService.getTemplateById.mockImplementation(async (id) => ({
          data: { data: id === 7
            ? { id: 7, templateName: 'Email – 17/10/2026 15:39', subject: 'Tin 1 - chào' }
            : { id: 8, templateName: 'Email – 17/10/2026 15:39', subject: 'Tin 2 - nhắc' } },
        }));
        renderEdit();
        const summary = await screen.findByTestId('simple-summary');
        await waitFor(() => expect(summary).toHaveTextContent('“Tin 1 - chào”'));
        expect(summary).not.toHaveTextContent('#7');
        expect(emailTemplateApiService.getTemplateById).toHaveBeenCalledWith(7);
        expect(emailTemplateApiService.getTemplateById).toHaveBeenCalledWith(8);

        openStep('content');
        expect(await within(screen.getByTestId('simple-content-panel')).findByText('Tin 1 - chào')).toBeInTheDocument();
        expect(await within(screen.getByTestId('simple-followup-0')).findByText('Tin 2 - nhắc')).toBeInTheDocument();
      });

      it('tra tên mẫu thất bại → ghi "mẫu đã chọn", tuyệt đối không ghi "#7"', async () => {
        campaignApiService.getSimpleCampaign.mockResolvedValue(templated());
        emailTemplateApiService.getTemplateById.mockRejectedValue(new Error('boom'));
        renderEdit();
        const summary = await screen.findByTestId('simple-summary');
        await waitFor(() => expect(summary).toHaveTextContent('mẫu đã chọn'));
        expect(summary).not.toHaveTextContent('#7');
        openStep('content');
        expect(await within(screen.getByTestId('simple-content-panel')).findByText('Mẫu đã chọn')).toBeInTheDocument();
      });
    });

    it('chế độ sửa: tiêu đề bước cuối là "Xem lại và lưu"; nút thêm tin không lặp dấu cộng', async () => {
      renderEdit();
      await screen.findByTestId('simple-summary');
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Xem lại và lưu');
      openStep('content');
      expect((await screen.findByTestId('simple-followup-add')).textContent.trim()).toBe('Thêm tin tiếp theo');
    });

    it('PUT bị từ chối (409) → hiện câu của server, KHÔNG đụng lịch, vẫn còn "Chưa lưu"', async () => {
      campaignApiService.updateSimpleCampaign.mockRejectedValue(apiError('Chiến dịch đang chạy, chưa sửa được.'));
      renderEdit();
      await makeDirtyAndReturnToReview();
      fireEvent.click(saveButton());
      expect(await screen.findByTestId('simple-submit-error')).toHaveTextContent('Chiến dịch đang chạy, chưa sửa được.');
      expect(campaignRunApiService.createCampaignSchedule).not.toHaveBeenCalled();
      expect(screen.getByTestId('simple-edit-dirty')).toBeInTheDocument();
    });

    it('thiếu thông tin ở một bước → khoá Lưu và nói rõ bước nào còn thiếu', async () => {
      renderEdit();
      await screen.findByTestId('simple-summary');
      openStep('content');
      fireEvent.change(await screen.findByLabelText('Nội dung', { selector: 'textarea' }), { target: { value: '   ' } });
      openStep('review');
      expect(await screen.findByTestId('simple-edit-incomplete')).toHaveTextContent('Nội dung');
      expect(saveButton()).toBeDisabled();
      expect(screen.getByTestId('simple-edit-save-run')).toBeDisabled();
    });
  });

  describe('bước "Khi nào gửi?" ở chế độ sửa — đúng một lịch', () => {
    it('chiến dịch chưa có lịch: chỉ có 3 lựa chọn Chạy tay / Hẹn một thời điểm / Lặp lại, không có "Gửi ngay" hay "Tự động"', async () => {
      renderEdit();
      await screen.findByTestId('simple-summary');
      openStep('when');
      expect(await screen.findByTestId('simple-when-now')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('simple-when-scheduled')).toBeInTheDocument();
      expect(screen.getByTestId('simple-when-recurring')).toBeInTheDocument();
      expect(screen.queryByTestId('simple-when-continuous')).not.toBeInTheDocument();
      expect(screen.getByTestId('simple-when-now')).toHaveTextContent('Chạy tay');
    });

    it('thêm lịch: chọn Hẹn một thời điểm → lưu gọi createCampaignSchedule đúng chiến dịch, kiểu once, cron đúng ngày giờ', async () => {
      renderEdit();
      await screen.findByTestId('simple-summary');
      openStep('when');
      fireEvent.click(await screen.findByTestId('simple-when-scheduled'));
      const date = futureDate();
      fireEvent.change(document.getElementById('simple-schedule-date'), { target: { value: date } });
      fireEvent.change(document.getElementById('simple-schedule-time'), { target: { value: '10:30' } });
      openStep('review');
      await waitFor(() => expect(saveButton()).toBeEnabled());
      fireEvent.click(saveButton());

      await waitFor(() => expect(campaignRunApiService.createCampaignSchedule).toHaveBeenCalledTimes(1));
      const [, month, day] = date.match(/^\d{4}-(\d{2})-(\d{2})$/);
      expect(campaignRunApiService.createCampaignSchedule).toHaveBeenCalledWith(expect.objectContaining({
        campaignId: '7',
        scheduleName: 'Chiến dịch A',
        scheduleType: 'once',
        cronExpression: `30 10 ${Number(day)} ${Number(month)} *`,
        enabled: true,
      }));
      expect(campaignApiService.updateSimpleCampaign).toHaveBeenCalledTimes(1);
      expect(campaignRunApiService.updateCampaignSchedule).not.toHaveBeenCalled();
      expect(campaignRunApiService.deleteCampaignSchedule).not.toHaveBeenCalled();
    });

    const withDailySchedule = () => campaignApiService.getSimpleCampaign.mockResolvedValue(getResponse({
      schedules: [{ id: 55, scheduleType: 'daily', cronExpression: '00 09 * * *', enabled: true }],
    }));

    it('đã có lịch hằng ngày 09:00: bước này điền sẵn "Lặp lại / Hằng ngày"; đổi sang hằng tuần → updateCampaignSchedule đúng id, KHÔNG tạo mới', async () => {
      withDailySchedule();
      renderEdit();
      await screen.findByTestId('simple-summary');
      openStep('when');
      expect(await screen.findByTestId('simple-when-recurring')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('simple-frequency-daily')).toHaveAttribute('aria-pressed', 'true');
      expect(document.getElementById('simple-recurring-time')).toHaveValue('09:00');
      fireEvent.click(screen.getByTestId('simple-frequency-weekly'));
      openStep('review');
      await waitFor(() => expect(saveButton()).toBeEnabled());
      fireEvent.click(saveButton());

      await waitFor(() => expect(campaignRunApiService.updateCampaignSchedule).toHaveBeenCalledTimes(1));
      expect(campaignRunApiService.updateCampaignSchedule).toHaveBeenCalledWith(55, {
        scheduleType: 'weekly',
        cronExpression: '00 09 * * 1',
      });
      expect(campaignRunApiService.createCampaignSchedule).not.toHaveBeenCalled();
      expect(campaignRunApiService.deleteCampaignSchedule).not.toHaveBeenCalled();
    });

    it('đã có lịch, chọn Chạy tay → báo "lịch sẽ bị xoá", lưu gọi deleteCampaignSchedule đúng id', async () => {
      withDailySchedule();
      renderEdit();
      await screen.findByTestId('simple-summary');
      openStep('when');
      fireEvent.click(await screen.findByTestId('simple-when-now'));
      expect(screen.getByTestId('simple-edit-schedule-delete-note')).toBeInTheDocument();
      openStep('review');
      await waitFor(() => expect(saveButton()).toBeEnabled());
      fireEvent.click(saveButton());

      await waitFor(() => expect(campaignRunApiService.deleteCampaignSchedule).toHaveBeenCalledWith(55));
      expect(campaignRunApiService.createCampaignSchedule).not.toHaveBeenCalled();
      expect(campaignRunApiService.updateCampaignSchedule).not.toHaveBeenCalled();
    });

    it('đổi lịch bị 409 SCHEDULE_OVERLAP → hiện nguyên câu của server + gợi ý; nội dung đã lưu nên chỉ còn lịch lệch', async () => {
      withDailySchedule();
      campaignRunApiService.updateCampaignSchedule.mockRejectedValue(
        apiError('Lịch này trùng giờ với chiến dịch khác.', 409, { code: 'SCHEDULE_OVERLAP', suggestions: [] }),
      );
      renderEdit();
      await screen.findByTestId('simple-summary');
      openStep('when');
      fireEvent.click(await screen.findByTestId('simple-frequency-monthly'));
      openStep('review');
      await waitFor(() => expect(saveButton()).toBeEnabled());
      fireEvent.click(saveButton());

      expect(await screen.findByTestId('simple-submit-error')).toHaveTextContent('Lịch này trùng giờ với chiến dịch khác.');
      expect(campaignApiService.updateSimpleCampaign).toHaveBeenCalledTimes(1);
    });

    it('từ 2 lịch trở lên: bước này chỉ xem (không có thẻ chọn), lưu nội dung KHÔNG đụng lịch nào', async () => {
      campaignApiService.getSimpleCampaign.mockResolvedValue(getResponse({
        readOnlyReasons: [{ code: 'multiple_schedules', message: 'Chiến dịch có nhiều lịch.' }],
        schedules: [
          { id: 1, scheduleType: 'daily', cronExpression: '00 09 * * *', enabled: true },
          { id: 2, scheduleType: 'weekly', cronExpression: '00 10 * * 1', enabled: true },
        ],
      }));
      renderEdit();
      await makeDirtyAndReturnToReview();
      openStep('when');
      expect(await screen.findByTestId('simple-edit-schedule-locked')).toBeInTheDocument();
      expect(screen.queryByTestId('simple-when-scheduled')).not.toBeInTheDocument();
      openStep('review');
      await waitFor(() => expect(saveButton()).toBeEnabled());
      fireEvent.click(saveButton());
      await waitFor(() => expect(campaignApiService.updateSimpleCampaign).toHaveBeenCalledTimes(1));
      expect(campaignRunApiService.createCampaignSchedule).not.toHaveBeenCalled();
      expect(campaignRunApiService.updateCampaignSchedule).not.toHaveBeenCalled();
      expect(campaignRunApiService.deleteCampaignSchedule).not.toHaveBeenCalled();
    });
  });

  describe('Lưu và gửi ngay / Lưu và tự động gửi', () => {
    it('Lưu và gửi ngay: PUT trước, rồi runCampaign đúng id với autoActivate; màn "Đang gửi" có nút quay lại chiến dịch', async () => {
      renderEdit();
      await waitReviewReady();
      fireEvent.click(screen.getByTestId('simple-edit-save-run'));

      await waitFor(() => expect(campaignRunApiService.runCampaign).toHaveBeenCalledTimes(1));
      expect(campaignRunApiService.runCampaign).toHaveBeenCalledWith('7', { source: 'campaign_run', autoActivate: true, runName: 'Chiến dịch A' });
      expect(campaignApiService.updateSimpleCampaign.mock.invocationCallOrder[0])
        .toBeLessThan(campaignRunApiService.runCampaign.mock.invocationCallOrder[0]);
      expect(await screen.findByTestId('simple-done')).toBeInTheDocument();
      expect(screen.getByTestId('simple-done-builder')).toHaveTextContent('Quay lại chiến dịch');
    });

    it('server trả requiresApproval → màn "chờ duyệt", KHÔNG báo đang gửi', async () => {
      campaignRunApiService.runCampaign.mockResolvedValue({ data: { success: true, data: { requiresApproval: true } } });
      renderEdit();
      await waitReviewReady();
      fireEvent.click(screen.getByTestId('simple-edit-save-run'));
      expect(await screen.findByTestId('simple-approval')).toBeInTheDocument();
      expect(screen.queryByTestId('simple-done')).not.toBeInTheDocument();
    });

    it('PUT lỗi thì KHÔNG chạy chiến dịch', async () => {
      campaignApiService.updateSimpleCampaign.mockRejectedValue(apiError('Không lưu được.'));
      renderEdit();
      await waitReviewReady();
      fireEvent.click(screen.getByTestId('simple-edit-save-run'));
      expect(await screen.findByTestId('simple-submit-error')).toHaveTextContent('Không lưu được.');
      expect(campaignRunApiService.runCampaign).not.toHaveBeenCalled();
    });

    it('nút "Lưu và tự động gửi cho người mới" chỉ có khi nguồn người nhận cho phép (landing/biểu mẫu/sheet); chạy với continuousMode', async () => {
      // Nguồn tự nhập: không có nút.
      const first = renderEdit();
      await waitReviewReady();
      expect(screen.queryByTestId('simple-edit-save-continuous')).not.toBeInTheDocument();
      first.unmount();

      campaignApiService.getSimpleCampaign.mockResolvedValue(getResponse({
        form: { ...baseData().form, audience: { type: 'landing', slugs: ['khoa-hoc'] } },
      }));
      renderEdit();
      await waitReviewReady();
      fireEvent.click(await screen.findByTestId('simple-edit-save-continuous'));
      await waitFor(() => expect(campaignRunApiService.runCampaign).toHaveBeenCalledTimes(1));
      expect(campaignRunApiService.runCampaign).toHaveBeenCalledWith('7', expect.objectContaining({ continuousMode: true, autoActivate: true }));
    });

    it('nhân viên không có quyền chạy chiến dịch (campaigns_run): không thấy hai nút chạy, vẫn lưu được', async () => {
      authState.activeContext = { type: 'employee', permissions: { campaigns_create: true, campaigns_run: false } };
      renderEdit();
      await makeDirtyAndReturnToReview();
      expect(screen.queryByTestId('simple-edit-save-run')).not.toBeInTheDocument();
      expect(screen.queryByTestId('simple-edit-save-continuous')).not.toBeInTheDocument();
      expect(saveButton()).toBeEnabled();
    });
  });

  describe('chiến dịch không sửa được ở đây — chỉ xem', () => {
    const notSimple = () => getResponse({
      editable: false,
      readOnlyReasons: [{ code: 'not_simple', message: 'Chiến dịch có khối nâng cao: Rẽ nhánh.' }],
    });

    it('editable:false → câu tóm tắt, lý do bằng lời thường, nút lớn "Mở Sơ đồ khối để sửa"; KHÔNG có nút lưu / tiếp tục / thanh bước', async () => {
      campaignApiService.getSimpleCampaign.mockResolvedValue(notSimple());
      renderEdit();
      const view = await screen.findByTestId('simple-readonly');
      // Phụ đề đầu trang đúng ngữ cảnh chỉ xem (không còn "Sửa từng phần rồi lưu").
      expect(screen.getByText(/Xem chiến dịch theo từng bước/)).toBeInTheDocument();
      expect(screen.queryByText(/Sửa từng phần rồi lưu/)).not.toBeInTheDocument();
      expect(within(view).getByTestId('simple-readonly-reasons')).toHaveTextContent('Chiến dịch có khối nâng cao: Rẽ nhánh.');
      await waitFor(() => expect(within(view).getByTestId('simple-readonly-summary')).toHaveTextContent('shop@abc.vn'));
      expect(within(view).getByTestId('simple-readonly-open-builder')).toHaveTextContent('Mở Sơ đồ khối để sửa');
      expect(screen.queryByTestId('simple-edit-save')).not.toBeInTheDocument();
      expect(screen.queryByTestId('simple-edit-save-run')).not.toBeInTheDocument();
      expect(screen.queryByTestId('simple-next')).not.toBeInTheDocument();
      expect(screen.queryByTestId('simple-step-content')).not.toBeInTheDocument();
      expect(campaignApiService.previewSimpleCampaign).not.toHaveBeenCalled();
    });

    it('bấm "Mở Sơ đồ khối để sửa" sang tab Sơ đồ khối', async () => {
      campaignApiService.getSimpleCampaign.mockResolvedValue(notSimple());
      renderEdit();
      fireEvent.click(await screen.findByTestId('simple-readonly-open-builder'));
      expect(await screen.findByText('TRANG-SO-DO-KHOI')).toBeInTheDocument();
    });

    it('form = null (không đọc ngược được) vẫn mở được: không có tóm tắt, có lý do và nút sang Sơ đồ khối', async () => {
      campaignApiService.getSimpleCampaign.mockResolvedValue(getResponse({
        editable: false,
        form: null,
        readOnlyReasons: [{ code: 'not_simple', message: 'Chiến dịch dùng khối mà trình từng bước chưa có.' }],
      }));
      renderEdit();
      const view = await screen.findByTestId('simple-readonly');
      expect(within(view).queryByTestId('simple-readonly-summary')).not.toBeInTheDocument();
      expect(within(view).getByTestId('simple-readonly-reasons')).toHaveTextContent('chưa có');
      expect(within(view).getByTestId('simple-readonly-open-builder')).toBeInTheDocument();
    });

    it('form = null nhưng có view (chỉ vì nhịp chờ): hiện tóm tắt + danh sách tin với tên mẫu tra theo id; vẫn không có nút lưu', async () => {
      emailTemplateApiService.getTemplateById.mockImplementation(async (id) => ({
        data: { data: { id, templateName: `Mẫu ${id}`, subject: id === 5 ? 'Ưu đãi' : '' } },
      }));
      campaignApiService.getSimpleCampaign.mockResolvedValue(getResponse({
        editable: false,
        form: null,
        view: {
          senderId: 11,
          audience: { type: 'manual', emails: ['a@x.vn'] },
          content: { mode: 'template', templateId: 5 },
          firstStepDelay: { delayValue: 0, delayUnit: '', delayFrom: '' },
          followUps: [{ delayValue: 30, delayUnit: 'minutes', delayFrom: 'start', content: { mode: 'template', templateId: 6 } }],
        },
        readOnlyReasons: [{ code: 'delay_from_start', message: 'Đếm từ tin đầu.' }],
      }));
      renderEdit();
      const view = await screen.findByTestId('simple-readonly');
      await waitFor(() => expect(within(view).getByTestId('simple-readonly-steps')).toHaveTextContent('Tin 1 · Ưu đãi · gửi ngay'));
      expect(within(view).getByTestId('simple-readonly-steps')).toHaveTextContent('Tin 2 · Mẫu 6 · 30 phút sau tin đầu');
      await waitFor(() => expect(within(view).getByTestId('simple-readonly-summary')).toHaveTextContent('shop@abc.vn'));
      expect(within(view).getByTestId('simple-readonly-reasons')).toHaveTextContent('Đếm từ tin đầu.');
      expect(screen.queryByTestId('simple-edit-save')).not.toBeInTheDocument();
    });

    it('đang chạy → chỉ xem và nói rõ "Chiến dịch đang chạy"', async () => {
      campaignApiService.getSimpleCampaign.mockResolvedValue(getResponse({
        editable: false,
        running: true,
        readOnlyReasons: [{ code: 'running', message: 'Chiến dịch đang chạy.' }],
      }));
      renderEdit();
      expect(await screen.findByTestId('simple-readonly-running')).toHaveTextContent('Chiến dịch đang chạy');
      expect(screen.queryByTestId('simple-edit-save')).not.toBeInTheDocument();
    });

    it('nhân viên không có quyền sửa (campaigns_create): chỉ xem, không có nút sang Sơ đồ khối, tab Sơ đồ khối bị khoá', async () => {
      authState.activeContext = { type: 'employee', permissions: { campaigns_view: true, campaigns_create: false } };
      renderEdit();
      await screen.findByTestId('simple-readonly');
      expect(screen.queryByTestId('simple-readonly-open-builder')).not.toBeInTheDocument();
      expect(screen.queryByTestId('simple-edit-save')).not.toBeInTheDocument();
      expect(screen.getByTestId('campaign-tab-builder')).toBeDisabled();
    });

    it('GET lỗi → báo lỗi và cho thử lại', async () => {
      campaignApiService.getSimpleCampaign.mockRejectedValueOnce(apiError('Không tìm thấy chiến dịch.', 404));
      renderEdit();
      expect(await screen.findByTestId('simple-edit-load-error')).toHaveTextContent('Không tìm thấy chiến dịch.');
      fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
      expect(await screen.findByTestId('simple-summary')).toBeInTheDocument();
    });
  });

  describe('thanh tab và hộp hỏi khi đổi tab', () => {
    it('đứng ở tab Từng bước: tab này được chọn, tab Sơ đồ khối bấm được', async () => {
      renderEdit();
      await screen.findByTestId('simple-summary');
      expect(screen.getByTestId('campaign-tab-simple')).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('campaign-tab-builder')).toHaveAttribute('aria-selected', 'false');
    });

    it('chưa sửa gì → đổi tab chuyển luôn, KHÔNG hỏi', async () => {
      renderEdit();
      await screen.findByTestId('simple-summary');
      fireEvent.click(screen.getByTestId('campaign-tab-builder'));
      expect(await screen.findByText('TRANG-SO-DO-KHOI')).toBeInTheDocument();
      expect(screen.queryByTestId('campaign-tab-switch-modal')).not.toBeInTheDocument();
    });

    it('còn thay đổi chưa lưu → hộp hỏi đủ 3 lựa chọn; chưa chọn thì CHƯA chuyển', async () => {
      renderEdit();
      await makeDirtyAndReturnToReview();
      fireEvent.click(screen.getByTestId('campaign-tab-builder'));
      const modal = await screen.findByTestId('campaign-tab-switch-modal');
      expect(within(modal).getByRole('button', { name: 'Lưu rồi chuyển' })).toBeInTheDocument();
      expect(within(modal).getByRole('button', { name: 'Bỏ thay đổi' })).toBeInTheDocument();
      expect(within(modal).getByRole('button', { name: 'Ở lại' })).toBeInTheDocument();
      expect(screen.queryByText('TRANG-SO-DO-KHOI')).not.toBeInTheDocument();
    });

    it('Ở lại → đóng hộp, giữ nguyên thay đổi, không lưu, không chuyển', async () => {
      renderEdit();
      await makeDirtyAndReturnToReview();
      fireEvent.click(screen.getByTestId('campaign-tab-builder'));
      fireEvent.click(await screen.findByTestId('campaign-tab-switch-stay'));
      await waitFor(() => expect(screen.queryByTestId('campaign-tab-switch-modal')).not.toBeInTheDocument());
      expect(screen.queryByText('TRANG-SO-DO-KHOI')).not.toBeInTheDocument();
      expect(campaignApiService.updateSimpleCampaign).not.toHaveBeenCalled();
      expect(screen.getByTestId('simple-edit-dirty')).toBeInTheDocument();
    });

    it('Bỏ thay đổi → sang Sơ đồ khối mà KHÔNG lưu', async () => {
      renderEdit();
      await makeDirtyAndReturnToReview();
      fireEvent.click(screen.getByTestId('campaign-tab-builder'));
      fireEvent.click(await screen.findByTestId('campaign-tab-switch-discard'));
      expect(await screen.findByText('TRANG-SO-DO-KHOI')).toBeInTheDocument();
      expect(campaignApiService.updateSimpleCampaign).not.toHaveBeenCalled();
    });

    it('Lưu rồi chuyển → PUT xong mới sang Sơ đồ khối', async () => {
      renderEdit();
      await makeDirtyAndReturnToReview('Bản sẽ được lưu');
      fireEvent.click(screen.getByTestId('campaign-tab-builder'));
      fireEvent.click(await screen.findByTestId('campaign-tab-switch-save'));
      expect(await screen.findByText('TRANG-SO-DO-KHOI')).toBeInTheDocument();
      expect(campaignApiService.updateSimpleCampaign).toHaveBeenCalledTimes(1);
      expect(campaignApiService.updateSimpleCampaign.mock.calls[0][1].content.body).toBe('Bản sẽ được lưu');
    });

    it('Lưu rồi chuyển mà lưu LỖI → ở lại trang, đưa tới bước Xem lại để thấy lỗi, không chuyển tab', async () => {
      campaignApiService.updateSimpleCampaign.mockRejectedValue(apiError('Không lưu được.'));
      renderEdit();
      await makeDirtyAndReturnToReview();
      fireEvent.click(screen.getByTestId('campaign-tab-builder'));
      fireEvent.click(await screen.findByTestId('campaign-tab-switch-save'));
      expect(await screen.findByTestId('simple-submit-error')).toHaveTextContent('Không lưu được.');
      expect(screen.queryByText('TRANG-SO-DO-KHOI')).not.toBeInTheDocument();
      expect(screen.queryByTestId('campaign-tab-switch-modal')).not.toBeInTheDocument();
    });
  });
});
