import db from '../../config/database.js';
import customerEmailTrackingRepository from '../../repositories/customer/customerEmailTracking.repository.js';

class CustomerEmailTrackingService {
  async trackEmailOpen({ token, clientIp, userAgent, referer }) {
    if (!token) return;
    const client = await db.getClient();

    try {

      await client.query('BEGIN');

      const message = await customerEmailTrackingRepository.updateEmailMessageOnOpen(client, token);

      if (message) {

        console.info('[email-open-pixel] tracked', {
          token,
          emailMessageId: message.id,
          campaignId: message.id_campaign,
          customerId: message.id_customer,
          clientIp,
          userAgent,
        });

        if (message.id_customer) {
          await customerEmailTrackingRepository.touchCustomerEmailOpenedAt(client, message.id_customer);
        }

        if (message.id_campaign && message.id_customer) {
          await customerEmailTrackingRepository.upsertCampaignCustomerOpen(client, message.id_campaign, message.id_customer);

          await customerEmailTrackingRepository.upsertCampaignParticipation(client, message.id_customer, message.id_campaign, message.id_run || null);

          await customerEmailTrackingRepository.incrementCampaignTotalOpened(client, message.id_campaign);
        }

        if (message.id_customer) {
          const alreadyOpened = await customerEmailTrackingRepository.hasJourneyEmailOpened(client, message.id, message.id_customer);
          if (!alreadyOpened) {
            await customerEmailTrackingRepository.insertJourneyEvent(client, {
              customerId: message.id_customer,
              campaignId: message.id_campaign,
              runId: message.id_run || null,
              eventType: 'email_opened',
              eventChannel: 'email',
              emailMessageId: message.id,
              eventData: {
                trackingToken: token,
                description: 'Khach hang da mo email',
              },
            });
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
  async trackEmailUnsubscribe({ token, privacyPolicyUrl }) {

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
      return { statusCode: 400, html: confirmHtml('Liên kết không hợp lệ', {
        headingVi: 'Liên kết không hợp lệ',
        textVi: 'Liên kết hủy đăng ký không hợp lệ hoặc đã hết hạn.',
        headingEn: 'Invalid link',
        textEn: 'The unsubscribe link is invalid or has expired.',
      }) };
    }

    // Chỉ checkout client sau khi token hợp lệ — tránh rò rỉ kết nối khi return sớm ở trên.
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const message = await customerEmailTrackingRepository.findEmailMessageByToken(client, token);

      if (!message) {
        await client.query('ROLLBACK');
        return { statusCode: 200, html: confirmHtml('Đã hủy đăng ký', {
          headingVi: 'Đã hủy đăng ký nhận email',
          textVi: 'Bạn sẽ không nhận được email từ chúng tôi nữa.',
          headingEn: 'Unsubscribed successfully',
          textEn: 'You will no longer receive emails from us.',
        }) };
      }

      await customerEmailTrackingRepository.setEmailMessageUnsubscribed(client, token);

      if (message.id_customer) {
        await customerEmailTrackingRepository.unsubscribeCustomerEmail(client, message.id_customer);

        const alreadyUnsubscribed = await customerEmailTrackingRepository.hasJourneyEmailUnsubscribed(client, message.id, message.id_customer);
        if (!alreadyUnsubscribed) {
          await customerEmailTrackingRepository.insertJourneyEvent(client, {
            customerId: message.id_customer,
            campaignId: message.id_campaign,
            runId: message.id_run || null,
            eventType: 'email_unsubscribed',
            eventChannel: 'email',
            emailMessageId: message.id,
            eventData: {
              trackingToken: token,
              description: 'Khách hàng đã hủy đăng ký nhận email',
            },
          });
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

    return { statusCode: 200, html: confirmHtml('Đã hủy đăng ký', {
      headingVi: 'Đã hủy đăng ký nhận email',
      textVi: 'Yêu cầu của bạn đã được ghi nhận. Bạn sẽ không nhận được email từ chúng tôi nữa.',
      headingEn: 'Unsubscribed successfully',
      textEn: 'Your request has been recorded. You will no longer receive emails from us.',
    }) };
  }

  async trackEmailClick({ token, rawUrl, label, linkKey }) {
    const client = await db.getClient();

    const defaultRedirect = process.env.FRONTEND_URL || 'http://localhost:5173';
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

    try {
      if (!token) return { redirectUrl };

      await client.query('BEGIN');

      const message = await customerEmailTrackingRepository.findEmailMessageByTokenForUpdate(client, token);

      if (message) {

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

        await customerEmailTrackingRepository.updateEmailMessageOnClick(client, message.id);

        if (message.id_campaign && message.id_customer) {
          await customerEmailTrackingRepository.upsertCampaignCustomerClick(client, message.id_campaign, message.id_customer);

          await customerEmailTrackingRepository.upsertCampaignParticipation(client, message.id_customer, message.id_campaign, message.id_run || null);

          await customerEmailTrackingRepository.incrementCampaignTotalClicked(client, message.id_campaign);
        }

        if (message.id_customer) {
          const alreadyOpened = await customerEmailTrackingRepository.hasJourneyEmailOpened(client, message.id, message.id_customer);
          if (!alreadyOpened) {
            await customerEmailTrackingRepository.updateEmailMessageOnInferredOpen(client, message.id);
            if (message.id_campaign) {
              await customerEmailTrackingRepository.updateCampaignCustomerInferredOpen(client, message.id_campaign, message.id_customer);
            }
            await customerEmailTrackingRepository.insertJourneyEvent(client, {
              customerId: message.id_customer,
              campaignId: message.id_campaign,
              runId: message.id_run || null,
              eventType: 'email_opened',
              eventChannel: 'email',
              emailMessageId: message.id,
              eventData: { inferred: true, source: 'click', description: 'Mở email (suy ra từ click link)' },
            });
          }
        }

        if (message.id_customer) {
          const resolvedLinkKey = linkKey || redirectUrl;
          const alreadyClicked = await customerEmailTrackingRepository.hasJourneyEmailClicked(client, message.id, message.id_customer, resolvedLinkKey);
          if (!alreadyClicked) {
            await customerEmailTrackingRepository.insertJourneyEvent(client, {
              customerId: message.id_customer,
              campaignId: message.id_campaign,
              runId: message.id_run || null,
              eventType: 'email_clicked',
              eventChannel: 'email',
              emailMessageId: message.id,
              eventData: {
                trackingToken: token,
                targetUrl: redirectUrl,
                linkKey: resolvedLinkKey,
                label,
                description: 'Khách hàng đã click vào link trong email',
              },
            });
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

    return { redirectUrl };
  }
}

export default new CustomerEmailTrackingService();
