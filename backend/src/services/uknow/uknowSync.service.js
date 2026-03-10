import axios from 'axios';
import db from '../../config/database.js';

class UknowSyncService {
  /**
   * Sync customers from UKNOW API into local DB.
   */
  async syncCustomers(ctx, req, res) {
    const client = await db.getClient();

    try {
      const userId = req.user.id;
      let page = 1;
      let hasMore = true;
      let inserted = 0;
      let updated = 0;
      let processed = 0;

      while (hasMore) {
        const response = await axios.get(`${ctx.baseUrl}/wc/v3/customers`, {
          headers: ctx.getAuthHeaders(),
          params: { page, per_page: 100 },
        });

        const customers = response.data || [];
        if (customers.length === 0) break;

        for (const customer of customers) {
          processed += 1;

          const result = await ctx.upsertCustomer(client, userId, {
            email: customer.email,
            phone: customer.billing?.phone,
            fullName: ctx.formatName(customer.first_name, customer.last_name),
            customerSource: 'uknow',
            hasPurchased: (parseInt(customer.orders_count || 0, 10) || 0) > 0,
            totalOrders: parseInt(customer.orders_count || 0, 10) || 0,
            totalSpent: ctx.parseMoney(customer.total_spent),
            lastOrderAt: null,
          });

          if (result.inserted) inserted += 1;
          if (result.updated) updated += 1;
        }

        const totalPages = parseInt(response.headers['x-wp-totalpages'] || 1, 10);
        page += 1;
        hasMore = page <= totalPages;
      }

      res.json({
        success: true,
        message: `Dong bo khach hang thanh cong. Moi: ${inserted}, cap nhat: ${updated}`,
        data: { inserted, updated, processed },
      });
    } catch (error) {
      console.error('Sync UKNOW customers error:', error.response?.data || error.message);
      res.status(500).json({
        success: false,
        message: 'Khong the dong bo khach hang tu UKNOW',
      });
    } finally {
      client.release();
    }
  }

  /**
   * Sync courses from UKNOW API into local DB.
   */
  async syncCourses(ctx, req, res) {
    const client = await db.getClient();

    try {
      const userId = req.user.id;
      let page = 1;
      let hasMore = true;
      let inserted = 0;
      let updated = 0;
      let processed = 0;

      while (hasMore) {
        const response = await axios.get(`${ctx.baseUrl}/wc/v3/products`, {
          headers: ctx.getAuthHeaders(),
          params: { page, per_page: 100, status: 'any' },
        });

        const products = response.data || [];
        if (products.length === 0) break;

        for (const product of products) {
          processed += 1;
          const result = await ctx.upsertCourse(client, userId, product);
          if (result.inserted) inserted += 1;
          if (result.updated) updated += 1;
        }

        const totalPages = parseInt(response.headers['x-wp-totalpages'] || 1, 10);
        page += 1;
        hasMore = page <= totalPages;
      }

      res.json({
        success: true,
        message: `Dong bo khoa hoc thanh cong. Moi: ${inserted}, cap nhat: ${updated}`,
        data: { inserted, updated, processed },
      });
    } catch (error) {
      console.error('Sync UKNOW courses error:', error.response?.data || error.message);
      res.status(500).json({
        success: false,
        message: 'Khong the dong bo khoa hoc tu UKNOW',
      });
    } finally {
      client.release();
    }
  }

  /**
   * Sync orders in bulk from UKNOW API.
   */
  async syncOrders(ctx, req, res) {
    const client = await db.getClient();

    try {
      const userId = req.user.id;
      const hasOrderStatusColumn = await ctx.hasPurchaseOrderStatusColumn();
      const requestedStatus = ctx.toNullableText(req.query?.status) || 'completed,on-hold';
      const normalizedStatus = requestedStatus
        .split(',')
        .map((item) => item.trim().toLowerCase().replace('onhold', 'on-hold'))
        .filter(Boolean)
        .join(',');
      const onlyMissing = ctx.toBoolean(req.query?.onlyMissing);
      const requestedSources = ctx.toNullableText(req.query?.sources) || '';
      const requestedDays = Number.parseInt(req.query?.days, 10);
      const startDateInput = ctx.toNullableText(req.query?.startDate);
      const endDateInput = ctx.toNullableText(req.query?.endDate);

      /**
       * Chuẩn hóa chuỗi nguồn UTM về 3 nhóm chính để lọc:
       * - email
       * - zalo
       * - zalo_group
       *
       * @param {string|null|undefined} sourceValue
       * @returns {'email'|'zalo'|'zalo_group'|null}
       */
      const normalizeSourceChannel = (sourceValue) => {
        const source = String(sourceValue || '').toLowerCase();
        if (!source) return null;
        // Ưu tiên group trước để tránh match nhầm vào nhánh zalo cá nhân.
        if (source.includes('zalo_group_campaign')) return 'zalo_group';
        if (source.includes('zalo_group')) return 'zalo_group';
        if (source.includes('zalo_person_campaign')) return 'zalo';
        if (source.includes('zalo_campaign')) return 'zalo';
        if (source.includes('zalo')) return 'zalo';
        if (source.includes('email')) return 'email';
        return null;
      };

      /**
       * Lấy giá trị meta theo key từ mảng meta_data của Woo order.
       *
       * @param {Array<object>} metaData
       * @param {string} key
       * @returns {string}
       */
      const getOrderMetaValue = (metaData, key) => {
        if (!Array.isArray(metaData) || !key) return '';
        const loweredKey = String(key).toLowerCase();
        const found = metaData.find((item) => String(item?.key || '').toLowerCase() === loweredKey);
        return String(found?.value || '').trim();
      };

      /**
       * Suy luận nguồn UTM từ order:
       * 1) Ưu tiên `_wc_order_attribution_utm_source`
       * 2) Fallback parse từ `_wc_order_attribution_session_entry` (query param utm_source)
       *
       * @param {object} order
       * @returns {'email'|'zalo'|'zalo_group'|null}
       */
      const extractOrderSourceChannel = (order) => {
        const utmSource = getOrderMetaValue(order?.meta_data, '_wc_order_attribution_utm_source');
        const normalizedMetaSource = normalizeSourceChannel(utmSource);
        if (normalizedMetaSource) return normalizedMetaSource;

        const sessionEntry = getOrderMetaValue(order?.meta_data, '_wc_order_attribution_session_entry');
        if (!sessionEntry) return null;
        try {
          const parsedUrl = new URL(sessionEntry);
          const sourceFromUrl = parsedUrl.searchParams.get('utm_source');
          return normalizeSourceChannel(sourceFromUrl);
        } catch {
          return null;
        }
      };

      /**
       * Parse thông tin tracking từ meta `_wc_order_attribution_session_entry`.
       * Dùng để liên kết purchase với campaign/run/message ngay lúc đồng bộ.
       *
       * @param {object} order
       * @returns {{ campaignId: number|null, runId: number|null, emailMessageId: number|null, zaloMessageId: number|null }}
       */
      const extractTrackingFromOrderMeta = (order) => {
        const emptyTracking = {
          campaignId: null,
          runId: null,
          emailMessageId: null,
          zaloMessageId: null,
        };
        const sessionEntry = getOrderMetaValue(order?.meta_data, '_wc_order_attribution_session_entry');
        if (!sessionEntry) return emptyTracking;

        try {
          const parsedUrl = new URL(sessionEntry);
          const params = parsedUrl.searchParams;
          return {
            campaignId: Number.parseInt(params.get('utm_campaign') || '', 10) || null,
            runId: Number.parseInt(params.get('utm_id_run') || '', 10) || null,
            emailMessageId: Number.parseInt(params.get('utm_id_email') || '', 10) || null,
            zaloMessageId: Number.parseInt(params.get('utm_id_zalo_message') || '', 10) || null,
          };
        } catch {
          return emptyTracking;
        }
      };

      /**
       * Tìm metadata journey đã có để bổ sung ngược cho purchase khi bị thiếu.
       *
       * Luồng hoạt động:
       * 1. Ưu tiên bản ghi journey khớp trực tiếp theo `order_id`.
       * 2. Nếu chưa có, fallback bản ghi journey gần nhất trước thời điểm mua.
       *
       * @param {import('pg').PoolClient} dbClient
       * @param {number} customerId
       * @param {string} orderId
       * @param {string|Date} purchaseDate
       * @returns {Promise<{ campaignId: number|null, runId: number|null, emailMessageId: number|null, zaloMessageId: number|null }>}
       */
      const findJourneyAttributionByOrder = async (dbClient, customerId, orderId, purchaseDate) => {
        const emptyAttribution = {
          campaignId: null,
          runId: null,
          emailMessageId: null,
          zaloMessageId: null,
        };
        if (!customerId || !orderId) return emptyAttribution;

        const byOrder = await dbClient.query(
          `SELECT id_campaign, id_run, id_email_message, id_zalo_message
           FROM customer_journey
           WHERE id_customer = $1
             AND (
               COALESCE(event_data->>'order_id', '') = $2
               OR COALESCE(event_data->>'orderId', '') = $2
             )
           ORDER BY event_at DESC NULLS LAST, id DESC
           LIMIT 1`,
          [customerId, String(orderId)]
        );
        if (byOrder.rows.length > 0) {
          return {
            campaignId: byOrder.rows[0].id_campaign || null,
            runId: byOrder.rows[0].id_run || null,
            emailMessageId: byOrder.rows[0].id_email_message || null,
            zaloMessageId: byOrder.rows[0].id_zalo_message || null,
          };
        }

        const byRecentJourney = await dbClient.query(
          `SELECT id_campaign, id_run, id_email_message, id_zalo_message
           FROM customer_journey
           WHERE id_customer = $1
             AND event_at <= $2
             AND (
               id_run IS NOT NULL
               OR id_email_message IS NOT NULL
               OR id_zalo_message IS NOT NULL
               OR id_campaign IS NOT NULL
             )
           ORDER BY event_at DESC NULLS LAST, id DESC
           LIMIT 1`,
          [customerId, purchaseDate]
        );
        if (byRecentJourney.rows.length > 0) {
          return {
            campaignId: byRecentJourney.rows[0].id_campaign || null,
            runId: byRecentJourney.rows[0].id_run || null,
            emailMessageId: byRecentJourney.rows[0].id_email_message || null,
            zaloMessageId: byRecentJourney.rows[0].id_zalo_message || null,
          };
        }

        return emptyAttribution;
      };

      /**
       * Ghép metadata attribution theo thứ tự ưu tiên:
       * order meta -> journey -> click attribution.
       *
       * @param {object} params
       * @returns {{ campaignId: number|null, runId: number|null, emailMessageId: number|null, zaloMessageId: number|null }}
       */
      const buildFinalAttribution = ({ metaTracking, journeyTracking, clickTracking }) => ({
        campaignId:
          metaTracking?.campaignId
          || journeyTracking?.campaignId
          || clickTracking?.campaignId
          || null,
        runId: metaTracking?.runId || journeyTracking?.runId || null,
        emailMessageId:
          metaTracking?.emailMessageId
          || journeyTracking?.emailMessageId
          || clickTracking?.emailMessageId
          || null,
        zaloMessageId: metaTracking?.zaloMessageId || journeyTracking?.zaloMessageId || null,
      });

      /**
       * Resolve customer cho đơn từ UKNOW.
       *
       * Luồng hoạt động:
       * 1. Nếu nguồn là Zalo/Zalo Group: chỉ tìm customer hiện có theo email/phone.
       *    - Có rồi: dùng lại, KHÔNG cập nhật thông tin hiện hữu.
       *    - Chưa có: tạo mới customer.
       * 2. Nguồn khác: giữ hành vi upsert như trước.
       *
       * @param {object} params
       * @param {'email'|'zalo'|'zalo_group'|null} params.sourceChannel
       * @param {object} params.order
       * @param {boolean} params.isPurchasedOrder
       * @returns {Promise<{customerId: number|null, inserted: boolean, updated: boolean}>}
       */
      const resolveCustomerForOrder = async ({ sourceChannel, order, isPurchasedOrder }) => {
        const isZaloSource = sourceChannel === 'zalo' || sourceChannel === 'zalo_group';
        const email = order.billing?.email;
        const phone = order.billing?.phone;
        const fullName = ctx.formatName(order.billing?.first_name, order.billing?.last_name);

        if (isZaloSource) {
          const existingCustomer = await ctx.findCustomer(client, userId, email, phone);
          if (existingCustomer?.id) {
            return { customerId: existingCustomer.id, inserted: false, updated: false };
          }
        }

        return ctx.upsertCustomer(client, userId, {
          email,
          phone,
          fullName,
          customerSource: 'uknow_campaign',
          hasPurchased: isPurchasedOrder,
        });
      };

      /**
       * Upsert journey theo trạng thái order để đảm bảo có `order_pending/order_completed`.
       *
       * @param {object} params
       * @param {number} params.customerId
       * @param {object} params.order
       * @param {'email'|'zalo'|'zalo_group'|null} params.sourceChannel
       * @param {object} params.attribution
       * @param {string} params.purchaseDate
       * @returns {Promise<void>}
       */
      const upsertOrderStatusJourneyEvent = async ({
        customerId,
        order,
        sourceChannel,
        attribution,
        purchaseDate,
      }) => {
        const normalizedOrderStatus = String(order?.status || '').toLowerCase().replace('onhold', 'on-hold');
        const eventType = normalizedOrderStatus === 'on-hold'
          ? 'order_pending'
          : ['completed', 'processing'].includes(normalizedOrderStatus)
            ? 'order_completed'
            : null;
        if (!eventType) return;

        const eventChannel = sourceChannel || 'purchase';
        const orderId = String(order.id || '').trim();
        if (!orderId) return;
        const orderNumber = String(order.number || '').trim() || orderId;
        const eventData = {
          order_id: orderId,
          order_number: orderNumber,
          status: normalizedOrderStatus,
          total: ctx.parseMoney(order.total),
          currency: ctx.toNullableText(order.currency) || 'VND',
          source_channel: eventChannel,
          products: (order.line_items || []).map((lineItem) => ({
            product_id: ctx.getLineItemProductId(lineItem),
            product_name: ctx.toNullableText(lineItem?.name),
            quantity: parseInt(lineItem?.quantity || 1, 10) || 1,
            total: ctx.parseMoney(lineItem?.total, ctx.parseMoney(lineItem?.price)),
          })),
        };

        const existingEvent = await client.query(
          `SELECT id
           FROM customer_journey
           WHERE id_customer = $1
             AND event_type = $2
             AND (
               COALESCE(event_data->>'order_id', '') = $3
               OR COALESCE(event_data->>'orderId', '') = $3
             )
           ORDER BY id DESC
           LIMIT 1`,
          [customerId, eventType, orderId]
        );

        if (existingEvent.rows.length > 0) {
          await client.query(
            `UPDATE customer_journey
             SET
               id_campaign = COALESCE($1, id_campaign),
               id_run = COALESCE($2, id_run),
               id_email_message = COALESCE($3, id_email_message),
               id_zalo_message = COALESCE($4, id_zalo_message),
               event_channel = COALESCE($5, event_channel),
               event_data = $6::jsonb,
               event_at = COALESCE($7, event_at)
             WHERE id = $8`,
            [
              attribution?.campaignId || null,
              attribution?.runId || null,
              attribution?.emailMessageId || null,
              attribution?.zaloMessageId || null,
              eventChannel,
              JSON.stringify(eventData),
              purchaseDate || null,
              existingEvent.rows[0].id,
            ]
          );
          return;
        }

        await client.query(
          `INSERT INTO customer_journey (
              id_customer, id_campaign, id_run, event_type, event_channel,
              id_email_message, id_zalo_message, event_data, event_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
          [
            customerId,
            attribution?.campaignId || null,
            attribution?.runId || null,
            eventType,
            eventChannel,
            attribution?.emailMessageId || null,
            attribution?.zaloMessageId || null,
            JSON.stringify(eventData),
            purchaseDate || new Date().toISOString(),
          ]
        );
      };

      const allowedSources = new Set(
        requestedSources
          .split(',')
          .map((item) => normalizeSourceChannel(item.trim()))
          .filter(Boolean)
      );

      // Ưu tiên startDate/endDate nếu có; fallback về days.
      const now = new Date();
      const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      let startBoundary = null;
      let endBoundary = null;
      if (startDateInput && endDateInput) {
        const parsedStart = new Date(`${startDateInput}T00:00:00.000Z`);
        const parsedEnd = new Date(`${endDateInput}T23:59:59.999Z`);
        if (Number.isFinite(parsedStart.getTime()) && Number.isFinite(parsedEnd.getTime()) && parsedStart <= parsedEnd) {
          startBoundary = parsedStart;
          endBoundary = parsedEnd;
        }
      } else if (Number.isFinite(requestedDays) && requestedDays > 0) {
        endBoundary = new Date(Date.UTC(
          todayUtc.getUTCFullYear(),
          todayUtc.getUTCMonth(),
          todayUtc.getUTCDate(),
          23,
          59,
          59,
          999
        ));
        startBoundary = new Date(endBoundary.getTime() - (requestedDays - 1) * 24 * 60 * 60 * 1000);
        startBoundary.setUTCHours(0, 0, 0, 0);
      }

      let page = 1;
      let hasMore = true;

      let scannedOrders = 0;
      let processedOrders = 0;
      let processedLineItems = 0;
      let insertedPurchases = 0;
      let updatedPurchases = 0;
      let skippedExistingPurchases = 0;
      let enrichedExistingPurchases = 0;
      let skippedBySource = 0;
      let skippedOutOfRange = 0;
      let insertedCustomers = 0;
      let updatedCustomers = 0;
      let insertedCourses = 0;
      let updatedCourses = 0;
      let attributedPurchases = 0;

      const touchedCustomerIds = new Set();
      const touchedCampaignIds = new Set();
      const productCache = {};

      while (hasMore) {
        const requestParams = {
          page,
          per_page: 100,
          status: normalizedStatus || 'completed,on-hold',
        };
        if (startBoundary) requestParams.after = startBoundary.toISOString();
        if (endBoundary) requestParams.before = endBoundary.toISOString();

        const response = await axios.get(`${ctx.baseUrl}/wc/v3/orders`, {
          headers: ctx.getAuthHeaders(),
          params: requestParams,
        });

        const orders = response.data || [];
        if (orders.length === 0) break;

        for (const order of orders) {
          scannedOrders += 1;
          const sourceChannel = extractOrderSourceChannel(order);
          if (allowedSources.size > 0 && !sourceChannel) {
            skippedBySource += 1;
            continue;
          }
          if (allowedSources.size > 0 && sourceChannel && !allowedSources.has(sourceChannel)) {
            skippedBySource += 1;
            continue;
          }

          if (startBoundary || endBoundary) {
            const orderTime = new Date(
              order.date_created
              || order.date_modified
              || order.date_paid
              || order.date_completed
              || new Date().toISOString()
            );
            if (Number.isFinite(orderTime.getTime())) {
              if (startBoundary && orderTime < startBoundary) {
                skippedOutOfRange += 1;
                continue;
              }
              if (endBoundary && orderTime > endBoundary) {
                skippedOutOfRange += 1;
                continue;
              }
            }
          }

          const orderStatus = String(order?.status || '').toLowerCase().replace('onhold', 'on-hold');
          const isPurchasedOrder = orderStatus === 'completed';
          const isInterestedOrder = orderStatus === 'on-hold';
          if (!isPurchasedOrder && !isInterestedOrder) continue;

          // Quy ước mới: đơn hoàn thành lưu product_type = "complete".
          const purchaseStage = isPurchasedOrder ? 'complete' : 'interested';
          processedOrders += 1;
          const purchaseDate = order.date_paid || order.date_completed || order.date_created || new Date().toISOString();
          const metaTracking = extractTrackingFromOrderMeta(order);

          const customerResult = await resolveCustomerForOrder({
            sourceChannel,
            order,
            isPurchasedOrder,
          });

          if (!customerResult.customerId) continue;

          if (customerResult.inserted) insertedCustomers += 1;
          if (customerResult.updated) updatedCustomers += 1;
          touchedCustomerIds.add(customerResult.customerId);

          const journeyTracking = await findJourneyAttributionByOrder(
            client,
            customerResult.customerId,
            String(order.id),
            purchaseDate
          );
          const orderLevelAttribution = buildFinalAttribution({
            metaTracking,
            journeyTracking,
            clickTracking: null,
          });

          await upsertOrderStatusJourneyEvent({
            customerId: customerResult.customerId,
            order,
            sourceChannel,
            attribution: orderLevelAttribution,
            purchaseDate,
          });

          const existingByOrderId = await client.query(
            `SELECT id, id_campaign, id_run, id_email_message
             FROM customer_purchases
             WHERE id_customer = $1
               AND order_id = $2
             ORDER BY id DESC`,
            [customerResult.customerId, String(order.id)]
          );

          if (existingByOrderId.rows.length > 0 && onlyMissing) {
            const hasEnrichmentData = Boolean(
              orderLevelAttribution.campaignId
              || orderLevelAttribution.runId
              || orderLevelAttribution.emailMessageId
            );

            if (hasEnrichmentData) {
              const enriched = await client.query(
                `UPDATE customer_purchases
                 SET
                   id_campaign = COALESCE(id_campaign, $1::bigint),
                   id_run = COALESCE(id_run, $2::integer),
                   id_email_message = COALESCE(id_email_message, $3::bigint)
                 WHERE id_customer = $4
                   AND order_id = $5
                   AND (
                     (id_campaign IS NULL AND $1::bigint IS NOT NULL)
                     OR (id_run IS NULL AND $2::integer IS NOT NULL)
                     OR (id_email_message IS NULL AND $3::bigint IS NOT NULL)
                   )`,
                [
                  orderLevelAttribution.campaignId,
                  orderLevelAttribution.runId,
                  orderLevelAttribution.emailMessageId,
                  customerResult.customerId,
                  String(order.id),
                ]
              );
              enrichedExistingPurchases += enriched.rowCount || 0;
              if (orderLevelAttribution.campaignId) touchedCampaignIds.add(orderLevelAttribution.campaignId);
            }

            skippedExistingPurchases += existingByOrderId.rows.length;
            continue;
          }

          for (const lineItem of order.line_items || []) {
            processedLineItems += 1;
            const lineItemProductId = ctx.getLineItemProductId(lineItem);

            const ensuredCourse = await ctx.ensureCourseFromLineItem(client, userId, lineItem, productCache);
            if (ensuredCourse.inserted) insertedCourses += 1;
            if (ensuredCourse.updated) updatedCourses += 1;

            const unitPrice = ctx.parseMoney(lineItem.price);
            const quantity = parseInt(lineItem.quantity || 1, 10) || 1;
            const lineTotal = ctx.parseMoney(lineItem.total, unitPrice * quantity);
            const productName = ctx.toNullableText(lineItem.name) || `Order #${order.id} item`;
            const currency = ctx.toNullableText(order.currency) || 'VND';
            const normalizedOrderStatus = isInterestedOrder ? 'on-hold' : 'completed';
            const paymentMethod =
              ctx.toNullableText(order.payment_method) || ctx.toNullableText(order.payment_method_title);

            const attribution = await ctx.findClickAttribution(
              client,
              customerResult.customerId,
              lineItem,
              purchaseDate
            );
            const attributedEmailMessageId = attribution?.emailMessageId || null;
            const attributedFromClick = !!attribution;
            const finalAttribution = buildFinalAttribution({
              metaTracking,
              journeyTracking,
              clickTracking: attribution,
            });

            const existingPurchase = await client.query(
              `SELECT id, id_campaign
               FROM customer_purchases
               WHERE id_customer = $1
                 AND order_id = $2
                 AND product_name = $3
               LIMIT 1`,
              [customerResult.customerId, String(order.id), productName]
            );

            if (existingPurchase.rows.length === 0) {
              if (hasOrderStatusColumn) {
                await client.query(
                  `INSERT INTO customer_purchases (
                      id_customer, id_course, product_name, product_type,
                      amount, currency, purchase_date, order_id, order_status, payment_method,
                      id_campaign, id_run, id_email_message
                   ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
                  [
                    customerResult.customerId,
                    ensuredCourse.courseId,
                    productName,
                    purchaseStage,
                    lineTotal,
                    currency,
                    purchaseDate,
                    String(order.id),
                    normalizedOrderStatus,
                    paymentMethod,
                    finalAttribution.campaignId,
                    finalAttribution.runId,
                    finalAttribution.emailMessageId,
                  ]
                );
              } else {
                await client.query(
                  `INSERT INTO customer_purchases (
                      id_customer, id_course, product_name, product_type,
                      amount, currency, purchase_date, order_id, payment_method,
                      id_campaign, id_run, id_email_message
                   ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                  [
                    customerResult.customerId,
                    ensuredCourse.courseId,
                    productName,
                    purchaseStage,
                    lineTotal,
                    currency,
                    purchaseDate,
                    String(order.id),
                    paymentMethod,
                    finalAttribution.campaignId,
                    finalAttribution.runId,
                    finalAttribution.emailMessageId,
                  ]
                );
              }
              insertedPurchases += 1;
              if (finalAttribution.campaignId) {
                attributedPurchases += 1;
                touchedCampaignIds.add(finalAttribution.campaignId);
              }
            } else {
              if (existingPurchase.rows[0]?.id_campaign) {
                touchedCampaignIds.add(existingPurchase.rows[0].id_campaign);
              }

              if (onlyMissing) {
                skippedExistingPurchases += 1;
              } else {
                if (hasOrderStatusColumn) {
                  await client.query(
                    `UPDATE customer_purchases
                     SET
                       id_course = COALESCE($1, id_course),
                       product_type = COALESCE($2, product_type),
                       amount = $3,
                       currency = COALESCE($4, currency),
                       purchase_date = COALESCE($5, purchase_date),
                       order_status = COALESCE($6, order_status),
                       payment_method = COALESCE($7, payment_method),
                       id_campaign = COALESCE(id_campaign, $8),
                       id_run = COALESCE(id_run, $9),
                       id_email_message = COALESCE(id_email_message, $10)
                     WHERE id = $11`,
                    [
                      ensuredCourse.courseId,
                      purchaseStage,
                      lineTotal,
                      currency,
                      purchaseDate,
                      normalizedOrderStatus,
                      paymentMethod,
                      finalAttribution.campaignId,
                      finalAttribution.runId,
                      finalAttribution.emailMessageId,
                      existingPurchase.rows[0].id,
                    ]
                  );
                } else {
                  await client.query(
                    `UPDATE customer_purchases
                     SET
                       id_course = COALESCE($1, id_course),
                       product_type = COALESCE($2, product_type),
                       amount = $3,
                       currency = COALESCE($4, currency),
                       purchase_date = COALESCE($5, purchase_date),
                       payment_method = COALESCE($6, payment_method),
                       id_campaign = COALESCE(id_campaign, $7),
                       id_run = COALESCE(id_run, $8),
                       id_email_message = COALESCE(id_email_message, $9)
                     WHERE id = $10`,
                    [
                      ensuredCourse.courseId,
                      purchaseStage,
                      lineTotal,
                      currency,
                      purchaseDate,
                      paymentMethod,
                      finalAttribution.campaignId,
                      finalAttribution.runId,
                      finalAttribution.emailMessageId,
                      existingPurchase.rows[0].id,
                    ]
                  );
                }
                updatedPurchases += 1;

                if (!existingPurchase.rows[0]?.id_campaign && finalAttribution.campaignId) {
                  attributedPurchases += 1;
                }
                if (finalAttribution.campaignId) touchedCampaignIds.add(finalAttribution.campaignId);
              }
            }

            await ctx.upsertPurchaseJourneyEvent(client, {
              eventType: purchaseStage === 'interested' ? 'order_pending' : 'order_completed',
              customerId: customerResult.customerId,
              campaignId: finalAttribution.campaignId,
              emailMessageId: finalAttribution.emailMessageId || attributedEmailMessageId,
              runId: finalAttribution.runId,
              zaloMessageId: finalAttribution.zaloMessageId,
              orderId: String(order.id),
              // Với event đơn hàng, cố định productId=null để gom 1 event/order.
              productId: null,
              productName,
              purchaseDate,
              amount: lineTotal,
              currency,
              attributedFromClick,
              clickAt: attribution?.clickedAt || null,
              clickUrl: attribution?.targetUrl || null,
            });
          }
        }

        const totalPages = parseInt(response.headers['x-wp-totalpages'] || 1, 10);
        page += 1;
        hasMore = page <= totalPages;
      }

      for (const customerId of touchedCustomerIds) {
        await ctx.refreshCustomerPurchaseStats(client, customerId);
      }
      for (const campaignId of touchedCampaignIds) {
        await ctx.recalculateCampaignConversion(client, campaignId);
      }

      res.json({
        success: true,
        message: `Đồng bộ đơn hàng thành công. Đơn hợp lệ: ${processedOrders}, chi tiết mua: ${processedLineItems}`,
        data: {
          scannedOrders,
          processedOrders,
          processedLineItems,
          insertedPurchases,
          updatedPurchases,
          skippedExistingPurchases,
          enrichedExistingPurchases,
          skippedBySource,
          skippedOutOfRange,
          insertedCustomers,
          updatedCustomers,
          insertedCourses,
          updatedCourses,
          attributedPurchases,
          affectedCampaigns: touchedCampaignIds.size,
          productsFetched: Object.keys(productCache).length,
          appliedFilter: {
            status: normalizedStatus || 'completed,on-hold',
            sources: Array.from(allowedSources),
            onlyMissing,
            startDate: startBoundary ? startBoundary.toISOString() : null,
            endDate: endBoundary ? endBoundary.toISOString() : null,
            days:
              startBoundary && endBoundary
                ? Math.floor((endBoundary.getTime() - startBoundary.getTime()) / (24 * 60 * 60 * 1000)) + 1
                : null,
          },
        },
      });
    } catch (error) {
      console.error('Sync UKNOW orders error:', error.response?.data || error.message);
      res.status(500).json({
        success: false,
        message: 'Khong the dong bo don hang tu UKNOW',
      });
    } finally {
      client.release();
    }
  }

  /**
   * Sync one order from UKNOW API.
   */
  async syncOrder(ctx, req, res) {
    const client = await db.getClient();

    try {
      const userId = req.user.id;
      const { orderId } = req.params;
      if (!orderId || Number.isNaN(parseInt(orderId, 10))) {
        return res.status(400).json({ success: false, message: 'Mã đơn hàng không hợp lệ' });
      }

      const hasOrderStatusColumn = await ctx.hasPurchaseOrderStatusColumn();

      const response = await axios.get(`${ctx.baseUrl}/wc/v3/orders/${orderId}`, {
        headers: ctx.getAuthHeaders(),
      });

      const order = response.data;
      const rawStatus = String(order?.status || '').toLowerCase();
      const orderStatus = rawStatus === 'onhold' ? 'on-hold' : rawStatus;
      const isPurchasedOrder = orderStatus === 'completed';
      const isInterestedOrder = orderStatus === 'on-hold';

      if (!isPurchasedOrder && !isInterestedOrder) {
        return res.status(422).json({
          success: false,
          message: `Trạng thái đơn hàng '${orderStatus}' không được hỗ trợ (chỉ xử lý: on-hold, completed)`,
        });
      }

      // Quy ước mới: đơn hoàn thành lưu product_type = "complete".
      const purchaseStage = isPurchasedOrder ? 'complete' : 'interested';
      const statusLabel = isPurchasedOrder ? 'Đã đặt thành công' : 'Quan tâm';
      const purchaseDate = order.date_paid || order.date_completed || order.date_created || new Date().toISOString();

      const customerResult = await ctx.upsertCustomer(client, userId, {
        email: order.billing?.email,
        phone: order.billing?.phone,
        fullName: ctx.formatName(order.billing?.first_name, order.billing?.last_name),
        customerSource: 'uknow_campaign',
        hasPurchased: isPurchasedOrder,
      });

      if (!customerResult.customerId) {
        return res.status(422).json({ success: false, message: 'Không thể xác định khách hàng từ đơn hàng này' });
      }

      const touchedCampaignIds = new Set();
      let insertedPurchases = 0;
      let updatedPurchases = 0;
      let insertedCourses = 0;
      let updatedCourses = 0;
      const lineItemsSummary = [];
      const productCache = {};

      for (const lineItem of order.line_items || []) {
        const lineItemProductId = ctx.getLineItemProductId(lineItem);
        const ensuredCourse = await ctx.ensureCourseFromLineItem(client, userId, lineItem, productCache);
        if (ensuredCourse.inserted) insertedCourses += 1;
        if (ensuredCourse.updated) updatedCourses += 1;

        const unitPrice = ctx.parseMoney(lineItem.price);
        const quantity = parseInt(lineItem.quantity || 1, 10) || 1;
        const lineTotal = ctx.parseMoney(lineItem.total, unitPrice * quantity);
        const productName = ctx.toNullableText(lineItem.name) || `Order #${order.id} item`;
        const currency = ctx.toNullableText(order.currency) || 'VND';
        const paymentMethod =
          ctx.toNullableText(order.payment_method) || ctx.toNullableText(order.payment_method_title);

        const attribution = await ctx.findClickAttribution(
          client,
          customerResult.customerId,
          lineItem,
          purchaseDate
        );
        const attributedCampaignId = attribution?.campaignId || null;
        const attributedEmailMessageId = attribution?.emailMessageId || null;
        const attributedFromClick = !!attribution;

        const existingPurchase = await client.query(
          `SELECT id, id_campaign
           FROM customer_purchases
           WHERE id_customer = $1
             AND order_id = $2
             AND product_name = $3
           LIMIT 1`,
          [customerResult.customerId, String(order.id), productName]
        );

        if (existingPurchase.rows.length === 0) {
          if (hasOrderStatusColumn) {
            await client.query(
              `INSERT INTO customer_purchases (
                  id_customer, id_course, product_name, product_type,
                  amount, currency, purchase_date, order_id, order_status, payment_method, id_campaign
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
              [
                customerResult.customerId,
                ensuredCourse.courseId,
                productName,
                purchaseStage,
                lineTotal,
                currency,
                purchaseDate,
                String(order.id),
                orderStatus,
                paymentMethod,
                attributedCampaignId,
              ]
            );
          } else {
            await client.query(
              `INSERT INTO customer_purchases (
                  id_customer, id_course, product_name, product_type,
                  amount, currency, purchase_date, order_id, payment_method, id_campaign
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [
                customerResult.customerId,
                ensuredCourse.courseId,
                productName,
                purchaseStage,
                lineTotal,
                currency,
                purchaseDate,
                String(order.id),
                paymentMethod,
                attributedCampaignId,
              ]
            );
          }
          insertedPurchases += 1;
          if (attributedCampaignId) touchedCampaignIds.add(attributedCampaignId);
        } else {
          if (existingPurchase.rows[0]?.id_campaign) {
            touchedCampaignIds.add(existingPurchase.rows[0].id_campaign);
          }

          if (hasOrderStatusColumn) {
            await client.query(
              `UPDATE customer_purchases
               SET
                 id_course = COALESCE($1, id_course),
                 product_type = $2,
                 amount = $3,
                 currency = COALESCE($4, currency),
                 purchase_date = COALESCE($5, purchase_date),
                 order_status = $6,
                 payment_method = COALESCE($7, payment_method),
                 id_campaign = COALESCE(id_campaign, $8)
               WHERE id = $9`,
              [
                ensuredCourse.courseId,
                purchaseStage,
                lineTotal,
                currency,
                purchaseDate,
                orderStatus,
                paymentMethod,
                attributedCampaignId,
                existingPurchase.rows[0].id,
              ]
            );
          } else {
            await client.query(
              `UPDATE customer_purchases
               SET
                 id_course = COALESCE($1, id_course),
                 product_type = $2,
                 amount = $3,
                 currency = COALESCE($4, currency),
                 purchase_date = COALESCE($5, purchase_date),
                 payment_method = COALESCE($6, payment_method),
                 id_campaign = COALESCE(id_campaign, $7)
               WHERE id = $8`,
              [
                ensuredCourse.courseId,
                purchaseStage,
                lineTotal,
                currency,
                purchaseDate,
                paymentMethod,
                attributedCampaignId,
                existingPurchase.rows[0].id,
              ]
            );
          }
          updatedPurchases += 1;
          if (attributedCampaignId) touchedCampaignIds.add(attributedCampaignId);
        }

        await ctx.upsertPurchaseJourneyEvent(client, {
          eventType: purchaseStage === 'interested' ? 'order_pending' : 'order_completed',
          customerId: customerResult.customerId,
          campaignId: attributedCampaignId,
          emailMessageId: attributedEmailMessageId,
          runId: null,
          zaloMessageId: null,
          orderId: String(order.id),
          // Với event đơn hàng, cố định productId=null để gom 1 event/order.
          productId: null,
          productName,
          purchaseDate,
          amount: lineTotal,
          currency,
          attributedFromClick,
          clickAt: attribution?.clickedAt || null,
          clickUrl: attribution?.targetUrl || null,
        });

        lineItemsSummary.push({ productName, productId: lineItemProductId, amount: lineTotal, currency });
      }

      await ctx.refreshCustomerPurchaseStats(client, customerResult.customerId);
      for (const campaignIdItem of touchedCampaignIds) {
        await ctx.recalculateCampaignConversion(client, campaignIdItem);
      }

      res.json({
        success: true,
        message: `Đồng bộ đơn hàng #${order.id} thành công — ${statusLabel}`,
        data: {
          orderId: order.id,
          orderStatus,
          statusLabel,
          customerId: customerResult.customerId,
          insertedPurchases,
          updatedPurchases,
          insertedCourses,
          updatedCourses,
          affectedCampaigns: touchedCampaignIds.size,
          lineItems: lineItemsSummary,
        },
      });
    } catch (error) {
      const status = error.response?.status;
      if (status === 404) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
      }
      console.error('Sync UKNOW single order error:', error.response?.data || error.message);
      res.status(500).json({ success: false, message: 'Không thể đồng bộ đơn hàng từ UKNOW' });
    } finally {
      client.release();
    }
  }

  /**
   * Sync UKNOW status to campaign_customers for one campaign.
   */
  async syncCampaignUknow(ctx, req, res) {
    const client = await db.getClient();

    try {
      const userId = req.user.id;
      const campaignId = parseInt(req.params.id, 10);

      if (!Number.isFinite(campaignId)) {
        return res.status(400).json({ success: false, message: 'Campaign ID không hợp lệ' });
      }

      const campaignCheck = await client.query(
        'SELECT id FROM campaigns WHERE id = $1 AND id_user = $2 LIMIT 1',
        [campaignId, userId]
      );
      if (campaignCheck.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy chiến dịch' });
      }

      await ctx.ensureUknowStatusColumn();

      const campaignCustomersResult = await client.query(
        `SELECT c.id, c.email, c.phone
         FROM campaign_customers cc
         JOIN customers c ON c.id = cc.id_customer
         WHERE cc.id_campaign = $1`,
        [campaignId]
      );

      const campaignCustomers = campaignCustomersResult.rows;
      let synced = 0;
      let unchanged = 0;
      let skipped = 0;

      for (const customer of campaignCustomers) {
        const email = ctx.toNullableText(customer.email)?.toLowerCase() || null;
        const phone = ctx.toNullableText(customer.phone) || null;

        if (!email && !phone) {
          skipped += 1;
          continue;
        }

        let orders = [];
        if (email) {
          try {
            const resp = await axios.get(`${ctx.baseUrl}/wc/v3/orders`, {
              headers: ctx.getAuthHeaders(),
              params: {
                billing_email: email,
                per_page: 100,
                status: 'completed,processing,on-hold',
              },
            });
            orders = resp.data || [];
          } catch (err) {
            console.error(`Lỗi khi lấy đơn hàng UKNOW cho email ${email}:`, err.message);
          }
        }

        if (orders.length === 0 && phone) {
          try {
            const resp = await axios.get(`${ctx.baseUrl}/wc/v3/orders`, {
              headers: ctx.getAuthHeaders(),
              params: {
                per_page: 100,
                status: 'completed,processing,on-hold',
                search: phone,
              },
            });
            orders = (resp.data || []).filter((o) => {
              const billingPhone = ctx.toNullableText(o.billing?.phone) || '';
              return billingPhone === phone;
            });
          } catch (err) {
            console.error(`Lỗi khi lấy đơn hàng UKNOW cho phone ${phone}:`, err.message);
          }
        }

        let newStatus = null;
        for (const order of orders) {
          const s = String(order.status || '').toLowerCase().replace('onhold', 'on-hold');
          if (s === 'completed' || s === 'processing') {
            newStatus = 'purchased';
            break;
          }
          if (s === 'on-hold') {
            newStatus = 'lead';
          }
        }

        if (newStatus) {
          await client.query(
            `UPDATE campaign_customers
             SET uknow_status = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id_campaign = $2 AND id_customer = $3`,
            [newStatus, campaignId, customer.id]
          );
          synced += 1;
        } else {
          unchanged += 1;
        }
      }

      res.json({
        success: true,
        message: `Đồng bộ hoàn tất. Đã cập nhật: ${synced}, không thay đổi: ${unchanged}${skipped ? `, bỏ qua: ${skipped}` : ''}`,
        data: {
          synced,
          unchanged,
          skipped,
          total: campaignCustomers.length,
        },
      });
    } catch (error) {
      console.error('Lỗi đồng bộ UKNOW chiến dịch:', error.response?.data || error.message);
      res.status(500).json({ success: false, message: 'Lỗi khi đồng bộ từ UKNOW' });
    } finally {
      client.release();
    }
  }
}

export default new UknowSyncService();
