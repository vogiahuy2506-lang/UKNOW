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

  async findZaloFriendCustomerByPhone(userId, phone) {
    const result = await db.query(
      `SELECT id
       FROM customers
       WHERE id_user = $1
         AND (phone = $2 OR zalo_phone = $2)
       ORDER BY id ASC
       LIMIT 1`,
      [userId, phone]
    );
    return result.rows[0]?.id ?? null;
  }

  async updateZaloFriendCustomerByPhone({
    userId,
    customerId,
    phone,
    uid,
    fullName,
    email,
  }) {
    await db.query(
      `UPDATE customers
       SET
         phone = COALESCE(NULLIF($1, ''), phone),
         zalo_phone = COALESCE(NULLIF($2, ''), zalo_phone),
         zalo_id = COALESCE(NULLIF($3, ''), zalo_id),
         full_name = COALESCE(NULLIF($4, ''), full_name),
         email = COALESCE(NULLIF($5, ''), email),
         customer_source = COALESCE(customer_source, 'uknow_campaign'),
         zalo_is_friend = TRUE,
         zalo_friend_added_at = COALESCE(zalo_friend_added_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
         AND id_user = $7`,
      [phone, phone, uid, fullName, email, customerId, userId]
    );
  }

  async insertZaloFriendCustomer({
    userId,
    email,
    phone,
    uid,
    fullName,
  }) {
    const result = await db.query(
      `INSERT INTO customers
         (id_user, email, phone, zalo_id, zalo_phone, full_name, customer_source,
          zalo_is_friend, zalo_friend_added_at, created_at, updated_at)
       VALUES
         ($1, NULLIF($2, ''), $3, NULLIF($4, ''), $5, NULLIF($6, ''), $7,
          TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [userId, email, phone, uid, phone, fullName, 'uknow_campaign']
    );
    return result.rows[0]?.id ?? null;
  }

  async updateCustomerZaloUidIfEmpty(userId, customerId, uid) {
    await db.query(
      `UPDATE customers
       SET zalo_id = COALESCE(NULLIF(zalo_id, ''), $1),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
         AND id_user = $3
         AND (zalo_id IS NULL OR zalo_id = '')`,
      [uid, customerId, userId]
    );
  }

  async findCustomerByUidOrPhone(userId, uid, phonePlaceholder) {
    const result = await db.query(
      `SELECT id FROM customers
       WHERE id_user = $1
         AND (zalo_id = $2 OR (phone = $3 AND $3 <> '') OR (zalo_phone = $3 AND $3 <> ''))
       ORDER BY id ASC
       LIMIT 1`,
      [userId, uid, phonePlaceholder]
    );
    return result.rows[0]?.id ?? null;
  }

  async updateCustomerZaloUid(customerId, uid) {
    await db.query(
      `UPDATE customers
       SET zalo_id = COALESCE(NULLIF(zalo_id, ''), $1),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [uid, customerId]
    );
  }

  async insertMinimalCustomerByPhoneUid(userId, phone, uid) {
    await db.query(
      `INSERT INTO customers
         (id_user, phone, zalo_id, zalo_phone, customer_source, created_at, updated_at)
       VALUES ($1, $2, $3, $2, 'uknow_campaign', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT DO NOTHING`,
      [userId, phone, uid]
    );
  }

  async findOwnedCustomerId(userId, customerId) {
    const result = await db.query(
      `SELECT id
       FROM customers
       WHERE id = $1
         AND id_user = $2
       LIMIT 1`,
      [customerId, userId]
    );
    return result.rows[0]?.id ?? null;
  }

  async updateZaloPersonalEnsuredCustomer({
    userId,
    customerId,
    fullName,
    email,
    phone,
    uid,
    utmSource,
  }) {
    await db.query(
      `UPDATE customers
       SET
         full_name = COALESCE(NULLIF($1, ''), full_name),
         email = COALESCE(NULLIF($2, ''), email),
         phone = COALESCE(NULLIF($3, ''), phone),
         zalo_phone = COALESCE(NULLIF($4, ''), zalo_phone),
         zalo_id = COALESCE(NULLIF($5, ''), zalo_id),
         customer_source = COALESCE(customer_source, 'uknow_campaign'),
         utm_source = COALESCE(utm_source, $6),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
         AND id_user = $8`,
      [fullName, email, phone, phone, uid, utmSource, customerId, userId]
    );
  }

  async findZaloPersonalCustomerByIdentifiers(userId, uid, phone, email) {
    const result = await db.query(
      `SELECT id
       FROM customers
       WHERE id_user = $1
         AND (
           ($2 <> '' AND zalo_id = $2)
           OR ($3 <> '' AND (phone = $3 OR zalo_phone = $3))
           OR ($4 <> '' AND LOWER(email) = LOWER($4))
         )
       ORDER BY id ASC
       LIMIT 1`,
      [userId, uid, phone, email]
    );
    return result.rows[0]?.id ?? null;
  }

  async insertZaloPersonalCustomer({
    userId,
    email,
    phone,
    uid,
    fullName,
    utmSource,
  }) {
    const result = await db.query(
      `INSERT INTO customers
         (id_user, email, phone, zalo_id, zalo_phone, full_name, customer_source, utm_source, created_at, updated_at)
       VALUES
         ($1, NULLIF($2, ''), NULLIF($3, ''), $4, NULLIF($5, ''), NULLIF($6, ''), $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [userId, email, phone, uid, phone, fullName, 'uknow_campaign', utmSource]
    );
    return result.rows[0]?.id ?? null;
  }
}

export default new CustomerMutationRepository();
