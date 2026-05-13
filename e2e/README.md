# UKNOW — E2E Tests (Playwright)

End-to-end happy-path tests cho UKNOW Campaign, chạy Playwright Chromium trên
giao diện thật (backend + frontend đầy đủ).

## Triết lý

- **Local-first**: dev tự chạy backend test mode + Playwright auto-spawn frontend.
- **Test DB tách biệt**: dùng database có hậu tố `_test` (vd: `uknow_campaign_test`).
  Seed script bảo vệ bằng cách refuse nếu DB_NAME không kết thúc `_test`.
- **Fixed test user**: 1 user duy nhất `e2etest` được seed sẵn, mọi spec dùng chung.
- **Storage state**: login 1 lần qua project "setup", lưu cookies + localStorage,
  các spec sau reuse → tiết kiệm 5–10s mỗi spec.
- **Hermetic data**: seed reset toàn bộ schema trước mỗi lần chạy → tests deterministic.

## Bắt buộc trước khi chạy lần đầu

```bash
cp e2e/.env.test.example e2e/.env.test
# Sửa DB_HOST / DB_PORT / DB_PASSWORD theo môi trường (Docker mặc định: port 5433, password postgres)
```

## Yêu cầu

- Node 20+
- Docker Desktop (để chạy Postgres test riêng, port 5433)
- Hoặc: Postgres local/Neon branch (nâng cao, xem `.env.test.example`)

## Cài đặt 1 lần

```bash
# 1. Cài deps + Chromium
cd e2e
npm install
npx playwright install chromium

# 2. Khởi động Postgres E2E qua Docker
docker compose up -d
# Verify: docker compose ps  → uknow-postgres-e2e running (healthy)

# 3. (Optional) Sửa .env.test nếu muốn — mặc định OK cho Docker setup
```

## Chạy E2E

**Mỗi lần chạy E2E cần 2 terminal:**

### Terminal 1 — Seed DB + start backend test mode

```bash
# Đảm bảo Docker Postgres đang chạy
docker compose -f e2e/docker-compose.yml up -d

cd e2e
npm run seed                   # 1 lần, hoặc khi muốn reset DB

cd ../backend
npm run dev:e2e                # chạy backend với env override từ e2e/.env.test
```

Backend sẽ chạy ở port 5001 (giống dev) nhưng kết nối DB ở port 5433
(Docker test). **Quan trọng**: stop backend dev bình thường trước (port 5001 conflict).

### Terminal 2 — Chạy Playwright

```bash
cd e2e
npm test                       # headless
npm run test:headed            # mở browser xem trực tiếp
npm run test:ui                # UI mode (debug tốt nhất)
npm run report                 # mở HTML report sau khi chạy
```

Playwright sẽ:

1. Chạy `global-setup.js` → seed DB
2. Auto-spawn frontend (`cd ../frontend && npm run dev`) ở port 5174
3. Chạy project `setup` (auth.setup.js) → login → lưu `.auth/user.json`
4. Chạy spec files trong `tests/` với storageState đã có
5. Chạy `cleanup` teardown → xoá `.auth/user.json`

## Cấu trúc

```
e2e/
├── .env.test               # env config (gitignored)
├── .env.test.example       # template
├── package.json
├── playwright.config.js    # 3 project: setup, chromium, cleanup
├── global-setup.js         # gọi seed-test-db.js trước khi test
├── scripts/
│   └── seed-test-db.js     # reset schema + seed plan + user
├── fixtures/
│   ├── auth.setup.js       # login → lưu storageState
│   └── cleanup.teardown.js # xoá .auth/
└── tests/
    ├── auth.spec.js        # login/logout flows
    └── navigation.spec.js  # smoke navigate route chính
```

## Phạm vi

✅ **Có**: login/logout, navigation smoke, (sắp tới) customer CRUD, profile, template, campaign create

❌ **Skip cố ý**:

- **PayOS checkout** — cần webhook ngrok, sandbox config; ROI thấp cho dev
- **Send email/Zalo thật** — cần mock SMTP/Zalo server, phức tạp
- **Admin flow** — B2B SaaS không cần test admin E2E thường xuyên
- **Landing page builder** — đang đổi nhiều, tests sẽ flaky

## Troubleshooting

### "DB_NAME không kết thúc bằng \_test"

Edit `e2e/.env.test`, đảm bảo `DB_NAME=uknow_campaign_test`.

### Backend không kết nối được DB

```bash
# Verify Postgres chạy
psql -U postgres -c '\l' | grep test

# Tạo thủ công nếu seed script không tạo được (vd: user không có CREATEDB)
psql -U postgres -c 'CREATE DATABASE uknow_campaign_test'
```

### Frontend port 5174 đã bị chiếm

Tắt vite dev server đang chạy hoặc đổi `FRONTEND_URL` trong `.env.test` sang port khác.

### Test fail "ECONNREFUSED 127.0.0.1:5001"

Backend chưa start ở Terminal 1. Chạy `cd backend && npm run dev:e2e` trước.

### Login bị fail "Sai mật khẩu"

User chưa được seed. Chạy lại `cd e2e && npm run seed`.

## CI/CD (tương lai)

Hiện E2E chỉ chạy local. Khi setup GitHub Actions:

1. Thêm Postgres service vào workflow
2. Set `process.env.CI=true` → Playwright retry x2 + ghi video on failure
3. Spawn backend tự động trong webServer config thay vì manual
4. Upload `playwright-report/` làm artifact

## Tham khảo

- [Playwright Docs](https://playwright.dev/docs/intro)
- Backend integration tests: `backend/tests/integration/` (pattern tương tự)
