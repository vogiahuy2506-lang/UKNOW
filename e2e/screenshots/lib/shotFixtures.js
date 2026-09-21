/**
 * Dựng dữ liệu cho những ảnh mà seed chung không có sẵn.
 *
 * CHỈ DÙNG Ở MÁY MÌNH. Mọi hàm ở đây đều GHI dữ liệu: gọi API bằng phiên đang
 * đăng nhập, hoặc ghi thẳng vào DB test. Shot nào dùng tới file này thì phải
 * đặt `localOnly: true` — capture.spec.js sẽ bỏ qua khi trỏ vào production.
 *
 * DB lấy từ e2e/.env.test và bị khoá hai lớp: host phải là máy mình, tên DB phải
 * kết thúc bằng `_test`. Trỏ nhầm sang DB thật thì ném lỗi trước khi nối.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.resolve(__dirname, '..', '..', '.env.test');

/** Mật khẩu chung của mọi tài khoản do seed dựng (xem seed-demo-data.js). */
export const SEED_PASSWORD = 'Test@1234';

function readDbConfig() {
  const parsed = dotenv.config({ path: ENV_FILE, processEnv: {} }).parsed || {};
  const host = parsed.DB_HOST || 'localhost';
  const database = parsed.DB_NAME || '';
  if (!/^(localhost|127\.0\.0\.1)$/i.test(host)) {
    throw new Error(`[shot-fixtures] DB_HOST="${host}" không phải máy mình — từ chối ghi.`);
  }
  if (!/_test$/i.test(database)) {
    throw new Error(`[shot-fixtures] DB_NAME="${database}" không kết thúc bằng "_test" — từ chối ghi.`);
  }
  return {
    host,
    port: Number(parsed.DB_PORT) || 5432,
    user: parsed.DB_USER || 'postgres',
    password: parsed.DB_PASSWORD || '',
    database,
  };
}

/**
 * Chạy một việc với kết nối DB test rồi đóng lại.
 *
 * @template T
 * @param {(client: import('pg').Client) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withDb(work) {
  const client = new pg.Client(readDbConfig());
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/** Access token của phiên đang đăng nhập (localStorage hoặc sessionStorage). */
export async function readAccessToken(page) {
  const token = await page.evaluate(() => (
    window.localStorage.getItem('accessToken') || window.sessionStorage.getItem('accessToken')
  ));
  if (!token) throw new Error('Không thấy accessToken — trang chưa đăng nhập?');
  return token;
}

/**
 * Gọi API backend bằng phiên đang đăng nhập. Chạy `fetch` ngay trong trang để đi
 * đúng proxy `/api` của Vite, khỏi phải biết backend nằm ở cổng nào.
 *
 * @param {import('@playwright/test').Page} page  trang ĐÃ ở trong app (có origin)
 */
export async function api(page, method, url, body) {
  const token = await readAccessToken(page);
  const res = await page.evaluate(async ({ method: m, url: u, body: b, token: t }) => {
    const r = await fetch(`/api${u}`, {
      method: m,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: b ? JSON.stringify(b) : undefined,
    });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, { method, url, body, token });
  if (res.status >= 400) {
    throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(res.json).slice(0, 300)}`);
  }
  return res.json?.data ?? res.json?.result ?? res.json;
}

/**
 * Đăng nhập một tài khoản KHÁC (nhân viên, tài khoản chưa đồng ý điều khoản…)
 * trong một context riêng, không đụng tới phiên chủ tài khoản đang dùng để chụp.
 *
 * Không chờ `/app`: tài khoản chưa đồng ý điều khoản vẫn vào `/app` nhưng bị hộp
 * thoại che — người gọi tự chờ đúng thứ mình cần chụp.
 *
 * @returns {Promise<import('@playwright/test').Page>}
 */
export async function loginAs(page, { username, password = SEED_PASSWORD, baseURL, viewport }) {
  const browser = page.context().browser();
  const context = await browser.newContext({
    // Playwright Test tự áp `use.storageState` của project lên CẢ context tạo tay,
    // nên không ghi đè thì context này vào thẳng /app bằng phiên của chủ tài khoản
    // và ô đăng nhập không bao giờ hiện.
    storageState: { cookies: [], origins: [] },
    baseURL,
    viewport: viewport || page.viewportSize(),
    deviceScaleFactor: 2,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    colorScheme: 'light',
  });
  const other = await context.newPage();
  await other.goto('/login');
  await other.evaluate(() => window.localStorage.setItem('founder_ai_sidebar_open', 'true'));
  const usernameBox = other.locator('input[autocomplete="username"]');
  await usernameBox.waitFor({ state: 'visible', timeout: 30_000 });
  await usernameBox.fill(username);
  await other.locator('input[autocomplete="current-password"]').fill(password);
  await other.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await other.waitForURL(/\/app(\/|$)/, { timeout: 30_000 });
  return other;
}

const DEMO_FORM_TITLE = 'Đặt lịch soi da & tư vấn';
const DEMO_SLOTS = ['09:00', '10:30', '14:00', '16:00'];

/**
 * Biểu mẫu mẫu có đủ ba phần bài viết nói tới: trường thông tin, đặt lịch hẹn,
 * thanh toán giữ chỗ bằng chuyển khoản. Gọi lại nhiều lần vẫn chỉ có một form.
 *
 * @returns {Promise<{id: number, publicKey: string, fields: Array<{key: string, label: string}>}>}
 */
export async function ensureDemoForm(page) {
  const list = await api(page, 'GET', '/forms');
  const existing = (Array.isArray(list) ? list : list?.items || []).find((f) => f.title === DEMO_FORM_TITLE);
  if (existing) {
    const full = await api(page, 'GET', `/forms/${existing.id}`);
    // Form dựng bởi bản cũ của file này chưa bật ô đồng ý tiếp thị — dựng lại cho
    // đúng, vì cột "Đồng ý tiếp thị" ở trang Bài nộp chỉ có nghĩa khi ô đó bật.
    if (full.settings?.consentEnabled) return full;
    await api(page, 'DELETE', `/forms/${existing.id}`);
  }

  const form = await api(page, 'POST', '/forms', {
    title: DEMO_FORM_TITLE,
    description: 'Chọn giờ phù hợp với bạn. Chuyển khoản 50.000đ để giữ chỗ, khoản này được trừ vào hoá đơn khi bạn đến.',
    fields: [
      { type: 'short_text', label: 'Họ và tên', required: true, role: 'name' },
      { type: 'phone', label: 'Số điện thoại', required: true, role: 'phone' },
      { type: 'email', label: 'Email (để nhận thư xác nhận)', required: false, role: 'email' },
      { type: 'select', label: 'Dịch vụ', required: true, options: ['Soi da & tư vấn', 'Chăm sóc da cơ bản', 'Trị mụn chuyên sâu'] },
    ],
    settings: { notifyOwner: true, consentEnabled: true, sendConfirmation: true },
    bookingConfig: {
      enabled: true,
      weeklySlots: { 0: [], 1: DEMO_SLOTS, 2: DEMO_SLOTS, 3: DEMO_SLOTS, 4: DEMO_SLOTS, 5: DEMO_SLOTS, 6: ['09:00', '10:30'] },
      slotCapacity: 2,
      daysAhead: 14,
      minNoticeMinutes: 60,
      closedDates: [],
    },
    paymentConfig: {
      enabled: true,
      method: 'bank',
      amount: 50000,
      bankBin: '970436',
      accountNumber: '0123456789',
      accountName: 'NGUYEN VAN A',
      holdMinutes: 30,
    },
    theme: { primaryColor: '#0F766E', backgroundColor: '#F0FDFA', fontFamily: 'Be Vietnam Pro' },
  });
  await api(page, 'PUT', `/forms/${form.id}/publish`, { isPublished: true });
  return api(page, 'GET', `/forms/${form.id}`);
}

/**
 * Nộp một bài vào biểu mẫu mẫu qua API công khai, y như khách bấm Gửi.
 *
 * @param {{name: string, phone: string, email?: string, marketingConsent?: boolean, slotIndex?: number}} who
 * @returns {Promise<{accessToken: string, payment: object}>}
 */
export async function submitDemoForm(page, form, who) {
  const slots = await page.evaluate(async (key) => {
    const r = await fetch(`/api/public/forms/${key}/slots`);
    return r.json();
  }, form.publicKey);
  const open = (slots?.data?.slots || [])
    .filter((s) => s.available !== false && (s.remaining == null || s.remaining > 0));
  const slot = open[who.slotIndex ?? 0];
  if (!slot) throw new Error(`Biểu mẫu mẫu hết khung giờ trống: ${JSON.stringify(slots).slice(0, 200)}`);

  const keyOf = Object.fromEntries(form.fields.map((f) => [f.label, f.key]));
  const res = await page.evaluate(async ({ key, payload }) => {
    const r = await fetch(`/api/public/forms/${key}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, {
    key: form.publicKey,
    payload: {
      answers: {
        [keyOf['Họ và tên']]: who.name,
        [keyOf['Số điện thoại']]: who.phone,
        [keyOf['Email (để nhận thư xác nhận)']]: who.email || '',
        [keyOf['Dịch vụ']]: 'Soi da & tư vấn',
      },
      _hp_website: '',
      appointmentDate: slot.date,
      appointmentTime: slot.time,
      ...(who.marketingConsent === undefined ? {} : { marketingConsent: who.marketingConsent }),
    },
  });
  if (res.status >= 400) throw new Error(`Nộp bài lỗi ${res.status}: ${JSON.stringify(res.json).slice(0, 300)}`);
  return res.json.data;
}

/**
 * Bốn bài nộp đủ để trang Bài nộp có mọi trạng thái bài viết nhắc tới: đang chờ
 * thanh toán, đã nhận tiền, không đồng ý tiếp thị, và đã RÚT đồng ý.
 *
 * Bài "Đã rút" phải ghi thẳng DB: đường thật là khách bấm link trong thư xác
 * nhận, mà ở máy mình không có thư nào được gửi đi.
 *
 * @returns {Promise<{pendingAccessToken: string|null}>}
 */
export async function ensureDemoSubmissions(page, form) {
  const listRows = async () => {
    const data = await api(page, 'GET', `/forms/${form.id}/submissions`);
    return Array.isArray(data) ? data : data?.items || data?.submissions || [];
  };
  const findByName = (rows, name) => rows.find((s) => JSON.stringify(s).includes(name));

  // Ba người đầu được chủ form bấm "Đã nhận tiền" NGAY sau khi nộp: hệ thống chặn
  // một khách giữ quá nhiều chỗ chưa thanh toán (FORM_TOO_MANY_PENDING_HOLDS), mà
  // mọi bài nộp ở đây đều đi ra từ cùng một máy.
  const people = [
    { name: 'Nguyễn Văn An', phone: '0901234501', email: 'an.nguyen@example.com', marketingConsent: true, settle: true },
    { name: 'Phạm Thu Trang', phone: '0901234502', email: 'trang.pham@example.com', marketingConsent: false, settle: true },
    { name: 'Lê Hoàng Long', phone: '0901234503', email: 'long.le@example.com', marketingConsent: true, settle: true },
    { name: 'Trần Thị Mai', phone: '0912345678', email: 'mai.tran@example.com', marketingConsent: true, settle: false },
  ];

  let pendingAccessToken = null;
  for (const [index, who] of people.entries()) {
    let row = findByName(await listRows(), who.name);
    if (!row) {
      const made = await submitDemoForm(page, form, { ...who, slotIndex: index });
      if (!who.settle) pendingAccessToken = made.accessToken || null;
      row = findByName(await listRows(), who.name);
    }
    if (who.settle && row && row.status === 'pending_payment') {
      await api(page, 'POST', `/forms/${form.id}/submissions/${row.id}/confirm-payment`, {});
    }
  }

  // Nguyễn Văn An: đã rút đồng ý tiếp thị.
  const withdrawn = findByName(await listRows(), 'Nguyễn Văn An');
  if (withdrawn && !withdrawn.consentWithdrawnAt) {
    await withDb((db) => db.query(
      `UPDATE form_submissions
          SET marketing_consent = FALSE, consent_withdrawn_at = NOW() - INTERVAL '1 day'
        WHERE id = $1`,
      [withdrawn.id],
    ));
  }
  return { pendingAccessToken };
}

const OWNER_USERNAME = process.env.HELP_SHOT_USERNAME || 'e2etest';

/** id của chủ tài khoản đang dùng để chụp + id các nhân viên do seed dựng. */
async function loadPeople(db) {
  const { rows } = await db.query(
    `SELECT id, username FROM users WHERE username = ANY($1)`,
    [[OWNER_USERNAME, 'nv_marketing', 'nv_cskh', 'nv_intern']],
  );
  const byName = Object.fromEntries(rows.map((r) => [r.username, Number(r.id)]));
  if (!byName[OWNER_USERNAME]) throw new Error(`Không có tài khoản "${OWNER_USERNAME}" trong DB test.`);
  return byName;
}

/**
 * Nhật ký hoạt động mẫu: chủ tài khoản và hai nhân viên làm vài việc trong mấy
 * ngày gần đây. Trang này rỗng ở DB vừa seed vì nhật ký chỉ sinh ra khi có người
 * thao tác thật.
 */
export async function ensureAuditLogDemo() {
  await withDb(async (db) => {
    const people = await loadPeople(db);
    const owner = people[OWNER_USERNAME];
    // Trang này hiện chỉ có nhãn tiếng Việt cho nhóm nhân viên / chiến dịch / mẫu
    // tin. Hành động khác (FORM_*, CUSTOMER_*, LANDING_*…) hiện ra nguyên khoá dịch
    // `auditLogs.actions.X` — lỗi thật của sản phẩm, đã báo riêng. Ảnh minh hoạ thì
    // không nên dính chữ đó, nên dọn các dòng ấy khỏi DB test trước khi chụp.
    await db.query(
      `DELETE FROM audit_logs
        WHERE owner_id = $1
          AND action !~ '^(EMPLOYEE_|CAMPAIGN_(CREATED|UPDATED|DELETED|RUN_STARTED|PAUSED|SCHEDULE_)|EMAIL_TEMPLATE_|ZALO_TEMPLATE_)'`,
      [owner],
    );
    const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM audit_logs WHERE owner_id = $1', [owner]);
    if (rows[0].n >= 8) return;

    const entries = [
      [owner, 'EMPLOYEE_ADDED', 'employee', people.nv_intern, { username: 'nv_intern', method: 'link' }, '6 days'],
      [owner, 'EMPLOYEE_PERMISSIONS_UPDATED', 'employee', people.nv_intern, { permissions: { campaigns_view: true, customers: true, leads: true } }, '6 days'],
      [people.nv_marketing || owner, 'CAMPAIGN_CREATED', 'campaign', 1, { campaignName: 'Tri ân khách hàng thân thiết Q3' }, '4 days'],
      [people.nv_marketing || owner, 'CAMPAIGN_UPDATED', 'campaign', 1, { campaignName: 'Tri ân khách hàng thân thiết Q3' }, '4 days'],
      [owner, 'CAMPAIGN_RUN_STARTED', 'campaign', 1, { campaignName: 'Tri ân khách hàng thân thiết Q3' }, '3 days'],
      [people.nv_cskh || owner, 'EMAIL_TEMPLATE_CREATED', 'email_template', 3, { name: 'Thư chào mừng khách mới' }, '2 days'],
      [people.nv_marketing || owner, 'CAMPAIGN_SCHEDULE_CREATED', 'campaign', 2, { cron: '0 9 * * 1' }, '1 day'],
      [owner, 'EMPLOYEE_LIMITS_UPDATED', 'employee', people.nv_marketing, { dailyZaloLimit: 500 }, '5 hours'],
      [people.nv_marketing || owner, 'CAMPAIGN_PAUSED', 'campaign', 2, { campaignName: 'Nhắc lịch hội thảo tháng 9' }, '2 hours'],
    ];
    for (const [actor, action, entityType, entityId, details, ago] of entries) {
      await db.query(
        `INSERT INTO audit_logs (id_user, owner_id, category, action, entity_type, entity_id, details, ip_address, created_at)
         VALUES ($1, $2, 'workspace', $3, $4, $5, $6, '203.113.0.10', NOW() - ($7)::interval)`,
        [actor, owner, action, entityType, entityId, JSON.stringify(details), ago],
      );
    }
  });
}

/**
 * Dữ liệu chương trình đối tác: mã giới thiệu, doanh thu tháng này đủ lên Bậc 2,
 * và một kỳ đã chốt để ví có tiền — nút "Yêu cầu rút tiền" chỉ bấm được khi số dư
 * từ 1.000.000đ.
 */
export async function ensureAffiliateDemo() {
  await withDb(async (db) => {
    const people = await loadPeople(db);
    const owner = people[OWNER_USERNAME];
    await db.query(
      `UPDATE users SET referral_code = COALESCE(referral_code, 'FOUNDER8K2M') WHERE id = $1`,
      [owner],
    );

    const has = await db.query('SELECT COUNT(*)::int AS n FROM affiliate_ledger WHERE user_id = $1', [owner]);
    if (has.rows[0].n > 0) return;

    // Doanh thu tháng này: mượn các đơn hàng seed sẵn làm order_id (cột UNIQUE + FK).
    const orders = await db.query('SELECT id FROM orders ORDER BY id LIMIT 3');
    const buyers = [people.nv_marketing, people.nv_cskh, people.nv_intern].filter(Boolean);
    const amounts = [5990000, 3588000, 2990000];
    for (const [i, order] of orders.rows.entries()) {
      if (!buyers[i]) break;
      await db.query(
        `INSERT INTO affiliate_revenue_events (referrer_user_id, buyer_user_id, order_id, amount, month_key, created_at)
         VALUES ($1, $2, $3, $4, to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM'), NOW() - INTERVAL '3 days')
         ON CONFLICT (order_id) DO NOTHING`,
        [owner, buyers[i], order.id, amounts[i]],
      );
      await db.query('UPDATE users SET referred_by_user_id = $1, referred_at = NOW() - INTERVAL \'20 days\' WHERE id = $2', [owner, buyers[i]]);
    }

    // Kỳ tháng trước đã chốt → hoa hồng vào ví.
    const period = await db.query(
      `INSERT INTO affiliate_periods (referrer_user_id, month_key, gross_revenue, tier_level, rate_percent, commission_amount, closed_at)
       VALUES ($1, to_char((NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') - INTERVAL '1 month', 'YYYY-MM'), 14500000, 2, 15, 2175000, date_trunc('month', NOW()) + INTERVAL '1 day')
       ON CONFLICT (referrer_user_id, month_key) DO UPDATE SET commission_amount = EXCLUDED.commission_amount
       RETURNING id`,
      [owner],
    );
    await db.query(
      `INSERT INTO affiliate_ledger (user_id, entry_type, amount, ref_type, ref_id, note, created_at)
       VALUES ($1, 'commission', 2175000, 'period', $2, 'Hoa hồng kỳ tháng trước', date_trunc('month', NOW()) + INTERVAL '1 day')`,
      [owner, period.rows[0].id],
    );
  });
}

/**
 * Sổ "Liên hệ khách để lại": gắn vài SĐT/email vào các hội thoại webchat mà
 * `E2E_SEED_INBOX` đã dựng. Sổ thật do cron quét tin nhắn sinh ra, ở máy mình cron
 * đó không chạy nên sổ luôn rỗng.
 */
export async function ensureContactAlertsDemo() {
  await withDb(async (db) => {
    const people = await loadPeople(db);
    const owner = people[OWNER_USERNAME];
    const has = await db.query('SELECT COUNT(*)::int AS n FROM chatbot_contact_alerts WHERE id_user = $1', [owner]);
    // Bản đầu của hàm này gắn email của người này vào hội thoại của người khác —
    // thấy dòng cũ đó thì dựng lại cả sổ.
    const stale = await db.query(
      `SELECT 1 FROM chatbot_contact_alerts WHERE id_user = $1 AND contact_value = 'yennhi.hoang@example.com'`,
      [owner],
    );
    if (has.rows[0].n >= 4 && stale.rowCount === 0) return;
    await db.query('DELETE FROM chatbot_contact_alerts WHERE id_user = $1', [owner]);

    const convs = await db.query(
      `SELECT c.id, c.visitor_name,
              (SELECT MAX(m.id) FROM webchat_messages m WHERE m.id_conversation = c.id) AS message_id
         FROM webchat_conversations c
        WHERE c.id_user = $1
        ORDER BY c.last_message_at DESC
        LIMIT 5`,
      [owner],
    );
    if (convs.rows.length < 4) {
      throw new Error('Thiếu hội thoại webchat mẫu. Nạp lại DB với E2E_SEED_INBOX=1 (hoặc E2E_SEED_ALL=1).');
    }
    const samples = [
      { type: 'phone', value: '0912345678', ago: '25 minutes', count: 1, state: 'pending', excerpt: 'Số mình là 0912345678, bạn gọi giúp mình sau 5 giờ chiều nhé.' },
      { type: 'email', value: 'khach.hang02@example.com', ago: '3 hours', count: 2, state: 'notified', excerpt: 'Gửi báo giá gói Pro qua email khach.hang02@example.com giúp mình.' },
      { type: 'phone', value: '0987654321', ago: '1 day', count: 1, state: 'human', excerpt: 'Mình để lại số 0987654321 nha.' },
      { type: 'phone', value: '0903112233', ago: '2 days', count: 3, state: 'handled', excerpt: 'Liên hệ mình số 0903112233.' },
    ];
    for (const [i, s] of samples.entries()) {
      const conv = convs.rows[i];
      await db.query(
        `INSERT INTO chatbot_contact_alerts (
           id_user, contact_type, contact_value, first_seen_at, last_seen_at, seen_count,
           last_source, last_conversation_id, last_message_id, last_excerpt,
           pending_notify, suppressed_reason, last_notified_at, handled_at, handled_by
         ) VALUES (
           $1, $2, $3, NOW() - ($4)::interval, NOW() - ($4)::interval, $5,
           'web', $6, $7, $8,
           $9, $10, $11, $12, $13
         ) ON CONFLICT (id_user, contact_type, contact_value) DO NOTHING`,
        [
          owner, s.type, s.value, s.ago, s.count,
          conv.id, conv.message_id || 1, s.excerpt,
          s.state === 'pending',
          s.state === 'human' ? 'human_active' : null,
          s.state === 'notified' || s.state === 'handled' ? new Date(Date.now() - 3600_000) : null,
          s.state === 'handled' ? new Date(Date.now() - 1800_000) : null,
          s.state === 'handled' ? owner : null,
        ],
      );
    }
  });
}

/** Nhân viên ĐÃ CÓ tài khoản + gói riêng, được chủ "Link tài khoản có sẵn" và cấp bộ quyền "Chỉ xem". */
export const LINKED_EMPLOYEE = { username: 'nvgiahuy', email: 'giahuy@uknow.test', fullName: 'Phan Gia Huy' };

/**
 * Dựng đúng ca hay bị tưởng là lỗi: người có gói riêng đăng nhập vào tài khoản của CHÍNH HỌ, phải
 * bấm dải mời (hoặc menu ảnh đại diện) mới sang không gian công ty. Nhân viên do seed dựng không có
 * gói nên vào thẳng không gian công ty — không chụp được dải mời bằng họ.
 */
export async function ensureLinkedEmployeeDemo() {
  const bcrypt = (await import('bcryptjs')).default;
  await withDb(async (db) => {
    const owner = (await db.query('SELECT id, active_plan_id FROM users WHERE username = $1', [OWNER_USERNAME])).rows[0];
    if (!owner) throw new Error(`Không có tài khoản "${OWNER_USERNAME}" trong DB test.`);
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
    const created = await db.query(
      `INSERT INTO users (username, email, password_hash, full_name, status, role, is_verified, verified_at,
                          phone, active_plan_id, subscription_expires_at, referral_prompt_dismissed_at)
       VALUES ($1, $2, $3, $4, 'active', 'user', TRUE, NOW(), '0977000111', $5, NOW() + INTERVAL '200 days', NOW())
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      [LINKED_EMPLOYEE.username, LINKED_EMPLOYEE.email, passwordHash, LINKED_EMPLOYEE.fullName, owner.active_plan_id],
    );
    const employeeId = created.rows[0].id;

    // Đã đồng ý điều khoản (chép bản mới nhất của chủ) — không thì hộp thoại đồng ý che hết trang.
    const consents = await db.query('SELECT COUNT(*)::int AS n FROM user_consents WHERE user_id = $1', [employeeId]);
    if (consents.rows[0].n === 0) {
      await db.query(
        `INSERT INTO user_consents (user_id, purpose, granted, document_version, document_hash, source, ip_address, user_agent)
         SELECT $1, purpose, granted, document_version, document_hash, source, ip_address, user_agent
           FROM (SELECT DISTINCT ON (purpose) * FROM user_consents WHERE user_id = $2 ORDER BY purpose, created_at DESC) latest`,
        [employeeId, owner.id],
      );
    }

    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, permissions, status)
       VALUES ($1, $2, $3::jsonb, 'active')
       ON CONFLICT (owner_id, employee_id) DO UPDATE SET permissions = EXCLUDED.permissions, status = 'active', updated_at = NOW()`,
      [owner.id, employeeId, JSON.stringify({ campaigns_view: true, reports_view: true, customers: true, leads: true })],
    );
  });
}
