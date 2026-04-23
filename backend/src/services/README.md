## Services Layer

Services chứa business logic thuần nghiệp vụ, không thao tác trực tiếp với `req`/`res`.

Nguyên tắc:
- Controller chỉ điều phối request/response và gọi service.
- Service gọi repository để lấy/lưu dữ liệu.
- Service không phụ thuộc Express.

Gợi ý cấu trúc theo module:
- `services/campaign/*`
- `services/customer/*`
- `services/email/*`
- `services/uknow/*`
