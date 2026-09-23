/**
 * PLAN_DAT_LICH_CHIEN_DICH_NHAP_2026-09-23, PR-2 — modal "Thiết lập lịch chạy" phải biết trước khi
 * gửi API rằng tạo lịch BẬT cho chiến dịch draft/paused sẽ kích hoạt luôn chiến dịch, để hiện đúng
 * dải thông báo + đổi nhãn nút TRƯỚC khi người dùng bấm, không phải chỉ đọc lỗi 409 sau khi bấm hỏng.
 */
import { describe, it, expect } from 'vitest';
import {
  buildScheduleActivateCampaignNotice,
  scheduleCreationWillActivateCampaign,
} from '../campaignRunSchedule.helpers';
import viTranslations from '../../../../i18n/vi';
import enTranslations from '../../../../i18n/en';

const makeT = (dict) => (key, params = {}) => {
  const val = key.split('.').reduce((acc, part) => acc?.[part], dict);
  if (typeof val !== 'string') return key;
  return val.replace(/\{(\w+)\}/g, (_, name) => (params[name] ?? `{${name}}`));
};
const tVi = makeT(viTranslations);
const tEn = makeT(enTranslations);

describe('scheduleCreationWillActivateCampaign', () => {
  it.each(['draft', 'paused'])('%s + lịch BẬT (enabled=true) → true', (status) => {
    expect(scheduleCreationWillActivateCampaign(status, true)).toBe(true);
  });

  it.each(['draft', 'paused'])('%s + lịch TẮT (enabled=false) → false (backend cho tạo luôn, không cần kích hoạt)', (status) => {
    expect(scheduleCreationWillActivateCampaign(status, false)).toBe(false);
  });

  it('active → luôn false dù enabled true/false', () => {
    expect(scheduleCreationWillActivateCampaign('active', true)).toBe(false);
    expect(scheduleCreationWillActivateCampaign('active', false)).toBe(false);
  });

  it.each([[''], [null], [undefined]])('chưa biết trạng thái (%p) → false, không đoán bừa', (status) => {
    expect(scheduleCreationWillActivateCampaign(status, true)).toBe(false);
  });

  // Sửa lúc review 23/09: bản trước ghim "khác active → true" với lý do "đúng luật isEnabling phía
  // backend". Luật isEnabling nói về việc BẬT LỊCH, không phải về việc kích hoạt chiến dịch —
  // publishCampaignTx chỉ nhận draft/paused và trả null cho mọi trạng thái khác, nên giao diện hứa
  // "sẽ kích hoạt" cho pending_owner_approval là hứa thứ backend sẽ từ chối bằng 409.
  it.each([['pending_owner_approval'], ['completed'], ['stopped']])(
    'trạng thái backend KHÔNG kích hoạt được (%s) → false, không hứa suông',
    (status) => {
      expect(scheduleCreationWillActivateCampaign(status, true)).toBe(false);
    },
  );

  it.each([['draft'], ['paused']])('%s + enabled true → true', (status) => {
    expect(scheduleCreationWillActivateCampaign(status, true)).toBe(true);
  });
});

describe('buildScheduleActivateCampaignNotice', () => {
  it('draft → nói "Nháp"', () => {
    expect(buildScheduleActivateCampaignNotice('draft', tVi)).toBe(
      'Chiến dịch đang ở trạng thái Nháp. Tạo lịch sẽ kích hoạt chiến dịch — không gửi tin nào ngay bây giờ, tin chỉ gửi vào đúng giờ đã hẹn.',
    );
  });

  it('paused → nói "Tạm dừng"', () => {
    expect(buildScheduleActivateCampaignNotice('paused', tVi)).toContain('trạng thái Tạm dừng');
  });

  it('bản tiếng Anh cũng nội suy đúng trạng thái', () => {
    expect(buildScheduleActivateCampaignNotice('draft', tEn)).toBe(
      'This campaign is currently Draft. Creating this schedule will activate the campaign — nothing is sent right now, messages only go out at the scheduled time.',
    );
  });
});
