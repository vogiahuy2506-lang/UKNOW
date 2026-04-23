import db from '../config/database.js';

/**
 * Ghi nhận sự kiện analytics landing (view / click / submit).
 */
class LandingPageEventRepository {
  /**
   * @param {object} row
   * @returns {Promise<void>}
   */
  async insert(row) {
    await db.query(
      `INSERT INTO landing_page_events (
         event_type, landing_page_slug, target_url,
         utm_source, utm_medium, utm_campaign, utm_content, utm_term,
         visitor_id, referrer, user_agent, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)`,
      [
        String(row.eventType || '').trim(),
        row.landingPageSlug != null ? String(row.landingPageSlug).trim().toLowerCase() : null,
        row.targetUrl != null ? String(row.targetUrl).trim() : null,
        row.utmSource != null ? String(row.utmSource).trim() : null,
        row.utmMedium != null ? String(row.utmMedium).trim() : null,
        row.utmCampaign != null ? String(row.utmCampaign).trim() : null,
        row.utmContent != null ? String(row.utmContent).trim() : null,
        row.utmTerm != null ? String(row.utmTerm).trim() : null,
        row.visitorId != null ? String(row.visitorId).trim().slice(0, 64) : null,
        row.referrer != null ? String(row.referrer).trim().slice(0, 2000) : null,
        row.userAgent != null ? String(row.userAgent).trim().slice(0, 2000) : null,
      ]
    );
  }

  /**
   * Thống kê theo slug trong khoảng ngày (theo created_at).
   *
   * @param {string|null} dateFrom YYYY-MM-DD
   * @param {string|null} dateTo YYYY-MM-DD
   * @returns {Promise<{ slug: string, viewCount: number, clickCount: number }[]>}
   */
  async aggregateEventsBySlug(dateFrom, dateTo) {
    const conditions = [`event_type IN ('view', 'click')`];
    const params = [];
    let idx = 1;
    if (dateFrom) {
      conditions.push(`created_at >= $${idx}::timestamptz`);
      params.push(`${dateFrom}T00:00:00.000Z`);
      idx += 1;
    }
    if (dateTo) {
      conditions.push(`created_at <= $${idx}::timestamptz`);
      params.push(`${dateTo}T23:59:59.999Z`);
      idx += 1;
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await db.query(
      `SELECT
         landing_page_slug AS slug,
         COUNT(*) FILTER (WHERE event_type = 'view')::bigint AS "viewCount",
         COUNT(*) FILTER (WHERE event_type = 'click')::bigint AS "clickCount"
       FROM landing_page_events
       ${where}
       GROUP BY landing_page_slug
       HAVING landing_page_slug IS NOT NULL AND landing_page_slug <> ''`,
      params
    );
    return result.rows.map((r) => ({
      slug: r.slug,
      viewCount: Number(r.viewCount || 0),
      clickCount: Number(r.clickCount || 0),
    }));
  }
}

export default new LandingPageEventRepository();
