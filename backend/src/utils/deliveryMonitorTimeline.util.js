const toNumber = (value) => Number(value || 0);

const ADAPTER_TIMELINE_KEYS = new Set(['telegram', 'whatsapp']);

/**
 * PLAN_WHATSAPP_DOT3, W7b — gộp timeline theo giờ của customer_journey (email/zalo/zalo_group) với
 * tin `sent` theo giờ của kênh adapter (Telegram/WhatsApp, từ campaign_channel_messages). Cùng
 * khoá `bucket` 'YYYY-MM-DD HH24:00'. Dùng chung cho màn giám sát của user và của admin.
 *
 * @param {Array<{bucket: string, email?: number, zalo?: number, zalo_group?: number}>} journeyRows
 * @param {Array<{bucket: string, channel: string, count: number}>} [adapterHourlyRows]
 * @returns {Array<{bucket: string, email: number, zalo: number, zaloGroup: number, telegram: number, whatsapp: number, total: number}>}
 */
export function buildDeliveryTimeline(journeyRows = [], adapterHourlyRows = []) {
  const buckets = new Map();
  const ensure = (bucket) => {
    if (!buckets.has(bucket)) {
      buckets.set(bucket, { bucket, email: 0, zalo: 0, zaloGroup: 0, telegram: 0, whatsapp: 0, total: 0 });
    }
    return buckets.get(bucket);
  };
  journeyRows.forEach((row) => {
    const item = ensure(row.bucket);
    item.email += toNumber(row.email);
    item.zalo += toNumber(row.zalo);
    item.zaloGroup += toNumber(row.zalo_group);
  });
  adapterHourlyRows.forEach((row) => {
    const key = String(row.channel || '').toLowerCase();
    if (!ADAPTER_TIMELINE_KEYS.has(key)) return;
    ensure(row.bucket)[key] += toNumber(row.count);
  });
  return Array.from(buckets.values())
    .map((item) => ({ ...item, total: item.email + item.zalo + item.zaloGroup + item.telegram + item.whatsapp }))
    .sort((a, b) => (a.bucket < b.bucket ? -1 : a.bucket > b.bucket ? 1 : 0));
}
