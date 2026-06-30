import db from '../config/database.js';

class LandingPageSectionRepository {
  _mapRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      page: row.page,
      section: row.section,
      htmlContent: row.html_content,
      cssContent: row.css_content,
      config: row.config,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async findAll() {
    const result = await db.query(
      `SELECT id, page, section, html_content, css_content, config, is_active, created_at, updated_at
       FROM landing_page_sections
       ORDER BY page, section`
    );
    return result.rows.map((r) => this._mapRow(r));
  }

  async findActive() {
    const result = await db.query(
      `SELECT id, page, section, html_content, css_content, config, is_active, created_at, updated_at
       FROM landing_page_sections
       WHERE is_active = true
       ORDER BY page, section`
    );
    return result.rows.map((r) => this._mapRow(r));
  }

  async findByPage(page) {
    const result = await db.query(
      `SELECT id, page, section, html_content, css_content, config, is_active, created_at, updated_at
       FROM landing_page_sections
       WHERE page = $1 AND is_active = true
       ORDER BY section`,
      [page]
    );
    return result.rows.map((r) => this._mapRow(r));
  }

  async findByPageAndSection(page, section) {
    const result = await db.query(
      `SELECT id, page, section, html_content, css_content, config, is_active, created_at, updated_at
       FROM landing_page_sections
       WHERE page = $1 AND section = $2`,
      [page, section]
    );
    return this._mapRow(result.rows[0]);
  }

  async findById(id) {
    const result = await db.query(
      `SELECT id, page, section, html_content, css_content, config, is_active, created_at, updated_at
       FROM landing_page_sections
       WHERE id = $1`,
      [id]
    );
    return this._mapRow(result.rows[0]);
  }

  async upsert(payload) {
    const result = await db.query(
      `INSERT INTO landing_page_sections (page, section, html_content, css_content, config, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (page, section)
       DO UPDATE SET
         html_content = COALESCE($3, landing_page_sections.html_content),
         css_content = COALESCE($4, landing_page_sections.css_content),
         config = COALESCE($5, landing_page_sections.config),
         is_active = COALESCE($6, landing_page_sections.is_active),
         updated_at = CURRENT_TIMESTAMP
       RETURNING id, page, section, html_content, css_content, config, is_active, created_at, updated_at`,
      [
        payload.page,
        payload.section,
        payload.htmlContent || null,
        payload.cssContent || null,
        payload.config ? JSON.stringify(payload.config) : null,
        payload.isActive !== false,
      ]
    );
    return this._mapRow(result.rows[0]);
  }

  async updateById(id, payload) {
    const result = await db.query(
      `UPDATE landing_page_sections SET
         page = COALESCE($2, page),
         section = COALESCE($3, section),
         html_content = $4,
         css_content = $5,
         config = $6,
         is_active = $7,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, page, section, html_content, css_content, config, is_active, created_at, updated_at`,
      [
        id,
        payload.page,
        payload.section,
        payload.htmlContent,
        payload.cssContent,
        payload.config ? JSON.stringify(payload.config) : null,
        payload.isActive !== undefined ? payload.isActive : true,
      ]
    );
    return this._mapRow(result.rows[0]);
  }

  async deleteById(id) {
    const result = await db.query(`DELETE FROM landing_page_sections WHERE id = $1`, [id]);
    return (result.rowCount || 0) > 0;
  }

  async deleteByPageAndSection(page, section) {
    const result = await db.query(
      `DELETE FROM landing_page_sections WHERE page = $1 AND section = $2`,
      [page, section]
    );
    return (result.rowCount || 0) > 0;
  }
}

export default new LandingPageSectionRepository();
