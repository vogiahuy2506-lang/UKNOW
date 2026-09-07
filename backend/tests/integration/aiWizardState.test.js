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
import { createSession } from '../../src/repositories/aiSession.repository.js';

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
