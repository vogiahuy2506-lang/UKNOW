import db from '../../config/database.js';

/**
 * Marketplace Wallet Service
 * Xử lý số dư và earnings của seller
 */
class MarketplaceWalletService {
  /**
   * Lấy số dư khả dụng của seller
   * @param {number} userId
   * @returns {Promise<object>}
   */
  async getBalance(userId) {
    const { rows } = await db.query(
      `SELECT 
         ms.total_earnings,
         ms.available_balance,
         ms.pending_payout,
         ms.lifetime_paid_out,
         ms.total_sales,
         ms.total_views
       FROM marketplace_seller_stats ms
       WHERE ms.id_user = $1`,
      [userId]
    );
    
    if (rows.length === 0) {
      return {
        totalEarnings: 0,
        availableBalance: 0,
        pendingPayout: 0,
        lifetimePaidOut: 0,
        totalSales: 0,
        totalViews: 0,
      };
    }
    
    const row = rows[0];
    return {
      totalEarnings: Number(row.total_earnings || 0),
      availableBalance: Number(row.available_balance || 0),
      pendingPayout: Number(row.pending_payout || 0),
      lifetimePaidOut: Number(row.lifetime_paid_out || 0),
      totalSales: Number(row.total_sales || 0),
      totalViews: Number(row.total_views || 0),
    };
  }

  /**
   * Cập nhật số dư seller sau khi có purchase mới
   * @param {object} client - Database transaction client
   * @param {number} sellerId
   * @param {number} amount - Số credits seller nhận được (đã trừ 10% platform fee)
   */
  async creditSeller(client, sellerId, amount) {
    // Upsert seller stats
    await client.query(
      `INSERT INTO marketplace_seller_stats (id_user, total_earnings, available_balance, total_sales)
       VALUES ($1, $2, $2, 1)
       ON CONFLICT (id_user) DO UPDATE SET
         total_earnings = marketplace_seller_stats.total_earnings + $2,
         available_balance = marketplace_seller_stats.available_balance + $2,
         total_sales = marketplace_seller_stats.total_sales + 1`,
      [sellerId, amount]
    );
  }

  /**
   * Cập nhật view count cho seller
   * @param {object} client - Database transaction client (optional)
   * @param {number} sellerId
   */
  async incrementSellerViewCount(sellerId) {
    await db.query(
      `INSERT INTO marketplace_seller_stats (id_user, total_views)
       VALUES ($1, 1)
       ON CONFLICT (id_user) DO UPDATE SET
         total_views = marketplace_seller_stats.total_views + 1`,
      [sellerId]
    );
  }

  /**
   * Tạo yêu cầu rút tiền
   * @param {number} userId
   * @param {number} amount
   * @param {string} paymentMethod
   * @param {object} paymentDetails
   * @returns {Promise<object>}
   */
  async requestWithdrawal(userId, amount, paymentMethod = 'bank_transfer', paymentDetails = {}) {
    const parsedAmount = Math.floor(Number(amount));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      const error = new Error('Số tiền rút không hợp lệ');
      error.status = 400;
      throw error;
    }

    // Minimum withdrawal
    if (parsedAmount < 50000) { // 50k credits minimum
      const error = new Error('Số tiền rút tối thiểu là 50,000 credits');
      error.status = 400;
      throw error;
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Lock row to prevent race conditions on available_balance
      const { rows } = await client.query(
        `SELECT available_balance, pending_payout
         FROM marketplace_seller_stats
         WHERE id_user = $1
         FOR UPDATE`,
        [userId]
      );

      const availableBalance = Number(rows[0]?.available_balance || 0);
      if (rows.length === 0 || availableBalance < parsedAmount) {
        const error = new Error('Số dư khả dụng không đủ');
        error.status = 400;
        throw error;
      }

      // Create payout request
      const { rows: inserted } = await client.query(
        `INSERT INTO marketplace_payout_requests 
         (id_user, amount, status, payment_method, payment_details)
         VALUES ($1, $2, 'pending', $3, $4)
         RETURNING *`,
        [userId, parsedAmount, paymentMethod, JSON.stringify(paymentDetails)]
      );

      // Update available balance and pending payout with guard
      const { rowCount } = await client.query(
        `UPDATE marketplace_seller_stats 
         SET available_balance = available_balance - $2,
             pending_payout = pending_payout + $2
         WHERE id_user = $1 AND available_balance >= $2`,
        [userId, parsedAmount]
      );

      if (rowCount === 0) {
        const error = new Error('Số dư khả dụng không đủ');
        error.status = 400;
        throw error;
      }

      await client.query('COMMIT');
      return inserted[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Lấy lịch sử rút tiền
   * @param {number} userId
   * @param {object} options
   * @returns {Promise<object>}
   */
  async getWithdrawalHistory(userId, options = {}) {
    const { limit = 20, offset = 0 } = options;

    const { rows: withdrawals, rowCount } = await db.query(
      `SELECT pr.*, u.full_name as processed_by_name
       FROM marketplace_payout_requests pr
       LEFT JOIN users u ON pr.processed_by = u.id
       WHERE pr.id_user = $1
       ORDER BY pr.requested_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) FROM marketplace_payout_requests WHERE id_user = $1`,
      [userId]
    );

    return {
      withdrawals,
      total: parseInt(countRows[0].count, 10),
    };
  }

  /**
   * Lấy lịch sử earnings từ purchases
   * @param {number} userId
   * @param {object} options
   * @returns {Promise<object>}
   */
  async getEarningsHistory(userId, options = {}) {
    const { limit = 20, offset = 0, startDate, endDate } = options;

    let query = `
      SELECT 
        mp.id,
        mp.purchased_at,
        mp.credits_spent,
        mp.credits_spent * 0.9 as seller_earnings,
        mp.transaction_type,
        ml.title as listing_title,
        ml.resource_type,
        u.full_name as buyer_name
      FROM marketplace_purchases mp
      JOIN marketplace_listings ml ON mp.listing_id = ml.id
      LEFT JOIN users u ON mp.id_user = u.id
      WHERE mp.seller_id = $1 AND mp.transaction_type = 'purchase'
    `;
    const params = [userId];

    if (startDate) {
      params.push(startDate);
      query += ` AND mp.purchased_at >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      query += ` AND mp.purchased_at <= $${params.length}`;
    }

    query += ` ORDER BY mp.purchased_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows: earnings, rowCount } = await db.query(query, params);

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) FROM marketplace_purchases 
       WHERE seller_id = $1 AND transaction_type = 'purchase'${startDate ? ' AND purchased_at >= $2' : ''}${endDate ? `${startDate ? ' AND' : ' WHERE'} purchased_at <= $${startDate ? 3 : 2}` : ''}`,
      params.slice(0, startDate ? (endDate ? 3 : 2) : (endDate ? 2 : 1))
    );

    return {
      earnings,
      total: parseInt(countRows[0].count, 10),
    };
  }

  /**
   * Lấy thống kê tổng hợp theo tháng
   * @param {number} userId
   * @param {number} months - Số tháng muốn xem
   * @returns {Promise<object[]>}
   */
  async getMonthlyStats(userId, months = 6) {
    const { rows } = await db.query(
      `SELECT 
         DATE_TRUNC('month', mp.purchased_at) as month,
         COUNT(*) as total_sales,
         SUM(mp.credits_spent * 0.9) as total_earnings
       FROM marketplace_purchases mp
       WHERE mp.seller_id = $1 
         AND mp.transaction_type = 'purchase'
         AND mp.purchased_at >= DATE_TRUNC('month', NOW() - INTERVAL '${months} months')
       GROUP BY DATE_TRUNC('month', mp.purchased_at)
       ORDER BY month DESC`,
      [userId]
    );

    return rows.map(row => ({
      month: row.month,
      totalSales: Number(row.total_sales || 0),
      totalEarnings: Number(row.total_earnings || 0),
    }));
  }
}

export default new MarketplaceWalletService();
