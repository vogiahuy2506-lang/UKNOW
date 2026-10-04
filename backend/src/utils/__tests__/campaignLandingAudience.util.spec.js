/**
 * Rà soát C P2-7 (04/10/2026) — lưới cuối cho nguồn "lead của landing".
 *
 * `read_landing_leads` với `landingLeadsSlugs: []` đọc MỌI lead của MỌI landing. Hai đường từng dựng ra mảng rỗng mà người dùng
 * không chọn (model bỏ slug; FE vá node khách DB thành node lead landing slug rỗng). Hàm thuần dưới đây quyết định:
 *  - đã chọn → ghi đúng lựa chọn lên node (đè slug model tự điền, đổi nguồn "khách DB" nếu model bỏ qua dataSource);
 *  - chưa chọn mà node slug rỗng → needs_choice.
 */
import { describe, expect, it } from '@jest/globals';
import { landingSelectionOf, resolveLandingAudienceChoice } from '../campaignLandingAudience.util.js';

const landingNode = (slugs, extra = {}) => ({
  tempId: 'n_audience',
  nodeType: 'data',
  nodeSubtype: 'read_landing_leads',
  config: slugs === undefined ? {} : { landingLeadsSlugs: slugs },
  ...extra,
});
const dbNode = () => ({
  tempId: 'n_audience',
  nodeType: 'data',
  nodeSubtype: 'interested_customers',
  nodeName: 'Khách trong DB',
  config: { interestedCustomerType: 'both', interestedLimit: 1000 },
});
const sendNode = { tempId: 'n_send', nodeType: 'action', nodeSubtype: 'send_email', config: { recipientSource: 'node', recipientNodeId: 'n_audience' } };

describe('landingSelectionOf', () => {
  it('chỉ coi là ĐÃ CHỌN khi có ≥ 1 slug hoặc "Tất cả" tường minh — mảng rỗng KHÔNG phải "tất cả"', () => {
    expect(landingSelectionOf({ landingLeadsSlugs: [], landingLeadsAll: false }).chosen).toBe(false);
    expect(landingSelectionOf({}).chosen).toBe(false);
    expect(landingSelectionOf(null).chosen).toBe(false);
    expect(landingSelectionOf({ landingLeadsSlugs: ['a'] })).toEqual({ chosen: true, all: false, slugs: ['a'] });
    expect(landingSelectionOf({ landingLeadsAll: true })).toEqual({ chosen: true, all: true, slugs: [] });
  });
});

describe('resolveLandingAudienceChoice — CHƯA chọn', () => {
  it('node read_landing_leads slug rỗng (model không điền) → needs_choice, không đụng script', () => {
    const script = { nodes: [landingNode([]), sendNode] };
    const result = resolveLandingAudienceChoice(script, { dataSource: 'db', landingLeadsSlugs: [], landingLeadsAll: false });
    expect(result.status).toBe('needs_choice');
    expect(script.nodes[0].config.landingLeadsSlugs).toEqual([]);
  });

  it('node thiếu hẳn trường landingLeadsSlugs cũng là slug rỗng → needs_choice', () => {
    expect(resolveLandingAudienceChoice({ nodes: [landingNode(undefined)] }, {}).status).toBe('needs_choice');
  });

  it('node đã có slug do model điền nhưng người dùng chưa chọn gì → không chặn (slug cụ thể không phải "mọi lead")', () => {
    const script = { nodes: [landingNode(['khoa-ielts'])] };
    expect(resolveLandingAudienceChoice(script, {}).status).toBe('none');
    expect(script.nodes[0].config.landingLeadsSlugs).toEqual(['khoa-ielts']);
  });

  it('script không có node lead landing → none', () => {
    expect(resolveLandingAudienceChoice({ nodes: [dbNode(), sendNode] }, {}).status).toBe('none');
    expect(resolveLandingAudienceChoice({ nodes: 'x' }, {}).status).toBe('none');
    expect(resolveLandingAudienceChoice(null, {}).status).toBe('none');
  });
});

describe('resolveLandingAudienceChoice — ĐÃ chọn', () => {
  it('ghi slug người dùng chọn lên node, ĐÈ slug model tự điền', () => {
    const script = { nodes: [landingNode(['slug-khac-do-model-bia']), sendNode] };
    const result = resolveLandingAudienceChoice(script, { dataSource: 'landing', landingLeadsSlugs: ['khoa-ielts', 'khoa-toeic'] });
    expect(result).toMatchObject({ status: 'applied', updatedNodes: 1, convertedNodes: 0 });
    expect(script.nodes[0].config.landingLeadsSlugs).toEqual(['khoa-ielts', 'khoa-toeic']);
    expect(script.landingLeadsAll).toBeUndefined();
  });

  it('giữ nguyên các bộ lọc khác của node (nghề nghiệp, khoảng ngày…)', () => {
    const script = { nodes: [{ ...landingNode([]), config: { landingLeadsSlugs: [], landingLeadsOccupations: ['Giáo viên'] } }] };
    resolveLandingAudienceChoice(script, { landingLeadsSlugs: ['a'] });
    expect(script.nodes[0].config).toEqual({ landingLeadsSlugs: ['a'], landingLeadsOccupations: ['Giáo viên'] });
  });

  it('"Tất cả landing" tường minh → slug rỗng được phép VÀ script mang dấu landingLeadsAll', () => {
    const script = { nodes: [landingNode([]), sendNode] };
    const result = resolveLandingAudienceChoice(script, { dataSource: 'landing', landingLeadsAll: true });
    expect(result.status).toBe('applied');
    expect(script.nodes[0].config.landingLeadsSlugs).toEqual([]);
    expect(script.landingLeadsAll).toBe(true);
  });

  it('ca đúng của rà soát: chọn nguồn landing rồi model dựng node KHÁCH DB → thành lead landing với slug ĐÃ CHỌN, KHÔNG ra slug rỗng', () => {
    const script = { nodes: [dbNode(), sendNode] };
    const result = resolveLandingAudienceChoice(script, { dataSource: 'landing', landingLeadsSlugs: ['khoa-ielts'] });
    expect(result).toMatchObject({ status: 'applied', convertedNodes: 1 });
    expect(script.nodes[0].nodeSubtype).toBe('read_landing_leads');
    expect(script.nodes[0].config).toEqual({ landingLeadsSlugs: ['khoa-ielts'] });
    // Cùng id → node gửi vẫn trỏ đúng nguồn.
    expect(script.nodes[0].tempId).toBe('n_audience');
    expect(script.nodes[1].config.recipientNodeId).toBe('n_audience');
  });

  it('đổi node khách DB cả khi snake_case (node_subtype) — giữ hai dạng đồng bộ', () => {
    const script = { nodes: [{ id: 'a', node_subtype: 'interested_customers', nodeSubtype: 'interested_customers', node_name: 'x', config: {} }] };
    resolveLandingAudienceChoice(script, { dataSource: 'landing', landingLeadsSlugs: ['a'] });
    expect(script.nodes[0].node_subtype).toBe('read_landing_leads');
    expect(script.nodes[0].nodeSubtype).toBe('read_landing_leads');
  });

  it('dataSource KHÔNG phải landing → không đổi node khách DB (người dùng chọn nguồn khác)', () => {
    const script = { nodes: [dbNode()] };
    const result = resolveLandingAudienceChoice(script, { dataSource: 'db', landingLeadsSlugs: ['a'] });
    expect(result.status).toBe('none');
    expect(script.nodes[0].nodeSubtype).toBe('interested_customers');
  });

  it('đã có node nguồn biểu mẫu → không thêm nguồn landing thứ hai bằng cách đổi node khách DB', () => {
    const script = { nodes: [{ tempId: 'f', nodeSubtype: 'read_form_submissions', config: { formId: 3 } }, dbNode()] };
    const result = resolveLandingAudienceChoice(script, { dataSource: 'landing', landingLeadsSlugs: ['a'] });
    expect(result.convertedNodes).toBe(0);
    expect(script.nodes[1].nodeSubtype).toBe('interested_customers');
  });
});
