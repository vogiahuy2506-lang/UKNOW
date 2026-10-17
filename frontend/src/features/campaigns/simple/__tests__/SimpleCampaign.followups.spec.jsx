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

// PLAN_HAI_TAB_TUNG_BUOC_SO_DO_2026-10-17, PR-C: chuỗi tin ở bước Nội dung của trình tạo. API mock theo hợp đồng §3.1.

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

const FORMS = [{ id: 7, title: 'Đăng ký học thử', submissionCount: 12, settings: { consentEnabled: true } }];
const readyPreview = () => ({
  data: { success: true, data: { readyToCreate: true, issues: [], estimate: null, recipientCount: 12, summary: {} } },
});
const created = { data: { success: true, data: { campaignId: '900', campaignName: 'Chiến dịch từng bước', channel: 'email', recipientCountHint: 12 } } };
const runOk = { data: { success: true, data: { runId: 5, campaignId: '900', status: 'running' } } };

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

const nextButton = () => screen.getByTestId('simple-next');
const enabledNext = async () => {
  await waitFor(() => expect(nextButton()).toBeEnabled());
  return nextButton();
};

async function reachContentStep() {
  renderPage();
  fireEvent.click(await screen.findByTestId('simple-channel-email'));
  fireEvent.click(await enabledNext());
  fireEvent.click(await screen.findByTestId('simple-audience-form'));
  fireEvent.click(await screen.findByRole('checkbox', { name: /Đăng ký học thử/ }));
  fireEvent.click(await enabledNext());
  await screen.findByTestId('simple-content-custom');
}

async function fillFirstCustom() {
  fireEvent.click(screen.getByTestId('simple-content-custom'));
  fireEvent.change(await screen.findByLabelText('Tiêu đề thư', { selector: '#simple-content-subject' }), { target: { value: 'Tiêu đề 1' } });
  fireEvent.change(document.getElementById('simple-content-body'), { target: { value: 'Thân tin 1' } });
}

const followUpCard = (index) => screen.getByTestId(`simple-followup-${index}`);
const fillFollowUpCustom = async (index, { subject, body }) => {
  fireEvent.click(screen.getByTestId(`simple-followup-${index}-content-custom`));
  const card = within(followUpCard(index));
  fireEvent.change(await card.findByLabelText('Tiêu đề thư'), { target: { value: subject } });
  fireEvent.change(card.getByLabelText('Nội dung', { selector: 'textarea' }), { target: { value: body } });
};
const setDelay = (index, value, unit) => {
  fireEvent.change(screen.getByTestId(`simple-followup-delay-${index}`), { target: { value: String(value) } });
  if (unit) fireEvent.change(screen.getByTestId(`simple-followup-unit-${index}`), { target: { value: unit } });
};

describe('Chuỗi tin ở bước Nội dung (PR-C)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    availabilityState.value = openAvailability();
    campaignBuilderApiService.getActiveEmailSettings.mockResolvedValue({
      data: { data: { items: [{ id: 11, name: 'Shop ABC', email: 'shop@abc.vn', status: 'active' }] } },
    });
    campaignBuilderApiService.getZaloAccounts.mockResolvedValue({ data: { data: { items: [] } } });
    campaignBuilderApiService.listForms.mockResolvedValue({ data: { data: FORMS } });
    emailTemplateApiService.getTemplates.mockResolvedValue({
      data: { data: { items: [{ id: 5, templateName: 'Ưu đãi tháng 10', category: '' }] } },
    });
    zaloTemplateApiService.getTemplates.mockResolvedValue({ data: { data: { items: [] } } });
    customerApiService.getCustomers.mockResolvedValue({ data: { data: { items: [], pagination: { total: 3 } } } });
    chatbotApiService.getZaloFriends.mockResolvedValue({ data: { data: { items: [], total: 0, totalPages: 1, page: 1 } } });
    campaignApiService.previewSimpleCampaign.mockResolvedValue(readyPreview());
    campaignApiService.createSimpleCampaign.mockResolvedValue(created);
    campaignApiService.deleteCampaign.mockResolvedValue({ data: { success: true } });
    campaignRunApiService.runCampaign.mockResolvedValue(runOk);
  });

  it('thêm tin → thẻ "Tin 2" mặc định sau 1 ngày; thêm tiếp ra "Tin 3"; xoá tin 2 thì tin 3 thành tin 2', async () => {
    await reachContentStep();
    expect(screen.queryByTestId('simple-followup-0')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('simple-followup-add'));
    expect(followUpCard(0)).toHaveTextContent('Tin 2');
    expect(screen.getByTestId('simple-followup-delay-0')).toHaveValue(1);
    expect(screen.getByTestId('simple-followup-unit-0')).toHaveValue('days');
    fireEvent.click(screen.getByTestId('simple-followup-add'));
    setDelay(1, 7);
    expect(followUpCard(1)).toHaveTextContent('Tin 3');

    fireEvent.click(screen.getByTestId('simple-followup-remove-0'));
    expect(screen.queryByTestId('simple-followup-1')).not.toBeInTheDocument();
    expect(followUpCard(0)).toHaveTextContent('Tin 2');
    expect(screen.getByTestId('simple-followup-delay-0')).toHaveValue(7);
  });

  it('tối đa 10 tin: sau 9 tin sau thì nút thêm bị khoá và có dòng giải thích', async () => {
    await reachContentStep();
    for (let i = 0; i < 9; i += 1) fireEvent.click(screen.getByTestId('simple-followup-add'));
    expect(screen.getByTestId('simple-followup-8')).toHaveTextContent('Tin 10');
    expect(screen.getByTestId('simple-followup-add')).toBeDisabled();
    expect(screen.getByTestId('simple-followup-max')).toHaveTextContent('10');
    fireEvent.click(screen.getByTestId('simple-followup-add'));
    expect(screen.queryByTestId('simple-followup-9')).not.toBeInTheDocument();
  });

  it('độ trễ ≤ 0, rỗng hoặc số lẻ → khoá Tiếp tục và báo lỗi; số nguyên dương thì mở', async () => {
    await reachContentStep();
    await fillFirstCustom();
    fireEvent.click(screen.getByTestId('simple-followup-add'));
    await fillFollowUpCustom(0, { subject: 'Tiêu đề 2', body: 'Thân tin 2' });
    await waitFor(() => expect(nextButton()).toBeEnabled());

    for (const bad of ['0', '-1', '', '1.5']) {
      setDelay(0, bad);
      expect(nextButton()).toBeDisabled();
      expect(screen.getByTestId('simple-followup-delay-error-0')).toBeInTheDocument();
    }
    setDelay(0, 2);
    await waitFor(() => expect(nextButton()).toBeEnabled());
    expect(screen.queryByTestId('simple-followup-delay-error-0')).not.toBeInTheDocument();
  });

  it('tin sau chưa chọn nội dung → khoá Tiếp tục', async () => {
    await reachContentStep();
    await fillFirstCustom();
    await waitFor(() => expect(nextButton()).toBeEnabled());
    fireEvent.click(screen.getByTestId('simple-followup-add'));
    expect(nextButton()).toBeDisabled();
  });

  it('preview + tạo gửi followUps đúng thứ tự (mẫu rồi tự soạn, email có tiêu đề từng tin); câu tóm tắt "chuỗi 3 tin trong 5 ngày"', async () => {
    await reachContentStep();
    await fillFirstCustom();
    fireEvent.click(screen.getByTestId('simple-followup-add'));
    fireEvent.click(screen.getByTestId('simple-followup-add'));

    // Tin 2: mẫu có sẵn, sau 2 ngày.
    fireEvent.click(screen.getByTestId('simple-followup-0-content-template'));
    fireEvent.click(await within(followUpCard(0)).findByText('-- Chọn mẫu --'));
    fireEvent.click(await screen.findByText('Ưu đãi tháng 10'));
    setDelay(0, 2);
    // Tin 3: tự soạn, sau 72 giờ (= 3 ngày) → tổng 5 ngày.
    await fillFollowUpCustom(1, { subject: 'Tiêu đề 3', body: 'Thân tin 3' });
    setDelay(1, 72, 'hours');

    fireEvent.click(await enabledNext());
    expect(await screen.findByTestId('simple-when-now')).toBeInTheDocument();
    fireEvent.click(await enabledNext());

    const start = await screen.findByTestId('simple-start');
    await waitFor(() => expect(start).toBeEnabled());
    expect(screen.getByTestId('simple-summary')).toHaveTextContent('chuỗi 3 tin trong 5 ngày');

    const expectedFollowUps = [
      { delayValue: 2, delayUnit: 'days', content: { mode: 'template', templateId: 5 } },
      { delayValue: 72, delayUnit: 'hours', content: { mode: 'custom', subject: 'Tiêu đề 3', body: 'Thân tin 3' } },
    ];
    const previewBody = campaignApiService.previewSimpleCampaign.mock.calls.at(-1)[0];
    expect(previewBody.followUps).toEqual(expectedFollowUps);

    fireEvent.click(start);
    await waitFor(() => expect(campaignApiService.createSimpleCampaign).toHaveBeenCalledTimes(1));
    const createBody = campaignApiService.createSimpleCampaign.mock.calls[0][0];
    expect(createBody.followUps).toEqual(expectedFollowUps);
    expect(createBody.content).toEqual({ mode: 'custom', subject: 'Tiêu đề 1', body: 'Thân tin 1' });
  });

  it('không có tin sau → preview và tạo KHÔNG có trường followUps; xoá hết tin sau cũng vậy', async () => {
    await reachContentStep();
    await fillFirstCustom();
    fireEvent.click(screen.getByTestId('simple-followup-add'));
    fireEvent.click(screen.getByTestId('simple-followup-remove-0'));
    fireEvent.click(await enabledNext());
    fireEvent.click(await enabledNext());

    const start = await screen.findByTestId('simple-start');
    await waitFor(() => expect(start).toBeEnabled());
    expect(screen.getByTestId('simple-summary')).not.toHaveTextContent('chuỗi');
    expect(campaignApiService.previewSimpleCampaign.mock.calls.at(-1)[0]).not.toHaveProperty('followUps');
    fireEvent.click(start);
    await waitFor(() => expect(campaignApiService.createSimpleCampaign).toHaveBeenCalledTimes(1));
    expect(campaignApiService.createSimpleCampaign.mock.calls[0][0]).not.toHaveProperty('followUps');
  });
});
