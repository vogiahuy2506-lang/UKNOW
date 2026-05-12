import { describe, it, expect, vi } from 'vitest';
import {
  getUpstreamNodes,
  buildRunLogMap,
  getSchemaForNodeId,
} from '../nodeConfigModalSchema';

describe('getUpstreamNodes', () => {
  it('không có currentNodeId → []', () => {
    expect(getUpstreamNodes({ currentNodeId: null, nodes: [{ id: 'a' }], edges: [] })).toEqual([]);
  });

  it('nodes/edges rỗng → []', () => {
    expect(getUpstreamNodes({ currentNodeId: 'a', nodes: [], edges: [{ source: 'a', target: 'b' }] })).toEqual([]);
    expect(getUpstreamNodes({ currentNodeId: 'a', nodes: [{ id: 'a' }], edges: [] })).toEqual([]);
  });

  it('BFS upstream nhiều cấp', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
      { source: 'c', target: 'd' },
    ];
    const result = getUpstreamNodes({ currentNodeId: 'd', nodes, edges });
    const ids = result.map((n) => n.id).sort();
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('node không có upstream → []', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }];
    const edges = [{ source: 'a', target: 'b' }];
    expect(getUpstreamNodes({ currentNodeId: 'a', nodes, edges })).toEqual([]);
  });

  it('đồ thị nhánh — gom tất cả tổ tiên', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const edges = [
      { source: 'a', target: 'c' },
      { source: 'b', target: 'c' },
      { source: 'c', target: 'd' },
    ];
    const result = getUpstreamNodes({ currentNodeId: 'd', nodes, edges });
    expect(result.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('buildRunLogMap', () => {
  it('logs rỗng → {}', () => {
    expect(buildRunLogMap([])).toEqual({});
    expect(buildRunLogMap()).toEqual({});
  });

  it('chỉ keep log có nodeId + result.output', () => {
    const logs = [
      { nodeId: 'a', result: { output: { items: [] } } },
      { nodeId: 'b', result: {} },
      { result: { output: {} } },
      { nodeId: 'c', result: { output: { items: [1] } } },
    ];
    const map = buildRunLogMap(logs);
    expect(Object.keys(map).sort()).toEqual(['a', 'c']);
    expect(map.a).toBe(logs[0]);
  });
});

describe('getSchemaForNodeId', () => {
  const buildSchemaFromRows = vi.fn((rows) =>
    Array.isArray(rows) && rows.length ? Object.keys(rows[0]).map((k) => ({ key: k, type: 'string' })) : []
  );

  it('nodeId rỗng → []', () => {
    expect(getSchemaForNodeId({ nodeId: null, buildSchemaFromRows })).toEqual([]);
  });

  it('runLog có schema → dùng schema từ run', () => {
    const runLogMap = {
      a: { result: { output: { schema: [{ key: 'foo', type: 'string' }] } } },
    };
    expect(getSchemaForNodeId({ nodeId: 'a', runLogMap, buildSchemaFromRows })).toEqual([
      { key: 'foo', type: 'string' },
    ]);
  });

  it('runLog không schema nhưng có items → dùng buildSchemaFromRows', () => {
    const runLogMap = {
      a: { result: { output: { items: [{ x: 1, y: 2 }] } } },
    };
    const schema = getSchemaForNodeId({ nodeId: 'a', runLogMap, buildSchemaFromRows });
    expect(schema).toEqual([
      { key: 'x', type: 'string' },
      { key: 'y', type: 'string' },
    ]);
  });

  it('không runLog → read_sheet trả columns từ config', () => {
    const nodes = [
      { id: 'a', data: { nodeType: 'read_sheet', config: { columns: ['name', 'email'] } } },
    ];
    expect(getSchemaForNodeId({ nodeId: 'a', nodes, buildSchemaFromRows })).toEqual([
      { key: 'name', type: 'string' },
      { key: 'email', type: 'string' },
    ]);
  });

  it('read_sheet không có columns → []', () => {
    const nodes = [{ id: 'a', data: { nodeType: 'read_sheet', config: {} } }];
    expect(getSchemaForNodeId({ nodeId: 'a', nodes, buildSchemaFromRows })).toEqual([]);
  });

  it('default schema cho read_courses_db', () => {
    const nodes = [{ id: 'a', data: { nodeType: 'read_courses_db' } }];
    const schema = getSchemaForNodeId({ nodeId: 'a', nodes, buildSchemaFromRows });
    expect(schema.find((c) => c.key === 'courseCode')).toEqual({ key: 'courseCode', type: 'string' });
    expect(schema.find((c) => c.key === 'price')).toEqual({ key: 'price', type: 'number' });
  });

  it('default schema cho read_landing_leads', () => {
    const nodes = [{ id: 'a', data: { nodeType: 'read_landing_leads' } }];
    const schema = getSchemaForNodeId({ nodeId: 'a', nodes, buildSchemaFromRows });
    expect(schema.find((c) => c.key === 'leadId')).toBeDefined();
    expect(schema.find((c) => c.key === 'marketingConsent')).toEqual({
      key: 'marketingConsent',
      type: 'boolean',
    });
  });

  it('default schema cho read_interested_customers + select_zalo_account + get_all_friends + get_all_groups', () => {
    const nodes = [
      { id: 'a', data: { nodeType: 'read_interested_customers' } },
      { id: 'b', data: { nodeType: 'select_zalo_account' } },
      { id: 'c', data: { nodeType: 'get_all_friends' } },
      { id: 'd', data: { nodeType: 'get_all_groups' } },
    ];
    expect(getSchemaForNodeId({ nodeId: 'a', nodes, buildSchemaFromRows }).some((c) => c.key === 'customerId')).toBe(true);
    expect(getSchemaForNodeId({ nodeId: 'b', nodes, buildSchemaFromRows }).some((c) => c.key === 'displayName')).toBe(true);
    expect(getSchemaForNodeId({ nodeId: 'c', nodes, buildSchemaFromRows }).some((c) => c.key === 'uid')).toBe(true);
    expect(getSchemaForNodeId({ nodeId: 'd', nodes, buildSchemaFromRows }).some((c) => c.key === 'groupId')).toBe(true);
  });

  it('nodeType không biết → []', () => {
    const nodes = [{ id: 'a', data: { nodeType: 'unknown_node' } }];
    expect(getSchemaForNodeId({ nodeId: 'a', nodes, buildSchemaFromRows })).toEqual([]);
  });
});
