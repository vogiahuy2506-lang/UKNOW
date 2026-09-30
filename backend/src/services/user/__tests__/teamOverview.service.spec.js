/**
 * PR-7 (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30) — điều phối của khối "Hoạt động nhóm": nguồn nào được gọi với tham số nào,
 * và các dòng được ghép ra sao. Repository / module số liệu gửi tin / hàm cổng chặn đều được giả lập; SQL thật và phép cộng
 * thật ở tests/integration/teamOverview.test.js (test mock DB không bắt được SQL sai cột).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const repo = {
  findTeamMembers: jest.fn(),
  findOwnerProfile: jest.fn(),
  findRunningCampaignsByCreator: jest.fn(),
  findAiCreditUsedByActor: jest.fn(),
  findLastActivityByActor: jest.fn(),
};
const sendStats = { getActorTotals: jest.fn(), getChannelTotals: jest.fn() };
const usageTracking = { getCreditUsageForCycle: jest.fn(), getUserPlanLimits: jest.fn() };
const billingCycle = { getBillingCycle: jest.fn() };
const employeeRepo = { findOwnerIdForEmployee: jest.fn() };

jest.unstable_mockModule('../../../repositories/user/teamOverview.repository.js', () => repo);
jest.unstable_mockModule('../../stats/sendStats.service.js', () => sendStats);
jest.unstable_mockModule('../../payment/usageTracking.service.js', () => ({ default: usageTracking }));
jest.unstable_mockModule('../../../utils/billingCycle.util.js', () => billingCycle);
jest.unstable_mockModule('../../../repositories/user/employee.repository.js', () => employeeRepo);

const { getTeamOverview, getMyContribution } = await import('../teamOverview.service.js');

const OWNER = 10;
const N1 = 21;
const N2 = 22;
const CYCLE = {
  hasPlan: true,
  billingUserId: OWNER,
  cycleStart: new Date('2026-09-10T00:00:00.000Z'),
  cycleEnd: new Date('2026-10-10T00:00:00.000Z'),
};
const todayVn = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

function arrange({
  members = [
    { id: N1, username: 'n1', fullName: 'N Một', avatarUrl: null, status: 'active', memberStatus: 'active', periodAiCreditLimit: 10 },
    { id: N2, username: 'n2', fullName: null, avatarUrl: null, status: 'active', memberStatus: 'active', periodAiCreditLimit: null },
  ],
  actorTotals = [],
  channelTotals = [{ channel: 'email', sent: 0, failed: 0 }],
  running = [],
  aiByActor = [],
  companyAiUsed = 0,
  cycle = CYCLE,
  planLimit = 1000,
  lastActive = [],
} = {}) {
  repo.findTeamMembers.mockResolvedValue(members);
  repo.findOwnerProfile.mockResolvedValue({ id: OWNER, username: 'owner', fullName: 'Chủ', avatarUrl: null, status: 'active' });
  repo.findRunningCampaignsByCreator.mockResolvedValue(running);
  repo.findAiCreditUsedByActor.mockResolvedValue(aiByActor);
  repo.findLastActivityByActor.mockResolvedValue(lastActive);
  sendStats.getActorTotals.mockResolvedValue(actorTotals);
  sendStats.getChannelTotals.mockResolvedValue(channelTotals);
  usageTracking.getCreditUsageForCycle.mockResolvedValue({ used: companyAiUsed, cycle });
  usageTracking.getUserPlanLimits.mockResolvedValue({ ai_credits_per_period: planLimit });
  billingCycle.getBillingCycle.mockResolvedValue(cycle);
}

beforeEach(() => {
  for (const group of [repo, sendStats, usageTracking, billingCycle, employeeRepo]) {
    for (const fn of Object.values(group)) fn.mockReset();
  }
});

describe('getTeamOverview — nguồn nào được gọi với tham số nào', () => {
  it('tin đã gửi: CẢ HAI hàm số liệu nhận cùng phạm vi chủ, cùng cửa sổ tháng VN, và cùng loại kênh kết bạn', async () => {
    arrange();
    await getTeamOverview(OWNER);
    const today = todayVn();
    const expectedWindow = { fromDate: `${today.slice(0, 7)}-01`, toDate: today };
    expect(sendStats.getActorTotals).toHaveBeenCalledTimes(1);
    expect(sendStats.getChannelTotals).toHaveBeenCalledTimes(1);
    expect(sendStats.getActorTotals).toHaveBeenCalledWith({ ownerId: OWNER }, expectedWindow, { excludeChannels: ['zalo_friend_request'] });
    expect(sendStats.getChannelTotals).toHaveBeenCalledWith({ ownerId: OWNER }, expectedWindow, { excludeChannels: ['zalo_friend_request'] });
  });

  it('kỳ AI lấy theo chủ (ownerContextId tường minh) và truy vấn lượt AI dùng ĐÚNG khung [đầu kỳ, cuối kỳ) của chủ', async () => {
    arrange();
    await getTeamOverview(OWNER);
    expect(billingCycle.getBillingCycle).toHaveBeenCalledWith(OWNER, { ownerContextId: OWNER });
    expect(repo.findAiCreditUsedByActor).toHaveBeenCalledWith(OWNER, CYCLE.cycleStart, CYCLE.cycleEnd);
  });

  it('"Cả công ty" về lượt AI dùng hàm của cổng chặn với kỳ đã tính; hạn mức là hạn mức lượt AI của gói', async () => {
    arrange({ companyAiUsed: 42, planLimit: 500 });
    const overview = await getTeamOverview(OWNER);
    expect(usageTracking.getCreditUsageForCycle).toHaveBeenCalledWith(OWNER, CYCLE);
    expect(overview.company.aiCreditsUsed).toBe(42);
    expect(overview.company.aiCreditsLimit).toBe(500);
  });

  it('gói không giới hạn (hạn mức ≤ 0 hoặc thiếu) → aiCreditsLimit của công ty = null', async () => {
    arrange({ planLimit: 0 });
    expect((await getTeamOverview(OWNER)).company.aiCreditsLimit).toBeNull();
    arrange({ planLimit: null });
    expect((await getTeamOverview(OWNER)).company.aiCreditsLimit).toBeNull();
  });

  it('chủ không có gói / hết kỳ: không có kỳ AI → không truy vấn lượt AI, mọi số AI = null', async () => {
    arrange({ cycle: { hasPlan: false, billingUserId: OWNER, cycleStart: null, cycleEnd: null } });
    const overview = await getTeamOverview(OWNER);
    expect(repo.findAiCreditUsedByActor).not.toHaveBeenCalled();
    expect(usageTracking.getCreditUsageForCycle).not.toHaveBeenCalled();
    expect(overview.aiCycle).toBeNull();
    expect(overview.owner.aiCreditsUsed).toBeNull();
    expect(overview.employees.map((row) => row.aiCreditsUsed)).toEqual([null, null]);
    expect(overview.company.aiCreditsUsed).toBeNull();
    expect(overview.company.aiCreditsLimit).toBeNull();
    expect(overview.other).toBeNull();
  });

  it('chỉ một nhân viên (thẻ của họ): không tính "Cả công ty", không dựng dòng chủ / "Khác"', async () => {
    arrange({ members: [{ id: N1, username: 'n1', fullName: null, avatarUrl: null, status: 'active', memberStatus: 'active', periodAiCreditLimit: 10 }] });
    const overview = await getTeamOverview(OWNER, { employeeId: N1 });
    expect(repo.findTeamMembers).toHaveBeenCalledWith(OWNER, { employeeId: N1 });
    expect(repo.findOwnerProfile).not.toHaveBeenCalled();
    expect(sendStats.getChannelTotals).not.toHaveBeenCalled();
    expect(usageTracking.getCreditUsageForCycle).not.toHaveBeenCalled();
    expect(overview.owner).toBeNull();
    expect(overview.other).toBeNull();
    expect(overview.company).toBeNull();
    expect(overview.employees).toHaveLength(1);
    expect(repo.findLastActivityByActor).toHaveBeenCalledWith(OWNER, [N1]);
  });

  it('ownerId không hợp lệ → ném lỗi (không rơi sang phạm vi khác)', async () => {
    await expect(getTeamOverview(undefined)).rejects.toThrow(TypeError);
    await expect(getTeamOverview(0)).rejects.toThrow(TypeError);
    expect(sendStats.getActorTotals).not.toHaveBeenCalled();
  });
});

describe('getTeamOverview — ghép dòng', () => {
  it('mỗi dòng nhận đúng số của mình; chiến dịch đang chạy / đang chờ; hạn mức lượt AI của nhân viên', async () => {
    arrange({
      actorTotals: [
        { actorUserId: OWNER, sent: 4, failed: 1 },
        { actorUserId: N1, sent: 5, failed: 2 },
      ],
      channelTotals: [{ channel: 'email', sent: 6, failed: 2 }, { channel: 'telegram', sent: 3, failed: 1 }],
      running: [{ actorId: N1, running: 3, waiting: 1 }, { actorId: OWNER, running: 1, waiting: 0 }],
      aiByActor: [{ actorId: OWNER, used: 2 }, { actorId: null, used: 1 }, { actorId: N1, used: 7 }],
      companyAiUsed: 10,
      lastActive: [{ actorId: N1, lastActiveAt: new Date('2026-09-15T11:00:00.000Z') }],
    });
    const overview = await getTeamOverview(OWNER);
    const [n1, n2] = overview.employees;
    expect(overview.owner).toMatchObject({
      id: OWNER, sentThisMonth: 4, failedThisMonth: 1, runningCampaigns: 1, waitingCampaigns: 0,
      aiCreditsUsed: 3, // chủ: actor = chủ (2) + dòng chưa ghi người thực hiện (1)
      aiCreditsLimit: null, lastActiveAt: null,
    });
    expect(n1).toMatchObject({
      id: N1, sentThisMonth: 5, failedThisMonth: 2, runningCampaigns: 3, waitingCampaigns: 1,
      aiCreditsUsed: 7, aiCreditsLimit: 10, lastActiveAt: '2026-09-15T11:00:00.000Z', memberStatus: 'active',
    });
    // Nhân viên KHÔNG nhận dòng chưa ghi người thực hiện (chỉ chủ nhận).
    expect(n2).toMatchObject({ id: N2, sentThisMonth: 0, failedThisMonth: 0, runningCampaigns: 0, aiCreditsUsed: 0, aiCreditsLimit: null });
    expect(overview.company).toEqual({ sentThisMonth: 9, failedThisMonth: 3, aiCreditsUsed: 10, aiCreditsLimit: 1000 });
  });

  it('"Khác" = công ty − Σ các dòng (tin và lượt AI); chỉ có khi > 0', async () => {
    arrange({
      actorTotals: [{ actorUserId: OWNER, sent: 4, failed: 1 }, { actorUserId: N1, sent: 5, failed: 0 }, { actorUserId: 99, sent: 2, failed: 1 }, { actorUserId: null, sent: 1, failed: 0 }],
      channelTotals: [{ channel: 'email', sent: 12, failed: 2 }],
      aiByActor: [{ actorId: OWNER, used: 3 }, { actorId: N1, used: 3 }, { actorId: 99, used: 2 }],
      companyAiUsed: 8,
    });
    const overview = await getTeamOverview(OWNER);
    // 12 − (4 + 5 + 0) = 3 tin; 2 − (1 + 0 + 0) = 1 lỗi; 8 − (3 + 3 + 0) = 2 lượt AI.
    expect(overview.other).toEqual({ sentThisMonth: 3, failedThisMonth: 1, aiCreditsUsed: 2 });
  });

  it('Σ các dòng đúng bằng công ty → không có dòng "Khác"', async () => {
    arrange({
      actorTotals: [{ actorUserId: OWNER, sent: 4, failed: 0 }, { actorUserId: N1, sent: 5, failed: 2 }],
      channelTotals: [{ channel: 'email', sent: 9, failed: 2 }],
      aiByActor: [{ actorId: OWNER, used: 3 }, { actorId: N1, used: 3 }],
      companyAiUsed: 6,
    });
    expect((await getTeamOverview(OWNER)).other).toBeNull();
  });

  it('công ty nhỏ hơn Σ dòng (đọc lệch nhau giữa hai truy vấn) → "Khác" không âm', async () => {
    arrange({
      actorTotals: [{ actorUserId: N1, sent: 5, failed: 0 }],
      channelTotals: [{ channel: 'email', sent: 4, failed: 0 }],
      companyAiUsed: 0,
    });
    expect((await getTeamOverview(OWNER)).other).toBeNull();
  });
});

describe('getMyContribution', () => {
  it('ngữ cảnh nhân viên: lấy chủ từ token, trả dòng của nhân viên kèm kỳ và cửa sổ; KHÔNG tra chủ khác', async () => {
    arrange({
      members: [{ id: N1, username: 'n1', fullName: null, avatarUrl: null, status: 'active', memberStatus: 'active', periodAiCreditLimit: 10 }],
      actorTotals: [{ actorUserId: N1, sent: 5, failed: 2 }],
      aiByActor: [{ actorId: N1, used: 7 }],
    });
    const mine = await getMyContribution({ userId: N1, activeContext: { type: 'employee', ownerId: OWNER } });
    expect(employeeRepo.findOwnerIdForEmployee).not.toHaveBeenCalled();
    expect(repo.findTeamMembers).toHaveBeenCalledWith(OWNER, { employeeId: N1 });
    expect(mine).toMatchObject({ id: N1, sentThisMonth: 5, failedThisMonth: 2, aiCreditsUsed: 7, aiCreditsLimit: 10 });
    expect(mine.period.toDate).toBe(todayVn());
    expect(mine.aiCycle).toEqual({ start: CYCLE.cycleStart.toISOString(), end: CYCLE.cycleEnd.toISOString() });
  });

  it('ngoài ngữ cảnh nhân viên: tìm chủ theo membership; không có chủ → null', async () => {
    employeeRepo.findOwnerIdForEmployee.mockResolvedValue(null);
    expect(await getMyContribution({ userId: N1, activeContext: null })).toBeNull();
    expect(repo.findTeamMembers).not.toHaveBeenCalled();

    arrange({ members: [] });
    employeeRepo.findOwnerIdForEmployee.mockResolvedValue(OWNER);
    expect(await getMyContribution({ userId: N1, activeContext: null })).toBeNull(); // chưa chấp nhận / không thuộc nhóm
  });
});
