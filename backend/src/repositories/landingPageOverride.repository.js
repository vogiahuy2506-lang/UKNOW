import db from '../config/database.js';

class LandingPageOverrideRepository {
  _mapRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      page: row.page,
      section: row.section,
      key: row.key,
      valueVi: row.value_vi,
      valueEn: row.value_en,
      extraData: row.extra_data,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async findAll() {
    const result = await db.query(
      `SELECT id, page, section, key, value_vi, value_en, extra_data, is_active, created_at, updated_at
       FROM landing_page_overrides
       ORDER BY page, section, key`
    );
    return result.rows.map((r) => this._mapRow(r));
  }

  async findActive() {
    const result = await db.query(
      `SELECT id, page, section, key, value_vi, value_en, extra_data, is_active, created_at, updated_at
       FROM landing_page_overrides
       WHERE is_active = true
       ORDER BY page, section, key`
    );
    return result.rows.map((r) => this._mapRow(r));
  }

  async findByPage(page) {
    const result = await db.query(
      `SELECT id, page, section, key, value_vi, value_en, extra_data, is_active, created_at, updated_at
       FROM landing_page_overrides
       WHERE page = $1 AND is_active = true
       ORDER BY section, key`,
      [page]
    );
    return result.rows.map((r) => this._mapRow(r));
  }

  async findById(id) {
    const result = await db.query(
      `SELECT id, page, section, key, value_vi, value_en, extra_data, is_active, created_at, updated_at
       FROM landing_page_overrides
       WHERE id = $1`,
      [id]
    );
    return this._mapRow(result.rows[0]);
  }

  async findByPageSectionKey(page, section, key) {
    const result = await db.query(
      `SELECT id, page, section, key, value_vi, value_en, extra_data, is_active, created_at, updated_at
       FROM landing_page_overrides
       WHERE page = $1 AND section = $2 AND key = $3`,
      [page, section, key]
    );
    return this._mapRow(result.rows[0]);
  }

  async upsert(payload) {
    // If updating, get existing record to merge values
    let existingValueVi = null;
    let existingValueEn = null;
    
    if (payload.key) {
      const existing = await this.findByPageSectionKey(payload.page, payload.section, payload.key);
      if (existing) {
        existingValueVi = existing.valueVi;
        existingValueEn = existing.valueEn;
      }
    }

    const result = await db.query(
      `INSERT INTO landing_page_overrides (page, section, key, value_vi, value_en, extra_data, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (page, section, key)
       DO UPDATE SET
         value_vi = COALESCE($4, landing_page_overrides.value_vi),
         value_en = COALESCE($5, landing_page_overrides.value_en),
         extra_data = COALESCE($6, landing_page_overrides.extra_data),
         is_active = COALESCE($7, landing_page_overrides.is_active),
         updated_at = CURRENT_TIMESTAMP
       RETURNING id, page, section, key, value_vi, value_en, extra_data, is_active, created_at, updated_at`,
      [
        payload.page,
        payload.section,
        payload.key,
        payload.valueVi !== undefined ? payload.valueVi : null,
        payload.valueEn !== undefined ? payload.valueEn : null,
        payload.extraData || null,
        payload.isActive !== false,
      ]
    );
    return this._mapRow(result.rows[0]);
  }

  async updateById(id, payload) {
    const result = await db.query(
      `UPDATE landing_page_overrides SET
         page = COALESCE($2, page),
         section = COALESCE($3, section),
         key = COALESCE($4, key),
         value_vi = $5,
         value_en = $6,
         extra_data = $7,
         is_active = $8,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, page, section, key, value_vi, value_en, extra_data, is_active, created_at, updated_at`,
      [
        id,
        payload.page,
        payload.section,
        payload.key,
        payload.valueVi,
        payload.valueEn,
        payload.extraData || null,
        payload.isActive !== undefined ? payload.isActive : true,
      ]
    );
    return this._mapRow(result.rows[0]);
  }

  async deleteById(id) {
    const result = await db.query(`DELETE FROM landing_page_overrides WHERE id = $1`, [id]);
    return (result.rowCount || 0) > 0;
  }

  async bulkUpsert(items) {
    if (!items || items.length === 0) return [];
    const results = [];
    for (const item of items) {
      const result = await this.upsert(item);
      results.push(result);
    }
    return results;
  }

  // Element positions - store in extra_data column
  async findPositionsByPage(page) {
    const result = await db.query(
      `SELECT id, page, section, key, extra_data
       FROM landing_page_overrides
       WHERE page = $1 AND extra_data IS NOT NULL AND extra_data != '{}'::jsonb AND extra_data ? 'top'
       ORDER BY key`,
      [page]
    );
    return result.rows.map(r => ({
      id: r.id,
      page: r.page,
      section: r.section,
      elementKey: r.key,
      ...r.extra_data,
    }));
  }

  async savePositions(page, positions) {
    for (const pos of positions) {
      // Get existing extra_data
      const existing = await db.query(
        `SELECT extra_data FROM landing_page_overrides
         WHERE page = $1 AND key = $2`,
        [page, pos.element_key]
      );
      
      const existingData = existing.rows[0]?.extra_data || {};
      
      // Merge position data into extra_data
      const newData = {
        ...existingData,
        top: pos.top ?? existingData.top,
        left: pos.left ?? existingData.left,
        width: pos.width ?? existingData.width,
        height: pos.height ?? existingData.height,
        z_index: pos.z_index ?? existingData.z_index,
        visible: pos.visible ?? existingData.visible,
      };
      
      // Upsert with position data
      await db.query(
        `INSERT INTO landing_page_overrides (page, section, key, extra_data, is_active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (page, section, key)
         DO UPDATE SET extra_data = $4, updated_at = CURRENT_TIMESTAMP`,
        [page, 'position', pos.element_key, JSON.stringify(newData)]
      );
    }
    return true;
  }

  async deletePositionByKey(page, elementKey) {
    const result = await db.query(
      `UPDATE landing_page_overrides
       SET extra_data = extra_data - 'top' - 'left' - 'width' - 'height' - 'z_index' - 'visible',
           updated_at = CURRENT_TIMESTAMP
       WHERE page = $1 AND key = $2 AND section = 'position'`,
      [page, elementKey]
    );
    return (result.rowCount || 0) > 0;
  }
}

export default new LandingPageOverrideRepository();
