/**
 * PLAN_DAT_LICH_CHIEN_DICH_NHAP_2026-09-23, PR-2 — modal "Thiết lập lịch chạy": chiến dịch
 * draft/paused phải hiện dải thông báo (không phải màu lỗi) + đổi nhãn nút thành "Kích hoạt & tạo
 * lịch", gửi kèm `activateCampaign: true`. Chiến dịch active giữ nguyên như cũ. Lỗi 409 (vd chiến
 * dịch 0 node) phải hiện NGAY TRONG modal, không đóng modal mất dữ liệu đã nhập.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CampaignRunModals from '../CampaignRunModals';
import viTranslations from '../../../../i18n/vi';

const mockT = (key, params = {}) => {
  const val = key.split('.').reduce((acc, part) => acc?.[part], viTranslations);
  if (typeof val !== 'string') return key;
  return val.replace(/\{(\w+)\}/g, (_, name) => (params[name] ?? `{${name}}`));
};
vi.mock('../../../../i18n', () => ({ useI18n: () => ({ t: mockT }) }));

const weeklyDayOptions = [{ value: '1', label: 'Thứ 2' }];

const baseScheduleForm = {
  scheduleName: 'Nhắc lịch',
  scheduleType: 'daily',
  scheduleDate: '',
  scheduleTime: '09:00',
  weeklyDay: '1',
  customIntervalDays: '2',
  delayValue: '30',
  delayUnit: 'minutes',
  delayPreviewAt: null,
  cronExpression: '',
  enabled: true,
};

const renderScheduleModal = (overrides = {}) => {
  const handleSaveSchedule = vi.fn();
  const closeScheduleModal = vi.fn();
  const setScheduleForm = vi.fn();
  render(
    <CampaignRunModals
      weeklyDayOptions={weeklyDayOptions}
      showScheduleModal
      selectedCampaign={{ id: 395, campaignName: 'CSKH sau hội thảo', status: 'draft' }}
      closeScheduleModal={closeScheduleModal}
      scheduleForm={baseScheduleForm}
      setScheduleForm={setScheduleForm}
      handleSaveSchedule={handleSaveSchedule}
      {...overrides}
    />,
  );
  return { handleSaveSchedule, closeScheduleModal, setScheduleForm };
};

describe('modal "Thiết lập lịch chạy" — chiến dịch chưa active (PR-2 Việc 6)', () => {
  it('chiến dịch draft + lịch BẬT → hiện dải thông báo (không phải màu lỗi) + nút "Kích hoạt & tạo lịch"', () => {
    renderScheduleModal();

    expect(screen.getByText(
      'Chiến dịch đang ở trạng thái Nháp. Tạo lịch sẽ kích hoạt chiến dịch — không gửi tin nào ngay bây giờ, tin chỉ gửi vào đúng giờ đã hẹn.',
    )).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /Kích hoạt & tạo lịch/i });
    expect(button).toBeInTheDocument();
    // Dải nhắc nhở dùng tông xanh dương, KHÔNG dùng tông đỏ/lỗi (plan mục 6.1: "màu nhắc nhở, không phải màu lỗi").
    const notice = screen.getByText(/Tạo lịch sẽ kích hoạt chiến dịch/);
    expect(notice.className).toContain('blue');
    expect(notice.className).not.toContain('red');
  });

  it('chiến dịch paused → nói "Tạm dừng"', () => {
    renderScheduleModal({ selectedCampaign: { id: 1, campaignName: 'X', status: 'paused' } });
    expect(screen.getByText(/trạng thái Tạm dừng/)).toBeInTheDocument();
  });

  it('bấm nút → gọi handleSaveSchedule (nơi gắn cờ activateCampaign vào payload thật)', () => {
    const { handleSaveSchedule } = renderScheduleModal();
    fireEvent.click(screen.getByRole('button', { name: /Kích hoạt & tạo lịch/i }));
    expect(handleSaveSchedule).toHaveBeenCalledTimes(1);
  });

  it('chiến dịch draft nhưng lịch đang TẮT (soạn sẵn, backend cho tạo luôn) → KHÔNG hiện dải, nút vẫn "Tạo lịch"', () => {
    renderScheduleModal({ scheduleForm: { ...baseScheduleForm, enabled: false } });
    expect(screen.queryByText(/Tạo lịch sẽ kích hoạt chiến dịch/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Tạo lịch$/i })).toBeInTheDocument();
  });

  it('chiến dịch active → không có dải thông báo, nút vẫn "Tạo lịch"', () => {
    renderScheduleModal({ selectedCampaign: { id: 2, campaignName: 'Y', status: 'active' } });
    expect(screen.queryByText(/kích hoạt chiến dịch/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Tạo lịch$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Kích hoạt & tạo lịch/i })).not.toBeInTheDocument();
  });

  it('lỗi 409 (vd chiến dịch 0 node) → hiện đúng câu lỗi NGAY TRONG modal, không phải chỉ toast', () => {
    renderScheduleModal({
      scheduleFormError: 'Không thể kích hoạt chiến dịch khi chưa có node nào',
    });
    expect(screen.getByText('Không thể kích hoạt chiến dịch khi chưa có node nào')).toBeInTheDocument();
    // Modal vẫn còn mở, dữ liệu đã nhập vẫn còn (tên lịch không bị mất) — kiểm gián tiếp qua input còn giá trị.
    expect(screen.getByDisplayValue('Nhắc lịch')).toBeInTheDocument();
  });

  it('không có lỗi (scheduleFormError mặc định) → không hiện dải đỏ', () => {
    renderScheduleModal();
    expect(document.querySelector('.bg-red-50')).toBeNull();
  });
});
