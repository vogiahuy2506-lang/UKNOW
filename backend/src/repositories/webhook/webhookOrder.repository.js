import db from '../../config/database.js';

class WebhookOrderRepository {
  async hasPurchaseForOrder(orderId, purchaseType) {
    const result = await db.query(
      `SELECT 1
       FROM customer_purchases
       WHERE order_id = $1
         AND product_type = $2
       LIMIT 1`,
      [orderId, purchaseType]
    );
    return result.rows.length > 0;
  }

  async hasJourneyEventForOrder(orderId, status, eventType) {
    const result = await db.query(
      `SELECT 1
       FROM customer_journey
       WHERE event_data->>'order_id' = $1
         AND event_data->>'status' = $2
         AND event_type = $3
       LIMIT 1`,
      [orderId, status, eventType]
    );
    return result.rows.length > 0;
  }
}

export default new WebhookOrderRepository();
