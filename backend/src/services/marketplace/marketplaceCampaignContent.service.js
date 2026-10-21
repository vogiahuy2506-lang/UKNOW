import path from 'path';
import { randomUUID } from 'crypto';
import emailTemplateRepository from '../../repositories/email/emailTemplate.repository.js';
import zaloTemplateRepository from '../../repositories/zalo/zaloTemplate.repository.js';
import { acquireStorageQuotaLock, insertStorageObject } from '../../repositories/storage.repository.js';
import {
  TEMPLATE_CHANNEL,
  collectRequiredTemplateReferences,
  createTemplateIdMaps,
} from '../../utils/campaignTemplateReference.util.js';
import { resolveOwnedStorageKey } from '../../utils/storageKey.util.js';
import { collectSellerBlockFiles } from '../../utils/marketplaceBlockAttachments.util.js';
import { getStorageBackend } from '../storage/storageBackend.js';
import {
  StorageQuotaExceededError,
  assertQuotaAvailable,
  getStorageUsage,
} from '../storage/storageQuota.service.js';

/**
 * Nội dung MẪU đi kèm chiến dịch Marketplace.
 *
 * Node gửi của chiến dịch trỏ id mẫu của NGƯỜI BÁN, mà đường gửi lọc mẫu theo chủ chiến dịch (Zalo `findContentByIdForUser`, email
 * `findEmailTemplateById(id, ownerId)` + preflight `EMAIL_TEMPLATE_UNAVAILABLE`) — người mua không gửi được nếu chỉ nhận sơ đồ khối. Nên:
 *  - ĐĂNG BÁN: chụp nội dung các mẫu mà khối THẬT SỰ dùng vào `snapshot.templates` (đọc bằng truy vấn có điều kiện `id_user = người bán`);
 *    mẫu được tham chiếu mà không tìm thấy → từ chối đăng bán.
 *  - MUA: tạo bản sao mẫu thuộc người mua (kèm chép tệp đính kèm sang `uploads/<người mua>/…` + ghi sổ `storage_objects` của người mua),
 *    trả bản đồ id cũ → id mới để đổi tham chiếu trong config khối và `flow_json`.
 *
 * Listing cũ (snapshot chưa có `templates`): đọc mẫu SỐNG của người bán làm nguồn. Không đủ nội dung → từ chối mua trước khi trừ credit.
 *
 * Tệp đính kèm CẤP KHỐI (`config.attachments`, `zaloGroupAttachments`, `steps[].attachments` — xem utils/marketplaceBlockAttachments.util.js)
 * đi cùng đường: gom + kiểm kho + cộng dung lượng lúc `prepareForPurchase`, chép + ghi sổ lúc `materializeBlockAttachments`.
 */

export const LISTING_CONTENT_UNAVAILABLE = 'LISTING_CONTENT_UNAVAILABLE';
export const MARKETPLACE_STORAGE_QUOTA_EXCEEDED = 'MARKETPLACE_STORAGE_QUOTA_EXCEEDED';
export const MARKETPLACE_TEMPLATE_MISSING = 'MARKETPLACE_TEMPLATE_MISSING';

const CHANNELS = [TEMPLATE_CHANNEL.EMAIL, TEMPLATE_CHANNEL.ZALO];

const CHANNEL_LABEL = Object.freeze({
  [TEMPLATE_CHANNEL.EMAIL]: 'email',
  [TEMPLATE_CHANNEL.ZALO]: 'Zalo',
});

const STORAGE_CATEGORY = Object.freeze({
  [TEMPLATE_CHANNEL.EMAIL]: 'email_template',
  [TEMPLATE_CHANNEL.ZALO]: 'zalo_template',
});

function httpError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

const emptyByChannel = () => ({ [TEMPLATE_CHANNEL.EMAIL]: {}, [TEMPLATE_CHANNEL.ZALO]: {} });

function formatMegabytes(bytes) {
  const mb = Number(bytes) / (1024 * 1024);
  return mb >= 10 ? String(Math.round(mb)) : mb.toFixed(1);
}

/**
 * Tệp đính kèm của mẫu, CHỈ giữ tệp nằm trong không gian của chủ mẫu (`uploads/<chủ>/…`): `attachments` do client ghi nên có thể trỏ
 * khoá của workspace khác — chép khoá đó là lấy tệp của người thứ ba về cho người mua.
 *
 * @returns {Array<object>} phần tử có `key` đã chuẩn hoá
 */
function ownedAttachments(rawAttachments, ownerId) {
  const list = Array.isArray(rawAttachments) ? rawAttachments : [];
  const kept = [];
  for (const attachment of list) {
    if (!attachment || typeof attachment !== 'object') continue;
    const key = resolveOwnedStorageKey(attachment, ownerId);
    if (!key) {
      console.warn(`[MarketplaceCampaignContent] Bỏ tệp đính kèm không thuộc workspace ${ownerId}`);
      continue;
    }
    kept.push({ ...attachment, key });
  }
  return kept;
}

/** Dòng bảng mẫu → nội dung chụp vào snapshot. */
function toSnapshotContent(row, ownerId) {
  return {
    name: row.template_name,
    code: row.template_code ?? null,
    subject: row.subject ?? null,
    bodyHtml: row.body_html ?? null,
    bodyText: row.body_text ?? null,
    variables: Array.isArray(row.variables) ? row.variables : [],
    category: row.category ?? null,
    attachments: ownedAttachments(row.attachments, ownerId),
  };
}

async function loadLiveTemplates(sellerId, idsByChannel, queryable = null) {
  const loaded = emptyByChannel();
  const [emailRows, zaloRows] = await Promise.all([
    emailTemplateRepository.findContentByIdsForOwner(idsByChannel[TEMPLATE_CHANNEL.EMAIL], sellerId, queryable),
    zaloTemplateRepository.findContentByIdsForOwner(idsByChannel[TEMPLATE_CHANNEL.ZALO], sellerId, queryable),
  ]);
  for (const row of emailRows) loaded[TEMPLATE_CHANNEL.EMAIL][String(row.id)] = toSnapshotContent(row, sellerId);
  for (const row of zaloRows) loaded[TEMPLATE_CHANNEL.ZALO][String(row.id)] = toSnapshotContent(row, sellerId);
  return loaded;
}

/**
 * Mẫu SỐNG của MỘT chủ cho danh sách tham chiếu (kênh → id chuỗi → nội dung). Truy vấn luôn có điều kiện `id_user = ownerId`.
 * Dùng cho script bù dữ liệu (đọc mẫu của người bán / kiểm một mẫu có phải của người mua không).
 *
 * @param {number|string} ownerId
 * @param {Array<{ channel: 'email'|'zalo', id: number|null }>} refs
 * @param {object|null} [queryable]
 * @returns {Promise<{ email: Record<string, object>, zalo: Record<string, object> }>}
 */
export async function loadSellerTemplates(ownerId, refs, queryable = null) {
  return loadLiveTemplates(ownerId, groupIdsByChannel(refs), queryable);
}

function groupIdsByChannel(refs) {
  const ids = { [TEMPLATE_CHANNEL.EMAIL]: new Set(), [TEMPLATE_CHANNEL.ZALO]: new Set() };
  for (const ref of refs) {
    if (ref.id != null) ids[ref.channel].add(ref.id);
  }
  return {
    [TEMPLATE_CHANNEL.EMAIL]: [...ids[TEMPLATE_CHANNEL.EMAIL]],
    [TEMPLATE_CHANNEL.ZALO]: [...ids[TEMPLATE_CHANNEL.ZALO]],
  };
}

/** Các tham chiếu mà `available` (kênh → id chuỗi → nội dung) không có. */
function findMissingReferences(refs, available) {
  return refs.filter((ref) => ref.id == null || !available[ref.channel]?.[String(ref.id)]);
}

function describeReferences(refs) {
  const first = refs[0];
  const more = refs.length > 1 ? ` (và ${refs.length - 1} chỗ khác cũng tương tự)` : '';
  return `khối "${first.nodeName}" đang dùng mẫu ${CHANNEL_LABEL[first.channel]} #${first.raw}${more}`;
}

/**
 * ĐĂNG BÁN — chụp nội dung các mẫu mà khối gửi THẬT SỰ dùng.
 *
 * @param {{ sellerId: number|string, nodes: Array<object> }} input `nodes`: khối của chiến dịch (snapshot camelCase hoặc hàng `campaign_nodes`)
 * @param {object|null} [queryable]
 * @returns {Promise<{ email: Record<string, object>, zalo: Record<string, object> }>}
 * @throws {Error} 400 `MARKETPLACE_TEMPLATE_MISSING` — có khối trỏ mẫu đã xoá / không thuộc người bán (nêu tên khối)
 */
export async function buildListingTemplates({ sellerId, nodes }, queryable = null) {
  const { templates, missing } = await tryBuildListingTemplates({ sellerId, nodes }, queryable);
  if (missing.length > 0) {
    throw httpError(
      `Không thể đăng bán: ${describeReferences(missing)} đã bị xoá hoặc không thuộc tài khoản của bạn. `
      + 'Hãy mở khối đó, chọn lại mẫu rồi đăng bán lại.',
      400,
      MARKETPLACE_TEMPLATE_MISSING
    );
  }
  return templates;
}

/**
 * Như `buildListingTemplates` nhưng KHÔNG ném lỗi khi thiếu mẫu: trả luôn danh sách tham chiếu thiếu (script bù dữ liệu cần báo chứ không dừng).
 *
 * @param {{ sellerId: number|string, nodes: Array<object> }} input
 * @param {object|null} [queryable]
 * @returns {Promise<{ templates: { email: Record<string, object>, zalo: Record<string, object> }, missing: Array<object> }>}
 */
export async function tryBuildListingTemplates({ sellerId, nodes }, queryable = null) {
  const refs = collectRequiredTemplateReferences(nodes);
  const templates = emptyByChannel();
  if (refs.length === 0) return { templates, missing: [] };

  const live = await loadLiveTemplates(sellerId, groupIdsByChannel(refs), queryable);
  const missing = findMissingReferences(refs, live);
  if (missing.length > 0) return { templates, missing };

  // Chỉ giữ mẫu được tham chiếu (không chụp mẫu thừa).
  for (const ref of refs) templates[ref.channel][String(ref.id)] = live[ref.channel][String(ref.id)];
  return { templates, missing: [] };
}

function unavailableError(detail) {
  return httpError(
    `Listing này đang thiếu nội dung (${detail}) nên chưa thể mua. Vui lòng báo người bán cập nhật lại listing.`,
    400,
    LISTING_CONTENT_UNAVAILABLE
  );
}

function quotaError(requestedBytes, usage) {
  return httpError(
    `Không đủ dung lượng lưu trữ để nhận các tệp đính kèm của chiến dịch này (cần khoảng ${formatMegabytes(requestedBytes)} MB, `
    + `còn ${formatMegabytes(usage?.remainingBytes ?? 0)} MB). Hãy xoá bớt tệp hoặc nâng dung lượng rồi mua lại — bạn chưa bị trừ credit.`,
    400,
    MARKETPLACE_STORAGE_QUOTA_EXCEEDED
  );
}

/** Người mua còn đủ chỗ cho `requestedBytes` không? Không đủ → 400 `MARKETPLACE_STORAGE_QUOTA_EXCEEDED`. */
export async function assertBuyerStorageAvailable(client, buyerId, requestedBytes) {
  if (!(requestedBytes > 0)) return;
  const usage = await getStorageUsage(buyerId, client);
  try {
    assertQuotaAvailable({ usage, requestedBytes });
  } catch (error) {
    if (error instanceof StorageQuotaExceededError) throw quotaError(requestedBytes, usage);
    throw error;
  }
}

/**
 * MUA, BƯỚC 1 (chạy TRƯỚC khi trừ credit) — gom nguồn nội dung mẫu và chặn bán hàng hỏng:
 *  - snapshot mới (có `templates`) → dùng đúng bản chụp; listing cũ → đọc mẫu sống của người bán (`id_user = listing.id_user`);
 *  - thiếu mẫu, hoặc tệp đính kèm của người bán đã mất → `LISTING_CONTENT_UNAVAILABLE` (400);
 *  - tổng dung lượng tệp vượt chỗ trống của người mua → `MARKETPLACE_STORAGE_QUOTA_EXCEEDED` (400).
 * Không ghi gì, không chép tệp.
 *
 * @param {{ client: object, listing: object, buyerId: number|string }} input
 * @returns {Promise<{ sources: { email: Map<string, object>, zalo: Map<string, object> }, totalBytes: number }>}
 */
export async function prepareForPurchase({ client, listing, buyerId }) {
  const snapshot = listing?.snapshot_data && typeof listing.snapshot_data === 'object' ? listing.snapshot_data : {};
  const refs = collectRequiredTemplateReferences(Array.isArray(snapshot.nodes) ? snapshot.nodes : []);

  // Tệp đính kèm cấp khối (không phụ thuộc có dùng mẫu hay không): kiểm kho + cộng dung lượng cùng bước với mẫu.
  const block = await collectBlockFileSources({ snapshot, sellerId: listing?.id_user });

  if (refs.length === 0) {
    if (block.totalBytes > 0) await assertBuyerStorageAvailable(client, buyerId, block.totalBytes);
    return {
      sources: { [TEMPLATE_CHANNEL.EMAIL]: new Map(), [TEMPLATE_CHANNEL.ZALO]: new Map() },
      totalBytes: 0,
      blockFiles: block.sources,
      blockBytes: block.totalBytes,
    };
  }

  const sellerId = listing.id_user;
  const hasSnapshotTemplates = Boolean(snapshot.templates) && typeof snapshot.templates === 'object';
  const available = hasSnapshotTemplates
    ? {
      [TEMPLATE_CHANNEL.EMAIL]: snapshot.templates[TEMPLATE_CHANNEL.EMAIL] || {},
      [TEMPLATE_CHANNEL.ZALO]: snapshot.templates[TEMPLATE_CHANNEL.ZALO] || {},
    }
    : await loadLiveTemplates(sellerId, groupIdsByChannel(refs), client);

  const collected = await collectTemplateSources({ client, refs, available, sellerId });
  await assertBuyerStorageAvailable(client, buyerId, collected.totalBytes + block.totalBytes);
  return { ...collected, blockFiles: block.sources, blockBytes: block.totalBytes };
}

/**
 * Tệp đính kèm cấp khối của snapshot (cả `nodes[].config` lẫn `flowJson`): mỗi khoá của NGƯỜI BÁN một lần. Tệp ngoài không gian người bán bị
 * bỏ (không kiểm, không chép). Tệp của người bán đã mất khỏi kho → `LISTING_CONTENT_UNAVAILABLE` (không bán hàng hỏng).
 * Không ghi gì, không chép tệp.
 *
 * @returns {Promise<{ sources: Map<string, object>, totalBytes: number }>}
 */
async function collectBlockFileSources({ snapshot, sellerId }) {
  const { files, skipped } = collectSellerBlockFiles(snapshot, sellerId);
  if (skipped > 0) {
    console.warn(`[MarketplaceCampaignContent] Bỏ ${skipped} tệp đính kèm cấp khối không thuộc workspace ${sellerId}`);
  }
  const sources = new Map();
  if (files.size === 0) return { sources, totalBytes: 0 };

  const backend = getStorageBackend();
  let totalBytes = 0;
  for (const [key, attachment] of files) {
    // eslint-disable-next-line no-await-in-loop
    const info = await backend.getObjectInfo(key);
    if (!info) {
      throw unavailableError(`tệp đính kèm "${attachment.displayName || attachment.originalName || attachment.name || key}" của một khối gửi tin không còn trên kho`);
    }
    const size = Number(info.size) || 0;
    totalBytes += size;
    sources.set(key, { ...attachment, __size: size });
  }
  return { sources, totalBytes };
}

/**
 * Lõi dùng chung của mua và script bù dữ liệu: từ các tham chiếu mẫu + nội dung sẵn có (`available`: kênh → id chuỗi → nội dung) dựng
 * nguồn chép cho từng mẫu, kiểm tệp đính kèm của người bán CÒN trên kho và cộng dung lượng thật. Không ghi gì, không chép tệp.
 *
 * @param {{ client: object|null, refs: Array<object>, available: { email: Record<string, object>, zalo: Record<string, object> }, sellerId: number|string }} input
 * @returns {Promise<{ sources: { email: Map<string, object>, zalo: Map<string, object> }, totalBytes: number }>}
 * @throws {Error} 400 `LISTING_CONTENT_UNAVAILABLE` — thiếu nội dung mẫu hoặc tệp đính kèm đã mất khỏi kho
 */
export async function collectTemplateSources({ refs, available, sellerId }) {
  const sources = { [TEMPLATE_CHANNEL.EMAIL]: new Map(), [TEMPLATE_CHANNEL.ZALO]: new Map() };
  const missing = findMissingReferences(refs, available);
  if (missing.length > 0) throw unavailableError(`${describeReferences(missing)} không còn nội dung mẫu`);

  const backend = getStorageBackend();
  let totalBytes = 0;
  for (const ref of refs) {
    const idKey = String(ref.id);
    if (sources[ref.channel].has(idKey)) continue;
    const content = available[ref.channel][idKey];
    // Snapshot do server dựng nhưng vẫn lọc lại theo chủ: không bao giờ chép tệp ngoài `uploads/<người bán>/`.
    const attachments = [];
    for (const attachment of ownedAttachments(content.attachments, sellerId)) {
      // eslint-disable-next-line no-await-in-loop
      const info = await backend.getObjectInfo(attachment.key);
      if (!info) {
        throw unavailableError(`tệp đính kèm "${attachment.displayName || attachment.originalName || attachment.name || attachment.key}" của mẫu ${CHANNEL_LABEL[ref.channel]} #${ref.raw} không còn trên kho`);
      }
      const size = Number(info.size) || 0;
      totalBytes += size;
      attachments.push({ ...attachment, __size: size });
    }
    sources[ref.channel].set(idKey, { ...content, attachments });
  }
  return { sources, totalBytes };
}

function safeBaseName(attachment) {
  const original = String(attachment.originalName || attachment.name || path.posix.basename(attachment.key) || 'file');
  const ext = path.extname(original);
  const base = path.basename(original, ext).trim() || 'file';
  return `${base.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 60)}${ext.replace(/[^a-zA-Z0-9.]/g, '').slice(0, 12)}`;
}

async function buildPreviewUrl(storageKey) {
  try {
    const { default: uploadController } = await import('../../controllers/upload.controller.js');
    return uploadController.buildDownloadUrlByKey(storageKey, { preview: true });
  } catch (error) {
    console.warn(`[MarketplaceCampaignContent] Không dựng được URL xem tệp ${storageKey}: ${error?.message || error}`);
    return '';
  }
}

/**
 * MUA, BƯỚC 2 (trong transaction mua) — tạo bản sao mẫu cho người mua + chép tệp đính kèm sang kho của người mua.
 *
 * Tệp chép nằm NGOÀI transaction DB: mọi khoá đã chép được đẩy vào `copiedKeys` NGAY SAU khi chép để người gọi dọn khi transaction
 * rollback (`discardCopiedFiles`). Dòng sổ `storage_objects` ghi trong transaction nên rollback theo.
 *
 * @param {object} client client của transaction mua
 * @param {{ buyerId: number|string, prepared: Awaited<ReturnType<typeof prepareForPurchase>>, copiedKeys: string[] }} input
 * @returns {Promise<{ maps: ReturnType<typeof createTemplateIdMaps>, templateCount: number, fileCount: number }>}
 */
export async function materializeTemplates(client, { buyerId, prepared, copiedKeys }) {
  const maps = createTemplateIdMaps();
  let templateCount = 0;
  let fileCount = 0;
  const hasAnySource = CHANNELS.some((channel) => prepared?.sources?.[channel]?.size > 0);
  if (!hasAnySource) return { maps, templateCount, fileCount };

  // Kiểm lại dung lượng KHI ĐÃ GIỮ khoá của người mua (bước 1 chỉ là kiểm sớm, không khoá): hai lượt mua song song không cùng lọt qua.
  if (prepared.totalBytes > 0) {
    await acquireStorageQuotaLock(client, buyerId);
    await assertBuyerStorageAvailable(client, buyerId, prepared.totalBytes);
  }

  const backend = getStorageBackend();
  for (const channel of CHANNELS) {
    for (const [oldId, content] of prepared.sources[channel]) {
      const newAttachments = [];
      const ledger = [];
      for (const attachment of content.attachments) {
        const newKey = `uploads/${buyerId}/${Date.now()}_${randomUUID()}_${safeBaseName(attachment)}`;
        // eslint-disable-next-line no-await-in-loop
        await backend.copy(attachment.key, newKey);
        copiedKeys.push(newKey);
        // eslint-disable-next-line no-await-in-loop
        const url = await buildPreviewUrl(newKey);
        const { __size: size, tempId: _tempId, storageObjectId: _storageObjectId, ...rest } = attachment;
        newAttachments.push({ ...rest, key: newKey, url, size: rest.size ?? size });
        ledger.push({ key: newKey, size });
        fileCount += 1;
      }

      const templateName = String(content.name || '').trim() || 'Mẫu từ Marketplace';
      const created = channel === TEMPLATE_CHANNEL.EMAIL
        ? await emailTemplateRepository.create({
          userId: buyerId,
          templateName,
          templateCode: content.code,
          subject: content.subject,
          bodyHtml: content.bodyHtml,
          bodyText: content.bodyText,
          attachments: newAttachments,
          variables: content.variables,
          category: content.category,
        }, client)
        : await zaloTemplateRepository.create({
          userId: buyerId,
          templateName,
          templateCode: content.code,
          subject: content.subject,
          bodyHtml: content.bodyHtml,
          bodyText: content.bodyText,
          attachments: newAttachments,
          variables: content.variables,
          category: content.category,
        }, client);

      for (const item of ledger) {
        // eslint-disable-next-line no-await-in-loop
        await insertStorageObject({
          poolType: 'workspace',
          ownerUserId: buyerId,
          actorUserId: buyerId,
          storageKey: item.key,
          category: STORAGE_CATEGORY[channel],
          state: 'active',
          sizeBytes: item.size,
          referenceType: STORAGE_CATEGORY[channel],
          referenceId: String(created.id),
        }, client);
      }
      if (channel === TEMPLATE_CHANNEL.EMAIL) {
        for (const attachment of newAttachments) {
          // eslint-disable-next-line no-await-in-loop
          await emailTemplateRepository.syncTemplateFile(created.id, attachment, client);
        }
      }

      maps[channel].set(String(oldId), String(created.id));
      templateCount += 1;
    }
  }
  return { maps, templateCount, fileCount };
}

/**
 * MUA (trong transaction mua) — chép tệp đính kèm CẤP KHỐI sang kho của người mua + ghi sổ dung lượng của người mua.
 * Mỗi khoá của người bán chép MỘT lần dù nhiều khối / `flowJson` cùng dùng. Cùng quy ước với `materializeTemplates`: mọi khoá đã chép được đẩy
 * vào `copiedKeys` NGAY SAU khi chép để người gọi dọn khi rollback; dòng sổ ghi trong transaction nên rollback theo.
 *
 * @param {object} client client của transaction mua
 * @param {{ buyerId: number|string, prepared: { blockFiles?: Map<string, object>, blockBytes?: number }, copiedKeys: string[] }} input
 * @returns {Promise<{ keyMap: Map<string, object>, fileCount: number }>} `keyMap`: khoá người bán → phần tử tệp mới (khoá/URL của người mua)
 */
export async function materializeBlockAttachments(client, { buyerId, prepared, copiedKeys }) {
  const keyMap = new Map();
  const sources = prepared?.blockFiles;
  if (!(sources instanceof Map) || sources.size === 0) return { keyMap, fileCount: 0 };

  // Kiểm lại dung lượng KHI ĐÃ giữ khoá của người mua (bước prepare chỉ là kiểm sớm, không khoá).
  const bytes = Number(prepared.blockBytes) || 0;
  if (bytes > 0) {
    await acquireStorageQuotaLock(client, buyerId);
    await assertBuyerStorageAvailable(client, buyerId, bytes);
  }

  const backend = getStorageBackend();
  let fileCount = 0;
  for (const [oldKey, attachment] of sources) {
    const newKey = `uploads/${buyerId}/${Date.now()}_${randomUUID()}_${safeBaseName(attachment)}`;
    // eslint-disable-next-line no-await-in-loop
    await backend.copy(oldKey, newKey);
    copiedKeys.push(newKey);
    // eslint-disable-next-line no-await-in-loop
    const url = await buildPreviewUrl(newKey);
    const { __size: size, tempId: _tempId, storageObjectId: _storageObjectId, ...rest } = attachment;
    keyMap.set(oldKey, { ...rest, key: newKey, url, size: rest.size ?? size });
    // eslint-disable-next-line no-await-in-loop
    await insertStorageObject({
      poolType: 'workspace',
      ownerUserId: buyerId,
      actorUserId: buyerId,
      storageKey: newKey,
      category: 'campaign',
      state: 'active',
      sizeBytes: size,
      referenceType: 'campaign_node',
      referenceId: null,
    }, client);
    fileCount += 1;
  }
  return { keyMap, fileCount };
}

/**
 * Dọn các tệp đã chép khi transaction mua rollback (tệp nằm ngoài DB nên rollback không tự xoá). Không bao giờ ném lỗi.
 *
 * @param {string[]} copiedKeys
 * @returns {Promise<void>}
 */
export async function discardCopiedFiles(copiedKeys) {
  const keys = (Array.isArray(copiedKeys) ? copiedKeys : []).filter(Boolean);
  if (keys.length === 0) return;
  try {
    await getStorageBackend().delete(keys);
  } catch (error) {
    console.error(`[MarketplaceCampaignContent] Không dọn được ${keys.length} tệp đã chép sau khi mua lỗi: ${error?.message || error}`);
  }
}

export default {
  buildListingTemplates,
  tryBuildListingTemplates,
  loadSellerTemplates,
  collectTemplateSources,
  assertBuyerStorageAvailable,
  prepareForPurchase,
  materializeTemplates,
  materializeBlockAttachments,
  discardCopiedFiles,
};
