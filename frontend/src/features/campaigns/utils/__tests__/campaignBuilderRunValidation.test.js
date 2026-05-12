import { describe, it, expect } from 'vitest';
import {
  buildExecutionOrder,
  validateNodeForRun,
} from '../campaignBuilderRunValidation';

const makeNode = (id, type, extra = {}) => ({
  id,
  type,
  data: { nodeType: type, config: extra.config || {}, ...(extra.data || {}) },
});

describe('buildExecutionOrder', () => {
  it('không có trigger node → []', () => {
    const nodes = [makeNode('a', 'send_email'), makeNode('b', 'read_sheet')];
    const edges = [{ source: 'a', target: 'b' }];
    expect(buildExecutionOrder(nodes, edges)).toEqual([]);
  });

  it('flow tuyến tính từ start → topo order', () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('r', 'read_sheet'),
      makeNode('e', 'send_email'),
    ];
    const edges = [
      { source: 's', target: 'r' },
      { source: 'r', target: 'e' },
    ];
    const out = buildExecutionOrder(nodes, edges);
    expect(out.map((n) => n.id)).toEqual(['s', 'r', 'e']);
  });

  it('node không reachable từ trigger → bị loại', () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('r', 'read_sheet'),
      makeNode('orphan', 'send_email'),
    ];
    const edges = [{ source: 's', target: 'r' }];
    const out = buildExecutionOrder(nodes, edges);
    expect(out.map((n) => n.id)).toEqual(['s', 'r']);
  });

  it("manual_trigger / *_trigger cũng là entry point", () => {
    const nodes = [
      makeNode('t', 'manual_trigger'),
      makeNode('x', 'send_email'),
    ];
    const edges = [{ source: 't', target: 'x' }];
    const out = buildExecutionOrder(nodes, edges);
    expect(out.map((n) => n.id)).toEqual(['t', 'x']);
  });

  it('node.id và edge.source/target khác kiểu (số vs chuỗi) — vẫn match', () => {
    const nodes = [makeNode(1, 'start'), makeNode(2, 'send_email')];
    const edges = [{ source: 1, target: 2 }];
    const out = buildExecutionOrder(nodes, edges);
    expect(out.map((n) => n.id)).toEqual([1, 2]);
  });
});

describe('validateNodeForRun — send_email', () => {
  it('thiếu fromEmailId → failed', () => {
    const r = validateNodeForRun(makeNode('a', 'send_email'));
    expect(r.status).toBe('failed');
    expect(r.message).toMatch(/email gửi/i);
  });

  it('recipientSource=manual nhưng không có recipientEmails → failed', () => {
    const r = validateNodeForRun(
      makeNode('a', 'send_email', {
        config: { fromEmailId: 1, recipientSource: 'manual', recipientEmails: '' },
      })
    );
    expect(r.message).toMatch(/email người nhận/i);
  });

  it('recipientSource=node thiếu nodeId → failed', () => {
    const r = validateNodeForRun(
      makeNode('a', 'send_email', {
        config: { fromEmailId: 1, recipientSource: 'node', recipientNodeId: '' },
      })
    );
    expect(r.message).toMatch(/node dữ liệu/i);
  });

  it('emailSteps rỗng → failed "Chưa chọn template email"', () => {
    const r = validateNodeForRun(
      makeNode('a', 'send_email', {
        config: { fromEmailId: 1, recipientSource: 'manual', recipientEmails: 'x@x.com', emailSteps: [] },
      })
    );
    expect(r.message).toMatch(/template email/i);
  });

  it('schedule mode + delayValue âm → failed', () => {
    const r = validateNodeForRun(
      makeNode('a', 'send_email', {
        config: {
          fromEmailId: 1,
          recipientSource: 'manual',
          recipientEmails: 'x@x.com',
          emailSteps: [{ templateId: '1', delayValue: '-5', delayFrom: 'start' }],
          sendMode: 'schedule',
        },
      })
    );
    expect(r.message).toMatch(/Thời gian gửi không hợp lệ/i);
  });

  it('happy path → success', () => {
    const r = validateNodeForRun(
      makeNode('a', 'send_email', {
        config: {
          fromEmailId: 1,
          recipientSource: 'manual',
          recipientEmails: 'x@x.com',
          emailSteps: [{ templateId: '1' }],
        },
      })
    );
    expect(r.status).toBe('success');
  });
});

describe('validateNodeForRun — read_* nodes', () => {
  it('read_sheet thiếu sheetUrl → failed', () => {
    const r = validateNodeForRun(makeNode('a', 'read_sheet'));
    expect(r.message).toMatch(/URL sheet/i);
  });

  it('read_interested_customers limit < 1 → failed', () => {
    const r = validateNodeForRun(
      makeNode('a', 'read_interested_customers', { config: { interestedLimit: '0' } })
    );
    expect(r.message).toMatch(/Số bản ghi tối đa/i);
  });

  it('read_courses_db không chọn course → failed', () => {
    const r = validateNodeForRun(
      makeNode('a', 'read_courses_db', { config: { coursesDbSelectedIds: [] } })
    );
    expect(r.message).toMatch(/khóa học/i);
  });

  it('read_landing_leads limit vượt LANDING_LEADS_MAX_RECORDS → failed', () => {
    const r = validateNodeForRun(
      makeNode('a', 'read_landing_leads', { config: { landingLeadsLimit: '99999' } })
    );
    expect(r.message).toMatch(/Số bản ghi tối đa/i);
  });

  it('read_landing_leads date range bật nhưng thiếu from/to → failed', () => {
    const r = validateNodeForRun(
      makeNode('a', 'read_landing_leads', {
        config: { landingLeadsLimit: '100', landingLeadsUseDateRange: true, landingLeadsDateFrom: '', landingLeadsDateTo: '' },
      })
    );
    expect(r.message).toMatch(/Từ ngày.*Đến ngày/i);
  });

  it('read_landing_leads from > to → failed', () => {
    const r = validateNodeForRun(
      makeNode('a', 'read_landing_leads', {
        config: {
          landingLeadsLimit: '100',
          landingLeadsUseDateRange: true,
          landingLeadsDateFrom: '2026-05-10',
          landingLeadsDateTo: '2026-05-01',
        },
      })
    );
    expect(r.message).toMatch(/«Từ ngày» phải trước/i);
  });
});

describe('validateNodeForRun — select_zalo_account', () => {
  it('pool ON nhưng không chọn id nào → failed', () => {
    const r = validateNodeForRun(
      makeNode('a', 'select_zalo_account', {
        config: { zaloPoolMultiAccountEnabled: true, zaloPoolAccountIds: [] },
      })
    );
    expect(r.message).toMatch(/pool/i);
  });

  it('pool OFF + không có zaloAccountId → failed', () => {
    const r = validateNodeForRun(
      makeNode('a', 'select_zalo_account', { config: { zaloAccountId: '' } })
    );
    expect(r.message).toMatch(/tài khoản Zalo/i);
  });

  it('pool ON + có id → success', () => {
    const r = validateNodeForRun(
      makeNode('a', 'select_zalo_account', {
        config: { zaloPoolMultiAccountEnabled: true, zaloPoolAccountIds: ['1'] },
      })
    );
    expect(r.status).toBe('success');
  });
});

describe('validateNodeForRun — save_customer', () => {
  it('thiếu source node trong saveCustomerFieldMap → failed', () => {
    const r = validateNodeForRun(
      makeNode('a', 'save_customer', { config: { saveCustomerFieldMap: {} } })
    );
    expect(r.message).toMatch(/node dữ liệu/i);
  });

  it('có source node nhưng không có contact field nào → failed', () => {
    const r = validateNodeForRun(
      makeNode('a', 'save_customer', {
        config: {
          saveCustomerFieldMap: {
            firstName: { mode: 'node', nodeId: 'n1', field: 'name' },
          },
        },
      })
    );
    expect(r.message).toMatch(/trường liên hệ/i);
  });

  it('có ít nhất 1 contact field (email) → success', () => {
    const r = validateNodeForRun(
      makeNode('a', 'save_customer', {
        config: {
          saveCustomerFieldMap: {
            email: { mode: 'node', nodeId: 'n1', field: 'email' },
          },
        },
      })
    );
    expect(r.status).toBe('success');
  });
});

describe('validateNodeForRun — send_zalo_personal', () => {
  it('không có message và không có template steps → failed', () => {
    const r = validateNodeForRun(makeNode('a', 'send_zalo_personal', { config: {} }));
    expect(r.message).toMatch(/template gửi/i);
  });

  it('zaloRecipientSource=manual nhưng không có phones → failed', () => {
    const r = validateNodeForRun(
      makeNode('a', 'send_zalo_personal', {
        config: { zaloMessage: 'hi', zaloRecipientSource: 'manual', zaloRecipientPhones: '' },
      })
    );
    expect(r.message).toMatch(/số điện thoại/i);
  });
});

describe('validateNodeForRun — default', () => {
  it('node type không có rule riêng → success', () => {
    const r = validateNodeForRun(makeNode('a', 'unknown_node'));
    expect(r.status).toBe('success');
  });
});
