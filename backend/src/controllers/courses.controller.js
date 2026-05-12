import axios from 'axios';
import db from '../config/database.js';
import { serverError, paginate } from '../helpers.js';
import { buildUserScopeClause } from '../utils/roleScope.util.js';

class CoursesController {
  constructor() {
    this.baseUrl = process.env.UKNOW_API_URL || 'https://founderai.biz/wp-json';
    this.consumerKey = process.env.UKNOW_CONSUMER_KEY;
    this.consumerSecret = process.env.UKNOW_CONSUMER_SECRET;
  }

  /**
   * Lấy auth headers cho Founder AI API
   */
  getAuthHeaders() {
    if (!this.consumerKey || !this.consumerSecret) {
      throw new Error('Thiếu thông tin xác thực Founder AI API');
    }
    const credentials = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
    return {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Fetch chi tiết product từ Founder AI WooCommerce API
   * @param {string|number} productId - ID của product cần lấy
   * @returns {Promise<object|null>} Product data hoặc null nếu không tìm thấy
   */
  async fetchProductById(productId) {
    if (!productId) return null;

    try {
      const response = await axios.get(`${this.baseUrl}/wc/v3/products/${productId}`, {
        headers: this.getAuthHeaders(),
      });

      return response.data || null;
    } catch (error) {
      // Nếu product không tồn tại (404) hoặc lỗi khác, return null
      if (error.response?.status !== 404) {
        console.warn(`Không thể lấy thông tin product ${productId}:`, error.response?.status, error.message);
      }
      return null;
    }
  }

  /**
   * Lấy product_id từ line item
   */
  getLineItemProductId(lineItem = {}) {
    if (lineItem?.product_id) return String(lineItem.product_id);

    if (Array.isArray(lineItem?.meta_data)) {
      const meta = lineItem.meta_data.find((item) =>
        ['_course_id', 'course_id', 'product_id'].includes(String(item?.key || '').toLowerCase())
      );
      if (meta?.value !== undefined && meta?.value !== null && String(meta.value).trim().length > 0) {
        return String(meta.value).trim();
      }
    }

    return null;
  }

  /**
   * Chuẩn hóa trạng thái khóa học trước khi lưu DB.
   * @param {string|null|undefined} rawStatus
   * @returns {string}
   */
  normalizeCourseStatus(rawStatus) {
    const status = typeof rawStatus === 'string' ? rawStatus.trim().toLowerCase() : '';
    return status || 'publish';
  }

  /**
   * Lấy danh sách khóa học (có phân trang và tìm kiếm)
   * GET /api/courses?page=1&limit=20&search=keyword&category=...&status=publish,pending
   */
  async getAll(req, res) {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
      const offset = (page - 1) * limit;
      const search = (req.query.search || '').trim();
      const category = (req.query.category || '').trim();
      const selectedStatuses = String(req.query.status || '')
        .split(',')
        .map((item) => String(item || '').trim().toLowerCase())
        .filter(Boolean)
        .map((item) => this.normalizeCourseStatus(item))
        .filter((item, idx, arr) => item && arr.indexOf(item) === idx);

      let query = `
        SELECT 
          id,
          course_code,
          course_name,
          price,
          original_price,
          status,
          description,
          category,
          thumbnail_url,
          created_at,
          updated_at
        FROM courses AS courses
      `;
      
      const { id: userId, role, activeContext } = req.user;
      const { clause: scopeClause, params: scopedParams } = buildUserScopeClause({
        tableAlias: 'courses',
        userId,
        role,
        activeContext
      });

      const params = [...scopedParams];
      const whereClauses = [];
      if (scopeClause) whereClauses.push(scopeClause);
      
      let paramIndex = params.length + 1;
      
      if (search) {
        whereClauses.push(`course_name ILIKE $${paramIndex}`);
        params.push(`%${search}%`);
        paramIndex++;
      }

      if (category) {
        whereClauses.push(`category ILIKE $${paramIndex}`);
        params.push(`%${category}%`);
        paramIndex++;
      }

      if (selectedStatuses.length > 0) {
        whereClauses.push(`status = ANY($${paramIndex})`);
        params.push(selectedStatuses);
        paramIndex++;
      }

      if (whereClauses.length > 0) {
        query += ` WHERE ${whereClauses.join(' AND ')}`;
      }

      // Đếm tổng số
      const countQuery = whereClauses.length > 0
        ? `SELECT COUNT(*) FROM courses AS courses WHERE ${whereClauses.join(' AND ')}`
        : `SELECT COUNT(*) FROM courses`;
      
      const countResult = await db.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count);

      // Lấy dữ liệu với phân trang
      query += ` ORDER BY updated_at DESC, id DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await db.query(query, params);

      const courses = result.rows.map(row => ({
        id: row.id,
        courseCode: row.course_code,
        courseName: row.course_name,
        price: parseFloat(row.price) || 0,
        originalPrice: parseFloat(row.original_price) || 0,
        status: this.normalizeCourseStatus(row.status),
        description: row.description,
        category: row.category,
        thumbnailUrl: row.thumbnail_url,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      return res.json({
        success: true,
        data: {
          courses,
          pagination: paginate(page, limit, total),
        },
      });
    } catch (error) {
      return serverError(res, 'getAll courses', error);
    }
  }

  /**
   * Lấy thông tin một khóa học theo ID
   * GET /api/courses/:id
   */
  async getById(req, res) {
    try {
      const { id } = req.params;

      const result = await db.query(
        `SELECT 
          id,
          id_user,
          course_code,
          course_name,
          price,
          original_price,
          status,
          description,
          category,
          thumbnail_url,
          created_at,
          updated_at
        FROM courses
        WHERE id = $1`,
        [id]
      );

      const courseRaw = result.rows[0];
      if (!courseRaw) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy khóa học',
        });
      }

      // Kiểm tra quyền sở hữu (trừ admin)
      const { id: userId, role, activeContext } = req.user;
      const isOwner = Number(courseRaw.id_user) === Number(userId);
      const isContextOwner = activeContext?.type === 'employee' && Number(courseRaw.id_user) === Number(activeContext.ownerId);
      const isAdmin = role === 'admin';

      if (!isAdmin && !isOwner && !isContextOwner) {
        return res.status(403).json({
          success: false,
          message: 'Bạn không có quyền truy cập khóa học này',
        });
      }

      const row = courseRaw;
      const course = {
        id: row.id,
        courseCode: row.course_code,
        courseName: row.course_name,
        price: parseFloat(row.price) || 0,
        originalPrice: parseFloat(row.original_price) || 0,
        status: this.normalizeCourseStatus(row.status),
        description: row.description,
        category: row.category,
        thumbnailUrl: row.thumbnail_url,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };

      return res.json({
        success: true,
        data: course,
      });
    } catch (error) {
      return serverError(res, 'getById course', error);
    }
  }

  /**
   * Đồng bộ khóa học từ Founder AI API (thủ công)
   * POST /api/courses/sync
   */
  async syncManual(req, res) {
    try {
      const userId = req.user.id;
      const effectiveOwnerId = req.user.activeContext?.type === 'employee'
        ? req.user.activeContext.ownerId
        : userId;
      
      console.log(`[Manual Sync] Bắt đầu đồng bộ khóa học bởi user ${userId} cho owner ${effectiveOwnerId}`);
      const result = await this.syncCoursesFromUknow(effectiveOwnerId);
      
      return res.json({
        success: result.success,
        message: result.success 
          ? `Đồng bộ thành công: ${result.totalInserted} khóa học mới, ${result.totalUpdated} khóa học được cập nhật`
          : 'Đồng bộ thất bại',
        data: result,
      });
    } catch (error) {
      return serverError(res, 'syncManual courses', error);
    }
  }

  /**
   * Đồng bộ khóa học từ Founder AI API bằng cách:
   * 1. Lấy tất cả orders (phân trang)
   * 2. Thu thập product_id từ line_items
   * 3. Fetch chi tiết từng product qua /wc/v3/products/:product_id
   * 4. INSERT/UPDATE vào database
   * @param {number} userId - ID của user
   */
  async syncCoursesFromUknow(userId = 1) {
    const startTime = Date.now();
    let totalOrders = 0;
    let totalLineItems = 0;
    let totalChecked = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    const errors = [];

    try {
      console.log('[Courses Sync] Bắt đầu đồng bộ khóa học từ Founder AI API (qua orders)');

      // Bước 1: Lấy tất cả orders từ Founder AI API (phân trang)
      let page = 1;
      let hasMore = true;
      const productIdsSet = new Set();

      console.log('[Courses Sync] Bước 1: Thu thập product_id từ orders...');

      while (hasMore) {
        try {
          const response = await axios.get(`${this.baseUrl}/wc/v3/orders`, {
            headers: this.getAuthHeaders(),
            params: {
              page,
              per_page: 100,
              status: 'any', // Lấy tất cả trạng thái orders
            },
          });

          const orders = response.data || [];
          if (orders.length === 0) break;

          totalOrders += orders.length;

          // Thu thập product_id từ line_items
          for (const order of orders) {
            for (const lineItem of order.line_items || []) {
              totalLineItems++;
              const productId = this.getLineItemProductId(lineItem);
              if (productId) {
                productIdsSet.add(productId);
              }
            }
          }

          const totalPages = parseInt(response.headers['x-wp-totalpages'] || 1, 10);
          if (page === 1) {
            console.log(`[Courses Sync] Tổng số trang orders: ${totalPages}`);
          }

          console.log(`[Courses Sync] Đã tải trang ${page}/${totalPages} (${orders.length} orders, ${productIdsSet.size} unique products)`);

          hasMore = page < totalPages;
          page++;
        } catch (error) {
          console.error(`[Courses Sync] Lỗi khi tải trang orders ${page}:`, error.message);
          errors.push(`Lỗi tải orders trang ${page}: ${error.message}`);
          hasMore = false;
        }
      }

      const productIds = Array.from(productIdsSet);
      console.log(`[Courses Sync] Thu thập được ${productIds.length} unique products từ ${totalOrders} orders (${totalLineItems} line items)`);

      // Bước 2: Lấy tất cả courses hiện có trong database của user này
      const existingCoursesResult = await db.query(
        `SELECT id, course_code, course_name, price, original_price, description, category, thumbnail_url, status
         FROM courses
         WHERE id_user = $1`,
        [userId]
      );

      const existingCoursesMap = new Map();
      existingCoursesResult.rows.forEach(course => {
        existingCoursesMap.set(course.course_code, course);
      });

      console.log(`[Courses Sync] Số khóa học trong database: ${existingCoursesMap.size}`);
      console.log('[Courses Sync] Bước 2: Fetch chi tiết products và sync vào DB...');

      // Bước 3: Fetch chi tiết từng product và sync vào DB
      for (const productId of productIds) {
        totalChecked++;

        // Fetch chi tiết product từ API
        const product = await this.fetchProductById(productId);

        if (!product) {
          console.warn(`[Courses Sync] Không lấy được thông tin product ${productId}, bỏ qua`);
          totalSkipped++;
          continue;
        }

        const courseCode = String(product.id);
        const existingCourse = existingCoursesMap.get(courseCode);

        // Chuẩn bị dữ liệu từ API
        const courseName = product.name?.trim() || `Product #${courseCode}`;
        const price = parseFloat(product.price) || 0;
        const originalPrice = parseFloat(product.regular_price) || price;
        const description = product.short_description?.trim() || product.description?.trim() || null;
        const category = product.categories?.[0]?.name?.trim() || null;
        const thumbnailUrl = product.permalink?.trim() || null; // Lưu permalink vào thumbnail_url
        const status = this.normalizeCourseStatus(product.status);

        if (!existingCourse) {
          // INSERT khóa học mới
          try {
            await db.query(
              `INSERT INTO courses (
                id_user, course_code, course_name, description,
                price, original_price, category, thumbnail_url, status
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [userId, courseCode, courseName, description, price, originalPrice, category, thumbnailUrl, status]
            );

            totalInserted++;
            console.log(`[Courses Sync] [${totalChecked}/${productIds.length}] Đã thêm mới: ${courseName} (Code: ${courseCode})`);
          } catch (error) {
            console.error(`[Courses Sync] Lỗi thêm khóa học ${courseCode}:`, error.message);
            errors.push(`Lỗi thêm ${courseCode}: ${error.message}`);
          }
        } else {
          // So sánh và UPDATE nếu có thay đổi
          const hasChanged = 
            existingCourse.course_name !== courseName ||
            parseFloat(existingCourse.price) !== price ||
            parseFloat(existingCourse.original_price) !== originalPrice ||
            existingCourse.description !== description ||
            existingCourse.category !== category ||
            existingCourse.thumbnail_url !== thumbnailUrl ||
            this.normalizeCourseStatus(existingCourse.status) !== status;

          if (hasChanged) {
            try {
              await db.query(
                `UPDATE courses
                 SET
                   course_name = $1,
                   price = $2,
                   original_price = $3,
                   description = $4,
                   category = $5,
                   thumbnail_url = $6,
                   status = $7,
                   updated_at = CURRENT_TIMESTAMP
                 WHERE id = $8`,
                [courseName, price, originalPrice, description, category, thumbnailUrl, status, existingCourse.id]
              );

              totalUpdated++;
              console.log(`[Courses Sync] [${totalChecked}/${productIds.length}] Đã cập nhật: ${courseName} (Code: ${courseCode})`);
            } catch (error) {
              console.error(`[Courses Sync] Lỗi cập nhật khóa học ${courseCode}:`, error.message);
              errors.push(`Lỗi cập nhật ${courseCode}: ${error.message}`);
            }
          } else {
            // Không có thay đổi, log progress mỗi 10 items
            if (totalChecked % 10 === 0) {
              console.log(`[Courses Sync] Progress: ${totalChecked}/${productIds.length} products đã kiểm tra`);
            }
          }
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      const result = {
        success: true,
        totalOrders,
        totalLineItems,
        totalChecked,
        totalInserted,
        totalUpdated,
        totalSkipped,
        totalExisting: existingCoursesMap.size,
        uniqueProductsFromOrders: productIds.length,
        duration: `${duration}s`,
        errors: errors.length > 0 ? errors : undefined,
      };

      console.log(`[Courses Sync] Hoàn thành: Đã kiểm tra ${totalChecked} products, thêm mới ${totalInserted}, cập nhật ${totalUpdated}, bỏ qua ${totalSkipped} trong ${duration}s`);
      
      if (errors.length > 0) {
        console.warn(`[Courses Sync] Có ${errors.length} lỗi xảy ra`);
      }

      return result;
    } catch (error) {
      console.error('[Courses Sync] Lỗi nghiêm trọng:', error.message);
      return {
        success: false,
        totalOrders,
        totalLineItems,
        totalChecked,
        totalInserted,
        totalUpdated,
        totalSkipped,
        error: error.message,
        errors,
      };
    }
  }
}

export default new CoursesController();
