import db from '../../config/database.js';

class CustomerMutationService {
  async create(ctx, req, res) {
    try {
      const userId = req.user.id;
      const { email, phone, fullName, gender, customerSource, notes } = req.body;
      const normalizedCustomerSource = ctx.normalizeCustomerSource(customerSource);

      if (customerSource && !normalizedCustomerSource) {
        return res.status(400).json({
          success: false,
          message: 'Nguon khach hang khong hop le. Chi cho phep: Founder AI, uknow_campaign',
        });
      }

      const result = await db.query(
        `INSERT INTO customers (id_user, email, phone, full_name, gender, customer_source, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [userId, email, phone, fullName, gender, normalizedCustomerSource, notes]
      );

      const customer = result.rows[0];
      return res.status(201).json({
        success: true,
        message: 'Tạo khách hàng thành công',
        data: {
          id: customer.id,
          email: customer.email,
          phone: customer.phone,
          fullName: customer.full_name,
        },
      });
    } catch (error) {
      console.error('Create customer error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    }
  }

  async bulkUpsert(ctx, req, res) {
    const client = await db.getClient();

    try {
      const userId = req.user.id;
      const { items, campaignId } = req.body || {};
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu danh sách khách hàng',
        });
      }

      const normalizeString = (value) => {
        const s = value === null || value === undefined ? '' : String(value).trim();
        return s.length ? s : null;
      };
      const normalizeGender = (value) => {
        const raw = normalizeString(value);
        if (!raw) return null;
        const s = raw.toLowerCase();
        if (['male', 'm', 'nam', 'ong', 'ông', '1'].includes(s)) return 'male';
        if (['female', 'f', 'nu', 'nữ', 'ba', 'bà', '0'].includes(s)) return 'female';
        if (['other', 'khac', 'khác'].includes(s)) return 'other';
        return null;
      };
      const parseJsonObject = (value) => {
        if (!value) return null;
        if (typeof value === 'object' && !Array.isArray(value)) return value;
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
          } catch {
            return null;
          }
        }
        return null;
      };

      const campaignIdNum = parseInt(campaignId, 10);
      await client.query('BEGIN');

      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      let campaignLinked = 0;

      for (const raw of items) {
        const item = raw || {};
        const email = normalizeString(item.email);
        const phone = normalizeString(item.phone);
        const zaloId = normalizeString(item.zaloId || item.zalo_id);

        if (!email && !phone && !zaloId) {
          skipped += 1;
          continue;
        }

        const participationCampaignId = Number.isFinite(campaignIdNum) ? campaignIdNum : null;
        const customer = {
          email,
          phone,
          zaloId,
          zaloPhone: normalizeString(item.zaloPhone || item.zalo_phone),
          facebookId: normalizeString(item.facebookId || item.facebook_id),
          fullName: normalizeString(item.fullName || item.full_name),
          gender: normalizeGender(item.gender),
          customerSource:
            ctx.normalizeCustomerSource(item.customerSource || item.customer_source) ||
            (Number.isFinite(participationCampaignId) ? 'uknow_campaign' : null),
          sourceLandingPage: normalizeString(item.sourceLandingPage || item.source_landing_page),
          sourceFormId: normalizeString(item.sourceFormId || item.source_form_id),
          utmSource: normalizeString(item.utmSource || item.utm_source),
          utmMedium: normalizeString(item.utmMedium || item.utm_medium),
          utmCampaign: normalizeString(item.utmCampaign || item.utm_campaign),
          notes: normalizeString(item.notes),
          customFields: parseJsonObject(item.customFields || item.custom_fields),
        };

        let existingId = null;
        if (email && phone) {
          const existing = await client.query(
            `SELECT id FROM customers
             WHERE id_user = $1 AND email = $2 AND phone = $3
             LIMIT 1`,
            [userId, email, phone]
          );
          existingId = existing.rows[0]?.id || null;
        } else if (email && !phone) {
          const existing = await client.query(
            `SELECT id FROM customers
             WHERE id_user = $1 AND email = $2 AND phone IS NULL
             LIMIT 1`,
            [userId, email]
          );
          existingId = existing.rows[0]?.id || null;
        } else if (!email && phone) {
          const existing = await client.query(
            `SELECT id FROM customers
             WHERE id_user = $1 AND phone = $2 AND email IS NULL
             LIMIT 1`,
            [userId, phone]
          );
          existingId = existing.rows[0]?.id || null;
        } else if (zaloId) {
          const existing = await client.query(
            `SELECT id FROM customers
             WHERE id_user = $1 AND zalo_id = $2
             LIMIT 1`,
            [userId, zaloId]
          );
          existingId = existing.rows[0]?.id || null;
        }

        if (existingId) {
          await client.query(
            `UPDATE customers SET
              email = COALESCE($1, email),
              phone = COALESCE($2, phone),
              zalo_id = COALESCE($3, zalo_id),
              zalo_phone = COALESCE($4, zalo_phone),
              facebook_id = COALESCE($5, facebook_id),
              full_name = COALESCE($6, full_name),
              gender = COALESCE($7, gender),
              customer_source = COALESCE($8, customer_source),
              source_landing_page = COALESCE($9, source_landing_page),
              source_form_id = COALESCE($10, source_form_id),
              utm_source = COALESCE($11, utm_source),
              utm_medium = COALESCE($12, utm_medium),
              utm_campaign = COALESCE($13, utm_campaign),
              notes = COALESCE($14, notes),
              custom_fields = COALESCE($15, custom_fields),
              updated_at = CURRENT_TIMESTAMP
             WHERE id = $16 AND id_user = $17`,
            [
              customer.email,
              customer.phone,
              customer.zaloId,
              customer.zaloPhone,
              customer.facebookId,
              customer.fullName,
              customer.gender,
              customer.customerSource,
              customer.sourceLandingPage,
              customer.sourceFormId,
              customer.utmSource,
              customer.utmMedium,
              customer.utmCampaign,
              customer.notes,
              customer.customFields ? JSON.stringify(customer.customFields) : null,
              existingId,
              userId,
            ]
          );
          updated += 1;

          if (Number.isFinite(participationCampaignId)) {
            await ctx.ensureCampaignParticipation(client, participationCampaignId, existingId);
            campaignLinked += 1;
          }
        } else {
          const insertResult = await client.query(
            `INSERT INTO customers
              (id_user, email, phone, zalo_id, zalo_phone, facebook_id, full_name, gender,
               customer_source, source_landing_page, source_form_id, utm_source, utm_medium, utm_campaign, notes, custom_fields)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             RETURNING id`,
            [
              userId,
              customer.email,
              customer.phone,
              customer.zaloId,
              customer.zaloPhone,
              customer.facebookId,
              customer.fullName,
              customer.gender,
              customer.customerSource,
              customer.sourceLandingPage,
              customer.sourceFormId,
              customer.utmSource,
              customer.utmMedium,
              customer.utmCampaign,
              customer.notes,
              customer.customFields ? JSON.stringify(customer.customFields) : null,
            ]
          );
          const insertedCustomerId = insertResult.rows[0]?.id || null;

          if (Number.isFinite(participationCampaignId) && Number.isFinite(parseInt(insertedCustomerId, 10))) {
            await ctx.ensureCampaignParticipation(client, participationCampaignId, insertedCustomerId);
            campaignLinked += 1;
          }
          inserted += 1;
        }
      }

      await client.query('COMMIT');
      res.json({
        success: true,
        message: 'Lưu khách hàng thành công',
        data: { inserted, updated, skipped, campaignLinked, total: items.length },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Bulk upsert customers error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    } finally {
      client.release();
    }
  }

  async update(ctx, req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { email, phone, fullName, gender, customerSource, notes, customFields } = req.body;
      const normalizedCustomerSource = ctx.normalizeCustomerSource(customerSource);

      if (customerSource && !normalizedCustomerSource) {
        return res.status(400).json({
          success: false,
          message: 'Nguon khach hang khong hop le. Chi cho phep: Founder AI, uknow_campaign',
        });
      }

      const existing = await db.query('SELECT id FROM customers WHERE id = $1 AND id_user = $2', [id, userId]);
      if (existing.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy khách hàng',
        });
      }

      const result = await db.query(
        `UPDATE customers SET
          email = COALESCE($1, email),
          phone = COALESCE($2, phone),
          full_name = COALESCE($3, full_name),
          gender = COALESCE($4, gender),
          customer_source = COALESCE($5, customer_source),
          notes = COALESCE($6, notes),
          custom_fields = COALESCE($7, custom_fields),
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $8 AND id_user = $9
         RETURNING *`,
        [
          email,
          phone,
          fullName,
          gender,
          normalizedCustomerSource,
          notes,
          customFields ? JSON.stringify(customFields) : null,
          id,
          userId,
        ]
      );

      res.json({
        success: true,
        message: 'Cập nhật khách hàng thành công',
        data: {
          id: result.rows[0].id,
          email: result.rows[0].email,
          fullName: result.rows[0].full_name,
        },
      });
    } catch (error) {
      console.error('Update customer error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    }
  }

  async delete(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const result = await db.query('DELETE FROM customers WHERE id = $1 AND id_user = $2 RETURNING id', [id, userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy khách hàng',
        });
      }

      res.json({
        success: true,
        message: 'Xóa khách hàng thành công',
      });
    } catch (error) {
      console.error('Delete customer error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    }
  }
}

export default new CustomerMutationService();
