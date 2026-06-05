import db from '../../config/database.js';

class CustomerMutationRepository {
  async createCustomer(userId, payload) {
    const result = await db.query(
      `INSERT INTO customers (id_user, email, phone, full_name, gender, customer_source, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        userId,
        payload.email,
        payload.phone,
        payload.fullName,
        payload.gender,
        payload.customerSource,
        payload.notes,
      ]
    );
    return result.rows[0];
  }

  async withTransaction(callback) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findExistingCustomerId(client, userId, { email, phone, zaloId }) {
    let result = null;
    if (email && phone) {
      result = await client.query(
        `SELECT id FROM customers
         WHERE id_user = $1 AND email = $2 AND phone = $3
         LIMIT 1`,
        [userId, email, phone]
      );
    } else if (email && !phone) {
      result = await client.query(
        `SELECT id FROM customers
         WHERE id_user = $1 AND email = $2 AND phone IS NULL
         LIMIT 1`,
        [userId, email]
      );
    } else if (!email && phone) {
      result = await client.query(
        `SELECT id FROM customers
         WHERE id_user = $1 AND phone = $2 AND email IS NULL
         LIMIT 1`,
        [userId, phone]
      );
    } else if (zaloId) {
      result = await client.query(
        `SELECT id FROM customers
         WHERE id_user = $1 AND zalo_id = $2
         LIMIT 1`,
        [userId, zaloId]
      );
    }

    return result?.rows[0]?.id || null;
  }

  async updateBulkCustomer(client, userId, customerId, customer) {
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
        customerId,
        userId,
      ]
    );
  }

  async insertBulkCustomer(client, userId, customer) {
    const result = await client.query(
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
    return result.rows[0]?.id || null;
  }

  async findOwnedCustomer(id, userId) {
    const result = await db.query('SELECT id FROM customers WHERE id = $1 AND id_user = $2', [id, userId]);
    return result.rows[0] || null;
  }

  async updateCustomer(userId, id, payload) {
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
        payload.email,
        payload.phone,
        payload.fullName,
        payload.gender,
        payload.customerSource,
        payload.notes,
        payload.customFields ? JSON.stringify(payload.customFields) : null,
        id,
        userId,
      ]
    );
    return result.rows[0] || null;
  }

  async deleteCustomer(userId, id) {
    const result = await db.query(
      'DELETE FROM customers WHERE id = $1 AND id_user = $2 RETURNING id',
      [id, userId]
    );
    return result.rows[0] || null;
  }
}

export default new CustomerMutationRepository();
