/**
 * PLAN_VA_CO_LAP_DU_LIEU_TENANT PR-3 (việc 3a) — node `read_landing_leads` không tin phạm vi nằm trong `config`.
 *
 * `flow_json` / `campaign_nodes.config` do CLIENT ghi. Trước đây `{ ...config, idUser: userId }` để `config.workspaceOwnerId`
 * (và `config.isSuperAdmin`) thắng -> chiến dịch của A đọc được lead của B. Giờ phạm vi = chủ chiến dịch, ghi đè SAU spread;
 * tầng repository fail-closed khi thiếu `workspaceOwnerId`.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import db from '../../src/config/database.js';
import leadRepository from '../../src/repositories/lead.repository.js';
import leadService from '../../src/services/lead/lead.service.js';
import campaignNodeDataService from '../../src/services/campaign/campaignNodeData.service.js';
import { createUser, truncateAll } from './helpers/db.js';

let a;
let b;

async function insertLeadFor(user, email) {
  return leadRepository.insertLead({
    lastName: 'Khach',
    firstName: email,
    email,
    phone: '0900000000',
    marketingConsent: true,
    landingPageSlug: 'landing-x',
    idUser: user.id,
  });
}

const landingNode = (config) => ({ id: 'n1', node_subtype: 'read_landing_leads', config });

beforeEach(async () => {
  await truncateAll();
  a = await createUser({ username: `lead_scope_a_${Date.now()}` });
  b = await createUser({ username: `lead_scope_b_${Date.now()}` });
  await insertLeadFor(a, 'lead-cua-a@test.local');
  await insertLeadFor(b, 'lead-cua-b@test.local');
});

describe('node read_landing_leads: phạm vi do server quyết định (chủ chiến dịch)', () => {
  it('config.workspaceOwnerId = B (+ isSuperAdmin: true, idUser/userId = B) trong chiến dịch của A -> chỉ lead của A', async () => {
    const node = landingNode({
      workspaceOwnerId: b.id,
      idUser: b.id,
      userId: b.id,
      isSuperAdmin: true,
    });

    const result = await campaignNodeDataService.getCustomersFromDataNode(node, a.id, [node]);

    const emails = result.items.map((item) => item.email);
    expect(emails).toEqual(['lead-cua-a@test.local']);
    expect(emails).not.toContain('lead-cua-b@test.local');
  });

  it('config không có khoá phạm vi -> lead của chủ chiến dịch (luồng đúng không đổi)', async () => {
    const node = landingNode({ landingLeadsLimit: 100 });

    const result = await campaignNodeDataService.getCustomersFromDataNode(node, a.id, [node]);

    expect(result.items.map((item) => item.email)).toEqual(['lead-cua-a@test.local']);
  });

  it('chủ chiến dịch là B -> chỉ lead của B, kể cả khi config trỏ về A', async () => {
    const node = landingNode({ workspaceOwnerId: a.id, idUser: a.id });

    const result = await campaignNodeDataService.getCustomersFromDataNode(node, b.id, [node]);

    expect(result.items.map((item) => item.email)).toEqual(['lead-cua-b@test.local']);
  });
});

describe('lead.repository fail-closed khi thiếu workspaceOwnerId', () => {
  it('findFiltered / countFiltered không có workspaceOwnerId -> 0 dòng (không bao giờ trả toàn bảng)', async () => {
    const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM leads');
    expect(rows[0].n).toBe(2); // phép đo không mù: bảng có lead của cả hai tenant

    expect(await leadRepository.findFiltered({})).toEqual([]);
    expect(await leadRepository.countFiltered({})).toBe(0);
    expect(await leadRepository.findFiltered({ limit: 100, useDateRange: false })).toEqual([]);
    expect(await leadRepository.countFiltered({ workspaceOwnerId: null })).toBe(0);
  });

  it('có workspaceOwnerId -> đúng lead của tenant đó', async () => {
    expect(await leadRepository.countFiltered({ workspaceOwnerId: a.id })).toBe(1);
    const rows = await leadRepository.findFiltered({ workspaceOwnerId: a.id, limit: 10 });
    expect(rows.map((r) => r.email)).toEqual(['lead-cua-a@test.local']);
  });

  it('leadService.getLeadsForCampaignConfig không truyền phạm vi -> 0 lead', async () => {
    const result = await leadService.getLeadsForCampaignConfig({});
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});
