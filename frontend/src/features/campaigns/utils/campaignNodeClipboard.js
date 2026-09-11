const DEFAULT_PASTE_OFFSET = 40;

function deepClone(value) {
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // Campaign node data should be serializable; fall back for older/custom node values.
    }
  }
  return JSON.parse(JSON.stringify(value));
}

function buildNodeId(nodeType, pasteSequence) {
  const safeType = String(nodeType || 'node').replace(/[^a-z0-9_-]/gi, '-');
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${safeType}-${Date.now()}-${pasteSequence}-${randomPart}`;
}

function buildUniqueLabel(baseLabel, nodes) {
  const existingLabels = new Set(
    (nodes || []).map((node) => String(node?.data?.label || '').trim()).filter(Boolean)
  );
  if (!existingLabels.has(baseLabel)) return baseLabel;

  let suffix = 2;
  while (existingLabels.has(`${baseLabel} ${suffix}`)) suffix += 1;
  return `${baseLabel} ${suffix}`;
}

export function isEditableClipboardTarget(target) {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

export function createCampaignNodeSnapshot(node) {
  if (!node) return null;
  return {
    type: node.type,
    position: {
      x: Number(node.position?.x) || 0,
      y: Number(node.position?.y) || 0,
    },
    data: deepClone(node.data || {}),
  };
}

export function createPastedCampaignNode({
  snapshot,
  nodes,
  pasteSequence,
  copyLabel,
  idFactory = buildNodeId,
  offset = DEFAULT_PASTE_OFFSET,
}) {
  if (!snapshot) return null;
  const sequence = Math.max(1, Number(pasteSequence) || 1);
  const nodeType = snapshot.data?.nodeType || snapshot.type || 'node';
  const label = buildUniqueLabel(copyLabel, nodes);

  return {
    id: idFactory(nodeType, sequence),
    type: snapshot.type,
    position: {
      x: snapshot.position.x + offset * sequence,
      y: snapshot.position.y + offset * sequence,
    },
    data: {
      ...deepClone(snapshot.data || {}),
      label,
    },
    selected: true,
  };
}
