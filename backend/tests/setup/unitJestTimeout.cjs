/**
 * Jest setupFilesAfterEnv của project `unit` — nâng thời gian chờ mỗi `it`/hook lên 20 giây.
 *
 * Vì sao cần: project `unit` trước đây KHÔNG đặt thời gian chờ nên dùng mặc định 5 giây của Jest. Máy dev
 * 8 lõi có nhiều phiên chạy song song (tải 19-47 đo 19-20/10/2026) làm một ca vốn chạy vài trăm ms bị kéo
 * quá 5 giây: hook pre-push đỏ 5 lượt liên tiếp, mỗi lượt một file khác (chatbotStatus.routes.spec,
 * internalHealth.spec, migrationRunner.util.spec, fileExtractor.util.spec, outboundMessageQueue.service.spec,
 * campaignRunZaloFriendRequestAccountDailyLimit.spec), chạy riêng từng file đều xanh. Ca đỏ trỏ vào dòng `it(`
 * với "Exceeded timeout of 5000 ms" — đỏ giả do tải, không phải lỗi code.
 *
 * VÌ SAO LÀ `.cjs` CHỨ KHÔNG PHẢI `.js` (ESM) NHƯ tests/integration/jest-timeout.js: trong ESM, Jest
 * lưu module `@jest/globals` MỘT bản duy nhất trong registry, đối tượng `jest` gắn với FILE ĐẦU TIÊN import
 * nó (jest-runtime `resolveModule` -> `getGlobalsForEsm(referencingIdentifier)`). Nếu file setup import
 * trước thì mọi spec sau đó nhận cùng đối tượng `jest` gắn với file setup, và
 * `jest.unstable_mockModule('../../middleware/x.js')` bị phân giải tương đối so với tests/setup/ thay vì file
 * spec -> "Cannot find module ... from 'tests/setup/unitJestTimeout.js'" (đo 20/10/2026, chatbotStatus.routes
 * và hàng trăm spec dùng unstable_mockModule đường dẫn tương đối). Module CJS thì Jest tiêm sẵn một đối tượng
 * `jest` RIÊNG theo file (tham số bọc module, không chạm registry ESM) mà `jest.setTimeout` vẫn ghi vào cùng
 * môi trường test nên có hiệu lực cho cả spec ESM. (Không `require('@jest/globals')` ở đây: `jest` đã là biến
 * của lớp bọc nên khai báo lại sẽ lỗi "Identifier 'jest' has already been declared".)
 *
 * Chỉ nới trần chờ; không đổi --maxWorkers, không đổi hook. Spec nào cần trần riêng vẫn tự gọi
 * `jest.setTimeout(...)` hoặc truyền tham số thứ ba cho `it` như cũ.
 */
/* global jest */
jest.setTimeout(20_000);
