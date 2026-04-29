# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

UKNOW Campaign is a multi-channel marketing automation platform for email and Zalo messaging campaigns, with customer segmentation, landing page builder, course management, and payment integration (PayOS). The target deployment is Vietnamese market.

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
npm run lint     # ESLint (zero warnings allowed)
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
npx jest                         # Run all tests
npx jest path/to/test.spec.js    # Run a single test file
npx jest --testNamePattern "..."  # Run tests matching a name
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
DB_PASSWORD=

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
