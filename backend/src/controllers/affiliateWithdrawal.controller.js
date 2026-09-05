import * as affiliateWithdrawalService from '../services/affiliate/affiliateWithdrawal.service.js';

export async function requestWithdrawal(req, res) {
  try {
    const userId = req.user?.id;
    const userEmail = req.user?.email || '';
    const withdrawal = await affiliateWithdrawalService.requestWithdrawal(
      userId,
      req.body,
      { userEmail }
    );

    return res.status(201).json({
      success: true,
      message: 'Tạo yêu cầu rút hoa hồng thành công',
      data: withdrawal,
    });
  } catch (error) {
    if (
      error.code === '23505' &&
      String(error.constraint || error.detail || '').includes('idx_affiliate_withdrawals_one_pending')
    ) {
      return res.status(400).json({
        success: false,
        code: 'ALREADY_HAS_PENDING_WITHDRAWAL',
        message: 'Bạn đang có một yêu cầu rút tiền đang chờ xử lý. Vui lòng đợi hoàn tất trước khi tạo yêu cầu mới.',
      });
    }

    if (error.status) {
      return res.status(error.status).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }

    console.error('[AffiliateWithdrawalController] requestWithdrawal error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi tạo yêu cầu rút hoa hồng',
    });
  }
}

export async function getPrefill(req, res) {
  try {
    const userId = req.user?.id;
    const prefillData = await affiliateWithdrawalService.getUserWithdrawalPrefill(userId);
    return res.json({
      success: true,
      data: prefillData,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    console.error('[AffiliateWithdrawalController] getPrefill error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy thông tin điền sẵn',
    });
  }
}

export async function getMyWithdrawals(req, res) {
  try {
    const userId = req.user?.id;
    const withdrawals = await affiliateWithdrawalService.getUserWithdrawals(userId);
    return res.json({
      success: true,
      data: withdrawals,
    });
  } catch (error) {
    console.error('[AffiliateWithdrawalController] getMyWithdrawals error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách yêu cầu rút',
    });
  }
}

export async function adminList(req, res) {
  try {
    const { status, limit, offset } = req.query;
    const withdrawals = await affiliateWithdrawalService.adminListWithdrawals({
      status,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    return res.json({
      success: true,
      data: withdrawals,
    });
  } catch (error) {
    console.error('[AffiliateWithdrawalController] adminList error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách yêu cầu rút cho admin',
    });
  }
}

export async function adminApprove(req, res) {
  try {
    const adminUserId = req.user?.id;
    const withdrawalId = req.params.id;
    const updated = await affiliateWithdrawalService.approveWithdrawal(adminUserId, withdrawalId);
    return res.json({
      success: true,
      message: 'Đã xác nhận chuyển khoản thành công',
      data: updated,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    console.error('[AffiliateWithdrawalController] adminApprove error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi duyệt yêu cầu rút',
    });
  }
}

export async function adminReject(req, res) {
  try {
    const adminUserId = req.user?.id;
    const withdrawalId = req.params.id;
    const { reason } = req.body || {};
    const updated = await affiliateWithdrawalService.rejectWithdrawal(
      adminUserId,
      withdrawalId,
      reason
    );
    return res.json({
      success: true,
      message: 'Đã từ chối yêu cầu rút và hoàn tiền lại ví đối tác',
      data: updated,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    console.error('[AffiliateWithdrawalController] adminReject error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi từ chối yêu cầu rút',
    });
  }
}

export async function getOverview(req, res) {
  try {
    const userId = req.user?.id;
    const overview = await affiliateWithdrawalService.getAffiliateOverview(userId);
    return res.json({
      success: true,
      data: overview,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    console.error('[AffiliateWithdrawalController] getOverview error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi tải dữ liệu tổng quan đối tác',
    });
  }
}

export async function adminLedgerAdjustment(req, res) {
  try {
    const adminUserId = req.user?.id;
    const { userId, amount, note } = req.body || {};

    const result = await affiliateWithdrawalService.createLedgerAdjustment({
      adminUserId,
      targetUserId: userId,
      amount,
      note,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    return res.status(201).json({
      success: true,
      message: 'Đã ghi nhận bút toán điều chỉnh số dư thành công',
      data: result,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        code: error.code,
        currentBalance: error.currentBalance,
        message: error.message,
      });
    }
    console.error('[AffiliateWithdrawalController] adminLedgerAdjustment error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi ghi nhận bút toán điều chỉnh',
    });
  }
}

export async function adminListPeriods(req, res) {
  try {
    const { monthKey, limit, offset } = req.query || {};
    const periods = await affiliateWithdrawalService.getAdminAffiliatePeriods({
      monthKey,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    return res.json({
      success: true,
      data: periods,
    });
  } catch (error) {
    console.error('[AffiliateWithdrawalController] adminListPeriods error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách doanh số đối tác theo tháng',
    });
  }
}

export async function adminListAvailableMonths(req, res) {
  try {
    const months = await affiliateWithdrawalService.getAdminAvailableMonths();
    return res.json({
      success: true,
      data: months,
    });
  } catch (error) {
    console.error('[AffiliateWithdrawalController] adminListAvailableMonths error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách các tháng có dữ liệu',
    });
  }
}

