/**
 * PR-3 ước tính thời gian gửi — thẻ xác nhận của trợ lý AI hiện `confirmationView.estimate` (PR-2 backend)
 * nếu có; thiếu / null → không hiện gì và thẻ không vỡ.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfirmCreateCard } from '../AiChatbotCards';
import { ESTIMATE_438 } from '../../../campaigns/utils/__tests__/campaignEstimate.fixtures';
import viDict from '../../../../i18n/vi';

const makeT = (dict) => (key, params = {}) => {
  let current = dict;
  for (const part of key.split('.')) current = current?.[part];
  const text = typeof current === 'string' ? current : key;
  return text.replace(/\{(\w+)\}/g, (_, name) => (params[name] !== undefined ? String(params[name]) : `{${name}}`));
};

const baseView = (extra = {}) => ({
  campaign: { name: 'Kết bạn + nhắn 798 SĐT', description: '' },
  readyToCreate: true,
  totals: { sendSteps: 1 },
  blockingIssues: [],
  steps: [{
    key: 'zalo-1:0', nodeId: 'zalo-1', stepIndex: 0, channel: 'zalo_personal', title: 'Nhắn Zalo',
    timing: { anchor: 'start', value: 0, unit: 'days' }, sender: { id: 101, label: 'Nick Minh Zalo' },
    recipients: { mode: 'source', type: null, count: null, sourceLabel: 'Google Sheet' },
    content: { subject: '', bodyText: 'Xin chào', attachments: [] },
  }],
  ...extra,
});

const renderCard = (view) => render(
  <ConfirmCreateCard
    confirmationView={view}
    onConfirm={vi.fn()}
    onEdit={vi.fn()}
    onCancel={vi.fn()}
    onRetry={vi.fn()}
    isPreparing={false}
    prepareError={null}
    t={makeT(viDict)}
    locale="vi"
  />,
);

describe('ConfirmCreateCard — ước tính thời gian gửi', () => {
  it('có estimate → hiện ngày xong (giờ VN) + cảnh báo', () => {
    renderCard(baseView({ estimate: ESTIMATE_438 }));
    expect(screen.getByTestId('campaign-estimate-finish')).toHaveTextContent('08/10/2026 21:25');
    expect(screen.getByTestId('campaign-estimate-warnings')).toHaveTextContent('kéo dài khoảng 4 ngày');
  });

  it('estimate: null (server lỗi ước tính) → không hiện khối nào, thẻ vẫn đủ nút', () => {
    renderCard(baseView({ estimate: null }));
    expect(screen.queryByTestId('campaign-estimate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('campaign-estimate-unavailable')).not.toBeInTheDocument();
    expect(screen.getByText('Kết bạn + nhắn 798 SĐT')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(viDict.aiChatbot.createCampaignBtn) })).not.toBeDisabled();
  });

  it('thiếu hẳn trường estimate → không hiện gì', () => {
    renderCard(baseView());
    expect(screen.queryByTestId('campaign-estimate')).not.toBeInTheDocument();
  });

  it('estimate sai hình dạng (chuỗi) → bỏ qua, không vỡ', () => {
    renderCard(baseView({ estimate: 'lỗi' }));
    expect(screen.queryByTestId('campaign-estimate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('campaign-estimate-unavailable')).not.toBeInTheDocument();
  });
});
