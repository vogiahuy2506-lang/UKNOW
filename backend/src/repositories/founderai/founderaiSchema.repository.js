import db from '../../config/database.js';

class FounderaiSchemaRepository {
  async hasPurchaseOrderStatusColumn() {
    const result = await db.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'customer_purchases'
         AND column_name = 'order_status'
       LIMIT 1`
    );
    return result.rows.length > 0;
  }

  async ensureUknowStatusColumn() {
    await db.query(
      `ALTER TABLE campaign_customers ADD COLUMN IF NOT EXISTS uknow_status VARCHAR(20) DEFAULT NULL`
    );
  }
}

export default new FounderaiSchemaRepository();
