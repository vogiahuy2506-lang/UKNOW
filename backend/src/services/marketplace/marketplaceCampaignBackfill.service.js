import db from '../../config/database.js';
import marketplaceCampaignContent from './marketplaceCampaignContent.service.js';
import {
  collectRequiredTemplateReferences,
  createTemplateIdMaps,
  remapTemplateIdsInConfig,
  remapTemplateIdsInFlowJson,
} from '../../utils/campaignTemplateReference.util.js';
import {
  stripSellerBoundFlowJson,
  stripSellerBoundNodeConfig,
  stripSellerBoundSnapshotNodes,
} from '../../utils/marketplaceCampaignSnapshot.util.js';

/**
 * Bù dữ liệu cũ cho Marketplace chiến dịch kèm mẫu (PLAN_MARKETPLACE_CHIEN_DICH_KEM_MAU_2026-10-19, PR-3).
 *
 * Hai phần, dùng ĐÚNG các hàm của PR-1 (không viết lại luật):
 *  1. Listing chiến dịch cũ — nhúng nội dung mẫu SỐNG của người bán vào `snapshot_data.templates` + gỡ dữ liệu gắn người bán khỏi
 *     snapshot (nodes + flowJson). Listing có mẫu đã mất → CHỈ BÁO, không sửa (người bán phải đăng lại).
 *  2. Chiến dịch người mua ĐÃ MUA (`campaigns.marketplace_purchase_id` không null) còn `draft` và 0 lượt chạy — tạo bản sao mẫu cho
 *     người mua (+ chép tệp, ghi sổ dung lượng) + đổi id mẫu + gỡ dữ liệu người bán ở `campaign_nodes.config` và `flow_json`.
 *     Mỗi chiến dịch MỘT transaction; lỗi một chiến dịch không chặn các chiến dịch khác.
 *
 * Mặc định dry-run (chỉ tính, không ghi, không chép tệp). Chạy lại an toàn: trạng thái sau khi xử lý tự nó là dấu "đã xong" —
 * listing đã có `templates` + sạch khoá thì không đổi; chiến dịch đã trỏ mẫu của chính người mua thì không chép thêm mẫu nào
 * (id mẫu của người bán không còn trong config nên không còn gì để chép).
 */

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const sumAttachments = (templates) => ['email', 'zalo'].reduce(
  (total, channel) => total + Object.values(templates?.[channel] || {}).reduce(
    (sum, template) => sum + (Array.isArray(template?.attachments) ? template.attachments.length : 0),
    0
  ),
  0
);

const countTemplates = (templates, channel) => Object.keys(templates?.[channel] || {}).length;

function describeMissing(missing) {
  const first = missing[0];
  const more = missing.length > 1 ? ` (+${missing.length - 1} chỗ khác)` : '';
  return `khối "${first.nodeName}" trỏ mẫu ${first.channel} #${first.raw} không còn${more}`;
}

/**
 * Tính (không ghi) snapshot mới của MỘT listing chiến dịch.
 *
 * @returns {Promise<{ ok: boolean, reason?: string, changed: boolean, nextSnapshot?: object, templates?: object, stripped: boolean, embedded: boolean }>}
 */
async function planListing(listing) {
  const snapshot = isObject(listing.snapshot_data) ? listing.snapshot_data : {};
  const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
  const nextNodes = stripSellerBoundSnapshotNodes(nodes);
  const hasFlow = Object.prototype.hasOwnProperty.call(snapshot, 'flowJson');
  const nextFlow = hasFlow ? stripSellerBoundFlowJson(snapshot.flowJson) : undefined;
  const stripped = nextNodes.some((node, index) => node !== nodes[index]) || (hasFlow && nextFlow !== snapshot.flowJson);

  let templates = isObject(snapshot.templates) ? snapshot.templates : null;
  let embedded = false;
  if (!templates) {
    const built = await marketplaceCampaignContent.tryBuildListingTemplates({ sellerId: listing.id_user, nodes });
    if (built.missing.length > 0) {
      return { ok: false, reason: `thiếu mẫu: ${describeMissing(built.missing)}`, changed: false, stripped, embedded: false };
    }
    templates = built.templates;
    embedded = true;
  }
  const nextSnapshot = {
    ...snapshot,
    nodes: nextNodes,
    ...(hasFlow ? { flowJson: nextFlow } : {}),
    templates,
  };
  return { ok: true, changed: stripped || embedded, nextSnapshot, templates, stripped, embedded };
}

async function runListingPhase({ apply, listingIds, log }) {
  const params = [];
  let where = `resource_type = 'campaign'`;
  if (listingIds?.length) {
    params.push(listingIds);
    where += ` AND id = ANY($${params.length}::bigint[])`;
  }
  const { rows: listings } = await db.query(
    `SELECT l.id, l.id_user, l.title, l.status, l.snapshot_data,
            (SELECT COUNT(*)::int FROM marketplace_purchases p WHERE p.listing_id = l.id) AS purchase_count
       FROM marketplace_listings l
      WHERE ${where}
      ORDER BY l.id`,
    params
  );

  const entries = [];
  const effective = new Map(); // listingId -> trạng thái SAU xử lý (kể cả khi dry-run) để phần 2 dùng
  for (const listing of listings) {
    const entry = { listingId: String(listing.id), title: listing.title, sellerId: String(listing.id_user), status: listing.status, purchases: listing.purchase_count };
    try {
      const plan = await planListing(listing);
      if (!plan.ok) {
        entries.push({ ...entry, action: 'bo_qua', reason: plan.reason, emailTemplates: 0, zaloTemplates: 0, attachments: 0, stripped: plan.stripped });
        effective.set(String(listing.id), { ok: false, reason: plan.reason });
        continue;
      }
      if (plan.changed && apply) {
        await db.query('UPDATE marketplace_listings SET snapshot_data = $1 WHERE id = $2', [JSON.stringify(plan.nextSnapshot), listing.id]);
      }
      entries.push({
        ...entry,
        action: plan.changed ? (apply ? 'da_ghi' : 'se_ghi') : 'khong_doi',
        emailTemplates: plan.embedded ? countTemplates(plan.templates, 'email') : 0,
        zaloTemplates: plan.embedded ? countTemplates(plan.templates, 'zalo') : 0,
        attachments: plan.embedded ? sumAttachments(plan.templates) : 0,
        stripped: plan.stripped,
        embedded: plan.embedded,
      });
      effective.set(String(listing.id), { ok: true, sellerId: String(listing.id_user), templates: plan.templates });
    } catch (error) {
      log(`[marketplace-backfill] LOI listing #${listing.id}: ${error?.message || error}`);
      entries.push({ ...entry, action: 'loi', reason: error?.message || String(error), emailTemplates: 0, zaloTemplates: 0, attachments: 0, stripped: false });
      effective.set(String(listing.id), { ok: false, reason: `lỗi đọc listing: ${error?.message || error}` });
    }
  }
  return { entries, effective };
}

/** Cấu hình mới của một khối cho người mua: gỡ dữ liệu người bán rồi đổi id mẫu. */
const buyerConfigFor = (subtype, config, maps) => remapTemplateIdsInConfig(subtype, stripSellerBoundNodeConfig(subtype, config), maps);

/** Bản đồ giả (id cũ → '0') để đếm số khối/flow SẼ đổi khi dry-run mà chưa tạo mẫu thật. */
function placeholderMaps(sources) {
  const maps = createTemplateIdMaps();
  for (const channel of ['email', 'zalo']) {
    for (const oldId of sources[channel].keys()) maps[channel].set(String(oldId), '0');
  }
  return maps;
}

function computeChanges({ nodes, flowJson, maps }) {
  const nodeChanges = [];
  for (const node of nodes) {
    const nextConfig = buyerConfigFor(node.node_subtype, node.config, maps);
    const nextEmailColumn = node.id_email_template != null ? (maps.email.get(String(node.id_email_template)) ?? null) : null;
    const nextZaloColumn = node.id_zalo_template != null ? (maps.zalo.get(String(node.id_zalo_template)) ?? null) : null;
    const columnChanged = (node.id_email_template != null && nextEmailColumn !== null && String(nextEmailColumn) !== String(node.id_email_template))
      || (node.id_zalo_template != null && nextZaloColumn !== null && String(nextZaloColumn) !== String(node.id_zalo_template));
    if (nextConfig !== node.config || columnChanged) {
      nodeChanges.push({ node, nextConfig, nextEmailColumn, nextZaloColumn });
    }
  }
  const nextFlow = flowJson ? remapTemplateIdsInFlowJson(stripSellerBoundFlowJson(flowJson), maps) : flowJson;
  return { nodeChanges, nextFlow, flowChanged: nextFlow !== flowJson };
}

async function runCampaignPhase({ apply, campaignIds, listingIds, effective, log }) {
  const params = [];
  let where = 'c.marketplace_purchase_id IS NOT NULL';
  if (campaignIds?.length) {
    params.push(campaignIds);
    where += ` AND c.id = ANY($${params.length}::bigint[])`;
  }
  if (listingIds?.length) {
    params.push(listingIds);
    where += ` AND p.listing_id = ANY($${params.length}::bigint[])`;
  }
  const { rows: campaigns } = await db.query(
    `SELECT c.id, c.campaign_name, c.status, c.flow_json,
            COALESCE(c.workspace_owner_id, c.id_user) AS buyer_id,
            p.listing_id,
            (SELECT COUNT(*)::int FROM campaign_runs r WHERE r.id_campaign = c.id) AS run_count
       FROM campaigns c
       JOIN marketplace_purchases p ON p.id = c.marketplace_purchase_id
      WHERE ${where}
      ORDER BY c.id`,
    params
  );

  const entries = [];
  for (const campaign of campaigns) {
    const base = {
      campaignId: String(campaign.id),
      name: campaign.campaign_name,
      buyerId: String(campaign.buyer_id),
      listingId: String(campaign.listing_id),
      templatesCopied: 0,
      filesCopied: 0,
      nodesChanged: 0,
      flowChanged: false,
    };
    if (campaign.status !== 'draft') {
      entries.push({ ...base, action: 'bo_qua', reason: `trạng thái "${campaign.status}" (chỉ xử lý bản nháp)` });
      continue;
    }
    if (campaign.run_count > 0) {
      entries.push({ ...base, action: 'bo_qua', reason: `đã có ${campaign.run_count} lượt chạy` });
      continue;
    }
    const listingState = effective.get(String(campaign.listing_id));
    if (!listingState) {
      entries.push({ ...base, action: 'bo_qua', reason: 'không đọc được listing nguồn' });
      continue;
    }
    if (!listingState.ok) {
      entries.push({ ...base, action: 'bo_qua', reason: `listing nguồn ${listingState.reason}` });
      continue;
    }
    try {
      entries.push(await processCampaign({ campaign, base, listingState, apply, log }));
    } catch (error) {
      log(`[marketplace-backfill] LOI chiến dịch #${campaign.id}: ${error?.message || error}`);
      entries.push({ ...base, action: 'loi', reason: error?.message || String(error) });
    }
  }
  return entries;
}

async function processCampaign({ campaign, base, listingState, apply, log }) {
  const buyerId = campaign.buyer_id;
  const { rows: nodes } = await db.query(
    `SELECT id, node_subtype, node_name, config, id_email_template, id_zalo_template
       FROM campaign_nodes WHERE id_campaign = $1 ORDER BY id`,
    [campaign.id]
  );

  // Chỉ chép các mẫu CÓ trong bản chụp của listing (= mẫu của người bán). Tham chiếu còn lại phải là mẫu của chính người mua
  // (người mua đã tự chọn lại / lần chạy trước đã xử lý) — không rõ nguồn thì bỏ qua cả chiến dịch, không đoán.
  const refs = collectRequiredTemplateReferences(nodes);
  const isSellerRef = (ref) => ref.id != null && Boolean(listingState.templates?.[ref.channel]?.[String(ref.id)]);
  const sellerRefs = refs.filter(isSellerRef);
  const otherRefs = refs.filter((ref) => !isSellerRef(ref));
  if (otherRefs.length > 0) {
    const owned = await marketplaceCampaignContent.loadSellerTemplates(buyerId, otherRefs);
    const unknown = otherRefs.filter((ref) => ref.id == null || !owned[ref.channel]?.[String(ref.id)]);
    if (unknown.length > 0) {
      return { ...base, action: 'bo_qua', reason: `không rõ nguồn mẫu: ${describeMissing(unknown)}` };
    }
  }

  let collected = { sources: { email: new Map(), zalo: new Map() }, totalBytes: 0 };
  if (sellerRefs.length > 0) {
    try {
      collected = await marketplaceCampaignContent.collectTemplateSources({
        client: db,
        refs: sellerRefs,
        available: listingState.templates,
        sellerId: listingState.sellerId,
      });
      await marketplaceCampaignContent.assertBuyerStorageAvailable(db, buyerId, collected.totalBytes);
    } catch (error) {
      return { ...base, action: 'bo_qua', reason: error?.message || String(error) };
    }
  }
  const templatesToCopy = collected.sources.email.size + collected.sources.zalo.size;
  const filesToCopy = [...collected.sources.email.values(), ...collected.sources.zalo.values()]
    .reduce((sum, template) => sum + template.attachments.length, 0);

  const planned = computeChanges({ nodes, flowJson: campaign.flow_json, maps: placeholderMaps(collected.sources) });
  const nothingToDo = templatesToCopy === 0 && planned.nodeChanges.length === 0 && !planned.flowChanged;
  if (nothingToDo) return { ...base, action: 'khong_doi' };
  if (!apply) {
    return {
      ...base, action: 'se_ghi', templatesCopied: templatesToCopy, filesCopied: filesToCopy, nodesChanged: planned.nodeChanges.length, flowChanged: planned.flowChanged,
    };
  }

  const client = await db.getClient();
  const copiedKeys = [];
  try {
    await client.query('BEGIN');
    // Khoá dòng + kiểm lại điều kiện TRONG transaction: người mua có thể vừa mở/chạy chiến dịch từ lúc đọc ở trên.
    const { rows: locked } = await client.query(
      `SELECT c.status, (SELECT COUNT(*)::int FROM campaign_runs r WHERE r.id_campaign = c.id) AS run_count
         FROM campaigns c WHERE c.id = $1 FOR UPDATE`,
      [campaign.id]
    );
    if (!locked[0] || locked[0].status !== 'draft' || locked[0].run_count > 0) {
      await client.query('ROLLBACK');
      return { ...base, action: 'bo_qua', reason: 'chiến dịch vừa đổi trạng thái / vừa có lượt chạy' };
    }
    const { rows: freshNodes } = await client.query(
      `SELECT id, node_subtype, node_name, config, id_email_template, id_zalo_template
         FROM campaign_nodes WHERE id_campaign = $1 ORDER BY id FOR UPDATE`,
      [campaign.id]
    );
    const { rows: freshCampaign } = await client.query('SELECT flow_json FROM campaigns WHERE id = $1', [campaign.id]);

    const { maps, templateCount, fileCount } = await marketplaceCampaignContent.materializeTemplates(client, {
      buyerId,
      prepared: collected,
      copiedKeys,
    });
    const applied = computeChanges({ nodes: freshNodes, flowJson: freshCampaign[0]?.flow_json, maps });
    for (const change of applied.nodeChanges) {
      await client.query(
        `UPDATE campaign_nodes
            SET config = $1,
                id_email_template = COALESCE($2::bigint, id_email_template),
                id_zalo_template = COALESCE($3::bigint, id_zalo_template)
          WHERE id = $4`,
        [JSON.stringify(change.nextConfig), change.nextEmailColumn, change.nextZaloColumn, change.node.id]
      );
    }
    if (applied.flowChanged) {
      await client.query('UPDATE campaigns SET flow_json = $1 WHERE id = $2', [JSON.stringify(applied.nextFlow), campaign.id]);
    }
    await client.query('COMMIT');
    return {
      ...base, action: 'da_ghi', templatesCopied: templateCount, filesCopied: fileCount, nodesChanged: applied.nodeChanges.length, flowChanged: applied.flowChanged,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    await marketplaceCampaignContent.discardCopiedFiles(copiedKeys);
    log(`[marketplace-backfill] LOI chiến dịch #${campaign.id} (đã rollback): ${error?.message || error}`);
    return { ...base, action: 'loi', reason: error?.message || String(error) };
  } finally {
    client.release();
  }
}

/**
 * @param {{ apply?: boolean, listingIds?: Array<number|string>|null, campaignIds?: Array<number|string>|null, log?: (line: string) => void }} [options]
 * @returns {Promise<{ apply: boolean, listings: Array<object>, campaigns: Array<object>, totals: object }>}
 */
export async function runMarketplaceCampaignBackfill({ apply = false, listingIds = null, campaignIds = null, log = () => {} } = {}) {
  // Giới hạn theo chiến dịch mà không nêu listing → chỉ xét listing nguồn của các chiến dịch đó (không đụng listing khác khi --apply).
  let listingScope = listingIds?.length ? listingIds : null;
  if (!listingScope && campaignIds?.length) {
    const { rows } = await db.query(
      `SELECT DISTINCT p.listing_id FROM campaigns c JOIN marketplace_purchases p ON p.id = c.marketplace_purchase_id WHERE c.id = ANY($1::bigint[])`,
      [campaignIds]
    );
    listingScope = rows.map((row) => String(row.listing_id));
    if (listingScope.length === 0) listingScope = ['0']; // không chiến dịch nào hợp lệ → không listing nào
  }
  const { entries: listings, effective } = await runListingPhase({ apply, listingIds: listingScope, log });
  const campaigns = await runCampaignPhase({ apply, campaignIds, listingIds: listingScope, effective, log });
  const count = (list, ...actions) => list.filter((entry) => actions.includes(entry.action)).length;
  const totals = {
    listingsUpdated: count(listings, 'se_ghi', 'da_ghi'),
    listingsSkipped: count(listings, 'bo_qua'),
    listingsUnchanged: count(listings, 'khong_doi'),
    campaignsUpdated: count(campaigns, 'se_ghi', 'da_ghi'),
    campaignsSkipped: count(campaigns, 'bo_qua'),
    campaignsUnchanged: count(campaigns, 'khong_doi'),
    errors: count(listings, 'loi') + count(campaigns, 'loi'),
    templatesCopied: campaigns.reduce((sum, entry) => sum + entry.templatesCopied, 0),
    filesCopied: campaigns.reduce((sum, entry) => sum + entry.filesCopied, 0),
  };
  return { apply, listings, campaigns, totals };
}

const ACTION_LABEL = Object.freeze({
  se_ghi: 'SẼ GHI',
  da_ghi: 'ĐÃ GHI',
  khong_doi: 'không đổi',
  bo_qua: 'BỎ QUA',
  loi: 'LỖI',
});

function renderTable(headers, rows) {
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => String(row[index] ?? '').length)));
  const line = (cells) => cells.map((cell, index) => String(cell ?? '').padEnd(widths[index])).join(' | ');
  return [line(headers), widths.map((width) => '-'.repeat(width)).join('-+-'), ...rows.map(line)].join('\n');
}

/**
 * Bảng chữ cho người vận hành: listing + chiến dịch, số mẫu chép, số tệp chép, lý do bỏ qua.
 *
 * @param {Awaited<ReturnType<typeof runMarketplaceCampaignBackfill>>} report
 * @returns {string}
 */
export function formatBackfillReport(report) {
  const mode = report.apply ? 'GHI THẬT (--apply)' : 'DRY-RUN (chỉ tính, không ghi gì — thêm --apply để ghi)';
  const listingRows = report.listings.map((entry) => [
    `#${entry.listingId}`,
    ACTION_LABEL[entry.action] || entry.action,
    entry.status,
    entry.purchases,
    entry.zaloTemplates,
    entry.emailTemplates,
    entry.attachments,
    entry.stripped ? 'có' : '-',
    entry.reason || '',
  ]);
  const campaignRows = report.campaigns.map((entry) => [
    `#${entry.campaignId}`,
    ACTION_LABEL[entry.action] || entry.action,
    `listing #${entry.listingId}`,
    `người mua ${entry.buyerId}`,
    entry.templatesCopied,
    entry.filesCopied,
    entry.nodesChanged,
    entry.flowChanged ? 'có' : '-',
    entry.reason || '',
  ]);
  const { totals } = report;
  return [
    `== Marketplace chiến dịch kèm mẫu — ${mode} ==`,
    '',
    'Listing chiến dịch:',
    listingRows.length
      ? renderTable(['Listing', 'Việc', 'Trạng thái', 'Lượt mua', 'Mẫu Zalo nhúng', 'Mẫu email nhúng', 'Tệp', 'Có khoá người bán', 'Ghi chú'], listingRows)
      : '(không có)',
    '',
    'Chiến dịch đã mua:',
    campaignRows.length
      ? renderTable(['Chiến dịch', 'Việc', 'Nguồn', 'Người mua', 'Mẫu chép', 'Tệp chép', 'Khối đổi', 'flow_json đổi', 'Bỏ qua vì'], campaignRows)
      : '(không có)',
    '',
    `Tổng: listing ${report.apply ? 'đã ghi' : 'sẽ ghi'} ${totals.listingsUpdated}, bỏ qua ${totals.listingsSkipped}, không đổi ${totals.listingsUnchanged}; `
      + `chiến dịch ${report.apply ? 'đã ghi' : 'sẽ ghi'} ${totals.campaignsUpdated}, bỏ qua ${totals.campaignsSkipped}, không đổi ${totals.campaignsUnchanged}; `
      + `mẫu chép ${totals.templatesCopied}, tệp chép ${totals.filesCopied}, lỗi ${totals.errors}.`,
  ].join('\n');
}

export default { runMarketplaceCampaignBackfill, formatBackfillReport };
