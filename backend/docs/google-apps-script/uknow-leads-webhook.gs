/**
 * GOOGLE APPS SCRIPT TEMPLATE — Landing Lead Auto-Save to Sheet
 *
 * Hướng dẫn cho admin (1 lần):
 *
 * 1. Tạo Google Sheet mới (đặt tên ví dụ: "Leads UKNOW").
 * 2. Trong Sheet, Extensions → Apps Script.
 * 3. Xóa hết code mặc định, paste TOÀN BỘ nội dung file này vào.
 * 4. Sửa SHEET_NAME bên dưới nếu muốn đổi tên tab (mặc định "Leads").
 * 5. Save (Ctrl+S), đặt tên project (vd: "UKNOW Leads Webhook").
 * 6. Deploy → New deployment:
 *      - Type: Web app
 *      - Execute as: Me
 *      - Who has access: Anyone
 *    Nhấn Deploy, copy URL dạng:
 *      https://script.google.com/macros/s/AKfycb.../exec
 * 7. Paste URL đó vào cấu hình landing page (customConfig.googleSheetsWebhookUrl)
 *    hoặc dùng endpoint admin UKNOW để cập nhật.
 * 8. Submit form thử → dữ liệu sẽ tự động được append vào tab đã chọn.
 *
 * Bảo mật:
 * - Nên thêm secret token (tùy chọn) bằng cách đặt biến SECRET bên dưới,
 *   và set cùng giá trị trong customConfig.googleSheetsSync.secret
 *   để chỉ UKNOW của bạn mới gọi được webhook.
 */

// ====== CẤU HÌNH ======
const SHEET_NAME = 'Leads';      // Tên tab trong Google Sheet
const SECRET = '';               // Đặt secret nếu muốn (vd: 'uknow-2026-leads'). Để trống = tắt check
// =======================

/**
 * Xử lý GET (dùng để test GAS đã deploy đúng chưa).
 */
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, message: 'UKNOW leads webhook ready', sheetName: SHEET_NAME }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Xử lý POST — UKNOW sẽ gọi endpoint này khi có lead mới.
 *
 * Payload mẫu (gửi từ UKNOW backend):
 * {
 *   timestamp: "2026-09-04T05:30:00.000Z",
 *   slug: "khuyen-mai-he",
 *   landingTitle: "Khuyến mãi hè 2026",
 *   lastName: "Nguyễn",
 *   firstName: "Văn A",
 *   fullName: "Nguyễn Văn A",
 *   email: "a@example.com",
 *   phone: "0901234567",
 *   occupation: "Marketing",
 *   interestArea: "AI",
 *   marketingConsent: true,
 *   utmSource: "facebook",
 *   utmCampaign: "summer-2026",
 *   customFields: { company: "ABC" },
 *   leadId: 123,
 *   sheetName: "Leads",   // optional - override tab name
 *   secret: "uknow-..."   // optional - nếu đặt SECRET thì phải khớp
 * }
 */
function doPost(e) {
  try {
    const body = parseJsonBody(e);
    if (!body) {
      return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
    }

    // Kiểm tra secret nếu có cấu hình
    if (SECRET && String(body.secret || '') !== SECRET) {
      return jsonResponse({ ok: false, error: 'Invalid secret' }, 403);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const tabName = String(body.sheetName || SHEET_NAME || 'Leads').trim() || 'Leads';
    let sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      // Tạo tab mới nếu chưa có
      sheet = ss.insertSheet(tabName);
      sheet.appendRow(getHeaderRow());
    } else {
      // Đảm bảo header đã có
      ensureHeader(sheet);
    }

    // Lấy custom fields keys (để cột động)
    const customFields = body.customFields && typeof body.customFields === 'object'
      ? body.customFields
      : {};
    const customKeys = Object.keys(customFields);
    const existingHeader = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] || [];
    const headerStrs = existingHeader.map((h) => String(h || '').trim());
    const newCustomKeys = customKeys.filter((k) => !headerStrs.includes(`custom_${k}`));
    if (newCustomKeys.length) {
      const newHeader = headerStrs.concat(newCustomKeys.map((k) => `custom_${k}`));
      sheet.getRange(1, 1, 1, newHeader.length).setValues([newHeader]);
    }

    // Build row theo header hiện tại
    const finalHeader = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const row = finalHeader.map((header) => {
      const key = String(header || '').trim();
      if (key.startsWith('custom_')) {
        const fieldKey = key.slice('custom_'.length);
        return customFields[fieldKey] != null ? String(customFields[fieldKey]) : '';
      }
      switch (key) {
        case 'timestamp':      return body.timestamp || new Date().toISOString();
        case 'slug':           return body.slug || '';
        case 'landingTitle':   return body.landingTitle || '';
        case 'lastName':       return body.lastName || '';
        case 'firstName':      return body.firstName || '';
        case 'fullName':       return body.fullName || '';
        case 'email':          return body.email || '';
        case 'phone':          return body.phone || '';
        case 'occupation':     return body.occupation || '';
        case 'interestArea':   return body.interestArea || '';
        case 'marketingConsent': return body.marketingConsent === true ? 'YES' : 'NO';
        case 'utmSource':      return body.utmSource || '';
        case 'utmMedium':      return body.utmMedium || '';
        case 'utmCampaign':    return body.utmCampaign || '';
        case 'utmContent':     return body.utmContent || '';
        case 'utmTerm':        return body.utmTerm || '';
        case 'leadId':         return body.leadId != null ? String(body.leadId) : '';
        default:               return '';
      }
    });

    sheet.appendRow(row);
    return jsonResponse({
      ok: true,
      message: 'Lead appended',
      row: sheet.getLastRow(),
      sheet: tabName,
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message || err) }, 500);
  }
}

function getHeaderRow() {
  return [
    'timestamp',
    'slug',
    'landingTitle',
    'lastName',
    'firstName',
    'fullName',
    'email',
    'phone',
    'occupation',
    'interestArea',
    'marketingConsent',
    'utmSource',
    'utmMedium',
    'utmCampaign',
    'utmContent',
    'utmTerm',
    'leadId',
  ];
}

function ensureHeader(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(getHeaderRow());
    return;
  }
  const firstRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (!firstRow || firstRow.every((c) => !String(c || '').trim())) {
    sheet.getRange(1, 1, 1, getHeaderRow().length).setValues([getHeaderRow()]);
  }
}

function parseJsonBody(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  try {
    return JSON.parse(e.postData.contents);
  } catch (_) {
    return null;
  }
}

function jsonResponse(obj, status) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
