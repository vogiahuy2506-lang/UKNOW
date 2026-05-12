import {
  findAllPlans,
  findCustomPlans,
  findPlanById,
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
import { createOrder } from '../../repositories/payment/payment.repository.js';
import payosClient from '../../utils/payos.util.js';

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

export async function createNewPlan({ code, name, price, description, features, maxEmployees, isActive = true,
  dailyEmailLimit, monthlyEmailLimit, dailyZaloLimit, monthlyZaloLimit }) {
  if (!name?.trim()) throw { status: 400, message: 'Tên gói không được để trống' };
  if (price === undefined || price < 0) throw { status: 400, message: 'Giá tiền không hợp lệ' };
  return createPlan({
    code: code?.trim() || null, name: name.trim(), price, description, features,
    maxEmployees: maxEmployees ?? 0, isActive,
    dailyEmailLimit: parseLimitField(dailyEmailLimit),
    monthlyEmailLimit: parseLimitField(monthlyEmailLimit),
    dailyZaloLimit: parseLimitField(dailyZaloLimit),
    monthlyZaloLimit: parseLimitField(monthlyZaloLimit),
  });
}

export async function editPlan(id, payload) {
  const plan = await findPlanById(id);
  if (!plan) throw { status: 404, message: 'Không tìm thấy gói dịch vụ' };
  if (!payload.name?.trim()) throw { status: 400, message: 'Tên gói không được để trống' };
  if (payload.price < 0) throw { status: 400, message: 'Giá tiền không hợp lệ' };
  return updatePlan(id, {
    name:         payload.name.trim(),
    price:        payload.price,
    description:  payload.description,
    features:     payload.features || [],
    maxEmployees: payload.maxEmployees ?? 0,
    isActive:     payload.isActive ?? true,
    dailyEmailLimit:   parseLimitField(payload.dailyEmailLimit),
    monthlyEmailLimit: parseLimitField(payload.monthlyEmailLimit),
    dailyZaloLimit:    parseLimitField(payload.dailyZaloLimit),
    monthlyZaloLimit:  parseLimitField(payload.monthlyZaloLimit),
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
    code:              planData.code?.trim() || null,
    name:              planData.name.trim(),
    price:             planData.price,
    description:       planData.description || null,
    features:          planData.features || [],
    maxEmployees:      planData.maxEmployees ?? 0,
    dailyEmailLimit:   parseLimitField(planData.dailyEmailLimit),
    monthlyEmailLimit: parseLimitField(planData.monthlyEmailLimit),
    dailyZaloLimit:    parseLimitField(planData.dailyZaloLimit),
    monthlyZaloLimit:  parseLimitField(planData.monthlyZaloLimit),
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

  const plan = await createPlan({
    code:              planData.code?.trim() || null,
    name:              planData.name.trim(),
    price:             planData.price,
    description:       planData.description || null,
    features:          [],
    maxEmployees:      planData.maxEmployees ?? -1,
    isActive:          true,
    isCustom:          true,
    dailyEmailLimit:   parseLimitField(planData.dailyEmailLimit),
    monthlyEmailLimit: parseLimitField(planData.monthlyEmailLimit),
    dailyZaloLimit:    parseLimitField(planData.dailyZaloLimit),
    monthlyZaloLimit:  parseLimitField(planData.monthlyZaloLimit),
  });

  const orderCode = Date.now();
  await createOrder({ orderCode, planId: plan.id, amount: plan.price, userEmail: user.email, userId: user.id });

  const paymentLink = await payosClient.paymentRequests.create({
    orderCode:   Number(orderCode),
    amount:      Number(plan.price),
    description: plan.name.substring(0, 25),
    returnUrl:   `${process.env.FRONTEND_URL}/payment-success`,
    cancelUrl:   `${process.env.FRONTEND_URL}/about`,
    buyerEmail:  user.email,
    buyerName:   user.full_name || undefined,
  });

  return { plan, user, checkoutUrl: paymentLink.checkoutUrl, qrCode: paymentLink.qrCode, orderCode };
}

/** Tìm user_admin theo email gần đúng (dùng cho autocomplete). */
export async function searchUsers(query, excludeWithPlan = false) {
  if (query === null || query === undefined) return [];
  return searchUserAdminsByEmail(query.trim(), 8, excludeWithPlan);
}

/**
 * Gán gói trực tiếp cho user theo email (super_admin override, bỏ qua thanh toán).
 */
export async function assignPlan(planId, userEmail) {
  const plan = await findPlanById(planId);
  if (!plan) throw { status: 404, message: 'Không tìm thấy gói dịch vụ' };

  const user = await findUserAdminByEmail(userEmail.trim().toLowerCase());
  if (!user) throw { status: 404, message: 'Không tìm thấy tài khoản với email này' };

  return assignPlanToUser(user.id, planId);
}
