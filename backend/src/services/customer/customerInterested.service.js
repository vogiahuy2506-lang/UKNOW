import db from '../../config/database.js';

class CustomerInterestedService {
  /**
   * Get interested/purchased customers with related courses from DB.
   *
   * @param {object} input
   * @returns {Promise<object>}
   */
  async getInterestedCustomersWithCourses({
    userId,
    campaignId,
    limit: rawLimit,
    courseIds,
    courseStatuses,
    courseQuery,
    customerType,
    purchaseOrderStatusExpr,
  }) {
    const campaignIdNum = Number.isFinite(parseInt(campaignId, 10))
      ? parseInt(campaignId, 10)
      : null;
    const requestedLimit = Number.isFinite(parseInt(rawLimit, 10))
      ? parseInt(rawLimit, 10)
      : 1000;
    const limit = Math.max(1, Math.min(requestedLimit, 5000));
    const selectedCourseIds = String(courseIds || '')
      .split(',')
      .map((v) => parseInt(v, 10))
      .filter((v, idx, arr) => Number.isFinite(v) && arr.indexOf(v) === idx);
    const allowedCourseStatuses = new Set(['publish', 'draft', 'pending', 'private', 'trash']);
    const normalizedCourseStatuses = String(courseStatuses || '')
      .split(',')
      .map((v) => String(v || '').trim().toLowerCase())
      .filter((v, idx, arr) => v && arr.indexOf(v) === idx && allowedCourseStatuses.has(v));
    const normalizedCourseQuery = String(courseQuery || '').trim();

    const rawCustomerType = String(customerType || '').trim().toLowerCase();
    const normalizedCustomerType = rawCustomerType === 'complete'
      ? 'purchased'
      : ['interested', 'purchased', 'both'].includes(rawCustomerType)
        ? rawCustomerType
        : 'interested';

    let interestedCondition;
    if (normalizedCustomerType === 'purchased') {
      interestedCondition = `(
        ${purchaseOrderStatusExpr} != 'on-hold'
        AND LOWER(COALESCE(cp.product_type, '')) != 'interested'
      )`;
    } else if (normalizedCustomerType === 'both') {
      interestedCondition = '1=1';
    } else {
      interestedCondition = `(
        ${purchaseOrderStatusExpr} = 'on-hold'
        OR LOWER(COALESCE(cp.product_type, '')) = 'interested'
      )`;
    }

    /**
     * Build và chạy bộ query lấy danh sách khách + thống kê khóa học.
     *
     * Luồng hoạt động:
     * 1. Dựng các điều kiện lọc động theo campaign, khóa học, trạng thái, từ khóa.
     * 2. Chạy song song query danh sách khách, tổng số, và danh sách khóa học.
     * 3. Trả về raw result để tầng trên map thành response.
     *
     * @param {{scopedCampaignId: number|null, useCampaignScope: boolean}} params Scope truy vấn theo campaign
     * @returns {Promise<{listResult: any, countResult: any, coursesResult: any}>}
     */
    const runDbQueries = async ({ scopedCampaignId, useCampaignScope = true }) => {
      const params = [userId];
      let whereCampaign = '';
      if (useCampaignScope && Number.isFinite(scopedCampaignId)) {
        params.push(scopedCampaignId);
        whereCampaign = ` AND cp.id_campaign = $${params.length}`;
      }

      let whereCourse = '';
      if (selectedCourseIds.length > 0) {
        const coursePlaceholders = selectedCourseIds.map((_, idx) => `$${params.length + idx + 1}`).join(',');
        params.push(...selectedCourseIds);
        whereCourse = ` AND cp.id_course IN (${coursePlaceholders})`;
      }

      let whereCourseQuery = '';
      if (normalizedCourseQuery) {
        params.push(`%${normalizedCourseQuery}%`);
        whereCourseQuery = ` AND (
          COALESCE(crs.course_name, cp.product_name, '') ILIKE $${params.length}
          OR COALESCE(crs.course_code, '') ILIKE $${params.length}
          OR COALESCE(cp.product_name, '') ILIKE $${params.length}
        )`;
      }
      let whereCourseStatus = '';
      if (normalizedCourseStatuses.length > 0) {
        params.push(normalizedCourseStatuses);
        whereCourseStatus = ` AND LOWER(COALESCE(crs.status, 'publish')) = ANY($${params.length})`;
      }

      const listParams = [...params, limit];
      const listQuery = `
        SELECT MIN(cp.id) AS id,
               cp.id_customer,
               MIN(cp.id_course) AS id_course,
               MIN(cp.id_campaign) AS id_campaign,
               MIN(cp.order_id) AS order_id,
               MIN(cp.product_name) AS product_name,
               MIN(cp.product_type) AS product_type,
               MIN(cp.amount) AS amount,
               MIN(cp.currency) AS currency,
               MIN(cp.payment_method) AS payment_method,
               MAX(cp.purchase_date) AS purchase_date,
               ${purchaseOrderStatusExpr} AS order_status,
               c.full_name,
               c.email,
               c.phone,
               MIN(c.zalo_id) AS zalo_id,
               MIN(c.zalo_phone) AS zalo_phone,
               MIN(c.customer_source) AS customer_source,
               COALESCE(crs.course_name, MIN(cp.product_name)) AS course_name,
               MIN(crs.course_code) AS course_code,
               MIN(camp.campaign_name) AS campaign_name
        FROM customer_purchases cp
        JOIN customers c
          ON c.id = cp.id_customer
         AND c.id_user = $1
        LEFT JOIN courses crs ON crs.id = cp.id_course
        LEFT JOIN campaigns camp
          ON camp.id = cp.id_campaign
         AND camp.id_user = c.id_user
        WHERE ${interestedCondition}
          ${whereCampaign}
          ${whereCourse}
          ${whereCourseStatus}
          ${whereCourseQuery}
        GROUP BY cp.id_customer,
                 c.full_name,
                 c.email,
                 c.phone,
                 crs.course_name,
                 ${purchaseOrderStatusExpr}
        ORDER BY MAX(cp.purchase_date) DESC NULLS LAST, MIN(cp.id) DESC
        LIMIT $${listParams.length}
      `;

      const countQuery = `
        SELECT COUNT(*)::INTEGER AS total
        FROM customer_purchases cp
        JOIN customers c
          ON c.id = cp.id_customer
         AND c.id_user = $1
        LEFT JOIN courses crs ON crs.id = cp.id_course
        WHERE ${interestedCondition}
          ${whereCampaign}
          ${whereCourse}
          ${whereCourseStatus}
          ${whereCourseQuery}
      `;

      const coursesQuery = `
        SELECT cp.id_course AS course_id,
               COALESCE(crs.course_name, cp.product_name, 'Khoa hoc khong xac dinh') AS course_name,
               crs.course_code,
               COALESCE(crs.status, 'publish') AS status,
               COUNT(*)::INTEGER AS total_items
        FROM customer_purchases cp
        JOIN customers c
          ON c.id = cp.id_customer
         AND c.id_user = $1
        LEFT JOIN courses crs ON crs.id = cp.id_course
        WHERE ${interestedCondition}
          ${whereCampaign}
          ${whereCourse}
          ${whereCourseStatus}
          ${whereCourseQuery}
        GROUP BY cp.id_course, COALESCE(crs.course_name, cp.product_name, 'Khoa hoc khong xac dinh'), crs.course_code, crs.status
        ORDER BY total_items DESC
      `;

      const [listResult, countResult, coursesResult] = await Promise.all([
        db.query(listQuery, listParams),
        db.query(countQuery, params),
        db.query(coursesQuery, params),
      ]);

      return { listResult, countResult, coursesResult };
    };

    let scopedCampaignId = campaignIdNum;
    const shouldScopeByCampaign = Number.isFinite(campaignIdNum) && normalizedCustomerType === 'interested';
    let { listResult, countResult, coursesResult } = await runDbQueries({
      scopedCampaignId,
      useCampaignScope: shouldScopeByCampaign,
    });
    if (
      shouldScopeByCampaign &&
      listResult.rows.length === 0 &&
      coursesResult.rows.length === 0
    ) {
      scopedCampaignId = null;
      ({ listResult, countResult, coursesResult } = await runDbQueries({
        scopedCampaignId: null,
        useCampaignScope: false,
      }));
    }

    return {
      items: listResult.rows.map((row) => ({
        id: row.id,
        customerId: row.id_customer,
        courseId: row.id_course,
        campaignId: row.id_campaign,
        orderId: row.order_id,
        productName: row.product_name,
        productType: row.product_type,
        amount: row.amount,
        currency: row.currency,
        paymentMethod: row.payment_method,
        purchaseDate: row.purchase_date,
        orderStatus: row.order_status,
        fullName: row.full_name,
        email: row.email,
        phone: row.phone,
        zaloId: row.zalo_id,
        zaloPhone: row.zalo_phone,
        customerSource: row.customer_source,
        courseName: row.course_name,
        courseCode: row.course_code,
        campaignName: row.campaign_name,
      })),
      courses: coursesResult.rows.map((row) => ({
        courseId: row.course_id,
        courseName: row.course_name,
        courseCode: row.course_code,
        status: row.status || 'publish',
        totalItems: row.total_items || 0,
      })),
      filters: {
        campaignId: shouldScopeByCampaign ? scopedCampaignId : null,
        courseIds: selectedCourseIds,
        courseStatuses: normalizedCourseStatuses,
        courseQuery: normalizedCourseQuery,
        customerType: normalizedCustomerType,
      },
      pagination: {
        limit,
        total: countResult.rows[0]?.total || 0,
      },
    };
  }

  /**
   * Get interested customers from UKNOW WooCommerce API.
   *
   * @param {object} input
   * @returns {Promise<object>}
   */
  async getInterestedCustomersFromUknowApi({
    userId,
    limit: rawLimit,
    courseIds,
    courseQuery,
    customerType,
  }) {
    const axios = (await import('axios')).default;
    const baseUrl = process.env.UKNOW_API_URL || 'https://uknow.edu.vn/wp-json';
    const consumerKey = process.env.UKNOW_CONSUMER_KEY;
    const consumerSecret = process.env.UKNOW_CONSUMER_SECRET;

    if (!consumerKey || !consumerSecret) {
      const error = new Error('Chua cau hinh thong tin xac thuc UKNOW API');
      error.statusCode = 500;
      throw error;
    }

    const coursesResult = await db.query(
      `SELECT id, course_name, course_code
       FROM courses
       WHERE id_user = $1
       ORDER BY course_name ASC`,
      [userId]
    );

    const courseByCode = new Map();
    const courseById = new Map();
    coursesResult.rows.forEach((c) => {
      if (c.course_code) {
        const productId = parseInt(c.course_code, 10);
        if (Number.isFinite(productId)) {
          courseByCode.set(productId, {
            courseId: c.id,
            courseName: c.course_name,
            courseCode: c.course_code,
            productId,
          });
          courseById.set(c.id, productId);
        }
      }
    });

    const requestedLimit = Number.isFinite(parseInt(rawLimit, 10))
      ? parseInt(rawLimit, 10)
      : 1000;
    const limit = Math.max(1, Math.min(requestedLimit, 5000));

    const selectedCourseIdsFromDB = String(courseIds || '')
      .split(',')
      .map((v) => parseInt(v, 10))
      .filter((v, idx, arr) => Number.isFinite(v) && arr.indexOf(v) === idx);
    const selectedCourseIdSet = new Set(selectedCourseIdsFromDB);
    const selectedCourseMeta = coursesResult.rows
      .filter((course) => selectedCourseIdSet.has(parseInt(course.id, 10)))
      .map((course) => ({
        id: parseInt(course.id, 10),
        code: String(course.course_code || '').trim().toLowerCase(),
        name: String(course.course_name || '').trim().toLowerCase(),
      }));

    const selectedProductIds = selectedCourseIdsFromDB
      .map((courseId) => courseById.get(courseId))
      .filter((pid) => Number.isFinite(pid));
    const selectedProductIdSet = new Set(selectedProductIds);
    const normalizedCourseQuery = String(courseQuery || '').trim().toLowerCase();

    const rawCustomerType = String(customerType || '').trim().toLowerCase();
    const normalizedCustomerType = rawCustomerType === 'complete'
      ? 'purchased'
      : ['interested', 'purchased', 'both'].includes(rawCustomerType)
        ? rawCustomerType
        : 'interested';

    let orderStatus;
    if (normalizedCustomerType === 'purchased') {
      orderStatus = 'completed,processing';
    } else if (normalizedCustomerType === 'both') {
      orderStatus = 'on-hold,completed,processing';
    } else {
      orderStatus = 'on-hold';
    }

    const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const headers = {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    };

    const perPage = 100;
    let allOrders = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && allOrders.length < limit) {
      const response = await axios.get(`${baseUrl}/wc/v3/orders`, {
        headers,
        params: {
          page,
          per_page: perPage,
          status: orderStatus,
        },
      });

      if (!response.data || response.data.length === 0) {
        hasMore = false;
        break;
      }

      allOrders = allOrders.concat(response.data);
      const totalPages = parseInt(response.headers['x-wp-totalpages'] || 1, 10);
      if (page >= totalPages) hasMore = false;
      page += 1;
    }

    if (selectedProductIds.length > 0) {
      allOrders = allOrders.filter((order) =>
        (order.line_items || []).some((item) => {
          const productId = item.product_id || item.variation_id || 0;
          return selectedProductIds.includes(productId);
        })
      );
    }

    allOrders = allOrders.slice(0, limit);

    const customerMap = new Map();
    const courseCountMap = new Map();
    const matchesCourseQuery = (courseName, courseCode, productId) => {
      if (!normalizedCourseQuery) return true;
      const name = String(courseName || '').toLowerCase();
      const code = String(courseCode || '').toLowerCase();
      const pid = String(productId || '').toLowerCase();
      return (
        name.includes(normalizedCourseQuery) ||
        code.includes(normalizedCourseQuery) ||
        pid.includes(normalizedCourseQuery)
      );
    };

    allOrders.forEach((order) => {
      const customerId = order.customer_id || 0;
      const email = order.billing?.email || '';
      const phone = order.billing?.phone || '';
      const fullName = `${order.billing?.first_name || ''} ${order.billing?.last_name || ''}`.trim();
      const key = `${customerId}_${email}_${phone}`;

      (order.line_items || []).forEach((item) => {
        const productId = item.product_id || item.variation_id || 0;
        const courseInfo = courseByCode.get(productId);
        const courseId = Number.isFinite(parseInt(courseInfo?.courseId, 10))
          ? parseInt(courseInfo.courseId, 10)
          : null;
        const itemNameLower = String(item?.name || '').trim().toLowerCase();
        const isSelectedByCourseId = courseId !== null && selectedCourseIdSet.has(courseId);
        const isSelectedByProductId = selectedProductIdSet.has(productId);
        const isSelectedByNameOrCode = selectedCourseMeta.some((course) => (
          (course.name && itemNameLower.includes(course.name)) ||
          (course.code && itemNameLower.includes(course.code))
        ));
        const hasSelectedCourseFilter = selectedCourseIdsFromDB.length > 0;
        if (hasSelectedCourseFilter && !(
          isSelectedByCourseId ||
          isSelectedByProductId ||
          isSelectedByNameOrCode
        )) {
          return;
        }
        const courseName = courseInfo?.courseName || item.name || 'Khóa học không xác định';
        const courseCode = courseInfo?.courseCode || String(productId);
        if (!matchesCourseQuery(courseName, courseCode, productId)) {
          return;
        }
        if (!customerMap.has(key)) {
          customerMap.set(key, {
            customerId,
            courseId,
            fullName,
            email,
            phone,
            courseName,
            courseCode,
            orderStatus: order.status,
          });
        }

        if (courseInfo) {
          const count = courseCountMap.get(courseInfo.courseId) || 0;
          courseCountMap.set(courseInfo.courseId, count + 1);
        }
      });
    });

    const items = Array.from(customerMap.values());
    const courses = coursesResult.rows
      .filter((c) => {
        if (!normalizedCourseQuery) return true;
        const name = String(c.course_name || '').toLowerCase();
        const code = String(c.course_code || '').toLowerCase();
        return name.includes(normalizedCourseQuery) || code.includes(normalizedCourseQuery);
      })
      .map((c) => ({
        courseId: c.id,
        courseName: c.course_name,
        courseCode: c.course_code,
        totalItems: courseCountMap.get(c.id) || 0,
      }));

    return {
      items,
      courses,
      filters: {
        campaignId: null,
        courseIds: selectedCourseIdsFromDB,
        courseQuery: normalizedCourseQuery,
        customerType: normalizedCustomerType,
      },
      pagination: {
        limit,
        total: items.length,
      },
    };
  }
}

export default new CustomerInterestedService();
