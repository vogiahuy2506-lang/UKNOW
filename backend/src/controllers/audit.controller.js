import auditService from '../services/audit.service.js';

function handleError(res, err) {
  console.error('[AuditController]', err);
  return res.status(500).json({ success: false, message: 'Lỗi server' });
}

function parseFilters(query) {
  const { actorId, action, entityType, startDate, endDate, page = '1', limit = '50' } = query;
  const parsedLimit = Math.min(Number(limit) || 50, 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * parsedLimit;
  return {
    actorId: actorId ? Number(actorId) : undefined,
    action: action || undefined,
    entityType: entityType || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    limit: parsedLimit,
    offset,
    page: Math.max(Number(page) || 1, 1),
  };
}

/**
 * GET /api/audit-logs
 * Employer: xem nhật ký hoạt động của workspace (mình + nhân viên).
 */
export async function getWorkspaceLogs(req, res) {
  try {
    const ownerId = req.user.id;
    const filters = parseFilters(req.query);
    const [logs, total] = await Promise.all([
      auditService.getWorkspaceLogs({ ownerId, ...filters }),
      auditService.countWorkspaceLogs({ ownerId, ...filters }),
    ]);
    return res.json({
      success: true,
      data: logs,
      pagination: { total, page: filters.page, limit: filters.limit, pages: Math.ceil(total / filters.limit) },
    });
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * GET /api/admin/audit-logs
 * Super admin: xem nhật ký sự kiện hệ thống.
 */
export async function getSystemLogs(req, res) {
  try {
    const filters = parseFilters(req.query);
    const [logs, total] = await Promise.all([
      auditService.getSystemLogs(filters),
      auditService.countSystemLogs(filters),
    ]);
    return res.json({
      success: true,
      data: logs,
      pagination: { total, page: filters.page, limit: filters.limit, pages: Math.ceil(total / filters.limit) },
    });
  } catch (err) {
    return handleError(res, err);
  }
}
