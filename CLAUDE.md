# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Do not include "Co-authored-by:..." in commit messages

## Project Overview

UKNOW Campaign (customer-facing brand **Founder AI**, custom domains served on `*.founderai.biz`) is a two-sided platform for the Vietnamese market:

1. **Marketing automation** — multi-channel email + Zalo campaigns (node-based visual builder), customer segmentation, landing page builder, course management (WooCommerce sync), and PayOS payments/plans.
2. **AI Chatbot / Studio** — users build custom AI chatbots (Gemini + knowledge-base RAG) and deploy them to a web widget, Zalo OA, Zalo Personal, or Facebook, with a unified inbox for all conversations.

Both sides share the same codebase, database, auth, and plan/billing system.

## Product Modules (What's Built)

| Module | Key code locations | Notes |
|---|---|---|
| Auth & RBAC | `routes/auth.routes.js`, `employee.routes.js`; `features/auth`, `features/users` | JWT access+refresh, owner/employee roles, permission-gated routes |
| Campaign builder & execution | `services/campaign/`, `services/queue/`; `features/campaigns` (Reactflow nodes), `pages/campaigns` | Node-based builder; email + Zalo (personal/group/friend-request); BullMQ outbound queue; scheduling via `campaignSchedule.routes.js` |
| Customers & segmentation | `services/customer/`; `features/customers` | Journey/purchases feed campaign "read_*_db" nodes |
| Templates | `repositories/email`, `repositories/zalo`, `templateLabel.*`; `features/templates`, `pages/templates` | Email/Zalo templates with **per-user dynamic category labels** (`template_labels`, migrations 048/049) |
| Landing pages | `services/landing*`, `customDomain.service.js`, `utils/landingHtmlInjection.util.js`; `features/landing-pages` | Lead capture + pixel tracking, custom domain (Cloudflare), admin-managed featured courses/testimonials |
| Courses | `services/courses`, `services/founderai/*` | Admin-only, synced from the `founderai.biz` WordPress/WooCommerce site |
| Payments & Plans | `services/payment`, `payment.routes.js`, `adminPlans.*` | PayOS checkout, orders, vouchers; plan tiers `trial/starter/basic/professional/enterprise` with per-feature limits + AI quota columns (`max_chatbots`, `ai_credits_per_period`) |
| AI Chatbot / Studio | `services/chatbot/` (incl. `channelAdapters/`, `ragEngine`, `knowledgeBase`, `unifiedInbox`); `pages/studio/*`, `features/chatbot`, `features/inbox` | Custom chatbots w/ KB-RAG (Gemini), multi-channel adapters (web/Zalo OA/Zalo Personal/Facebook), unified inbox |
| AI Campaign Assistant | `services/ai/aiCampaign*.service.js`, `aiLandingPage.service.js`, `businessProfile.service.js`; `features/ai/AiChatbot.jsx` | Floating assistant panel (in `MainLayout`) that drafts campaigns, templates, and landing pages |
| Admin console | `routes/admin*`; `pages/admin/*` | Members, plans, vouchers, orders, system, audit logs, delivery monitor, diagnostic, bulk notification |
| Diagnostic & delivery monitor | `services/diagnostic/`, `userDeliveryMonitor.routes.js`, `adminDeliveryMonitor.routes.js` | Send-performance testing + monitoring dashboards over `campaign_runs` (migration 047) |

## Roadmap & Planning Context

**Recently shipped** (merged `ai-chatbot` → `main`, June 2026): unified inbox, knowledge-base/RAG for custom chatbots, Zalo bulk notification + delivery monitor, dynamic per-user template labels, Zalo session keep-alive/cookie restore on deploy.

**Active roadmap (discussed, not yet built)** — full detail in Claude's memory, link before starting:
1. **AI Landing Page Builder (Prompt-to-HTML)** — 4-step plan: vector DB for business profiles → RAG with Gemini → prompt-to-HTML generation module → automated custom-domain provisioning (Cloudflare). Steps are sequential/dependent — don't skip ahead.
2. **Billing × AI model tiers** — gate Gemini model (1.5/2.5/3.0) and `ai_credits_per_period` by plan tier; verify enforcement of existing `messages_per_period` (anti-spam, migration 035/054) before building new UI on top.
3. **Products feature** (user-facing, parallel to admin-only `courses`) — 5-step plan: `products` table + CRUD API → `/app/products` UI → replace JSON blob in Business Profile → campaign node `read_products_db` → feed `products` into AI context. Reference implementation: the `courses` module.

**Tech debt / optimization priorities**:
- `backend/src/ARCHITECTURE_REFACTOR_MAP.md` — `campaign`, `customer`, `uknow`, `emailSettings` services still mix HTTP/business logic/SQL; this is the priority order for layering work.
- ~20 stale feature branches remain on `origin` from the AI-chatbot effort — worth pruning once confirmed merged.
- **Ops (pending)**: `uknow-redis` container needs rebuilding with `--maxmemory-policy noeviction` + `--restart unless-stopped` (currently `noeviction` is runtime-only via `CONFIG SET` and will revert on restart) — schedule during low-traffic hours.

**Working mode**: the user does most implementation in Codex; treat Claude Code sessions in this repo as leaning toward architecture review, roadmap/planning discussions, codebase Q&A, and smaller targeted fixes. When proposing new features, check `schema.sql` + `backend/migrations/` for current DB shape and mirror existing patterns (e.g., `courses` → `products`, existing `channelAdapters/`) rather than inventing new conventions.

## Repository Structure

Two-service monorepo with separate frontend and backend directories:

- `frontend/` — React 18 + Vite SPA (port 5174, proxies API to backend)
- `backend/` — Node.js + Express REST API (port 5001)

## Development Commands

### Frontend

```bash
cd frontend
npm run dev      # Vite dev server on port 5174
npm run build    # Production build
npm run lint     # ESLint (max 5 warnings)
npm run preview  # Preview production build
```

### Backend

```bash
cd backend
npm run dev   # Nodemon watch mode (src/index.js)
npm start     # Production (node src/index.js)
```

### Testing (Backend)

```bash
cd backend
npm run test:unit                                              # 147 tests, ~1s, no DB needed
npm run test:integration                                       # 403 tests, ~30s, needs local Postgres on :5433 (see root README)
npm run test:all                                               # everything, ~45s
npx jest path/to/test.spec.js --selectProjects=unit            # single file
npx jest --testNamePattern "..." --selectProjects=unit         # tests matching a name
```

## Tech Stack

### Frontend
- **React 18** + **React Router v6** (nested routes, protected/admin route wrappers)
- **Zustand** for auth state only (`src/stores/authStore.js`)
- **React Hook Form** + **Zod** for form validation
- **Axios** with custom interceptors (`src/services/api.js`)
- **TailwindCSS** with custom color palette (`tailwind.config.js`)
- **Recharts** for analytics, **Reactflow** for campaign builders

### Backend
- **Express** + **PostgreSQL** (pg pool, `src/config/database.js`)
- **BullMQ** (Redis-backed) for async email/Zalo message delivery
- **node-cron** for scheduled campaigns
- **JWT** (access + refresh tokens), **bcryptjs** for auth
- **Nodemailer** + SendGrid SMTP for email
- **zca-js** for Zalo messaging
- **@payos/node** for Vietnamese payment gateway
- **Google Gemini API** for AI content generation

## Architecture

### Frontend

Routing is centralized in `src/App.jsx`. Route protection uses `<ProtectedRoute>` and `<AdminRoute>` wrappers.

Auth flow: JWT access token + refresh token stored in localStorage (remember-me) or sessionStorage. The Axios instance in `src/services/api.js` injects Bearer tokens and automatically retries requests after refreshing on 401 errors — `/auth/*` endpoints bypass this logic.

Code is organized by feature under `src/features/` and `src/pages/`. Shared UI lives in `src/components/`. Three layouts: `AuthLayout`, `MainLayout`, `LandingLayout`.

### Backend

Strict layered architecture: **Routes → Controllers → Services → Repositories → Database**

- `routes/` — bind Express paths to controller methods
- `controllers/` — HTTP concerns: parse request, call service, return response
- `services/` — business logic, orchestration; organized by feature subdirectory
- `repositories/` — all raw SQL queries and row mapping; partially refactored (see `ARCHITECTURE_REFACTOR_MAP.md`)
- `middleware/` — JWT auth, role authorization, input validation
- `utils/` — pure helpers with no HTTP/DB dependencies

The backend uses ES modules (`"type": "module"` in package.json). All imports use `.js` extensions.

### Job Queue

BullMQ processes outbound email and Zalo messages asynchronously. The processor registry is at `src/services/queue/outboundMessageProcessorRegistry.js`. Enable with `BULLMQ_ENABLED=true` and a running Redis instance.

### Database

PostgreSQL pool singleton at `src/config/database.js`. Default: `localhost:5432`, database `uknow-campaign`. Pool max: 150 connections, statement timeout: 30s, timezone: `Asia/Ho_Chi_Minh`.

## Environment Variables

Create `.env` in `backend/` and `frontend/`.

### Frontend (`frontend/.env`)
```
VITE_API_URL=http://localhost:5174/api
```

### Backend (`backend/.env`) — key variables
```
PORT=5001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=uknow-campaign
DB_USER=postgres
DB_WORD=

JWT_SECRET=
JWT_REFRESH_SECRET=
JWT_EXPIRES_IN=3h
JWT_REFRESH_EXPIRES_IN=7d

FRONTEND_URL=http://localhost:5174
BACKEND_PUBLIC_URL=http://localhost:5001

BULLMQ_ENABLED=true
BULLMQ_REDIS_URL=redis://127.0.0.1:6379

GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash

PAYOS_CLIENT_ID=
PAYOS_API_KEY=
PAYOS_CHECKSUM_KEY=

SENDGRID_API_KEY=
```

See existing backend `.env` for the full list including Zalo rate-limiting, campaign concurrency, and sheet-reading tuning variables.

## Key Integration Notes

- **Zalo**: Rate limited per hour with configurable quiet hours (default: 23:00–06:00). Per-message delays are applied to avoid triggering spam detection.
- **PayOS**: QR-based checkout flow — frontend generates QR via `CheckoutPage`, webhook confirms payment, `PaymentSuccess` verifies order.
- **Landing Pages**: Dynamic HTML injection (`utils/landingHtmlInjection.util.js`) with lead capture and pixel tracking. Landing pages are served from public routes without auth.
- **WooCommerce**: Webhook consumer updates local course/product data from the UKNOW WordPress site.

## Operational Parameters — Zalo & Email Sending

All values below are **defaults coded in** `src/services/campaign/campaignRun.service.js`. Override via env vars in `backend/.env`.

### Zalo — Khung giờ yên lặng (Quiet Hours)

| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `ZALO_OUTBOUND_QUIET_HOURS_START` | `23` | Giờ bắt đầu không gửi (23:00 VN) |
| `ZALO_OUTBOUND_QUIET_HOURS_END` | `6` | Giờ cho phép gửi trở lại (06:00 VN) |

→ **Không gửi Zalo từ 23:00 tối đến 06:00 sáng** (giờ Việt Nam cố định +7). Campaign đang chạy sẽ tự động pause và resume lúc 6h sáng.

### Zalo — Rate limit & khoảng cách tin nhắn

| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `ZALO_OUTBOUND_PER_HOUR_LIMIT_DEFAULT` | `100` | Tối đa 100 tin/giờ/tài khoản (mọi kênh) |
| `ZALO_OUTBOUND_INTER_MESSAGE_MIN_MS_DEFAULT` | `20000` | Chờ tối thiểu **20 giây** giữa 2 tin |
| `ZALO_OUTBOUND_INTER_MESSAGE_MAX_MS_DEFAULT` | `50000` | Chờ tối đa **50 giây** giữa 2 tin (random trong min–max) |
| `ZALO_PERSONAL_PHONE_LOOKUP_COOLDOWN_MS` | `10800000` | Cooldown **3 giờ** nếu API báo tra số điện thoại quá nhiều |

Override riêng theo kênh (0 = dùng default chung):

| Tham số | Kênh |
|---|---|
| `ZALO_PERSONAL_PER_HOUR_LIMIT` / `_INTER_MESSAGE_MIN_MS` / `_MAX_MS` | Zalo cá nhân |
| `ZALO_GROUP_PER_HOUR_LIMIT` / `_INTER_MESSAGE_MIN_MS` / `_MAX_MS` | Zalo nhóm |
| `ZALO_FRIEND_REQUEST_PER_HOUR_LIMIT` / `_INTER_MESSAGE_MIN_MS` / `_MAX_MS` | Kết bạn Zalo |

### Zalo — Xử lý thất bại

| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `CONTINUOUS_ZALO_MAX_SEND_FAILURES` | `5` | Sau 5 lần thất bại liên tiếp với cùng 1 người → bỏ qua, không thử lại |
| `ZALO_OUTBOUND_YIELD_SLOT_MIN_WAIT_MS` | `60000` | Nếu phải chờ > 60s (hết quota / quiet hours / cooldown tra số) → nhả worker slot, scheduler resume sau |

### Concurrency (số campaign chạy đồng thời)

| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `MAX_CONCURRENT_CAMPAIGNS` | `3` | Tối đa 3 campaign one-shot chạy cùng lúc |
| `MAX_CONTINUOUS_WORKERS` | `10` | Tối đa 10 worker cho continuous campaigns |

### Batch size (chế độ continuous + BullMQ)

| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `CONTINUOUS_EMAIL_BATCH_SIZE` | `12` | Gửi 12 email/batch |
| `CONTINUOUS_ZALO_PERSONAL_BATCH_SIZE` | `1` | Gửi 1 tin Zalo cá nhân/batch (để đảm bảo inter-message delay) |
| `CONTINUOUS_ZALO_GROUP_BATCH_SIZE` | `6` | Gửi 6 tin Zalo nhóm/batch |
| `CONTINUOUS_ZALO_FRIEND_BATCH_SIZE` | `8` | Gửi 8 yêu cầu kết bạn/batch |

### Email — Tốc độ gửi & xử lý lỗi

| Tham số (hardcoded) | Giá trị | Ý nghĩa |
|---|---|---|
| `EMAIL_API_DELAY_MIN_MS` | `50` | Delay tối thiểu **50ms** giữa 2 lần gọi SMTP API |
| `EMAIL_API_DELAY_MAX_MS` | `250` | Delay tối đa **250ms** giữa 2 lần gọi SMTP API |
| `EMAIL_RATE_LIMIT_PAUSE_MS` | `43200000` | Nếu SendGrid báo bị rate-limit → **tạm dừng 12 giờ** rồi tự retry |

→ Email gửi nhanh hơn Zalo nhiều (50–250ms/tin). Bottleneck chính là **SendGrid quota** và **hard bounce**.

### Email — Xử lý bounce

| Loại | Hành vi |
|---|---|
| **Hard bounce** (địa chỉ không tồn tại, domain lỗi) | Đánh dấu `email_hard_bounced = true` trong DB, **không gửi lại bao giờ** |
| **Soft bounce / SMTP lỗi tạm thời** | Lên lịch retry, theo dõi qua `meta.retryCount` trong ledger |
| **SMTP auth lỗi (535)** | Đánh dấu lỗi cấu hình, **không retry** vì là lỗi credentials |
| **SendGrid rate-limit** | Pause toàn bộ campaign 12 giờ, sau đó resume tự động |

### Khi nào Zalo không gửi / gửi chậm — checklist giám sát

1. **Không gửi gì cả** → Kiểm tra: đang trong quiet hours? (`23:00–06:00`), hay tài khoản Zalo bị disconnect?
2. **Gửi rất chậm** → Bình thường — mỗi tin cách nhau 20–50s. Với 1000 người = ~7–14 giờ.
3. **Dừng giữa chừng** → Có thể đã đạt 100 tin/giờ → chờ quota reset (window 1 giờ), hoặc bị cooldown tra số điện thoại (3 giờ).
4. **Một số người không nhận được** → Có thể đã thất bại 5 lần → bị skip. Xem log: `docker logs uknow-campaign-backend --since 2h | grep "FAIL\|skip\|ledger"`.

### Khi nào Email không gửi / dừng giữa chừng — checklist giám sát

1. **Campaign dừng ~12 giờ** → SendGrid báo rate-limit → tự resume sau 12 tiếng. Xem log: `grep -i "rate.limit\|pause\|sendgrid"`.
2. **Một số người không nhận được** → Email bị hard bounce (địa chỉ không tồn tại) → bị skip vĩnh viễn. Kiểm tra cột `email_hard_bounced` trong DB.
3. **Toàn bộ email lỗi liên tục** → Kiểm tra SendGrid API key, quota tháng, hoặc domain sender bị blacklist.
4. **Campaign treo, không tiến triển** → Có thể SMTP credentials sai (lỗi 535) → xem log: `grep -i "535\|auth\|credentials"`.

> **Log nhanh trên VPS:**
> ```bash
> docker logs uknow-campaign-backend --since 1h --tail 200 | grep -iE "quiet|rate.limit|cooldown|fail|error|skip|bounce|sendgrid"
> ```
