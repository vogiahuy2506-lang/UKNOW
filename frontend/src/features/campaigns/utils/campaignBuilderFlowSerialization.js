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
  console.log('[buildFlowFromCampaign] Called with campaignData:', JSON.stringify(campaignData, null, 2));

  // Handle AI script format - direct nodes array (AI can return different structures)
  if (campaignData && campaignData.nodes && Array.isArray(campaignData.nodes) && campaignData.nodes.length > 0) {
    const aiNodes = campaignData.nodes;
    const aiConnections = campaignData.connections || [];

    console.log('[buildFlowFromCampaign] Processing AI script with', aiNodes.length, 'nodes');

    const reactFlowNodes = aiNodes.map((node, index) => {
      let nodeType = 'task';
      // Handle different field names: nodeSubtype, type, nodeType
      const nodeSubtype = node.nodeSubtype || node.type || node.nodeType || '';
      // Handle different field names: nodeName, name, label
      const nodeName = node.nodeName || node.name || node.label || 'Node';
      // Handle different field names: nodeDescription, description
      const nodeDescription = node.nodeDescription || node.description || '';

      if (nodeSubtype === 'start' || nodeSubtype === 'manual' || nodeSubtype === 'read_landing_leads' || nodeSubtype === 'trigger') {
        nodeType = 'start';
      } else if (nodeSubtype === 'end') {
        nodeType = 'end';
      } else if (nodeSubtype === 'send_email' || nodeSubtype === 'email_send') {
        nodeType = 'task';
      }

      const nodeId = node.tempId || node.id || `node_${index + 1}`;

      // Handle config from different formats:
      // 1. New format: { settings: { subject, bodyHtml } }
      // 2. Legacy format: { config: { emailSubject, emailBody } }
      // 3. AI format: { template: { subject, bodyHtml } }
      // 4. Flat format: { subject, bodyHtml } directly on node
      let config = {};
      if (node.settings) {
        config = {
          emailTemplateId: null,
          emailSubject: node.settings.subject || '',
          emailBody: node.settings.bodyHtml || node.settings.bodyText || '',
          templateMappings: [],
          enableLinkTracking: true,
          saveMessageLog: true,
        };
      } else if (node.template) {
        // AI format: { template: { subject, bodyHtml } }
        config = {
          emailTemplateId: null,
          emailSubject: node.template.subject || '',
          emailBody: node.template.bodyHtml || node.template.bodyText || '',
          templateMappings: [],
          enableLinkTracking: true,
          saveMessageLog: true,
        };
      } else if (node.config) {
        config = node.config;
      } else if (node.subject || node.bodyHtml || node.bodyText) {
        // Flat format directly on node
        config = {
          emailTemplateId: null,
          emailSubject: node.subject || '',
          emailBody: node.bodyHtml || node.bodyText || '',
          templateMappings: [],
          enableLinkTracking: true,
          saveMessageLog: true,
        };
      }

      return {
        id: nodeId,
        type: nodeType,
        position: {
          x: Number(node.positionX) || Number(node.position?.x) || (index * 300 + 100),
          y: Number(node.positionY) || Number(node.position?.y) || 100,
        },
        data: {
          label: nodeName,
          nodeType: nodeSubtype,
          config: config,
          description: nodeDescription,
        },
      };
    });

    // Convert AI connections to ReactFlow edges
    // Handle different formats: { sourceNodeId, targetNodeId } or { source, target }
    let reactFlowEdges = aiConnections.map((conn, index) => {
      return {
        id: conn.id || `edge_${index + 1}`,
        source: conn.sourceNodeId || conn.source || '',
        target: conn.targetNodeId || conn.target || '',
        type: 'custom',
        label: conn.connectionLabel || undefined,
      };
    });

    // If no connections but we have nodes, create default sequential connections
    if (reactFlowEdges.length === 0 && reactFlowNodes.length > 1) {
      console.log('[buildFlowFromCampaign] No connections found, creating sequential connections');
      for (let i = 0; i < reactFlowNodes.length - 1; i++) {
        reactFlowEdges.push({
          id: `edge_${i + 1}`,
          source: reactFlowNodes[i].id,
          target: reactFlowNodes[i + 1].id,
          type: 'custom',
        });
      }
    }

    console.log('[buildFlowFromCampaign] Converted to', reactFlowNodes.length, 'nodes and', reactFlowEdges.length, 'edges');

    return { nodes: reactFlowNodes, edges: reactFlowEdges };
  }

  // Legacy check for _aiScript (nested format)
  const legacyAiScript = campaignData?._aiScript;
  if (legacyAiScript && legacyAiScript.nodes && Array.isArray(legacyAiScript.nodes) && legacyAiScript.nodes.length > 0) {
    console.log('[buildFlowFromCampaign] Processing legacy _aiScript format');
    return buildFlowFromCampaign(legacyAiScript);
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
