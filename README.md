# UKNOW Campaign

[![CI](https://github.com/vogiahuy2506-lang/UKNOW/actions/workflows/test-backend.yml/badge.svg?branch=main)](https://github.com/vogiahuy2506-lang/UKNOW/actions/workflows/test-backend.yml)
[![Deploy Backend](https://github.com/vogiahuy2506-lang/UKNOW/actions/workflows/deploy-backend.yml/badge.svg?branch=main)](https://github.com/vogiahuy2506-lang/UKNOW/actions/workflows/deploy-backend.yml)
[![Lint](https://github.com/vogiahuy2506-lang/UKNOW/actions/workflows/lint.yml/badge.svg?branch=main)](https://github.com/vogiahuy2506-lang/UKNOW/actions/workflows/lint.yml)
[![Deploy Frontend](https://github.com/vogiahuy2506-lang/UKNOW/actions/workflows/deploy-frontend.yml/badge.svg?branch=main)](https://github.com/vogiahuy2506-lang/UKNOW/actions/workflows/deploy-frontend.yml)

Nền tảng marketing automation đa kênh (email + Zalo) cho thị trường Việt Nam: customer segmentation, landing page builder, course management, payment (PayOS).

## Cấu trúc

- `backend/` — Node.js + Express + PostgreSQL + BullMQ (port 5001)
- `frontend/` — React 18 + Vite (port 5174)

Xem chi tiết kiến trúc trong [`CLAUDE.md`](./CLAUDE.md).

## Quick start

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend (terminal khác)
cd frontend
npm install
npm run dev
```

## Testing

Backend có 2 layer test, **gating mọi PR và deploy lên production**:

| Loại | Lệnh | Số test | Thời gian |
|---|---|---|---|
| Unit | `cd backend && npm run test:unit` | 147 | ~1s |
| Integration | `cd backend && npm run test:integration` | 403 | ~30s |
| Tất cả | `cd backend && npm run test:all` | 550 | ~45s |

Integration test cần PostgreSQL local:

```bash
# Chạy 1 container Postgres riêng cho test (port 5433)
docker run -d --name uknow-test-pg -p 5433:5432 \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=uknow_campaign_test postgres:16-alpine

# Chạy test
cd backend
DB_HOST=localhost DB_PORT=5433 DB_NAME=uknow_campaign_test \
  DB_USER=postgres DB_PASSWORD=postgres npm run test:integration
```

## Git hooks (husky)

Repo có sẵn `pre-push` hook chạy unit test ~1s trước mỗi `git push`. Tự kích hoạt sau `npm install` ở root.

Cài đặt lần đầu:

```bash
cd /Users/...UKNOW  # repo root
npm install         # tự chạy `husky` qua script `prepare`
```

Bypass khẩn cấp:

```bash
git push --no-verify
```

## CI/CD pipeline

```
Push branch ──► test-backend.yml ──► CI run: unit + integration (4 shard song song)
Mở PR  ──────► test-backend.yml ──► CI run: unit + integration (4 shard song song)
                                     │
                                     └► Merge bị block nếu fail (cần
                                        bật branch protection trên GitHub)

Push main ──► deploy-backend.yml ──► unit + integration  ──► Build Docker
                                                                │
                                                                ▼
                                              SSH deploy VPS (chỉ khi tests xanh)
```

Integration test chạy theo **matrix 4 shard song song** (mỗi shard = VM + Postgres
service riêng), thay vì 1 lần chạy tuần tự — giảm thời gian chờ deploy đáng kể so
với chạy dồn 1 job.

**Fast-path hotfix:** `workflow_dispatch` của Deploy Backend có input
`skip_integration` (mặc định `false`). Bật input này khi vá gấp để deploy chỉ chờ
schema-sync + unit + lint (~1-2 phút) thay vì đợi integration. **Chỉ dùng khi thật
sự gấp** — đường đi thường ngày vẫn chạy đủ test.

**GitHub Secrets** (Settings → Secrets and variables → Actions):

| Secret | Dùng cho |
|--------|-----------|
| `DOCKERHUB_USERNAME` | Docker Hub user/namespace (ví dụ `nhatminh7104`) — dùng cho login, tag image (`$USER/uknow-backend`, `$USER/uknow-frontend`) và lệnh `docker pull` trên VPS |
| `DOCKERHUB_TOKEN` | Access token Docker Hub (quyền Read & Write), không dùng mật khẩu nếu Hub yêu cầu token |
| `VPS_HOST` | IP hoặc hostname VPS |
| `VPS_USER` | User SSH (thường `root`) |
| `VPS_SSH_KEY` | Private key PEM (full multiline) |

**Deploy tay:** Actions → workflow Deploy Backend / Deploy Frontend → **Run workflow** (không cần push thêm commit).

**Trên VPS** (một lần): network Docker phải tồn tại giống workflow — ví dụ `docker network create uknow_network`; file `.env` và volume paths trong SSH script (`/root/uknow/...`) phải khớp thực tế.

**Merge production:** sau khi merge vào `main`, nhớ **chạy migration** PostgreSQL trên DB production (ví dụ migration payment `018_*`) — CI không apply migration lên VPS.

## Tài liệu

- [`CLAUDE.md`](./CLAUDE.md) — kiến trúc + dev commands
- [`backend/tests/integration/README.md`](./backend/tests/integration/README.md) — guide integration test
- [`backend/ARCHITECTURE_REFACTOR_MAP.md`](./backend/ARCHITECTURE_REFACTOR_MAP.md) — refactor map

## Landing Page CMS — luồng lead (v2.0)

Từ 09/2026, hệ thống **KHÔNG còn tự động chèn iframe form** mỗi khi lưu landing page.
Admin tự thiết kế form đăng ký trong HTML, script `founderai-capture.js` sẽ tự bắt:

```html
<!-- Ví dụ: form admin tự thiết kế trong landing page -->
<form data-founderai-capture>
  <input type="text"  name="name"  placeholder="Họ tên" required />
  <input type="email" name="email" placeholder="Email"  required />
  <input type="tel"   name="phone" placeholder="SĐT"    required />
  <button type="submit">Gửi</button>
</form>
```

**Cách hoạt động:**

1. Mỗi lần lưu landing page, hệ thống tự động chèn 2 script tracking trước `</body>`:
   - `lp-track.js` — ghi lượt xem + tracking click trên `<a href>`
   - `founderai-capture.js` — auto-detect form `data-founderai-capture` (nếu có), hoặc
     form đầu tiên CÓ trường email/phone trong trang, bắt submit
2. Khi khách điền form và submit, script sẽ gọi `POST /api/public/leads`
   với payload `{ name, email, phone, landingPageSlug, customFields }`.
3. Lead được lưu vào bảng `leads` với `id_user = chủ landing page`.
4. Trang `/app/landing-leads` sẽ hiển thị lead mới.

**Tùy chọn nâng cao:**

- `<form data-founderai-capture>` — đánh dấu form cụ thể cần capture (ưu tiên form này).
- Trường occupation/interestArea/tùy chỉnh: khai báo trong panel **"Form đăng ký"** ở
  settings của trang (Canvas Editor → `LeadFormConfigPanel`), lưu vào `leadFormConfig`
  của landing page. Khi tạo trang bằng AI hoặc yêu cầu AI sửa trang, các trường này được
  đưa thẳng vào prompt để model sinh đúng `name="occupation"` / `name="interestArea"` /
  `name="cf_xxx"` trong form — không cần tự viết HTML tay. Nếu trang đã có sẵn mà thiếu
  một trường đã khai báo, panel hiện cảnh báo kèm nút **"Nhờ AI thêm ô này"** để AI chỉnh
  trực tiếp form hiện có (giữ nguyên các trường khác).
- Backend chỉ lưu các khoá `cf_xxx` đã khai báo trong `leadFormConfig.customFields` của
  chính trang đó (`leads.custom_fields` JSONB, xem `backend/migrations/126_leads_custom_fields.sql`).
  Khoá `cf_*` nào form tự thêm mà KHÔNG có trong khai báo sẽ bị **bỏ qua lúc submit**
  (không lưu, có log cảnh báo) nhưng **không** làm mất phần còn lại của lead —
  tên/email/phone vẫn lưu bình thường.
- Muốn TẮT auto-capture: thêm `data-auto="0"` vào thẻ `<script src=".../founderai-capture.js">`.

**Lưu ý cho landing page cũ:** Nếu landing page hiện tại đang có iframe `/embed/lead-form`
do phiên bản cũ chèn, admin cần **xóa thủ công 1 lần** (edit → xóa `<iframe>`
và `<section data-founder-lp-embed>` nếu có), sau đó Lưu. Hệ thống sẽ không tự
chèn lại iframe nữa.

## Vận hành quan trọng — campaign

Backend campaign engine giữ state trong RAM (`activeRunIds`, rate-limit Zalo, mutex tài khoản). **Chỉ chạy 1 container/replica backend** cho luồng chạy campaign. Thêm replica thứ 2 mà chưa chuyển guard sang Redis/DB lock = gửi trùng + nhân đôi hạn mức Zalo.

## Stack

- **Backend**: Node 20 (ESM), Express, PostgreSQL 16, BullMQ + Redis, JWT, Nodemailer + SendGrid, zca-js (Zalo), PayOS, Google Gemini, node-cron
- **Frontend**: React 18, React Router v6, Zustand, Axios, React Hook Form + Zod, TailwindCSS, Recharts, Reactflow
- **Test**: Jest 29 (ESM mode), supertest, real Postgres trong CI service container
- **CI**: GitHub Actions
- **Deploy**: Docker + VPS (SSH action)
