import customerReadRepository from '../../repositories/customer/customerRead.repository.js';

class CustomerHelperService {
  /**
   * Send transparent tracking pixel response.
   *
   * @param {import('express').Response} res
   * @returns {import('express').Response}
   */
  sendTrackingPixel(res) {
    const pixelBuffer = Buffer.from(
      'R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
      'base64'
    );

    res.set({
      'Content-Type': 'image/gif',
      'Content-Length': pixelBuffer.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });

    return res.status(200).send(pixelBuffer);
  }

  /**
   * Map journey row from DB shape to API shape.
   *
   * @param {object} row
   * @returns {object}
   */
  mapJourneyEvent(row) {
    return {
      id: row.id,
      eventType: row.event_type,
      eventChannel: row.event_channel,
      eventData: row.event_data,
      eventAt: row.event_at,
      createdAt: row.event_at,
      campaignId: row.id_campaign,
      runId: row.id_run || null,
      runName: row.run_name || null,
      idEmailMessage: row.id_email_message,
      idZaloMessage: row.id_zalo_message || null,
      campaignName: row.campaign_name || null,
      description:
        row.event_data?.description ||
        row.event_data?.subject ||
        row.event_type,
    };
  }

  /**
   * Resolve order status SQL expression depending on schema compatibility.
   *
   * @param {string} alias
   * @returns {Promise<string>}
   */
  async resolvePurchaseOrderStatusExpr(alias = 'cp') {
    if (typeof this.hasCustomerPurchaseOrderStatusColumn !== 'boolean') {
      try {
        this.hasCustomerPurchaseOrderStatusColumn = await customerReadRepository.hasPurchaseOrderStatusColumn();
      } catch {
        this.hasCustomerPurchaseOrderStatusColumn = false;
      }
    }

    if (this.hasCustomerPurchaseOrderStatusColumn) {
      return `COALESCE(
        NULLIF(${alias}.order_status, ''),
        CASE
          WHEN LOWER(TRIM(COALESCE(${alias}.product_type, ''))) = 'interested' THEN 'on-hold'
          ELSE 'completed'
        END
      )`;
    }

    return `CASE
      WHEN LOWER(TRIM(COALESCE(${alias}.product_type, ''))) = 'interested' THEN 'on-hold'
      ELSE 'completed'
    END`;
  }

  /**
   * Normalize incoming source to supported domain values.
   *
   * @param {unknown} value
   * @returns {'founderai'|'uknow_campaign'|null}
   */
  normalizeCustomerSource(value) {
    const raw = value === null || value === undefined ? '' : String(value).trim().toLowerCase();
    if (!raw) return null;

    if (['founderai', 'founder ai', 'uknow', 'woocommerce', 'learnpress'].includes(raw)) return 'founderai';
    if (['uknow_campaign', 'campaign', 'campaign_uknow'].includes(raw)) return 'uknow_campaign';
    return null;
  }
}

export default new CustomerHelperService();
