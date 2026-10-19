import { describe, expect, it, jest } from '@jest/globals';
import { requireWriteMessagePermission } from '../writeMessagePermission.middleware.js';

// PLAN_AI_VIET_MAU_TIN_2026-10-19.md, mục 1 — quyền theo context + channel của POST /ai/write-message.
const run = (body, permissions) => {
  const req = { body, user: { role: 'user_admin', activeContext: { type: 'employee', ownerId: 1, permissions } } };
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  const next = jest.fn();
  requireWriteMessagePermission(req, res, next);
  return { res, next };
};

describe('requireWriteMessagePermission', () => {
  it('mẫu email cần email_templates', () => {
    expect(run({ context: 'template', channel: 'email' }, { email_templates: true }).next).toHaveBeenCalled();
    const denied = run({ context: 'template', channel: 'email' }, { zalo_templates: true, campaigns_create: true });
    expect(denied.next).not.toHaveBeenCalled();
    expect(denied.res.status).toHaveBeenCalledWith(403);
  });

  it('mẫu tin nhắn (zalo/telegram/whatsapp) cần zalo_templates', () => {
    for (const channel of ['zalo', 'telegram', 'whatsapp']) {
      expect(run({ context: 'template', channel }, { zalo_templates: true }).next).toHaveBeenCalled();
      expect(run({ context: 'template', channel }, { email_templates: true }).res.status).toHaveBeenCalledWith(403);
    }
  });

  it('thiếu context → coi là template', () => {
    expect(run({ channel: 'email' }, { email_templates: true }).next).toHaveBeenCalled();
  });

  it('chỗ Tự soạn của chiến dịch cần campaigns_create, KHÔNG nhận quyền mẫu thay thế', () => {
    expect(run({ context: 'campaign', channel: 'email' }, { campaigns_create: true }).next).toHaveBeenCalled();
    const denied = run({ context: 'campaign', channel: 'zalo' }, { email_templates: true, zalo_templates: true });
    expect(denied.next).not.toHaveBeenCalled();
    expect(denied.res.status).toHaveBeenCalledWith(403);
  });

  it('context hoặc channel lạ → 400, không lọt sang quyền nào', () => {
    expect(run({ context: 'admin', channel: 'email' }, { email_templates: true }).res.status).toHaveBeenCalledWith(400);
    expect(run({ context: 'template', channel: 'sms' }, { email_templates: true }).res.status).toHaveBeenCalledWith(400);
  });
});
