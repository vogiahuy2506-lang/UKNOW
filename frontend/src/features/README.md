## Frontend Feature Boundaries

Mục tiêu: đưa các `pages` về vai trò page-shell/composition, tránh chứa logic API và xử lý state phức tạp.

### Quy ước theo feature

- `features/<feature>/services/*`: chứa API calls (qua `src/services/api.js`) và mapping request/response.
- `features/<feature>/hooks/*`: chứa state + side effects + orchestration flow.
- `features/<feature>/utils/*`: pure helpers, không side effects.
- `features/<feature>/components/*`: UI/presentation components.

### Vai trò `pages/*`

- Chỉ compose layout và gọi hooks/service đã chuẩn hoá.
- Không nhúng business logic lớn trực tiếp trong JSX.
- Không gọi API trực tiếp nếu đã có feature service tương ứng.

### Giai đoạn refactor hiện tại

- Đã tạo feature service layer cho:
  - `campaigns`
  - `customers`
  - `templates`
- Các page hiện hữu sẽ migrate dần sang service/hook theo từng task tiếp theo trong `TODOLIST`.
