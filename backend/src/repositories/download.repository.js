import db from '../config/database.js';

class DownloadRepository {
  async findFileByStorageKey(storageKey) {
    try {
      const { rows } = await db.query(
        `SELECT id, display_name, original_name, mime_type
         FROM template_files
         WHERE storage_key = $1
         LIMIT 1`,
        [storageKey]
      );
      return rows[0] || null;
    } catch (err) {
      if (err?.code === '42P01') {
        console.warn('Cảnh báo: thiếu bảng template_files, bỏ qua truy vấn metadata file.');
        return null;
      }
      throw err;
    }
  }

  /**
   * Kèm chủ mẫu email (email_templates.id_user) để controller kiểm quyền —
   * tệp thuộc mẫu của không gian nào chỉ chủ không gian đó (hoặc super admin) mới tải được.
   * LEFT JOIN vì template_id có thể NULL (dữ liệu cũ/không liên kết mẫu nào).
   */
  async findFileById(fileId) {
    const { rows } = await db.query(
      `SELECT tf.id, tf.original_name, tf.display_name, tf.mime_type, tf.storage_key, tf.file_size,
              et.id_user AS template_owner_id
       FROM template_files tf
       LEFT JOIN email_templates et ON et.id = tf.template_id
       WHERE tf.id = $1`,
      [fileId]
    );
    return rows[0] || null;
  }

  async findEmailMessageByTrackingToken(token) {
    const { rows } = await db.query(
      `SELECT id, id_run FROM email_messages WHERE tracking_token = $1 LIMIT 1`,
      [token]
    );
    return rows[0] || null;
  }

  async findCustomerByEmail(email) {
    const { rows } = await db.query(
      `SELECT id FROM customers WHERE email = $1 LIMIT 1`,
      [email]
    );
    return rows[0] || null;
  }
}

export default new DownloadRepository();
