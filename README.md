# UKNOW Campaign

[![Test Backend](https://github.com/vogiahuy2506-lang/UKNOW/actions/workflows/test-backend.yml/badge.svg)](https://github.com/vogiahuy2506-lang/UKNOW/actions/workflows/test-backend.yml)
[![Deploy Backend](https://github.com/vogiahuy2506-lang/UKNOW/actions/workflows/deploy-backend.yml/badge.svg)](https://github.com/vogiahuy2506-lang/UKNOW/actions/workflows/deploy-backend.yml)
[![Lint](https://github.com/vogiahuy2506-lang/UKNOW/actions/workflows/lint.yml/badge.svg)](https://github.com/vogiahuy2506-lang/UKNOW/actions/workflows/lint.yml)
[![Deploy Frontend](https://github.com/vogiahuy2506-lang/UKNOW/actions/workflows/deploy-frontend.yml/badge.svg)](https://github.com/vogiahuy2506-lang/UKNOW/actions/workflows/deploy-frontend.yml)

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
yarn install
yarn dev
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
Push branch ──► test-backend.yml ──► CI run: unit + integration
Mở PR  ──────► test-backend.yml ──► CI run: unit + integration
                                     │
                                     └► Merge bị block nếu fail (cần
                                        bật branch protection trên GitHub)

Push main ──► deploy-backend.yml ──► unit + integration  ──► Build Docker
                                                                │
                                                                ▼
                                              SSH deploy VPS (chỉ khi tests xanh)
```

## Tài liệu

- [`CLAUDE.md`](./CLAUDE.md) — kiến trúc + dev commands
- [`backend/tests/integration/README.md`](./backend/tests/integration/README.md) — guide integration test
- [`backend/ARCHITECTURE_REFACTOR_MAP.md`](./backend/ARCHITECTURE_REFACTOR_MAP.md) — refactor map

## Stack

- **Backend**: Node 20 (ESM), Express, PostgreSQL 16, BullMQ + Redis, JWT, Nodemailer + SendGrid, zca-js (Zalo), PayOS, Google Gemini, node-cron
- **Frontend**: React 18, React Router v6, Zustand, Axios, React Hook Form + Zod, TailwindCSS, Recharts, Reactflow
- **Test**: Jest 29 (ESM mode), supertest, real Postgres trong CI service container
- **CI**: GitHub Actions
- **Deploy**: Docker + VPS (SSH action)
