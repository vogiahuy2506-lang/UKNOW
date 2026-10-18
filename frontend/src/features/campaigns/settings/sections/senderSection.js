/**
 * Mục "Gửi từ" của tab Thiết lập (PLAN_THIET_LAP_BIEU_MAU_RIENG PR-E1): đọc / ghi tài khoản gửi của chiến dịch.
 *
 * Trường thật (đã đối chiếu `campaignCompiler.service.js`, `createNodeConfigFormData`, `campaignZaloAccountResolve.util.js`):
 *  - email: `send_email.fromEmailId` (trống = tài khoản mặc định — chạy thật và Chạy thử đều tự dùng, không phải thiếu)
 *  - Zalo: `select_zalo_account.zaloAccountId` nếu chiến dịch CÓ khối chọn tài khoản (khi đó id riêng của khối gửi bị engine bỏ qua);
 *    không có khối đó (dựng tay) thì `zaloAccountId` của chính khối gửi. Bật nhiều tài khoản luân phiên → KHÔNG sửa ở đây.
 *  - Telegram: `send_telegram.telegramAccountId` · WhatsApp: `send_whatsapp.whatsappSessionKey` (chuỗi)
 * Không biểu diễn được (nhiều khối gửi, luân phiên, nhiều khối chọn tài khoản) → `editable: false`, KHÔNG ghi.
 */
import describeNodeSettings from '../describeNodeSettings';
import { SEND_SUBTYPES } from '../settingsGraph';
import { configOf, idOf, isFlagOn, list, setConfigFields, subtypeOf, text } from './sectionUtils';

const ZALO_SEND_SUBTYPES = ['send_zalo_personal', 'send_zalo_group', 'send_zalo_friend_request'];
const SIMPLE_FIELD = Object.freeze({
  send_email: 'fromEmailId',
  send_telegram: 'telegramAccountId',
  send_whatsapp: 'whatsappSessionKey',
});

/** Khối giữ tài khoản gửi + trường của nó, hoặc lý do không sửa được. */
export const locateSender = (nodes) => {
  const nodeList = list(nodes);
  const sends = nodeList.filter((node) => SEND_SUBTYPES.includes(subtypeOf(node)));
  if (sends.length === 0) return { state: 'empty' };
  if (sends.length > 1) return { state: 'unsupported', reason: 'multiSend', send: sends[0] };
  const send = sends[0];
  const subtype = subtypeOf(send);
  if (SIMPLE_FIELD[subtype]) return { state: 'ok', send, holder: send, field: SIMPLE_FIELD[subtype] };
  if (!ZALO_SEND_SUBTYPES.includes(subtype)) return { state: 'unsupported', reason: 'unknown', send };

  const selects = nodeList.filter((node) => subtypeOf(node) === 'select_zalo_account');
  if (selects.length > 1) return { state: 'unsupported', reason: 'multiAccount', send, selects };
  if (selects.length === 1) {
    const select = selects[0];
    const config = configOf(select);
    if (isFlagOn(config.zaloPoolMultiAccountEnabled)) {
      return { state: 'unsupported', reason: 'pool', send, holder: select, poolCount: list(config.zaloPoolAccountIds).filter((id) => text(id)).length };
    }
    return { state: 'ok', send, holder: select, field: 'zaloAccountId', select };
  }
  const own = configOf(send);
  const multiFlag = subtype === 'send_zalo_personal' ? own.zaloPersonalMultiAccountEnabled : (subtype === 'send_zalo_friend_request' ? own.zaloFriendMultiAccountEnabled : false);
  if (isFlagOn(multiFlag)) return { state: 'unsupported', reason: 'pool', send, holder: send, poolCount: 0 };
  return { state: 'ok', send, holder: send, field: 'zaloAccountId' };
};

/**
 * @param {Array<object>} nodes
 * @param {Array<object>} edges
 * @param {{ lookups?: object, t: Function }} ctx
 * @returns {{
 *   key: 'sender', status: 'ok'|'missing'|'idle', editable: boolean,
 *   value: { id: number|string|null, label: string }|null, summary: string, nodeIds: string[], reasonIfNotEditable: string|null,
 * }}
 */
export function readSender(nodes, edges, ctx) {
  const { lookups = {}, t } = ctx;
  const located = locateSender(nodes);
  if (located.state === 'empty') {
    return { key: 'sender', status: 'idle', editable: false, value: null, summary: '', nodeIds: [], reasonIfNotEditable: 'empty' };
  }
  const holders = [located.holder, located.send].filter(Boolean);
  const nodeIds = [...new Set(holders.map((node) => idOf(node.id)))];

  if (located.state === 'unsupported') {
    const poolSummary = located.reason === 'pool' ? t('campaignSettings.section.sender.pool', { n: located.poolCount || 0 }) : '';
    const lines = located.reason === 'pool' ? [] : holders.flatMap((node) => describeNodeSettings(node, { ...lookups, nodes }, t)).filter((item) => item.role === 'sender');
    const missing = located.reason === 'pool'
      ? !(located.poolCount > 0)
      : lines.some((item) => item.tone === 'missing');
    return {
      key: 'sender',
      status: missing ? 'missing' : 'ok',
      editable: false,
      value: null,
      summary: poolSummary || (lines[0]?.value ?? ''),
      nodeIds,
      reasonIfNotEditable: located.reason,
    };
  }

  const raw = text(configOf(located.holder)[located.field]);
  const lines = holders.flatMap((node) => describeNodeSettings(node, { ...lookups, nodes }, t)).filter((item) => item.role === 'sender');
  const missing = lines.some((item) => item.tone === 'missing') || (lines.length === 0 && !raw);
  const summary = lines[0]?.value ?? t('campaignSettings.section.sender.none');
  return {
    key: 'sender',
    status: missing ? 'missing' : 'ok',
    editable: true,
    value: raw ? { id: SIMPLE_FIELD.send_whatsapp === located.field ? raw : (Number.isFinite(Number(raw)) ? Number(raw) : raw), label: summary } : null,
    summary,
    nodeIds,
    reasonIfNotEditable: null,
  };
}

/** Nhóm / bạn bè đã chọn thuộc tài khoản cũ nên bị xoá khi đổi tài khoản (như `applySenderChange` của trình từng bước). */
const clearAccountBoundZaloData = (nodes) => {
  let next = nodes;
  list(nodes).forEach((node) => {
    const subtype = subtypeOf(node);
    const config = configOf(node);
    if (subtype === 'get_all_groups' && (list(config.zaloSelectedGroupIds).length > 0 || !config.zaloGroupSelectionSnapshotLocked)) {
      next = setConfigFields(next, node.id, { zaloSelectedGroupIds: [], zaloGroupSelectionSnapshotLocked: true });
    }
    if (subtype === 'get_all_friends' && text(config.zaloFriendSelectionMode) === 'fixed' && list(config.zaloSelectedFriendIds).length > 0) {
      next = setConfigFields(next, node.id, { zaloSelectedFriendIds: [] });
    }
    if (subtype === 'send_zalo_group') {
      const patch = {};
      if (Object.prototype.hasOwnProperty.call(config, 'zaloGroupIds') && list(config.zaloGroupIds).length > 0) patch.zaloGroupIds = [];
      if (Object.prototype.hasOwnProperty.call(config, 'zaloSelectedGroupIds') && list(config.zaloSelectedGroupIds).length > 0) patch.zaloSelectedGroupIds = [];
      if (Object.keys(patch).length > 0) next = setConfigFields(next, node.id, patch);
    }
  });
  return next;
};

/**
 * Ghi tài khoản gửi. Chỉ đổi trường tài khoản (+ xoá nhóm / bạn bè đã chọn khi ĐỔI sang tài khoản khác).
 * @param {{ id: number|string, label?: string }|null} sender `null` chỉ hợp lệ với email (= tài khoản mặc định)
 * @returns {{ nodes: Array<object>, edges: Array<object> }|null} null = mục này không sửa được ở đây
 */
export function writeSender(nodes, edges, sender) {
  const located = locateSender(nodes);
  if (located.state !== 'ok') return null;
  const field = located.field;
  const rawId = sender?.id;
  const blank = rawId === null || rawId === undefined || text(rawId) === '';
  if (blank && field !== 'fromEmailId') return null;

  let value = '';
  if (!blank) {
    if (field === 'whatsappSessionKey') value = text(rawId);
    else if (Number.isFinite(Number(rawId))) value = Number(rawId);
    else return null;
  }
  const previous = text(configOf(located.holder)[field]);
  const changed = previous !== text(value);
  let next = nodes;
  // Giữ nguyên kiểu đã lưu khi cùng giá trị ("5" vs 5) để write(read(x)) không đổi gì.
  if (changed) next = setConfigFields(next, located.holder.id, { [field]: value });

  const subtype = subtypeOf(located.send);
  if (changed && ZALO_SEND_SUBTYPES.includes(subtype)) {
    // Khối chọn tài khoản thắng; id riêng còn sót ở khối gửi (khung của bộ biên dịch ghi cả hai) giữ cho khớp để thẻ không hiện hai tài khoản.
    if (located.holder !== located.send && text(configOf(located.send).zaloAccountId) && text(configOf(located.send).zaloAccountId) !== text(value)) {
      next = setConfigFields(next, located.send.id, { zaloAccountId: value });
    }
    if (previous) next = clearAccountBoundZaloData(next);
  }
  if (changed && previous && (subtype === 'send_telegram' || subtype === 'send_whatsapp')) {
    const source = text(configOf(located.send).recipientSource);
    if (source === 'telegram_groups' || source === 'whatsapp_groups') next = setConfigFields(next, located.send.id, { recipientKeys: [] });
  }
  return { nodes: next, edges };
}
