# Trợ lý hướng dẫn (RAG trên kho tài liệu) — quyết định kiến trúc

Tài liệu tham chiếu về trợ lý AI trả lời câu hỏi sử dụng sản phẩm, dựa trên kho bài
hướng dẫn. **Khác với chatbot của khách hàng** (xem
[chatbot-limits.md](./chatbot-limits.md)) — đây là trợ lý của chính Founder AI.

Rút từ plan đã ship tháng 08/2026: sửa trợ lý AI lặp mãi câu hỏi lại.

---

## 1. Hai tầng: định tuyến rồi mới trả lời

Mọi tin vào `/ai/chat` đi qua `tryHandleHelpChat` → `routeQuestion` phân loại câu hỏi
(`hỏi_đáp` / `ngoài_phạm_vi` / …), rồi mới tới nhánh trả lời.

**Bộ định tuyến trả rỗng là hỏng cả luồng.** Sự cố 08/2026: khách gõ ba tin khác nhau,
kể cả câu đính chính rõ ràng, đều nhận **cùng một câu hỏi lại** — không phải AI trả lời
sai, mà là bộ định tuyến trả về chuỗi rỗng nên rơi vào nhánh mặc định.

Khi gỡ lỗi loại này, kiểm bộ định tuyến trước, đừng sửa prompt trả lời.

## 2. Tắt thinking cho bước định tuyến

Bước định tuyến chỉ cần trả một nhãn ngắn. Để chế độ thinking mặc định thì output bị
cắt và lọt rác kiểu `"Q&A / How-to).\n5."`.

**Chỉ nâng `maxOutputTokens` là không đủ** — đo được: cap = 256 mà vẫn lọt rác. Phải
tắt thinking mới ổn định.

Nhưng **`thinkingBudget: 0` không đặt cứng cho mọi model được** — `gemini-2.5-pro` từ
chối thẳng. Phải có đường lui, vì super admin đổi model hệ thống bất cứ lúc nào qua
`PUT /admin/ai-models/system-model`.

Tham số `thinkingBudget` phải được **chuyển xuống tận request**. Sửa mỗi tầng gọi mà
tầng client không chuyển tiếp thì việc tắt thinking không có tác dụng nào cả.

## 3. Nhánh trả lời cần kho tài liệu đã index

Nhánh `hỏi_đáp` cần **bài hướng dẫn đã publish và đã tính vector**, với ngưỡng tương
đồng `minSimilarity = 0.45`. Kho rỗng hoặc chưa index thì khách nhận câu "chưa có
hướng dẫn chi tiết" — đúng hành vi, nhưng dễ bị hiểu nhầm là trợ lý hỏng.

Seed bài hướng dẫn là **upsert theo slug**
([`helpSeed.service.js`](../backend/src/services/help/helpSeed.service.js)) — bài đã có
thì ghi đè, không nhân đôi, và ảnh/video gắn tay vào bài vẫn còn.

> **Nạp lại bài luôn phải kèm tính lại vector.** Không thế thì trang hướng dẫn hiện
> nội dung mới còn trợ lý vẫn trả lời theo nội dung cũ — lỗi im lặng, rất khó nhận ra.

Tính vector **không trừ credit AI** của ai (chỉ tính khi AI sinh câu trả lời), nên chạy
lại bao nhiêu lần cũng được.

Câu hỏi không tìm được tài liệu được ghi vào `help_unanswered` để biết còn thiếu bài
nào. Câu `ngoài_phạm_vi` thì **không ghi** — nếu không, danh sách đầy câu hỏi thời tiết.

---

## Bẫy đã dính — đọc trước khi sửa phần này

- **Đừng chỉ nâng `maxOutputTokens` rồi coi là xong.** Phải tắt thinking mới ổn định.
- **Đừng đặt `thinkingBudget: 0` cứng cho mọi model** — có model từ chối thẳng, và model
  hệ thống đổi được bất cứ lúc nào.
- **Đừng sửa `utils/geminiClient.util.js`** khi định sửa trợ lý hướng dẫn — trùng tên
  hàm, khác file, khác caller.
- **Đừng đụng nhánh trả lời khi lỗi nằm ở bộ định tuyến.** Nhánh trả lời dùng
  `maxOutputTokens` riêng và không dính lỗi này.
- **Đừng viết cứng số bài seed vào test.** Đã đỏ một lần khi thêm hai bài hướng dẫn —
  đếm từ chính file seed.
