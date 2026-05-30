export const getPostAuthPath = (user, activeContext) => {
  const role = user?.role || user?.roleCode;
  if (role === 'admin' || role === 'super_admin') return '/admin';
  if (activeContext?.type === 'employee') return '/app';
  if (user?.active_plan_id) return '/app';
  if (Array.isArray(user?.memberships) && user.memberships.length > 0) return '/app';
  return '/';
};
