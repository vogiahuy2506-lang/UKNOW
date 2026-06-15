import {
  findAllPlans,
  findCustomPlans,
  findPlanById,
  findPlanByCode,
  createPlan,
  updatePlan,
  deletePlan,
  countOrdersForPlan,
  softDeletePlan,
  unassignPlanFromUsers,
  findUserAdminByEmail,
  searchUserAdminsByEmail,
  assignPlanToUser,
  createAndAssignCustomPlan,
  getPlanUserCounts,
} from '../../repositories/admin/adminPlans.repository.js';
import { createOrder, deleteOrderByCode } from '../../repositories/payment/payment.repository.js';
import payosClient from '../../utils/payos.util.js';

const assertPaymentEnv = () => {
  const missing = ['PAYOS_CLIENT_ID', 'PAYOS_API_KEY', 'PAYOS_CHECKSUM_KEY', 'FRONTEND_URL']
    .filter((key) => !String(process.env[key] || '').trim());
  if (missing.length) {
    throw { status: 503, message: `Thiếu cấu hình thanh toán trên server: ${missing.join(', ')}` };
  }
};

const mapPaymentProviderError = (err) => {
  if (err?.status) return err;
  const message = String(err?.message || err?.desc || err?.response?.data?.desc || '').trim();
  if (message) return { status: 502, message: `PayOS: ${message}` };
  return { status: 502, message: 'Không thể tạo link thanh toán PayOS. Kiểm tra cấu hình PAYOS_* trên VPS.' };
};

export async function listPlans() {
  const [plans, counts] = await Promise.all([findAllPlans(), getPlanUserCounts()]);
  // Repository alias các cột về camelCase ("planId", "userCount") — phải dùng đúng key
  // nếu không countMap rỗng và user_count luôn fallback về 0.
  const countMap = Object.fromEntries(counts.map((c) => [c.planId, Number(c.userCount)]));
  return plans.map((p) => ({ ...p, user_count: countMap[p.id] || 0 }));
}

export async function listCustomPlans({ showHidden = false } = {}) {
  return findCustomPlans({ showHidden });
}

export async function getPlan(id) {
  const plan = await findPlanById(id);
  if (!plan) throw { status: 404, message: 'Không tìm thấy gói dịch vụ' };
  return plan;
}

const parseLimitField = (v) => (v === '' || v === null || v === undefined) ? null : Number(v);
const parseOptionalMoneyField = (v, label = 'Giá tiền', { emptyWhenZero = false } = {}) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw { status: 400, message: `${label} không hợp lệ` };
  if (emptyWhenZero && n === 0) return null;
  return n;
};

export async function createNewPlan({ code, name, price, priceYearly, description, features, maxEmployees, isActive = true,
  durationDays, dailyEmailLimit, monthlyEmailLimit, dailyZaloLimit, monthlyZaloLimit,
  messagesPerPeriod, isFupEnabled,
  maxLandingPages, maxCampaigns, maxZaloCampaigns, maxZaloGroupCampaigns, maxEmailCampaigns,
  maxZaloAccounts, maxEmailAccounts, maxEmailTemplates, maxZaloTemplates, aiTokensPerPeriod }) {
  if (!name?.trim()) throw { status: 400, message: 'Tên gói không được để trống' };
  if (price === undefined || price < 0) throw { status: 400, message: 'Giá tiền không hợp lệ' };
  const normalizedCode = code?.trim() || null;
  if (normalizedCode) {
    const existingPlan = await findPlanByCode(normalizedCode);
    if (existingPlan) throw { status: 409, message: `Mã gói "${normalizedCode}" đã tồn tại` };
  }
  try {
    return await createPlan({
      code: normalizedCode, name: name.trim(), price, priceYearly: parseOptionalMoneyField(priceYearly, 'Giá năm', { emptyWhenZero: true }),
      description, features, maxEmployees: maxEmployees ?? 0, isActive,
      durationDays:            parseLimitField(durationDays),
      dailyEmailLimit:         parseLimitField(dailyEmailLimit),
      monthlyEmailLimit:       parseLimitField(monthlyEmailLimit),
      dailyZaloLimit:          parseLimitField(dailyZaloLimit),
      monthlyZaloLimit:        parseLimitField(monthlyZaloLimit),
      messagesPerPeriod:       parseLimitField(messagesPerPeriod),
      isFupEnabled:            Boolean(isFupEnabled),
      maxLandingPages:         parseLimitField(maxLandingPages),
      maxCampaigns:            parseLimitField(maxCampaigns),
      maxZaloCampaigns:        parseLimitField(maxZaloCampaigns),
      maxZaloGroupCampaigns:   parseLimitField(maxZaloGroupCampaigns),
      maxEmailCampaigns:       parseLimitField(maxEmailCampaigns),
      maxZaloAccounts:         parseLimitField(maxZaloAccounts),
      maxEmailAccounts:        parseLimitField(maxEmailAccounts),
      maxEmailTemplates:       parseLimitField(maxEmailTemplates),
      maxZaloTemplates:        parseLimitField(maxZaloTemplates),
      aiTokensPerPeriod:       parseLimitField(aiTokensPerPeriod),
    });
  } catch (err) {
    if (err?.code === '23505' && String(err?.constraint || '').includes('plans_code')) {
      throw { status: 409, message: `Mã gói "${normalizedCode}" đã tồn tại` };
    }
    throw err;
  }
}

export async function editPlan(id, payload) {
  const plan = await findPlanById(id);
  if (!plan) throw { status: 404, message: 'Không tìm thấy gói dịch vụ' };
  if (!payload.name?.trim()) throw { status: 400, message: 'Tên gói không được để trống' };
  if (payload.price < 0) throw { status: 400, message: 'Giá tiền không hợp lệ' };
  return updatePlan(id, {
    name:         payload.name.trim(),
    price:        payload.price,
    priceYearly:  parseOptionalMoneyField(payload.priceYearly, 'Giá năm', { emptyWhenZero: true }),
    description:  payload.description,
    features:     payload.features || [],
    maxEmployees: payload.maxEmployees ?? 0,
    isActive:     payload.isActive ?? true,
    durationDays:          parseLimitField(payload.durationDays),
    dailyEmailLimit:       parseLimitField(payload.dailyEmailLimit),
    monthlyEmailLimit:     parseLimitField(payload.monthlyEmailLimit),
    dailyZaloLimit:        parseLimitField(payload.dailyZaloLimit),
    monthlyZaloLimit:      parseLimitField(payload.monthlyZaloLimit),
    messagesPerPeriod:     parseLimitField(payload.messagesPerPeriod),
    isFupEnabled:          Boolean(payload.isFupEnabled),
    maxLandingPages:       parseLimitField(payload.maxLandingPages),
    maxCampaigns:          parseLimitField(payload.maxCampaigns),
    maxZaloCampaigns:      parseLimitField(payload.maxZaloCampaigns),
    maxZaloGroupCampaigns: parseLimitField(payload.maxZaloGroupCampaigns),
    maxEmailCampaigns:     parseLimitField(payload.maxEmailCampaigns),
    maxZaloAccounts:       parseLimitField(payload.maxZaloAccounts),
    maxEmailAccounts:      parseLimitField(payload.maxEmailAccounts),
    maxEmailTemplates:     parseLimitField(payload.maxEmailTemplates),
    maxZaloTemplates:      parseLimitField(payload.maxZaloTemplates),
    aiTokensPerPeriod:     parseLimitField(payload.aiTokensPerPeriod),
  });
}

/**
 * Xoá gói thông minh, phân biệt theo loại gói:
 *
 *   ┌───────────────┬─────────────────┬───────────────────────────────────────────────┐
 *   │ Loại gói      │ Có order?       │ Hành vi                                       │
 *   ├───────────────┼─────────────────┼───────────────────────────────────────────────┤
 *   │ Đại trà       │ Không           │ Hard delete                                   │
 *   │ Đại trà       │ Có              │ Soft delete, GIỮ user đang dùng đến hết kỳ    │
 *   │ Custom        │ Không           │ Hard delete                                   │
 *   │ Custom        │ Có              │ Soft delete + GỠ active_plan_id của user      │
 *   └───────────────┴─────────────────┴───────────────────────────────────────────────┘
 *
 * Lý do tách: gói đại trà bán cho nhiều khách → ẩn = chỉ chặn khách mới, khách cũ
 *   được dùng hết kỳ (đã trả tiền). Gói custom chỉ phục vụ 1 khách → ẩn = chấm dứt
 *   hợp tác, gỡ luôn quyền sử dụng.
 * Hard delete an toàn vì FK `users_active_plan_id_fkey` có ON DELETE SET NULL.
 */
export async function removePlan(id) {
  const plan = await findPlanById(id);
  if (!plan) throw { status: 404, message: 'Không tìm thấy gói dịch vụ' };

  const orderCount = await countOrdersForPlan(id);

  if (orderCount === 0) {
    const result = await deletePlan(id);
    return {
      mode: 'hard',
      plan: result,
      orderCount: 0,
      unassignedUsers: [],
      message: `Đã xoá gói "${plan.name}".`,
    };
  }

  const result = await softDeletePlan(id);

  if (plan.is_custom) {
    const unassigned = await unassignPlanFromUsers(id);
    const emails = unassigned.map((u) => u.email).join(', ');
    return {
      mode: 'soft',
      plan: result,
      orderCount,
      unassignedUsers: unassigned,
      message: unassigned.length
        ? `Đã ẩn gói "${plan.name}" và gỡ quyền sử dụng của ${unassigned.length} khách: ${emails}. (Vẫn giữ ${orderCount} đơn hàng để lưu lịch sử.)`
        : `Đã ẩn gói "${plan.name}". Không có khách nào đang dùng để gỡ.`,
    };
  }

  return {
    mode: 'soft',
    plan: result,
    orderCount,
    unassignedUsers: [],
    message: `Đã ẩn gói "${plan.name}" — khách mới sẽ không thấy, khách cũ vẫn được dùng đến hết kỳ. (Còn ${orderCount} đơn hàng tham chiếu.)`,
  };
}

/**
 * Tạo gói custom + gán ngay cho một user cụ thể theo email.
 * Custom plan tự động ẩn khỏi trang pricing công khai (filter `is_custom = false` ở payment repo).
 */
export async function createCustomPlanForUser(userEmail, planData) {
  const user = await findUserAdminByEmail(userEmail.trim().toLowerCase());
  if (!user) throw { status: 404, message: 'Không tìm thấy tài khoản với email này' };

  if (!planData.name?.trim()) throw { status: 400, message: 'Tên gói không được để trống' };
  if (planData.price < 0)     throw { status: 400, message: 'Giá tiền không hợp lệ' };

  const result = await createAndAssignCustomPlan(user.id, {
    code:                  planData.code?.trim() || null,
    name:                  planData.name.trim(),
    price:                 planData.price,
    priceYearly:           parseOptionalMoneyField(planData.priceYearly, 'Giá năm', { emptyWhenZero: true }),
    description:           planData.description || null,
    features:              planData.features || [],
    maxEmployees:          planData.maxEmployees ?? 0,
    durationDays:          parseLimitField(planData.durationDays),
    dailyEmailLimit:       parseLimitField(planData.dailyEmailLimit),
    monthlyEmailLimit:     parseLimitField(planData.monthlyEmailLimit),
    dailyZaloLimit:        parseLimitField(planData.dailyZaloLimit),
    monthlyZaloLimit:      parseLimitField(planData.monthlyZaloLimit),
    messagesPerPeriod:     parseLimitField(planData.messagesPerPeriod),
    isFupEnabled:          Boolean(planData.isFupEnabled),
    maxLandingPages:       parseLimitField(planData.maxLandingPages),
    maxCampaigns:          parseLimitField(planData.maxCampaigns),
    maxZaloCampaigns:      parseLimitField(planData.maxZaloCampaigns),
    maxZaloGroupCampaigns: parseLimitField(planData.maxZaloGroupCampaigns),
    maxEmailCampaigns:     parseLimitField(planData.maxEmailCampaigns),
    maxZaloAccounts:       parseLimitField(planData.maxZaloAccounts),
    maxEmailAccounts:      parseLimitField(planData.maxEmailAccounts),
    maxEmailTemplates:     parseLimitField(planData.maxEmailTemplates),
    maxZaloTemplates:      parseLimitField(planData.maxZaloTemplates),
    aiTokensPerPeriod:     parseLimitField(planData.aiTokensPerPeriod),
  });

  return { ...result, assignedTo: user };
}

/**
 * Tạo gói custom + tạo link thanh toán PayOS.
 * Gói được tạo nhưng CHƯA gán cho user — webhook sẽ tự gán sau khi thanh toán thành công.
 * `is_active = true` → ngữ nghĩa "chưa bị admin xoá"; custom plan tự động ẩn khỏi pricing
 * công khai nhờ filter `is_custom = false` ở `payment/plan.repository.js`.
 */
export async function createCustomPlanWithPayment(userEmail, planData) {
  const user = await findUserAdminByEmail(userEmail.trim().toLowerCase());
  if (!user) throw { status: 404, message: 'Không tìm thấy tài khoản với email này' };

  if (!planData.name?.trim()) throw { status: 400, message: 'Tên gói không được để trống' };
  if (!planData.price || planData.price <= 0) throw { status: 400, message: 'Giá tiền phải lớn hơn 0 để tạo link thanh toán' };

  assertPaymentEnv();

  let plan = null;
  let orderCode = null;
  try {
    plan = await createPlan({
      code:                  planData.code?.trim() || null,
      name:                  planData.name.trim(),
      price:                 planData.price,
      priceYearly:           parseOptionalMoneyField(planData.priceYearly, 'Giá năm', { emptyWhenZero: true }),
      description:           planData.description || null,
      features:              [],
      maxEmployees:          planData.maxEmployees ?? -1,
      isActive:              true,
      isCustom:              true,
      durationDays:          parseLimitField(planData.durationDays),
      dailyEmailLimit:       parseLimitField(planData.dailyEmailLimit),
      monthlyEmailLimit:     parseLimitField(planData.monthlyEmailLimit),
      dailyZaloLimit:        parseLimitField(planData.dailyZaloLimit),
      monthlyZaloLimit:      parseLimitField(planData.monthlyZaloLimit),
      messagesPerPeriod:     parseLimitField(planData.messagesPerPeriod),
      isFupEnabled:          Boolean(planData.isFupEnabled),
      maxLandingPages:       parseLimitField(planData.maxLandingPages),
      maxCampaigns:          parseLimitField(planData.maxCampaigns),
      maxZaloCampaigns:      parseLimitField(planData.maxZaloCampaigns),
      maxZaloGroupCampaigns: parseLimitField(planData.maxZaloGroupCampaigns),
      maxEmailCampaigns:     parseLimitField(planData.maxEmailCampaigns),
      maxZaloAccounts:       parseLimitField(planData.maxZaloAccounts),
      maxEmailAccounts:      parseLimitField(planData.maxEmailAccounts),
      maxEmailTemplates:     parseLimitField(planData.maxEmailTemplates),
      maxZaloTemplates:      parseLimitField(planData.maxZaloTemplates),
      aiTokensPerPeriod:     parseLimitField(planData.aiTokensPerPeriod),
    });

    orderCode = Date.now();
    const amount = Math.round(Number(plan.price));
    await createOrder({ orderCode, planId: plan.id, amount, userEmail: user.email, userId: user.id });
  } catch (err) {
    if (plan?.id) {
      try { await deletePlan(plan.id); } catch { /* best-effort cleanup */ }
    }
    throw err;
  }

  try {
    const amount = Math.round(Number(plan.price));
    const paymentLink = await payosClient.paymentRequests.create({
      orderCode:   Number(orderCode),
      amount,
      description: plan.name.substring(0, 25),
      returnUrl:   `${process.env.FRONTEND_URL}/payment-success`,
      cancelUrl:   `${process.env.FRONTEND_URL}/pricing`,
      buyerEmail:  user.email,
      buyerName:   user.fullName || undefined,
    });

    return { plan, user, checkoutUrl: paymentLink.checkoutUrl, qrCode: paymentLink.qrCode, orderCode };
  } catch (err) {
    try { await deleteOrderByCode(orderCode); } catch { /* best-effort cleanup */ }
    try { await deletePlan(plan.id); } catch { /* best-effort cleanup */ }
    if (err?.status) throw err;
    throw mapPaymentProviderError(err);
  }
}

/** Tìm user_admin theo email gần đúng (dùng cho autocomplete). */
export async function searchUsers(query, excludeWithPlan = false) {
  if (query === null || query === undefined) return [];
  return searchUserAdminsByEmail(query.trim(), 8, excludeWithPlan);
}

/**
 * Gán gói trực tiếp cho user theo email (super_admin override, bỏ qua thanh toán).
 * @param {number} planId
 * @param {string} userEmail
 * @param {{ paymentMethod?: 'manual'|'free', note?: string }} [opts]
 *   paymentMethod: 'manual' = thu tiền ngoài (cộng doanh thu), 'free' = miễn phí (không tính)
 */
export async function assignPlan(planId, userEmail, { paymentMethod = 'free', note = null } = {}) {
  const plan = await findPlanById(planId);
  if (!plan) throw { status: 404, message: 'Không tìm thấy gói dịch vụ' };

  const user = await findUserAdminByEmail(userEmail.trim().toLowerCase());
  if (!user) throw { status: 404, message: 'Không tìm thấy tài khoản với email này' };

  const result = await assignPlanToUser(user.id, planId);

  const orderCode = Date.now();
  const amount = paymentMethod === 'manual' ? Number(plan.price) : 0;
  await createOrder({
    orderCode,
    planId: plan.id,
    amount,
    userEmail: user.email,
    userId: user.id,
    status: 'success',
    paymentMethod,
    note,
  });

  return result;
}
