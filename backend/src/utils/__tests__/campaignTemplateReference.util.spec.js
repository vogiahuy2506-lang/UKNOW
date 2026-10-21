import { describe, it, expect } from '@jest/globals';
import {
  collectRequiredTemplateReferences,
  createTemplateIdMaps,
  parseZaloTemplateId,
  remapTemplateIdsInConfig,
  remapTemplateIdsInFlowJson,
} from '../campaignTemplateReference.util.js';
import { collectEmailTemplateReferences } from '../emailTemplateReference.util.js';

/**
 * Marketplace chiến dịch kèm mẫu — "khối nào trỏ mẫu nào, ở trường nào" phải khớp ĐÚNG những gì engine đọc lúc gửi
 * (campaignRun.service.js + emailTemplateReference.util.js), và mọi id mẫu của người bán phải đổi / gỡ sạch.
 */
const node = (nodeSubtype, config, extra = {}) => ({ id: extra.id ?? 1, nodeName: extra.nodeName ?? nodeSubtype, nodeSubtype, config });

const maps = (email = {}, zalo = {}) => ({
  email: new Map(Object.entries(email)),
  zalo: new Map(Object.entries(zalo)),
});

describe('parseZaloTemplateId', () => {
  it.each([
    [5, 5],
    ['12', 12],
    [' 7 ', 7],
    ['12abc', 12], // engine đọc bằng parseInt nên "12abc" cũng là 12 lúc gửi
    ['0', null],
    [-3, null],
    ['', null],
    [null, null],
    ['abc', null],
  ])('%j -> %j', (raw, expected) => {
    expect(parseZaloTemplateId(raw)).toBe(expected);
  });
});

describe('collectRequiredTemplateReferences — ô mà engine THẬT SỰ đọc', () => {
  it('email: mỗi bước hợp lệ dùng mẫu riêng; emailTemplateId/templateId cấp node thừa KHÔNG bắt buộc', () => {
    const refs = collectRequiredTemplateReferences([
      node('send_email', { emailSteps: [{ templateId: 11 }, { templateId: '12' }, { templateId: '' }], emailTemplateId: 99, templateId: 98 }),
    ]);
    expect(refs.map((r) => [r.channel, r.id])).toEqual([['email', 11], ['email', 12]]);
  });

  it('email: không có bước hợp lệ → dùng emailTemplateId (ưu tiên) rồi templateId — khớp collectEmailTemplateReferences', () => {
    expect(collectRequiredTemplateReferences([node('send_email', { emailTemplateId: 5, templateId: 9 })]).map((r) => r.id)).toEqual([5]);
    expect(collectRequiredTemplateReferences([node('send_email', { templateId: 9 })]).map((r) => r.id)).toEqual([9]);
    const configs = [
      { emailSteps: [{ templateId: 3 }, { templateId: 4 }], emailTemplateId: 1 },
      { emailTemplateId: '7' },
      { templateId: 8 },
      { emailSteps: [{ templateId: '' }], emailTemplateId: 2 },
    ];
    configs.forEach((config) => {
      const mine = collectRequiredTemplateReferences([node('send_email', config)]).map((r) => r.raw);
      const engine = collectEmailTemplateReferences(config).map((r) => r.raw);
      expect(mine).toEqual(engine);
    });
  });

  it('email: nội dung soạn thẳng (không templateId) → không có tham chiếu', () => {
    expect(collectRequiredTemplateReferences([node('send_email', { emailSubject: 'Chào', emailBody: 'x' })])).toEqual([]);
  });

  it('email: id rác (12abc) → vẫn là tham chiếu bắt buộc nhưng id = null (coi như mẫu không tồn tại)', () => {
    const refs = collectRequiredTemplateReferences([node('send_email', { emailTemplateId: '12abc' })]);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ channel: 'email', raw: '12abc', id: null });
  });

  it('Zalo cá nhân + nhóm: chỉ các bước có templateId parseInt hữu hạn', () => {
    const refs = collectRequiredTemplateReferences([
      node('send_zalo_personal', { zaloPersonalTemplateSteps: [{ templateId: 21 }, { templateId: null }, { templateId: '22' }] }, { id: 2 }),
      node('send_zalo_group', { zaloGroupTemplateSteps: [{ templateId: 31 }, { templateId: 'abc' }] }, { id: 3 }),
    ]);
    expect(refs.map((r) => [r.nodeId, r.channel, r.id])).toEqual([
      [2, 'zalo', 21],
      [2, 'zalo', 22],
      [3, 'zalo', 31],
    ]);
  });

  it('Zalo kết bạn: chỉ bắt buộc khi nội dung ở chế độ mẫu và không có nội dung nhúng', () => {
    expect(collectRequiredTemplateReferences([
      node('send_zalo_friend_request', { zaloFriendContentMode: 'template', zaloFriendTemplateId: 41 }),
    ]).map((r) => r.id)).toEqual([41]);
    // soạn tay còn sót id → KHÔNG bắt buộc
    expect(collectRequiredTemplateReferences([
      node('send_zalo_friend_request', { zaloFriendContentMode: 'manual', zaloFriendTemplateId: 41 }),
    ])).toEqual([]);
    // chế độ mẫu nhưng đã có nội dung nhúng → engine dùng nội dung nhúng
    expect(collectRequiredTemplateReferences([
      node('send_zalo_friend_request', { zaloFriendContentMode: 'template', zaloFriendTemplateId: 41, zaloFriendTemplateBody: 'Chào bạn' }),
    ])).toEqual([]);
  });

  it('Telegram / WhatsApp: templateId của bước chỉ là gợi ý giao diện → không bắt buộc', () => {
    expect(collectRequiredTemplateReferences([
      node('send_telegram', { steps: [{ templateId: 51, message: 'x' }] }),
      node('send_whatsapp', { steps: [{ templateId: 52, message: 'y' }] }),
    ])).toEqual([]);
  });

  it('khối khác (đọc dữ liệu, điều kiện…) và config rác không sinh tham chiếu', () => {
    expect(collectRequiredTemplateReferences([
      node('read_sheet', { templateId: 5 }),
      node('send_email', null),
      node('send_email', 'không phải json'),
      null,
      undefined,
    ])).toEqual([]);
  });

  it('config dạng chuỗi JSON (cột cũ) vẫn đọc được; nodeName rỗng lấy subtype', () => {
    const refs = collectRequiredTemplateReferences([
      { id: 9, node_subtype: 'send_zalo_group', node_name: '', config: JSON.stringify({ zaloGroupTemplateSteps: [{ templateId: 7 }] }) },
    ]);
    expect(refs).toEqual([{ nodeId: 9, nodeName: 'send_zalo_group', nodeSubtype: 'send_zalo_group', channel: 'zalo', raw: '7', id: 7 }]);
  });
});

describe('remapTemplateIdsInConfig — đổi id mẫu người bán sang id bản sao người mua', () => {
  it('email: đổi từng bước + cả emailTemplateId cùng id; giữ kiểu số/chuỗi như cũ', () => {
    const config = { emailSteps: [{ templateId: 11, delayValue: 0 }, { templateId: '12' }], emailTemplateId: 11, other: 'giữ' };
    const next = remapTemplateIdsInConfig('send_email', config, maps({ 11: '501', 12: '502' }));
    expect(next).toEqual({
      emailSteps: [{ templateId: 501, delayValue: 0 }, { templateId: '502' }],
      emailTemplateId: 501,
      other: 'giữ',
    });
    // không đụng object gốc
    expect(config.emailSteps[0].templateId).toBe(11);
  });

  it('email: ô cấp node thừa mà id không có trong bản đồ → null (id người bán không được lọt sang người mua)', () => {
    const next = remapTemplateIdsInConfig(
      'send_email',
      { emailSteps: [{ templateId: 11 }], emailTemplateId: 77, templateId: '88' },
      maps({ 11: '501' })
    );
    expect(next).toEqual({ emailSteps: [{ templateId: 501 }], emailTemplateId: null, templateId: null });
  });

  it('ô BẮT BUỘC mà không có trong bản đồ → giữ nguyên (fail-closed, preflight báo mẫu không tồn tại thay vì gửi mặc định)', () => {
    const config = { emailSteps: [{ templateId: 11 }, { templateId: 12 }] };
    const next = remapTemplateIdsInConfig('send_email', config, maps({ 11: '501' }));
    expect(next).toEqual({ emailSteps: [{ templateId: 501 }, { templateId: 12 }] });
    // bản đồ rỗng → không đổi gì, trả đúng object cũ
    expect(remapTemplateIdsInConfig('send_email', config, createTemplateIdMaps())).toBe(config);
  });

  it('Zalo cá nhân / nhóm: đổi trong bước, giữ nguyên phần còn lại của bước (templateMappings, delay…)', () => {
    const personal = { zaloPersonalTemplateSteps: [{ templateId: 21, templateMappings: [{ nodeId: '5' }] }, { templateId: '22', delayValue: 2 }] };
    expect(remapTemplateIdsInConfig('send_zalo_personal', personal, maps({}, { 21: '601', 22: '602' }))).toEqual({
      zaloPersonalTemplateSteps: [{ templateId: 601, templateMappings: [{ nodeId: '5' }] }, { templateId: '602', delayValue: 2 }],
    });
    const group = { zaloGroupTemplateSteps: [{ templateId: 31 }] };
    expect(remapTemplateIdsInConfig('send_zalo_group', group, maps({}, { 31: '701' }))).toEqual({
      zaloGroupTemplateSteps: [{ templateId: 701 }],
    });
  });

  it('kênh email và Zalo có bản đồ riêng: id 5 của email không đổi nhầm thành id 5 của Zalo', () => {
    const next = remapTemplateIdsInConfig('send_zalo_group', { zaloGroupTemplateSteps: [{ templateId: 5 }] }, maps({ 5: '999' }, { 5: '123' }));
    expect(next.zaloGroupTemplateSteps[0].templateId).toBe(123);
  });

  it('Zalo kết bạn: đổi zaloFriendTemplateId; ô còn sót ở chế độ soạn tay → null', () => {
    expect(remapTemplateIdsInConfig(
      'send_zalo_friend_request',
      { zaloFriendContentMode: 'template', zaloFriendTemplateId: 41 },
      maps({}, { 41: '801' })
    )).toEqual({ zaloFriendContentMode: 'template', zaloFriendTemplateId: 801 });
    expect(remapTemplateIdsInConfig(
      'send_zalo_friend_request',
      { zaloFriendContentMode: 'manual', zaloFriendTemplateId: 41 },
      createTemplateIdMaps()
    )).toEqual({ zaloFriendContentMode: 'manual', zaloFriendTemplateId: null });
  });

  it('Telegram / WhatsApp: templateId gợi ý của bước → null (nội dung đã nằm trong bước)', () => {
    expect(remapTemplateIdsInConfig('send_telegram', { steps: [{ templateId: 51, message: 'x' }, { message: 'y' }] }, createTemplateIdMaps())).toEqual({
      steps: [{ templateId: null, message: 'x' }, { message: 'y' }],
    });
    expect(remapTemplateIdsInConfig('send_whatsapp', { steps: [{ templateId: '52', message: 'y' }] }, createTemplateIdMaps())).toEqual({
      steps: [{ templateId: null, message: 'y' }],
    });
  });

  it('khối khác và config rỗng/rác: trả đúng giá trị đưa vào', () => {
    const config = { sheetUrl: 'x', templateId: 5 };
    expect(remapTemplateIdsInConfig('read_sheet', config, maps({ 5: '1' }))).toBe(config);
    expect(remapTemplateIdsInConfig('send_email', null, maps({ 5: '1' }))).toBeNull();
    expect(remapTemplateIdsInConfig('send_email', 'abc', maps({ 5: '1' }))).toBe('abc');
    const jsonText = JSON.stringify({ emailTemplateId: 5 });
    // chuỗi JSON đọc được và có đổi → ra object mới; không đổi gì → trả nguyên chuỗi
    expect(remapTemplateIdsInConfig('send_email', jsonText, maps({ 5: '9' }))).toEqual({ emailTemplateId: 9 });
    expect(remapTemplateIdsInConfig('send_email', JSON.stringify({ emailSubject: 'x' }), maps({ 5: '9' }))).toBe(JSON.stringify({ emailSubject: 'x' }));
  });
});

describe('remapTemplateIdsInFlowJson — flow_json (nguồn hiển thị của trình dựng) cũng đổi id mẫu', () => {
  const flow = {
    nodes: [
      { id: 'a', type: 'task', data: { nodeType: 'send_zalo_group', label: 'Gửi nhóm', config: { zaloGroupTemplateSteps: [{ templateId: 31 }] } } },
      { id: 'b', type: 'task', data: { nodeType: 'send_email', config: { emailSteps: [{ templateId: '11' }] } } },
      { id: 'c', type: 'start', data: { nodeType: 'manual_trigger', config: {} } },
    ],
    edges: [{ id: 'e1', source: 'a', target: 'b' }],
  };

  it('đổi id ở mọi khối, giữ nguyên id khối và cạnh', () => {
    const next = remapTemplateIdsInFlowJson(flow, maps({ 11: '501' }, { 31: '701' }));
    expect(next.nodes[0].data.config.zaloGroupTemplateSteps[0].templateId).toBe(701);
    expect(next.nodes[1].data.config.emailSteps[0].templateId).toBe('501');
    expect(next.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(next.edges).toBe(flow.edges);
    expect(flow.nodes[0].data.config.zaloGroupTemplateSteps[0].templateId).toBe(31); // không đụng bản gốc
  });

  it('không có gì đổi → trả đúng object cũ; flow_json lạ (null, chuỗi hỏng, thiếu nodes) → trả nguyên', () => {
    const empty = { nodes: [{ id: 'c', data: { nodeType: 'manual_trigger', config: {} } }] };
    expect(remapTemplateIdsInFlowJson(empty, createTemplateIdMaps())).toBe(empty);
    expect(remapTemplateIdsInFlowJson(null, createTemplateIdMaps())).toBeNull();
    expect(remapTemplateIdsInFlowJson('không phải json', createTemplateIdMaps())).toBe('không phải json');
    expect(remapTemplateIdsInFlowJson({ edges: [] }, createTemplateIdMaps())).toEqual({ edges: [] });
  });

  it('flow_json dạng chuỗi JSON được đọc rồi đổi', () => {
    const next = remapTemplateIdsInFlowJson(JSON.stringify(flow), maps({ 11: '501' }, { 31: '701' }));
    expect(next.nodes[1].data.config.emailSteps[0].templateId).toBe('501');
  });

  it('subtype lấy từ data.nodeType, rơi về type của khối', () => {
    const next = remapTemplateIdsInFlowJson(
      { nodes: [{ id: 'x', type: 'send_zalo_group', data: { config: { zaloGroupTemplateSteps: [{ templateId: 31 }] } } }] },
      maps({}, { 31: '701' })
    );
    expect(next.nodes[0].data.config.zaloGroupTemplateSteps[0].templateId).toBe(701);
  });
});
