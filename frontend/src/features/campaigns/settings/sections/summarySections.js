/**
 * Hai mục tóm tắt của tab Thiết lập — Thời điểm · Sau khi gửi (Nội dung có biểu mẫu riêng ở `contentSection.js`). Chỗ sửa là hộp Lên lịch /
 * hộp cài đặt của bước phụ.
 *
 * Trạng thái "thiếu" lấy từ `tone: 'missing'` của `describeNodeSettings` theo `role` (bám `validateNodeForRun`), không viết lại luật.
 */
import describeNodeSettings from '../describeNodeSettings';
import buildSettingsOrder from '../buildSettingsOrder';
import { NOT_RUN_SIDE_STEP_SUBTYPES, SIDE_STEP_SUBTYPES, analyzeSettingsGraph, canRemoveSideStep, findAppendAnchor } from '../settingsGraph';
import { configOf, idOf, subtypeOf, text } from './sectionUtils';

const orderedNodes = (nodes, edges) => {
  const { ordered, unconnected } = buildSettingsOrder(nodes, edges);
  return [...ordered.map((entry) => entry.node), ...unconnected];
};

/** Thời điểm luôn hợp lệ (chạy tay là một lựa chọn); tóm tắt = lịch chạy của chiến dịch. */
export function readTiming(nodes, edges, ctx) {
  const { scheduleSummary = '', t } = ctx;
  return { key: 'timing', status: 'ok', summary: scheduleSummary || t('campaignSettings.section.timing.manual'), nodeIds: [] };
}

const sideStepSummary = (node, t) => {
  const config = configOf(node);
  switch (subtypeOf(node)) {
    case 'tag_contact':
      return text(config.tagName)
        ? t(text(config.tagAction) === 'remove' ? 'campaignSettings.section.after.untag' : 'campaignSettings.section.after.tag', { name: text(config.tagName) })
        : '';
    case 'update_attribute':
      return text(config.attributeField) ? t('campaignSettings.section.after.update', { field: text(config.attributeField) }) : '';
    case 'save_customer':
      return t('campaignSettings.section.after.saveCustomer');
    default:
      return '';
  }
};

/**
 * Bước phụ sau khi gửi (gắn thẻ, cập nhật thông tin, lưu khách hàng) nằm trong chuỗi thẳng.
 * @returns {{ key: 'after', status: 'ok'|'missing', items: Array<object>, canAdd: boolean, branched: boolean, nodeIds: string[] }}
 */
export function readAfterSend(nodes, edges, ctx) {
  const { lookups = {}, t } = ctx;
  const analysis = analyzeSettingsGraph(nodes, edges);
  const items = orderedNodes(nodes, edges)
    .filter((node) => SIDE_STEP_SUBTYPES.includes(subtypeOf(node)))
    .map((node) => {
      const lines = describeNodeSettings(node, { ...lookups, nodes }, t);
      const missing = lines.some((item) => item.tone === 'missing');
      return {
        nodeId: idOf(node.id),
        subtype: subtypeOf(node),
        title: text(node.data?.label),
        summary: sideStepSummary(node, t) || t('campaignSettings.section.after.incomplete'),
        status: missing ? 'missing' : 'ok',
        // Máy chủ bỏ qua bước này khi gửi thật: cảnh báo riêng, KHÔNG tính vào "Còn N mục" (mục Sau khi gửi không nằm trong đó).
        notRun: NOT_RUN_SIDE_STEP_SUBTYPES.includes(subtypeOf(node)),
        removable: canRemoveSideStep(nodes, edges, node.id),
      };
    });
  return {
    key: 'after',
    status: items.some((item) => item.status === 'missing') ? 'missing' : 'ok',
    items,
    canAdd: Boolean(findAppendAnchor(nodes, edges)),
    branched: analysis.branched,
    nodeIds: items.map((item) => item.nodeId),
  };
}
