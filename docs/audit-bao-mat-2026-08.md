# Audit bảo mật 2026 — kết quả và những gì còn theo dõi

Tổng kết audit 7 đợt trước thương mại hoá. **Toàn bộ P0 (7 lỗi) và P1 (15 lỗi) đã ship.**
Phần P2 đã đóng hết tính tới 18/08/2026 — chi tiết bên dưới.

Tài liệu này thay cho `_internal/CON_NO_BAO_MAT.md` (đã xoá) và
`SECURITY_AUDIT_FIX_PLAN.md` (36KB, xoá trước đó).

---

## P2 — đã đóng hết

| Mục | Kết cục |
|---|---|
| P2-1 Refresh token không lọc trạng thái tài khoản | Đã sửa: thêm `AND u.status = 'active'`. Trước đó **khoá tài khoản không cắt được phiên** — token vẫn xoay đều suốt 7 ngày |
| P2-2 Không phát hiện dùng lại refresh token | Đã sửa: cửa sổ ân hạn 10 giây. Chỉ tính là dùng lại khi token bị thu hồi **do xoay**, còn hạn, và ngoài cửa sổ. `logout`/`password_changed` không kích hoạt quét — nếu không, đổi mật khẩu xong sẽ bị đá ra lần nữa |
| P2-3 `googleLogin` nhánh ID token không kiểm `email_verified` | Đã sửa, đồng nhất với nhánh access token |
| P2-4 `X-Owner-Context` thiếu trong `Allow-Headers` | Đã gom thành hằng `ALLOWED_HEADERS` — chuỗi này từng bị chép cứng ra 6 chỗ |
| P2-9 `refresh_tokens` không có tác vụ dọn | Đã có cron (`cronJobRegistry.js`): xoá bản ghi hết hạn quá 30 ngày, theo lô 5000 dòng |
| P2-6 `assignPlanWithExpiry` là mã chết | Đã xoá cùng bộ test của nó (`ce9d9a5`). Đường thật nằm ở `payment.repository.js` và **tốt hơn bản cũ**: xử lý cả gói năm lẫn `duration_days` theo từng gói, thay vì cứng `INTERVAL '1 month'` |
| P2-5 `usageTracking` coi `0 = vô hạn` | **Không phải lỗi.** `NULL`/`0 = unlimited` là quy ước có chủ ý cho hạn mức AI (migration 054). Chặn khi hết hạn nằm ở tầng middleware, độc lập với hàm thống kê |
| P2-8 `allowAllCorsMiddleware` | **Không phải nợ** — phục vụ landing page trên tên miền riêng của khách |

### 🔴 P2-7 — mục duy nhất bị BÁC BỎ, đừng làm theo bản audit cũ

Bản audit đề xuất *"gỡ `requireActivePlan` khỏi 3 route `adminLanding*` vì nó là no-op"*.
**Tiền đề đó sai — gỡ ra là tạo lỗ hổng.**

Ba route đó dùng `requireRole('admin', 'user')`, tức **cho cả user thường vào**. Mà
`requireActivePlan` chỉ thoát sớm khi `isSuperAdmin(role)`, và hàm đó chỉ khớp đúng chuỗi
`'admin'`. Với role `'user'` thì middleware **chạy đầy đủ và đang chặn thật**: 403
`NO_ACTIVE_PLAN` khi không có gói, chặn tiếp khi gói hết hạn.

**Giữ nguyên.** Nếu có ca kiểm hồi quy: user role `'user'` không gói gọi
`GET /api/admin/landing-pages` phải nhận **403 `NO_ACTIVE_PLAN`**.

---

## Hai ngưỡng cần xem lại khi có lưu lượng thật

Không phải lỗi — là con số chọn lúc chưa có khách, cần đo lại sau khi mở bán:

- **`campaignRunLimiter` 10 lần/giờ** — có thể chật với thao tác Gửi nhanh. Người dùng gửi
  nhiều đợt nhỏ trong một buổi sẽ chạm trần.
- **`publicLandingAnalyticsLimiter` 60 lượt/15 phút theo IP** — có thể mất số liệu vì CGNAT
  của nhà mạng Việt Nam: nhiều người dùng chung một IP công cộng nên bị tính gộp.

## Hai ràng buộc đã chốt chấp nhận

Chi tiết trong `CLAUDE.md`:

- **Hạn mức Zalo theo giờ mất khi restart** — trạng thái nằm trong bộ nhớ tiến trình.
- **Không scale ngang được** — phải chạy đúng một container backend. Thêm replica là gửi trùng
  và nhân đôi hạn mức Zalo.
