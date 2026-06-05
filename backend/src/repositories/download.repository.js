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

  async findFileById(fileId) {
    const { rows } = await db.query(
      `SELECT id, original_name, display_name, mime_type, storage_key, file_size
       FROM template_files
       WHERE id = $1`,
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
