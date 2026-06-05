import axios from 'axios';
import { paginate } from '../../helpers.js';
import courseRepository from '../../repositories/courses/course.repository.js';

class CourseService {
  constructor() {
    this.baseUrl = process.env.UKNOW_API_URL || 'https://founderai.biz/wp-json';
    this.consumerKey = process.env.UKNOW_CONSUMER_KEY;
    this.consumerSecret = process.env.UKNOW_CONSUMER_SECRET;
  }

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

  async fetchProductById(productId) {
    if (!productId) return null;

    try {
      const response = await axios.get(`${this.baseUrl}/wc/v3/products/${productId}`, {
        headers: this.getAuthHeaders(),
      });

      return response.data || null;
    } catch (error) {
      if (error.response?.status !== 404) {
        console.warn(`Không thể lấy thông tin product ${productId}:`, error.response?.status, error.message);
      }
      return null;
    }
  }

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

  normalizeCourseStatus(rawStatus) {
    const status = typeof rawStatus === 'string' ? rawStatus.trim().toLowerCase() : '';
    return status || 'publish';
  }

  mapCourse(row) {
    return {
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
  }

  parseStatuses(rawStatus) {
    return String(rawStatus || '')
      .split(',')
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean)
      .map((item) => this.normalizeCourseStatus(item))
      .filter((item, idx, arr) => item && arr.indexOf(item) === idx);
  }

  async getAll({ query, user }) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const search = (query.search || '').trim();
    const category = (query.category || '').trim();
    const statuses = this.parseStatuses(query.status);

    const { rows, total } = await courseRepository.list({
      userId: user.id,
      role: user.role,
      activeContext: user.activeContext,
      search,
      category,
      statuses,
      limit,
      offset,
    });

    return {
      courses: rows.map((row) => this.mapCourse(row)),
      pagination: paginate(page, limit, total),
    };
  }

  async getById({ courseId, user }) {
    const row = await courseRepository.findById(courseId);
    if (!row) {
      const error = new Error('Không tìm thấy khóa học');
      error.status = 404;
      throw error;
    }

    const isOwner = Number(row.id_user) === Number(user.id);
    const isContextOwner =
      user.activeContext?.type === 'employee' && Number(row.id_user) === Number(user.activeContext.ownerId);
    const isAdmin = user.role === 'admin';

    if (!isAdmin && !isOwner && !isContextOwner) {
      const error = new Error('Bạn không có quyền truy cập khóa học này');
      error.status = 403;
      throw error;
    }

    return this.mapCourse(row);
  }

  async syncCoursesFromFounderAI(userId = 1) {
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
              status: 'any',
            },
          });

          const orders = response.data || [];
          if (orders.length === 0) break;

          totalOrders += orders.length;

          for (const order of orders) {
            for (const lineItem of order.line_items || []) {
              totalLineItems += 1;
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
          page += 1;
        } catch (error) {
          console.error(`[Courses Sync] Lỗi khi tải trang orders ${page}:`, error.message);
          errors.push(`Lỗi tải orders trang ${page}: ${error.message}`);
          hasMore = false;
        }
      }

      const productIds = Array.from(productIdsSet);
      console.log(`[Courses Sync] Thu thập được ${productIds.length} unique products từ ${totalOrders} orders (${totalLineItems} line items)`);

      const existingCourses = await courseRepository.findAllByUser(userId);
      const existingCoursesMap = new Map();
      existingCourses.forEach((course) => {
        existingCoursesMap.set(course.course_code, course);
      });

      console.log(`[Courses Sync] Số khóa học trong database: ${existingCoursesMap.size}`);
      console.log('[Courses Sync] Bước 2: Fetch chi tiết products và sync vào DB...');

      for (const productId of productIds) {
        totalChecked += 1;

        const product = await this.fetchProductById(productId);

        if (!product) {
          console.warn(`[Courses Sync] Không lấy được thông tin product ${productId}, bỏ qua`);
          totalSkipped += 1;
          continue;
        }

        const courseCode = String(product.id);
        const existingCourse = existingCoursesMap.get(courseCode);
        const courseName = product.name?.trim() || `Product #${courseCode}`;
        const price = parseFloat(product.price) || 0;
        const originalPrice = parseFloat(product.regular_price) || price;
        const description = product.short_description?.trim() || product.description?.trim() || null;
        const category = product.categories?.[0]?.name?.trim() || null;
        const thumbnailUrl = product.permalink?.trim() || null;
        const status = this.normalizeCourseStatus(product.status);

        if (!existingCourse) {
          try {
            await courseRepository.insert({
              userId,
              courseCode,
              courseName,
              description,
              price,
              originalPrice,
              category,
              thumbnailUrl,
              status,
            });

            totalInserted += 1;
            console.log(`[Courses Sync] [${totalChecked}/${productIds.length}] Đã thêm mới: ${courseName} (Code: ${courseCode})`);
          } catch (error) {
            console.error(`[Courses Sync] Lỗi thêm khóa học ${courseCode}:`, error.message);
            errors.push(`Lỗi thêm ${courseCode}: ${error.message}`);
          }
          continue;
        }

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
            await courseRepository.update(existingCourse.id, {
              courseName,
              price,
              originalPrice,
              description,
              category,
              thumbnailUrl,
              status,
            });

            totalUpdated += 1;
            console.log(`[Courses Sync] [${totalChecked}/${productIds.length}] Đã cập nhật: ${courseName} (Code: ${courseCode})`);
          } catch (error) {
            console.error(`[Courses Sync] Lỗi cập nhật khóa học ${courseCode}:`, error.message);
            errors.push(`Lỗi cập nhật ${courseCode}: ${error.message}`);
          }
        } else if (totalChecked % 10 === 0) {
          console.log(`[Courses Sync] Progress: ${totalChecked}/${productIds.length} products đã kiểm tra`);
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

export default new CourseService();
