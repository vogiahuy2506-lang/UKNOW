import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, useI18n } from '../../../../i18n';
import ContentSectionForm from '../ContentSectionForm';
import { readContent } from '../sections';
import emailTemplateApiService from '../../../templates/services/emailTemplateApi.service';
import zaloTemplateApiService from '../../../templates/services/zaloTemplateApi.service';

vi.mock('../../../templates/services/emailTemplateApi.service', () => ({ default: { getTemplates: vi.fn(), getTemplateById: vi.fn() } }));
vi.mock('../../../templates/services/zaloTemplateApi.service', () => ({ default: { getTemplates: vi.fn(), getTemplateById: vi.fn() } }));

const node = (id, nodeType, config) => ({ id, type: 'task', data: { label: nodeType, nodeType, config } });

const valueOf = (campaignType, sendNode, lookups = {}) => {
  const { t } = { t: (key) => key };
  const result = readContent([node('start', 'manual_trigger', {}), sendNode], [{ id: 'e', source: 'start', target: sendNode.id }], { campaignType, lookups, t });
  return result.items[0].value;
};

const Wrapper = ({ value, ...props }) => {
  const { t } = useI18n();
  return <ContentSectionForm value={value} t={t} onSave={vi.fn()} onCancel={vi.fn()} onDirtyChange={vi.fn()} {...props} />;
};
const renderForm = (value, props = {}) => render(<I18nProvider><Wrapper value={value} {...props} /></I18nProvider>);

const EMAIL = node('mail', 'send_email', {
  sendMode: 'schedule',
  emailSteps: [
    { templateId: 7, delayValue: 0, delayUnit: 'days', delayFrom: 'prev' },
    { templateId: 8, delayValue: 2, delayUnit: 'days', delayFrom: 'start' },
  ],
});

beforeEach(() => {
  emailTemplateApiService.getTemplates.mockReset();
  zaloTemplateApiService.getTemplates.mockReset();
  emailTemplateApiService.getTemplates.mockResolvedValue({ data: { data: { items: [{ id: 7, templateName: 'Chào mừng' }, { id: 8, templateName: 'Nhắc lại' }] } } });
  zaloTemplateApiService.getTemplates.mockResolvedValue({ data: { data: { items: [{ id: 21, templateName: 'Mời học', bodyText: 'Nội dung' }] } } });
});

describe('ContentSectionForm', () => {
  it('tải danh sách mẫu MỘT lần cho mọi tin (api.js khử trùng GET song song nên mỗi tin tự tải thì các tin còn lại kẹt "đang tải")', async () => {
    renderForm(valueOf('email', EMAIL));
    expect(await screen.findAllByRole('button', { name: /Chào mừng|Nhắc lại/ })).toHaveLength(2);
    expect(emailTemplateApiService.getTemplates).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Đang tải mẫu tin...')).not.toBeInTheDocument();
  });

  it('bước dựng tay "tính từ tin đầu" hiện đúng chữ và giữ nguyên khi đổi số; bước prev hiện "kể từ tin trước"', async () => {
    renderForm(valueOf('email', EMAIL));
    expect(screen.getByTestId('settings-content-from-1')).toHaveTextContent('kể từ tin đầu');
    expect(screen.queryByTestId('settings-content-delay-0')).not.toBeInTheDocument();
  });

  it('khoảng chờ sai (0, để trống) báo lỗi và khoá nút Lưu; sửa đúng thì Lưu trả giá trị với độ trễ mới', async () => {
    const onSave = vi.fn();
    renderForm(valueOf('email', EMAIL), { onSave });
    await screen.findAllByRole('button', { name: /Nhắc lại/ });
    fireEvent.change(screen.getByTestId('settings-content-delay-1'), { target: { value: '0' } });
    expect(screen.getByTestId('settings-content-delay-error-1')).toBeInTheDocument();
    expect(screen.getByTestId('settings-content-save')).toBeDisabled();
    fireEvent.change(screen.getByTestId('settings-content-delay-1'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('settings-content-save'));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].steps[1]).toMatchObject({ delayValue: '3', delayUnit: 'days', origIndex: 1 });
  });

  it('xoá tin 2 được, tin 1 không có nút xoá; tới trần kênh thì khoá nút thêm và hiện câu giới hạn', async () => {
    const tg = node('tg', 'send_telegram', { steps: [{ templateId: null, message: 'Một' }, { templateId: null, message: 'Hai', delayValue: 1, delayUnit: 'hours' }] });
    const onDirtyChange = vi.fn();
    renderForm(valueOf('telegram', tg), { onDirtyChange });
    expect(screen.queryByTestId('settings-content-remove-0')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('settings-content-remove-1'));
    expect(screen.queryByTestId('settings-content-step-1')).not.toBeInTheDocument();
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
    for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByTestId('settings-content-add'));
    expect(screen.getByTestId('settings-content-add')).toBeDisabled();
    expect(screen.getByTestId('settings-content-max')).toHaveTextContent('5');
  });

  it('tin tự soạn email: cần tiêu đề + nội dung mới Lưu được; có ghi chú mẫu sẽ được lưu vào thư viện', async () => {
    const onSave = vi.fn();
    renderForm(valueOf('email', node('mail', 'send_email', { sendMode: 'all', emailSteps: [{ templateId: 7, delayValue: 0, delayUnit: 'days' }] })), { onSave });
    fireEvent.click(screen.getByTestId('settings-content-mode-0-custom'));
    expect(screen.getByTestId('settings-content-custom-hint')).toBeInTheDocument();
    expect(screen.getByTestId('settings-content-save')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Tiêu đề thư'), { target: { value: 'Ưu đãi' } });
    expect(screen.getByTestId('settings-content-save')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Nội dung'), { target: { value: 'Chào bạn' } });
    expect(screen.getByTestId('settings-content-save')).toBeEnabled();
    fireEvent.click(screen.getByTestId('settings-content-save'));
    expect(onSave.mock.calls[0][0].steps[0].content).toMatchObject({ mode: 'custom', subject: 'Ưu đãi', body: 'Chào bạn' });
  });

  it('Zalo nhóm dùng kho mẫu Zalo; chọn mẫu rồi Lưu trả templateId mới', async () => {
    const onSave = vi.fn();
    const group = node('zg', 'send_zalo_group', { zaloGroupSendMode: 'all', zaloGroupTemplateSteps: [{ templateId: null, message: '', delayValue: 0, delayUnit: 'days' }] });
    renderForm(valueOf('zalo_group', group), { onSave });
    const step = screen.getByTestId('settings-content-step-0');
    fireEvent.click(await within(step).findByRole('button', { name: '-- Chọn mẫu --' }));
    fireEvent.click(within(step).getByRole('button', { name: 'Mời học' }));
    fireEvent.click(screen.getByTestId('settings-content-save'));
    expect(onSave.mock.calls[0][0].steps[0].content).toMatchObject({ mode: 'template', templateId: 21 });
    expect(emailTemplateApiService.getTemplates).not.toHaveBeenCalled();
  });
});
