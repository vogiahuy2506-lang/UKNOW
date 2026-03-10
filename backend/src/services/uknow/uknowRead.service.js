import axios from 'axios';

class UknowReadService {
  /**
   * Proxy UKNOW customers list API.
   *
   * @param {object} ctx controller context
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @returns {Promise<void>}
   */
  async getCustomers(ctx, req, res) {
    try {
      const { page = 1, per_page = 100 } = req.query;
      const response = await axios.get(`${ctx.baseUrl}/wc/v3/customers`, {
        headers: ctx.getAuthHeaders(),
        params: { page, per_page },
      });

      res.json({
        success: true,
        data: {
          items: response.data.map((customer) => ({
            id: customer.id,
            email: customer.email,
            firstName: customer.first_name,
            lastName: customer.last_name,
            username: customer.username,
            phone: customer.billing?.phone,
            dateCreated: customer.date_created,
            ordersCount: parseInt(customer.orders_count || 0, 10),
            totalSpent: ctx.parseMoney(customer.total_spent),
          })),
          total: parseInt(response.headers['x-wp-total'] || 0, 10),
          totalPages: parseInt(response.headers['x-wp-totalpages'] || 1, 10),
        },
      });
    } catch (error) {
      console.error('Get UKNOW customers error:', error.response?.data || error.message);
      res.status(500).json({
        success: false,
        message: 'Khong the lay du lieu khach hang tu UKNOW',
      });
    }
  }

  /**
   * Proxy UKNOW products list API.
   *
   * @param {object} ctx controller context
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @returns {Promise<void>}
   */
  async getCourses(ctx, req, res) {
    try {
      const { page = 1, per_page = 100, status = 'any' } = req.query;
      const response = await axios.get(`${ctx.baseUrl}/wc/v3/products`, {
        headers: ctx.getAuthHeaders(),
        params: { page, per_page, status },
      });

      res.json({
        success: true,
        data: {
          items: response.data.map((product) => ({
            id: product.id,
            name: product.name,
            slug: product.slug,
            status: product.status,
            price: ctx.parseMoney(product.price),
            regularPrice: ctx.parseMoney(product.regular_price),
            salePrice: ctx.parseMoney(product.sale_price),
            dateCreated: product.date_created,
            categories: product.categories || [],
            image: Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : null,
          })),
          total: parseInt(response.headers['x-wp-total'] || 0, 10),
          totalPages: parseInt(response.headers['x-wp-totalpages'] || 1, 10),
        },
      });
    } catch (error) {
      console.error('Get UKNOW courses error:', error.response?.data || error.message);
      res.status(500).json({
        success: false,
        message: 'Khong the lay du lieu khoa hoc tu UKNOW',
      });
    }
  }

  /**
   * Proxy UKNOW orders list API.
   *
   * @param {object} ctx controller context
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @returns {Promise<void>}
   */
  async getOrders(ctx, req, res) {
    try {
      const { page = 1, per_page = 100, status = 'completed,on-hold' } = req.query;
      const normalizedStatus = String(status)
        .split(',')
        .map((item) => item.trim().toLowerCase().replace('onhold', 'on-hold'))
        .filter(Boolean)
        .join(',');

      const response = await axios.get(`${ctx.baseUrl}/wc/v3/orders`, {
        headers: ctx.getAuthHeaders(),
        params: { page, per_page, status: normalizedStatus || 'completed,on-hold' },
      });

      res.json({
        success: true,
        data: {
          items: response.data.map((order) => ({
            id: order.id,
            status: order.status,
            total: ctx.parseMoney(order.total),
            currency: order.currency,
            dateCreated: order.date_created,
            customer: {
              id: order.customer_id,
              email: order.billing?.email,
              firstName: order.billing?.first_name,
              lastName: order.billing?.last_name,
              phone: order.billing?.phone,
            },
            lineItems: (order.line_items || []).map((item) => ({
              id: item.id,
              name: item.name,
              productId: ctx.getLineItemProductId(item),
              quantity: item.quantity,
              total: ctx.parseMoney(item.total),
            })),
          })),
          total: parseInt(response.headers['x-wp-total'] || 0, 10),
          totalPages: parseInt(response.headers['x-wp-totalpages'] || 1, 10),
        },
      });
    } catch (error) {
      console.error('Get UKNOW orders error:', error.response?.data || error.message);
      res.status(500).json({
        success: false,
        message: 'Khong the lay du lieu don hang tu UKNOW',
      });
    }
  }

  /**
   * Proxy UKNOW single order API.
   *
   * @param {object} ctx controller context
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @returns {Promise<void>}
   */
  async getOrder(ctx, req, res) {
    try {
      const { orderId } = req.params;
      if (!orderId || Number.isNaN(parseInt(orderId, 10))) {
        return res.status(400).json({ success: false, message: 'Mã đơn hàng không hợp lệ' });
      }

      const response = await axios.get(`${ctx.baseUrl}/wc/v3/orders/${orderId}`, {
        headers: ctx.getAuthHeaders(),
      });

      const order = response.data;
      const rawStatus = String(order?.status || '').toLowerCase();
      const normalizedStatus = rawStatus === 'onhold' ? 'on-hold' : rawStatus;

      const statusLabel =
        normalizedStatus === 'on-hold'
          ? 'Quan tâm'
          : normalizedStatus === 'completed'
            ? 'Đã đặt thành công'
            : normalizedStatus;

      res.json({
        success: true,
        data: {
          id: order.id,
          status: normalizedStatus,
          statusLabel,
          total: ctx.parseMoney(order.total),
          currency: order.currency,
          dateCreated: order.date_created,
          datePaid: order.date_paid,
          dateCompleted: order.date_completed,
          paymentMethod: order.payment_method_title || order.payment_method,
          customer: {
            id: order.customer_id,
            email: order.billing?.email,
            firstName: order.billing?.first_name,
            lastName: order.billing?.last_name,
            phone: order.billing?.phone,
          },
          lineItems: (order.line_items || []).map((item) => ({
            id: item.id,
            name: item.name,
            productId: ctx.getLineItemProductId(item),
            quantity: item.quantity,
            total: ctx.parseMoney(item.total),
          })),
        },
      });
    } catch (error) {
      const status = error.response?.status;
      if (status === 404) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
      }
      console.error('Get UKNOW order error:', error.response?.data || error.message);
      res.status(500).json({ success: false, message: 'Không thể lấy thông tin đơn hàng từ UKNOW' });
    }
  }
}

export default new UknowReadService();
