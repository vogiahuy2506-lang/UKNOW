/**
 * Reconstitute template_draft message data from DB records.
 *
 * In DB, `ai_chat_messages.data` for a template draft only persists canonical identity
 * fields like `planSlotKey`. Client-side transient workflow flags (such as `_planTemplate`,
 * `_planSlotKey`, `_planDay`, `_planSlotIndex`, `_fromLibrary`) are reconstructed from
 * `planSlotKey` and `wizard_state.plan.savedTemplates`.
 */
export function enrichTemplateDraftFromDb(data, savedTemplates = []) {
  if (!data || typeof data !== 'object') return data;
  const planSlotKey = data.planSlotKey || data._planSlotKey;
  if (!planSlotKey) return data;

  const match = String(planSlotKey).match(/^d(\d+)-s(\d+)/i);
  const day = match ? Number(match[1]) : (Number(data._planDay) || null);
  const slotIndex = match ? Number(match[2]) : (Number(data._planSlotIndex) || 1);
  const saved = Array.isArray(savedTemplates)
    ? savedTemplates.find((s) => String(s.slotId) === String(planSlotKey))
    : null;

  return {
    ...data,
    planSlotKey,
    _planTemplate: true,
    _planSlotKey: planSlotKey,
    _planSlotId: planSlotKey,
    _planDay: day,
    _planSlotIndex: slotIndex,
    ...(saved ? { _fromLibrary: true, _libraryTemplateId: saved.templateId } : {}),
  };
}
