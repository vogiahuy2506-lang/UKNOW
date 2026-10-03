/**
 * Ước tính thời gian gửi của MỘT chiến dịch (PLAN_UOC_TINH_THOI_GIAN_CHIEN_DICH_2026-10-04, mục 3.2).
 *
 * Service này CHỈ gom dữ kiện (đọc node, nick, hạn mức, đếm người nhận) rồi giao cho hàm mô phỏng thuần
 * `utils/campaignSendEstimate.util.js`. Mọi lỗi dữ kiện (không đếm được người nhận, nick không tải được…) trở
 * thành CẢNH BÁO, không ném — ước tính không bao giờ được làm vỡ hộp xác nhận "Chạy" / "Đặt lịch".
 *
 * Phụ thuộc truyền qua `deps` (mặc định nạp lười từ module thật) để spec mock đúng RANH GIỚI và không kéo cả
 * engine campaignRun (≈9.000 dòng) vào bộ test.
 */
import { estimateCampaignSend } from '../../utils/campaignSendEstimate.util.js';
import { getNodeOwnZaloAccountSpec } from '../../utils/campaignZaloAccountResolve.util.js';
import { normalizeVietnamesePhone } from '../../utils/vietnamesePhone.util.js';
import { computeScheduleNextRunAt } from '../../utils/campaignScheduleCron.util.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Node đọc dữ liệu — cùng danh sách `campaignRun.service.js:3510`. */
const DATA_NODE_SUBTYPES = new Set([
  'read_sheet', 'google_sheet', 'read_interested_customers', 'interested_customers',
  'read_courses_db', 'read_products_db', 'read_landing_leads', 'read_form_submissions',
]);
const ZALO_SEND_SUBTYPES = new Set(['send_zalo_personal', 'send_zalo_friend_request', 'send_zalo_group']);
const DATA_NODE_TIMEOUT_MS = 20_000;
/** Cửa sổ "lịch bật trong N ngày tới" để báo tài khoản đang được chiến dịch khác dùng. */
const SHARED_ACCOUNT_HORIZON_MS = 7 * DAY_MS;

const unitToMs = (unit) => {
  if (unit === 'hours') return HOUR_MS;
  if (unit === 'days') return DAY_MS;
  return 60 * 1000;
};

/** Độ trễ của một bước theo đúng `computeStepDueAt` (campaignRun.service.js:2087): `delayValue` x đơn vị (mặc định phút). */
const stepDelayMs = (step) => Math.max(0, Number.parseInt(step?.delayValue || 0, 10) || 0) * unitToMs(step?.delayUnit || 'minutes');

const toStep = (step) => ({
  delayMs: stepDelayMs(step),
  delayFrom: String(step?.delayFrom || 'start').trim() === 'prev' ? 'prev' : 'start',
});

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ESTIMATE_TIMEOUT' })), ms);
  Promise.resolve(promise).then(
    (value) => { clearTimeout(timer); resolve(value); },
    (error) => { clearTimeout(timer); reject(error); },
  );
});

const positiveInt = (raw, fallback) => {
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/** Nạp lười các phụ thuộc thật. Spec KHÔNG gọi hàm này (truyền `deps` đầy đủ). */
export async function loadDefaultDeps() {
  const [
    crudRepoMod, flowMod, nodeDataMod, runMod, zaloSenderMod, zaloRepoMod, emailRepoMod, sendQuotaRepo,
    quotaResMod, userSendLimit, registryMod, speedMod, estimateRepoMod,
  ] = await Promise.all([
    import('../../repositories/campaign/campaignCrud.repository.js'),
    import('./campaignFlow.service.js'),
    import('./campaignNodeData.service.js'),
    import('./campaignRun.service.js'),
    import('./campaignZaloSender.service.js'),
    import('../../repositories/campaign/campaignZaloSender.repository.js'),
    import('../../repositories/campaign/campaignEmailSender.repository.js'),
    import('../../repositories/sendQuota.repository.js'),
    import('../quota/sendQuotaReservation.service.js'),
    import('../../utils/userSendLimit.util.js'),
    import('./campaignChannelRegistry.service.js'),
    import('../../utils/channelSendSpeed.util.js'),
    import('../../repositories/campaign/campaignEstimate.repository.js'),
  ]);
  const db = (await import('../../config/database.js')).default;
  const limiter = runMod.default.zaloRateLimiter;
  return {
    crud: crudRepoMod.default,
    flow: flowMod.default,
    nodeData: nodeDataMod.default,
    zaloLimiter: limiter,
    emailDelay: { minMs: runMod.EMAIL_API_DELAY_MIN_MS, maxMs: runMod.EMAIL_API_DELAY_MAX_MS },
    zaloSender: zaloSenderMod.default,
    zaloRepo: zaloRepoMod.default,
    emailRepo: emailRepoMod.default,
    countZaloSentToday: (accountId, now) => {
      const { vnDayStart, vnDayEnd } = quotaResMod.getVnDayBoundaries(now);
      return sendQuotaRepo.countZaloSentTodayByAccount(db, accountId, vnDayStart, vnDayEnd);
    },
    countEmailSentToday: (accountId, now) => {
      const { vnDayStart, vnDayEnd } = quotaResMod.getVnDayBoundaries(now);
      return sendQuotaRepo.countEmailSentTodayByAccount(db, accountId, vnDayStart, vnDayEnd);
    },
    checkSendQuota: userSendLimit.checkSendQuota,
    getAdapterDescriptor: registryMod.getAdapterDescriptorBySubtype,
    applyAccountDelayOverride: speedMod.applyAccountDelayOverride,
    estimateRepo: estimateRepoMod.default,
    env: process.env,
    now: () => new Date(),
  };
}

/** Chuẩn hoá node DB (snake_case) hoặc script AI (camelCase) về một dạng — một chỗ duy nhất. */
export function normalizeEstimateNodes(rawNodes, rawConnections) {
  const nodes = (Array.isArray(rawNodes) ? rawNodes : []).map((node, index) => ({
    id: String(node?.id ?? node?.tempId ?? `node_${index}`),
    node_type: String(node?.node_type ?? node?.nodeType ?? ''),
    node_subtype: String(node?.node_subtype ?? node?.nodeSubtype ?? ''),
    node_name: node?.node_name ?? node?.nodeName ?? null,
    execution_order: Number(node?.execution_order ?? node?.executionOrder ?? index) || 0,
    config: node?.config && typeof node.config === 'object' ? node.config : {},
  }));
  const connections = (Array.isArray(rawConnections) ? rawConnections : []).map((conn) => ({
    source_node_id: conn?.source_node_id ?? conn?.sourceNodeId ?? conn?.sourceId ?? conn?.source,
    target_node_id: conn?.target_node_id ?? conn?.targetNodeId ?? conn?.targetId ?? conn?.target,
  }));
  return { nodes, connections };
}

/** Giá trị người nhận của một dòng dữ liệu: field đầu tiên có dữ liệu thắng (cùng luật engine). */
function extractRowValues(item, fields, parseList) {
  for (const field of fields) {
    const raw = item?.[field];
    const values = Array.isArray(raw) ? raw.flatMap((inner) => parseList(inner)) : parseList(raw);
    if (values.length > 0) return values;
  }
  return [];
}

const normalizePhone = (value) => {
  const trimmed = String(value || '').trim();
  return trimmed ? (normalizeVietnamesePhone(trimmed) || trimmed) : trimmed;
};

/**
 * Dựng đầu vào mô phỏng + cảnh báo dữ kiện từ danh sách node.
 *
 * @returns {Promise<{ groups: Array<object>, warnings: Array<object>, accounts: Array<object>, accountRefs: Array<object> }>}
 */
async function buildSimulationInput({ nodes, connections, flowJson, ownerUserId, deps }) {
  const now = deps.now();
  const warnings = [];
  const orderMap = deps.flow.buildExecutionOrderMap(nodes, connections, {
    nodeIdKey: 'id', sourceKey: 'source_node_id', targetKey: 'target_node_id',
  });
  const orderedNodes = [...nodes]
    .filter((node) => orderMap.has(String(node.id)))
    .sort((a, b) => {
      const orderA = orderMap.get(String(a.id)) || Number.MAX_SAFE_INTEGER;
      const orderB = orderMap.get(String(b.id)) || Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return Number(a.execution_order || 0) - Number(b.execution_order || 0);
    });
  const flowNodeIdMap = deps.flow.buildFlowNodeIdMap(flowJson, orderedNodes);
  const resolveNodeId = (id) => {
    const key = String(id ?? '').trim();
    return key ? (flowNodeIdMap.get(key) || key) : '';
  };

  const parseList = (text) => deps.zaloSender.parseListText(text);
  const zaloAccountCache = new Map();
  const emailAccountCache = new Map();
  const dataCache = new Map();

  const loadZaloAccount = async (rawId) => {
    const id = Number.parseInt(rawId, 10);
    if (!Number.isFinite(id) || id <= 0) return null;
    if (zaloAccountCache.has(id)) return zaloAccountCache.get(id);
    let entry = null;
    try {
      const row = await deps.zaloRepo.findCampaignZaloAccount(id, ownerUserId, false);
      if (row) {
        const hint = deps.zaloSender.mapCampaignZaloAccount(row);
        const sentToday = await deps.countZaloSentToday(id, now);
        entry = { id, hint, sentToday: Number(sentToday) || 0 };
      }
    } catch (error) {
      console.warn(`[CampaignEstimate] Không tải được tài khoản Zalo ${id}:`, error?.message || error);
    }
    zaloAccountCache.set(id, entry);
    return entry;
  };

  const loadEmailAccount = async (fromEmailId) => {
    const cacheKey = String(fromEmailId || 'default');
    if (emailAccountCache.has(cacheKey)) return emailAccountCache.get(cacheKey);
    let entry = null;
    try {
      const row = fromEmailId
        ? await deps.emailRepo.findEmailSettingsById(fromEmailId, ownerUserId)
        : await deps.emailRepo.findDefaultEmailSettings(ownerUserId);
      if (row) {
        const sentToday = await deps.countEmailSentToday(row.id, now);
        entry = { row, sentToday: Number(sentToday) || 0 };
      }
    } catch (error) {
      console.warn('[CampaignEstimate] Không tải được cài đặt email:', error?.message || error);
    }
    emailAccountCache.set(cacheKey, entry);
    return entry;
  };

  /** Dữ liệu của node đọc (một lần, có timeout). Trả mảng item hoặc null khi không đọc được. */
  const readDataNode = async (dataNode) => {
    const key = String(dataNode.id);
    if (dataCache.has(key)) return dataCache.get(key);
    let items = null;
    let reason = null;
    try {
      const pack = await withTimeout(deps.nodeData.getCustomersFromDataNode(dataNode, ownerUserId, nodes), DATA_NODE_TIMEOUT_MS);
      items = Array.isArray(pack?.items) ? pack.items : [];
    } catch (error) {
      reason = error?.code === 'ESTIMATE_TIMEOUT' ? 'timeout' : 'error';
      console.warn(`[CampaignEstimate] Không đọc được node dữ liệu ${key}:`, error?.message || error);
    }
    const result = { items, reason };
    dataCache.set(key, result);
    return result;
  };

  const nodeById = new Map(orderedNodes.map((node) => [String(node.id), node]));

  /**
   * Đếm người nhận theo nguồn của node gửi. `null` = không đếm được (đã/ sẽ có cảnh báo).
   * `fields`: các field thử lần lượt; `normalize`: chuẩn hoá giá trị trước khi khử trùng.
   */
  const countRecipients = async ({ node, mode, manualText, sourceNodeId, fields, normalize = (v) => v, previousDataNode = null, parse = parseList }) => {
    if (mode === 'manual') {
      return new Set(parse(manualText).map(normalize).filter(Boolean)).size;
    }
    const sourceId = String(sourceNodeId || '').trim();
    const sourceNode = sourceId ? nodeById.get(sourceId) : previousDataNode;
    if (!sourceNode || !DATA_NODE_SUBTYPES.has(String(sourceNode.node_subtype).toLowerCase())) {
      warnings.push({ code: 'recipient_count_unknown', params: { nodeId: String(node.id), reason: 'source_not_countable' } });
      return null;
    }
    const { items, reason } = await readDataNode(sourceNode);
    if (!items) {
      warnings.push({ code: 'recipient_count_unknown', params: { nodeId: String(node.id), reason } });
      return null;
    }
    const seen = new Set();
    items.forEach((item) => {
      extractRowValues(item, fields, parse).map(normalize).filter(Boolean).forEach((value) => seen.add(value));
    });
    return seen.size;
  };

  const groups = [];
  const accountRefs = new Map();
  const phoneLookupNodes = [];
  let stickyZaloId = null;
  let lastSelectSpec = null;
  let previousDataNode = null;

  const zaloAccountEntries = async (ids, channel) => {
    const accounts = [];
    for (const rawId of ids) {
      // eslint-disable-next-line no-await-in-loop
      const loaded = await loadZaloAccount(rawId);
      const id = Number.parseInt(rawId, 10);
      const key = `zalo:${Number.isFinite(id) ? id : 'unknown'}`;
      const policy = deps.zaloLimiter.resolveOutboundPolicy(channel, loaded?.hint || null);
      const perHourLimit = policy.windowMs === HOUR_MS
        ? policy.limitPerWindow
        : Math.max(1, Math.round((policy.limitPerWindow * HOUR_MS) / Math.max(1, policy.windowMs)));
      accounts.push({
        key,
        dailyKey: key,
        minDelayMs: policy.minDelayMs,
        maxDelayMs: policy.maxDelayMs,
        perHourLimit,
        dailyLimit: loaded?.hint?.userDailySendLimit ?? null,
        sentToday: loaded?.sentToday || 0,
        quietHours: {
          start: deps.zaloLimiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE,
          end: deps.zaloLimiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE,
        },
      });
      accountRefs.set(key, { key, channel: 'zalo', label: loaded?.hint?.displayName || `Zalo #${key.slice(5)}`, dailyLimit: loaded?.hint?.userDailySendLimit ?? null, sentToday: loaded?.sentToday || 0 });
      if (!loaded) warnings.push({ code: 'account_unavailable', params: { accountKey: key, channel: 'zalo' } });
    }
    return accounts;
  };

  for (const node of orderedNodes) {
    const subtype = String(node.node_subtype || '').trim().toLowerCase();
    const config = deps.flow.normalizeNodeReferenceConfig(node.config || {}, resolveNodeId);
    const labelOf = (fallback) => String(node.node_name || fallback);

    if (DATA_NODE_SUBTYPES.has(subtype)) {
      previousDataNode = node;
      continue;
    }

    if (subtype === 'select_zalo_account') {
      const spec = getNodeOwnZaloAccountSpec({ node_subtype: subtype, config });
      lastSelectSpec = spec;
      // Engine: node chọn tài khoản luôn gán `selectedZaloAccount` = tài khoản đầu của pool / tài khoản đơn
      // (campaignRun.service.js:3655) — mọi node Zalo SAU nó dùng lại, bỏ qua id riêng của chúng.
      stickyZaloId = spec.ids[0] ?? null;
      continue;
    }

    if (subtype === 'send_email') {
      const steps = (Array.isArray(config.emailSteps) ? config.emailSteps : [])
        .filter((step) => Number.isFinite(Number.parseInt(step?.templateId, 10)));
      const mode = String(config.recipientSource || '').trim();
      let recipients;
      if (mode === 'manual') {
        recipients = new Set(deps.flow.parseEmailList(config.recipientEmails).map((e) => e.toLowerCase())).size;
      } else {
        // eslint-disable-next-line no-await-in-loop
        recipients = await countRecipients({
          node,
          mode: 'node',
          sourceNodeId: mode === 'node' ? config.recipientNodeId : '',
          fields: [String(config.recipientField || '').trim() || 'email'],
          normalize: (v) => String(v || '').trim().toLowerCase(),
          previousDataNode,
          parse: (text) => deps.flow.parseEmailList(text),
        });
      }
      // eslint-disable-next-line no-await-in-loop
      const loaded = await loadEmailAccount(config.fromEmailId || null);
      const perMinute = positiveInt(
        deps.env[`SMTP_RATE_LIMIT_PER_MINUTE_ACCOUNT_${loaded?.row?.id ?? ''}`],
        positiveInt(deps.env.SMTP_RATE_LIMIT_PER_MINUTE_ACCOUNT, 60),
      );
      const key = `email:${loaded?.row?.id ?? 'unknown'}`;
      accountRefs.set(key, { key, channel: 'email', label: loaded?.row?.email || 'Email', dailyLimit: loaded?.row?.user_daily_send_limit ?? null, sentToday: loaded?.sentToday || 0 });
      if (!loaded) warnings.push({ code: 'account_unavailable', params: { accountKey: key, channel: 'email' } });
      groups.push({
        nodeId: String(node.id), label: labelOf('Email'), channel: 'email', order: 'step_major',
        recipients: recipients ?? 0,
        steps: steps.length > 0 ? steps.map(toStep) : [{ delayMs: 0, delayFrom: 'prev' }],
        sendMode: String(config.sendMode || 'all').trim(),
        accounts: [{
          key, dailyKey: key,
          minDelayMs: deps.emailDelay.minMs, maxDelayMs: deps.emailDelay.maxMs,
          perMinuteLimit: perMinute,
          dailyLimit: loaded?.row?.user_daily_send_limit ?? null,
          sentToday: loaded?.sentToday || 0,
          quietHours: null,
        }],
      });
      continue;
    }

    if (ZALO_SEND_SUBTYPES.has(subtype)) {
      const own = getNodeOwnZaloAccountSpec({ node_subtype: subtype, config });
      // Pool từ node chọn tài khoản đứng trước thắng; kế đến danh sách riêng; còn lại tài khoản đơn —
      // và tài khoản đơn là tài khoản ĐÃ GÁN (sticky) của node Zalo trước, không phải id riêng (engine :4971,:6947,:7851).
      const poolFromSelect = subtype !== 'send_zalo_group' && lastSelectSpec?.multi === true;
      const multiIds = poolFromSelect ? lastSelectSpec.ids : (subtype !== 'send_zalo_group' && own.multi ? own.ids : null);
      const accountIds = multiIds || [stickyZaloId ?? own.ids[0]];
      if (stickyZaloId == null) stickyZaloId = accountIds[0];
      if (accountIds[0] == null || accountIds[0] === '' || accountIds[0] === undefined) {
        warnings.push({ code: 'sender_missing', params: { nodeId: String(node.id) } });
      }
      let channel;
      let mode;
      let manualText;
      let sourceNodeId;
      let fields;
      let normalize = (v) => v;
      let steps = [{ delayMs: 0, delayFrom: 'prev' }];
      let sendMode = 'all';
      let recipientType = 'phone';
      if (subtype === 'send_zalo_personal') {
        channel = 'zalo_personal';
        recipientType = String(config.zaloRecipientType || 'phone').trim().toLowerCase() === 'uid' ? 'uid' : 'phone';
        const source = config.zaloRecipientSource || config.recipientSource || 'manual';
        mode = source === 'node' && String(config.zaloRecipientNodeId || '').trim() ? 'node' : 'manual';
        manualText = config.zaloRecipientPhones || config.recipientPhones || '';
        sourceNodeId = config.zaloRecipientNodeId || config.recipientNodeId || '';
        const sourceField = config.zaloRecipientField || config.recipientField || (recipientType === 'uid' ? 'uid' : 'phone');
        fields = recipientType === 'uid'
          ? [sourceField, 'zalo_id', 'zaloId', 'uid']
          : [sourceField, 'phone', 'zalo_phone', 'zaloPhone'];
        if (recipientType === 'phone') normalize = normalizePhone;
        const tplSteps = (Array.isArray(config.zaloPersonalTemplateSteps) ? config.zaloPersonalTemplateSteps : [])
          .filter((step) => Number.isFinite(Number.parseInt(step?.templateId, 10)));
        if (tplSteps.length > 0) {
          steps = tplSteps.map(toStep);
          sendMode = String(config.zaloPersonalSendMode || 'all').trim();
        }
        if (recipientType === 'phone') phoneLookupNodes.push(String(node.id));
      } else if (subtype === 'send_zalo_friend_request') {
        channel = 'zalo_friend_request';
        const source = config.zaloFriendSource || 'manual';
        mode = source === 'node' ? 'node' : 'manual';
        manualText = config.zaloFriendPhones || '';
        sourceNodeId = config.zaloFriendNodeId || '';
        fields = [config.zaloFriendField || 'phone'];
        normalize = normalizePhone;
        phoneLookupNodes.push(String(node.id));
      } else {
        channel = 'zalo_group';
        const source = config.zaloGroupSource || 'manual';
        mode = source === 'manual' ? 'manual' : 'node';
        manualText = config.zaloGroupIds || '';
        sourceNodeId = config.zaloGroupNodeId || '';
        fields = [config.zaloGroupField || 'groupId'];
        const tplSteps = (Array.isArray(config.zaloGroupTemplateSteps) ? config.zaloGroupTemplateSteps : [])
          .filter((step) => Number.isFinite(Number.parseInt(step?.templateId, 10)));
        if (tplSteps.length > 0) {
          steps = tplSteps.map(toStep);
          sendMode = String(config.zaloGroupSendMode || 'all').trim();
        }
      }
      // eslint-disable-next-line no-await-in-loop
      const recipients = await countRecipients({ node, mode, manualText, sourceNodeId, fields, normalize, previousDataNode: null });
      // eslint-disable-next-line no-await-in-loop
      const accounts = await zaloAccountEntries(accountIds.filter((id) => id !== '' && id != null), channel);
      groups.push({
        nodeId: String(node.id),
        label: labelOf(channel),
        channel,
        order: 'step_major',
        recipients: recipients ?? 0,
        steps,
        sendMode,
        accounts: accounts.length > 0 ? accounts : [{
          key: 'zalo:unknown', dailyKey: 'zalo:unknown',
          ...(() => { const p = deps.zaloLimiter.resolveOutboundPolicy(channel, null); return { minDelayMs: p.minDelayMs, maxDelayMs: p.maxDelayMs, perHourLimit: p.limitPerWindow }; })(),
          quietHours: { start: deps.zaloLimiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE, end: deps.zaloLimiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE },
        }],
      });
      continue;
    }

    const descriptor = deps.getAdapterDescriptor(subtype);
    if (descriptor) {
      const steps = Array.isArray(config.steps) && config.steps.length > 0 ? config.steps : [{}];
      const source = config.recipientSource;
      let recipients;
      if (['manual', 'telegram_groups', 'whatsapp_groups'].includes(source)) {
        const raw = config.recipientKeys;
        const list = Array.isArray(raw) ? raw : String(raw ?? '').split(/[\n,]+/);
        recipients = list.filter((item) => (item && typeof item === 'object'
          ? String(item.recipientKey || '').trim() !== ''
          : String(item ?? '').trim() !== '')).length;
      } else if (source === 'node' && String(config.recipientNodeId || '').trim()) {
        // eslint-disable-next-line no-await-in-loop
        recipients = await countRecipients({
          node, mode: 'node', sourceNodeId: config.recipientNodeId, fields: ['phone', 'recipientKey', 'email'], previousDataNode: null,
        });
      } else {
        warnings.push({ code: 'recipient_count_unknown', params: { nodeId: String(node.id), reason: 'source_not_countable' } });
        recipients = null;
      }
      let account = null;
      let sendSettings = null;
      try {
        // eslint-disable-next-line no-await-in-loop
        account = await descriptor.adapter.resolveAccount({ userId: ownerUserId, workspaceOwnerId: ownerUserId, node, config });
        sendSettings = typeof descriptor.adapter.getAccountSendSettings === 'function'
          // eslint-disable-next-line no-await-in-loop
          ? await descriptor.adapter.getAccountSendSettings({ account, workspaceOwnerId: ownerUserId })
          : null;
      } catch (error) {
        warnings.push({ code: 'account_unavailable', params: { accountKey: `${descriptor.key}:unknown`, channel: descriptor.key } });
      }
      const policy = deps.applyAccountDelayOverride(descriptor.key, descriptor.policy || {}, sendSettings);
      const accountKey = `${descriptor.key}:${account?.accountKey ?? 'unknown'}`;
      // Số đã gửi hôm nay của tài khoản Telegram/WhatsApp chưa đọc (đếm theo campaign_channel_messages) → 0:
      // trần ngày tự đặt có thể bị ước tính hơi lạc quan ở ngày đầu.
      const sentToday = 0;
      accountRefs.set(accountKey, {
        key: accountKey, channel: descriptor.key, label: account?.display || accountKey,
        dailyLimit: sendSettings?.userDailySendLimit ?? null, sentToday,
      });
      groups.push({
        nodeId: String(node.id),
        label: labelOf(descriptor.key),
        channel: descriptor.key,
        order: 'recipient_major',
        recipients: recipients ?? 0,
        steps: steps.map((step) => ({ delayMs: stepDelayMs(step), delayFrom: 'prev' })),
        sendMode: 'schedule',
        accounts: [{
          key: accountKey, dailyKey: accountKey,
          minDelayMs: policy.minDelayMs ?? 0, maxDelayMs: policy.maxDelayMs ?? policy.minDelayMs ?? 0,
          perHourLimit: policy.perHourLimit ?? 0,
          dailyLimit: sendSettings?.userDailySendLimit ?? null,
          sentToday,
          quietHours: policy.quietHours
            ? { start: policy.quietHours.startHour, end: policy.quietHours.endHour }
            : null,
        }],
      });
    }
  }

  return { groups, warnings, accountRefs: [...accountRefs.values()], phoneLookupNodes };
}

const QUOTA_CHANNEL_OF = (channel) => (channel === 'email' ? 'email'
  : String(channel).startsWith('zalo_') ? 'zalo'
    : channel);

/** Hạn mức GÓI còn lại < số thao tác → cảnh báo (cùng cổng `checkSendQuota` mà đường gửi dùng). */
async function planQuotaWarnings({ simulation, ownerUserId, deps }) {
  const totals = new Map();
  simulation.perNode.forEach((node) => {
    const channel = QUOTA_CHANNEL_OF(node.channel);
    totals.set(channel, (totals.get(channel) || 0) + (node.actions || 0));
  });
  const warnings = [];
  for (const [channel, required] of totals) {
    if (required <= 0) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      const quota = await deps.checkSendQuota({ userId: ownerUserId, channel, requiredCount: required });
      if (quota && quota.allowed === false) {
        warnings.push({
          code: 'plan_quota_insufficient',
          params: {
            channel, required, limit: quota.limit ?? null, currentCount: quota.currentCount ?? null,
            limitType: quota.limitType ?? null, resetAt: quota.resetAt ? new Date(quota.resetAt).toISOString() : null,
          },
        });
      }
    } catch (error) {
      console.warn('[CampaignEstimate] Không kiểm được hạn mức gói:', error?.message || error);
    }
  }
  return warnings;
}

/** Tài khoản đang được chiến dịch KHÁC dùng (run đang chạy hoặc lịch bật trong 7 ngày) — chỉ cảnh báo, KHÔNG cộng vào số. */
async function sharedAccountWarnings({ excludeCampaignId, ownerUserId, accountRefs, deps }) {
  if (!deps.estimateRepo || accountRefs.length === 0) return [];
  try {
    const now = deps.now();
    const others = await deps.estimateRepo.findOtherCampaignsInUse({ ownerUserId, excludeCampaignId });
    if (!others.campaigns.length) return [];
    const nodesByCampaign = new Map();
    others.nodes.forEach((row) => {
      if (!nodesByCampaign.has(row.id_campaign)) nodesByCampaign.set(row.id_campaign, []);
      nodesByCampaign.get(row.id_campaign).push(row);
    });
    const schedulesByCampaign = new Map();
    others.schedules.forEach((row) => {
      if (!schedulesByCampaign.has(row.id_campaign)) schedulesByCampaign.set(row.id_campaign, []);
      schedulesByCampaign.get(row.id_campaign).push(row);
    });
    const wanted = new Set(accountRefs.map((a) => a.key));
    const hits = new Map();
    for (const campaign of others.campaigns) {
      let reason = campaign.is_running ? 'running' : null;
      if (!reason) {
        const soon = (schedulesByCampaign.get(campaign.id) || []).some((schedule) => {
          const next = computeScheduleNextRunAt(schedule, now);
          return next && next.getTime() - now.getTime() <= SHARED_ACCOUNT_HORIZON_MS;
        });
        if (soon) reason = 'scheduled';
      }
      if (!reason) continue;
      const rawNodes = nodesByCampaign.get(campaign.id) || [];
      const keys = new Set();
      let sticky = null;
      let select = null;
      for (const node of rawNodes) {
        const subtype = String(node.node_subtype || '').toLowerCase();
        const cfg = node.config || {};
        if (subtype === 'send_email') {
          // eslint-disable-next-line no-await-in-loop
          const loaded = await (cfg.fromEmailId
            ? deps.emailRepo.findEmailSettingsById(cfg.fromEmailId, ownerUserId)
            : deps.emailRepo.findDefaultEmailSettings(ownerUserId)).catch(() => null);
          if (loaded?.id) keys.add(`email:${loaded.id}`);
        } else if (subtype === 'select_zalo_account') {
          select = getNodeOwnZaloAccountSpec({ node_subtype: subtype, config: cfg });
          sticky = select.ids[0] ?? null;
          if (sticky != null) keys.add(`zalo:${Number.parseInt(sticky, 10)}`);
        } else if (ZALO_SEND_SUBTYPES.has(subtype)) {
          const own = getNodeOwnZaloAccountSpec({ node_subtype: subtype, config: cfg });
          const poolIds = subtype !== 'send_zalo_group' && select?.multi ? select.ids : (own.multi && subtype !== 'send_zalo_group' ? own.ids : null);
          (poolIds || [sticky ?? own.ids[0]]).forEach((id) => {
            const parsed = Number.parseInt(id, 10);
            if (Number.isFinite(parsed)) keys.add(`zalo:${parsed}`);
          });
          if (sticky == null) sticky = (poolIds || [own.ids[0]])[0];
        }
      }
      keys.forEach((key) => {
        if (!wanted.has(key)) return;
        if (!hits.has(key)) hits.set(key, []);
        hits.get(key).push({ id: campaign.id, name: campaign.campaign_name, reason });
      });
    }
    return [...hits.entries()].map(([accountKey, campaigns]) => ({
      code: 'shared_account',
      params: { accountKey, label: accountRefs.find((a) => a.key === accountKey)?.label || accountKey, campaigns },
    }));
  } catch (error) {
    console.warn('[CampaignEstimate] Không dò được chiến dịch dùng chung tài khoản:', error?.message || error);
    return [];
  }
}

async function estimateFromNodes({ rawNodes, rawConnections, flowJson, ownerUserId, startAt, continuous, excludeCampaignId, deps: injected }) {
  const deps = injected || await loadDefaultDeps();
  const { nodes, connections } = normalizeEstimateNodes(rawNodes, rawConnections);
  const startAtDate = startAt ? new Date(startAt) : deps.now();
  const effectiveStart = Number.isNaN(startAtDate.getTime()) ? deps.now() : startAtDate;
  const built = await buildSimulationInput({ nodes, connections, flowJson, ownerUserId, deps });

  const simulation = estimateCampaignSend({
    startAt: effectiveStart,
    groups: built.groups,
    options: { continuous: continuous === true },
  });

  const extra = [...built.warnings];
  if (built.groups.length === 0) extra.push({ code: 'no_send_node', params: {} });
  if (built.phoneLookupNodes.length > 0) {
    extra.push({ code: 'zalo_phone_lookup_unmodeled', params: { nodes: built.phoneLookupNodes } });
  }
  extra.push(...await planQuotaWarnings({ simulation, ownerUserId, deps }));
  if (excludeCampaignId != null) {
    extra.push(...await sharedAccountWarnings({ excludeCampaignId, ownerUserId, accountRefs: built.accountRefs, deps }));
  }

  return {
    ...simulation,
    accounts: built.accountRefs,
    warnings: [...simulation.warnings, ...extra],
  };
}

/**
 * Ước tính cho chiến dịch ĐÃ LƯU. Quyền xem chiến dịch do tầng controller kiểm; ở đây chỉ đọc theo `campaignId`.
 *
 * @param {{ campaignId: number|string, ownerUserId: number, startAt?: Date|string, continuous?: boolean, deps?: object }} input
 * @returns {Promise<object|null>} null nếu chiến dịch không tồn tại
 */
export async function estimateForCampaign({ campaignId, ownerUserId, startAt = null, continuous = false, deps = null }) {
  const resolvedDeps = deps || await loadDefaultDeps();
  const campaign = await resolvedDeps.crud.findCampaignById({
    campaignId, isAdmin: true, userId: null,
  });
  if (!campaign) return null;
  const [rawNodes, rawConnections] = await Promise.all([
    resolvedDeps.crud.findNodesByCampaignId(campaignId),
    resolvedDeps.crud.findConnectionsByCampaignId(campaignId),
  ]);
  return estimateFromNodes({
    rawNodes, rawConnections, flowJson: campaign.flow_json, ownerUserId, startAt, continuous,
    excludeCampaignId: Number(campaignId), deps: resolvedDeps,
  });
}

/**
 * Ước tính cho chiến dịch CHƯA lưu (thẻ xác nhận AI — PR-2). `script.nodes` dùng camelCase.
 *
 * @param {{ script: { nodes: Array<object>, connections?: Array<object>, flowJson?: any }, ownerUserId: number, startAt?: Date|string, continuous?: boolean, deps?: object }} input
 * @returns {Promise<object>}
 */
export async function estimateForScript({ script, ownerUserId, startAt = null, continuous = false, deps = null }) {
  return estimateFromNodes({
    rawNodes: script?.nodes, rawConnections: script?.connections, flowJson: script?.flowJson ?? null,
    ownerUserId, startAt, continuous, excludeCampaignId: null, deps,
  });
}

export default { estimateForCampaign, estimateForScript, normalizeEstimateNodes };
