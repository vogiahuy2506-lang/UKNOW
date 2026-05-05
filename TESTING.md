# UKNOW — Hướng dẫn Test & Môi trường Dev

## Tài khoản test

| Username   | Password   | Role        | Email               | Ghi chú                        |
|------------|------------|-------------|---------------------|--------------------------------|
| `admin`    | `Admin@123`| super_admin | admin@uknow.com     | Quản trị hệ thống              |
| `testuser` | `123456`   | user_admin  | test@example.com    | Tài khoản doanh nghiệp mẫu     |

> Mật khẩu mặc định nhân viên mới kích hoạt: **`digiso@2026`**

---

## Chạy local

### Yêu cầu
- Node.js 18+
- PostgreSQL 14+ (database: `uknow-campaign`)
- Redis (nếu dùng BullMQ)

### Backend
```bash
cd backend
cp .env.example .env   # điền các biến môi trường
npm install
npm run dev            # chạy trên port 5001
```

### Frontend
```bash
cd frontend
cp .env.example .env   # VITE_API_URL=http://localhost:5174/api
npm install
npm run dev            # chạy trên port 5174
```

---

## Migrations

Chạy theo thứ tự trên database `uknow-campaign`:

```
001_rbac_roles_and_members.sql
002_users_active_plan.sql
003_fix_role_superadmin.sql
004_employee_send_limits.sql
005_plan_send_limits.sql
006_plan_is_custom.sql
007_subscription_expiry.sql
008_pending_activation.sql       ← thêm trạng thái pending_activation
009_verification_code_text.sql   ← mở rộng cột code thành TEXT
```

Cách chạy từng file (ví dụ dùng psql):
```bash
psql -U postgres -d uknow-campaign -f backend/migrations/008_pending_activation.sql
```

---

## Các luồng cần test

### 1. Đăng ký tài khoản
- Vào `/register` → điền thông tin → nhấn **Tạo tài khoản**
- Nhận OTP qua email → nhập OTP → tạo tài khoản thành công
- Test lỗi: email đã tồn tại, username đã tồn tại, OTP sai/hết hạn

### 2. Đăng nhập
- Vào `/login` → đăng nhập với tài khoản test ở trên
- `super_admin` → vào `/admin`
- `user_admin` → vào `/app`

### 3. Mời nhân viên (tab "Tạo tài khoản mới")
- Vào `/app/settings/employees` → **Thêm nhân viên**
- Điền username, email chưa có trong hệ thống → **Tạo tài khoản**
- Nhân viên nhận email mời → click **Kích hoạt tài khoản**
- Trang hiện "Tài khoản đã được kích hoạt" + thông tin đăng nhập
- Nhân viên đăng nhập bằng mật khẩu mặc định `digiso@2026`

### 4. Quên mật khẩu
- Vào `/forgot-password` → nhập email → nhận link reset
- Click link → đặt mật khẩu mới → đăng nhập lại

### 5. Admin portal
- Đăng nhập bằng `admin` / `Admin@123`
- Kiểm tra: Quản lý thành viên, Quản lý gói dịch vụ, Đơn hàng

---

## Biến môi trường cần thiết (`backend/.env`)

```
PORT=5001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=uknow-campaign
DB_USER=postgres
DB_PASSWORD=

JWT_SECRET=
JWT_REFRESH_SECRET=
JWT_EXPIRES_IN=3h
JWT_REFRESH_EXPIRES_IN=7d

FRONTEND_URL=http://localhost:5174
BACKEND_PUBLIC_URL=http://localhost:5001

# Gửi email hệ thống (OTP, mời nhân viên, reset mật khẩu)
SENDGRID_API_KEY=
SYSTEM_EMAIL_FROM=       # email đã xác thực trên SendGrid

BULLMQ_ENABLED=true
BULLMQ_REDIS_URL=redis://127.0.0.1:6379

GEMINI_API_KEY=
PAYOS_CLIENT_ID=
PAYOS_API_KEY=
PAYOS_CHECKSUM_KEY=
```

---

## Lưu ý môi trường dev

- **Email**: link kích hoạt và OTP dùng `FRONTEND_URL=http://localhost:5174` → chỉ hoạt động trên máy đang chạy dev server. Khi test trên máy khác cần đổi `FRONTEND_URL` thành IP/domain thực.
- **Spam**: email gửi qua SendGrid có thể vào thư mục spam do domain `uknow.vn` chưa cấu hình SPF/DKIM. Kiểm tra cả thư mục spam khi test.
- **Mật khẩu nhân viên**: nhân viên mới kích hoạt tài khoản sẽ dùng mật khẩu mặc định `digiso@2026` và nên đổi ngay sau khi đăng nhập.
