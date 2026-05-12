import { describe, it, expect, vi } from 'vitest';
import { buildFlowFromCampaign } from '../campaignBuilderFlowSerialization';

describe('buildFlowFromCampaign', () => {
  it('flowJson object — pass-through nodes/edges, normalize id sang string', () => {
    const { nodes, edges } = buildFlowFromCampaign({
      flowJson: {
        nodes: [{ id: 1, data: { label: 'Start' }, position: { x: 0, y: 0 } }],
        edges: [{ id: 'e1', source: 1, target: 2 }],
      },
    });
    expect(nodes).toEqual([
      { id: '1', data: { label: 'Start' }, position: { x: 0, y: 0 } },
    ]);
    expect(edges[0].source).toBe('1');
    expect(edges[0].target).toBe('2');
  });

  it('flowJson dạng chuỗi JSON — parse thành công', () => {
    const json = JSON.stringify({
      nodes: [{ id: 'a', data: {}, position: { x: 0, y: 0 } }],
      edges: [{ id: 'e1', source: 'a', target: 'b' }],
    });
    const { nodes } = buildFlowFromCampaign({ flowJson: json });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('a');
  });

  it('flowJson chuỗi JSON hỏng — fallback sang legacy + log lỗi', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = buildFlowFromCampaign({
      flowJson: '{invalid json',
      nodes: [],
      connections: [],
    });
    expect(result.nodes).toEqual([]);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('merge stored config với node data trong flowJson (flowJson chiếm ưu tiên)', () => {
    const { nodes } = buildFlowFromCampaign({
      flowJson: {
        nodes: [{ id: 'n1', data: { label: 'New', config: { freq: 5 } }, position: { x: 0, y: 0 } }],
        edges: [],
      },
      nodes: [
        {
          tempId: 'n1',
          nodeName: 'Stored Label',
          nodeSubtype: 'read_sheet',
          config: { sheetId: 'abc', freq: 10 },
        },
      ],
    });
    expect(nodes[0].data.label).toBe('New');
    expect(nodes[0].data.nodeType).toBe('read_sheet');
    expect(nodes[0].data.config).toEqual({ sheetId: 'abc', freq: 5 });
  });

  it('flowJson không match storedMap — giữ nguyên flowJson node', () => {
    const { nodes } = buildFlowFromCampaign({
      flowJson: {
        nodes: [{ id: 'x', data: { label: 'X' }, position: { x: 0, y: 0 } }],
        edges: [],
      },
      nodes: [{ tempId: 'y', nodeName: 'Y' }],
    });
    expect(nodes[0]).toMatchObject({ id: 'x', data: { label: 'X' } });
  });

  it('legacy fallback — build từ nodes + connections', () => {
    const { nodes, edges } = buildFlowFromCampaign({
      nodes: [
        { id: 1, nodeName: 'Start', nodeSubtype: 'start', positionX: 0, positionY: 0 },
        { id: 2, nodeName: 'Task', nodeSubtype: 'read_sheet', positionX: 100, positionY: 50, config: { a: 1 } },
        { id: 3, nodeName: 'End', nodeSubtype: 'end', positionX: 200, positionY: 100 },
      ],
      connections: [
        { id: 10, sourceNodeId: 1, targetNodeId: 2, connectionType: 'custom', connectionLabel: 'OK' },
        { sourceNodeId: 2, targetNodeId: 3 },
      ],
    });
    expect(nodes).toEqual([
      { id: '1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start', nodeType: 'start', config: {} } },
      { id: '2', type: 'task', position: { x: 100, y: 50 }, data: { label: 'Task', nodeType: 'read_sheet', config: { a: 1 } } },
      { id: '3', type: 'end', position: { x: 200, y: 100 }, data: { label: 'End', nodeType: 'end', config: {} } },
    ]);
    expect(edges).toEqual([
      { id: '10', source: '1', target: '2', type: 'custom', label: 'OK' },
      { id: '2-3-1', source: '2', target: '3', type: 'custom', label: undefined },
    ]);
  });

  it('campaign rỗng → nodes/edges rỗng', () => {
    expect(buildFlowFromCampaign({})).toEqual({ nodes: [], edges: [] });
    expect(buildFlowFromCampaign(null)).toEqual({ nodes: [], edges: [] });
  });
});
