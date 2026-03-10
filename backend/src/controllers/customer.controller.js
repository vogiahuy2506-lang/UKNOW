import campaignCustomerRepository from '../repositories/campaign/campaignCustomer.repository.js';
import customerHelperService from '../services/customer/customerHelper.service.js';
import customerQueryService from '../services/customer/customerQuery.service.js';
import customerInterestedService from '../services/customer/customerInterested.service.js';
import customerJourneyService from '../services/customer/customerJourney.service.js';
import customerProfileService from '../services/customer/customerProfile.service.js';
import customerCampaignJourneyDetailService from '../services/customer/customerCampaignJourneyDetail.service.js';
import customerEmailTrackingService from '../services/customer/customerEmailTracking.service.js';
import customerZaloTrackingService from '../services/customer/customerZaloTracking.service.js';
import customerMutationService from '../services/customer/customerMutation.service.js';

class CustomerController {
  sendTrackingPixel(res) {
    return customerHelperService.sendTrackingPixel(res);
  }

  mapJourneyEvent(row) {
    return customerHelperService.mapJourneyEvent(row);
  }

  async ensureCampaignParticipation(client, campaignId, customerId, runId = null) {
    await campaignCustomerRepository.ensureCampaignParticipation(client, campaignId, customerId, runId);
  }

  async resolvePurchaseOrderStatusExpr(alias = 'cp') {
    return customerHelperService.resolvePurchaseOrderStatusExpr(alias);
  }

  normalizeCustomerSource(value) {
    return customerHelperService.normalizeCustomerSource(value);
  }

  // Lấy danh sách customers
  /**
   * Lấy danh sách khách hàng của user (phân trang, lọc theo status/source/campaign/search).
   * @param {import('express').Request} req - query: { page, limit, status, search, source, campaignId }
   * @param {import('express').Response} res
   */
  async getAll(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 10, status, search, source, campaignId } = req.query;
      const purchaseOrderStatusExpr = await this.resolvePurchaseOrderStatusExpr('cp');
      const data = await customerQueryService.getAllCustomers({
        userId,
        page,
        limit,
        status,
        search,
        source,
        campaignId,
        purchaseOrderStatusExpr,
      });

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error('Get customers error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  }

  /**
   * Lấy danh sách tin nhắn Zalo group đã gửi trong một chiến dịch.
   * Dùng cho tab thống kê click/nội dung tin ở trang khách hàng chiến dịch Zalo group.
   *
   * @param {import('express').Request} req - params: { campaignId }, query: { page?, limit?, search? }
   * @param {import('express').Response} res
   * @returns {Promise<void>}
   */
  async getCampaignZaloGroupMessages(req, res) {
    try {
      const userId = req.user.id;
      const purchaseOrderStatusExpr = await this.resolvePurchaseOrderStatusExpr('cp');
      const data = await customerQueryService.getCampaignZaloGroupMessages({
        userId,
        campaignId: req.params.campaignId,
        page: req.query.page,
        limit: req.query.limit,
        search: req.query.search,
        purchaseOrderStatusExpr,
      });

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
      }
      console.error('Get campaign zalo group messages error:', error);
      return res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    }
  }
  // Lay danh sach khach hang da de lai thong tin va khoa hoc quan tam/mua on-hold
  /**
   * Lấy danh sách khách hàng đã để lại thông tin quan tâm hoặc đã mua khoá học.
   * @param {import('express').Request} req - query: { page, limit, search, courseCode, status, campaignId, courseQuery }
   * @param {import('express').Response} res
   */
  async getInterestedCustomersWithCourses(req, res) {
    try {
      const userId = req.user.id;
      const purchaseOrderStatusExpr = await this.resolvePurchaseOrderStatusExpr('cp');
      const data = await customerInterestedService.getInterestedCustomersWithCourses({
        userId,
        campaignId: req.query.campaignId,
        limit: req.query.limit,
        courseIds: req.query.courseIds,
        courseStatuses: req.query.courseStatuses,
        courseQuery: req.query.courseQuery,
        customerType: req.query.customerType,
        purchaseOrderStatusExpr,
      });

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error('Get interested customers with courses error:', error);
      res.status(500).json({
        success: false,
        message: 'Khong the lay du lieu khach hang de lai thong tin',
      });
    }
  }

  /**
   * Lấy danh sách khách hàng từ UKNOW API dựa trên orders
   * Map course_code (DB) với product_id (API)
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getInterestedCustomersFromUknowApi(req, res) {
    try {
      const userId = req.user.id;
      const data = await customerInterestedService.getInterestedCustomersFromUknowApi({
        userId,
        limit: req.query.limit,
        courseIds: req.query.courseIds,
        courseQuery: req.query.courseQuery,
        customerType: req.query.customerType,
      });

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error('Get interested customers from UKNOW API error:', error.response?.data || error.message);
      res.status(500).json({
        success: false,
        message: 'Khong the lay du lieu khach hang tu UKNOW API',
      });
    }
  }

  // Lấy chi tiết customer
  /**
   * Lấy thông tin chi tiết khách hàng: thông tin cơ bản, lịch sử mua hàng, email journey, hành trình.
   * @param {import('express').Request} req - params: { id }
   * @param {import('express').Response} res
   */
  async getById(req, res) {
    try {
      const userId = req.user.id;
      const customerId = parseInt(req.params.id, 10);
      const data = await customerProfileService.getById({
        userId,
        customerId,
      });
      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy khách hàng'
        });
      }

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error('Get customer error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  }

  // Tạo mới customer
  // Lấy danh sách campaign mà customer đã tham gia
  /**
   * Lấy danh sách các campaign mà khách hàng đã tham gia.
   * @param {import('express').Request} req - params: { id }
   * @param {import('express').Response} res
   */
  async getCampaignParticipations(req, res) {
    try {
      const userId = req.user.id;
      const customerId = parseInt(req.params.id, 10);
      const data = await customerJourneyService.getCampaignParticipations({
        userId,
        customerId,
      });

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
      }
      console.error('Get campaign participations error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    }
  }

  // Lấy hành trình customer (hỗ trợ lọc theo campaign)
  /**
   * Lấy hành trình tương tác của khách hàng (tất cả sự kiện journey_events), có thể lọc theo campaign.
   * @param {import('express').Request} req - params: { id }, query: { campaignId?, page?, limit? }
   * @param {import('express').Response} res
   */
  async getJourney(req, res) {
    try {
      const userId = req.user.id;
      const customerId = parseInt(req.params.id, 10);
      const { timeline, summary } = await customerJourneyService.getJourney({
        userId,
        customerId,
        campaignId: req.query.campaignId,
      });

      res.json({
        success: true,
        data: timeline,
        summary,
      });
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
      }
      console.error('Get customer journey error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    }
  }

  // Chi tiết hành trình customer trong 1 campaign
  /**
   * Lấy chi tiết hành trình của khách hàng trong một campaign cụ thể: email, mua hàng, sự kiện.
   * @param {import('express').Request} req - params: { id, campaignId }
   * @param {import('express').Response} res
   */
  async getCampaignJourneyDetail(req, res) {
    try {
      const userId = req.user.id;
      const customerId = parseInt(req.params.id, 10);
      const campaignId = parseInt(req.params.campaignId, 10);
      const data = await customerCampaignJourneyDetailService.getCampaignJourneyDetail({
        userId,
        customerId,
        campaignId,
      });

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
      }
      console.error('Get campaign journey detail error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    }
  }

  // Tracking mở email qua pixel
  /**
   * Tracking email open: trả về ảnh pixel 1x1 và ghi nhận sự kiện mở email.
   * Endpoint công khai (không cần auth). Token được nhúng trong URL email.
   * @param {import('express').Request} req - params: { token }
   * @param {import('express').Response} res
   */
  async trackEmailOpen(req, res) {
    return customerEmailTrackingService.trackEmailOpen(this, req, res);
  }
  // Tracking click link trong email
  /**
   * Tracking email click: ghi nhận sự kiện click và redirect khách hàng đến URL gốc.
   * Endpoint công khai (không cần auth). Token được nhúng trong URL email.
   * @param {import('express').Request} req - params: { token }
   * @param {import('express').Response} res
   */
  async trackEmailClick(req, res) {
    return customerEmailTrackingService.trackEmailClick(req, res);
  }

  /**
   * Xử lý yêu cầu hủy đăng ký email (unsubscribe) từ link trong email.
   * Endpoint công khai (không cần auth). Token được nhúng trong link email.
   * @param {import('express').Request} req - params: { token }
   * @param {import('express').Response} res
   */
  async trackEmailUnsubscribe(req, res) {
    return customerEmailTrackingService.trackEmailUnsubscribe(req, res);
  }

  /**
   * Tracking click link trong tin nhắn Zalo và redirect tới URL gốc.
   * Endpoint công khai (không cần auth).
   *
   * @param {import('express').Request} req - params: { token }
   * @param {import('express').Response} res
   */
  async trackZaloClick(req, res) {
    return customerZaloTrackingService.trackZaloClick(req, res);
  }

  /**
   * Tạo mới một khách hàng.
   * @param {import('express').Request} req - body: { email, phone, fullName, gender, customerSource, notes }
   * @param {import('express').Response} res
   */
  async create(req, res) {
    return customerMutationService.create(this, req, res);
  }

  // Bulk import/update customers
  /**
   * Import/upsert hàng loạt khách hàng. Hỗ trợ match theo email, phone hoặc cả hai.
   * Nếu có campaignId, tự động liên kết khách hàng vào campaign.
   * @param {import('express').Request} req - body: { items: Array, campaignId?, upsertBy?: 'email'|'phone'|'email_or_phone' }
   * @param {import('express').Response} res
   */
  async bulkUpsert(req, res) {
    return customerMutationService.bulkUpsert(this, req, res);
  }

  // Cập nhật customer
  /**
   * Cập nhật thông tin khách hàng.
   * @param {import('express').Request} req - params: { id }, body: { email, phone, fullName, gender, customerSource, notes, customFields }
   * @param {import('express').Response} res
   */
  async update(req, res) {
    return customerMutationService.update(this, req, res);
  }

  // Xóa customer
  /**
   * Xóa khách hàng.
   * @param {import('express').Request} req - params: { id }
   * @param {import('express').Response} res
   */
  async delete(req, res) {
    return customerMutationService.delete(req, res);
  }

}

export default new CustomerController();





