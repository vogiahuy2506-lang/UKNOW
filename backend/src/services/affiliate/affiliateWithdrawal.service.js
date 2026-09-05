import db from '../../config/database.js';
import { TAX_CODE_REGEX, ID_NUMBER_REGEX } from '../../utils/invoiceVat.util.js';
import { encryptAffiliatePii, decryptAffiliatePii } from '../../utils/affiliatePiiCrypto.util.js';
import { buildBaseTemplate, sendSystemEmail } from '../../utils/systemEmail.util.js';
import { resolveTier, AFFILIATE_TIERS } from '../../utils/affiliateTier.util.js';
import auditService from '../audit.service.js';

export const MIN_WITHDRAWAL_AMOUNT = 1_000_000;
export const INTERNAL_NOTIFY_EMAIL = process.env.AFFILIATE_NOTIFY_EMAIL || 'hotro.digibook@gmail.com';

function formatVnd(amount) {
  return `${Number(amount || 0).toLocaleString('vi-VN')} đ`;
}

/**
 * Gửi email thông báo nội bộ tới kế toán khi có yêu cầu rút hoa hồng mới.
 * TUYỆT ĐỐI KHÔNG đưa số CCCD vào email (kế toán xem trong trang admin).
 */
export async function sendInternalWithdrawalNotification(withdrawal, userEmail) {
  const requestedAtStr = new Date(withdrawal.requested_at || Date.now()).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const content = `
    <p style="margin:0 0 8px;font-size:16px;color:#374151;line-height:1.6">
      Có một yêu cầu rút hoa hồng mới từ đối tác,
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6">
      Vui lòng kiểm tra thông tin KYC và thực hiện chuyển khoản trong vòng <strong>7 ngày làm việc</strong>.
    </p>

    <!-- Withdrawal details table -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;margin-bottom:20px">
      <tr>
        <td style="padding:16px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:8px 0;font-size:13px;color:#6b7280;width:160px">Mã yêu cầu</td>
              <td style="padding:8px 0;font-size:13px;font-weight:700;color:#f97316">#${withdrawal.id}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:8px 0;font-size:13px;color:#6b7280">Họ và tên đối tác</td>
              <td style="padding:8px 0;font-size:13px;font-weight:600;color:#374151">${withdrawal.full_name}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:8px 0;font-size:13px;color:#6b7280">Email tài khoản</td>
              <td style="padding:8px 0;font-size:13px;font-weight:600;color:#374151">
                <a href="mailto:${userEmail || ''}" style="color:#f97316;text-decoration:none">${userEmail || '—'}</a>
              </td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:8px 0;font-size:13px;color:#6b7280">Số tiền xin rút (gộp)</td>
              <td style="padding:8px 0;font-size:13px;font-weight:700;color:#111827">${formatVnd(withdrawal.amount_gross)}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:8px 0;font-size:13px;color:#6b7280">Thuế TNCN khấu trừ (10%)</td>
              <td style="padding:8px 0;font-size:13px;font-weight:600;color:#dc2626">${formatVnd(withdrawal.tax_amount)}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:8px 0;font-size:13px;color:#6b7280">Số tiền thực nhận</td>
              <td style="padding:8px 0;font-size:14px;font-weight:700;color:#16a34a">${formatVnd(withdrawal.amount_net)}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:8px 0;font-size:13px;color:#6b7280">Ngân hàng</td>
              <td style="padding:8px 0;font-size:13px;font-weight:600;color:#374151">${withdrawal.bank_name}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:8px 0;font-size:13px;color:#6b7280">Số tài khoản</td>
              <td style="padding:8px 0;font-size:13px;font-weight:700;color:#374151;letter-spacing:0.5px">${withdrawal.bank_account_number}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:8px 0;font-size:13px;color:#6b7280">Tên chủ tài khoản</td>
              <td style="padding:8px 0;font-size:13px;font-weight:600;color:#374151">${withdrawal.bank_account_name}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:8px 0;font-size:13px;color:#6b7280">Thời gian yêu cầu</td>
              <td style="padding:8px 0;font-size:13px;color:#374151">${requestedAtStr}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#6b7280">Hạn xử lý</td>
              <td style="padding:8px 0;font-size:13px;font-weight:600;color:#b45309">7 ngày làm việc kể từ ngày yêu cầu</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5">
      🔴 Lưu ý bảo mật: Số CCCD không được đính kèm trong email này. Kế toán vui lòng đăng nhập vào trang Quản trị để đối soát hồ sơ gốc.
    </p>
  `;

  const html = buildBaseTemplate({
    subtitle: 'Yêu cầu rút hoa hồng mới',
    content,
    footerNote: 'Email tự động gửi từ hệ thống đối tác Founder AI.',
  });

  return sendSystemEmail({
    to: INTERNAL_NOTIFY_EMAIL,
    subject: `[Founder AI] Yêu cầu rút hoa hồng #${withdrawal.id} — ${withdrawal.full_name}`,
    html,
  });
}

/**
 * Tạo yêu cầu rút hoa hồng.
 * Thứ tự các bước:
 * 1. Validate theo nhánh (personal vs company)
 * 2. Mã hóa số CCCD (fail rõ ràng nếu thiếu AFFILIATE_PII_SECRET_KEY)
 * 3. Bắt đầu transaction
 * 4. Lock advisory theo user_id
 * 5. Tính số dư SUM(amount) từ affiliate_ledger
 * 6. Kiểm tra ngưỡng < 1tr, số dư, và pending
 * 7. INSERT affiliate_withdrawals (pending)
 * 8. INSERT affiliate_ledger (withdrawal, -amount_gross)
 * 9. COMMIT
 * 10. Bắt lỗi 23505 đổi thành thông báo thân thiện
 * 11. Gửi email nội bộ (fire-and-forget)
 */
export async function requestWithdrawal(userId, payload, options = {}) {
  const partnerType = payload?.partner_type === 'company' ? 'company' : 'personal';

  // Nhánh company chưa mở quy trình kế toán -> BẮT BUỘC CHẶN
  if (partnerType === 'company') {
    const error = new Error('Đối tác doanh nghiệp vui lòng liên hệ hỗ trợ để được hướng dẫn.');
    error.status = 400;
    throw error;
  }

  // Validate các trường cơ bản cho cá nhân
  const fullName = String(payload?.full_name || '').trim();
  if (!fullName) {
    const error = new Error('Thiếu họ và tên');
    error.status = 400;
    throw error;
  }

  const idNumber = String(payload?.id_card_number || '').trim().replace(/\s+/g, '');
  if (!idNumber) {
    const error = new Error('Thiếu số CCCD/CMND');
    error.status = 400;
    throw error;
  }
  if (!ID_NUMBER_REGEX.test(idNumber)) {
    const error = new Error('Số CCCD/CMND không hợp lệ (gồm 9 đến 12 chữ số)');
    error.status = 400;
    throw error;
  }

  // Kiểm tra ngày cấp CCCD/CMND
  const rawIssuedDate = payload?.id_card_issued_date;
  const issuedDateStr = String(rawIssuedDate || '').trim();
  if (!issuedDateStr) {
    const error = new Error('Thiếu ngày cấp CCCD/CMND');
    error.status = 400;
    throw error;
  }

  let idCardIssuedDate;
  if (/^\d{4}-\d{2}-\d{2}$/.test(issuedDateStr)) {
    const [y, m, d] = issuedDateStr.split('-').map(Number);
    const dObj = new Date(y, m - 1, d);
    if (dObj.getFullYear() !== y || dObj.getMonth() !== m - 1 || dObj.getDate() !== d) {
      const error = new Error('Ngày cấp CCCD/CMND không hợp lệ');
      error.status = 400;
      throw error;
    }
    const todayVn = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    if (issuedDateStr > todayVn) {
      const error = new Error('Ngày cấp CCCD/CMND không thể ở tương lai');
      error.status = 400;
      throw error;
    }
    idCardIssuedDate = issuedDateStr;
  } else {
    const issuedDateObj = new Date(issuedDateStr);
    if (Number.isNaN(issuedDateObj.getTime())) {
      const error = new Error('Ngày cấp CCCD/CMND không hợp lệ');
      error.status = 400;
      throw error;
    }
    const todayVn = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    const issuedDateVn = issuedDateObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    if (issuedDateVn > todayVn) {
      const error = new Error('Ngày cấp CCCD/CMND không thể ở tương lai');
      error.status = 400;
      throw error;
    }
    idCardIssuedDate = issuedDateObj.toISOString().slice(0, 10);
  }

  // Kiểm tra nơi cấp CCCD/CMND
  const idCardIssuedPlace = String(payload?.id_card_issued_place || '').trim();
  if (!idCardIssuedPlace) {
    const error = new Error('Thiếu nơi cấp CCCD/CMND');
    error.status = 400;
    throw error;
  }

  const taxCode = String(payload?.tax_code || '').trim().replace(/\s+/g, '');
  if (taxCode && !TAX_CODE_REGEX.test(taxCode)) {
    const error = new Error('Mã số thuế không hợp lệ (10 số hoặc 13 số dạng xxxxxxxxxx-xxx)');
    error.status = 400;
    throw error;
  }

  const bankName = String(payload?.bank_name || '').trim();
  const bankAccountNumber = String(payload?.bank_account_number || '').trim();
  const bankAccountName = String(payload?.bank_account_name || '').trim();

  if (!bankName) {
    const error = new Error('Thiếu tên ngân hàng');
    error.status = 400;
    throw error;
  }
  if (!bankAccountNumber) {
    const error = new Error('Thiếu số tài khoản ngân hàng');
    error.status = 400;
    throw error;
  }
  if (!bankAccountName) {
    const error = new Error('Thiếu tên chủ tài khoản ngân hàng');
    error.status = 400;
    throw error;
  }

  const amountGross = Math.round(Number(payload?.amount));
  if (Number.isNaN(amountGross) || amountGross <= 0) {
    const error = new Error('Số tiền rút không hợp lệ');
    error.status = 400;
    throw error;
  }

  // Ngưỡng tối thiểu áp cho SỐ TIỀN XIN RÚT
  if (amountGross < MIN_WITHDRAWAL_AMOUNT) {
    const error = new Error('Số tiền rút tối thiểu là 1.000.000đ');
    error.status = 400;
    throw error;
  }

  // Thuế TNCN 10% cho cá nhân
  const taxAmount = Math.round(amountGross * 0.10);
  const amountNet = amountGross - taxAmount;

  // Mã hóa CCCD (ném lỗi rõ nếu thiếu AFFILIATE_PII_SECRET_KEY, KHÔNG lưu thô)
  const idCardEncrypted = encryptAffiliatePii(idNumber);

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Khóa bằng pg_advisory_xact_lock theo user_id
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext('affiliate_withdrawal'), hashtext($1::text))`,
      [String(userId)]
    );

    // 2. Tính số dư hiện tại từ affiliate_ledger
    const balanceResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS balance FROM affiliate_ledger WHERE user_id = $1`,
      [userId]
    );
    const currentBalance = Number(balanceResult.rows[0]?.balance || 0);

    // 3. Chặn nếu số tiền xin rút > số dư
    if (amountGross > currentBalance) {
      const error = new Error('Số dư hoa hồng không đủ để thực hiện yêu cầu rút');
      error.status = 400;
      throw error;
    }

    // 3b. Kiểm tra yêu cầu pending khác
    const pendingResult = await client.query(
      `SELECT id FROM affiliate_withdrawals WHERE user_id = $1 AND status = 'pending' LIMIT 1`,
      [userId]
    );
    if (pendingResult.rows.length > 0) {
      const error = new Error('Bạn đang có một yêu cầu rút tiền đang chờ xử lý. Vui lòng đợi hoàn tất trước khi tạo yêu cầu mới.');
      error.status = 400;
      error.code = 'ALREADY_HAS_PENDING_WITHDRAWAL';
      throw error;
    }

    // 4. INSERT affiliate_withdrawals
    const insertWithdrawalSql = `
      INSERT INTO affiliate_withdrawals (
        user_id, partner_type, amount_gross, tax_amount, amount_net,
        full_name, tax_code, bank_name, bank_account_number, bank_account_name,
        id_card_number_enc, id_card_issued_date, id_card_issued_place,
        company_name, company_address, invoice_reference,
        status, requested_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13,
        $14, $15, $16,
        'pending', NOW()
      ) RETURNING *;
    `;
    const insertValues = [
      userId,
      'personal',
      amountGross,
      taxAmount,
      amountNet,
      fullName,
      taxCode || null,
      bankName,
      bankAccountNumber,
      bankAccountName.toUpperCase(),
      idCardEncrypted,
      idCardIssuedDate,
      idCardIssuedPlace,
      null,
      null,
      null,
    ];
    const withdrawalResult = await client.query(insertWithdrawalSql, insertValues);
    const withdrawal = withdrawalResult.rows[0];

    // 5. INSERT affiliate_ledger (ngay lập tức, trừ lúc yêu cầu)
    await client.query(
      `INSERT INTO affiliate_ledger (
        user_id, entry_type, amount, ref_type, ref_id, note, created_at
      ) VALUES (
        $1, 'withdrawal', $2, 'withdrawal', $3, $4, NOW()
      )`,
      [
        userId,
        -amountGross,
        withdrawal.id,
        `Yêu cầu rút hoa hồng #${withdrawal.id}`
      ]
    );

    await client.query('COMMIT');

    // 6. Gửi email nội bộ sau commit (fire-and-forget)
    const userEmail = options.userEmail || '';
    sendInternalWithdrawalNotification(withdrawal, userEmail).catch((err) => {
      console.warn('[AffiliateWithdrawal] Không thể gửi email thông báo nội bộ:', err.message);
    });

    return withdrawal;
  } catch (err) {
    await client.query('ROLLBACK');

    // Bắt lỗi 23505 trên idx_affiliate_withdrawals_one_pending
    if (
      err.code === '23505' &&
      String(err.constraint || err.detail || '').includes('idx_affiliate_withdrawals_one_pending')
    ) {
      const friendlyErr = new Error('Bạn đang có một yêu cầu rút tiền đang chờ xử lý. Vui lòng đợi hoàn tất trước khi tạo yêu cầu mới.');
      friendlyErr.status = 400;
      friendlyErr.code = 'ALREADY_HAS_PENDING_WITHDRAWAL';
      throw friendlyErr;
    }

    throw err;
  } finally {
    client.release();
  }
}

/**
 * Admin duyệt "Đã chuyển khoản"
 * - status -> 'paid'
 * - KHÔNG ghi thêm ledger
 */
export async function approveWithdrawal(adminUserId, withdrawalId) {
  const result = await db.query(
    `UPDATE affiliate_withdrawals
     SET status = 'paid',
         processed_at = NOW(),
         processed_by = $1
     WHERE id = $2 AND status = 'pending'
     RETURNING *`,
    [adminUserId, withdrawalId]
  );

  if (result.rows.length === 0) {
    const error = new Error('Yêu cầu rút không tồn tại hoặc đã được xử lý');
    error.status = 400;
    throw error;
  }

  return result.rows[0];
}

/**
 * Admin "Từ chối" yêu cầu rút
 * - status -> 'rejected', note = reason
 * - Bút toán adjustment CỘNG LẠI +amount_gross vào affiliate_ledger
 */
export async function rejectWithdrawal(adminUserId, withdrawalId, reason) {
  const note = String(reason || '').trim();
  if (!note) {
    const error = new Error('Vui lòng nhập lý do từ chối');
    error.status = 400;
    throw error;
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const selectResult = await client.query(
      `SELECT * FROM affiliate_withdrawals WHERE id = $1 FOR UPDATE`,
      [withdrawalId]
    );
    const withdrawal = selectResult.rows[0];

    if (!withdrawal || withdrawal.status !== 'pending') {
      const error = new Error('Yêu cầu rút không tồn tại hoặc đã được xử lý');
      error.status = 400;
      throw error;
    }

    const updateResult = await client.query(
      `UPDATE affiliate_withdrawals
       SET status = 'rejected',
           note = $1,
           processed_at = NOW(),
           processed_by = $2
       WHERE id = $3
       RETURNING *`,
      [note, adminUserId, withdrawalId]
    );

    // Bút toán hoàn tiền: adjustment +amount_gross
    await client.query(
      `INSERT INTO affiliate_ledger (
        user_id, entry_type, amount, ref_type, ref_id, note, created_at
      ) VALUES (
        $1, 'adjustment', $2, 'withdrawal', $3, $4, NOW()
      )`,
      [
        withdrawal.user_id,
        Number(withdrawal.amount_gross),
        withdrawal.id,
        `Hoàn tiền yêu cầu rút #${withdrawal.id}: ${note}`,
      ]
    );

    await client.query('COMMIT');
    return updateResult.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Lấy dữ liệu điền sẵn cho form rút từ users.invoice_profile và lịch sử rút gần nhất.
 */
export async function getUserWithdrawalPrefill(userId) {
  const userResult = await db.query(
    `SELECT id, username, email, full_name, phone, invoice_profile FROM users WHERE id = $1`,
    [userId]
  );
  const user = userResult.rows[0];
  if (!user) {
    const error = new Error('Người dùng không tồn tại');
    error.status = 404;
    throw error;
  }

  const lastWithdrawalResult = await db.query(
    `SELECT bank_name, bank_account_number, bank_account_name, id_card_issued_date, id_card_issued_place
     FROM affiliate_withdrawals
     WHERE user_id = $1
     ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  const lastWithdrawal = lastWithdrawalResult.rows[0] || {};

  const invoiceProfile = user.invoice_profile || {};

  return {
    fullName: invoiceProfile.fullName || user.full_name || '',
    idNumber: invoiceProfile.idNumber || '',
    taxCode: invoiceProfile.taxCode || '',
    partnerType: invoiceProfile.buyerType === 'company' ? 'company' : 'personal',
    bankName: lastWithdrawal.bank_name || '',
    bankAccountNumber: lastWithdrawal.bank_account_number || '',
    bankAccountName: lastWithdrawal.bank_account_name || '',
    idCardIssuedDate: lastWithdrawal.id_card_issued_date || null,
    idCardIssuedPlace: lastWithdrawal.id_card_issued_place || '',
    invoiceProfile: user.invoice_profile || null,
  };
}

/**
 * Lấy danh sách yêu cầu rút của user.
 */
export async function getUserWithdrawals(userId) {
  const result = await db.query(
    `SELECT id, partner_type, amount_gross, tax_amount, amount_net,
            full_name, tax_code, bank_name, bank_account_number, bank_account_name,
            id_card_issued_date, id_card_issued_place,
            status, requested_at, processed_at, note
     FROM affiliate_withdrawals
     WHERE user_id = $1
     ORDER BY requested_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * Admin lấy danh sách yêu cầu rút (có filter status).
 */
export async function adminListWithdrawals({ status, limit = 50, offset = 0 } = {}) {
  const conditions = [];
  const params = [];

  if (status) {
    params.push(status);
    conditions.push(`w.status = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const query = `
    SELECT w.id, w.user_id, w.partner_type, w.amount_gross, w.tax_amount, w.amount_net,
           w.full_name, w.tax_code, w.bank_name, w.bank_account_number, w.bank_account_name,
           w.id_card_number_enc, w.id_card_issued_date, w.id_card_issued_place,
           w.company_name, w.company_address, w.invoice_reference,
           w.status, w.requested_at, w.processed_at, w.processed_by, w.note,
           u.email AS user_email, u.phone AS user_phone
    FROM affiliate_withdrawals w
    LEFT JOIN users u ON u.id = w.user_id
    ${whereClause}
    ORDER BY w.requested_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const result = await db.query(query, params);
  return result.rows.map((row) => {
    let idCardNumber = '';
    if (row.id_card_number_enc) {
      try {
        idCardNumber = decryptAffiliatePii(row.id_card_number_enc);
      } catch (err) {
        console.error(`[AffiliateWithdrawal] Không thể giải mã CCCD withdrawal #${row.id}:`, err.message);
        idCardNumber = '***';
      }
    }
    return {
      ...row,
      id_card_number: idCardNumber,
    };
  });
}

/**
 * Lấy month_key của thời điểm hiện tại theo múi giờ Việt Nam (Asia/Ho_Chi_Minh).
 * @param {Date} [referenceDate=new Date()]
 * @returns {string} định dạng 'YYYY-MM'
 */
export function resolveCurrentMonthKey(referenceDate = new Date()) {
  const vnFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
  });
  const parts = vnFormatter.formatToParts(referenceDate);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  return `${year}-${month}`;
}

/**
 * Super admin ghi bút toán điều chỉnh ví hoa hồng.
 *
 * @param {object} params
 * @param {number|string} params.adminUserId - ID của super admin thực hiện
 * @param {number|string} params.targetUserId - ID của đối tác cần điều chỉnh
 * @param {number|string} params.amount - Số tiền điều chỉnh (ÂM để thu hồi, DƯƠNG để bù)
 * @param {string} params.note - Lý do điều chỉnh (BẮT BUỘC)
 * @param {string} [params.ipAddress]
 * @param {string} [params.userAgent]
 */
export async function createLedgerAdjustment({
  adminUserId,
  targetUserId,
  amount,
  note,
  ipAddress,
  userAgent,
}) {
  const parsedUserId = Number(targetUserId);
  if (!parsedUserId || Number.isNaN(parsedUserId)) {
    const error = new Error('ID người dùng không hợp lệ');
    error.status = 400;
    throw error;
  }

  const cleanNote = String(note || '').trim();
  if (!cleanNote) {
    const error = new Error('Vui lòng nhập lý do điều chỉnh');
    error.status = 400;
    throw error;
  }

  const parsedAmount = Math.round(Number(amount));
  if (Number.isNaN(parsedAmount) || parsedAmount === 0) {
    const error = new Error('Số tiền điều chỉnh không hợp lệ (phải khác 0)');
    error.status = 400;
    throw error;
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Khóa advisory xact lock theo targetUserId
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext('affiliate_withdrawal'), hashtext($1::text))`,
      [String(parsedUserId)]
    );

    // 2. Tính số dư hiện tại từ affiliate_ledger
    const balanceResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS balance FROM affiliate_ledger WHERE user_id = $1`,
      [parsedUserId]
    );
    const currentBalance = Math.round(Number(balanceResult.rows[0]?.balance || 0));

    // 3. CHẶN nếu bút toán làm số dư âm -> 400 kèm số dư hiện tại
    if (currentBalance + parsedAmount < 0) {
      const error = new Error(
        `Số dư hiện tại (${currentBalance.toLocaleString('vi-VN')}đ) không đủ để trừ ${Math.abs(parsedAmount).toLocaleString('vi-VN')}đ`
      );
      error.status = 400;
      error.code = 'INSUFFICIENT_AFFILIATE_BALANCE';
      error.currentBalance = currentBalance;
      throw error;
    }

    // 4. Ghi affiliate_ledger entry_type='adjustment', ref_type='admin', ref_id=<admin id>
    const insertResult = await client.query(
      `INSERT INTO affiliate_ledger (
        user_id, entry_type, amount, ref_type, ref_id, note, created_at
      ) VALUES (
        $1, 'adjustment', $2, 'admin', $3, $4, NOW()
      ) RETURNING id, user_id, entry_type, amount, ref_type, ref_id, note, created_at`,
      [parsedUserId, parsedAmount, adminUserId, cleanNote]
    );

    const insertedLedger = insertResult.rows[0];

    await client.query('COMMIT');

    // 5. Ghi audit log theo khuôn repo
    await auditService.log({
      userId: adminUserId,
      category: 'system',
      action: 'AFFILIATE_LEDGER_ADJUSTMENT',
      entityType: 'affiliate_ledger',
      entityId: insertedLedger.id,
      details: {
        targetUserId: parsedUserId,
        amount: parsedAmount,
        note: cleanNote,
        balanceBefore: currentBalance,
        balanceAfter: currentBalance + parsedAmount,
      },
      ipAddress,
      userAgent,
    });

    return {
      ledger: insertedLedger,
      balanceBefore: currentBalance,
      balanceAfter: currentBalance + parsedAmount,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Lấy toàn bộ thông tin tổng quan trang đối tác Affiliate cho một user.
 *
 * @param {number|string} userId
 * @returns {Promise<object>}
 */
export async function getAffiliateOverview(userId) {
  const parsedUserId = Number(userId);
  if (!parsedUserId || Number.isNaN(parsedUserId)) {
    const error = new Error('ID người dùng không hợp lệ');
    error.status = 400;
    throw error;
  }

  // 1. Thông tin user (mã giới thiệu, họ tên, email)
  const userResult = await db.query(
    `SELECT id, email, full_name, referral_code FROM users WHERE id = $1`,
    [parsedUserId]
  );
  const user = userResult.rows[0];
  if (!user) {
    const error = new Error('Người dùng không tồn tại');
    error.status = 404;
    throw error;
  }

  const referralCode = user.referral_code || '';
  const referralLink = referralCode ? `https://founderai.biz/register?ref=${referralCode}` : '';

  // 2. Số dư ví hiện tại
  const balanceResult = await db.query(
    `SELECT COALESCE(SUM(amount), 0)::numeric AS balance FROM affiliate_ledger WHERE user_id = $1`,
    [parsedUserId]
  );
  const currentBalance = Math.round(Number(balanceResult.rows[0]?.balance || 0));

  // 3. Doanh thu tháng hiện tại & resolveTier
  const currentMonthKey = resolveCurrentMonthKey();
  const currentGrossResult = await db.query(
    `SELECT COALESCE(SUM(e.amount), 0)::numeric AS current_gross
     FROM affiliate_revenue_events e
     JOIN users b ON b.id = e.buyer_user_id
       AND b.phone IS NOT NULL
       AND TRIM(b.phone) <> ''
     WHERE e.referrer_user_id = $1 AND e.month_key = $2`,
    [parsedUserId, currentMonthKey]
  );
  const currentMonthGross = Math.round(Number(currentGrossResult.rows[0]?.current_gross || 0));
  const currentTier = resolveTier(currentMonthGross);

  let nextTier = null;
  let amountToNextTier = 0;
  if (currentTier.level < 5) {
    nextTier = AFFILIATE_TIERS.find((t) => t.level === currentTier.level + 1) || null;
    if (nextTier) {
      amountToNextTier = Math.max(0, nextTier.minRevenue - currentMonthGross);
    }
  }
  const estimatedCommission = Math.round((currentMonthGross * currentTier.ratePercent) / 100);

  // 4. Mục ĐANG CHỜ ĐỦ ĐIỀU KIỆN (người mua chưa có SĐT)
  const pendingEventsResult = await db.query(
    `SELECT e.id, e.order_id, e.amount, e.month_key, e.created_at,
            b.id AS buyer_id, b.email AS buyer_email, b.full_name AS buyer_name
     FROM affiliate_revenue_events e
     JOIN users b ON b.id = e.buyer_user_id
     WHERE e.referrer_user_id = $1
       AND (b.phone IS NULL OR TRIM(b.phone) = '')
     ORDER BY e.created_at DESC`,
    [parsedUserId]
  );
  const pendingEvents = pendingEventsResult.rows.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    amount: Math.round(Number(row.amount || 0)),
    monthKey: row.month_key,
    createdAt: row.created_at,
    buyerEmail: row.buyer_email,
    buyerName: row.buyer_name || '',
  }));
  const pendingRevenue = pendingEvents.reduce((acc, ev) => acc + ev.amount, 0);
  const pendingBuyersSet = new Set(pendingEventsResult.rows.map((r) => r.buyer_id));
  const pendingBuyersCount = pendingBuyersSet.size;

  // 5. Lịch sử theo tháng (affiliate_periods)
  const periodsResult = await db.query(
    `SELECT id, month_key, gross_revenue, tier_level, rate_percent, commission_amount, closed_at
     FROM affiliate_periods
     WHERE referrer_user_id = $1
     ORDER BY month_key DESC`,
    [parsedUserId]
  );
  const monthlyHistory = periodsResult.rows.map((row) => ({
    id: row.id,
    monthKey: row.month_key,
    grossRevenue: Math.round(Number(row.gross_revenue || 0)),
    tierLevel: row.tier_level,
    ratePercent: row.rate_percent,
    commissionAmount: Math.round(Number(row.commission_amount || 0)),
    closedAt: row.closed_at,
  }));

  // 6. Lịch sử rút tiền (affiliate_withdrawals)
  const withdrawals = await getUserWithdrawals(parsedUserId);

  // 7. Lịch sử biến động ví (affiliate_ledger)
  const ledgerResult = await db.query(
    `SELECT id, entry_type, amount, ref_type, ref_id, note, created_at
     FROM affiliate_ledger
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 50`,
    [parsedUserId]
  );
  const ledgerHistory = ledgerResult.rows.map((row) => ({
    id: row.id,
    entryType: row.entry_type,
    amount: Math.round(Number(row.amount || 0)),
    refType: row.ref_type,
    refId: row.ref_id,
    note: row.note,
    createdAt: row.created_at,
  }));

  // Kiểm tra có yêu cầu rút nào đang pending không
  const hasPendingWithdrawal = withdrawals.some((w) => w.status === 'pending');

  return {
    referralCode,
    referralLink,
    currentBalance,
    currentMonthKey,
    currentMonthGross,
    currentTier,
    nextTier,
    amountToNextTier,
    estimatedCommission,
    hasPendingWithdrawal,
    pendingApproval: {
      pendingRevenue,
      pendingBuyersCount,
      pendingEventsCount: pendingEvents.length,
      events: pendingEvents,
    },
    monthlyHistory,
    withdrawalHistory: withdrawals,
    ledgerHistory,
  };
}

/**
 * Admin lấy danh sách đóng sổ theo tháng (affiliate_periods).
 */
export async function getAdminAffiliatePeriods({ monthKey, limit = 50, offset = 0 } = {}) {
  const conditions = [];
  const params = [];

  if (monthKey) {
    params.push(monthKey);
    conditions.push(`p.month_key = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const query = `
    SELECT p.id, p.referrer_user_id, p.month_key, p.gross_revenue, p.tier_level, p.rate_percent, p.commission_amount, p.closed_at,
           u.email AS user_email, u.full_name AS user_full_name, u.phone AS user_phone, u.referral_code
    FROM affiliate_periods p
    LEFT JOIN users u ON u.id = p.referrer_user_id
    ${whereClause}
    ORDER BY p.gross_revenue DESC, p.id DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const result = await db.query(query, params);
  return result.rows.map((r) => ({
    id: r.id,
    referrerUserId: r.referrer_user_id,
    monthKey: r.month_key,
    grossRevenue: Math.round(Number(r.gross_revenue || 0)),
    tierLevel: r.tier_level,
    ratePercent: r.rate_percent,
    commissionAmount: Math.round(Number(r.commission_amount || 0)),
    closedAt: r.closed_at,
    userEmail: r.user_email,
    userFullName: r.user_full_name,
    userPhone: r.user_phone,
    referralCode: r.referral_code,
  }));
}

/**
 * Admin lấy danh sách các month_key có sẵn trong affiliate_periods.
 */
export async function getAdminAvailableMonths() {
  const result = await db.query(
    `SELECT DISTINCT month_key FROM affiliate_periods ORDER BY month_key DESC`
  );
  return result.rows.map((r) => r.month_key);
}

