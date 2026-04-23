## Repositories Layer

Repositories chịu trách nhiệm truy cập dữ liệu (PostgreSQL), không chứa xử lý HTTP.

Nguyên tắc:
- Mỗi repository tập trung theo aggregate/module.
- Truy vấn SQL tập trung tại repository để tránh rải rác ở controller.
- Service sử dụng repository thay vì gọi `db.query` trực tiếp.

Gợi ý cấu trúc theo module:
- `repositories/campaign/*`
- `repositories/customer/*`
- `repositories/email/*`
- `repositories/uknow/*`
