# Lịch sử tính năng — tháng 8/2026

Tổng hợp các plan đã triển khai xong trong tháng 8/2026, kèm commit làm bằng chứng.

Các plan chi tiết trước đây nằm trong `_internal/` (thư mục này **không được git theo dõi**).
Sau khi tính năng lên `main`, plan được tóm tắt vào đây rồi xoá bản gốc để `_internal/` chỉ còn
việc đang làm. Cần xem lại chi tiết thì tra commit tương ứng.

---

## Hoá đơn điện tử (Mắt Bão HDDT)

Chuỗi dài nhất trong tháng, đi từ "chưa có gì" tới "quản lý được trên admin".

| Việc | Commit |
|---|---|
| Phát hành hoá đơn bền vững + gửi PDF qua email | `77f63bb` |
| Bắt buộc thông tin hoá đơn cho đơn trả phí, validate MST/CCCD, kiểm env lúc khởi động | `7ca9349` |
| Hoàn thiện trải nghiệm hoá đơn (form + webhook + trang xem) | `98a827e` |
| Chuyển từ VAT 10% sang **KCT — không chịu thuế** (`TSuat = -1`) | `d93a970` |
| Trang quản lý hoá đơn cho super admin + cảnh báo hoá đơn kẹt | `709cf0e` |

**Quyết định quan trọng còn hiệu lực:**
- Hoá đơn là **KCT (không chịu thuế)**, mã thuế suất `-1`, **không** phải 0%. Giá niêm yết là
  giá cuối, không cộng thêm 10%.
- Thông tin người mua (MST cho công ty / CCCD cho cá nhân) là **trường bắt buộc** — chốt theo
  form của đội aihanhchinh.
- Ký hiệu hoá đơn hết hạn theo năm dương lịch: `C26…` chỉ dùng cho 2026, **01/01/2027 phải đổi
  sang `C27…`**. Hai ký tự cuối do cơ quan thuế / Mắt Bão cấp, không tự suy ra được.

## Lưu trữ tệp

| Việc | Commit |
|---|---|
| Hạn mức dung lượng theo workspace, chốt chặn đĩa, giới hạn ký tự kiến thức AI | `4080460` |
| Hiển thị hạn mức + kiểm tra trước khi tải lên | `fbd6da3` |
| Gói tự chọn mua thêm dung lượng, suy ra hạn mức kiến thức AI | `635d075` |
| Thư viện media liệt kê + xoá được mọi tệp của workspace | `3017144` |
| Sửa rò rỉ dung lượng: tệp chat tải lên nhưng không gửi | `75360c7`, `9485d8a` |
| Bán lẻ dung lượng theo tháng + gói custom tới 1000 GB | `ef64453` |
| **Chuyển toàn bộ tệp từ đĩa VPS sang Google Cloud Storage** | `bfa949d`, `24a7566`, `76c3dda`, `e3d53a8` |

**Quyết định còn hiệu lực:**
- Giá bán lẻ **25.000đ/GB**, gói custom **15.000đ/GB**, trần 1000 GB. Giá vốn 500k/lô 50GB cố định.
- Lưu trữ chạy trên GCS (`STORAGE_BACKEND=gcs`, bucket `founderai-storage`, region
  `asia-southeast1`). Đĩa VPS chỉ còn giữ tệp `temp` chưa có `storage_key`.

**Hai bẫy triển khai đã gặp, đừng lặp lại:**
1. Script trong `backend/scripts/` phải có `import 'dotenv/config'` làm **import đầu tiên** —
   `database.js` đọc `process.env` ngay lúc nạp module, thiếu thì pool rơi về `127.0.0.1`.
2. **Không mount secrets dưới `/root`** — image `node:20-slim` để `/root` ở chmod 700 mà container
   chạy `USER node` (UID 1000) → EACCES. Mount vào `/app/secrets:ro`.

## Zalo

| Việc | Commit |
|---|---|
| Coi `msgId = 0` là chưa gửi được + cảnh báo tỉ lệ nuốt tin | `e8fbb69` |
| Chọn danh bạ bạn bè Zalo trong wizard chiến dịch | `13240a2` |
| Tự tạo template Zalo + tôn trọng số ngày người dùng chọn | `ed400e6` |
| Đồng bộ tên trường node tài khoản Zalo với canonicalizer | `4481531` |
| Ô tìm kiếm trong thẻ chọn nhóm Zalo | `f2aeee2` |
| Dọn listener + cache khi xoá tài khoản Zalo | `6d2dea5` |

## Trợ lý AI & Chatbot

| Việc | Commit |
|---|---|
| Giới hạn số lần trả lời theo bot + điều khiển trong studio | `23b5e81` |
| Hiện lý do chatbot bị tắt + tên tài khoản Zalo trong hộp thư | `e9a991a` |
| Sửa mất trạng thái giới hạn trả lời khi F5 | `996c98d`, `7e1859e`, `fd93637` |
| Chặn gợi ý kế hoạch nội dung lặp lại | `38ef924` |
| Bỏ bắt buộc bước template email/Zalo khi tạo chiến dịch qua trợ lý | `4e4ddef` |

## Thanh toán & Gói dịch vụ

| Việc | Commit |
|---|---|
| Voucher: chế độ khuyến mãi, mã riêng tư, khoá chế độ sau khi dùng | `1d7eb60`, `23590f7`, `63b243c` |
| Kích hoạt gói dùng thử trực tiếp, không qua trang thanh toán | `ee21189` |
| Đánh dấu **gói đang dùng** trên bảng giá + sửa gói custom | `d8799a3` |
| Thiết kế lại trang thanh toán thành 2 bước gọn trong 1 màn hình | `0d1357c`, `424eee4`, `dc370f3` |

## Trợ lý AI — nhóm tính năng nền

Nhóm này không map 1-1 với commit như các nhóm khác (thay đổi rải rác nhiều đợt), nên xác minh
bằng cách đối chiếu **vật thể code** mà plan hứa tạo ra.

| Việc | Bằng chứng trong code |
|---|---|
| Tách locale trợ lý + help nhạy cảm tiếng Anh | `backend/src/utils/assistantLocale.util.js` (`detectTextLocale`, `buildAssistantLanguageInstructions`), `isSensitiveHelpTopic` trong `helpAssistant.service.js` |
| Tư vấn gói bằng dữ liệu live | `backend/src/utils/planAdviceIntent.util.js` (`isPlanAdviceQuestion`) |
| Nối 2 não trợ lý (hết trả lời "không có tính năng") | `backend/src/services/ai/assistantCapabilities.js` |
| `LandingBrief` có cấu trúc cho wizard tạo landing | `backend/src/services/ai/landingBrief.service.js` + `landingBriefWiring.spec.js` |
| `CampaignBrief` có cấu trúc + field điều kiện | `backend/src/services/ai/campaignBrief.service.js` (`mergeCampaignBrief`), `computeWizardMeta`/`evaluateNextGate` trong `aiCampaignWizard.service.js` |
| Trả trợ lý về đúng năng lực + giữ tệp sau F5 | `routeQuestion`/`answerWithDocs` trong `helpAssistant.service.js`; `saveMessages(..., userFiles)` trong `aiSession.repository.js` |
| Chuẩn bị chiến dịch: tự tạo template, hỏi nguồn dữ liệu | `autoCreateEmailTemplates` (`ai.controller.js`), `buildDataSourceQuestion` (`campaignIntent.util.js`), `manualRecipients.util.js` |
| Chống lặp vô hạn + danh bạ bạn bè Zalo | `isMultiDaySeriesRequest` (`campaignQuickSend.util.js`), `assertAiCreditAvailable` (`aiCredit.middleware.js`), migration `142_zalo_friends.sql` |
| Hộp thư: bàn giao người thật, không đoán trạng thái tạm dừng | `buildAiPausePayload` (`aiHandoffResume.util.js`, dùng 3 chỗ trong `unifiedInbox.service.js`); `extractPauseState` ở FE thay cho `applySelfHandoffPause` đã xoá |
| Giám sát gửi tin: hiện lỗi cấp-run (pre-flight) | `runLevelErrors` trong `userDeliveryMonitor.service.js`, `classifyDeliveryMonitorFailure` dùng chung 2 service |

## Landing page & Marketplace

| Việc | Commit |
|---|---|
| Trường form thu lead cấu hình được + custom lead capture | `6e6bd34` |
| Tự gia hạn SSL cho tên miền riêng | `c561668` |
| Marketplace: thiết kế lại + sửa `campaigns.origin` | `2a5a5a2` |

## Trung tâm trợ giúp

| Việc | Commit |
|---|---|
| Dán Markdown do AI viết vào bài hướng dẫn không mất định dạng | `52bd947` |

Quy trình: soạn ý chính → nhờ AI viết Markdown → dán vào trang admin qua nút **"Dán Markdown"**
→ chèn ảnh chụp màn hình (nút Chèn ảnh hoặc Ctrl+V, tự upload qua `/api/uploads/help-image`).

**Bốn ràng buộc trong `miniMarkdownToHtml.js` — đừng gỡ, mỗi cái vá một lỗi thật:**

1. **Ảnh xử lý trước link** — `![alt](url)` cũng khớp regex link, đảo thứ tự là ra thẻ `<a>` sai.
2. **Escape cả `"` và `'` trước khi parse** — URL được nội suy vào thuộc tính, thiếu escape nháy
   kép thì `![x](" onerror=...)` tiêm được thuộc tính.
3. **Placeholder stashing** — cất `<a>/<img>/<code>` ra khỏi chuỗi trước khi chạy luật đậm/nghiêng.
   Không có nó thì gạch dưới trong URL vắt sang `target="_blank"` của chính thẻ vừa sinh, làm hỏng
   **mọi** link kiểu `/bao_cao`.
4. **Luật `_` tôn trọng ranh giới từ** (CommonMark §6.2) — để `snake_case` như `get_user_by_id`
   không biến thành chữ nghiêng.

Ba trong bốn lỗi trên cùng một họ: **quét regex tuần tự trên chuỗi đang dần thành HTML thì luật
sau va vào output của luật trước**. Nếu cần thêm cú pháp (danh sách lồng, footnote), cân nhắc
chuyển sang `marked` + `DOMPurify` thay vì mở rộng tiếp bộ regex tự viết.

**Editor:** phải giữ extension bảng của TipTap (`@tiptap/extension-table`). Thiếu nó thì
ProseMirror loại node ngoài schema — bảng hiện đúng lúc vừa chèn rồi **biến mất sau khi lưu và mở
lại**, không báo lỗi.

**Không làm (có chủ đích):** import PDF "giữ nguyên thiết kế". PDF chỉ có toạ độ chữ, muốn giữ
nguyên thì phải render mỗi trang thành ảnh → RAG mù, dịch tự động không đọc được, đọc trên điện
thoại rất tệ. Bài hướng dẫn phải là văn bản để `htmlToPlainText` còn index cho trợ lý AI.

## Hạ tầng & CI

| Việc | Commit |
|---|---|
| Chạy migration thành bước riêng, có khoá, bỏ giới hạn 30s | `0069cfc` |
| Cờ tính năng theo build cho Orders / Courses / Landing CMS / Products | `ac55398` |
| Sửa integration test làm cạn kết nối DB thử nghiệm | `70abc7e` |

---

## Việc còn treo (tính tới 18/08/2026)

- **19/08**: sao lưu rồi xoá `/root/uknow/backend/uploads` trên VPS (giữ `temp_uploads/`), sau đó
  bật lại bán lẻ dung lượng — `UPDATE topup_pricing SET is_active = TRUE WHERE item_key = 'storage_gb';`
- **Đổi mật khẩu tài khoản Mắt Bão** (mật khẩu mặc định đã lộ khi trao đổi).
- Tài khoản Mắt Bão hiện vẫn là **môi trường demo** (`demo-api-hddt.matbao.in`, MST
  `0302712571-999` là MST của chính Mắt Bão). Hoá đơn xuất ra đề Mắt Bão là người bán, **không có
  giá trị pháp lý**. Cần xin tài khoản production trước khi thu tiền thật có hoá đơn.
- Bộ integration test **chập chờn khi chạy song song** — đã thấy `marketplace.test.js` và
  `auth.test.js` đỏ giả rồi tự xanh khi chạy lại. Chạy riêng thì luôn pass. Chưa tìm nguồn.
