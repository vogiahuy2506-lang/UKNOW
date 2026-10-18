/**
 * Dựng MỘT khối chiến dịch (hình dạng của khối ReactFlow) — dùng CHUNG cho thả khối ở Sơ đồ khối (`onDrop` của
 * `CampaignBuilderLayout`) và dựng khung khối ở tab Thiết lập (`buildSettingsSkeleton`, thao tác thêm/đổi bước). Một nơi dựng
 * để hai đường không lệch nhau về id, tên không trùng, kiểu ReactFlow (`start` cho khối khởi chạy, `task` cho còn lại).
 */
import { isTriggerNodeType } from './campaignBuilderFlow';

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Tên không trùng: "Gửi Email" → "Gửi Email 1" → "Gửi Email 2"… khi đã có khối cùng tên (hoặc cùng tên + số).
 *
 * @param {string} baseName
 * @param {Array<string>} existingNames
 * @returns {string}
 */
export const makeUniqueNodeName = (baseName, existingNames = []) => {
  const names = (Array.isArray(existingNames) ? existingNames : []).filter(Boolean);
  const pattern = new RegExp(`^${escapeRegExp(baseName)} \\d+$`);
  const collides = names.some((name) => name === baseName || pattern.test(name));
  if (!collides) return baseName;
  let counter = 1;
  let candidate = `${baseName} ${counter}`;
  while (names.includes(candidate)) {
    counter += 1;
    candidate = `${baseName} ${counter}`;
  }
  return candidate;
};

let idSequence = 0;
/** `${nodeType}-${Date.now()}` như cũ; thêm đuôi tăng dần khi cùng một mili-giây đã cấp id này (dựng nhiều khối một lượt). */
const nextNodeId = (nodeType) => {
  idSequence += 1;
  return idSequence === 1 ? `${nodeType}-${Date.now()}` : `${nodeType}-${Date.now()}-${idSequence}`;
};

/**
 * @param {string} nodeType subtype phía giao diện (`send_email`, `manual_trigger`, `read_sheet`…)
 * @param {{ x: number, y: number }} position
 * @param {object} [options]
 * @param {string} [options.locale='vi']
 * @param {Array<string>} [options.existingNames] tên khối đã có (để đặt tên không trùng)
 * @param {{ name?: string, nameVi?: string }} [options.nodeData] mục trong bảng khối (palette); thiếu thì tra `registry`
 * @param {Array<{ type: string, name?: string, nameVi?: string }>} [options.registry] bảng khối để tra tên khi không có `nodeData`
 * @param {string} [options.id] id định sẵn (khung khối cần biết id trước để nối cạnh / tham chiếu)
 * @param {object} [options.config] cấu hình ban đầu; bỏ trống = không có `config` (như khi thả khối: hộp cấu hình tự điền mặc định)
 * @returns {{ id: string, type: 'start'|'task', position: { x: number, y: number }, data: { label: string, nodeType: string, config?: object } }}
 */
export const createBuilderNode = (nodeType, position, options = {}) => {
  const { locale = 'vi', existingNames = [], nodeData = null, registry = [], id, config } = options;
  const found = nodeData || (Array.isArray(registry) ? registry.find((item) => item?.type === nodeType) : null) || {};
  const baseName = (locale === 'vi' && found.nameVi) ? found.nameVi : (found.name || found.nameVi || nodeType);
  const label = makeUniqueNodeName(baseName, existingNames);
  return {
    id: id || nextNodeId(nodeType),
    type: isTriggerNodeType(nodeType) ? 'start' : 'task',
    position: { x: position?.x ?? 0, y: position?.y ?? 0 },
    data: { label, nodeType, ...(config ? { config } : {}) },
  };
};

export default createBuilderNode;
