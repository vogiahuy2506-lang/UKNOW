import db from '../../config/database.js';

class DeliveryMonitorRepository {
  async safeQuery(sql, params = [], fallback = []) {
    try {
      const result = await db.query(sql, params);
      return result.rows || fallback;
    } catch (error) {
      if (error?.code === '42P01' || error?.code === '42703') return fallback;
      throw error;
    }
  }
}

export default new DeliveryMonitorRepository();
