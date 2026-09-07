# Employee route policy matrix — P0/PR-1

Ngày: 2026-08-20  
Mục đích: checklist regression cho các route workspace nhạy cảm. Backend là lớp quyết định cuối cùng; sidebar và React route chỉ phản chiếu UX.

| Nhóm route | Policy employee | Ghi chú |
|---|---|---|
| Landing Page admin | `landing_pages` | Public renderer và lead capture không thuộc matrix này. |
| Customer, journey | `customers` | Read và mutation đều cùng key hiện hữu. |
| Email settings / test / direct send | `email_settings` | Gửi trực tiếp còn kiểm quota workspace. |
| Zalo settings / preview send | `zalo_settings` | Gửi preview còn kiểm quota workspace. |
| Email template | `email_templates` | |
| Zalo template | `zalo_templates` | |
| Template label | `email_templates` **hoặc** `zalo_templates` | Resource dùng chung, OR là chủ đích. |
| Campaign read / schedule read | `campaigns_view` | |
| Campaign create/update / schedule create-update-delete | `campaigns_create` | Bật hoặc đổi lịch đang bật cần thêm `campaigns_run`. |
| Campaign publish/pause/run | `campaigns_run` | |
| AI create/update campaign | `campaigns_create` | `autoRun` yêu cầu `campaigns_run` trước mutation. |
| AI create-and-run campaign | `campaigns_create` **và** `campaigns_run` | Cả route và controller đều enforce. |
| Landing AI generate/edit HTML | `landing_pages` | |
| Billing, top-up, employee, audit | self context | Không cấp qua checkbox. |
| Business Profile, Chatbot Studio, Inbox, Media, Landing featured/testimonial, Orders | self context | Owner-only tạm thời; sẽ tách quyền rõ ở PR-4/PR-5. |

## Checklist mỗi route mới

1. Khai báo policy backend: self context, permission, hoặc employee allowed có chú thích.
2. Với resource workspace, repository phải scope theo workspace owner (phần này thuộc PR-2+).
3. Mutation gửi/public/xóa phải có quyền side-effect riêng và quota/approval nếu áp dụng.
4. Sidebar và direct React route phản chiếu cùng policy.
5. Có test employee denied, employee allowed, owner self và cross-workspace khi resource đã hỗ trợ workspace scope.

