#!/usr/bin/env node
/**
 * Script smoke test gọi trực tiếp API Mắt Bão (demo/staging/prod).
 * Độc lập với app runtime, không import index.js / express / scheduler / queue.
 *
 * Chế độ:
 *   node scripts/matbaoSmoke.js --login
 *   node scripts/matbaoSmoke.js --templates
 *   node scripts/matbaoSmoke.js --create --buyer=company --net=499000
 *   node scripts/matbaoSmoke.js --create --buyer=personal --net=299000
 *   node scripts/matbaoSmoke.js --create --force-ma-tra-cuu=UKN...
 */
import 'dotenv/config';

// Tự động bật 2 cờ trong RAM của tiến trình script để kiểm thử hàm production
// mà tuyệt đối không cần thay đổi file .env của hệ thống.
process.env.INVOICE_VAT_ENABLED = 'true';
process.env.MATBAO_EINVOICE_WORKER_ENABLED = 'true';

import {
  matbaoLogin,
  matbaoListTemplates,
  matbaoCreateInvoices,
  parseCreateInvoiceItemResult,
  getMatbaoSeriesConfig,
} from '../src/utils/matbaoHddtClient.util.js';
import { buildCreateInvoicePayload } from '../src/services/payment/matbaoInvoice.service.js';
import { resolveOrderAmountWithInvoice } from '../src/utils/invoiceVat.util.js';

function parseArg(flag, defaultValue = null) {
  const arg = process.argv.find((a) => a === flag || a.startsWith(`${flag}=`));
  if (!arg) return defaultValue;
  if (arg === flag) return true;
  return arg.split('=')[1] ?? defaultValue;
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

async function runLogin() {
  console.log('[MatBaoSmoke] 1. Kiểm tra Login...');
  const token = await matbaoLogin({ force: true });
  const payload = decodeJwtPayload(token);

  console.log(`[MatBaoSmoke] ✅ Đăng nhập thành công! Token length: ${token.length} chars`);
  if (payload) {
    const exp = payload.exp ? new Date(payload.exp * 1000).toISOString() : 'N/A';
    const iat = payload.iat ? new Date(payload.iat * 1000).toISOString() : 'N/A';
    const ttlSeconds = payload.exp && payload.iat ? payload.exp - payload.iat : 'N/A';
    console.log(`[MatBaoSmoke] Token info: iat=${iat}, exp=${exp}, ttl=${ttlSeconds}s (${ttlSeconds === 86400 ? '24h khớp chuẩn' : ttlSeconds + 's'})`);
  } else {
    console.log('[MatBaoSmoke] Không giải mã được payload JWT.');
  }
}

async function runTemplates() {
  console.log('[MatBaoSmoke] 2. Kiểm tra Mẫu số / Ký hiệu (Templates)...');
  const currentYear = new Date().getFullYear();
  const res = await matbaoListTemplates(currentYear);

  if (!res.ok) {
    console.error(`[MatBaoSmoke] ❌ Lỗi lấy templates (HTTP ${res.status}):`, res.body);
    return;
  }

  const list = res.body?.data || res.body?.Data || (Array.isArray(res.body) ? res.body : []);
  const seriesConfig = getMatbaoSeriesConfig();
  console.log(`[MatBaoSmoke] Cấu hình app hiện tại: KHMSHDon=${seriesConfig.khmshdon}, KHHDon=${seriesConfig.khhdon}`);
  console.log(`[MatBaoSmoke] Danh sách dải hoá đơn năm ${currentYear} (tìm thấy ${list.length}):`);
  console.log('--------------------------------------------------------------------------------');
  console.log('| Khớp? | Mẫu số (khmshDon) | Ký hiệu (khhDon) | Số lượng (sLuong) | Còn lại (cLai) | Tên hoá đơn |');
  console.log('--------------------------------------------------------------------------------');

  let matched = false;
  for (const item of list) {
    const khmshDon = item.khmshDon ?? item.KHMSHDon ?? item.khmshdon ?? '';
    const khhDon = item.khhDon ?? item.KHHDon ?? item.khhdon ?? '';
    const sLuong = item.sLuong ?? item.SLuong ?? item.sl ?? 'N/A';
    const cLai = item.cLai ?? item.CLai ?? item.cl ?? 'N/A';
    const thDon = item.thDon ?? item.THDon ?? item.tenHDon ?? '';

    const isMatch = String(khmshDon).trim() === String(seriesConfig.khmshdon).trim()
      && String(khhDon).trim() === String(seriesConfig.khhdon).trim();

    if (isMatch) matched = true;

    const matchMark = isMatch ? ' ⭐ MATCH' : '        ';
    console.log(`|${matchMark} | ${String(khmshDon).padEnd(17)} | ${String(khhDon).padEnd(16)} | ${String(sLuong).padEnd(17)} | ${String(cLai).padEnd(14)} | ${thDon} |`);
  }
  console.log('--------------------------------------------------------------------------------');

  if (matched) {
    console.log('✅ Dải ký hiệu trong cấu hình ENV KHỚP với tài khoản Mắt Bão!');
  } else {
    console.warn('⚠️ CẢNH BÁO: Không tìm thấy dải ký hiệu khớp với cấu hình ENV hiện tại trong danh sách!');
  }
}

async function runCreate() {
  const buyerType = parseArg('--buyer', 'company');
  const rawNet = parseArg('--net', buyerType === 'company' ? '499000' : '299000');
  const net = Math.round(Number(rawNet) || 499000);
  const forceMaTraCuu = parseArg('--force-ma-tra-cuu', null);

  console.log(`[MatBaoSmoke] 3. Tạo hoá đơn thử nghiệm (--buyer=${buyerType}, --net=${net})...`);

  // Dựng raw intake info
  const rawInfo = buyerType === 'company'
    ? {
      buyerType: 'company',
      taxCode: '0312345678',
      companyName: 'Công Ty Cổ Phần Thử Nghiệm UKNOW',
      companyAddress: 'Tầng 5, Toà nhà Innovation, TP.HCM',
      email: 'smoke-test@example.com',
      phone: '0901234567',
    }
    : {
      buyerType: 'personal',
      fullName: 'Nguyễn Văn Thử Nghiệm',
      idNumber: '001099012345',
      address: '123 Đường Thử Nghiệm, Hà Nội',
      email: 'smoke-test-personal@example.com',
      phone: '0912345678',
    };

  // Tính tiền authoritative thông qua hàm production
  const { amount, invoiceInfo } = resolveOrderAmountWithInvoice(rawInfo, net, {
    accountEmail: rawInfo.email,
  });

  const orderCode = Date.now();
  const mockOrder = {
    id: 999999,
    order_code: orderCode,
    user_email: rawInfo.email,
    plan_code: 'pro',
    billing_period: 'monthly',
    amount,
    invoice_info: invoiceInfo,
  };

  const { maTraCuu, payload } = buildCreateInvoicePayload(mockOrder, invoiceInfo);

  if (forceMaTraCuu) {
    payload[0].MaTraCuu = forceMaTraCuu;
    console.log(`[MatBaoSmoke] ⚠️ Ghi đè MaTraCuu thành: ${forceMaTraCuu}`);
  }

  const inv = payload[0];
  console.log('[MatBaoSmoke] Payload chuẩn bị gửi lên Mắt Bão:');
  console.log(`  - MaTraCuu: ${inv.MaTraCuu}`);
  console.log(`  - MTChieu:  ${inv.MTChieu}`);
  console.log(`  - KHHDon / KHMSHDon: ${inv.KHHDon} / ${inv.KHMSHDon}`);
  console.log(`  - Buyer:    NMua_Ten="${inv.NMua_Ten}" NMua_HVTNMHang="${inv.NMua_HVTNMHang || ''}" (MST: "${inv.NMua_MST}" | CCCD: "${inv.NMua_CCCDan || ''}")`);
  console.log(`  - TgThTien: ${inv.TgThTien} đ`);
  console.log(`  - TTCKTMai: ${inv.TTCKTMai} đ, TGTKhac: ${inv.TGTKhac} đ`);
  console.log(`  - TgTThue:  ${inv.TgTThue} đ`);
  console.log(`  - TgTTTBSo: ${inv.TgTTTBSo} đ`);
  console.log(`  - TgTTTBChu: "${inv.TgTTTBChu}"`);

  console.log('[MatBaoSmoke] Đang gửi POST /api/invoice/create-invoice...');
  const res = await matbaoCreateInvoices(payload);

  console.log(`[MatBaoSmoke] HTTP status: ${res.status}`);
  console.log('[MatBaoSmoke] Raw response body:', JSON.stringify(res.body, null, 2));

  const parsed = parseCreateInvoiceItemResult(res.body);
  console.log('[MatBaoSmoke] Kết quả parse thông qua parseCreateInvoiceItemResult():');
  console.log(`  - errorCode:    ${parsed.errorCode}`);
  console.log(`  - errorMessage: ${parsed.errorMessage || 'none'}`);
  console.log(`  - maSoHdon:     ${parsed.maSoHdon || 'none'}`);
  console.log(`  - soHdon:       ${parsed.soHdon || 'none'}`);
  console.log(`  - pdfUrl:       ${parsed.pdfUrl || 'none'}`);

  if (parsed.errorCode === '200') {
    console.log('🎉 XUẤT HOÁ ĐƠN THÀNH CÔNG (200)!');
  } else if (parsed.errorCode === '304') {
    console.log('ℹ️ Kết quả: 304 — Trùng mã tra cứu (MaTraCuu)!');
  } else {
    console.error(`❌ XUẤT HOÁ ĐƠN THẤT BẠI: [${parsed.errorCode}] ${parsed.errorMessage}`);
  }
}

async function main() {
  const isLogin = process.argv.includes('--login');
  const isTemplates = process.argv.includes('--templates');
  const isCreate = process.argv.includes('--create');

  if (!isLogin && !isTemplates && !isCreate) {
    console.log('Sử dụng:');
    console.log('  node scripts/matbaoSmoke.js --login');
    console.log('  node scripts/matbaoSmoke.js --templates');
    console.log('  node scripts/matbaoSmoke.js --create [--buyer=company|personal] [--net=499000] [--force-ma-tra-cuu=...]');
    return;
  }

  const baseUrl = String(process.env.MATBAO_HDDT_BASE_URL || '').toLowerCase();
  const isProduction = baseUrl && !baseUrl.includes('demo');
  if (isProduction && isCreate && !process.argv.includes('--i-know-this-is-production')) {
    console.error(`[MatBaoSmoke] ⛔ DỪNG LẠI: MATBAO_HDDT_BASE_URL không chứa "demo" (${process.env.MATBAO_HDDT_BASE_URL}).`);
    console.error('[MatBaoSmoke] Hoá đơn thật trên production không thể thu hồi. Nếu thực sự muốn chạy, thêm cờ --i-know-this-is-production');
    process.exit(1);
  }

  if (isLogin) {
    await runLogin();
  }
  if (isTemplates) {
    await runTemplates();
  }
  if (isCreate) {
    await runCreate();
  }
}

main().catch((err) => {
  console.error('[MatBaoSmoke] LỖI:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
