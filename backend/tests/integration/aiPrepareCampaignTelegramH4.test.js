/**
 * PLAN_GIAO_TK_TG_WA PR-H4 — trợ lý AI dựng chiến dịch Telegram cho NHÂN VIÊN.
 *
 * POST /api/ai/prepare-campaign chạy prepareScript + buildConfirmationView THẬT trên Postgres thật (bảng giao
 * `member_channel_accounts`, `telegram_accounts`): nhân viên chỉ dùng tài khoản Telegram ĐƯỢC GIAO; tài khoản chưa giao
 * (do mô hình bịa / giữ từ lượt trước) bị gỡ và thẻ xác nhận báo `missing_sender`, không âm thầm đổi sang tài khoản khác.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';

const FLAG = 'CAMPAIGN_CHANNEL_TELEGRAM_ENABLED';
let app;
let prevFlag;
let seq = 0;

beforeAll(() => {
  prevFlag = process.env[FLAG];
  process.env[FLAG] = 'true';
  app = createApp();
});

afterAll(() => {
  if (prevFlag === undefined) delete process.env[FLAG]; else process.env[FLAG] = prevFlag;
});

beforeEach(async () => {
  await truncateAll();
});

const tokenOf = (user) => jwt.sign(
  { userId: user.id, email: user.email, role: user.role || 'user' },
  process.env.JWT_SECRET || 'test-jwt-secret'
);

async function createTelegram(ownerId, name) {
  seq += 1;
  const { rows } = await db.query(
    `INSERT INTO telegram_accounts (id_user, telegram_user_id, first_name, username, is_active)
     VALUES ($1, $2, $3, $4, true) RETURNING id`,
    [ownerId, 9000 + seq, name, `h4_${seq}`]
  );
  return Number(rows[0].id);
}

async function setup({ assign = [] } = {}) {
  const owner = await createUser({ email: `h4-owner-${Date.now()}@test.com`, username: `h4_owner_${Date.now()}` });
  await db.query('UPDATE users SET max_telegram_accounts = 100 WHERE id = $1', [owner.id]);
  const employee = await createUser({ email: `h4-emp-${Date.now()}@test.com`, username: `h4_emp_${Date.now()}`, role: 'employee' });
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, 'active', NOW(), NOW())`,
    [owner.id, employee.id, JSON.stringify({ campaigns_view: true, campaigns_create: true, ai_assistant_use: true })]
  );
  const t1 = await createTelegram(owner.id, 'TeleMot');
  const t2 = await createTelegram(owner.id, 'TeleHai');
  const ids = { t1, t2 };
  for (const key of assign) {
    await db.query(
      `INSERT INTO member_channel_accounts (owner_id, employee_id, channel, account_ref, source)
       VALUES ($1, $2, 'telegram', $3, 'assigned')`,
      [owner.id, employee.id, String(ids[key])]
    );
  }
  return { owner, employee, ...ids };
}

const telegramScript = (telegramAccountId) => ({
  campaignName: 'Telegram của nhân viên',
  nodes: [
    { id: 'n1', tempId: 'n1', nodeType: 'trigger', nodeSubtype: 'manual', nodeName: 'Bắt đầu', config: {} },
    {
      id: 'n2', tempId: 'n2', nodeType: 'action', nodeSubtype: 'send_telegram', nodeName: 'Gửi Telegram',
      config: { ...(telegramAccountId ? { telegramAccountId } : {}), recipientSource: 'telegram_conversations', steps: [{ message: 'Xin chào' }] },
    },
    { id: 'n3', tempId: 'n3', nodeType: 'end', nodeSubtype: 'end', nodeName: 'Kết thúc', config: {} },
  ],
  connections: [{ sourceNodeId: 'n1', targetNodeId: 'n2' }, { sourceNodeId: 'n2', targetNodeId: 'n3' }],
});

const findNode = (script) => script.nodes.find((n) => (n.node_subtype || n.nodeSubtype) === 'send_telegram');
const issueCodes = (res) => res.body.data.confirmationView.blockingIssues.map((i) => i.code);

const prepare = (user, ownerId, script) => {
  const req = request(app).post('/api/ai/prepare-campaign').set('Authorization', `Bearer ${tokenOf(user)}`);
  // Chủ gọi bằng chính mình (không X-Owner-Context); nhân viên gọi trong không gian của chủ.
  if (Number(user.id) !== Number(ownerId)) req.set('X-Owner-Context', String(ownerId));
  return req.send({ script });
};

describe('POST /api/ai/prepare-campaign — Telegram, nhân viên chỉ dùng tài khoản được giao (H4)', () => {
  it('tài khoản ĐƯỢC GIAO → thẻ sẵn sàng, giữ nguyên tài khoản', async () => {
    const { owner, employee, t1 } = await setup({ assign: ['t1'] });
    const res = await prepare(employee, owner.id, telegramScript(t1));
    expect(res.status).toBe(200);
    expect(issueCodes(res)).not.toContain('missing_sender');
    expect(Number(findNode(res.body.data.preparedScript).config.telegramAccountId)).toBe(t1);
  });

  it('tài khoản CHƯA giao (mô hình bịa) → bị gỡ khỏi bản nháp, thẻ báo missing_sender, KHÔNG đổi sang tài khoản được giao', async () => {
    const { owner, employee, t1, t2 } = await setup({ assign: ['t1'] });
    const res = await prepare(employee, owner.id, telegramScript(t2));
    expect(res.status).toBe(200);
    expect(issueCodes(res)).toContain('missing_sender');
    expect(res.body.data.confirmationView.readyToCreate).toBe(false);
    expect(findNode(res.body.data.preparedScript).config.telegramAccountId).toBeUndefined();
    expect(t1).not.toBe(t2);
  });

  it('node chưa chọn tài khoản + chủ có 2 tài khoản nhưng nhân viên chỉ được giao 1 → điền đúng tài khoản được giao', async () => {
    const { owner, employee, t2 } = await setup({ assign: ['t2'] });
    const res = await prepare(employee, owner.id, telegramScript(null));
    expect(res.status).toBe(200);
    expect(Number(findNode(res.body.data.preparedScript).config.telegramAccountId)).toBe(t2);
    expect(issueCodes(res)).not.toContain('missing_sender');
  });

  it('nhân viên chưa được giao tài khoản Telegram nào → không điền gì, thẻ báo missing_sender', async () => {
    const { owner, employee } = await setup({ assign: [] });
    const res = await prepare(employee, owner.id, telegramScript(null));
    expect(res.status).toBe(200);
    expect(findNode(res.body.data.preparedScript).config.telegramAccountId).toBeUndefined();
    expect(issueCodes(res)).toContain('missing_sender');
  });

  it('CHỦ không bị lọc: dùng được tài khoản bất kỳ của mình; node trống + 2 tài khoản → không tự chọn hộ', async () => {
    const { owner, t2 } = await setup({ assign: [] });
    const named = await prepare(owner, owner.id, telegramScript(t2));
    expect(named.status).toBe(200);
    expect(issueCodes(named)).not.toContain('missing_sender');
    const blank = await prepare(owner, owner.id, telegramScript(null));
    expect(findNode(blank.body.data.preparedScript).config.telegramAccountId).toBeUndefined();
    expect(issueCodes(blank)).toContain('missing_sender');
  });
});
