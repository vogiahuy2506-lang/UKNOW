/**
 * Build ReactFlow nodes/edges from campaign payload.
 *
 * Supports both:
 * - modern `flowJson` payload
 * - legacy `nodes` + `connections` payload
 *
 * @param {Object} campaignData backend campaign object
 * @returns {{nodes: Array, edges: Array}} normalized flow data
 */
export const buildFlowFromCampaign = (campaignData) => {
  const flow = normalizeFlowJson(campaignData?.flowJson);
  if (flow?.nodes && flow?.edges) {
    const storedNodes = Array.isArray(campaignData?.nodes) ? campaignData.nodes : [];
    const storedMap = new Map(
      storedNodes.map((n) => [String(n.tempId || n.id || n.nodeId || ''), n]).filter(([k]) => k)
    );
    const rawNodes = Array.isArray(flow.nodes) ? flow.nodes : [];
    const rawEdges = Array.isArray(flow.edges) ? flow.edges : [];
    return {
      nodes: rawNodes.map((n) => {
        const normalizedId = normalizeNodeId(n.id);
        const stored = storedMap.get(normalizedId) || null;
        if (!stored) {
          return { ...n, id: normalizedId };
        }
        return {
          ...n,
          id: normalizedId,
          data: {
            ...n.data,
            label: n.data?.label || stored.nodeName || n.data?.label,
            nodeType: n.data?.nodeType || stored.nodeSubtype || stored.nodeType || n.data?.nodeType,
            config: {
              ...(stored.config || {}),
              ...(n.data?.config || {}),
            },
          },
        };
      }),
      edges: rawEdges.map((e) => ({
        ...e,
        source: normalizeEdgeEnd(e.source),
        target: normalizeEdgeEnd(e.target),
      })),
    };
  }

  const fallbackNodes = (campaignData?.nodes || []).map((node) => ({
    id: normalizeNodeId(node.id),
    type: node.nodeSubtype === 'start' ? 'start' : node.nodeSubtype === 'end' ? 'end' : 'task',
    position: {
      x: Number(node.positionX) || 0,
      y: Number(node.positionY) || 0,
    },
    data: {
      label: node.nodeName || '',
      nodeType: node.nodeSubtype || node.nodeType,
      config: node.config || {},
    },
  }));

  const fallbackEdges = (campaignData?.connections || []).map((conn, index) => ({
    id: conn.id ? String(conn.id) : `${normalizeEdgeEnd(conn.sourceNodeId)}-${normalizeEdgeEnd(conn.targetNodeId)}-${index}`,
    source: normalizeEdgeEnd(conn.sourceNodeId),
    target: normalizeEdgeEnd(conn.targetNodeId),
    type: conn.connectionType || 'custom',
    label: conn.connectionLabel || undefined,
  }));

  return { nodes: fallbackNodes, edges: fallbackEdges };
};

const normalizeFlowJson = (flowJson) => {
  if (!flowJson) return null;
  if (typeof flowJson === 'string') {
    try {
      return JSON.parse(flowJson);
    } catch (error) {
      console.error('Failed to parse flowJson:', error);
      return null;
    }
  }
  return flowJson;
};

const normalizeNodeId = (id) => String(id ?? '');
const normalizeEdgeEnd = (id) => String(id ?? '');
