## Backend Refactor Map

Mục tiêu: tách rõ `routes -> controllers -> services -> repositories -> utils` mà không đổi hành vi.

### Hiện trạng
- Route đã tương đối mỏng và bind tới controller methods.
- Nhiều controller lớn đang trộn:
  - xử lý HTTP
  - business logic
  - SQL truy cập dữ liệu
  - helper/formatting

### Đích cấu trúc
- `routes/`: định nghĩa endpoint + middleware + validation.
- `controllers/`: nhận `req/res`, validate input mức controller, mapping response.
- `services/`: orchestration nghiệp vụ, quy tắc domain, xử lý workflow.
- `repositories/`: truy vấn DB, mapping dữ liệu DB.
- `utils/`: helper thuần, không phụ thuộc HTTP.

### Ưu tiên tách module
1. `campaign`
2. `customer`
3. `uknow`
4. `emailSettings`

### Quy tắc an toàn khi tách
- Không đổi contract API hiện tại (payload, status code, message).
- Không đổi thứ tự xử lý nghiệp vụ.
- Tách theo từng cụm hàm nhỏ, chạy build/check sau mỗi phase.
