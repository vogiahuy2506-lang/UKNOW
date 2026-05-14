/**
 * Build ReactFlow nodes/edges from campaign payload.
 *
 * Supports both:
 * - modern `flowJson` payload
 * - legacy `nodes` + `connections` payload
 * - AI script format (nodes with tempId, connections)
 *
 * @param {Object} campaignData backend campaign object
 * @returns {{nodes: Array, edges: Array}} normalized flow data
 */
export const buildFlowFromCampaign = (campaignData) => {
  // Handle AI script format - AI uses tempId instead of id
  if (campaignData && campaignData.nodes && campaignData.connections) {
    console.log('[buildFlowFromCampaign] Processing AI script with', campaignData.nodes.length, 'nodes');

    // AI script nodes have tempId, positionX, positionY, nodeSubtype, nodeName, config
    const aiNodes = campaignData.nodes;
    const aiConnections = campaignData.connections || [];

    // Convert AI nodes to ReactFlow nodes
    const reactFlowNodes = aiNodes.map((node, index) => {
      // Determine node type for ReactFlow
      const nodeSubtype = node.nodeSubtype || node.nodeType || '';
      let nodeType = 'task';

      if (nodeSubtype === 'start' || nodeSubtype === 'manual' || nodeSubtype === 'read_landing_leads') {
        nodeType = 'start';
      } else if (nodeSubtype === 'end') {
        nodeType = 'end';
      }

      // Use tempId as the ReactFlow node id, or generate one
      const nodeId = node.tempId || node.id || `node_${index + 1}`;

      return {
        id: nodeId,
        type: nodeType,
        position: {
          x: Number(node.positionX) || (index * 300 + 100),
          y: Number(node.positionY) || 100,
        },
        data: {
          label: node.nodeName || node.label || 'Node',
          nodeType: node.nodeSubtype || node.nodeType || 'task',
          config: node.config || {},
          description: node.nodeDescription || '',
        },
      };
    });

    // Convert AI connections to ReactFlow edges
    const reactFlowEdges = aiConnections.map((conn, index) => {
      return {
        id: conn.id || `edge_${index + 1}`,
        source: conn.sourceNodeId || conn.source || '',
        target: conn.targetNodeId || conn.target || '',
        type: 'custom',
        label: conn.connectionLabel || undefined,
      };
    });

    console.log('[buildFlowFromCampaign] Converted to', reactFlowNodes.length, 'nodes and', reactFlowEdges.length, 'edges');

    return { nodes: reactFlowNodes, edges: reactFlowEdges };
  }

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

  // Legacy format
  const legacyNodes = Array.isArray(campaignData?.nodes) ? campaignData.nodes : [];
  const fallbackNodes = legacyNodes.map((node, index) => {
    // Handle both tempId and id
    const nodeId = node.tempId || node.id || `node_${index + 1}`;
    const nodeSubtype = node.nodeSubtype || node.nodeType || '';
    let nodeType = 'task';

    if (nodeSubtype === 'start' || nodeSubtype === 'manual' || nodeSubtype === 'read_landing_leads') {
      nodeType = 'start';
    } else if (nodeSubtype === 'end') {
      nodeType = 'end';
    }

    return {
      id: normalizeNodeId(nodeId),
      type: nodeType,
      position: {
        x: Number(node.positionX) || (index * 300 + 100),
        y: Number(node.positionY) || 100,
      },
      data: {
        label: node.nodeName || node.label || '',
        nodeType: node.nodeSubtype || node.nodeType || 'task',
        config: node.config || {},
      },
    };
  });

  const fallbackEdges = (campaignData?.connections || []).map((conn, index) => ({
    id: conn.id ? String(conn.id) : `${normalizeEdgeEnd(conn.sourceNodeId)}-${normalizeEdgeEnd(conn.targetNodeId)}-${index}`,
    source: normalizeEdgeEnd(conn.sourceNodeId || conn.source),
    target: normalizeEdgeEnd(conn.targetNodeId || conn.target),
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
