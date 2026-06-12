# AGENTS.md

Hướng dẫn cho Codex khi làm việc trong repo UKNOW.

## Vai trò chính

Codex chủ yếu phụ trách **implement** và **fix bugs** theo:

- plan đã có từ Claude Code;
- review/findings từ Claude Code;
- yêu cầu trực tiếp của user.

Khi nhận plan hoặc review, hãy coi đó là nguồn định hướng chính, nhưng vẫn phải đọc code liên quan để xác nhận giả định trước khi sửa. Nếu phát hiện plan/review sai với code hiện tại, báo ngắn gọn điểm lệch và chọn cách sửa an toàn nhất.

## Ngữ cảnh dự án

UKNOW Campaign là nền tảng marketing automation đa kênh cho thị trường Việt Nam.

- `frontend/`: React 18 + Vite SPA, port dev `5174`.
- `backend/`: Node.js + Express REST API, PostgreSQL, BullMQ/Redis, port `5001`.
- `e2e/`: Playwright tests.
- Root chỉ dùng cho git hooks và script điều phối, không build/deploy app trực tiếp.

Đọc `CLAUDE.md` trước khi làm các thay đổi lớn vì file đó chứa kiến trúc, commands, env vars và ghi chú vận hành chi tiết.

## Quy tắc làm việc

- Giữ scope hẹp theo plan/review. Không refactor lan rộng nếu không cần để fix lỗi.
- Không revert hoặc ghi đè thay đổi có sẵn của user. Nếu `git status` có file unrelated đang modified, bỏ qua.
- Không thêm `Co-authored-by:` vào commit message.
- Ưu tiên code style và pattern hiện hữu trong repo hơn là tạo abstraction mới.
- Với bug fix, tái hiện luồng lỗi bằng đọc code/test trước, rồi sửa ở tầng đúng trách nhiệm.
- Khi thay API contract, response shape, status code, message tiếng Việt, schema DB hoặc env var, phải có lý do rõ và cập nhật nơi liên quan.
- Không commit secret, token, file `.env`, log nhạy cảm hoặc dữ liệu khách hàng.

## Backend conventions

Backend dùng ES modules (`"type": "module"`). Import local file phải có đuôi `.js`.

Kiến trúc mục tiêu:

`routes -> controllers -> services -> repositories -> database`

- `routes/`: khai báo endpoint, middleware, validation.
- `controllers/`: xử lý HTTP, lấy input từ `req`, gọi service/repository phù hợp, map response.
- `services/`: business logic, orchestration, workflow.
- `repositories/`: raw SQL, DB access, row mapping.
- `utils/`: helper thuần, không phụ thuộc HTTP/DB nếu tránh được.

Khi sửa backend:

- Không để SQL mới trong controller nếu đã có repository phù hợp.
- Không đổi contract API hiện tại nếu task không yêu cầu.
- Với campaign/customer/email/zalo/payment, kiểm tra kỹ side effect: quota, retry, ledger/log, status transition.
- Với migrations, tạo file migration mới thay vì sửa migration cũ đã có thể được áp dụng.
- Integration tests dùng DB test thật và sẽ refuse nếu `DB_NAME` không chứa `_test`.

## Frontend conventions

Frontend dùng React 18, React Router v6, Zustand cho auth, Axios service layer, React Hook Form + Zod, TailwindCSS.

Khi sửa frontend:

- API calls nên đi qua `src/services/*` hoặc service hiện có của feature.
- Giữ route protection qua `ProtectedRoute` / `AdminRoute`.
- Không duplicate auth/token refresh logic; logic chính nằm ở `src/services/api.js`.
- UI nên bám component/pattern hiện có trong `src/features`, `src/pages`, `src/components`.
- Với form, ưu tiên React Hook Form + Zod nếu feature đã dùng pattern đó.
- Kiểm tra responsive và trạng thái loading/error/empty khi thay UI có dữ liệu async.

## Commands thường dùng

Frontend:

```bash
cd frontend
npm run dev
npm run build
npm run lint
npm run test
```

Backend:

```bash
cd backend
npm run dev
npm run test:unit
npm run test:integration
npm run test:all
```

E2E:

```bash
cd e2e
npm test
```

Chọn test theo phạm vi thay đổi:

- backend utility/service nhỏ: `cd backend && npm run test:unit`;
- endpoint hoặc DB behavior: integration test liên quan, hoặc `npm run test:integration`;
- frontend component/logic: `cd frontend && npm run test` và lint/build khi phù hợp;
- flow người dùng xuyên frontend/backend: e2e nếu môi trường sẵn sàng.

Nếu không chạy được test vì thiếu DB/Redis/env/network, ghi rõ trong final response.

## Workflow khi nhận plan/review từ Claude Code

1. Đọc plan/review đầy đủ và xác định file/module bị ảnh hưởng.
2. Dùng `rg` để tìm implementation, test và call sites liên quan.
3. Kiểm tra `git status --short` để tránh đụng thay đổi unrelated.
4. Sửa code tối thiểu nhưng đủ triệt để ở đúng tầng kiến trúc.
5. Thêm hoặc cập nhật test nếu bug có rủi ro tái diễn.
6. Chạy test/lint phù hợp với scope.
7. Báo lại ngắn gọn: đã sửa gì, file chính, test đã chạy, phần chưa verify được.

## Ghi chú vận hành quan trọng

- Zalo có quiet hours mặc định `23:00-06:00` giờ Việt Nam và rate limit theo tài khoản/kênh. Không bypass logic delay/quota nếu task không yêu cầu rõ.
- Email có xử lý hard bounce, soft retry, SMTP auth error và SendGrid rate-limit. Không retry bừa các lỗi credentials.
- PayOS checkout/webhook cần giữ checksum và flow verify order.
- Landing pages có public routes và HTML injection/tracking. Cẩn thận XSS, tenant/domain ownership và lead capture.
- BullMQ chỉ hoạt động khi `BULLMQ_ENABLED=true` và Redis sẵn sàng; code vẫn cần chạy được khi queue disabled nếu hiện trạng hỗ trợ.

## Khi cần hỏi lại

Chỉ hỏi user khi thiếu thông tin làm thay đổi hướng sửa một cách rủi ro, ví dụ:

- plan/review mâu thuẫn với code hiện tại;
- cần chọn giữa thay đổi API contract hoặc giữ backward compatibility;
- cần chạy command có tác động ngoài sandbox hoặc cần secret/env không có sẵn.

Nếu có thể đưa ra giả định hợp lý và tiếp tục an toàn, hãy làm luôn.
