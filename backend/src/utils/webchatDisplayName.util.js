/**
 * Prefer a distinguishable webchat display name over "{widget} - {id}".
 */
export function formatWebchatDisplayName({
  visitorName,
  channelDisplayName,
  conversationId,
  firstMessageSnippet = null,
} = {}) {
  const name = String(visitorName || '').trim();
  const snippet = String(firstMessageSnippet || '').trim().replace(/\s+/g, ' ').slice(0, 48);

  if (name && !isGenericWebchatName(name, channelDisplayName, conversationId)) {
    return name;
  }
  if (snippet) return snippet;
  if (name) return name;
  return `Khách #${conversationId}`;
}

function isGenericWebchatName(name, channelDisplayName, conversationId) {
  const n = String(name).trim().toLowerCase();
  const channel = String(channelDisplayName || '').trim().toLowerCase();
  if (!n) return true;
  if (channel && n === `${channel} - ${conversationId}`.toLowerCase()) return true;
  if (/^khách(\s*web)?(\s*#?\d+)?$/i.test(name)) return true;
  return false;
}
