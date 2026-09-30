import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import fs from 'fs';
import { fileURLToPath } from 'url';

/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-1 — CẢ 11 chỗ đếm email đã gửi phải lọc đủ 7 trạng thái.
 *
 * Vì sao có spec này dù đã có integration: test mock trọn DB không bắt được SQL sai (vụ `cj.campaign_id`,
 * `chatbots`), còn integration thì chạy trên bootstrap.sql khai `status` VARCHAR chứ không phải enum
 * production. Nên ở đây soi THẲNG câu SQL mỗi hàm đếm gửi đi: danh sách `status IN (…)` của email_messages
 * phải đúng bảy giá trị viết tay dưới đây — KHÔNG so với hằng EMAIL_SENT_STATUSES để một hằng thiếu 'opened'
 * cũng không lọt. Trả một chỗ về bộ 3 cũ (sent/delivered/bounced) → đúng ca của chỗ đó đỏ.
 */
const BAY_TRANG_THAI_DA_GUI = ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'spam', 'unsubscribed'];

const mockDbQuery = jest.fn();

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: mockDbQuery },
}));

jest.unstable_mockModule('../subscriptionStatus.util.js', () => ({
  getSubscriptionStatus: jest.fn(),
}));

jest.unstable_mockModule('../billingCycle.util.js', () => ({
  EFFECTIVE_PLAN_ID_SQL: 'u.active_plan_id',
  resolveBillingUserId: jest.fn(),
  getBillingCycle: jest.fn(),
}));

jest.unstable_mockModule('../../services/payment/topupWallet.service.js', () => ({
  hasWalletRemaining: jest.fn(async () => false),
  WALLET_ITEM_BY_CHANNEL: { email: 'emails', zalo: 'zalo_messages' },
  maybeDebitWalletForSend: jest.fn(),
  getWalletSnapshot: jest.fn(),
}));

// Registry kênh kéo theo cả cổng Telegram/WhatsApp (in cảnh báo STUB) — chỉ cần hàm trả danh sách kênh
// adapter cho vế Zalo của countCombinedSentInCycle; vế email đang soi không dùng tới.
jest.unstable_mockModule('../../services/campaign/campaignChannelRegistry.service.js', () => ({
  default: { getAdapterChannelKeysByQuotaChannel: jest.fn(() => []) },
}));

const userSendLimit = await import('../userSendLimit.util.js');
const sendQuotaRepository = await import('../../repositories/sendQuota.repository.js');

const dayStart = new Date('2026-09-29T17:00:00.000Z');
const dayEnd = new Date('2026-09-30T17:00:00.000Z');
const cycleStart = new Date('2026-09-01T00:00:00.000Z');
const cycleEnd = new Date('2026-10-01T00:00:00.000Z');
const queryable = { query: mockDbQuery };

/**
 * Rút các danh sách `status IN (…)` từ câu SQL rồi giữ lại danh sách của email_messages. Danh sách trạng
 * thái của send_quota_reservations (reserved/sending/uncertain/consumed) cũng khớp mẫu này nhưng không
 * chứa 'sent' nên bị loại.
 */
const layDanhSachTrangThaiEmail = (sql) =>
  [...sql.matchAll(/\bstatus\s+IN\s*\(([^)]*)\)/gi)]
    .map((khop) => khop[1].split(',').map((phanTu) => phanTu.trim().replace(/^'|'$/g, '')))
    .filter((danhSach) => danhSach.includes('sent'));

const BO_BA_CU = /\bstatus\s+IN\s*\(\s*'sent'\s*,\s*'delivered'\s*,\s*'bounced'\s*\)/;

// 11 chỗ = 6 trong userSendLimit.util.js + 5 trong sendQuota.repository.js (hàm countEmployeeEmailSentThisMonth
// có hai chỗ: nhánh kỳ và nhánh tháng dương lịch).
const CAC_CHO_DEM = [
  ['userSendLimit.countEmployeeEmailSentToday (nhân viên/ngày)',
    () => userSendLimit.countEmployeeEmailSentToday(1, 2)],
  ['userSendLimit.countEmployeeEmailSentThisMonth — nhánh kỳ (nhân viên/kỳ)',
    () => userSendLimit.countEmployeeEmailSentThisMonth(1, 2, cycleStart, cycleEnd)],
  ['userSendLimit.countEmployeeEmailSentThisMonth — nhánh tháng dương lịch',
    () => userSendLimit.countEmployeeEmailSentThisMonth(1, 2)],
  ['userSendLimit.countEmailSentToday (cổng gói/ngày)',
    () => userSendLimit.countEmailSentToday(1)],
  ['userSendLimit.countEmailSentInCycleUncached (cổng gói/kỳ)',
    () => userSendLimit.countEmailSentInCycleUncached(1, cycleStart, cycleEnd)],
  ['userSendLimit.countCombinedSentInCycle (cổng tổng tin/kỳ)',
    () => userSendLimit.countCombinedSentInCycle(1, cycleStart, cycleEnd)],
  ['sendQuota.countEmailSentTodayWithLedger (sổ cái/ngày)',
    () => sendQuotaRepository.countEmailSentTodayWithLedger(queryable, 1, dayStart, dayEnd)],
  ['sendQuota.countEmailSentTodayByAccount (trần theo tài khoản gửi/ngày)',
    () => sendQuotaRepository.countEmailSentTodayByAccount(queryable, 5, dayStart, dayEnd)],
  ['sendQuota.countEmailSentInCycleWithLedger (sổ cái/kỳ)',
    () => sendQuotaRepository.countEmailSentInCycleWithLedger(queryable, 1, cycleStart, cycleEnd)],
  ['sendQuota.countEmployeeSentTodayWithLedger — email (nhân viên/ngày, sổ cái)',
    () => sendQuotaRepository.countEmployeeSentTodayWithLedger(queryable, 1, 2, 'email', dayStart, dayEnd)],
  ['sendQuota.countEmployeeSentInCycleWithLedger — email (nhân viên/kỳ, sổ cái)',
    () => sendQuotaRepository.countEmployeeSentInCycleWithLedger(queryable, 1, 2, 'email', cycleStart, cycleEnd)],
];

describe('11 chỗ đếm email đã gửi lọc đủ 7 trạng thái', () => {
  beforeEach(() => {
    mockDbQuery.mockReset();
    mockDbQuery.mockResolvedValue({ rows: [{ total: 0 }] });
    userSendLimit._clearQuotaCache();
  });

  it('bảng kiểm có đúng 11 chỗ', () => {
    expect(CAC_CHO_DEM).toHaveLength(11);
  });

  it.each(CAC_CHO_DEM)('%s', async (_ten, goiHam) => {
    await goiHam();

    expect(mockDbQuery).toHaveBeenCalledTimes(1);
    const sql = String(mockDbQuery.mock.calls[0][0]);

    const danhSachEmail = layDanhSachTrangThaiEmail(sql);
    expect(danhSachEmail).toHaveLength(1);
    expect([...danhSachEmail[0]].sort()).toEqual([...BAY_TRANG_THAI_DA_GUI].sort());
    expect(sql).not.toMatch(BO_BA_CU);
  });
});

/**
 * Bảng kiểm ở trên phải phủ HẾT các chỗ trong mã: thêm chỗ đếm email thứ 12 mà quên đưa vào bảng
 * thì đỏ ở đây — thay vì một chỗ mới lặng lẽ không được soi.
 */
describe('bảng kiểm phủ đủ mọi chỗ dùng hằng trong mã nguồn', () => {
  const docNguon = (duongDanTuongDoi) => fs.readFileSync(fileURLToPath(new URL(duongDanTuongDoi, import.meta.url)), 'utf8');
  const demCho = (noiDung) => (noiDung.match(/status IN \$\{EMAIL_SENT_STATUS_SQL_LIST\}/g) || []).length;

  it('userSendLimit.util.js có đúng 6 chỗ', () => {
    expect(demCho(docNguon('../userSendLimit.util.js'))).toBe(6);
  });

  it('sendQuota.repository.js có đúng 5 chỗ', () => {
    expect(demCho(docNguon('../../repositories/sendQuota.repository.js'))).toBe(5);
  });
});
