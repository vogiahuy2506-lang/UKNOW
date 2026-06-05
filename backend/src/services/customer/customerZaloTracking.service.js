import db from '../../config/database.js';
import customerZaloTrackingRepository from '../../repositories/customer/customerZaloTracking.repository.js';

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

    const rawUserId = await customerZaloTrackingRepository.getCampaignUserId(client, parsedCampaignId);
    const userId = Number.parseInt(rawUserId, 10);
    if (!Number.isFinite(userId)) return null;

    const rawExisting = await customerZaloTrackingRepository.findCustomerByZaloUid(client, userId, normalizedUid);
    const existingCustomerId = Number.parseInt(rawExisting, 10);
    if (Number.isFinite(existingCustomerId)) return existingCustomerId;

    const rawInserted = await customerZaloTrackingRepository.createPlaceholderCustomerByZaloUid(client, userId, normalizedUid);
    const insertedCustomerId = Number.parseInt(rawInserted, 10);
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
   * @param {object} queryParams - req.query object
   * @param {string} defaultRedirect
   * @returns {string}
   */
  resolveRedirectUrl(queryParams, defaultRedirect) {
    const rawUrl = String(queryParams.url || '').trim();
    if (!rawUrl) return defaultRedirect;

    try {
      const decodedUrl = this.decodeUrlQueryValue(rawUrl);
      const parsed = new URL(decodedUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return defaultRedirect;
      }

      // Merge leaked query params (except `url`) back into destination URL.
      for (const [key, value] of Object.entries(queryParams || {})) {
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
  async trackZaloClick({ token, redirectUrl, linkKey }) {
    const client = await db.getClient();

    try {
      if (!token) return { redirectUrl };

      await client.query('BEGIN');

      const message = await customerZaloTrackingRepository.findZaloMessageByToken(client, token);

      if (message) {
        const clickMetadata = {
          lastClickedUrl: redirectUrl,
          lastClickedAt: new Date().toISOString(),
        };
        const clickCount = await customerZaloTrackingRepository.incrementZaloMessageClickCount(client, message.id, clickMetadata);

        const parsedCustomerId = this.parseCustomerIdFromRedirectUrl(redirectUrl);
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
          await customerZaloTrackingRepository.setZaloMessageCustomer(client, message.id, trackedCustomerId);
        }

        // Link Zalo UID to customer record for zalo_person_campaign clicks
        if (
          !isZaloGroup &&
          zaloUidFromUrl &&
          normalizedUtmSource === 'zalo_person_campaign' &&
          Number.isFinite(trackedCustomerId)
        ) {
          await customerZaloTrackingRepository.linkZaloUidToCustomer(client, trackedCustomerId, zaloUidFromUrl);
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
            await customerZaloTrackingRepository.insertZaloClickJourney(client, {
              customerId: journeyCustomerId,
              campaignId: message.id_campaign,
              runId: message.id_run,
              channel: eventChannel,
              messageId: message.id,
              eventData,
            });
          } else {
            const exists = await customerZaloTrackingRepository.findExistingPersonalZaloClickJourney(client, {
              messageId: message.id,
              channel: eventChannel,
              customerId: journeyCustomerId,
              linkKey: resolvedLinkKey,
            });

            if (!exists) {
              await customerZaloTrackingRepository.insertZaloClickJourney(client, {
                customerId: journeyCustomerId,
                campaignId: message.id_campaign,
                runId: message.id_run,
                channel: eventChannel,
                messageId: message.id,
                eventData,
              });
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

    return { redirectUrl };
  }

}

export default new CustomerZaloTrackingService();
