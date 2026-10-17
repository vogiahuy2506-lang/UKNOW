/**
 * Xem + sửa MỘT chiến dịch đã lưu bằng trình TỪNG BƯỚC (PLAN_HAI_TAB_TUNG_BUOC_SO_DO_2026-10-17, PR-A).
 *
 *  - `getSimpleEditState` → `GET /campaigns/:id/simple`: đọc ngược sơ đồ ra form, dựng lại sơ đồ từ form bằng CHÍNH pipeline tạo
 *    (không ghi DB, không tạo mẫu) rồi so khớp với sơ đồ đang lưu. `editable` chỉ đúng khi đọc ngược được, khứ hồi khớp, và không
 *    đang chạy.
 *  - `updateSimpleCampaign` → `PUT /campaigns/:id/simple`: chặn 409 khi không sửa được, chạy đúng chuỗi kiểm của tạo mới
 *    (`buildSimpleCreateDraft`) rồi ghi đè nodes + connections bằng `updateCampaign` (giữ id / trạng thái / lịch / lịch sử chạy).
 */
import campaignCrudService from './campaignCrud.service.js';
import campaignFlowService from './campaignFlow.service.js';
import campaignCrudRepository from '../../repositories/campaign/campaignCrud.repository.js';
import campaignScheduleRepository from '../../repositories/campaign/campaignSchedule.repository.js';
import {
  SimpleCampaignError,
  normalizeSimpleBody,
  compileSimpleGraph,
  buildSimpleCreateDraft,
} from './campaignSimple.service.js';
import {
  READ_ONLY_REASON_CODES as CODE,
  readSimpleFormFromGraph,
  isRoundTripEquivalent,
  carryOverLinkTracking,
} from './campaignSimpleReverse.service.js';
import { applyDirectRecipients } from '../../utils/directRecipients.util.js';
import { getWorkspaceContext } from '../../utils/workspaceContext.util.js';

const REASON_MESSAGES = Object.freeze({
  [CODE.RUNNING]: 'Chiến dịch đang chạy. Hãy đợi chạy xong hoặc dừng lượt chạy trước khi sửa.',
  [CODE.MULTIPLE_SCHEDULES]: 'Chiến dịch có nhiều lịch chạy nên phần "Khi nào gửi" chỉ xem được. Hãy sửa lịch ở trang Lịch chạy hoặc Sơ đồ khối.',
  [CODE.NOT_OWNER]: 'Chiến dịch này do người khác chia sẻ cho bạn nên bạn không sửa được.',
  [CODE.CHANNEL_NOT_IN_PLAN]: 'Gói hiện tại không có kênh này nên chưa sửa được ở đây.',
  [CODE.ADVANCED_SETTINGS]: 'Chiến dịch có cài đặt nâng cao mà trình từng bước không hiển thị. Lưu ở đây sẽ làm mất các cài đặt đó. Hãy sửa ở tab Sơ đồ khối.',
  [CODE.UNSUPPORTED_AUDIENCE]: 'Nguồn người nhận của chiến dịch này chưa được trình từng bước hỗ trợ.',
});

/** Mã lý do KHÔNG chặn sửa: PUT không đụng lịch nên nhiều lịch chỉ làm bước "Khi nào gửi" thành chỉ xem. */
const NON_BLOCKING_REASONS = new Set([CODE.MULTIPLE_SCHEDULES]);

const notFound = () => new SimpleCampaignError(404, 'CAMPAIGN_NOT_FOUND', 'Không tìm thấy chiến dịch');

/**
 * Tham chiếu khối trong config (`zaloGroupNodeId`, `zaloGroupAccountNodeId`, `recipientNodeId`…) của chiến dịch dựng tay có thể là
 * mã khối trong `flow_json` của trình dựng; lúc chạy campaignRun đổi sang mã DB bằng đúng `buildFlowNodeIdMap` +
 * `normalizeNodeReferenceConfig`. Đọc ngược + so khớp phải thấy cùng tham chiếu như lúc chạy (15 chiến dịch nhóm Zalo prod 17/10/2026).
 */
function resolveStoredNodeReferences(campaign) {
  const nodes = Array.isArray(campaign.nodes) ? campaign.nodes : [];
  const idMap = campaignFlowService.buildFlowNodeIdMap(
    campaign.flowJson,
    nodes.map((node) => ({ id: node.id, node_subtype: node.nodeSubtype, node_name: node.nodeName })),
  );
  const resolveNodeId = (id) => {
    const key = String(id ?? '').trim();
    return key ? (idMap.get(key) || key) : '';
  };
  return nodes.map((node) => ({ ...node, config: campaignFlowService.normalizeNodeReferenceConfig(node.config || {}, resolveNodeId) }));
}

/**
 * Dựng lại sơ đồ từ form đã đọc ngược, bằng chính pipeline tạo (normalize → compile → người nhận nhập sẵn), KHÔNG ghi DB.
 * Bỏ kiểm quyền sở hữu biểu mẫu (chiến dịch đã lưu rồi — chỉ cần hình dạng) và nội dung dạng mẫu nên không tạo mẫu nào.
 */
async function rebuildGraphFromForm({ channel, form, ownerId }) {
  const input = await normalizeSimpleBody(
    { channel, senderId: form.senderId, audience: form.audience, content: form.content, followUps: form.followUps },
    { ownerId, skipDbChecks: true },
  );
  const { nodes, connections } = await compileSimpleGraph(input, { ownerId });
  if (input.directRecipients) applyDirectRecipients({ nodes }, input.directRecipients);
  return { nodes, connections };
}

/**
 * Trạng thái sửa + khối đã lưu (tham chiếu đã đổi mã như lúc chạy) — `updateSimpleCampaign` cần khối đã lưu để giữ cài đặt ẩn.
 *
 * @param {{ authUser: object, campaignId: number|string }} input
 * @returns {Promise<{ storedNodes: object[], state: {
 *   editable: boolean,
 *   readOnlyReasons: Array<{ code: string, message: string }>,
 *   running: boolean,
 *   campaignName: string,
 *   channel: string,
 *   status: string,
 *   form: object|null,
 *   view?: object, // chỉ xem: có khi form null vì nhịp chờ (xem readSimpleFormFromGraph)
 *   schedules: Array<{ id: string, scheduleType: string, cronExpression: string, enabled: boolean }>,
 *   diffs?: string[],
 * } }>}
 * @throws {SimpleCampaignError} 404 khi không thấy / không có quyền xem
 */
async function loadSimpleEditState({ authUser, campaignId }) {
  const context = getWorkspaceContext(authUser);
  const campaign = await campaignCrudService.getCampaignById({ authUser, campaignId });
  if (!campaign) throw notFound();

  const [running, scheduleRows] = await Promise.all([
    campaignCrudRepository.hasRunningRun(campaign.id),
    campaignScheduleRepository.findByCampaignId(campaign.id),
  ]);
  const schedules = scheduleRows.map((row) => ({
    id: row.id,
    scheduleType: row.schedule_type,
    cronExpression: row.cron_expression,
    enabled: row.enabled === true,
  }));

  const storedNodes = resolveStoredNodeReferences(campaign);
  const read = readSimpleFormFromGraph(storedNodes, campaign.connections);
  const readOnlyReasons = [...read.reasons];
  let diffs = [];

  const isOwner = context.isSuperAdmin || Number(campaign.workspaceOwnerId) === Number(context.workspaceOwnerId);
  if (!isOwner) readOnlyReasons.push({ code: CODE.NOT_OWNER, message: REASON_MESSAGES[CODE.NOT_OWNER] });

  if (read.form) {
    try {
      const rebuilt = await rebuildGraphFromForm({
        channel: read.channel,
        form: read.form,
        ownerId: Number(campaign.workspaceOwnerId) || context.workspaceOwnerId,
      });
      carryOverLinkTracking(storedNodes, rebuilt.nodes);
      const comparison = isRoundTripEquivalent(
        { nodes: storedNodes, connections: campaign.connections },
        rebuilt,
      );
      if (!comparison.ok) {
        diffs = comparison.diffs;
        readOnlyReasons.push({ code: CODE.ADVANCED_SETTINGS, message: REASON_MESSAGES[CODE.ADVANCED_SETTINGS] });
      }
    } catch (error) {
      if (error?.code === 'CHANNEL_NOT_IN_PLAN') {
        readOnlyReasons.push({ code: CODE.CHANNEL_NOT_IN_PLAN, message: REASON_MESSAGES[CODE.CHANNEL_NOT_IN_PLAN] });
      } else if (Number.isInteger(error?.statusCode) && error.statusCode < 500) {
        // Form đọc ngược ra bị chính bộ kiểm của tạo mới từ chối (vd danh sách nhập tay sai định dạng) → không dựng lại được.
        diffs = [`rebuild: ${error.code || ''} ${error.message}`.trim()];
        readOnlyReasons.push({ code: CODE.UNSUPPORTED_AUDIENCE, message: REASON_MESSAGES[CODE.UNSUPPORTED_AUDIENCE] });
      } else {
        throw error;
      }
    }
  }

  if (running) readOnlyReasons.push({ code: CODE.RUNNING, message: REASON_MESSAGES[CODE.RUNNING] });
  if (schedules.length >= 2) {
    readOnlyReasons.push({ code: CODE.MULTIPLE_SCHEDULES, message: REASON_MESSAGES[CODE.MULTIPLE_SCHEDULES] });
  }

  const editable = readOnlyReasons.every((item) => NON_BLOCKING_REASONS.has(item.code));
  const state = {
    editable,
    readOnlyReasons,
    running,
    campaignName: campaign.campaignName,
    channel: read.channel || campaign.campaignType,
    status: campaign.status,
    form: read.form,
    ...(!read.form && read.view ? { view: read.view } : {}),
    schedules,
    ...(diffs.length > 0 ? { diffs } : {}),
  };
  return { state, storedNodes };
}

/** Trạng thái cho `GET /campaigns/:id/simple` — xem `loadSimpleEditState`. */
export async function getSimpleEditState(input) {
  return (await loadSimpleEditState(input)).state;
}

/**
 * `PUT /campaigns/:id/simple`. Mẫu tin tự tạo từ chữ tự soạn đi vào `createdTemplates` — NGƯỜI GỌI phải dọn khi hàm này ném lỗi.
 *
 * @param {{ authUser: object, campaignId: number|string, body: object, createdTemplates: { emailTemplateIds: number[], zaloTemplateIds: number[] }, now?: Date }} input
 * @returns {Promise<{ campaignId: string|number, campaignName: string, channel: string, nodesBefore: number|null, nodesAfter: number, recipientCountHint: number|null }>}
 */
export async function updateSimpleCampaign({ authUser, campaignId, body, createdTemplates, now = new Date() }) {
  const { state, storedNodes } = await loadSimpleEditState({ authUser, campaignId });

  if (state.running) {
    throw new SimpleCampaignError(409, 'CAMPAIGN_RUNNING', REASON_MESSAGES[CODE.RUNNING], { readOnlyReasons: state.readOnlyReasons });
  }
  if (!state.editable) {
    const blocking = state.readOnlyReasons.filter((item) => !NON_BLOCKING_REASONS.has(item.code));
    throw new SimpleCampaignError(
      409,
      'CAMPAIGN_NOT_EDITABLE',
      blocking[0]?.message || 'Chiến dịch này không sửa được bằng trình từng bước.',
      { readOnlyReasons: state.readOnlyReasons },
    );
  }

  const source = body && typeof body === 'object' ? body : {};
  if (String(source.channel ?? '').trim() !== state.channel) {
    throw new SimpleCampaignError(400, 'CHANNEL_CHANGE_NOT_ALLOWED', 'Không đổi được kênh gửi của chiến dịch đã tạo. Hãy tạo chiến dịch mới cho kênh khác.');
  }
  const campaignName = String(source.campaignName ?? '').trim() || state.campaignName;

  const draft = await buildSimpleCreateDraft({
    body: { ...source, campaignName },
    authUser,
    createdTemplates,
    now,
  });
  // Cùng quy tắc với lúc so khớp ở loadSimpleEditState — không lặng lẽ bật lại theo dõi link người dùng đã tắt.
  carryOverLinkTracking(storedNodes, draft.nodes);

  const result = await campaignCrudService.updateCampaign({
    authUser,
    campaignId,
    isContentUpdate: true,
    campaignName: draft.campaignName,
    nodes: draft.nodes,
    connections: draft.connections,
  });

  return {
    campaignId: result.id,
    campaignName: result.campaignName,
    channel: draft.channel,
    nodesBefore: result.nodesTruoc ?? null,
    nodesAfter: draft.nodes.length,
    recipientCountHint: draft.recipientCountHint,
  };
}

export default { getSimpleEditState, updateSimpleCampaign };
