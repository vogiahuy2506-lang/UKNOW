import db from '../../config/database.js';

class DeliveryMonitorRepository {
  async safeQuery(sql, params = [], fallback = []) {
    try {
      const result = await db.query(sql, params);
      return result.rows || fallback;
    } catch (error) {
      // 42P01: undefined_table, 42703: undefined_column, 42704: undefined_object
      // 22P02: invalid_text_representation (for enum issues)
      const safeCodes = ['42P01', '42703', '42704', '22P02', '42P10'];
      if (safeCodes.includes(error?.code)) return fallback;
      throw error;
    }
  }
}

export default new DeliveryMonitorRepository();
