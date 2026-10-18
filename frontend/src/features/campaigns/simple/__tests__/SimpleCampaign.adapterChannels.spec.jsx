import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SimpleCampaign from '../../../../pages/campaigns/SimpleCampaign';
import campaignApiService from '../../services/campaignApi.service';
import campaignRunApiService from '../../services/campaignRunApi.service';
import campaignBuilderApiService from '../../services/campaignBuilderApi.service';
import emailTemplateApiService from '../../../templates/services/emailTemplateApi.service';
import zaloTemplateApiService from '../../../templates/services/zaloTemplateApi.service';

/**
 * PLAN_TUNG_BUOC_TELEGRAM_WHATSAPP_2026-10-17 — thẻ kênh Telegram/WhatsApp (hiện/ẩn/mờ theo cờ + gói), nguồn người nhận theo kênh,
 * trần chuỗi 5 tin, mẫu vượt giới hạn tệp, và body gửi server.
 */
vi.mock('../../../../i18n', async () => (await import('../../../../test/realI18n.js')).realI18nModule());

const availabilityState = vi.hoisted(() => ({ value: null }));
vi.mock('../../../../hooks/queries/useChannelAvailability', async (importOriginal) => ({
  ...(await importOriginal()),
  useChannelAvailability: () => availabilityState.value,
}));

vi.mock('../../services/campaignApi.service', () => ({
  default: { previewSimpleCampaign: vi.fn(), createSimpleCampaign: vi.fn(), deleteCampaign: vi.fn(), getChannels: vi.fn() },
}));
vi.mock('../../services/campaignRunApi.service', () => ({ default: { runCampaign: vi.fn() } }));
vi.mock('../../services/campaignBuilderApi.service', () => ({
  default: {
    getActiveEmailSettings: vi.fn(),
    getZaloAccounts: vi.fn(),
    getTelegramAccountsForBuilder: vi.fn(),
    getWhatsAppAccountsForBuilder: vi.fn(),
    getTelegramAccountGroups: vi.fn(),
    getWhatsAppAccountGroups: vi.fn(),
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
vi.mock('../../../customers/services/customerApi.service', () => ({
  default: { getCustomers: vi.fn().mockResolvedValue({ data: { data: { items: [], pagination: { total: 5 } } } }) },
}));
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

const SESSION_KEY = '7-main';
const meter = { reason: null, detail: null, used: null, limit: null };
const availability = (patch = {}) => ({
  email: { visible: true, available: true, ...meter },
  zalo: { visible: true, available: true, ...meter },
  telegram: { visible: true, available: true, ...meter },
  whatsapp: { visible: true, available: true, ...meter },
  adapterChannels: [{ key: 'telegram' }, { key: 'whatsapp' }],
  isLoading: false,
  ...patch,
});

const images = (n) => Array.from({ length: n }, (_v, i) => ({ key: `a/${i}.png`, name: `${i}.png`, size: 100 }));

const renderPage = () => render(
  <MemoryRouter initialEntries={['/app/campaigns/simple']}>
    <Routes>
      <Route path="/app/campaigns/simple" element={<SimpleCampaign />} />
      <Route path="/app/campaigns" element={<div>DANH-SACH-CHIEN-DICH</div>} />
    </Routes>
  </MemoryRouter>,
);

const nextButton = () => screen.getByTestId('simple-next');
const enabledNext = async () => {
  await waitFor(() => expect(nextButton()).toBeEnabled());
  return nextButton();
};

beforeEach(() => {
  vi.resetAllMocks();
  availabilityState.value = availability();
  campaignBuilderApiService.getActiveEmailSettings.mockResolvedValue({ data: { data: { items: [] } } });
  campaignBuilderApiService.getZaloAccounts.mockResolvedValue({ data: { data: { items: [] } } });
  campaignBuilderApiService.getTelegramAccountsForBuilder.mockResolvedValue({
    data: { data: [{ id: 5, name: 'Shop Telegram', username: 'shop_tg', openConversationCount: 12 }] },
  });
  campaignBuilderApiService.getWhatsAppAccountsForBuilder.mockResolvedValue({
    data: {
      data: [
        { sessionKey: SESSION_KEY, display: 'Shop WA', status: 'open', openConversationCount: 3 },
        { sessionKey: '7-old', display: 'Số cũ', status: 'offline', openConversationCount: 0 },
      ],
    },
  });
  campaignBuilderApiService.listForms.mockResolvedValue({ data: { data: [] } });
  emailTemplateApiService.getTemplates.mockResolvedValue({ data: { data: { items: [] } } });
  // API danh sách mẫu KHÔNG trả `attachments` (đã đo trên backend thật) — tệp chỉ có ở chi tiết mẫu.
  const templateDetails = {
    6: { id: 6, templateName: 'Mẫu chào mừng', bodyText: 'Chào bạn', attachments: images(1) },
    7: { id: 7, templateName: 'Mẫu nhiều ảnh', bodyText: 'Xem ảnh', attachments: images(6) },
  };
  zaloTemplateApiService.getTemplates.mockResolvedValue({
    data: {
      data: {
        items: Object.values(templateDetails).map(({ attachments: _omit, ...item }) => ({ ...item, category: '' })),
      },
    },
  });
  zaloTemplateApiService.getTemplateById.mockImplementation(async (id) => ({ data: { data: templateDetails[id] } }));
  campaignApiService.previewSimpleCampaign.mockResolvedValue({
    data: { success: true, data: { readyToCreate: true, issues: [], estimate: null, recipientCount: 12, summary: {} } },
  });
  campaignApiService.createSimpleCampaign.mockResolvedValue({
    data: { success: true, data: { campaignId: '900', campaignName: 'x', channel: 'whatsapp', recipientCountHint: null } },
  });
  campaignApiService.deleteCampaign.mockResolvedValue({ data: { success: true } });
  campaignRunApiService.runCampaign.mockResolvedValue({ data: { success: true, data: { runId: 5, status: 'running' } } });
});

describe('bước Kênh — thẻ Telegram / WhatsApp', () => {
  it('hệ thống chưa bật kênh (visible=false) → KHÔNG vẽ thẻ; chỉ còn Email + Zalo', async () => {
    availabilityState.value = availability({
      telegram: { visible: false, available: true, ...meter },
      whatsapp: { visible: false, available: true, ...meter },
    });
    renderPage();
    await screen.findByTestId('simple-channel-email');
    expect(screen.queryByTestId('simple-channel-telegram')).toBeNull();
    expect(screen.queryByTestId('simple-channel-whatsapp')).toBeNull();
    expect(within(screen.getByTestId('simple-channel-grid')).getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByTestId('simple-channel-zalo_group')).toBeNull();
  });

  it('chỉ một kênh được bật → chỉ thẻ đó hiện (3 thẻ)', async () => {
    availabilityState.value = availability({ whatsapp: { visible: false, available: true, ...meter } });
    renderPage();
    expect(await screen.findByTestId('simple-channel-telegram')).toBeInTheDocument();
    expect(screen.queryByTestId('simple-channel-whatsapp')).toBeNull();
  });

  it('bật + gói có → ĐÚNG 4 thẻ (Email · Zalo · Telegram · WhatsApp), không mờ, lưới 4 cột từ lg; không còn thẻ Zalo nhóm', async () => {
    renderPage();
    expect(await screen.findByTestId('simple-channel-telegram')).not.toHaveAttribute('aria-disabled');
    expect(screen.getByTestId('simple-channel-whatsapp')).not.toHaveAttribute('aria-disabled');
    const grid = screen.getByTestId('simple-channel-grid');
    expect(within(grid).getAllByRole('button').map((button) => button.getAttribute('data-testid'))).toEqual([
      'simple-channel-email', 'simple-channel-zalo', 'simple-channel-telegram', 'simple-channel-whatsapp',
    ]);
    expect(grid.className).toContain('lg:grid-cols-4');
    expect(screen.getByTestId('simple-channel-zalo')).toHaveTextContent('Zalo');
    expect(screen.queryByTestId('simple-channel-zalo_group')).toBeNull();
  });

  it('bật nhưng gói không có → thẻ MỜ + ổ khoá, bấm mở modal gợi ý mua đúng kênh và KHÔNG chọn kênh', async () => {
    availabilityState.value = availability({
      telegram: { visible: true, available: false, reason: 'not_in_plan', detail: 'accounts', used: null, limit: null },
    });
    renderPage();
    const card = await screen.findByTestId('simple-channel-telegram');
    expect(card).toHaveAttribute('aria-disabled', 'true');
    expect(within(card).getByTestId('channel-lock-badge')).toBeInTheDocument();
    expect(screen.getByTestId('simple-channel-whatsapp')).not.toHaveAttribute('aria-disabled');

    fireEvent.click(card);
    expect(await screen.findByTestId('channel-unavailable-modal')).toHaveAttribute('data-channel', 'telegram');
    expect(screen.queryByTestId('simple-sender-section')).toBeNull();
    expect(nextButton()).toBeDisabled();
  });

  it('gói hết hạn → cả hai thẻ mờ; modal nêu kênh WhatsApp khi bấm thẻ WhatsApp', async () => {
    const expired = { visible: true, available: false, reason: 'plan_expired', detail: null, used: null, limit: null };
    availabilityState.value = availability({ telegram: expired, whatsapp: expired });
    renderPage();
    fireEvent.click(await screen.findByTestId('simple-channel-whatsapp'));
    expect(await screen.findByTestId('channel-unavailable-modal')).toHaveAttribute('data-channel', 'whatsapp');
  });

  it('Telegram: danh sách tài khoản lấy từ endpoint của trình dựng (đã lọc theo tài khoản được giao); tài khoản duy nhất được chọn sẵn, nêu số người đã nhắn', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('simple-channel-telegram'));
    const account = await screen.findByTestId('simple-sender-5');
    // Tự chọn tài khoản duy nhất chạy ở effect SAU lượt vẽ danh sách → chờ như ca WhatsApp (máy tải nặng thì lệch một nhịp, ca đỏ giả).
    await waitFor(() => expect(within(account).getByRole('button', { pressed: true })).toHaveTextContent('Shop Telegram'));
    expect(within(account).getByText('@shop_tg')).toBeInTheDocument();
    expect(screen.getByTestId('simple-sender-conversations-5')).toHaveTextContent('12 người đã nhắn');
    expect(campaignBuilderApiService.getTelegramAccountsForBuilder).toHaveBeenCalledTimes(1);
    expect(campaignBuilderApiService.getZaloAccounts).not.toHaveBeenCalled();
    expect(await enabledNext()).toBeEnabled();
  });

  it('WhatsApp: phiên offline không chọn được + link "Kết nối lại" tới cài đặt WhatsApp; phiên mở duy nhất được chọn sẵn', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('simple-channel-whatsapp'));
    const offline = await screen.findByTestId('simple-sender-7-old');
    expect(within(offline).getByRole('button', { name: /Số cũ/ })).toBeDisabled();
    expect(within(offline).getByText('Mất kết nối')).toBeInTheDocument();
    expect(within(offline).getByRole('link', { name: 'Kết nối lại' })).toHaveAttribute('href', '/app/settings/channels#whatsapp');
    const open = await screen.findByTestId(`simple-sender-${SESSION_KEY}`);
    await waitFor(() => expect(within(open).getByRole('button', { pressed: true })).toBeInTheDocument());
  });
});

describe('bước Người nhận theo kênh', () => {
  it('Telegram: hai nguồn "Người đã nhắn với tài khoản" (chọn sẵn) + "Nhóm Telegram", có giải thích Telegram không nhắn người lạ, không có dòng đồng ý nhận tin', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('simple-channel-telegram'));
    fireEvent.click(await enabledNext());
    const card = await screen.findByTestId('simple-audience-conversations');
    expect(card).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('simple-audience-telegram_groups')).toHaveAttribute('aria-pressed', 'false');
    for (const type of ['customers', 'landing', 'form', 'sheet', 'manual', 'zalo_friends', 'zalo_groups', 'whatsapp_groups']) {
      expect(screen.queryByTestId(`simple-audience-${type}`)).toBeNull();
    }
    expect(await screen.findByTestId('simple-conversations-panel')).toHaveTextContent('Telegram không cho nhắn người chưa từng nhắn với bạn');
    expect(await screen.findByTestId('simple-conversations-count')).toHaveTextContent('12 người đã nhắn với Shop Telegram');
    expect(screen.queryByTestId('simple-consent-note')).toBeNull();
    expect(await enabledNext()).toBeEnabled();
  });

  it('Telegram: tài khoản chưa có ai nhắn → cảnh báo, vẫn đi tiếp được (server cũng chỉ cảnh báo)', async () => {
    campaignBuilderApiService.getTelegramAccountsForBuilder.mockResolvedValue({
      data: { data: [{ id: 5, name: 'Shop Telegram', username: null, openConversationCount: 0 }] },
    });
    renderPage();
    fireEvent.click(await screen.findByTestId('simple-channel-telegram'));
    fireEvent.click(await enabledNext());
    expect(await screen.findByTestId('simple-conversations-empty')).toHaveTextContent('chưa có ai nhắn tới');
  });

  it('WhatsApp: 6 nguồn (đã nhắn · khách đã lưu · landing · biểu mẫu · Sheet · Nhóm WhatsApp), KHÔNG có "Tự nhập danh sách" / "Bạn bè Zalo" / Nhóm Zalo / Nhóm Telegram', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('simple-channel-whatsapp'));
    fireEvent.click(await enabledNext());
    await screen.findByTestId('simple-audience-conversations');
    for (const type of ['customers', 'landing', 'form', 'sheet', 'whatsapp_groups']) {
      expect(screen.getByTestId(`simple-audience-${type}`)).toBeInTheDocument();
    }
    for (const type of ['manual', 'zalo_friends', 'zalo_groups', 'telegram_groups']) {
      expect(screen.queryByTestId(`simple-audience-${type}`)).toBeNull();
    }
    // WhatsApp không tự chọn nguồn; Tiếp tục khoá cho tới khi bấm.
    expect(nextButton()).toBeDisabled();
    expect(screen.getByTestId('simple-consent-note')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('simple-audience-conversations'));
    expect(await screen.findByTestId('simple-conversations-panel')).toHaveTextContent('Chiến dịch gửi cho mọi người đã từng nhắn tới số WhatsApp này');
    expect(await enabledNext()).toBeEnabled();
  });
});

describe('thẻ Nhóm — Zalo / Telegram / WhatsApp', () => {
  const TG_GROUPS = [
    { chatId: -1001234567890, title: 'Lớp Telegram A', type: 'supergroup', membersCount: 120 },
    { chatId: -100987, title: 'Cộng đồng B', type: 'group', membersCount: null },
  ];
  const WA_GROUPS = [
    { recipientKey: '120363025246125486@g.us', title: 'Lớp WhatsApp 1', membersCount: 45 },
    { recipientKey: '120363025246125487@g.us', title: 'Khách VIP', membersCount: 9 },
  ];
  const lastPreviewBody = () => campaignApiService.previewSimpleCampaign.mock.calls.at(-1)[0];

  beforeEach(() => {
    campaignBuilderApiService.getTelegramAccountGroups.mockResolvedValue({ data: { data: TG_GROUPS } });
    campaignBuilderApiService.getWhatsAppAccountGroups.mockResolvedValue({ data: { data: WA_GROUPS } });
    campaignBuilderApiService.getZaloAccounts.mockResolvedValue({
      data: { data: { items: [{ id: 21, displayName: 'Nick A', status: 'connected', isActive: true, isLocked: false }] } },
    });
    campaignBuilderApiService.getPreviewZaloGroups.mockResolvedValue({ data: { data: { groups: [{ groupId: 'g1', groupName: 'Nhóm Khách VIP' }] } } });
  });

  async function toAudience(channel) {
    renderPage();
    fireEvent.click(await screen.findByTestId(`simple-channel-${channel}`));
    fireEvent.click(await enabledNext());
  }

  async function finishAfterAudience() {
    fireEvent.click(await enabledNext());
    fireEvent.click(await screen.findByTestId('simple-content-custom'));
    fireEvent.change(await screen.findByLabelText('Nội dung', { selector: 'textarea' }), { target: { value: 'Xin chào các nhóm' } });
    fireEvent.click(await enabledNext());
    await screen.findByTestId('simple-when-now');
    fireEvent.click(await enabledNext());
    const start = await screen.findByTestId('simple-start');
    await waitFor(() => expect(start).toBeEnabled());
    return start;
  }

  it('Nhóm Telegram: đọc nhóm của tài khoản, Tiếp tục khoá tới khi tick ≥ 1 nhóm; body gửi channel telegram + audience.groups [{recipientKey, display}]', async () => {
    await toAudience('telegram');
    fireEvent.click(await screen.findByTestId('simple-audience-telegram_groups'));
    expect(await screen.findByTestId('simple-adapter-groups-panel')).toBeInTheDocument();
    expect(campaignBuilderApiService.getTelegramAccountGroups).toHaveBeenCalledWith(5, {});
    expect(await screen.findByRole('checkbox', { name: /Lớp Telegram A/ })).not.toBeChecked();
    expect(nextButton()).toBeDisabled();
    expect(screen.getByTestId('simple-needs')).toHaveTextContent('ít nhất một nhóm');

    fireEvent.click(screen.getByRole('checkbox', { name: /Lớp Telegram A/ }));
    expect(screen.getByTestId('simple-adapter-groups-selected')).toHaveTextContent('Đã chọn 1 nhóm');
    expect(screen.queryByTestId('simple-consent-note')).toBeNull();
    const start = await finishAfterAudience();
    expect(lastPreviewBody()).toMatchObject({
      channel: 'telegram',
      senderId: 5,
      audience: { type: 'telegram_groups', groups: [{ recipientKey: '-1001234567890', display: 'Lớp Telegram A' }] },
      content: { mode: 'custom', body: 'Xin chào các nhóm' },
    });
    expect(screen.getByTestId('simple-summary')).toHaveTextContent('nhóm Telegram');
    fireEvent.click(start);
    await screen.findByTestId('simple-done');
    expect(campaignApiService.createSimpleCampaign.mock.calls[0][0].audience.type).toBe('telegram_groups');
  });

  it('Nhóm WhatsApp: đọc nhóm theo mã phiên; body mang senderKey + audience.groups; lọc theo tên', async () => {
    await toAudience('whatsapp');
    fireEvent.click(await screen.findByTestId('simple-audience-whatsapp_groups'));
    expect(await screen.findByRole('checkbox', { name: /Khách VIP/ })).toBeInTheDocument();
    expect(campaignBuilderApiService.getWhatsAppAccountGroups).toHaveBeenCalledWith(SESSION_KEY, {});
    fireEvent.change(screen.getByLabelText('Tìm nhóm theo tên'), { target: { value: 'vip' } });
    expect(screen.queryByRole('checkbox', { name: /Lớp WhatsApp 1/ })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /Khách VIP/ }));
    await finishAfterAudience();
    expect(lastPreviewBody()).toMatchObject({
      channel: 'whatsapp',
      senderKey: SESSION_KEY,
      audience: { type: 'whatsapp_groups', groups: [{ recipientKey: '120363025246125487@g.us', display: 'Khách VIP' }] },
    });
    expect(lastPreviewBody().senderId).toBeUndefined();
  });

  it('tài khoản chưa ở nhóm nào → báo rõ, Tiếp tục vẫn khoá', async () => {
    campaignBuilderApiService.getTelegramAccountGroups.mockResolvedValueOnce({ data: { data: [] } });
    await toAudience('telegram');
    fireEvent.click(await screen.findByTestId('simple-audience-telegram_groups'));
    expect(await screen.findByTestId('simple-adapter-groups-empty')).toHaveTextContent('chưa ở trong nhóm nào');
    expect(nextButton()).toBeDisabled();
  });

  it('đổi nguồn người ↔ nhóm KHÔNG mất nội dung đã soạn (Telegram)', async () => {
    await toAudience('telegram');
    fireEvent.click(await screen.findByTestId('simple-audience-telegram_groups'));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Cộng đồng B/ }));
    fireEvent.click(await enabledNext());
    fireEvent.click(await screen.findByTestId('simple-content-custom'));
    fireEvent.change(await screen.findByLabelText('Nội dung', { selector: 'textarea' }), { target: { value: 'Giữ nguyên nhé' } });
    // Lùi về bước người nhận, đổi sang "người đã nhắn" rồi đi lại.
    fireEvent.click(screen.getByTestId('simple-back'));
    fireEvent.click(await screen.findByTestId('simple-audience-conversations'));
    fireEvent.click(await enabledNext());
    expect(await screen.findByLabelText('Nội dung', { selector: 'textarea' })).toHaveValue('Giữ nguyên nhé');
    fireEvent.click(screen.getByTestId('simple-back'));
    // Quay lại nhóm: nhóm đã tick vẫn còn.
    fireEvent.click(await screen.findByTestId('simple-audience-telegram_groups'));
    expect(await screen.findByRole('checkbox', { name: /Cộng đồng B/ })).toBeChecked();
  });

  it('Zalo: thẻ "Nhóm Zalo" cạnh các nguồn cá nhân; chọn nhóm → body gửi channel zalo_group + groupIds; đổi về "Khách hàng đã lưu" → channel zalo, giữ nội dung', async () => {
    await toAudience('zalo');
    for (const type of ['customers', 'landing', 'form', 'sheet', 'manual', 'zalo_friends', 'zalo_groups']) {
      expect(screen.getByTestId(`simple-audience-${type}`)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByTestId('simple-audience-zalo_groups'));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Nhóm Khách VIP/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Dùng các nhóm đã chọn' }));
    await finishAfterAudience();
    expect(lastPreviewBody()).toMatchObject({ channel: 'zalo_group', senderId: 21, audience: { type: 'zalo_groups', groupIds: ['g1'] } });
    expect(screen.getByTestId('simple-summary')).toHaveTextContent('Zalo nhóm');

    // Về bước người nhận, đổi sang khách đã lưu: body gửi kênh Zalo thường, nội dung còn nguyên.
    fireEvent.click(screen.getByTestId('simple-back'));
    fireEvent.click(await screen.findByTestId('simple-back'));
    fireEvent.click(await screen.findByTestId('simple-back'));
    fireEvent.click(await screen.findByTestId('simple-audience-customers'));
    fireEvent.click(await enabledNext());
    expect(await screen.findByLabelText('Nội dung', { selector: 'textarea' })).toHaveValue('Xin chào các nhóm');
    fireEvent.click(await enabledNext());
    await screen.findByTestId('simple-when-now');
    fireEvent.click(await enabledNext());
    await waitFor(() => expect(lastPreviewBody()).toMatchObject({ channel: 'zalo', audience: { type: 'customers' } }));
  });
});

describe('bước Nội dung — trần chuỗi 5 tin, bộ đếm, mẫu vượt giới hạn', () => {
  async function reachContent(channel) {
    renderPage();
    fireEvent.click(await screen.findByTestId(`simple-channel-${channel}`));
    fireEvent.click(await enabledNext());
    if (channel === 'whatsapp') fireEvent.click(await screen.findByTestId('simple-audience-conversations'));
    fireEvent.click(await enabledNext());
    await screen.findByTestId('simple-content-custom');
  }

  it('Telegram: thêm tối đa 4 tin sau (tổng 5), rồi nút thêm bị khoá + dòng "tối đa 5 tin"', async () => {
    await reachContent('telegram');
    const add = screen.getByTestId('simple-followup-add');
    for (let i = 0; i < 4; i += 1) fireEvent.click(add);
    await waitFor(() => expect(screen.getByTestId('simple-followup-3')).toBeInTheDocument());
    expect(screen.queryByTestId('simple-followup-4')).toBeNull();
    expect(add).toBeDisabled();
    expect(screen.getByTestId('simple-followup-max')).toHaveTextContent('tối đa 5 tin');
  });

  it('chữ tự soạn: Telegram trần 4000 ký tự, WhatsApp 4096, có bộ đếm', async () => {
    await reachContent('telegram');
    fireEvent.click(screen.getByTestId('simple-content-custom'));
    const box = await screen.findByLabelText('Nội dung', { selector: 'textarea' });
    expect(box).toHaveAttribute('maxlength', '4000');
    fireEvent.change(box, { target: { value: 'Xin chào' } });
    expect(screen.getByTestId('simple-content-body-counter')).toHaveTextContent('8/4.000');
  });

  it('WhatsApp: ô soạn có trần 4096', async () => {
    await reachContent('whatsapp');
    fireEvent.click(screen.getByTestId('simple-content-custom'));
    expect(await screen.findByLabelText('Nội dung', { selector: 'textarea' })).toHaveAttribute('maxlength', '4096');
  });

  it('mẫu có quá 5 ảnh: báo lỗi rõ và Tiếp tục khoá; mẫu hợp lệ: có dòng "được chép vào chiến dịch" và Tiếp tục mở', async () => {
    await reachContent('telegram');
    fireEvent.click(screen.getByTestId('simple-content-template'));
    fireEvent.click(await screen.findByText('-- Chọn mẫu --'));
    fireEvent.click(await screen.findByText('Mẫu nhiều ảnh'));
    expect(await screen.findByTestId('simple-content-template-problem')).toHaveTextContent('quá 5 ảnh');
    expect(zaloTemplateApiService.getTemplateById).toHaveBeenCalledWith(7);
    expect(nextButton()).toBeDisabled();

    fireEvent.click(await screen.findByText('Mẫu nhiều ảnh'));
    fireEvent.click(await screen.findByText('Mẫu chào mừng'));
    expect(await screen.findByTestId('simple-content-template-copy-hint')).toHaveTextContent('chép vào chiến dịch');
    expect(screen.queryByTestId('simple-content-template-problem')).toBeNull();
    expect(await enabledNext()).toBeEnabled();
  });
});

describe('bước Thời gian + gửi', () => {
  it('Telegram/WhatsApp KHÔNG có thẻ "Tự động gửi cho người mới"; có Gửi ngay · Hẹn giờ · Lặp lại', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('simple-channel-whatsapp'));
    fireEvent.click(await enabledNext());
    fireEvent.click(await screen.findByTestId('simple-audience-conversations'));
    fireEvent.click(await enabledNext());
    fireEvent.click(await screen.findByTestId('simple-content-custom'));
    fireEvent.change(await screen.findByLabelText('Nội dung', { selector: 'textarea' }), { target: { value: 'Xin chào' } });
    fireEvent.click(await enabledNext());
    expect(await screen.findByTestId('simple-when-now')).toBeInTheDocument();
    expect(screen.getByTestId('simple-when-scheduled')).toBeInTheDocument();
    expect(screen.getByTestId('simple-when-recurring')).toBeInTheDocument();
    expect(screen.queryByTestId('simple-when-continuous')).toBeNull();
  });

  it('WhatsApp end-to-end: body gửi server mang senderKey (mã phiên chuỗi), không mang senderId; Xem lại nêu "WhatsApp"', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('simple-channel-whatsapp'));
    fireEvent.click(await enabledNext());
    fireEvent.click(await screen.findByTestId('simple-audience-conversations'));
    fireEvent.click(await enabledNext());
    fireEvent.click(await screen.findByTestId('simple-content-custom'));
    fireEvent.change(await screen.findByLabelText('Nội dung', { selector: 'textarea' }), { target: { value: 'Xin chào bạn' } });
    fireEvent.click(await enabledNext());
    fireEvent.click(await enabledNext());

    const start = await screen.findByTestId('simple-start');
    await waitFor(() => expect(start).toBeEnabled());
    expect(screen.getByTestId('simple-summary')).toHaveTextContent('Gửi WhatsApp từ Shop WA tới 12 người đã nhắn với tài khoản');
    const previewBody = campaignApiService.previewSimpleCampaign.mock.calls.at(-1)[0];
    expect(previewBody).toMatchObject({ channel: 'whatsapp', senderKey: SESSION_KEY, audience: { type: 'conversations' }, content: { mode: 'custom', body: 'Xin chào bạn' } });
    expect(previewBody).not.toHaveProperty('senderId');

    fireEvent.click(start);
    await waitFor(() => expect(campaignApiService.createSimpleCampaign).toHaveBeenCalledTimes(1));
    const body = campaignApiService.createSimpleCampaign.mock.calls[0][0];
    expect(body).toMatchObject({ channel: 'whatsapp', senderKey: SESSION_KEY });
    expect(body).not.toHaveProperty('senderId');
    expect(body).not.toHaveProperty('followUps');
    expect(await screen.findByTestId('simple-done')).toHaveTextContent('cách nhau vài giây');
  });

  it('Telegram end-to-end: body mang senderId số + audience conversations', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('simple-channel-telegram'));
    fireEvent.click(await enabledNext());
    fireEvent.click(await enabledNext());
    fireEvent.click(await screen.findByTestId('simple-content-custom'));
    fireEvent.change(await screen.findByLabelText('Nội dung', { selector: 'textarea' }), { target: { value: 'Chào bạn' } });
    fireEvent.click(await enabledNext());
    fireEvent.click(await enabledNext());
    const start = await screen.findByTestId('simple-start');
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);
    await waitFor(() => expect(campaignApiService.createSimpleCampaign).toHaveBeenCalledTimes(1));
    expect(campaignApiService.createSimpleCampaign.mock.calls[0][0]).toMatchObject({
      channel: 'telegram', senderId: 5, audience: { type: 'conversations' },
    });
    expect(campaignApiService.createSimpleCampaign.mock.calls[0][0]).not.toHaveProperty('senderKey');
  });
});
