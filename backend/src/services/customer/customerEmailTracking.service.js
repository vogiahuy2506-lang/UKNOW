import db from '../../config/database.js';

class CustomerEmailTrackingService {
  async trackEmailOpen(ctx, req, res) {
    const client = await db.getClient();

    try {
      const token = String(req.params.token || '').trim();
      if (!token) return ctx.sendTrackingPixel(res);

      const clientIp =
        String(req.headers['x-forwarded-for'] || '')
          .split(',')[0]
          .trim() ||
        req.socket?.remoteAddress ||
        null;
      const userAgent = req.get('user-agent') || null;
      const referer = req.get('referer') || null;

      await client.query('BEGIN');

      const messageResult = await client.query(
        `UPDATE email_messages
         SET open_count = COALESCE(open_count, 0) + 1,
             first_opened_at = COALESCE(first_opened_at, CURRENT_TIMESTAMP),
             last_opened_at = CURRENT_TIMESTAMP,
             status = CASE
               WHEN status IN ('pending', 'queued', 'sent', 'delivered') THEN 'opened'
               ELSE status
             END
         WHERE tracking_token = $1
         RETURNING id, id_campaign, id_customer, id_run`,
        [token]
      );

      if (messageResult.rows.length > 0) {
        const message = messageResult.rows[0];

        console.info('[email-open-pixel] tracked', {
          token,
          emailMessageId: message.id,
          campaignId: message.id_campaign,
          customerId: message.id_customer,
          clientIp,
          userAgent,
        });

        if (message.id_customer) {
          await client.query(
            'UPDATE customers SET last_email_opened_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [message.id_customer]
          );
        }

        if (message.id_campaign && message.id_customer) {
          await client.query(
            `INSERT INTO campaign_customers (
              id_campaign, id_customer, joined_at,
              email_opened_count, has_opened,
              first_email_opened_at, last_email_opened_at,
              last_activity_at, updated_at
             )
             VALUES ($1, $2, CURRENT_TIMESTAMP, 1, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             ON CONFLICT (id_campaign, id_customer)
             DO UPDATE SET
               email_opened_count = campaign_customers.email_opened_count + 1,
               has_opened = TRUE,
               first_email_opened_at = COALESCE(campaign_customers.first_email_opened_at, CURRENT_TIMESTAMP),
               last_email_opened_at = CURRENT_TIMESTAMP,
               last_activity_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP`,
            [message.id_campaign, message.id_customer]
          );

          await client.query(
            `INSERT INTO campaign_participations (id_customer, id_campaign, id_run, joined_at)
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
             ON CONFLICT (id_customer, id_campaign)
             DO UPDATE SET id_run = COALESCE(EXCLUDED.id_run, campaign_participations.id_run)`,
            [message.id_customer, message.id_campaign, message.id_run || null]
          );

          await client.query(
            'UPDATE campaigns SET total_opened = COALESCE(total_opened, 0) + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [message.id_campaign]
          );
        }

        if (message.id_customer) {
          const existingOpen = await client.query(
            `SELECT 1 FROM customer_journey
             WHERE id_email_message = $1 AND id_customer = $2 AND event_type = 'email_opened'
             LIMIT 1`,
            [message.id, message.id_customer]
          );
          if (existingOpen.rows.length === 0) {
            await client.query(
              `INSERT INTO customer_journey (id_customer, id_campaign, id_run, event_type, event_channel, id_email_message, event_data, event_at)
               VALUES ($1, $2, $3, 'email_opened', 'email', $4, $5::jsonb, CURRENT_TIMESTAMP)`,
              [
                message.id_customer,
                message.id_campaign,
                message.id_run || null,
                message.id,
                JSON.stringify({
                  trackingToken: token,
                  description: 'Khach hang da mo email',
                }),
              ]
            );
          }
        }
      } else {
        console.info('[email-open-pixel] token-not-found', {
          token,
          clientIp,
          userAgent,
          referer,
        });
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Track email open error:', error);
    } finally {
      client.release();
    }

    return ctx.sendTrackingPixel(res);
  }

  /**
   * Xử lý yêu cầu hủy đăng ký email (unsubscribe) từ link trong email.
   *
   * Flow:
   * - Tra cứu email_message theo tracking_token
   * - Cập nhật customers: email_subscribed = false, email_unsubscribed_at = now
   * - Cập nhật email_messages: status = 'unsubscribed'
   * - Ghi customer_journey event 'email_unsubscribed'
   * - Trả về trang HTML xác nhận hủy đăng ký
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async trackEmailUnsubscribe(req, res) {
    const token = String(req.params.token || '').trim();
    const privacyPolicyUrl = String(process.env.PRIVACY_POLICY_URL || '').trim()
      || 'https://campaign.digiso.vn/privacy-policy';

    /**
     * Render trang phản hồi hủy đăng ký song ngữ Việt/Anh.
     *
     * Luồng hoạt động:
     * 1. In đồng thời nội dung tiếng Việt và tiếng Anh để người nhận tự đọc theo ngôn ngữ phù hợp.
     * 2. Giữ giao diện tối giản, không dùng icon để đồng bộ phong cách trang privacy mới.
    * 3. Thêm link chính sách bảo mật ưu tiên từ biến môi trường để dễ cấu hình theo domain triển khai.
     *
     * @param {string} title tiêu đề trang
     * @param {{headingVi: string, textVi: string, headingEn: string, textEn: string}} body nội dung song ngữ
     * @returns {string} HTML response
     */
    const confirmHtml = (title, body) => `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:Arial,sans-serif;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px}
  .card{background:#fff;border-radius:8px;padding:28px;max-width:560px;width:100%;box-shadow:0 2px 12px rgba(0,0,0,.08)}
  h1{font-size:22px;margin:0 0 8px 0;color:#1a1a1a}
  p{color:#555;font-size:15px;line-height:1.6;margin:0}
  .block{padding:12px 0}
  .block + .block{border-top:1px solid #e5e7eb}
  .lang-label{display:inline-block;font-size:12px;font-weight:700;color:#6b7280;margin-bottom:6px}
  .helper{margin-top:14px;font-size:13px;color:#6b7280}
  .helper a{color:#4b5563;text-decoration:underline}
</style>
</head>
<body>
  <div class="card">
    <div class="block">
      <span class="lang-label">Tiếng Việt</span>
      <h1>${body.headingVi}</h1>
      <p>${body.textVi}</p>
    </div>
    <div class="block">
      <span class="lang-label">English</span>
      <h1>${body.headingEn}</h1>
      <p>${body.textEn}</p>
    </div>
    <p class="helper">
      <a href="${privacyPolicyUrl}">Chính sách bảo mật / Privacy Policy</a>
    </p>
  </div>
</body>
</html>`;

    if (!token) {
      return res.status(400).send(confirmHtml('Liên kết không hợp lệ', {
        headingVi: 'Liên kết không hợp lệ',
        textVi: 'Liên kết hủy đăng ký không hợp lệ hoặc đã hết hạn.',
        headingEn: 'Invalid link',
        textEn: 'The unsubscribe link is invalid or has expired.',
      }));
    }

    // Chỉ checkout client sau khi token hợp lệ — tránh rò rỉ kết nối khi return sớm ở trên.
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const messageResult = await client.query(
        `SELECT id, id_campaign, id_customer, id_run
         FROM email_messages
         WHERE tracking_token = $1
         LIMIT 1`,
        [token]
      );

      if (messageResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.send(confirmHtml('Đã hủy đăng ký', {
          headingVi: 'Đã hủy đăng ký nhận email',
          textVi: 'Bạn sẽ không nhận được email từ chúng tôi nữa.',
          headingEn: 'Unsubscribed successfully',
          textEn: 'You will no longer receive emails from us.',
        }));
      }

      const message = messageResult.rows[0];

      await client.query(
        `UPDATE email_messages
         SET status = 'unsubscribed'
         WHERE tracking_token = $1 AND status NOT IN ('unsubscribed')`,
        [token]
      );

      if (message.id_customer) {
        await client.query(
          `UPDATE customers
           SET email_subscribed = false,
               email_unsubscribed_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND (email_subscribed IS DISTINCT FROM false)`,
          [message.id_customer]
        );

        const existingEvent = await client.query(
          `SELECT 1 FROM customer_journey
           WHERE id_email_message = $1 AND id_customer = $2 AND event_type = 'email_unsubscribed'
           LIMIT 1`,
          [message.id, message.id_customer]
        );
        if (existingEvent.rows.length === 0) {
          await client.query(
            `INSERT INTO customer_journey (id_customer, id_campaign, id_run, event_type, event_channel, id_email_message, event_data, event_at)
             VALUES ($1, $2, $3, 'email_unsubscribed', 'email', $4, $5::jsonb, CURRENT_TIMESTAMP)`,
            [
              message.id_customer,
              message.id_campaign,
              message.id_run || null,
              message.id,
              JSON.stringify({
                trackingToken: token,
                description: 'Khách hàng đã hủy đăng ký nhận email',
              }),
            ]
          );
        }

        console.info('[email-unsubscribe] tracked', {
          token,
          emailMessageId: message.id,
          customerId: message.id_customer,
          campaignId: message.id_campaign,
        });
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[email-unsubscribe] error:', error);
    } finally {
      client.release();
    }

    return res.send(confirmHtml('Đã hủy đăng ký', {
      headingVi: 'Đã hủy đăng ký nhận email',
      textVi: 'Yêu cầu của bạn đã được ghi nhận. Bạn sẽ không nhận được email từ chúng tôi nữa.',
      headingEn: 'Unsubscribed successfully',
      textEn: 'Your request has been recorded. You will no longer receive emails from us.',
    }));
  }

  async trackEmailClick(req, res) {
    const client = await db.getClient();

    const defaultRedirect = process.env.FRONTEND_URL || 'http://localhost:5173';
    const token = String(req.params.token || '').trim();
    const rawUrl = String(req.query.url || '').trim();
    let redirectUrl = defaultRedirect;

    if (rawUrl) {
      try {
        const decoded = decodeURIComponent(rawUrl);
        const parsed = new URL(decoded);
        if (['http:', 'https:'].includes(parsed.protocol)) {
          redirectUrl = parsed.toString();
        }
      } catch {
        redirectUrl = defaultRedirect;
      }
    }

    const label = String(req.query.label || '').trim().slice(0, 200) || null;
    const linkKey = String(req.query.lk || '').trim().slice(0, 120) || null;

    try {
      if (!token) return res.redirect(302, redirectUrl);

      await client.query('BEGIN');

      const messageResult = await client.query(
        `SELECT id, id_campaign, id_customer, id_run
         FROM email_messages
         WHERE tracking_token = $1
         FOR UPDATE`,
        [token]
      );

      if (messageResult.rows.length > 0) {
        const message = messageResult.rows[0];

        if (message.id_campaign && message.id_customer && redirectUrl !== defaultRedirect) {
          try {
            const u = new URL(redirectUrl);
            if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', 'email_campaign');
            if (!u.searchParams.has('utm_campaign')) u.searchParams.set('utm_campaign', String(message.id_campaign));
            if (!u.searchParams.has('utm_customer')) u.searchParams.set('utm_customer', String(message.id_customer));
            if (message.id_run && !u.searchParams.has('utm_id_run')) {
              u.searchParams.set('utm_id_run', String(message.id_run));
            }
            u.searchParams.set('utm_id_email', String(message.id));
            redirectUrl = u.toString();
          } catch {}
        }

        await client.query(
          `UPDATE email_messages
           SET click_count = COALESCE(click_count, 0) + 1,
               first_clicked_at = COALESCE(first_clicked_at, CURRENT_TIMESTAMP),
               status = CASE
                 WHEN status IN ('pending', 'queued', 'sent', 'delivered', 'opened') THEN 'clicked'
                 ELSE status
               END
           WHERE id = $1`,
          [message.id]
        );

        if (message.id_campaign && message.id_customer) {
          await client.query(
            `INSERT INTO campaign_customers (
              id_campaign, id_customer, joined_at,
              email_clicked_count, has_clicked,
              first_email_clicked_at, last_email_clicked_at,
              last_activity_at, updated_at
             )
             VALUES ($1, $2, CURRENT_TIMESTAMP, 1, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             ON CONFLICT (id_campaign, id_customer)
             DO UPDATE SET
               email_clicked_count = campaign_customers.email_clicked_count + 1,
               has_clicked = TRUE,
               first_email_clicked_at = COALESCE(campaign_customers.first_email_clicked_at, CURRENT_TIMESTAMP),
               last_email_clicked_at = CURRENT_TIMESTAMP,
               last_activity_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP`,
            [message.id_campaign, message.id_customer]
          );

          await client.query(
            `INSERT INTO campaign_participations (id_customer, id_campaign, id_run, joined_at)
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
             ON CONFLICT (id_customer, id_campaign)
             DO UPDATE SET id_run = COALESCE(EXCLUDED.id_run, campaign_participations.id_run)`,
            [message.id_customer, message.id_campaign, message.id_run || null]
          );

          await client.query(
            'UPDATE campaigns SET total_clicked = COALESCE(total_clicked, 0) + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [message.id_campaign]
          );
        }

        if (message.id_customer) {
          const existingOpen = await client.query(
            `SELECT 1 FROM customer_journey
             WHERE id_email_message = $1 AND id_customer = $2 AND event_type = 'email_opened'
             LIMIT 1`,
            [message.id, message.id_customer]
          );
          if (existingOpen.rows.length === 0) {
            await client.query(
              `UPDATE email_messages
               SET open_count = COALESCE(open_count, 0) + 1,
                   first_opened_at = COALESCE(first_opened_at, CURRENT_TIMESTAMP),
                   last_opened_at = CURRENT_TIMESTAMP,
                   status = CASE
                     WHEN status IN ('pending', 'queued', 'sent', 'delivered') THEN 'opened'
                     ELSE status
                   END
               WHERE id = $1`,
              [message.id]
            );
            if (message.id_campaign) {
              await client.query(
                `UPDATE campaign_customers
                 SET email_opened_count = COALESCE(email_opened_count, 0) + 1,
                     has_opened = TRUE,
                     first_email_opened_at = COALESCE(first_email_opened_at, CURRENT_TIMESTAMP),
                     last_email_opened_at = CURRENT_TIMESTAMP,
                     last_activity_at = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id_campaign = $1 AND id_customer = $2`,
                [message.id_campaign, message.id_customer]
              );
            }
            await client.query(
              `INSERT INTO customer_journey (id_customer, id_campaign, id_run, event_type, event_channel, id_email_message, event_data, event_at)
               VALUES ($1, $2, $3, 'email_opened', 'email', $4, $5::jsonb, CURRENT_TIMESTAMP)`,
              [
                message.id_customer,
                message.id_campaign,
                message.id_run || null,
                message.id,
                JSON.stringify({ inferred: true, source: 'click', description: 'Mở email (suy ra từ click link)' }),
              ]
            );
          }
        }

        if (message.id_customer) {
          const resolvedLinkKey = linkKey || redirectUrl;
          const existingClick = await client.query(
            `SELECT 1
             FROM customer_journey
             WHERE id_email_message = $1
               AND id_customer = $2
               AND event_type = 'email_clicked'
               AND (
                 COALESCE(event_data ->> 'linkKey', event_data ->> 'targetUrl', '') = $3
               )
             LIMIT 1`,
            [message.id, message.id_customer, resolvedLinkKey]
          );
          if (existingClick.rows.length === 0) {
            await client.query(
              `INSERT INTO customer_journey (id_customer, id_campaign, id_run, event_type, event_channel, id_email_message, event_data, event_at)
               VALUES ($1, $2, $3, 'email_clicked', 'email', $4, $5::jsonb, CURRENT_TIMESTAMP)`,
              [
                message.id_customer,
                message.id_campaign,
                message.id_run || null,
                message.id,
                JSON.stringify({
                  trackingToken: token,
                  targetUrl: redirectUrl,
                  linkKey: resolvedLinkKey,
                  label,
                  description: 'Khách hàng đã click vào link trong email',
                }),
              ]
            );
          }
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Track email click error:', error);
    } finally {
      client.release();
    }

    return res.redirect(302, redirectUrl);
  }
}

export default new CustomerEmailTrackingService();
