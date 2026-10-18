/**
 * Biểu mẫu riêng của bước phụ "Gắn tag" ở mục Sau khi gửi (PLAN_TAG_KHACH_HANG PR-T2). Thuần: không React, không mạng.
 * Đọc / ghi đúng ba trường của khối `tag_contact`: `tagAction` (add | remove), `tagName`, `tagSourceNodeId`. Nguồn danh bạ do hệ thống
 * tự điền = khối nguồn của chuỗi — người dùng không thấy, không chọn (chữ "node" không xuất hiện ở biểu mẫu).
 */
import { analyzeSettingsGraph, findChainRoles } from '../settingsGraph';
import { configOf, idOf, setConfigFields, text } from './sectionUtils';

/** Khớp trần tên tag của backend (`CUSTOMER_TAG_NAME_MAX`). */
export const TAG_NAME_MAX = 60;

const normalizeTagName = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/**
 * @param {object} node khối tag_contact
 * @returns {{ action: 'add'|'remove', name: string }}
 */
export function readTagStep(node) {
  const config = configOf(node);
  return { action: text(config.tagAction) === 'remove' ? 'remove' : 'add', name: normalizeTagName(config.tagName) };
}

/** @returns {{ ok: boolean, problem: ''|'empty'|'tooLong' }} */
export function validateTagStep(value) {
  const name = normalizeTagName(value?.name);
  if (!name) return { ok: false, problem: 'empty' };
  if (name.length > TAG_NAME_MAX) return { ok: false, problem: 'tooLong' };
  return { ok: true, problem: '' };
}

export const isTagStepChanged = (current, initial) => (
  current.action !== initial.action || normalizeTagName(current.name) !== normalizeTagName(initial.name)
);

/**
 * Ghi hành động + tên tag vào đúng khối. Nguồn: giữ nguồn đang trỏ tới một khối còn tồn tại; không thì (mất nguồn sau khi xoá khối, hoặc
 * khối cũ chưa có) tự điền khối nguồn của chuỗi. Không có gì đổi → trả lại NGUYÊN `nodes` cũ.
 *
 * @returns {{ nodes: Array<object>, edges: Array<object> }|null} null khi không tìm thấy khối
 */
export function writeTagStep(nodes, edges, nodeId, value) {
  const id = idOf(nodeId);
  const node = nodes.find((item) => idOf(item.id) === id);
  if (!node) return null;
  const config = configOf(node);
  const exists = (ref) => text(ref) && nodes.some((item) => idOf(item.id) === idOf(ref));
  let sourceNodeId = config.tagSourceNodeId;
  if (!exists(sourceNodeId)) {
    const { sourceNode } = findChainRoles(nodes, analyzeSettingsGraph(nodes, edges).chain);
    sourceNodeId = sourceNode ? idOf(sourceNode.id) : undefined;
  }
  const nextNodes = setConfigFields(nodes, id, {
    tagAction: value.action === 'remove' ? 'remove' : 'add',
    tagName: normalizeTagName(value.name),
    ...(sourceNodeId !== undefined ? { tagSourceNodeId: sourceNodeId } : {}),
  });
  return { nodes: nextNodes, edges };
}
