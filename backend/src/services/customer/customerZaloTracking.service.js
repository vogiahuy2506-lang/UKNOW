import db from '../../config/database.js';

class CustomerZaloTrackingService {
  /**
   * Parse numeric customer id from tracked redirect URL.
   *
   * @param {string} redirectUrl
   * @returns {number|null}
   */
  parseCustomerIdFromRedirectUrl(redirectUrl) {
    try {
      const parsed = new URL(String(redirectUrl || '').trim());
      const raw = parsed.searchParams.get('utm_customer');
      const customerId = Number.parseInt(raw || '', 10);
      return Number.isFinite(customerId) ? customerId : null;
    } catch {
      return null;
    }
  }

  /**
   * Parse Zalo UID from tracked redirect URL (utm_zalo_uid param).
   *
   * @param {string} redirectUrl
   * @returns {string|null}
   */
  parseZaloUidFromRedirectUrl(redirectUrl) {
    try {
      const parsed = new URL(String(redirectUrl || '').trim());
      const uid = String(parsed.searchParams.get('utm_zalo_uid') || '').trim();
      return uid || null;
    } catch {
      return null;
    }
  }

  /**
   * Parse utm_source from tracked redirect URL.
   *
   * @param {string} redirectUrl
   * @returns {string|null}
   */
  parseUtmSourceFromRedirectUrl(redirectUrl) {
    try {
      const parsed = new URL(String(redirectUrl || '').trim());
      return String(parsed.searchParams.get('utm_source') || '').trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Normalize redirect utm_source for Zalo click attribution.
   *
   * @param {string|null} source
   * @returns {'zalo_person_campaign'|'zalo_group_campaign'|null}
   */
  normalizeZaloUtmSource(source) {
    const raw = String(source || '').trim().toLowerCase();
    if (!raw) return null;
    if (['zalo_person_campaign', 'zalo_person_camgign'].includes(raw)) return 'zalo_person_campaign';
    if (['zalo_group_campaign', 'zalo_group_campgingn'].includes(raw)) return 'zalo_group_campaign';
    return null;
  }

  /**
   * Resolve one customer for personal Zalo click by uid.
   * If the uid is unseen, create a placeholder customer for consistent tracking.
   *
   * @param {import('pg').PoolClient} client
   * @param {{ campaignId: number|null, zaloUid: string }} params
   * @returns {Promise<number|null>}
   */
  async resolveOrCreateCustomerByZaloUid(client, { campaignId = null, zaloUid = '' } = {}) {
    const normalizedUid = String(zaloUid || '').trim();
    const parsedCampaignId = Number.parseInt(campaignId, 10);
    if (!normalizedUid || !Number.isFinite(parsedCampaignId)) return null;

    const userResult = await client.query(
      `SELECT id_user
       FROM campaigns
       WHERE id = $1
       LIMIT 1`,
      [parsedCampaignId]
    );
    const userId = Number.parseInt(userResult.rows[0]?.id_user, 10);
    if (!Number.isFinite(userId)) return null;

    const existingResult = await client.query(
      `SELECT id
       FROM customers
       WHERE id_user = $1
         AND zalo_id = $2
       ORDER BY id ASC
       LIMIT 1`,
      [userId, normalizedUid]
    );
    const existingCustomerId = Number.parseInt(existingResult.rows[0]?.id, 10);
    if (Number.isFinite(existingCustomerId)) return existingCustomerId;

    const insertedResult = await client.query(
      `INSERT INTO customers
         (id_user, zalo_id, customer_source, utm_source, created_at, updated_at)
       VALUES
         ($1, $2, 'uknow_campaign', 'zalo_person_campaign', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [userId, normalizedUid]
    );
    const insertedCustomerId = Number.parseInt(insertedResult.rows[0]?.id, 10);
    return Number.isFinite(insertedCustomerId) ? insertedCustomerId : null;
  }

  /**
   * Build normalized journey payload for Zalo click event.
   *
   * @param {object} input
   * @returns {object}
   */
  buildClickJourneyEventData({ redirectUrl, groupId, clickCount, linkKey = null }) {
    return {
      description: 'Khách hàng đã nhấp link trong tin nhắn Zalo',
      targetUrl: redirectUrl,
      linkKey: linkKey || redirectUrl,
      groupId: groupId || null,
      clickCount: Number(clickCount || 0),
    };
  }

  /**
   * Detect whether one tracked message belongs to Zalo group channel.
   *
   * @param {object} message
   * @returns {boolean}
   */
  isZaloGroupMessage(message = {}) {
    const channel = String(message?.channel || '').trim().toLowerCase();
    if (channel === 'zalo_group') return true;
    return String(message?.group_id || '').trim() !== '';
  }

  /**
   * Detect Zalo group source from redirect URL UTM params.
   *
   * @param {string} redirectUrl
   * @returns {boolean}
   */
  isZaloGroupUtmSource(redirectUrl) {
    try {
      const parsed = new URL(String(redirectUrl || '').trim());
      const utmSources = parsed.searchParams.getAll('utm_source');
      return utmSources.some((item) => String(item || '').trim().toLowerCase().includes('zalo_group'));
    } catch {
      return false;
    }
  }

  /**
   * Decode URL query value once when possible.
   *
   * @param {string} value
   * @returns {string}
   */
  decodeUrlQueryValue(value) {
    const rawValue = String(value || '').trim();
    if (!rawValue) return '';
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  /**
   * Build redirect URL from tracking query. When in-app browser decodes early,
   * UTM params can leak out of `url` into top-level query and need to be merged back.
   *
   * @param {import('express').Request} req
   * @param {string} defaultRedirect
   * @returns {string}
   */
  resolveRedirectUrl(req, defaultRedirect) {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) return defaultRedirect;

    try {
      const decodedUrl = this.decodeUrlQueryValue(rawUrl);
      const parsed = new URL(decodedUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return defaultRedirect;
      }

      // Merge leaked query params (except `url`) back into destination URL.
      for (const [key, value] of Object.entries(req.query || {})) {
        if (key === 'url') continue;
        if (value === undefined || value === null) continue;
        const values = Array.isArray(value) ? value : [value];
        for (const item of values) {
          const normalizedValue = String(item ?? '').trim();
          if (!normalizedValue) continue;
          if (!parsed.searchParams.has(key)) {
            parsed.searchParams.append(key, normalizedValue);
          }
        }
      }

      return parsed.toString();
    } catch {
      return defaultRedirect;
    }
  }

  /**
   * Track click for Zalo campaign message then redirect to destination URL.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @returns {Promise<import('express').Response>}
   */
  async trackZaloClick(req, res) {
    const client = await db.getClient();

    const defaultRedirect = process.env.FRONTEND_URL || 'http://localhost:5173';
    const token = String(req.params.token || '').trim();
    const redirectUrl = this.resolveRedirectUrl(req, defaultRedirect);
    const linkKey = String(req.query.lk || '').trim().slice(0, 120) || null;

    try {
      if (!token) return res.redirect(302, redirectUrl);

      await client.query('BEGIN');

      const messageResult = await client.query(
        `SELECT id, id_campaign, id_run, id_customer, group_id, channel
         FROM zalo_messages
         WHERE tracking_token = $1
         FOR UPDATE`,
        [token]
      );

      if (messageResult.rows.length > 0) {
        const message = messageResult.rows[0];

        const updateResult = await client.query(
          `UPDATE zalo_messages
           SET click_count = COALESCE(click_count, 0) + 1,
               first_clicked_at = COALESCE(first_clicked_at, CURRENT_TIMESTAMP),
               last_clicked_at = CURRENT_TIMESTAMP,
               tracking_metadata = COALESCE(tracking_metadata, '{}'::jsonb) || $2::jsonb,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING click_count`,
          [
            message.id,
            JSON.stringify({
              lastClickedUrl: redirectUrl,
              lastClickedAt: new Date().toISOString(),
            }),
          ],
        );

        const parsedCustomerId = this.parseCustomerIdFromRedirectUrl(redirectUrl);
        const clickCount = Number(updateResult.rows?.[0]?.click_count || 0);
        const isZaloGroup = this.isZaloGroupMessage(message) || this.isZaloGroupUtmSource(redirectUrl);
        const messageCustomerId = Number.parseInt(message.id_customer, 10);
        const rawUtmSource = this.parseUtmSourceFromRedirectUrl(redirectUrl);
        const normalizedUtmSource = this.normalizeZaloUtmSource(rawUtmSource);
        const zaloUidFromUrl = this.parseZaloUidFromRedirectUrl(redirectUrl);
        let trackedCustomerId = Number.isFinite(messageCustomerId) ? messageCustomerId : parsedCustomerId;
        if (
          !isZaloGroup &&
          !Number.isFinite(trackedCustomerId) &&
          normalizedUtmSource === 'zalo_person_campaign' &&
          zaloUidFromUrl
        ) {
          trackedCustomerId = await this.resolveOrCreateCustomerByZaloUid(client, {
            campaignId: message.id_campaign,
            zaloUid: zaloUidFromUrl,
          });
        }
        const journeyCustomerId = isZaloGroup ? null : trackedCustomerId;
        const eventChannel = isZaloGroup ? 'zalo_group' : 'zalo';
        const canTrackJourney = isZaloGroup || Number.isFinite(journeyCustomerId);

        if (!Number.isFinite(messageCustomerId) && Number.isFinite(trackedCustomerId)) {
          await client.query(
            `UPDATE zalo_messages
             SET id_customer = COALESCE(id_customer, $2),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [message.id, trackedCustomerId]
          );
        }

        // Link Zalo UID to customer record for zalo_person_campaign clicks
        if (
          !isZaloGroup &&
          zaloUidFromUrl &&
          normalizedUtmSource === 'zalo_person_campaign' &&
          Number.isFinite(trackedCustomerId)
        ) {
          await client.query(
            `UPDATE customers
             SET zalo_id = CASE
                             WHEN zalo_id IS NULL OR zalo_id = '' THEN $1
                             ELSE zalo_id
                           END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [zaloUidFromUrl, trackedCustomerId]
          );
        }

        if (canTrackJourney) {
          const resolvedLinkKey = linkKey || redirectUrl;
          const eventData = this.buildClickJourneyEventData({
            redirectUrl,
            groupId: message.group_id || null,
            clickCount,
            linkKey: resolvedLinkKey,
          });

          if (isZaloGroup) {
            // Zalo group: keep every click event as a separate journey row.
            await client.query(
              `INSERT INTO customer_journey
                 (id_customer, id_campaign, id_run, event_type, event_channel, id_zalo_message, event_data, event_at)
               VALUES
                 ($1, $2, $3, 'zalo_clicked', $4, $5, $6::jsonb, CURRENT_TIMESTAMP)`,
              [
                journeyCustomerId,
                message.id_campaign,
                message.id_run || null,
                eventChannel,
                message.id,
                JSON.stringify(eventData),
              ]
            );
          } else {
            const existingClick = await client.query(
              `SELECT id
               FROM customer_journey
               WHERE event_type = 'zalo_clicked'
                 AND id_zalo_message = $1
                 AND event_channel = $2
                 AND id_customer IS NOT DISTINCT FROM $3
                 AND COALESCE(event_data ->> 'linkKey', event_data ->> 'targetUrl', '') = $4
               LIMIT 1`,
              [message.id, eventChannel, journeyCustomerId, resolvedLinkKey]
            );

            // Zalo personal: keep one journey row per unique clicked link.
            if (existingClick.rows.length === 0) {
              await client.query(
                `INSERT INTO customer_journey
                   (id_customer, id_campaign, id_run, event_type, event_channel, id_zalo_message, event_data, event_at)
                 VALUES
                   ($1, $2, $3, 'zalo_clicked', $4, $5, $6::jsonb, CURRENT_TIMESTAMP)`,
                [
                  journeyCustomerId,
                  message.id_campaign,
                  message.id_run || null,
                  eventChannel,
                  message.id,
                  JSON.stringify(eventData),
                ]
              );
            }
          }
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Track zalo click error:', error);
    } finally {
      client.release();
    }

    return res.redirect(302, redirectUrl);
  }

}

export default new CustomerZaloTrackingService();
