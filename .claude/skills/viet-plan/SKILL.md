---
name: viet-plan
description: Dùng khi viết plan triển khai cho Cursor/Codex trong repo UKNOW. Bắt buộc kiểm chứng mọi khẳng định về code hiện có trước khi đưa vào plan.
---

# Viết plan cho repo UKNOW

## Luật số 1 — không khẳng định về code hiện có mà chưa mở ra đọc

Mọi câu trong plan nói về code **đang tồn tại** phải kèm **`file:dòng`**.

Không trích được `file:dòng` thì chỉ có hai lựa chọn:
1. Mở file ra đọc rồi mới viết, hoặc
2. Ghi rõ **"GIẢ ĐỊNH — Cursor kiểm giúp"** thay vì viết như sự thật

Lý do luật này tồn tại: ngày 04/08/2026, ba plan liên tiếp bị Cursor bắt **15 lỗi**.
**Cả 15 đều là khẳng định về code chưa kiểm chứng** — không lỗi nào là sai về thiết kế
hay lập luận. Những đoạn có trích `file:dòng` thì đúng hết.

## Bốn câu bắt buộc tự hỏi

Trước khi nộp plan, soi lại từng câu dạng "dùng lại X", "giống Y", "đã có Z":

**1. Route này là trang thật hay chuyển hướng?**
`grep -n "path=\"<route>\"" frontend/src/App.jsx` — nhiều route là `<Navigate>`.
*(Đã sai: 4 route chatbot đều redirect về `/app/chatbot-studio`; `plan-and-billing`
không tồn tại.)*

**2. Bảng này thuộc phạm vi nào?**
Per-user hay toàn hệ thống? Dùng chung bảng cho hai mục đích khác nhau là nợ kỹ thuật.
*(Đã sai: định dùng `knowledge_bases` (per-user) cho tài liệu hệ thống; định mô phỏng
`custom_chatbot_chunks` — bảng đó dùng `embedding JSONB`, tra vector **không chạy**,
đã fallback keyword.)*

**3. Hàm "dùng lại được" đã mở ra đọc chưa?**
*(Đã sai: `checkZaloCapacity` không trừ phần đã dùng; `mapQuantitiesToPlanColumns` ghi
qty thô; `includedQty` vốn đã được hỗ trợ sẵn.)*

**4. Số migration tiếp theo là gì, và có phải mirror `bootstrap.sql` không?**
`ls backend/migrations | tail -3`. Migration thêm bảng/cột thì **bắt buộc** mirror sang
`backend/tests/integration/sql/bootstrap.sql`, nếu không integration test sẽ đỏ hoặc
xanh giả. CI có job `schema-sync-check` chặn việc này.

## Số liệu trong plan

Con số nghiệm thu phải **tính ra**, không ước lượng. Chạy thử bằng `node -e` với chính
hàm trong repo rồi dán kết quả vào plan.
*(Đã sai: số nghiệm thu tính theo tỷ lệ trong khi code dùng `Math.ceil` theo khối.)*

## Cấu trúc plan

1. **Bối cảnh** — vấn đề, kèm bằng chứng đo được nếu có
2. **Việc 1..N** — mỗi việc nói rõ file nào, làm gì, vì sao
3. **Nghiệm thu** — bảng tình huống → kỳ vọng, số cụ thể
4. **Bẫy cần tránh** — nêu cả cách sửa sai mà người ta dễ chọn

Sửa lại plan sau khi bị góp ý thì **ghi rõ chỗ nào bản trước sai**, đừng lặng lẽ sửa —
người đọc cần biết đừng tin bản cũ.

## Phạm vi một PR

Plan quá to thì implement ẩu. Cắt theo PR, PR đầu là phần nhỏ nhất chạy được đầu-cuối.
