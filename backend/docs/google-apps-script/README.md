# Auto-Save Landing Leads to Google Sheets

Tính năng cho phép admin **tự động ghi lead từ form landing page vào Google Sheets** mỗi khi có người đăng ký mới. Thay vì dùng script bên thứ ba (Gemini API key dễ bị lộ), UKNOW sử dụng **Google Apps Script (GAS) Web App** làm webhook trung gian — an toàn, ổn định, không cần OAuth phức tạp.

## Kiến trúc

```
User submit form landing
        │
        ▼
UKNOW Backend (POST /api/public/leads)
        │  ─ lưu DB leads
        │  ─ ghi landing_page_events
        │  ─ fire-and-forget POST sang Google Apps Script
        ▼
Google Apps Script Web App (URL exec)
        │  ─ validate secret
        │  ─ appendRow() vào tab
        ▼
Google Sheets (tab Leads)
```

## Hướng dẫn cho Admin (1 lần)

### Bước 1: Tạo Google Sheet
1. Mở https://sheets.google.com → tạo file mới, đặt tên (ví dụ: `UKNOW Leads 2026`).
2. **Không cần share quyền gì cả** — quyền ghi sẽ do GAS xử lý bằng tài khoản Google của bạn.

### Bước 2: Tạo Google Apps Script
1. Trong Sheet vừa tạo, vào **Extensions → Apps Script**.
2. Xóa hết code mặc định, **paste toàn bộ nội dung file** `uknow-leads-webhook.gs` (trong cùng thư mục này).
3. Tùy chỉnh:
   - `SHEET_NAME = 'Leads'` — đổi nếu muốn tab khác.
   - `SECRET = ''` — để trống = tắt check. Khuyến nghị đặt secret ngẫu nhiên (vd: `uknow-leads-9f8e7d6c`).
4. Save (Ctrl+S), đặt tên project (vd: `UKNOW Leads Webhook`).

### Bước 3: Deploy Web App
1. **Deploy → New deployment**.
2. Click icon ⚙️ → chọn **Web app**.
3. Cấu hình:
   - **Description**: `UKNOW leads sync`
   - **Execute as**: **Me** (quan trọng — để GAS ghi Sheet với quyền của bạn)
   - **Who has access**: **Anyone** (UKNOW backend sẽ gọi đến)
4. Nhấn **Deploy** → copy URL dạng:
   ```
   https://script.google.com/macros/s/AKfycbx.../exec
   ```

### Bước 4: Cấu hình trong UKNOW
Gọi API admin (đã đăng nhập với quyền admin) để lưu cấu hình cho landing page:

```bash
curl -X PUT "https://api.uknow.vn/api/admin/landing-pages/123/sheets-sync" \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "webhookUrl": "https://script.google.com/macros/s/AKfycbx.../exec",
    "sheetName": "Leads",
    "secret": "uknow-leads-9f8e7d6c"
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "webhookUrl": "https://script.google.com/macros/s/AKfycbx.../exec",
    "sheetName": "Leads",
    "hasSecret": true
  },
  "message": "Đã lưu cấu hình Google Sheets"
}
```

### Bước 5: Test
1. Mở landing page public (vd: `https://uknow.vn/lp/khuyen-mai-he`).
2. Submit form đăng ký với email thật của bạn.
3. Vào Google Sheet → tab `Leads` → dòng mới xuất hiện với đầy đủ thông tin.

## Cấu trúc dữ liệu trong Sheet

| Cột | Mô tả |
|---|---|
| `timestamp` | Thời điểm UKNOW nhận lead (ISO 8601) |
| `slug` | Slug landing page |
| `landingTitle` | Tiêu đề landing page |
| `lastName`, `firstName`, `fullName` | Họ tên |
| `email`, `phone` | Liên hệ |
| `occupation`, `interestArea` | Nghề + lĩnh vực quan tâm |
| `marketingConsent` | YES / NO |
| `utmSource/Medium/Campaign/Content/Term` | UTM tracking |
| `leadId` | ID lead trong DB UKNOW |
| `custom_<fieldKey>` | Custom fields (cột tự sinh) |

Custom field cột được **tự động thêm** khi phát hiện field mới. Không cần config trước.

## API Reference

### GET `/api/admin/landing-pages/:id/sheets-sync`
Trả về cấu hình hiện tại (che giấu secret — chỉ trả `hasSecret: true/false`).

```bash
curl "https://api.uknow.vn/api/admin/landing-pages/123/sheets-sync" \
  -H "Authorization: Bearer <ADMIN_JWT>"
```

Response:
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "webhookUrl": "https://script.google.com/macros/s/AKfycbx.../exec",
    "sheetName": "Leads",
    "hasSecret": true,
    "lastSyncAt": "2026-09-04T05:30:00.000Z",
    "lastError": null
  }
}
```

### PUT `/api/admin/landing-pages/:id/sheets-sync`
Body:
- `enabled` (bool, required)
- `webhookUrl` (string, required nếu enabled=true) — phải HTTPS, host phải thuộc `script.google.com` hoặc `*.googleusercontent.com`
- `sheetName` (string, optional) — tên tab trong Sheet (mặc định "Leads")
- `secret` (string, optional) — đặt lại secret. Gửi `null` hoặc `""` để xóa secret đã lưu.

Để tắt sync: gửi `{ "enabled": false }`. Cấu hình sẽ bị xóa khỏi DB.

## Lưu ý bảo mật

1. **Đặt SECRET** trong file `.gs` và set cùng giá trị trong UKNOW. Nếu không, ai cũng biết URL GAS là có thể gọi được.
2. **URL webhook an toàn** — UKNOW chỉ chấp nhận host `script.google.com` hoặc `*.googleusercontent.com`. Không gửi được tới domain lạ.
3. **Không lộ API key** — UKNOW backend chỉ forward dữ liệu, không cần Google API key phía client.
4. **Best-effort delivery** — Nếu GAS tạm thời down, lead vẫn được lưu vào DB UKNOW. Sync chỉ là bước bổ sung.
5. **Audit log** — Mỗi lần bật/tắt/sửa config được ghi vào audit log workspace.

## Troubleshooting

| Vấn đề | Nguyên nhân | Cách xử lý |
|---|---|---|
| Test GAS bằng browser trả `Cannot read property...` | CORS — đúng rồi, browser không được gọi POST trực tiếp | Test qua UKNOW form thật |
| Lead không xuất hiện trong Sheet | Sai URL hoặc GAS chưa deploy đúng | Vào Apps Script → Executions xem log |
| Lỗi `Invalid secret` | UKNOW gửi secret khác với SECRET trong .gs | Cập nhật lại cả 2 phía cho khớp |
| Lỗi `Không tìm thấy tab` | Sheet đã đổi tên tab | Set lại `sheetName` trong config hoặc đổi tên tab về mặc định |
| URL bị reject `URL phải thuộc script.google.com` | Nhầm URL preview thay vì URL exec | Deploy xong copy URL exec, không phải `/dev` |
