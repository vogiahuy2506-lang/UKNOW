# Hướng dẫn sử dụng các Node Logic cho từng loại chiến dịch

> Tài liệu dành cho người dùng (admin / marketing / sales) khi thiết kế flow trong **Campaign Builder** (`/campaigns/...`).
> Tham chiếu code: `frontend/src/features/campaigns/components/NodeConfigModalLogicSection.jsx`,
> `frontend/src/features/campaigns/utils/campaignBuilderFlow.js`,
> `frontend/src/features/campaigns/components/CampaignBuilderFlowNodes.jsx`.

---

## 1. Tổng quan 3 node Logic

Cả 3 node thuộc nhóm **Logic** trên palette (nằm giữa cụm **Data/Zalo** và **Actions**):

| Node | Type | Viết tắt | Tác dụng chính |
|---|---|---|---|
| **Điều kiện** | `condition` | `cond` | Rẽ nhánh flow theo giá trị trường của từng contact — nhánh đúng tiếp tục, nhánh sai bị bỏ qua. |
| **Gắn tag** | `tag_contact` | `tag` | Thêm / xóa 1 tag cho tất cả contact lấy từ node nguồn đã chọn. |
| **Cập nhật thuộc tính** | `update_attribute` | `attr` | Set giá trị mới cho 1 trường cố định của tất cả contact lấy từ node nguồn. |

**Đặc điểm chung:**
- Cả 3 node đều khả dụng cho **mọi loại chiến dịch** (email, zalo cá nhân, zalo nhóm). Xem `isLogicNodeType` trong `campaignBuilderFlow.js`.
- Cả 3 node **phải nối edge từ ít nhất 1 node upstream** cung cấp contact (data node hoặc zalo node). Không có nguồn → dropdown chọn nguồn rỗng, runtime không có gì để xử lý.
- `tag_contact` và `update_attribute` chỉ áp dụng cho contact **đã tồn tại trong DB**. Nếu nguồn là sheet mới chưa từng có trong CRM, đặt `save_customer` **trước** node logic.

---

## 2. Chi tiết từng node

### 2.1 Điều kiện (`condition`)

**Cấu hình (`node.data.config`):**

| Trường | Bắt buộc | Ý nghĩa |
|---|---|---|
| `label` | – | Tên hiển thị trên canvas (mặc định `Điều kiện`). |
| `description` | – | Ghi chú cho người dùng; không ảnh hưởng runtime. |
| `matchMode` | ✅ | `all` (AND — tất cả rule đúng) hoặc `any` (OR — chỉ cần 1 rule đúng). |
| `rules[]` | ✅ | Danh sách rule kiểm tra. |
| `rules[].field` | ✅ | Tên trường contact cần so sánh — đúng tên cột trong node data upstream. |
| `rules[].operator` | ✅ | Một trong: `equals`, `not_equals`, `contains`, `not_contains`, `gt`, `gte`, `lt`, `lte`, `exists`, `empty`. |
| `rules[].value` | tùy operator | Giá trị so sánh; **bỏ trống** khi operator là `exists` / `empty`. |

**Cách hoạt động khi chạy:**

- Node `condition` luôn có **2 output edges**: một nhãn **"Đúng / Yes"** (true) và một nhãn **"Sai / No"** (false).
- Với mỗi contact chạy qua node, runtime kiểm tra tổ hợp rule theo `matchMode`:
  - **Khớp** → contact đi theo edge **Đúng**.
  - **Không khớp** → contact đi theo edge **Sai** (nếu không có edge Sai, contact kết thúc tại đây).

**Lưu ý quan trọng:**
- `field` phải khớp **chính xác** tên cột mà node data upstream tạo ra (vd: `email`, `tag`, `status`, `course`, `phone`).
- Ký tự đặc biệt trong `value`: nếu là chuỗi có khoảng trắng, **bao trong dấu nháy** khi viết rule (`"đã mua"`).
- `contains` / `not_contains`: so khớp chuỗi con (case-insensitive).
- `exists` / `empty`: bỏ qua `value`, chỉ kiểm tra trường có/không rỗng.

---

### 2.2 Gắn tag (`tag_contact`)

**Cấu hình (`node.data.config`):**

| Trường | Bắt buộc | Ý nghĩa |
|---|---|---|
| `label` | – | Tên hiển thị trên canvas. |
| `description` | – | Ghi chú. |
| `tagAction` | ✅ | `add` (thêm tag) hoặc `remove` (xoá tag). |
| `tagName` | ✅ | Tên tag. Slug không dấu, không khoảng trắng — vd: `lead-hot`, `vip`, `contacted-2026`. Phải trùng tag đã có trong CRM. |
| `tagSourceNodeId` | ✅ | Node upstream cung cấp contact. Dropdown chỉ liệt kê node nối trực tiếp phía trên. |

**Cách hoạt động khi chạy:**

- Runtime lấy danh sách contact từ `tagSourceNodeId` → lặp qua từng contact → gọi `customersService.addTag()` hoặc `removeTag()`.
- Node hoàn thành khi mọi contact được xử lý xong (không có nhánh Đúng/Sai; node này luôn đi tiếp theo 1 edge duy nhất).

**Khi nào dùng:**
- Phân nhóm khách sau hành động (vd: gắn `contacted-2026` sau khi gửi email).
- Phân luồng kết hợp `condition`: check `tag = lead-hot` rồi mới gửi offer riêng.
- Gỡ tag để reset nhóm trước khi vào campaign mới.

---

### 2.3 Cập nhật thuộc tính (`update_attribute`)

**Cấu hình (`node.data.config`):**

| Trường | Bắt buộc | Ý nghĩa |
|---|---|---|
| `label` | – | Tên hiển thị trên canvas. |
| `description` | – | Ghi chú. |
| `attributeField` | ✅ | Tên field contact cần set — vd: `lastContactedAt`, `score`, `status`, `course`, `notes`. |
| `attributeValue` | ✅ | Giá trị mới. **Cùng một giá trị cho mọi contact** — nếu mỗi contact 1 giá trị riêng, cần `read_sheet` rồi map. |
| `attributeSourceNodeId` | ✅ | Node upstream cung cấp contact. |

**Cách hoạt động khi chạy:**

- Runtime lấy danh sách contact từ `attributeSourceNodeId` → set `attributeField = attributeValue` cho từng contact.
- Node hoàn thành → flow tiếp tục theo edge duy nhất.

**Khi nào dùng:**
- Đánh dấu trạng thái đã xử lý (`status = contacted`, `score = +10`).
- Set deadline / hạn chót (`expireAt = 2026-12-31`).
- Lưu lại lịch sử (`lastAction = "campaign_xyz_2026_08"`).

**Lưu ý:**
- Giá trị gán là **literal** (text/số/ISO-date) — không hỗ trợ biểu thức hay template. Nếu cần giá trị động theo từng dòng, dùng `read_sheet` với cột sẵn giá trị rồi dẫn vào `update_attribute`.
- Field phải tồn tại trong schema contact của hệ thống — nhập sai tên sẽ báo lỗi runtime.

---

## 3. Ma trận khả dụng theo loại chiến dịch

Tham chiếu `getAllowedActionNodeTypesByCampaignType` + `getAllowedDataNodeTypesByCampaignType` (`campaignBuilderFlow.js`).

| Loại campaign | Action chính | Data / Zalo khả dụng | Logic khả dụng |
|---|---|---|---|
| **Email** (`email`) | `send_email` | `read_sheet`, `read_courses_db`, `read_products_db`, `read_interested_customers`, `read_landing_leads`, `save_customer` | ✅ Cả 3 |
| **Zalo cá nhân** (`zalo`) | `send_zalo_personal`, `send_zalo_friend_request` | Common data + `select_zalo_account`, `get_all_friends` | ✅ Cả 3 |
| **Zalo nhóm** (`zalo_group`) | `send_zalo_group` | `read_sheet`, `read_courses_db`, `read_products_db`, `read_landing_leads`, `save_customer` + `select_zalo_account`, `get_all_groups` | ✅ Cả 3 |

> Ghi chú: `read_interested_customers` chỉ khả dụng cho `email` và `zalo` cá nhân — không có trong nhóm Zalo. Đây là rule backend, palette sẽ tự ẩn node khi đổi loại campaign.

---

## 4. Mẫu flow cho từng loại chiến dịch

> Số thứ tự ở đầu mỗi node là gợi ý thực thi hiển thị trên palette
> (Triggers → Data → Logic → Actions, xem `NODE_ORDER_INDEX`).

### 4.1 Email — flow "Re-marketing khách đã từng mua khóa học"

```
[Khởi chạy]
   ↓
[Đọc dữ liệu khóa học]      ← node data, lấy danh sách khách đã từng mua
   ↓
[Điều kiện]                  ← check email tồn tại và chưa nhận email này 30 ngày
   ├─ Đúng → [Gửi Email]
   │            ↓
   │       [Gắn tag: contacted-2026]
   │            ↓
   │       [Cập nhật thuộc tính: lastContactedAt = hôm nay]
   │
   └─ Sai → kết thúc (không gửi)
```

**Cấu hình các node logic:**

- **Điều kiện**: `matchMode = all`, 2 rule:
  - `email exists`
  - `lastContactedAt empty` (chưa từng liên hệ) **hoặc** dùng `condition` với nhiều rule + `matchMode: any` (cách khác).
- **Gắn tag**: `tagAction = add`, `tagName = contacted-2026`, `tagSourceNodeId` = node `[Gửi Email]` (lấy ngược danh sách đã gửi thành công) hoặc `[Đọc dữ liệu khóa học]` tuỳ ngữ nghĩa mong muốn.
- **Cập nhật thuộc tính**: `attributeField = lastContactedAt`, `attributeValue = 2026-08-18`, `attributeSourceNodeId` = node upstream cung cấp contact.

---

### 4.2 Zalo cá nhân — flow "Kết bạn → nhắn tin theo nhóm khách"

```
[Khởi chạy]
   ↓
[Đọc dữ liệu landing page]   ← node data, danh sách lead mới
   ↓
[Lưu khách hàng]              ← insert lead mới vào DB trước khi tag
   ↓
[Gắn tag: lead-new]           ← đánh dấu vừa vào hệ thống
   ↓
[Điều kiện]                   ← chỉ xử lý ai có số điện thoại
   ├─ Đúng → [Gửi lời mời kết bạn Zalo]
   │            ↓
   │       [Gắn tag: sent-friend-request]
   │
   └─ Sai → kết thúc
```

**Cấu hình các node logic:**

- **Điều kiện**: `matchMode = all`, 1 rule:
  - `phone exists` (chỉ gửi kết bạn khi có SĐT).
- **Gắn tag (1)**: `tagAction = add`, `tagName = lead-new`, `tagSourceNodeId` = `[Lưu khách hàng]`.
- **Gắn tag (2)**: `tagAction = add`, `tagName = sent-friend-request`, `tagSourceNodeId` = `[Đọc dữ liệu landing page]` hoặc node phù hợp.

> Lưu ý: với Zalo cá nhân, có thể dùng `get_all_friends` thay cho sheet khi muốn chạy trên danh sách bạn bè của tài khoản Zalo. Khi đó, **node `select_zalo_account` phải được đặt trước** `get_all_friends` và **không nên** bật pool đa TK (xem `campaignFlowHasZaloPoolMulti`) — nếu pool bật, node `get_all_friends` bị ẩn trên palette.

---

### 4.3 Zalo nhóm — flow "Gửi tin quảng bá đến các nhóm đã chọn lọc"

```
[Khởi chạy]
   ↓
[Chọn tài khoản Zalo]        ← bắt buộc cho zalo_group
   ↓
[Lấy thông tin nhóm Zalo]    ← lấy nhóm từ tài khoản đã chọn
   ↓
[Điều kiện]                  ← lọc nhóm theo tiêu chí (vd: tên nhóm chứa "course")
   ├─ Đúng → [Gửi tin nhắn nhóm Zalo]
   │
   └─ Sai → kết thúc
```

**Cấu hình các node logic:**

- **Điều kiện**: `matchMode = any`, 1 rule:
  - `name contains "course"` — chỉ gửi nhóm có chữ "course" trong tên.
- Không cần `tag_contact` / `update_attribute` cho flow tối giản; nếu muốn đánh dấu nhóm đã gửi để tránh gửi lại lần sau, thêm `tag_contact` ngay sau action.

---

## 5. Mẹo & bẫy thường gặp

1. **Dropdown "Nguồn danh sách" rỗng**
   - Nguyên nhân: node `tag_contact` / `update_attribute` chưa nối edge từ node upstream nào.
   - Cách sửa: kéo edge từ node data upstream vào node logic. Dropdown sẽ tự động cập nhật.

2. **Logic không có tác dụng khi chạy**
   - Kiểm tra `tagSourceNodeId` / `attributeSourceNodeId` đã chọn đúng node — nếu để trống, runtime không biết xử lý trên danh sách nào.

3. **Tag không xuất hiện trên contact**
   - Tag phải tồn tại trong CRM (slug trùng với tag đã định nghĩa). Backend tự tạo tag nếu chưa có, nhưng tên phải khớp.

4. **Điều kiện lúc nào cũng đúng / sai**
   - Kiểm tra tên `field`: phải khớp **chính xác** tên cột của node data upstream (vd: dữ liệu từ `read_sheet` dùng tên cột trong sheet; từ `read_interested_customers` dùng field schema contact).
   - Với giá trị số (`gt` / `lt`), đảm bảo giá trị trong `value` là số thuần, không có ký tự lạ.

5. **Nhiều node logic nối tiếp**
   - Khi nối nhiều `tag_contact` / `update_attribute` liên tiếp, mỗi node vẫn cần 1 nguồn upstream — nối edge từ node logic trước sang node logic sau (qua intermediate node hoặc gián tiếp).
   - Nếu cần thao tác **cùng 1 danh sách** cho nhiều node logic, cân nhắc đặt node data ở đầu và mỗi node logic chọn cùng `sourceNodeId`.

6. **Đổi loại chiến dịch làm node biến mất khỏi palette**
   - Đây là behavior đúng (logic từ `getAllowedDataNodeTypesByCampaignType`). Ví dụ: chuyển từ `email` sang `zalo_group`, node `read_interested_customers` biến mất. Flow cũ vẫn giữ nguyên trên canvas nhưng nếu thiếu nguồn, lúc chạy sẽ lỗi.

7. **Điều kiện so sánh text có dấu**
   - `contains` / `not_contains` mặc định so sánh chuỗi con. Khi so tiếng Việt có dấu, đảm bảo data lưu cùng encoding (UTF-8) — UKNOW backend lưu thống nhất UTF-8 nên thường không vấn đề.

---

## 6. Checklist trước khi lưu flow

- [ ] Mỗi node logic đã có ít nhất 1 edge từ upstream cung cấp contact.
- [ ] Trường `field` của `condition` khớp tên cột upstream cung cấp.
- [ ] Operator phù hợp kiểu dữ liệu (`gt`/`lt` chỉ dùng cho số; `exists`/`empty` bỏ trống `value`).
- [ ] `tagName` ở dạng slug (không dấu, không khoảng trắng).
- [ ] `attributeField` tồn tại trong schema contact.
- [ ] Nếu dùng `get_all_friends`, không bật pool đa TK trên `select_zalo_account`.
- [ ] Test thử với 1 contact trước khi chạy hàng loạt.