/**
 * Cột "Chi tiết" của Nhật ký hoạt động phải là câu người thường đọc được.
 *
 * Trước 04/10/2026 cột này in `nodesSau: 2, nodesTruoc: 0`, `slug: null, title: "1", isPublished: false`,
 * `permissions: {"forms":true,…}`. Các `details` dưới đây là hình dạng THẬT mà backend ghi (đối chiếu từng
 * call site `logWorkspace` / `logSystem` / `auditService.log`), kể cả các giá trị gây bẫy (source nội bộ,
 * id, sessionKey, mốc giờ UTC sát nửa đêm giờ Việt Nam).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import viTranslations from '../../i18n/vi';
import enTranslations from '../../i18n/en';
import { formatAuditDetails, EMPLOYEE_PERMISSION_LABEL_KEYS } from '../auditLogDetails';

const lookup = (dict) => (key) => key.split('.').reduce((acc, part) => acc?.[part], dict) ?? key;
// Giống `t()` thật: trả lại CHÍNH khoá khi thiếu bản dịch, KHÔNG tự điền {tham số}.
const tVi = lookup(viTranslations);
const tEn = lookup(enTranslations);

const here = path.dirname(fileURLToPath(import.meta.url));

/** [action, details thật, câu mong đợi (vi)] */
const REAL_ROWS = [
  ['LANDING_PAGE_CREATED', { slug: null, title: '1', isPublished: false }, 'Tiêu đề "1" · Chưa xuất bản'],
  ['LANDING_PAGE_UPDATED', { slug: '/khoa-hoc', title: 'Khoá học', isPublished: true }, 'Tiêu đề "Khoá học" · Đường dẫn /khoa-hoc · Đã xuất bản'],
  ['LANDING_PAGE_UPDATED', { sheetsSync: { enabled: true, sheetId: 'abc' } }, 'Cấu hình Google Sheets'],
  ['LANDING_DOMAIN_UPDATED', { hostname: 'shop.vn', status: 'pending_verification', isApexDomain: true }, 'Tên miền shop.vn · Tên miền gốc · Chờ xác minh'],
  ['CAMPAIGN_CREATED', { name: 'test', type: 'telegram', via: 'builder' }, '"test" · Kênh Telegram · Tạo thủ công'],
  ['CAMPAIGN_CREATED', { name: 'Khuyến mãi', type: 'zalo', via: 'ai_compiler_slot_filling' }, '"Khuyến mãi" · Kênh Zalo cá nhân · Tạo bằng trợ lý AI'],
  ['CAMPAIGN_UPDATED', { nodesSau: 2, nodesTruoc: 0 }, 'Số bước: 0 → 2'],
  ['CAMPAIGN_RUN_STARTED', { runId: 468, source: 'campaign_run', continuousMode: false, via: 'builder' }, 'Chạy một lần'],
  ['CAMPAIGN_RUN_STARTED', { runId: 469, source: 'schedule', continuousMode: true, via: 'ai' }, 'Chạy liên tục · Từ lịch chạy'],
  ['CAMPAIGN_ACTIVATED', { previousStatus: 'draft', scheduleId: 5, viaSchedule: true }, 'Kích hoạt cùng lịch chạy · Trước đó: Bản nháp'],
  ['CAMPAIGN_SCHEDULE_CREATED', { scheduleId: 5, scheduleType: 'daily', cronExpression: '0 9 * * *', enabled: true }, 'Lịch Hàng ngày · Đang bật'],
  ['CAMPAIGN_SCHEDULE_UPDATED', { scheduleId: 5, changedFields: ['scheduleName', 'cronExpression'], enabled: true }, 'Đã sửa: tên lịch, thời điểm chạy · Đang bật'],
  ['CAMPAIGN_SCHEDULE_TOGGLED', { scheduleId: 5, enabled: false, previousEnabled: true }, 'Tắt lịch'],
  ['CAMPAIGN_SCHEDULE_TOGGLED', { scheduleId: 5, enabled: true, previousEnabled: false }, 'Bật lịch'],
  [
    'CAMPAIGN_SCHEDULE_TOGGLED',
    { scheduleId: 5, enabled: false, automatic: true, reason: 'Zalo chưa đăng nhập' },
    'Hệ thống tự tắt lịch sau nhiều lần chạy lỗi · Lỗi gần đây: Zalo chưa đăng nhập',
  ],
  ['CAMPAIGN_APPROVAL_REQUESTED', { threshold: 1000, totalCustomers: 2500, actorUserId: 9 }, '2.500 người nhận · Ngưỡng duyệt 1.000 người'],
  ['CAMPAIGN_APPROVAL_REJECTED', { reason: 'Nội dung chưa phù hợp' }, 'Lý do: Nội dung chưa phù hợp'],
  ['CAMPAIGN_APPROVAL_THRESHOLD_UPDATED', { before: null, after: 1000 }, 'Ngưỡng duyệt chiến dịch: Tắt → 1.000 người nhận'],
  // 18/10 00:00 giờ VN = 17/10 17:00 UTC; 18:00 UTC đã sang ngày 18 giờ VN
  [
    'USER_PLAN_CHANGED',
    { expiresAt: '2026-10-17T18:00:00.000Z', planCode: 'trial', source: 'signup_auto_trial' },
    'Gói Dùng thử · Hết hạn 18/10/2026 · Tự cấp khi đăng ký',
  ],
  ['USER_PLAN_CHANGE_FAILED', { source: 'signup_auto_trial_google', planCode: 'trial', error: 'plan not found' }, 'Không cấp được Gói Dùng thử · Lỗi: plan not found'],
  [
    'EMPLOYEE_PERMISSIONS_UPDATED',
    { permissions: { forms: true, customers: true, leads: true, courses: true, reports_view: true, inbox_view: false } },
    'Được phép: Biểu mẫu thu thập, Khách hàng, Leads landing page, Quản lý sản phẩm … và 1 quyền khác',
  ],
  ['EMPLOYEE_PERMISSIONS_UPDATED', { permissions: { email_settings: true, zalo_settings: true, forms: false } }, 'Được phép: Quản lý kênh gửi'],
  ['EMPLOYEE_PERMISSIONS_UPDATED', { permissions: { forms: false } }, 'Không được phép quyền nào'],
  [
    'EMPLOYEE_LIMITS_UPDATED',
    { dailyEmailLimit: 200, monthlyEmailLimit: null, dailyZaloLimit: 100, monthlyZaloLimit: 3000, dailyAiCreditLimit: null, periodAiCreditLimit: 50 },
    'Email: ngày 200, tháng không giới hạn · Zalo: ngày 100, tháng 3.000 · Lượt AI: ngày không giới hạn, kỳ gói 50',
  ],
  ['EMPLOYEE_CHANNEL_ACCOUNTS_UPDATED', { channel: 'zalo_personal', before: [5], after: [5, 6, 7] }, 'Zalo cá nhân · Được giao 3 tài khoản (trước đó 1)'],
  ['EMPLOYEE_CHANNEL_ACCOUNTS_UPDATED', { channel: 'zalo_personal', before: [5, 6], after: [] }, 'Zalo cá nhân · Được giao 0 tài khoản (trước đó 2)'],
  ['EMPLOYEE_ADDED', { email: 'n@x.vn', fullName: 'Nam', method: 'invited', invitationSent: true }, 'Nam (n@x.vn) · Đã gửi lời mời'],
  ['EMPLOYEE_ADDED', { username: 'nv01', email: 'nv@x.vn', fullName: 'Hoa', invitationSent: false }, 'Hoa (nv@x.vn) · Chưa gửi được lời mời'],
  ['EMPLOYEE_INFO_UPDATED', { before: { fullName: 'A', email: 'a@x.vn' }, after: { fullName: 'B', email: 'a@x.vn' } }, 'Họ tên: A → B'],
  ['EMPLOYEE_STATUS_UPDATED', { status: 'inactive' }, 'Trạng thái: Tạm ngưng'],
  ['ZALO_ACCOUNT_SEND_LIMIT_UPDATED', { previousValue: null, newValue: 150, exceededRecommended: true }, 'Giới hạn gửi/ngày: không giới hạn → 150 · Vượt mức khuyến nghị'],
  ['EMAIL_ACCOUNT_SEND_LIMIT_UPDATED', { previousValue: 500, newValue: 800, exceededRecommended: false }, 'Giới hạn gửi/ngày: 500 → 800'],
  ['ZALO_ACCOUNT_SEND_SPEED_UPDATED', { previous: 'safe', next: 'fast' }, 'Tốc độ gửi: An toàn → Nhanh'],
  [
    'CHANNEL_ACCOUNT_SEND_SETTINGS_UPDATED',
    { channel: 'telegram', accountKey: 'tg-7', previous: { userDailySendLimit: null, sendSpeed: 'safe' }, next: { userDailySendLimit: 200, sendSpeed: 'safe' } },
    'Telegram · Giới hạn gửi/ngày: không giới hạn → 200',
  ],
  ['EMAIL_ACCOUNT_CONNECTED', { email: 'a@b.vn', emailMode: 'smtp' }, 'a@b.vn · Dùng SMTP riêng'],
  ['ZALO_ACCOUNT_CONNECTED', { channel: 'zalo_personal', displayName: 'Nguyễn A' }, 'Zalo cá nhân · Nguyễn A'],
  ['WHATSAPP_ACCOUNT_RENAMED', { channel: 'whatsapp_baileys', sessionKey: '12-abc', nickname: 'Hotline' }, 'Tên mới: Hotline'],
  ['WHATSAPP_ACCOUNT_DELETED', { channel: 'whatsapp_baileys', sessionKey: '12-abc' }, 'WhatsApp'],
  [
    'CHATBOT_CHANNEL_UPDATED',
    { channelType: 'zalo_personal', chatbotId: 3, enabled: true, provider: null, sessionKey: null, telegramAccountId: null, zaloSettingId: 8 },
    'Kênh Zalo cá nhân · Bật',
  ],
  ['CHATBOT_CHANNEL_UPDATED', { channelType: 'whatsapp', provider: 'baileys', sessionKey: '12-abc', chatbotId: 3, enabled: false }, 'Kênh WhatsApp · Tắt'],
  ['CHATBOT_CHANNEL_DISCONNECTED', { channelType: 'telegram_personal' }, 'Kênh Telegram'],
  ['CHATBOT_CREATED', { name: 'Trợ lý bán hàng' }, '"Trợ lý bán hàng"'],
  ['KNOWLEDGE_DOCUMENT_CREATED', { chatbotId: 1, chunks: 12, pages: 3, sourceType: 'url' }, 'Nguồn: Đường dẫn trang web · 3 trang · 12 đoạn'],
  ['KNOWLEDGE_DOCUMENT_CREATED', { knowledgeBaseId: 4, sourceType: 'file' }, 'Nguồn: Tệp tải lên'],
  ['KNOWLEDGE_DOCUMENT_DELETED', { chatbotId: 1 }, '—'],
  [
    'FORM_PAYMENT_CONFIG_UPDATED',
    { method: 'bank', methods: ['bank'], bankBin: '970436', accountNumberLast4: '1234', momoPhoneLast4: null, momoQrAccountLast4: null, enabled: true },
    'Bật thu tiền: Chuyển khoản (…1234)',
  ],
  [
    'FORM_PAYMENT_CONFIG_UPDATED',
    { method: 'momo', methods: ['bank', 'momo'], bankBin: null, accountNumberLast4: '9876', momoPhoneLast4: '4321', momoQrAccountLast4: null, enabled: true },
    'Bật thu tiền: Chuyển khoản (…9876), MoMo (…4321)',
  ],
  ['FORM_PAYMENT_CONFIG_UPDATED', { method: null, methods: null, enabled: false }, 'Tắt thu tiền'],
  ['EMAIL_TEMPLATE_CREATED', { category: 'sale', templateCode: 'welcome', templateName: 'Chào mừng' }, '"Chào mừng" · Nhóm: sale'],
  ['ZALO_TEMPLATE_DELETED', { category: null, templateCode: 'x1', templateName: 'Nhắc lịch' }, '"Nhắc lịch"'],
  ['INBOX_REPLY_SENT', { conversationId: 9, conversationType: 'zalo_personal', attachmentCount: 2 }, 'Hội thoại Zalo cá nhân · kèm 2 tệp'],
  ['INBOX_REPLY_SENT', { conversationId: 9, conversationType: 'webchat', attachmentCount: 0 }, 'Hội thoại web chat'],
  ['INBOX_AI_PAUSE_UPDATED', { paused: false, scope: 'all', resumedCount: 4 }, 'Bật lại AI cho mọi hội thoại · 4 hội thoại'],
  ['INBOX_AI_PAUSE_UPDATED', { conversationType: 'channel', paused: true }, 'Tạm dừng AI · Hội thoại kênh nhắn tin'],
  ['INBOX_CONVERSATION_DELETED', { conversationType: 'channel' }, 'Hội thoại kênh nhắn tin'],
  ['MEDIA_UPLOADED', { source: 'inbox_outbound', size: 1536, mime: 'image/png' }, 'image/png · 1,5 KB'],
  ['MEDIA_DELETED', { category: 'chat_attachment', referenceType: 'inbox_message' }, 'Nhóm: Tệp đính kèm hội thoại'],
  // 04/10/2026: nhật ký xoá ghi tên + cỡ tệp để chủ biết tệp nào đã bị xoá
  ['MEDIA_DELETED', { category: 'chat_attachment', referenceType: 'chat_attachment', displayName: 'BaoCao.docx', sizeBytes: 32600000 }, '"BaoCao.docx" · 31,1 MB · Nhóm: Tệp đính kèm hội thoại'],
  ['CUSTOMER_BULK_UPSERTED', { inserted: 10, updated: 2, skipped: 0, campaignLinked: 0, total: 12 }, 'Thêm mới 10 · Cập nhật 2'],
  ['PLAN_CREATED', { code: 'pro', name: 'Pro' }, '"Pro" · Mã pro'],
  ['PLAN_UPDATED', { name: 'Pro' }, '"Pro"'],
  ['PLAN_DELETED', { softDelete: true }, 'Ẩn gói (xoá mềm)'],
  ['PLAN_UNASSIGNED', { email: 'a@b.vn', lockedResources: [{ resourceKey: 'a', resourceId: 1 }, { resourceKey: 'b', resourceId: 2 }] }, 'Gỡ gói của a@b.vn · Khoá 2 mục vượt hạn mức'],
  ['VOUCHER_CREATED', { voucherId: 5, offerMode: 'automatic', name: 'Giảm 10%' }, '"Giảm 10%" · Tự động áp dụng'],
  ['VOUCHER_DELETED', { soft: true }, 'Xoá mềm'],
  ['USER_REGISTERED', { username: 'u1', email: 'a@b.vn', provider: 'google' }, 'a@b.vn · Đăng ký bằng Google'],
  ['USER_ROLE_CHANGED', { from: 'user', to: 'admin', email: 'a@b.vn' }, 'a@b.vn · Vai trò: Người dùng → Quản trị viên'],
  [
    'USER_EMAIL_DETACHED',
    { originalEmail: 'cu@b.vn', newEmail: 'moi@b.vn', releaseTrialHistory: true, anonymizedTrialOrdersCount: 2 },
    'Email: cu@b.vn → moi@b.vn · Cho phép dùng thử lại · Ẩn danh 2 đơn dùng thử',
  ],
  ['TWO_FACTOR_RESET_BY_ADMIN', { email: 'a@b.vn', hadTwoFactor: true }, 'a@b.vn · Đã bật xác thực hai lớp'],
  ['AI_SYSTEM_MODEL_UPDATED', { modelId: 'gemini-b', previousModel: 'gemini-a', newModel: 'gemini-b' }, 'gemini-a → gemini-b'],
  ['ORDER_REFUNDED', { orderCode: '123', userId: 4, reason: 'Khách yêu cầu', amount: 500000, statusBefore: 'paid' }, 'Đơn 123 · Hoàn 500.000 đ · Lý do: Khách yêu cầu'],
  ['EINVOICE_RETRIED', { ok: false, skipped: false, reason: null, errorCode: 'E01', status: 'failed' }, 'Không thành công · Mã lỗi: E01'],
  ['FORM_DISABLED', { publicKey: 'k-1', title: 'Đăng ký' }, '"Đăng ký"'],
  [
    'WIZARD_DEAD_END',
    { channel: 'email', count: 3, gate: 'audience', sessionId: 'abc' },
    'Trợ lý AI hỏi lặp lại cùng một bước tới lần thứ 3 · Bước: Audience · Kênh Email',
  ],
  ['WIZARD_STATE_NOOP', { sessionId: 'abc', action: 'select_channel', payloadKeys: ['x'] }, 'Nút bấm không có tác dụng: Select channel'],
  ['AI_TURN_FAILED', { sessionId: 12, stage: 'smart_chat', code: 'AI_TIMEOUT', feature: 'smart_chat' }, 'Bước: Smart chat · Mã lỗi: AI_TIMEOUT'],
];

/** Hành động chỉ mang id nội bộ hoặc không có khoá nào → không có gì đáng hiện. */
const NOTHING_TO_SHOW = [
  ['LANDING_VERSION_DELETED', { landingPageId: 7 }],
  ['CAMPAIGN_APPROVAL_APPROVED', { runId: 12 }],
  ['CAMPAIGN_DELETED', {}],
  ['CHATBOT_DELETED', {}],
  ['EMPLOYEE_REMOVED', {}],
  ['TWO_FACTOR_ENABLED', {}],
  ['LANDING_PAGE_DELETED', {}],
  ['USER_PHONE_RECLAIMED', { reclaimedByUserId: 9 }],
  ['CUSTOMER_CREATED', null],
];

const TECHNICAL_LEAK = /nodesSau|nodesTruoc|slug:|runId|scheduleId|sessionKey|chatbotId|isPublished|continuousMode|campaign_run|signup_auto_trial|"forms"|\{|\}|\[object|undefined|null|auditLogs\.|JSON|(chatbot|run|schedule|session|landing page|reclaimed by user) id\b|session key/i;

describe('formatAuditDetails — câu đọc được cho dòng nhật ký thật', () => {
  it.each(REAL_ROWS)('%s %j → %s', (action, details, expected) => {
    expect(formatAuditDetails(action, details, tVi, 'vi')).toBe(expected);
  });

  it.each(NOTHING_TO_SHOW)('%s chỉ mang id nội bộ → "—"', (action, details) => {
    expect(formatAuditDetails(action, details, tVi, 'vi')).toBe('—');
  });

  it('KHÔNG dòng thật nào ra tên khoá kỹ thuật, JSON hay khoá dịch (vi và en)', () => {
    for (const [action, details] of [...REAL_ROWS.map(([a, d]) => [a, d]), ...NOTHING_TO_SHOW]) {
      for (const [t, locale] of [[tVi, 'vi'], [tEn, 'en']]) {
        const text = formatAuditDetails(action, details, t, locale);
        expect(text, `${action} (${locale})`).not.toMatch(TECHNICAL_LEAK);
        expect(text.length).toBeGreaterThan(0);
      }
    }
  });

  it('bản tiếng Anh dùng chữ tiếng Anh, vẫn ngày theo giờ VN', () => {
    expect(formatAuditDetails('CAMPAIGN_UPDATED', { nodesSau: 2, nodesTruoc: 0 }, tEn, 'en')).toBe('Steps: 0 → 2');
    expect(formatAuditDetails('CAMPAIGN_RUN_STARTED', { source: 'schedule', continuousMode: true }, tEn, 'en')).toBe('Continuous run · From schedule');
    expect(
      formatAuditDetails('USER_PLAN_CHANGED', { planCode: 'trial', expiresAt: '2026-10-17T18:00:00.000Z', source: 'signup_auto_trial' }, tEn, 'en'),
    ).toBe('Trial Plan · Expires 18/10/2026 · Granted automatically at sign-up');
  });

  it('mỗi hành động của backend, gặp details rỗng, không bao giờ trả khoá dịch hay JSON', () => {
    const source = fs.readFileSync(path.resolve(here, '../../../../backend/src/services/audit.service.js'), 'utf8');
    const open = source.indexOf('{', source.indexOf('export const AUDIT_ACTIONS'));
    const close = source.indexOf('}', open);
    const actions = [...source.slice(open, close).matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(actions.length).toBeGreaterThanOrEqual(86);
    for (const action of actions) {
      expect(formatAuditDetails(action, {}, tVi, 'vi')).toBe('—');
      expect(formatAuditDetails(action, undefined, tVi, 'vi')).toBe('—');
    }
  });
});

describe('formatAuditDetails — nhánh mặc định (hành động chưa có formatter riêng)', () => {
  const details = {
    someFlag: true,
    otherFlag: false,
    emptyOne: null,
    blank: '',
    createdAt: '2026-10-04T03:00:00.000Z',
    day: '2026-10-04',
    tags: ['a', 'b'],
    nested: { x: 1, y: 2 },
    rows: [{ a: 1 }, { a: 2 }, { a: 3 }],
    amount: 1500000,
    // khoá kỹ thuật phải biến mất
    chatbotId: 7,
    sessionKey: '12-abc',
    via: 'builder',
    source: 'campaign_run',
    runId: 5,
    token: 'tk-secret',
    scheduleId: 9,
  };

  it('đổi khoá thành nhãn, true/false → Có/Không, bỏ null, ngày giờ VN, mảng/object → đếm', () => {
    const text = formatAuditDetails('SOMETHING_BRAND_NEW', details, tVi, 'vi');
    expect(text).toContain('Some flag: Có');
    expect(text).toContain('Other flag: Không');
    expect(text).toContain('Created at: 10:00 04/10/2026');
    expect(text).toContain('Day: 04/10/2026');
    expect(text).toContain('Tags: a, b');
    expect(text).toContain('Nested: 2 mục');
    expect(text).toContain('Rows: 3 mục');
    expect(text).toContain('Amount: 1.500.000');
    expect(text).not.toMatch(/Empty one|Blank/);
    expect(text).not.toMatch(/Chatbot|Session|Via|Source|Run|Token|secret|Schedule|campaign_run|tk-/i);
    expect(text).not.toMatch(TECHNICAL_LEAK);
  });

  it('khoá có nhãn riêng thì dùng nhãn (reason → Lý do)', () => {
    expect(formatAuditDetails('SOMETHING_BRAND_NEW', { reason: 'Hết hạn', enabled: true }, tVi, 'vi')).toBe('Lý do: Hết hạn · Đang bật: Có');
  });

  it('chỉ có khoá kỹ thuật / giá trị rỗng → "—"', () => {
    expect(formatAuditDetails('SOMETHING_BRAND_NEW', { chatbotId: 1, via: 'x', a: null, b: '', c: [] , d: {} }, tVi, 'vi')).toBe('—');
  });

  it('details không phải object → "—"', () => {
    for (const bad of [null, undefined, '', 'abc', 5, [], [1, 2]]) {
      expect(formatAuditDetails('SOMETHING_BRAND_NEW', bad, tVi, 'vi')).toBe('—');
    }
  });

  it('chuỗi dài bị cắt, không tràn cột', () => {
    const text = formatAuditDetails('SOMETHING_BRAND_NEW', { note: 'x'.repeat(500) }, tVi, 'vi');
    expect(text.length).toBeLessThan(160);
    expect(text.endsWith('…')).toBe(true);
  });
});

describe('bảng nhãn quyền nhân viên', () => {
  it('đủ mọi khoá quyền của EmployeeManagement.jsx và mọi nhãn đều có bản dịch', () => {
    const src = fs.readFileSync(path.resolve(here, '../../pages/settings/EmployeeManagement.jsx'), 'utf8');
    const start = src.indexOf('const PERMISSION_FIELDS');
    const block = src.slice(start, src.indexOf('];', start));
    const keys = [...block.matchAll(/keys:\s*\[([^\]]+)\]/g)].flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
    expect(keys.length).toBeGreaterThanOrEqual(24);
    for (const key of keys) {
      const labelKey = EMPLOYEE_PERMISSION_LABEL_KEYS[key];
      expect(labelKey, `thiếu ${key} trong EMPLOYEE_PERMISSION_LABEL_KEYS`).toBeTruthy();
      expect(viTranslations.employee.permissions[labelKey], `vi ${labelKey}`).toBeTruthy();
      expect(enTranslations.employee.permissions[labelKey], `en ${labelKey}`).toBeTruthy();
    }
  });
});

describe('bài hướng dẫn nhat-ky-hoat-dong khớp màn hình', () => {
  const seed = fs.readFileSync(path.resolve(here, '../../../../backend/src/services/help/helpSeed.data.js'), 'utf8');
  const start = seed.indexOf("slug: 'nhat-ky-hoat-dong'");
  const article = seed.slice(start, seed.indexOf("slug: 'xac-thuc-hai-lop'", start));

  it('nhắc đúng chữ trên màn hình (ghim theo vi.js) và không còn ô tìm kiếm không tồn tại', () => {
    expect(start).toBeGreaterThan(0);
    const { auditLogs, common } = viTranslations;
    for (const label of [auditLogs.systemActor, auditLogs.colDetails, auditLogs.colUser, auditLogs.action, auditLogs.entity, auditLogs.startDate, auditLogs.endDate, common.filter]) {
      expect(article, label).toContain(label);
    }
    expect(article).not.toContain('Tìm theo chi tiết');
    expect(article).not.toContain('Xóa lọc');
  });
});

describe('từ điển auditLogs.details', () => {
  const flatten = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) => (
    v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  ));

  it('vi và en có đúng cùng một tập khoá', () => {
    const vi = flatten(viTranslations.auditLogs.details).sort();
    const en = flatten(enTranslations.auditLogs.details).sort();
    expect(vi.length).toBeGreaterThan(150);
    expect(en).toEqual(vi);
  });

  it('không có chữ cấm quảng bá ("nhất", "hàng đầu", "tốt nhất", "tuyệt đối") ở cả hai ngôn ngữ', () => {
    const own = (dict) => ({ ...dict.auditLogs.details, systemActor: dict.auditLogs.systemActor, viewRaw: dict.auditLogs.viewRaw, rawTitle: dict.auditLogs.rawTitle });
    const all = JSON.stringify([own(viTranslations), own(enTranslations)]);
    expect(all).not.toMatch(/nhất|hàng đầu|tốt nhất|tuyệt đối|best|number one/i);
  });

  it('có nhãn "Hệ thống (tự động)" và các chữ của khung xem dữ liệu gốc', () => {
    for (const dict of [viTranslations, enTranslations]) {
      for (const key of ['systemActor', 'viewRaw', 'rawTitle', 'rawClose']) expect(dict.auditLogs[key]).toBeTruthy();
    }
    expect(viTranslations.auditLogs.systemActor).toBe('Hệ thống (tự động)');
  });
});
