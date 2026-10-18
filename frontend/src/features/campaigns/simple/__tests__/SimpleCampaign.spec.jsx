import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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
vi.mock('../../services/campaignRunApi.service', () => ({ default: { runCampaign: vi.fn() } }));
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
const FORMS = [
  { id: 7, title: 'Đăng ký học thử', submissionCount: 12, settings: { consentEnabled: true } },
  { id: 8, title: 'Đặt lịch tư vấn', submissionCount: 3, settings: { consentEnabled: true } },
];
const GROUPS = [
  { groupId: 'g1', groupName: 'Nhóm Khách VIP' },
  { groupId: 'g2', groupName: 'Nhóm Đối tác' },
];
const CREATED_NAME_PATTERN = /^(Email|Zalo|Zalo nhóm) – \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/;
const readyPreview = (patch = {}) => ({
  data: { success: true, data: { readyToCreate: true, issues: [], estimate: null, recipientCount: 12, summary: {}, ...patch } },
});
const created = (id) => ({ data: { success: true, data: { campaignId: String(id), campaignName: 'Chiến dịch từng bước', channel: 'email', recipientCountHint: 12 } } });
const runOk = { data: { success: true, data: { runId: 5, campaignId: '900', status: 'running' } } };
const apiError = (message, status = 409) => ({ response: { status, data: { success: false, message } } });

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
  fireEvent.click(await screen.findByRole('checkbox', { name: /Đặt lịch tư vấn/ }));
  fireEvent.click(await enabledNext());
}

/** Thẻ Zalo + nguồn "Nhóm Zalo" (kênh nhóm là một nguồn người nhận, không còn là thẻ kênh). */
async function chooseZaloGroupChannel() {
  await chooseChannel('zalo');
  fireEvent.click(await screen.findByTestId('simple-audience-zalo_groups'));
}

async function chooseGroupAudience() {
  fireEvent.click(await screen.findByRole('checkbox', { name: /Nhóm Khách VIP/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Dùng các nhóm đã chọn' }));
  fireEvent.click(await enabledNext());
}

async function chooseTemplate(kindTemplateName) {
  fireEvent.click(await screen.findByTestId('simple-content-template'));
  fireEvent.click(await screen.findByText('-- Chọn mẫu --'));
  fireEvent.click(await screen.findByText(kindTemplateName));
  fireEvent.click(await enabledNext());
}

async function chooseCustomContent({ subject, body }) {
  fireEvent.click(await screen.findByTestId('simple-content-custom'));
  if (subject !== undefined) fireEvent.change(await screen.findByLabelText('Tiêu đề thư'), { target: { value: subject } });
  fireEvent.change(await screen.findByLabelText('Nội dung', { selector: 'textarea' }), { target: { value: body } });
  fireEvent.click(await enabledNext());
}

async function acceptSendNow() {
  expect(await screen.findByTestId('simple-when-now')).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(await enabledNext());
}

async function waitForStartEnabled() {
  const start = await screen.findByTestId('simple-start');
  await waitFor(() => expect(start).toBeEnabled());
  return start;
}

async function reachReviewEmailForm() {
  renderPage();
  await chooseChannel('email');
  await chooseFormAudience();
  await chooseTemplate('Ưu đãi tháng 10');
  await acceptSendNow();
  return waitForStartEnabled();
}

describe('Tạo chiến dịch từng bước (PR-2)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    availabilityState.value = openAvailability();
    campaignBuilderApiService.getActiveEmailSettings.mockResolvedValue({
      data: { data: { items: [{ id: 11, name: 'Shop ABC', email: 'shop@abc.vn', status: 'active' }] } },
    });
    campaignBuilderApiService.getZaloAccounts.mockResolvedValue({
      data: {
        data: {
          items: [
            { id: 21, displayName: 'Nick A', status: 'connected', isActive: true, isLocked: false },
            { id: 22, displayName: 'Nick B', status: 'disconnected', isActive: true, isLocked: false },
          ],
        },
      },
    });
    campaignBuilderApiService.listForms.mockResolvedValue({ data: { data: FORMS } });
    campaignBuilderApiService.checkGoogleSheet.mockResolvedValue({
      data: { data: { columns: ['email', 'name'], worksheetNames: ['Sheet1'] } },
    });
    campaignBuilderApiService.getPreviewZaloGroups.mockResolvedValue({ data: { data: { groups: GROUPS } } });
    emailTemplateApiService.getTemplates.mockResolvedValue({
      data: { data: { items: [{ id: 5, templateName: 'Ưu đãi tháng 10', category: '' }] } },
    });
    emailTemplateApiService.getTemplateById.mockResolvedValue({
      data: { data: { id: 5, templateName: 'Ưu đãi tháng 10', subject: 'Giảm 20%', bodyText: 'Nội dung mẫu xem trước' } },
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
  });

  describe('bước 1 — kênh và tài khoản gửi', () => {
    it('Tiếp tục bị khoá khi chưa chọn kênh; chọn Email thì tài khoản duy nhất được chọn sẵn và Tiếp tục mở', async () => {
      renderPage();
      expect(await screen.findByTestId('simple-channel-email')).toBeInTheDocument();
      expect(nextButton()).toBeDisabled();
      expect(screen.getByTestId('simple-needs')).toHaveTextContent('Hãy chọn kênh và tài khoản gửi');

      fireEvent.click(screen.getByTestId('simple-channel-email'));
      const account = await screen.findByTestId('simple-sender-11');
      expect(within(account).getByRole('button', { pressed: true })).toHaveTextContent('shop@abc.vn');
      expect(await enabledNext()).toBeEnabled();
      // Tài khoản email lấy bằng API limit 100 chứ không phải GET /email-settings trần (mặc định chỉ 10).
      expect(campaignBuilderApiService.getActiveEmailSettings).toHaveBeenCalledTimes(1);
    });

    it('Zalo: tài khoản mất kết nối không chọn được và có link "Kết nối lại" tới cài đặt Zalo; nick dùng được duy nhất thì chọn sẵn', async () => {
      renderPage();
      fireEvent.click(await screen.findByTestId('simple-channel-zalo'));
      const bad = await screen.findByTestId('simple-sender-22');
      expect(within(bad).getByRole('button', { name: /Nick B/ })).toBeDisabled();
      expect(within(bad).getByText('Mất kết nối')).toBeInTheDocument();
      expect(within(bad).getByRole('link', { name: 'Kết nối lại' })).toHaveAttribute('href', '/app/settings/channels#zalo');
      const good = await screen.findByTestId('simple-sender-21');
      await waitFor(() => expect(within(good).getByRole('button', { pressed: true })).toBeInTheDocument());
    });

    it('Email: tài khoản bị khoá theo gói hiện lý do + link gói, không chọn được, không chọn sẵn', async () => {
      campaignBuilderApiService.getActiveEmailSettings.mockResolvedValue({
        data: { data: { items: [{ id: 11, name: 'A', email: 'a@x.vn', isLocked: true }] } },
      });
      renderPage();
      fireEvent.click(await screen.findByTestId('simple-channel-email'));
      const locked = await screen.findByTestId('simple-sender-11');
      expect(within(locked).getByRole('button', { name: /a@x.vn/ })).toBeDisabled();
      expect(within(locked).getByText('Đang bị khoá theo gói')).toBeInTheDocument();
      expect(within(locked).getByRole('link', { name: 'Xem gói của bạn' })).toHaveAttribute('href', '/app/billing');
      expect(within(locked).queryByRole('button', { pressed: true })).toBeNull();
      expect(nextButton()).toBeDisabled();
    });

    it('nhiều tài khoản dùng được: không chọn sẵn, phải bấm chọn mới sang được bước kế', async () => {
      campaignBuilderApiService.getActiveEmailSettings.mockResolvedValue({
        data: { data: { items: [{ id: 11, name: 'A', email: 'a@x.vn' }, { id: 12, name: 'B', email: 'b@x.vn' }] } },
      });
      renderPage();
      fireEvent.click(await screen.findByTestId('simple-channel-email'));
      await screen.findByTestId('simple-sender-12');
      expect(nextButton()).toBeDisabled();
      fireEvent.click(within(screen.getByTestId('simple-sender-12')).getByRole('button'));
      expect(await enabledNext()).toBeEnabled();
    });

    it('kênh bị khoá theo gói: thẻ mờ + aria-disabled, bấm vẫn mở modal giải thích và KHÔNG chọn kênh', async () => {
      availabilityState.value = {
        ...openAvailability(),
        zalo: { visible: true, available: false, reason: 'not_in_plan', detail: 'accounts', used: null, limit: null },
      };
      renderPage();
      const card = await screen.findByTestId('simple-channel-zalo');
      expect(card).toHaveAttribute('aria-disabled', 'true');
      expect(within(card).getByTestId('channel-lock-badge')).toBeInTheDocument();
      expect(screen.queryByTestId('simple-channel-zalo_group')).toBeNull(); // chỉ còn 4 thẻ kênh
      expect(screen.getByTestId('simple-channel-email')).not.toHaveAttribute('aria-disabled');

      fireEvent.click(card);
      const modal = await screen.findByTestId('channel-unavailable-modal');
      expect(modal).toHaveAttribute('data-channel', 'zalo');
      expect(screen.queryByTestId('simple-sender-section')).toBeNull();
      expect(nextButton()).toBeDisabled();
    });
  });

  describe('bước 2 — người nhận', () => {
    it('Nhóm Zalo: Tiếp tục khoá khi chưa chọn nhóm nào, mở khi đã chọn ít nhất 1 nhóm', async () => {
      renderPage();
      await chooseZaloGroupChannel();
      expect(await screen.findByRole('checkbox', { name: /Nhóm Khách VIP/ })).toBeInTheDocument();
      expect(campaignBuilderApiService.getPreviewZaloGroups).toHaveBeenCalledWith({ accountId: 21 });
      expect(nextButton()).toBeDisabled();
      expect(screen.getByTestId('simple-needs')).toHaveTextContent('ít nhất một nhóm');

      fireEvent.click(screen.getByRole('checkbox', { name: /Nhóm Khách VIP/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Dùng các nhóm đã chọn' }));
      expect(await screen.findByTestId('simple-groups-chosen')).toHaveTextContent('Đã chọn 1 nhóm');
      expect(nextButton()).toBeEnabled();
    });

    it('chưa chọn nguồn thì khoá; chọn "Người điền biểu mẫu" vẫn khoá tới khi tick biểu mẫu; biểu mẫu chưa hỏi đồng ý bị nhắc', async () => {
      campaignBuilderApiService.listForms.mockResolvedValue({
        data: { data: [...FORMS, { id: 9, title: 'Form cũ', submissionCount: 1, settings: { consentEnabled: false } }] },
      });
      renderPage();
      await chooseChannel('email');
      expect(nextButton()).toBeDisabled();
      expect(screen.getByTestId('simple-consent-note')).toHaveTextContent('Người đã từ chối nhận tin sẽ tự được bỏ qua');

      fireEvent.click(screen.getByTestId('simple-audience-form'));
      await screen.findByRole('checkbox', { name: /Đăng ký học thử/ });
      expect(nextButton()).toBeDisabled();
      expect(screen.getByTestId('simple-form-noconsent-9')).toBeInTheDocument();
      expect(screen.queryByTestId('simple-form-noconsent-7')).toBeNull();
      fireEvent.click(screen.getByRole('checkbox', { name: /Đăng ký học thử/ }));
      expect(nextButton()).toBeEnabled();
    });

    it('đổi kênh xoá nguồn không hợp lệ: chọn "Bạn bè Zalo" rồi đổi sang Email thì thẻ đó biến mất và chưa thẻ nào được chọn', async () => {
      renderPage();
      await chooseChannel('zalo');
      fireEvent.click(await screen.findByTestId('simple-audience-zalo_friends'));
      expect(screen.getByTestId('simple-audience-zalo_friends')).toHaveAttribute('aria-pressed', 'true');

      fireEvent.click(screen.getByTestId('simple-back'));
      fireEvent.click(await screen.findByTestId('simple-channel-email'));
      fireEvent.click(await enabledNext());

      expect(await screen.findByTestId('simple-audience-form')).toBeInTheDocument();
      expect(screen.queryByTestId('simple-audience-zalo_friends')).toBeNull();
      for (const type of ['customers', 'landing', 'form', 'sheet', 'manual']) {
        expect(screen.getByTestId(`simple-audience-${type}`)).toHaveAttribute('aria-pressed', 'false');
      }
      expect(nextButton()).toBeDisabled();
    });

    it('Google Sheet: phải "Kiểm tra" thành công mới sang được; sửa link thì phải kiểm tra lại; lỗi hiện đúng câu server trả', async () => {
      renderPage();
      await chooseChannel('email');
      fireEvent.click(screen.getByTestId('simple-audience-sheet'));
      const input = await screen.findByLabelText('Link Google Sheet');
      fireEvent.change(input, { target: { value: 'https://docs.google.com/spreadsheets/d/abc/edit' } });
      expect(nextButton()).toBeDisabled();

      campaignBuilderApiService.checkGoogleSheet.mockRejectedValueOnce(apiError('Không đọc được file. Kiểm tra lại link.', 400));
      fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra' }));
      expect(await screen.findByTestId('simple-sheet-error')).toHaveTextContent('Không đọc được file. Kiểm tra lại link.');
      expect(nextButton()).toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra' }));
      expect(await screen.findByTestId('simple-sheet-ok')).toBeInTheDocument();
      expect(campaignBuilderApiService.checkGoogleSheet).toHaveBeenLastCalledWith({
        sheetUrl: 'https://docs.google.com/spreadsheets/d/abc/edit',
        sheetName: '',
        headerRow: 1,
      });
      expect(nextButton()).toBeEnabled();

      fireEvent.change(input, { target: { value: 'https://docs.google.com/spreadsheets/d/xyz/edit' } });
      expect(screen.queryByTestId('simple-sheet-ok')).toBeNull();
      expect(nextButton()).toBeDisabled();
    });

    it('Tự nhập: còn mục sai định dạng thì khoá và nói rõ mục nào sai', async () => {
      renderPage();
      await chooseChannel('email');
      fireEvent.click(screen.getByTestId('simple-audience-manual'));
      const box = await screen.findByLabelText('Danh sách email');
      fireEvent.change(box, { target: { value: 'a@x.vn\nkhong-phai-email' } });
      expect(screen.getByTestId('simple-manual-invalid')).toHaveTextContent('khong-phai-email');
      expect(nextButton()).toBeDisabled();
      fireEvent.change(box, { target: { value: 'a@x.vn\nb@y.vn' } });
      expect(screen.getByTestId('simple-manual-count')).toHaveTextContent('Đã nhận 2 người');
      expect(nextButton()).toBeEnabled();
    });
  });

  describe('bước 3 — nội dung', () => {
    it('mẫu có sẵn: phải chọn mẫu mới sang được; "Xem trước" mở đúng mẫu', async () => {
      renderPage();
      await chooseChannel('email');
      fireEvent.click(screen.getByTestId('simple-audience-customers'));
      expect(await screen.findByTestId('simple-customers-count')).toHaveTextContent(/1[.,]234/);
      fireEvent.click(await enabledNext());

      fireEvent.click(await screen.findByTestId('simple-content-template'));
      expect(nextButton()).toBeDisabled();
      const preview = await screen.findByRole('button', { name: 'Xem trước' });
      expect(preview).toBeDisabled();
      fireEvent.click(await screen.findByText('-- Chọn mẫu --'));
      fireEvent.click(await screen.findByText('Ưu đãi tháng 10'));
      expect(nextButton()).toBeEnabled();

      fireEvent.click(preview);
      expect(await screen.findByText('Nội dung mẫu xem trước')).toBeInTheDocument();
      expect(emailTemplateApiService.getTemplateById).toHaveBeenCalledWith(5);
    });

    it('tự soạn email cần cả tiêu đề lẫn nội dung; Zalo chỉ cần nội dung và không có ô tiêu đề', async () => {
      renderPage();
      await chooseChannel('email');
      fireEvent.click(screen.getByTestId('simple-audience-customers'));
      fireEvent.click(await enabledNext());
      fireEvent.click(await screen.findByTestId('simple-content-custom'));
      const body = await screen.findByLabelText('Nội dung', { selector: 'textarea' });
      fireEvent.change(body, { target: { value: 'Xin chào bạn' } });
      expect(nextButton()).toBeDisabled();
      fireEvent.change(screen.getByLabelText('Tiêu đề thư'), { target: { value: 'Ưu đãi' } });
      expect(nextButton()).toBeEnabled();
    });
  });

  describe('bước 5 — body preview/create đúng hợp đồng PR-1', () => {
    it('email + biểu mẫu [7,8] + mẫu có sẵn; câu tóm tắt dựng từ chính lựa chọn; tạo xong chạy với autoActivate', async () => {
      const start = await reachReviewEmailForm();

      const expectedBody = {
        campaignName: expect.stringMatching(CREATED_NAME_PATTERN),
        channel: 'email',
        senderId: 11,
        audience: { type: 'form', formIds: [7, 8] },
        content: { mode: 'template', templateId: 5 },
      };
      expect(campaignApiService.previewSimpleCampaign).toHaveBeenCalledTimes(1);
      expect(campaignApiService.previewSimpleCampaign).toHaveBeenCalledWith(expectedBody);
      expect(campaignApiService.createSimpleCampaign).not.toHaveBeenCalled(); // preview không tạo gì

      const summary = screen.getByTestId('simple-summary');
      expect(summary).toHaveTextContent('Gửi email từ shop@abc.vn tới 12 người điền biểu mẫu “Đăng ký học thử”, “Đặt lịch tư vấn”');
      expect(summary).toHaveTextContent('nội dung “Ưu đãi tháng 10”, gửi ngay.');

      fireEvent.change(screen.getByLabelText('Tên chiến dịch'), { target: { value: 'Học thử tháng 10' } });
      fireEvent.click(start);
      expect(await screen.findByTestId('simple-done')).toBeInTheDocument();

      expect(campaignApiService.createSimpleCampaign).toHaveBeenCalledWith({ ...expectedBody, campaignName: 'Học thử tháng 10' });
      expect(campaignRunApiService.runCampaign).toHaveBeenCalledWith('900', {
        source: 'campaign_run',
        autoActivate: true,
        runName: 'Học thử tháng 10',
      });
    });

    it('email + tự nhập + tự soạn: emails viết thường, có subject', async () => {
      renderPage();
      await chooseChannel('email');
      fireEvent.click(screen.getByTestId('simple-audience-manual'));
      fireEvent.change(await screen.findByLabelText('Danh sách email'), { target: { value: 'A@Shop.vn, b@shop.vn' } });
      fireEvent.click(await enabledNext());
      await chooseCustomContent({ subject: 'Ưu đãi tháng 10', body: 'Giảm 20% tuần này' });
      await acceptSendNow();
      await waitForStartEnabled();

      expect(campaignApiService.previewSimpleCampaign).toHaveBeenCalledWith({
        campaignName: expect.stringMatching(CREATED_NAME_PATTERN),
        channel: 'email',
        senderId: 11,
        audience: { type: 'manual', emails: ['a@shop.vn', 'b@shop.vn'] },
        content: { mode: 'custom', subject: 'Ưu đãi tháng 10', body: 'Giảm 20% tuần này' },
      });
      expect(screen.getByTestId('simple-summary')).toHaveTextContent('nội dung tự soạn “Ưu đãi tháng 10”');
    });

    it('Zalo cá nhân + khách đã lưu + tự soạn: audience customers (không dùng nguồn db), content không có subject', async () => {
      renderPage();
      await chooseChannel('zalo');
      fireEvent.click(screen.getByTestId('simple-audience-customers'));
      fireEvent.click(await enabledNext());
      await chooseCustomContent({ body: 'Chào bạn, mình gửi ưu đãi nhé' });
      await acceptSendNow();
      await waitForStartEnabled();

      expect(campaignApiService.previewSimpleCampaign).toHaveBeenCalledWith({
        campaignName: expect.stringMatching(CREATED_NAME_PATTERN),
        channel: 'zalo',
        senderId: 21,
        audience: { type: 'customers' },
        content: { mode: 'custom', body: 'Chào bạn, mình gửi ưu đãi nhé' },
      });
      expect(screen.getByTestId('simple-summary')).toHaveTextContent('Gửi Zalo cá nhân từ Nick A');
    });

    it('Zalo + Nhóm Zalo + nhóm đã chọn + mẫu Zalo: body gửi channel zalo_group, groupIds đúng, dùng kho mẫu Zalo', async () => {
      renderPage();
      await chooseZaloGroupChannel();
      await chooseGroupAudience();
      await chooseTemplate('Mẫu Zalo chào mừng');
      await acceptSendNow();
      const start = await waitForStartEnabled();

      expect(zaloTemplateApiService.getTemplates).toHaveBeenCalled();
      expect(emailTemplateApiService.getTemplates).not.toHaveBeenCalled();
      const expectedBody = {
        campaignName: expect.stringMatching(CREATED_NAME_PATTERN),
        channel: 'zalo_group',
        senderId: 21,
        audience: { type: 'zalo_groups', groupIds: ['g1'] },
        content: { mode: 'template', templateId: 6 },
      };
      expect(campaignApiService.previewSimpleCampaign).toHaveBeenCalledWith(expectedBody);
      expect(screen.getByTestId('simple-summary')).toHaveTextContent('tới 1 nhóm Zalo');

      fireEvent.click(start);
      await screen.findByTestId('simple-done');
      expect(campaignApiService.createSimpleCampaign).toHaveBeenCalledWith(expectedBody);
      // Màn xong của kênh Zalo có thêm lời giải thích vì sao gửi chậm.
      expect(screen.getByTestId('simple-done')).toHaveTextContent('vài chục giây');
    });
  });

  describe('kiểm tra của server (preview) chặn nút gửi', () => {
    it('readyToCreate=false: nút "Bắt đầu gửi" khoá, hiện từng lý do bằng chữ server trả; không tạo gì', async () => {
      campaignApiService.previewSimpleCampaign.mockResolvedValue(readyPreview({
        readyToCreate: false,
        recipientCount: 0,
        issues: [
          { code: 'SENDER_DISCONNECTED', message: 'Tài khoản Zalo đang mất kết nối. Hãy kết nối lại.' },
          'Biểu mẫu chưa có ai đồng ý nhận tin.',
        ],
      }));
      renderPage();
      await chooseChannel('email');
      await chooseFormAudience();
      await chooseTemplate('Ưu đãi tháng 10');
      await acceptSendNow();

      const blocked = await screen.findByTestId('simple-preview-blocked');
      expect(blocked).toHaveTextContent('Tài khoản Zalo đang mất kết nối. Hãy kết nối lại.');
      expect(blocked).toHaveTextContent('Biểu mẫu chưa có ai đồng ý nhận tin.');
      expect(screen.getByTestId('simple-start')).toBeDisabled();
      fireEvent.click(screen.getByTestId('simple-start'));
      expect(campaignApiService.createSimpleCampaign).not.toHaveBeenCalled();
    });

    it('hết hạn mức tạo chiến dịch: gợi ý xoá bớt chiến dịch cũ / nâng cấp + link trang Chiến dịch, KHÔNG bảo "Quay lại để sửa"', async () => {
      campaignApiService.previewSimpleCampaign.mockResolvedValue(readyPreview({
        readyToCreate: false,
        issues: [{ code: 'campaign_limit_reached', severity: 'blocking', message: 'Tài khoản đã đạt giới hạn số chiến dịch Email (5).' }],
      }));
      renderPage();
      await chooseChannel('email');
      await chooseFormAudience();
      await chooseTemplate('Ưu đãi tháng 10');
      await acceptSendNow();

      const blocked = await screen.findByTestId('simple-preview-blocked');
      expect(blocked).toHaveTextContent('Tài khoản đã đạt giới hạn số chiến dịch Email (5).');
      expect(screen.getByTestId('simple-limit-hint')).toHaveTextContent('xoá bớt chiến dịch cũ');
      expect(screen.getByRole('link', { name: 'Mở trang Chiến dịch' })).toHaveAttribute('href', '/app/campaigns');
      expect(blocked).not.toHaveTextContent('Quay lại');
      expect(screen.getByTestId('simple-start')).toBeDisabled();
    });

    it('thiếu trường readyToCreate thì coi như chưa cho gửi (không mặc định true)', async () => {
      campaignApiService.previewSimpleCampaign.mockResolvedValue({ data: { success: true, data: { issues: [], recipientCount: 3 } } });
      renderPage();
      await chooseChannel('email');
      await chooseFormAudience();
      await chooseTemplate('Ưu đãi tháng 10');
      await acceptSendNow();
      await screen.findByTestId('simple-preview-blocked');
      expect(screen.getByTestId('simple-start')).toBeDisabled();
    });

    it('preview báo lỗi 4xx kèm câu tiếng người (vd vượt trần): hiện nguyên văn, khoá nút, có nút kiểm tra lại', async () => {
      campaignApiService.previewSimpleCampaign.mockRejectedValueOnce(apiError('Danh sách khách có 60.000 người, vượt mức tối đa 50.000.', 400));
      renderPage();
      await chooseChannel('email');
      await chooseFormAudience();
      await chooseTemplate('Ưu đãi tháng 10');
      await acceptSendNow();
      expect(await screen.findByTestId('simple-preview-error')).toHaveTextContent('60.000 người, vượt mức tối đa 50.000');
      expect(screen.getByTestId('simple-start')).toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại' }));
      await waitForStartEnabled();
      expect(campaignApiService.previewSimpleCampaign).toHaveBeenCalledTimes(2);
    });

    it('cảnh báo (readyToCreate=true kèm issues) hiện ở mục Lưu ý nhưng không chặn', async () => {
      campaignApiService.previewSimpleCampaign.mockResolvedValue(readyPreview({ issues: ['Gửi hết sẽ mất khoảng 2 ngày.'] }));
      await reachReviewEmailForm();
      expect(screen.getByTestId('simple-preview-warnings')).toHaveTextContent('Gửi hết sẽ mất khoảng 2 ngày.');
      expect(screen.getByTestId('simple-start')).toBeEnabled();
    });
  });

  describe('bấm "Bắt đầu gửi"', () => {
    it('server trả 200 requiresApproval:true → màn "Đã gửi chủ tài khoản duyệt", KHÔNG báo đang gửi', async () => {
      campaignRunApiService.runCampaign.mockResolvedValue({
        data: { success: true, message: 'vượt ngưỡng', data: { campaignId: 900, status: 'pending_owner_approval', requiresApproval: true } },
      });
      const start = await reachReviewEmailForm();
      fireEvent.click(start);

      const approval = await screen.findByTestId('simple-approval');
      expect(approval).toHaveTextContent('Đã gửi chủ tài khoản duyệt');
      expect(screen.queryByTestId('simple-done')).toBeNull();
      expect(screen.queryByText('Đang gửi chiến dịch')).toBeNull();
      expect(within(approval).getByTestId('simple-approval-list')).toHaveAttribute('href', '/app/campaigns');
    });

    it('thành công → màn xong với "Xem tiến độ" và "Xem chiến dịch" đúng đích', async () => {
      const start = await reachReviewEmailForm();
      fireEvent.click(start);
      const done = await screen.findByTestId('simple-done');
      expect(done).toHaveTextContent('Đang gửi chiến dịch');
      expect(screen.getByTestId('simple-done-progress')).toHaveAttribute('href', '/app/delivery-monitor');
      expect(screen.getByTestId('simple-done-builder')).toHaveAttribute('href', '/app/campaigns/900');
      // Email không cần lời giải thích về nhịp gửi Zalo.
      expect(done).not.toHaveTextContent('vài chục giây');
    });

    it('tạo xong mà chạy lỗi → hiện câu của server, giữ chiến dịch; bấm lại thì XOÁ nháp cũ trước khi tạo bản mới', async () => {
      campaignApiService.createSimpleCampaign
        .mockResolvedValueOnce(created(900))
        .mockResolvedValueOnce(created(901));
      campaignRunApiService.runCampaign
        .mockRejectedValueOnce(apiError('Tài khoản Zalo đang mất kết nối. Hãy kết nối lại rồi thử lại.'))
        .mockResolvedValueOnce(runOk);
      const start = await reachReviewEmailForm();

      fireEvent.click(start);
      const error = await screen.findByTestId('simple-submit-error');
      expect(error).toHaveTextContent('Tài khoản Zalo đang mất kết nối. Hãy kết nối lại rồi thử lại.');
      expect(error).toHaveTextContent('Bản nháp vừa tạo sẽ được thay bằng bản mới');
      expect(campaignApiService.createSimpleCampaign).toHaveBeenCalledTimes(1);
      expect(campaignApiService.deleteCampaign).not.toHaveBeenCalled(); // chưa xoá ngay: người dùng có thể mở nháp để xem
      expect(screen.queryByTestId('simple-done')).toBeNull();

      await waitFor(() => expect(screen.getByTestId('simple-start')).toBeEnabled());
      fireEvent.click(screen.getByTestId('simple-start'));
      await screen.findByTestId('simple-done');

      expect(campaignApiService.deleteCampaign).toHaveBeenCalledTimes(1);
      expect(campaignApiService.deleteCampaign).toHaveBeenCalledWith('900');
      expect(campaignApiService.createSimpleCampaign).toHaveBeenCalledTimes(2);
      // Xoá nháp cũ phải xảy ra TRƯỚC khi tạo bản mới.
      expect(campaignApiService.deleteCampaign.mock.invocationCallOrder[0])
        .toBeLessThan(campaignApiService.createSimpleCampaign.mock.invocationCallOrder[1]);
      expect(campaignRunApiService.runCampaign).toHaveBeenLastCalledWith('901', expect.objectContaining({ source: 'campaign_run', autoActivate: true }));
      expect(screen.getByTestId('simple-done-builder')).toHaveAttribute('href', '/app/campaigns/901');
    });

    it('nháp cũ đã mất (DELETE 404) hoặc xoá lỗi thì vẫn tạo bản mới, không kẹt người dùng', async () => {
      campaignApiService.createSimpleCampaign.mockResolvedValueOnce(created(900)).mockResolvedValueOnce(created(901));
      campaignRunApiService.runCampaign.mockRejectedValueOnce(apiError('Lỗi tạm thời.', 500)).mockResolvedValueOnce(runOk);
      campaignApiService.deleteCampaign.mockRejectedValueOnce(apiError('Không tìm thấy chiến dịch', 404));
      const start = await reachReviewEmailForm();
      fireEvent.click(start);
      await screen.findByTestId('simple-submit-error');
      await waitFor(() => expect(screen.getByTestId('simple-start')).toBeEnabled());
      fireEvent.click(screen.getByTestId('simple-start'));
      await screen.findByTestId('simple-done');
      expect(campaignApiService.createSimpleCampaign).toHaveBeenCalledTimes(2);
    });

    it('tạo chiến dịch lỗi → hiện câu server, KHÔNG gọi chạy, không để lại nháp để xoá', async () => {
      campaignApiService.createSimpleCampaign.mockRejectedValueOnce(apiError('Mẫu tin không thuộc tài khoản của bạn.', 400));
      const start = await reachReviewEmailForm();
      fireEvent.click(start);
      expect(await screen.findByTestId('simple-submit-error')).toHaveTextContent('Mẫu tin không thuộc tài khoản của bạn.');
      expect(campaignRunApiService.runCampaign).not.toHaveBeenCalled();

      await waitFor(() => expect(screen.getByTestId('simple-start')).toBeEnabled());
      fireEvent.click(screen.getByTestId('simple-start'));
      await screen.findByTestId('simple-done');
      expect(campaignApiService.deleteCampaign).not.toHaveBeenCalled();
    });

    it('bấm đúp "Bắt đầu gửi" chỉ tạo MỘT chiến dịch', async () => {
      let resolveCreate;
      campaignApiService.createSimpleCampaign.mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));
      const start = await reachReviewEmailForm();
      fireEvent.click(start);
      fireEvent.click(start);
      fireEvent.click(start);
      await waitFor(() => expect(screen.getByTestId('simple-start')).toBeDisabled());
      resolveCreate(created(900));
      await screen.findByTestId('simple-done');
      expect(campaignApiService.createSimpleCampaign).toHaveBeenCalledTimes(1);
      expect(campaignRunApiService.runCampaign).toHaveBeenCalledTimes(1);
    });
  });

  describe('điều hướng', () => {
    it('Quay lại ở bước đầu về danh sách chiến dịch; ở bước sau thì lùi một bước và giữ lựa chọn', async () => {
      renderPage();
      await chooseChannel('email');
      fireEvent.click(await screen.findByTestId('simple-audience-customers'));
      fireEvent.click(await enabledNext());
      fireEvent.click(screen.getByTestId('simple-back')); // content → audience
      expect(await screen.findByTestId('simple-audience-customers')).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(screen.getByTestId('simple-back')); // audience → channel
      expect(await screen.findByTestId('simple-channel-email')).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(screen.getByTestId('simple-back'));
      expect(await screen.findByText('DANH-SACH-CHIEN-DICH')).toBeInTheDocument();
    });

    it('thanh tiến trình đánh dấu bước đang làm và cho bấm lùi về bước đã qua', async () => {
      renderPage();
      await chooseChannel('email');
      expect(screen.getByTestId('simple-step-audience')).toHaveAttribute('aria-current', 'step');
      fireEvent.click(within(screen.getByTestId('simple-step-channel')).getByRole('button'));
      expect(await screen.findByTestId('simple-channel-email')).toBeInTheDocument();
    });
  });
});
