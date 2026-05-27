import * as adminPlansService from '../../services/admin/adminPlans.service.js';

function handleError(res, err) {
  if (err.status) return res.status(err.status).json({ success: false, message: err.message });
  if (err.code === '42703') {
    console.error('Admin plans error (missing DB column):', err);
    return res.status(500).json({
      success: false,
      message: 'Database trên server chưa cập nhật migration. Kiểm tra log backend (docker logs uknow-campaign-backend).',
    });
  }
  console.error('Admin plans error:', err);
  return res.status(500).json({ success: false, message: err.message || 'Lỗi server' });
}

/** GET /api/admin/plans/search-users?q=&excludeWithPlan=true */
export async function searchUsers(req, res) {
  try {
    const q = req.query.q || '';
    const excludeWithPlan = req.query.excludeWithPlan === 'true';
    const results = await adminPlansService.searchUsers(q, excludeWithPlan);
    return res.json({ success: true, data: results });
  } catch (err) { return handleError(res, err); }
}

/** GET /api/admin/plans */
export async function list(_req, res) {
  try {
    const plans = await adminPlansService.listPlans();
    return res.json({ success: true, data: plans });
  } catch (err) { return handleError(res, err); }
}

/** GET /api/admin/plans/custom-list?showHidden=true */
export async function listCustom(req, res) {
  try {
    const showHidden = req.query.showHidden === 'true';
    const plans = await adminPlansService.listCustomPlans({ showHidden });
    return res.json({ success: true, data: plans });
  } catch (err) { return handleError(res, err); }
}

/** POST /api/admin/plans */
export async function create(req, res) {
  try {
    const { code, name, price, priceYearly, description, features, maxEmployees, isActive, durationDays,
      dailyEmailLimit, monthlyEmailLimit, dailyZaloLimit, monthlyZaloLimit,
      maxLandingPages, maxCampaigns, maxZaloCampaigns, maxZaloGroupCampaigns, maxEmailCampaigns,
      maxZaloAccounts, maxEmailAccounts, maxEmailTemplates, maxZaloTemplates } = req.body;
    const plan = await adminPlansService.createNewPlan({
      code, name, price: Number(price), priceYearly, description, features,
      maxEmployees: Number(maxEmployees ?? 0), isActive, durationDays,
      dailyEmailLimit, monthlyEmailLimit, dailyZaloLimit, monthlyZaloLimit,
      maxLandingPages, maxCampaigns, maxZaloCampaigns, maxZaloGroupCampaigns, maxEmailCampaigns,
      maxZaloAccounts, maxEmailAccounts, maxEmailTemplates, maxZaloTemplates,
    });
    return res.status(201).json({ success: true, message: 'Tạo gói thành công', data: plan });
  } catch (err) { return handleError(res, err); }
}

/** PATCH /api/admin/plans/:id */
export async function update(req, res) {
  try {
    const { name, price, priceYearly, description, features, maxEmployees, isActive, durationDays,
      dailyEmailLimit, monthlyEmailLimit, dailyZaloLimit, monthlyZaloLimit,
      maxLandingPages, maxCampaigns, maxZaloCampaigns, maxZaloGroupCampaigns, maxEmailCampaigns,
      maxZaloAccounts, maxEmailAccounts, maxEmailTemplates, maxZaloTemplates } = req.body;
    const plan = await adminPlansService.editPlan(Number(req.params.id), {
      name, price: Number(price), priceYearly, description, features,
      maxEmployees: Number(maxEmployees ?? 0), isActive, durationDays,
      dailyEmailLimit, monthlyEmailLimit, dailyZaloLimit, monthlyZaloLimit,
      maxLandingPages, maxCampaigns, maxZaloCampaigns, maxZaloGroupCampaigns, maxEmailCampaigns,
      maxZaloAccounts, maxEmailAccounts, maxEmailTemplates, maxZaloTemplates,
    });
    return res.json({ success: true, message: 'Cập nhật gói thành công', data: plan });
  } catch (err) { return handleError(res, err); }
}

/** DELETE /api/admin/plans/:id — auto fallback sang soft delete nếu plan đã có order. */
export async function remove(req, res) {
  try {
    const result = await adminPlansService.removePlan(Number(req.params.id));
    return res.json({ success: true, message: result.message, data: result });
  } catch (err) { return handleError(res, err); }
}

/** POST /api/admin/plans/custom-with-payment — tạo gói riêng + tạo link thanh toán PayOS */
export async function createCustomWithPayment(req, res) {
  try {
    const { userEmail, name, code, price, priceYearly, description, maxEmployees, durationDays,
      dailyEmailLimit, monthlyEmailLimit, dailyZaloLimit, monthlyZaloLimit,
      maxLandingPages, maxCampaigns, maxZaloCampaigns, maxZaloGroupCampaigns, maxEmailCampaigns,
      maxZaloAccounts, maxEmailAccounts, maxEmailTemplates, maxZaloTemplates } = req.body;
    if (!userEmail) return res.status(400).json({ success: false, message: 'Vui lòng nhập email người dùng' });
    const result = await adminPlansService.createCustomPlanWithPayment(userEmail, {
      name, code, price: Number(price), priceYearly, description,
      maxEmployees: Number(maxEmployees ?? -1), durationDays,
      dailyEmailLimit, monthlyEmailLimit, dailyZaloLimit, monthlyZaloLimit,
      maxLandingPages, maxCampaigns, maxZaloCampaigns, maxZaloGroupCampaigns, maxEmailCampaigns,
      maxZaloAccounts, maxEmailAccounts, maxEmailTemplates, maxZaloTemplates,
    });
    return res.status(201).json({
      success: true,
      message: `Đã tạo gói "${result.plan.name}" và tạo link thanh toán cho ${result.user.email}`,
      data: { checkoutUrl: result.checkoutUrl, qrCode: result.qrCode, orderCode: result.orderCode, plan: result.plan },
    });
  } catch (err) { return handleError(res, err); }
}

/** POST /api/admin/plans/custom — tạo gói riêng + gán ngay cho user theo email */
export async function createCustom(req, res) {
  try {
    const { userEmail, name, code, price, priceYearly, description, maxEmployees, durationDays,
      dailyEmailLimit, monthlyEmailLimit, dailyZaloLimit, monthlyZaloLimit,
      maxLandingPages, maxCampaigns, maxZaloCampaigns, maxZaloGroupCampaigns, maxEmailCampaigns,
      maxZaloAccounts, maxEmailAccounts, maxEmailTemplates, maxZaloTemplates } = req.body;
    if (!userEmail) return res.status(400).json({ success: false, message: 'Vui lòng nhập email người dùng' });
    const result = await adminPlansService.createCustomPlanForUser(userEmail, {
      name, code, price: Number(price), priceYearly, description,
      maxEmployees: Number(maxEmployees ?? 0), durationDays,
      dailyEmailLimit, monthlyEmailLimit, dailyZaloLimit, monthlyZaloLimit,
      maxLandingPages, maxCampaigns, maxZaloCampaigns, maxZaloGroupCampaigns, maxEmailCampaigns,
      maxZaloAccounts, maxEmailAccounts, maxEmailTemplates, maxZaloTemplates,
    });
    return res.status(201).json({ success: true, message: `Đã tạo và gán gói "${result.plan.name}" cho ${result.assignedTo.email}`, data: result });
  } catch (err) { return handleError(res, err); }
}

/** POST /api/admin/plans/:id/assign */
export async function assign(req, res) {
  try {
    const { userEmail, paymentMethod = 'free', note = null } = req.body;
    if (!userEmail) return res.status(400).json({ success: false, message: 'Vui lòng nhập email người dùng' });
    if (!['manual', 'free'].includes(paymentMethod))
      return res.status(400).json({ success: false, message: 'paymentMethod phải là "manual" hoặc "free"' });
    const user = await adminPlansService.assignPlan(Number(req.params.id), userEmail, { paymentMethod, note });
    return res.json({ success: true, message: 'Gán gói cho người dùng thành công', data: user });
  } catch (err) { return handleError(res, err); }
}
