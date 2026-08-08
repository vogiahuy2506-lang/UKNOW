import {
  validateQuantities,
  checkZaloCapacity,
  computeCustomPlanPrice,
  mapQuantitiesToPlanColumns,
  applyPublicPlanGuardrail,
  planCoversQuantities,
  planUsageRatio,
} from '../customPlanPricing.util.js';

/** Mirrors migration 096 rebalanced defaults (subset used by unit tests). */
const sampleRows = [
  { item_key: 'yearly_discount_percent', unit_price: 20, unit_size: 1, is_active: true, sort_order: 0 },
  { item_key: 'zalo_monthly_capacity_per_account', unit_price: 16000, unit_size: 1, is_active: true, sort_order: 0 },
  { item_key: 'base_fee', plan_column: null, unit_price: 199000, unit_size: 1, included_qty: 0, min_qty: 1, max_qty: 1, step_qty: 1, is_active: true, sort_order: 10 },
  { item_key: 'zalo_messages', plan_column: 'monthly_zalo_limit', unit_price: 30000, unit_size: 500, included_qty: 500, min_qty: 500, max_qty: 200000, step_qty: 500, is_active: true, sort_order: 20 },
  { item_key: 'emails', plan_column: 'monthly_email_limit', unit_price: 25000, unit_size: 2500, included_qty: 2500, min_qty: 2500, max_qty: 500000, step_qty: 2500, is_active: true, sort_order: 30 },
  { item_key: 'ai_credits', plan_column: 'ai_credits_per_period', unit_price: 35000, unit_size: 250, included_qty: 250, min_qty: 250, max_qty: 50000, step_qty: 250, is_active: true, sort_order: 40 },
  { item_key: 'zalo_accounts', plan_column: 'max_zalo_accounts', unit_price: 40000, unit_size: 1, included_qty: 1, min_qty: 1, max_qty: 50, step_qty: 1, is_active: true, sort_order: 50 },
  { item_key: 'email_accounts', plan_column: 'max_email_accounts', unit_price: 40000, unit_size: 1, included_qty: 1, min_qty: 1, max_qty: 50, step_qty: 1, is_active: true, sort_order: 60 },
  { item_key: 'landing_pages', plan_column: 'max_landing_pages', unit_price: 20000, unit_size: 1, included_qty: 1, min_qty: 1, max_qty: 200, step_qty: 1, is_active: true, sort_order: 70 },
  { item_key: 'chatbots', plan_column: 'max_chatbots', unit_price: 70000, unit_size: 1, included_qty: 1, min_qty: 1, max_qty: 100, step_qty: 1, is_active: true, sort_order: 80 },
  { item_key: 'employees', plan_column: 'max_employees', unit_price: 35000, unit_size: 1, included_qty: 1, min_qty: 1, max_qty: 100, step_qty: 1, is_active: true, sort_order: 90 },
  { item_key: 'campaigns', plan_column: 'max_campaigns', unit_price: 10000, unit_size: 1, included_qty: 1, min_qty: 1, max_qty: 500, step_qty: 1, is_active: true, sort_order: 100 },
];

const minQty = {
  base_fee: 1,
  zalo_messages: 500,
  emails: 2500,
  ai_credits: 250,
  zalo_accounts: 1,
  email_accounts: 1,
  landing_pages: 1,
  chatbots: 1,
  employees: 1,
  campaigns: 1,
};

describe('customPlanPricing.util', () => {
  test('validateQuantities rejects bad step and unknown keys', () => {
    const bad = validateQuantities(sampleRows, {
      ...minQty,
      zalo_messages: 750,
    });
    expect(bad.ok).toBe(false);
    expect(bad.errors.some((e) => e.includes('zalo_messages'))).toBe(true);

    const unknown = validateQuantities(sampleRows, {
      ...minQty,
      hacker: 9,
    });
    expect(unknown.ok).toBe(false);
  });

  test('validateQuantities accepts valid quantities', () => {
    const ok = validateQuantities(sampleRows, {
      ...minQty,
      zalo_messages: 2000,
      emails: 5000,
      ai_credits: 500,
      employees: 2,
    });
    expect(ok.ok).toBe(true);
    expect(ok.quantities.zalo_messages).toBe(2000);
  });

  test('checkZaloCapacity hard-blocks over capacity', () => {
    const fail = checkZaloCapacity({ zalo_messages: 20000, zalo_accounts: 1 }, sampleRows);
    expect(fail.ok).toBe(false);
    expect(fail.capacity).toBe(16000);

    const pass = checkZaloCapacity({ zalo_messages: 16000, zalo_accounts: 1 }, sampleRows);
    expect(pass.ok).toBe(true);
  });

  test('config at included_qty totals exactly base_fee', () => {
    const priced = computeCustomPlanPrice(sampleRows, minQty, 'monthly');
    expect(priced.monthlyTotal).toBe(199000);
    expect(priced.baseFee).toBe(199000);
    for (const line of priced.items) {
      if (line.itemKey === 'base_fee') continue;
      expect(line.subtotal).toBe(0);
    }
  });

  test('qty below included does not charge negative and map floors to included', () => {
    // Simulate admin misconfig / client sending below included
    const qty = { ...minQty, zalo_messages: 0, emails: 100 };
    const priced = computeCustomPlanPrice(sampleRows, qty, 'monthly');
    expect(priced.monthlyTotal).toBe(199000);
    const zaloLine = priced.items.find((i) => i.itemKey === 'zalo_messages');
    expect(zaloLine.subtotal).toBe(0);

    const cols = mapQuantitiesToPlanColumns(sampleRows, qty);
    expect(cols.monthlyZaloLimit).toBe(500);
    expect(cols.monthlyEmailLimit).toBe(2500);
  });

  test('overage charges only ceil(billable / unitSize) blocks', () => {
    // Starter-equivalent acceptance: 199 + 90 + 25 + 105 + 40 + 40 = 499000
    const qty = {
      ...minQty,
      zalo_messages: 2000,
      emails: 5000,
      ai_credits: 1000,
      landing_pages: 3,
      campaigns: 5,
    };
    const priced = computeCustomPlanPrice(sampleRows, qty, 'monthly');
    expect(priced.monthlyTotal).toBe(499000);

    const zaloLine = priced.items.find((i) => i.itemKey === 'zalo_messages');
    expect(zaloLine.unitCount).toBe(3); // ceil(1500/500)
    expect(zaloLine.subtotal).toBe(90000);

    // Skewed: 5 Zalo accounts + 3000 messages = 199 + 160 + 150 = 509000
    const skewed = computeCustomPlanPrice(
      sampleRows,
      { ...minQty, zalo_accounts: 5, zalo_messages: 3000 },
      'monthly'
    );
    expect(skewed.monthlyTotal).toBe(509000);
  });

  test('computeCustomPlanPrice ceilings partial units', () => {
    const qty = { ...minQty, zalo_messages: 501 };
    const priced = computeCustomPlanPrice(sampleRows, qty, 'monthly');
    const zaloLine = priced.items.find((i) => i.itemKey === 'zalo_messages');
    // billable 1 → ceil(1/500) = 1 block
    expect(zaloLine.unitCount).toBe(1);
    expect(zaloLine.subtotal).toBe(30000);
  });

  test('mapQuantitiesToPlanColumns mirrors displayed qty and leaves messagesPerPeriod null', () => {
    const cols = mapQuantitiesToPlanColumns(sampleRows, {
      ...minQty,
      zalo_messages: 2000,
      emails: 5000,
      ai_credits: 500,
      zalo_accounts: 2,
      employees: 3,
    });
    expect(cols.messagesPerPeriod).toBeNull();
    expect(cols.monthlyZaloLimit).toBe(2000);
    expect(cols.monthlyEmailLimit).toBe(5000);
    expect(cols.aiCreditsPerPeriod).toBe(500);
    expect(cols.maxZaloAccounts).toBe(2);
    expect(cols.maxEmployees).toBe(3);
  });

  test('yearly discount still applies on rebalanced totals', () => {
    const monthly = computeCustomPlanPrice(sampleRows, minQty, 'monthly');
    const yearly = computeCustomPlanPrice(sampleRows, minQty, 'yearly');
    expect(yearly.yearlyTotal).toBe(Math.round(199000 * 12 * 0.8));
    expect(yearly.total).toBe(yearly.yearlyTotal);
    expect(monthly.total).toBe(199000);
  });

  test('planCoversQuantities still works; soft suggestion unchanged', () => {
    const publicPlans = [
      {
        id: 1,
        code: 'basic',
        name: 'Basic',
        price: 599000,
        price_yearly: 599000 * 12 * 0.8,
        is_active: true,
        is_custom: false,
        monthly_zalo_limit: 8000,
        monthly_email_limit: 20000,
        ai_credits_per_period: 1600,
        max_zalo_accounts: 2,
        max_employees: 3,
        max_email_accounts: 2,
        max_landing_pages: 5,
        max_chatbots: 2,
        max_campaigns: 10,
      },
    ];

    const qty = { ...minQty, zalo_messages: 2000, emails: 5000, ai_credits: 500 };
    expect(planCoversQuantities(publicPlans[0], qty, sampleRows)).toBe(true);

    // Sparse usage vs covering plan → NO hard floor (old bug: would floor to 599k)
    const noFloor = applyPublicPlanGuardrail({
      publicPlans,
      quantities: qty,
      configRows: sampleRows,
      monthlyTotal: 300000,
      yearlyTotal: 2880000,
      billingPeriod: 'monthly',
    });
    expect(noFloor.priceFloorApplied).toBe(false);
    expect(noFloor.flooredMonthlyTotal).toBe(300000);
    expect(noFloor.flooredToPlan).toBeNull();

    // Soft suggestion when custom is more expensive than covering plan
    const suggest = applyPublicPlanGuardrail({
      publicPlans,
      quantities: qty,
      configRows: sampleRows,
      monthlyTotal: 900000,
      yearlyTotal: 8640000,
      billingPeriod: 'monthly',
    });
    expect(suggest.priceFloorApplied).toBe(false);
    expect(suggest.suggestedPlan?.code).toBe('basic');
    expect(suggest.suggestedPlan.savings).toBe(301000);
  });

  test('hard floor applies only for near-clone configs (ratio ≥ 0.8)', () => {
    const clonePlan = {
      id: 9,
      code: 'fake_basic',
      name: 'Fake Basic',
      price: 800000,
      price_yearly: 7680000,
      is_active: true,
      is_custom: false,
      monthly_zalo_limit: 2000,
      monthly_email_limit: 5000,
      ai_credits_per_period: 1000,
      max_zalo_accounts: 1,
      max_email_accounts: 1,
      max_landing_pages: 3,
      max_chatbots: 1,
      max_employees: 1,
      max_campaigns: 5,
    };
    const cloneQty = {
      ...minQty,
      zalo_messages: 2000,
      emails: 5000,
      ai_credits: 1000,
      landing_pages: 3,
      campaigns: 5,
    };
    // ratio = 1.0 on every comparable dim; computed price is 499k < 800k → floor
    const floored = applyPublicPlanGuardrail({
      publicPlans: [clonePlan],
      quantities: cloneQty,
      configRows: sampleRows,
      monthlyTotal: 499000,
      yearlyTotal: 4790400,
      billingPeriod: 'monthly',
    });
    expect(floored.priceFloorApplied).toBe(true);
    expect(floored.flooredMonthlyTotal).toBe(800000);
    expect(floored.flooredToPlan?.code).toBe('fake_basic');

    // Same covering plan but only ~12% usage on the limiting dim → no floor
    const sparseQty = { ...minQty, zalo_messages: 1000, emails: 2500 }; // vs 8000/20000 style below
    const sparsePlan = {
      ...clonePlan,
      id: 10,
      monthly_zalo_limit: 8000,
      monthly_email_limit: 20000,
      ai_credits_per_period: 2000,
      max_landing_pages: 10,
      max_campaigns: 20,
      max_employees: 10,
      max_zalo_accounts: 5,
      max_email_accounts: 5,
      max_chatbots: 5,
      price: 800000,
    };
    const sparse = applyPublicPlanGuardrail({
      publicPlans: [sparsePlan],
      quantities: sparseQty,
      configRows: sampleRows,
      monthlyTotal: 199000,
      yearlyTotal: 1910400,
      billingPeriod: 'monthly',
    });
    expect(planUsageRatio(sparsePlan, sparseQty, sampleRows)).toBeLessThan(0.8);
    expect(sparse.priceFloorApplied).toBe(false);
    expect(sparse.flooredMonthlyTotal).toBe(199000);
  });

  test('custom matching max(planLimit, included) stays ≥ public plan price (excl. sparse unlimited plans)', () => {
    const productionPlans = [
      {
        code: 'starter',
        price: 299000,
        monthly_zalo_limit: 1000,
        monthly_email_limit: 500,
        ai_credits_per_period: 500,
        max_zalo_accounts: 1,
        max_email_accounts: 1,
        max_landing_pages: 2,
        max_campaigns: 3,
        max_zalo_campaigns: 2,
        max_zalo_group_campaigns: 2,
        max_email_campaigns: 1,
        max_email_templates: 10,
        max_zalo_templates: 10,
        max_employees: 1,
        max_chatbots: null,
      },
      {
        code: 'basic',
        price: 599000,
        monthly_zalo_limit: 5000,
        monthly_email_limit: 2000,
        ai_credits_per_period: 3000,
        max_zalo_accounts: 2,
        max_email_accounts: 2,
        max_landing_pages: 5,
        max_campaigns: 10,
        max_zalo_campaigns: 5,
        max_zalo_group_campaigns: 5,
        max_email_campaigns: 3,
        max_email_templates: 25,
        max_zalo_templates: 25,
        max_employees: 3,
        max_chatbots: null,
      },
      {
        code: 'professional',
        price: 1299000,
        monthly_zalo_limit: 20000,
        monthly_email_limit: 10000,
        ai_credits_per_period: null,
        max_zalo_accounts: 5,
        max_email_accounts: 5,
        max_landing_pages: 15,
        max_campaigns: null,
        max_zalo_campaigns: null,
        max_zalo_group_campaigns: null,
        max_email_campaigns: null,
        max_email_templates: 100,
        max_zalo_templates: 100,
        max_employees: 10,
        max_chatbots: null,
      },
    ];

    const columnToItem = {
      monthly_zalo_limit: 'zalo_messages',
      monthly_email_limit: 'emails',
      ai_credits_per_period: 'ai_credits',
      max_zalo_accounts: 'zalo_accounts',
      max_email_accounts: 'email_accounts',
      max_landing_pages: 'landing_pages',
      max_chatbots: 'chatbots',
      max_employees: 'employees',
      max_campaigns: 'campaigns',
      max_zalo_campaigns: 'zalo_campaigns',
      max_zalo_group_campaigns: 'zalo_group_campaigns',
      max_email_campaigns: 'email_campaigns',
      max_email_templates: 'email_templates',
      max_zalo_templates: 'zalo_templates',
    };

    // Extend sampleRows with the campaign/template keys used above
    const fullRows = [
      ...sampleRows,
      { item_key: 'zalo_campaigns', plan_column: 'max_zalo_campaigns', unit_price: 10000, unit_size: 1, included_qty: 0, min_qty: 0, max_qty: 200, step_qty: 1, is_active: true, sort_order: 110 },
      { item_key: 'zalo_group_campaigns', plan_column: 'max_zalo_group_campaigns', unit_price: 10000, unit_size: 1, included_qty: 0, min_qty: 0, max_qty: 200, step_qty: 1, is_active: true, sort_order: 120 },
      { item_key: 'email_campaigns', plan_column: 'max_email_campaigns', unit_price: 10000, unit_size: 1, included_qty: 0, min_qty: 0, max_qty: 200, step_qty: 1, is_active: true, sort_order: 130 },
      { item_key: 'email_templates', plan_column: 'max_email_templates', unit_price: 8000, unit_size: 1, included_qty: 0, min_qty: 0, max_qty: 500, step_qty: 1, is_active: true, sort_order: 140 },
      { item_key: 'zalo_templates', plan_column: 'max_zalo_templates', unit_price: 8000, unit_size: 1, included_qty: 0, min_qty: 0, max_qty: 500, step_qty: 1, is_active: true, sort_order: 150 },
    ];

    for (const plan of productionPlans) {
      const finiteDims = Object.keys(columnToItem).filter((col) => {
        const v = plan[col];
        return v !== null && v !== undefined && Number(v) > 0;
      });
      // Skip plans with fewer than 5 finite dims (enterprise-shaped)
      if (finiteDims.length < 5) continue;

      const qty = { base_fee: 1 };
      for (const [col, itemKey] of Object.entries(columnToItem)) {
        const row = fullRows.find((r) => (r.item_key || r.itemKey) === itemKey);
        const included = Number(row?.included_qty ?? row?.includedQty ?? 0);
        const planVal = plan[col];
        if (planVal === null || planVal === undefined) {
          qty[itemKey] = included;
        } else {
          qty[itemKey] = Math.max(Number(planVal), included);
        }
      }

      const priced = computeCustomPlanPrice(fullRows, qty, 'monthly');
      expect(priced.monthlyTotal).toBeGreaterThanOrEqual(Number(plan.price));
    }
  });

  test('free/trial and contact plans are never suggested nor used as price floor', () => {
    const publicPlans = [
      {
        id: 1,
        code: 'trial',
        name: 'Dùng thử',
        price: 0,
        price_yearly: null,
        is_active: true,
        is_custom: false,
        monthly_zalo_limit: null,
        monthly_email_limit: null,
        ai_credits_per_period: null,
        max_zalo_accounts: null,
        max_employees: null,
      },
      {
        id: 2,
        code: 'contact',
        name: 'Gói Tùy chọn',
        price: 0,
        is_active: true,
        is_custom: false,
      },
    ];

    const result = applyPublicPlanGuardrail({
      publicPlans,
      quantities: { ...minQty, zalo_messages: 2000, emails: 5000 },
      configRows: sampleRows,
      monthlyTotal: 499000,
      yearlyTotal: 4790400,
      billingPeriod: 'monthly',
    });

    expect(result.suggestedPlan).toBeNull();
    expect(result.priceFloorApplied).toBe(false);
    expect(result.flooredMonthlyTotal).toBe(499000);
  });
});
