import { describe, it, expect } from 'vitest';
import { getScheduleCampaignNotActiveWarning } from '../campaignRunSchedule.helpers';
import viTranslations from '../../../../i18n/vi';
import enTranslations from '../../../../i18n/en';

const makeT = (dict) => (key, params = {}) => {
  const val = key.split('.').reduce((acc, part) => acc?.[part], dict);
  if (typeof val !== 'string') return key;
  return val.replace(/\{(\w+)\}/g, (_, name) => (params[name] ?? `{${name}}`));
};
const tVi = makeT(viTranslations);
const tEn = makeT(enTranslations);

describe('getScheduleCampaignNotActiveWarning (lệnh giao 21/09/2026, Việc 1.3)', () => {
  it('draft → nói "Nháp", KHÔNG nói "tạm dừng" (câu cũ cứng "đang tạm dừng" bắn sai cho chiến dịch Nháp)', () => {
    const text = getScheduleCampaignNotActiveWarning({ campaignStatus: 'draft' }, tVi);
    expect(text).toBe('Chiến dịch đang ở trạng thái Nháp — lịch này sẽ không gửi');
    expect(text).not.toMatch(/tạm dừng/i);
  });

  it('paused → nói "Tạm dừng"', () => {
    expect(getScheduleCampaignNotActiveWarning({ campaignStatus: 'paused' }, tVi))
      .toBe('Chiến dịch đang ở trạng thái Tạm dừng — lịch này sẽ không gửi');
  });

  it('trạng thái khác → dùng nguyên mã trạng thái, không hiện khoá dịch trần', () => {
    const text = getScheduleCampaignNotActiveWarning({ campaignStatus: 'pending_owner_approval' }, tVi);
    expect(text).toBe('Chiến dịch đang ở trạng thái pending_owner_approval — lịch này sẽ không gửi');
    expect(text).not.toContain('campaignRun.');
  });

  it.each([['active'], [''], [null], [undefined], ['  ']])('trạng thái %p → không cảnh báo', (campaignStatus) => {
    expect(getScheduleCampaignNotActiveWarning({ campaignStatus }, tVi)).toBe('');
  });

  it('không có lịch → không cảnh báo, không throw', () => {
    expect(getScheduleCampaignNotActiveWarning(undefined, tVi)).toBe('');
    expect(getScheduleCampaignNotActiveWarning(null, tVi)).toBe('');
  });

  it('bản tiếng Anh cũng nội suy đúng trạng thái', () => {
    expect(getScheduleCampaignNotActiveWarning({ campaignStatus: 'draft' }, tEn))
      .toBe('Campaign status is Draft — this schedule will not send');
    expect(getScheduleCampaignNotActiveWarning({ campaignStatus: 'paused' }, tEn))
      .toBe('Campaign status is Paused — this schedule will not send');
  });
});
