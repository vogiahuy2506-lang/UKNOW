import { describe, expect, it } from 'vitest';
import { getRunStatusLabel } from '../campaignRunStatus.helpers.js';
import viTranslations from '../../../../i18n/vi.js';
import enTranslations from '../../../../i18n/en.js';

const getNestedTranslation = (obj, path) => path.split('.').reduce((acc, part) => acc?.[part], obj);

function makeT(translations) {
  return (key) => {
    const val = getNestedTranslation(translations, key);
    return typeof val === 'string' ? val : key;
  };
}

const RUN_STATUSES = ['running', 'completed', 'failed', 'stopped'];

describe('getRunStatusLabel', () => {
  it('ghim đủ 4 khoá campaignRun.runStatus.* ở vi.js', () => {
    const tVi = makeT(viTranslations);
    expect(getRunStatusLabel(tVi, 'running')).toBe('Đang chạy');
    expect(getRunStatusLabel(tVi, 'completed')).toBe('Đã hoàn thành');
    expect(getRunStatusLabel(tVi, 'failed')).toBe('Lỗi');
    expect(getRunStatusLabel(tVi, 'stopped')).toBe('Đã dừng');
  });

  it('ghim đủ 4 khoá campaignRun.runStatus.* ở en.js', () => {
    const tEn = makeT(enTranslations);
    expect(getRunStatusLabel(tEn, 'running')).toBe('Running');
    expect(getRunStatusLabel(tEn, 'completed')).toBe('Completed');
    expect(getRunStatusLabel(tEn, 'failed')).toBe('Failed');
    expect(getRunStatusLabel(tEn, 'stopped')).toBe('Stopped');
  });

  it('mỗi khoá trong 4 khoá đều tồn tại thật (không rơi vào nhánh trả nguyên status) ở cả 2 file', () => {
    for (const translations of [viTranslations, enTranslations]) {
      for (const status of RUN_STATUSES) {
        const raw = getNestedTranslation(translations, `campaignRun.runStatus.${status}`);
        expect(typeof raw).toBe('string');
        expect(raw.length).toBeGreaterThan(0);
      }
    }
  });

  it('status lạ/chưa biết → trả NGUYÊN status, không trả tên khoá i18n', () => {
    const tVi = makeT(viTranslations);
    expect(getRunStatusLabel(tVi, 'pending')).toBe('pending');
    expect(getRunStatusLabel(tVi, 'cancelled')).toBe('cancelled');
  });

  it('status rỗng/null/undefined → trả chuỗi rỗng, không throw', () => {
    const tVi = makeT(viTranslations);
    expect(getRunStatusLabel(tVi, '')).toBe('');
    expect(getRunStatusLabel(tVi, null)).toBe('');
    expect(getRunStatusLabel(tVi, undefined)).toBe('');
  });

  it('t() trả nguyên khoá (bản dịch thiếu, giả lập) → helper vẫn không lộ khoá ra ngoài vì đã lọc bằng whitelist trước khi gọi t()', () => {
    const brokenT = (key) => key; // mô phỏng t() trả nguyên khoá khi thiếu bản dịch
    expect(getRunStatusLabel(brokenT, 'unknown_status')).toBe('unknown_status');
  });
});
