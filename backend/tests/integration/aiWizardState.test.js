/**
 * Integration test cho PLAN_WIZARD_VONG_DOI_2026-09-07 PR-1 — ranh giới campaign_created.
 *
 * Mục 12: PATCH /ai/sessions/:id/wizard-state action mark_campaign_created →
 *   - GET messages có đúng MỘT tin campaign_created (ranh giới sống trên server, không chỉ local).
 *   - wizard_state.gates rỗng (đã reset, không kế thừa sender/nhóm chiến dịch vừa tạo).
 *   - plan.status = 'completed'.
 *
 * Không có file integration nào cho wizard-state trước đây (đã grep xác nhận trống) — tạo mới,
 * đặt cạnh nhóm test AI khác trong thư mục này.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import { createSession, saveMessages, updateWizardStateSections } from '../../src/repositories/aiSession.repository.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

function createAuthToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role || 'user' },
    process.env.JWT_SECRET || 'test-jwt-secret'
  );
}

async function seedWizardState(sessionId, gates) {
  await db.query(
    `UPDATE ai_chat_sessions SET wizard_state = $2::jsonb WHERE id = $1`,
    [
      sessionId,
      JSON.stringify({
        v: 1,
        gates,
        plan: {
          snapshot: null, sourcePrompt: '', requiresApproval: true,
          savedTemplates: [], status: null, campaignId: null,
        },
        brief: {},
        meta: { lastGate: 'zaloGroups', lastGateCount: 1, deadEndLoggedAt: null, updatedAt: null },
      }),
    ]
  );
}

describe('PATCH /api/ai/sessions/:id/wizard-state — mark_campaign_created', () => {
  it('reset gates rỗng, plan.status=completed, VÀ ghi đúng 1 tin campaign_created sống trên server', async () => {
    const user = await createUser({ email: 'wizard-boundary@test.com', username: 'wizard_boundary' });
    const session = await createSession(user.id, 'Chat wizard test');

    // Gates có dữ liệu của "chiến dịch A" — phải bị reset sạch sau mark_campaign_created.
    await seedWizardState(session.id, {
      isCampaignFlow: true,
      channel: 'zalo_group',
      senderAccountId: 8,
      senderAccountName: 'TK 8',
      dataSource: null,
      sheetUrl: null,
      sheetCheck: null,
      zaloGroupIds: ['g1'],
      zaloFriendIds: [],
      schedule: null,
      planApproved: false,
      senderOtherRequested: false,
      hasContentPlan: false,
      hasAttachedFile: false,
      hasAttachedSpreadsheet: false,
      fileUsage: null,
      abandonedAtMessageCount: null,
    });

    const token = createAuthToken(user);
    const res = await request(app)
      .patch(`/api/ai/sessions/${session.id}/wizard-state`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: 'mark_campaign_created',
        payload: { campaignId: 123, content: 'Đã tạo chiến dịch "Thông báo lịch nghỉ".' },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.changed).toBe(true);

    const gates = res.body.data.wizardState.gates;
    expect(gates.isCampaignFlow).toBe(false);
    expect(gates.channel).toBeNull();
    expect(gates.senderAccountId).toBeNull();
    expect(gates.zaloGroupIds).toEqual([]);

    expect(res.body.data.wizardState.plan.status).toBe('completed');
    expect(res.body.data.wizardState.plan.campaignId).toBe(123);

    // Ranh giới phải SỐNG TRÊN SERVER — GET messages (mô phỏng tải lại trang) vẫn thấy.
    const msgsRes = await request(app)
      .get(`/api/ai/sessions/${session.id}/messages`)
      .set('Authorization', `Bearer ${token}`);
    expect(msgsRes.status).toBe(200);

    const boundaryMsgs = msgsRes.body.data.filter((m) => m.type === 'campaign_created');
    expect(boundaryMsgs).toHaveLength(1);
    expect(boundaryMsgs[0].content).toBe('Đã tạo chiến dịch "Thông báo lịch nghỉ".');
    expect(boundaryMsgs[0].data.campaignId).toBe(123);
    expect(boundaryMsgs[0].role).toBe('assistant');
  });

  it('content rỗng → dùng câu mặc định "🎉 Chiến dịch đã được tạo."', async () => {
    const user = await createUser({ email: 'wizard-boundary-default@test.com', username: 'wizard_boundary_default' });
    const session = await createSession(user.id, 'Chat wizard test 2');

    const token = createAuthToken(user);
    const res = await request(app)
      .patch(`/api/ai/sessions/${session.id}/wizard-state`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'mark_campaign_created', payload: { campaignId: 456 } });

    expect(res.status).toBe(200);

    const msgsRes = await request(app)
      .get(`/api/ai/sessions/${session.id}/messages`)
      .set('Authorization', `Bearer ${token}`);
    const boundaryMsgs = msgsRes.body.data.filter((m) => m.type === 'campaign_created');
    expect(boundaryMsgs).toHaveLength(1);
    expect(boundaryMsgs[0].content).toBe('🎉 Chiến dịch đã được tạo.');
  });

  it('idempotent: gọi lại với cùng campaignId khi gates đã rỗng → changed=false, KHÔNG ghi thêm tin campaign_created', async () => {
    const user = await createUser({ email: 'wizard-boundary-idem@test.com', username: 'wizard_boundary_idem' });
    const session = await createSession(user.id, 'Chat wizard test 3');
    const token = createAuthToken(user);

    const first = await request(app)
      .patch(`/api/ai/sessions/${session.id}/wizard-state`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'mark_campaign_created', payload: { campaignId: 789 } });
    expect(first.body.data.changed).toBe(true);

    const second = await request(app)
      .patch(`/api/ai/sessions/${session.id}/wizard-state`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'mark_campaign_created', payload: { campaignId: 789 } });
    expect(second.body.data.changed).toBe(false);

    const msgsRes = await request(app)
      .get(`/api/ai/sessions/${session.id}/messages`)
      .set('Authorization', `Bearer ${token}`);
    const boundaryMsgs = msgsRes.body.data.filter((m) => m.type === 'campaign_created');
    // Lần gọi lại không đổi (changed:false) → controller không ghi thêm tin.
    expect(boundaryMsgs).toHaveLength(1);
  });
});

/**
 * PLAN_WIZARD_VONG_DOI_2026-09-07 PR-2 — mục 7: cùng cơ chế ranh giới cho abandon_campaign_flow.
 */
describe('PATCH /api/ai/sessions/:id/wizard-state — abandon_campaign_flow', () => {
  it('reset gates, ghi đúng 1 tin campaign_abandoned sống trên server', async () => {
    const user = await createUser({ email: 'wizard-abandon@test.com', username: 'wizard_abandon' });
    const session = await createSession(user.id, 'Chat wizard abandon test');

    // Gates có dữ liệu của chiến dịch đang làm dở — phải bị reset sau abandon.
    await seedWizardState(session.id, {
      isCampaignFlow: true,
      channel: 'email',
      senderAccountId: 7,
      senderAccountName: null,
      dataSource: 'db',
      sheetUrl: null,
      sheetCheck: null,
      zaloGroupIds: [],
      zaloFriendIds: [],
      schedule: null,
      planApproved: false,
      senderOtherRequested: false,
      hasContentPlan: false,
      hasAttachedFile: false,
      hasAttachedSpreadsheet: false,
      fileUsage: null,
      abandonedAtMessageCount: null,
    });

    const token = createAuthToken(user);
    const res = await request(app)
      .patch(`/api/ai/sessions/${session.id}/wizard-state`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: 'abandon_campaign_flow',
        payload: { messageCount: 4, content: 'Đã dừng theo yêu cầu.' },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.changed).toBe(true);

    const gates = res.body.data.wizardState.gates;
    expect(gates.isCampaignFlow).toBe(false);
    expect(gates.channel).toBeNull();
    expect(gates.senderAccountId).toBeNull();
    expect(gates.dataSource).toBeNull();
    expect(gates.abandonedAtMessageCount).toBe(4);

    const msgsRes = await request(app)
      .get(`/api/ai/sessions/${session.id}/messages`)
      .set('Authorization', `Bearer ${token}`);
    const boundaryMsgs = msgsRes.body.data.filter((m) => m.type === 'campaign_abandoned');
    expect(boundaryMsgs).toHaveLength(1);
    expect(boundaryMsgs[0].content).toBe('Đã dừng theo yêu cầu.');
    expect(boundaryMsgs[0].role).toBe('assistant');
  });

  it('content rỗng → dùng câu mặc định "Đã dừng."', async () => {
    const user = await createUser({ email: 'wizard-abandon-default@test.com', username: 'wizard_abandon_default' });
    const session = await createSession(user.id, 'Chat wizard abandon test 2');
    const token = createAuthToken(user);

    const res = await request(app)
      .patch(`/api/ai/sessions/${session.id}/wizard-state`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'abandon_campaign_flow', payload: { messageCount: 2 } });

    expect(res.status).toBe(200);

    const msgsRes = await request(app)
      .get(`/api/ai/sessions/${session.id}/messages`)
      .set('Authorization', `Bearer ${token}`);
    const boundaryMsgs = msgsRes.body.data.filter((m) => m.type === 'campaign_abandoned');
    expect(boundaryMsgs).toHaveLength(1);
    expect(boundaryMsgs[0].content).toBe('Đã dừng.');
  });

  it('idempotent: PATCH lặp cùng messageCount khi gates đã ở đúng trạng thái đã bỏ dở → changed=false, KHÔNG ghi thêm tin', async () => {
    const user = await createUser({ email: 'wizard-abandon-idem@test.com', username: 'wizard_abandon_idem' });
    const session = await createSession(user.id, 'Chat wizard abandon test 3');
    const token = createAuthToken(user);

    const first = await request(app)
      .patch(`/api/ai/sessions/${session.id}/wizard-state`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'abandon_campaign_flow', payload: { messageCount: 3 } });
    expect(first.body.data.changed).toBe(true);

    const second = await request(app)
      .patch(`/api/ai/sessions/${session.id}/wizard-state`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'abandon_campaign_flow', payload: { messageCount: 3 } });
    expect(second.body.data.changed).toBe(false);

    const msgsRes = await request(app)
      .get(`/api/ai/sessions/${session.id}/messages`)
      .set('Authorization', `Bearer ${token}`);
    const boundaryMsgs = msgsRes.body.data.filter((m) => m.type === 'campaign_abandoned');
    expect(boundaryMsgs).toHaveLength(1);
  });
});

async function readState(sessionId) {
  const { rows } = await db.query('SELECT wizard_state FROM ai_chat_sessions WHERE id = $1', [sessionId]);
  return rows[0].wizard_state;
}

describe('PR-C1 — ghi wizard_state sau lượt chat (SQL thật)', () => {
  it('gatesDelta gộp theo khoá: không kéo planApproved (PATCH vừa bật) về false; meta giữ khoá của nơi khác; foldedMessageCount = số tin thật', async () => {
    const user = await createUser({ email: 'wizard-delta@test.com', username: 'wizard_delta' });
    const session = await createSession(user.id, 'Chat wizard delta');
    await saveMessages(session.id, user.id, 'Tạo chiến dịch', { content: 'ok', type: 'text', data: null });
    await saveMessages(session.id, user.id, 'tiếp', { content: 'ok', type: 'text', data: null });

    // Trạng thái SAU khi PATCH approve_plan đã ghi: planApproved=true, meta có dấu cũ.
    await seedWizardState(session.id, { isCampaignFlow: true, channel: 'email', hasContentPlan: true, planApproved: true });
    await db.query(
      `UPDATE ai_chat_sessions SET wizard_state = jsonb_set(wizard_state, '{meta}', '{"keepMe":"x","foldedMessageCount":1}'::jsonb) WHERE id = $1`,
      [session.id],
    );

    // Lượt chat đọc đầu lượt (planApproved=false) và chỉ đổi senderAccountId.
    const returned = await updateWizardStateSections(session.id, user.id, {
      gatesDelta: { senderAccountId: 7 },
      stampFoldedCount: true,
      meta: { lastGate: 'schedule', historyBackfilledAt: '2026-10-10T00:00:00.000Z' },
    });

    const state = await readState(session.id);
    // Hàm trả đúng state SAU khi ghi (controller đưa nó cho client làm data.wizardState).
    expect(returned).toEqual(state);
    expect(state.gates.planApproved).toBe(true);
    expect(state.gates.senderAccountId).toBe(7);
    expect(state.gates.channel).toBe('email');
    expect(state.meta.keepMe).toBe('x');
    expect(state.meta.lastGate).toBe('schedule');
    expect(state.meta.historyBackfilledAt).toBe('2026-10-10T00:00:00.000Z');
    expect(state.meta.foldedMessageCount).toBe(4);
  });

  it('briefExpected: ghi brief khi vẫn đúng bản đầu lượt; giữ bản mới hơn nếu ai đó đã đổi', async () => {
    const user = await createUser({ email: 'wizard-brief-cas@test.com', username: 'wizard_brief_cas' });
    const session = await createSession(user.id, 'Chat wizard brief');
    await db.query(
      `UPDATE ai_chat_sessions SET wizard_state = '{"v":1,"gates":{},"plan":{},"brief":{"topicText":"cũ"},"meta":{}}'::jsonb WHERE id = $1`,
      [session.id],
    );

    await updateWizardStateSections(session.id, user.id, { brief: { topicText: 'mới' }, briefExpected: { topicText: 'cũ' } });
    expect((await readState(session.id)).brief).toEqual({ topicText: 'mới' });

    // Reducer ranh giới vừa reset brief trong lúc lượt chat chạy → lượt chat (đọc brief 'mới') KHÔNG được ghi lại.
    await db.query(`UPDATE ai_chat_sessions SET wizard_state = jsonb_set(wizard_state, '{brief}', '{"topicText":null}'::jsonb) WHERE id = $1`, [session.id]);
    await updateWizardStateSections(session.id, user.id, { brief: { topicText: 'từ lượt cũ' }, briefExpected: { topicText: 'mới' } });
    expect((await readState(session.id)).brief).toEqual({ topicText: null });
  });

  it('PATCH mark_campaign_created khi bản lưu đang khớp số tin: foldedMessageCount tăng +1 theo tin ranh giới; brief về rỗng', async () => {
    const user = await createUser({ email: 'wizard-fold-bump@test.com', username: 'wizard_fold_bump' });
    const session = await createSession(user.id, 'Chat wizard bump');
    await saveMessages(session.id, user.id, 'Tạo chiến dịch', { content: 'ok', type: 'text', data: null });
    await db.query(
      `UPDATE ai_chat_sessions SET wizard_state = $2::jsonb WHERE id = $1`,
      [session.id, JSON.stringify({
        v: 1,
        gates: { isCampaignFlow: true, channel: 'email' },
        plan: {},
        brief: { version: 1, contentMode: 'custom_topic', topicText: 'Lịch nghỉ Tết', contentLocale: 'vi' },
        meta: { historyBackfilledAt: '2026-10-10T00:00:00.000Z', foldedMessageCount: 2 },
      })],
    );

    const token = createAuthToken(user);
    const res = await request(app)
      .patch(`/api/ai/sessions/${session.id}/wizard-state`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'mark_campaign_created', payload: { campaignId: 9 } });
    expect(res.status).toBe(200);

    const state = await readState(session.id);
    expect(state.meta.foldedMessageCount).toBe(3);
    expect(state.brief.topicText).toBeNull();
    expect(state.brief.contentMode).toBeNull();
    const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM ai_chat_messages WHERE session_id = $1', [session.id]);
    expect(rows[0].n).toBe(3);
  });

  it('PATCH khi bản lưu KHÔNG khớp số tin: không đẩy dấu (lượt chat kế sẽ rơi về replay)', async () => {
    const user = await createUser({ email: 'wizard-fold-nobump@test.com', username: 'wizard_fold_nobump' });
    const session = await createSession(user.id, 'Chat wizard nobump');
    await saveMessages(session.id, user.id, 'Tạo chiến dịch', { content: 'ok', type: 'text', data: null });
    await seedWizardState(session.id, { isCampaignFlow: true, channel: 'email' });
    await db.query(
      `UPDATE ai_chat_sessions SET wizard_state = jsonb_set(wizard_state, '{meta}', '{"historyBackfilledAt":"x","foldedMessageCount":1}'::jsonb) WHERE id = $1`,
      [session.id],
    );

    const token = createAuthToken(user);
    await request(app)
      .patch(`/api/ai/sessions/${session.id}/wizard-state`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'mark_campaign_created', payload: { campaignId: 9 } });

    expect((await readState(session.id)).meta.foldedMessageCount).toBe(1);
  });
});
