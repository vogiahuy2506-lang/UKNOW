export function getRequestAuditContext(req) {
  return {
    ipAddress: req?.ip || req?.connection?.remoteAddress || null,
    userAgent: req?.headers?.['user-agent'] || null,
  };
}

export function getWorkspaceAuditContext(req) {
  const userId = req.user?.id;
  const ownerId = req.user?.activeContext?.type === 'employee'
    ? req.user.activeContext.ownerId
    : userId;

  return {
    userId,
    ownerId,
    ...getRequestAuditContext(req),
  };
}

export function getSystemAuditContext(req) {
  return {
    userId: req.user?.id,
    ownerId: null,
    ...getRequestAuditContext(req),
  };
}
