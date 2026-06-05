import axios from 'axios';

class UknowReadService {
  async getCustomers({ ctx, page = 1, perPage = 100 }) {
    const response = await axios.get(`${ctx.baseUrl}/wc/v3/customers`, {
      headers: ctx.getAuthHeaders(),
      params: { page, per_page: perPage },
    });
    return {
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
    };
  }

  async getCourses({ ctx, page = 1, perPage = 100, status = 'any' }) {
    const response = await axios.get(`${ctx.baseUrl}/wc/v3/products`, {
      headers: ctx.getAuthHeaders(),
      params: { page, per_page: perPage, status },
    });
    return {
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
    };
  }

  async getOrders({ ctx, page = 1, perPage = 100, status = 'completed,on-hold' }) {
    const normalizedStatus = String(status)
      .split(',')
      .map((item) => item.trim().toLowerCase().replace('onhold', 'on-hold'))
      .filter(Boolean)
      .join(',');

    const response = await axios.get(`${ctx.baseUrl}/wc/v3/orders`, {
      headers: ctx.getAuthHeaders(),
      params: { page, per_page: perPage, status: normalizedStatus || 'completed,on-hold' },
    });
    return {
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
    };
  }

  async getOrder({ ctx, orderId }) {
    if (!orderId || Number.isNaN(parseInt(orderId, 10))) {
      const err = new Error('Mã đơn hàng không hợp lệ');
      err.statusCode = 400;
      throw err;
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

    return {
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
    };
  }
}

export default new UknowReadService();
