# Lịch sử tính năng — 19/08 → 11/09/2026

Tổng hợp các plan đã triển khai xong từ 19/08 tới 11/09/2026, kèm commit làm bằng chứng. Nối tiếp
`lich-su-tinh-nang-2026-08.md` (dừng ở 18/08).

Plan chi tiết nằm trong `_internal/` (không được git theo dõi). Khi tính năng lên `main`, plan được
tóm tắt vào đây rồi chuyển sang `_internal/archive/`. Cần chi tiết thì tra commit.

---

## Trợ lý AI tạo chiến dịch — từ vá lỗi tới compiler

### Wizard thu thập thông tin (24–25/08)

| Việc | Commit |
|---|---|
| Chọn tệp đính kèm, chọn sản phẩm, dán link Sheet ngay trong thẻ brief | `8b1c1c1f` `344f5324` `d4f30019` `d44b2b64` |
| Giữ nội dung tệp qua nhiều lượt chat trong `wizard_state` | `aabb63b4` |
| Luồng soạn chiến dịch sống sót qua tải lại trang; thẻ cổng đã trả lời không hiện chồng | `e5acb78f` `917fd52c` `e103520d` `83b73c8a` `77629951` |
| Nhận diện ý định qua router, thoát wizard ở mọi cổng, sửa vòng lặp lịch gửi | `0bcc9625` `9063fdff` |
| Lựa chọn wizard xuống đúng node; Zalo cá nhân bắt buộc có node tài khoản | `925d56ff` `c98beabc` |
| Chặn Sheet thiếu cột liên hệ ngay ở cổng; sheetName mặc định tab đầu | `10e95ccf` `ac9844ba` |
| Đợt A: chặn campaign rỗng ở tầng tạo và tầng chạy; sửa 4 chỗ hỏng im lặng | `ad264b35` `107c0727` |

### Intent compiler (30/08 → 06/09)

Code dựng cấu trúc campaign từ `CampaignIntentV1`, LLM chỉ viết nội dung. Di trú từng luồng bằng cờ.

| Giai đoạn | Commit |
|---|---|
| GĐ1 schema + shadow extraction + cảnh báo run fail | `7d49f4f4` |
| GĐ2 email, GĐ3 Zalo cá nhân + nhóm | `46b3e894` `672670f9` `0fb7e441` |
| Backtest trên toàn bộ campaign đã lưu, sửa 3 chỗ lệch | `9df17c4d` `e921bcb5` |
| Bật cờ theo luồng; sửa no-op im lặng ở call site | `f9a01ece` `83685511` |
| GĐ4 LLM slot filling | `de6ff146` `408300da` |
| Compiler chưa từng chạy 7 ngày vì truyền nhầm biến `intent` | `e110e12f` |
| 7A thước đo nội dung tất định | `f938aeb1` |
| Audit `via` phân biệt `ai` / `ai_compiler` / `ai_compiler_slot_filling` / `builder` | `f0ffc60f` `9332d019` |
| GĐ5 PR-1 (08/09): chứng minh 11 nhánh `[AI Patch]` no-op trên graph compiler (36 ca), bỏ qua khi `compilerApplied`; sửa 6 chỗ compiler lệch overlay (`landingLeadsSlugs`, `zaloGroupIds`, `zaloGroupSendMode`, `emailSenderId`, không `get_all_friends` cho zalo_contacts, không nhúng `zaloRecipientPhones`); xoá shadow extraction | `bcde6ccd` `1f972bda` `3f4ce8a4` `6bb3e7c5` |

**Trạng thái production**: `COMPILER_ENABLED_FLOWS=zalo_group,email`, `COMPILER_SLOT_FILLING_FLOWS=zalo_group`.
Nghiệm thu bằng sự kiện thật 06/09: chiến dịch 356 có `audit_logs.details->>'via' = 'ai_compiler_slot_filling'`.
GĐ5 đã scope lại thành 4 PR (`PLAN_COMPILER_GD5_DON_DEP_2026-09-08.md`); PR-2 (bật cờ cho Zalo cá
nhân, gỡ patch) chờ đủ **7 ngày log không có deploy backend** để đo, mốc tính lại sau mỗi lần deploy
vì container mới xoá `docker logs`. *(Sửa 08/09: bản trước ghi "chỉ còn một `[AI Patch]` là chuỗi
log" — sai, viết theo trí nhớ. Đếm thật: `grep -c "\[AI Patch\]" aiCampaignDraft.service.js` = 11,
cả 11 nhánh vá vẫn chạy trên script LLM cũ ở `aiCampaign.service.js:1685` trước khi compiler ghi đè.)*

### Gửi kèm tệp, biến template, gửi nhanh

| Việc | Commit |
|---|---|
| Gửi kèm tệp: wizard hỏi cách dùng, intent mang tệp, compiler đặt vào bước | `1437fc97` `d75a0c9a` |
| Thôi gửi thô `{{full_name}}` tới khách, cả backend lẫn builder chạy trong trình duyệt | `4dddf765` `2f3cbfaf` |
| Nhập tay SĐT ở cổng wizard, chuẩn hoá SĐT Việt Nam, cổng gửi nhanh | `7e313213` `df1e5b82` `149505e7` |
| Gửi nhanh có đính kèm | `11bcb73b` |
| Gửi nhanh cho Zalo UID: chọn từ danh bạ, đối chiếu tên thật, không hiện UID trần | `67a7933a` `402f67f2` `3673bbb6` `f1acf558` `271bffb8` `57399ebb` |
| Sinh landing trong chat đi qua cùng service với nút tạo; đọc `finishReason` | `442f0770` |
| Wizard đóng luồng khi chiến dịch đã tạo: tin ranh giới `campaign_created` do server lưu, ba nơi suy trạng thái đều reset | `88b6ff53` |
| Wizard PR-2 (08/09): huỷ luồng dùng cùng cơ chế ranh giới (`campaign_abandoned`), không giữ mốc chỉ số tin nhắn | `10c83e62` `035ddd8f` |
| Gửi nhanh PR-2 (08/09): kênh Zalo nhóm — `sendGroupMessage`, trang đích, cổng wizard; đọc `items[].status` vì backend trả 200 kèm từng dòng `failed` (Bẫy 7) | `1d7c2b03` `2b4fda48` `cb5f3b60` `c6544e2f` `9545b15d` |

**Quyết định còn hiệu lực**
- Ranh giới vòng đời wizard là **một tin nhắn trong lịch sử**, không phải mốc chỉ số tin nhắn.
  `stripWizardCards` làm chỉ số trượt, và mốc `abandonedAtMessageCount` bị xoá ngay lượt kích hoạt lại.
- Nghiệm thu tính năng AI bằng **sự kiện production** (audit `via`, log), không bằng test xanh.
  Hai lần "chưa đạt" của GĐ4 đều là lỗi đo, không phải lỗi tính năng.

---

## Zalo cá nhân — trạng thái tài khoản

| Việc | Commit |
|---|---|
| Phát hiện websocket chết thay vì tin "có api là còn sống" | `1829785d` |
| Danh bạ Zalo: hai cột không tồn tại, lặp vô hạn, mất con trỏ | `66ed9365` `2a00c2c5` |
| `disconnected` thôi là trạng thái không có đường ra; script cứu hộ | `688cadd2` `e799dc45` `3c2dcbb4` `c11cf681` `1942b9f8` |
| Trang quản lý Zalo của admin hết timeout: bỏ đăng nhập lại khỏi đường đọc | `5cc1981a` |
| Không ghi `connected` khi restore cookie trả `null` | `8dff873f` |

**Cơ chế còn hiệu lực**: `recordRestoreFailure` chuyển `needs_reauth` khi **≥5 lần fail và mốc fail đầu
≥60 phút**. Trước `8dff873f`, cron 15 phút xoá cửa sổ này mỗi lượt nên 32 tài khoản cookie chết kẹt
`connected` giả, ~1.600 lượt đăng nhập Zalo mỗi giờ từ một IP. Sau sửa, cả 32 chuyển `needs_reauth`
đúng 60 phút và số đăng nhập về 0.

---

## Gói cước, thanh toán, hoá đơn

| Việc | Commit |
|---|---|
| Đổi gói: hẹn đổi cuối kỳ, ma trận nút giá, chu kỳ 30 ngày từ ngày kích hoạt, khoá tài nguyên vượt hạn mức + ân hạn 7 ngày | `21948113` `faaf822c` `dab53025` |
| Hoá đơn PR-A→E: tên người mua, dòng gói, giờ thanh toán thật, bắt buộc mã gói, gán gói số lượng, cổng email hoá đơn | `f05aba73` `6e2f0b15` `bb222c1a` `a9f1f089` `d53c6a17` |
| Không bắt buộc nhập hoá đơn; khách không lấy vẫn xuất "Bán cho người tiêu dùng", không gửi email | `7b90a3b3` |
| Sửa mốc chu kỳ billing, serialize checkout | `a3a2183c` |
| Dùng thử 14 ngày, cấp trong transaction | `fc7b9af0` |
| Gỡ email kèm giải phóng lịch sử dùng thử | `c4aa2c96` |
| Quota atomic PR-Q1→Q4c: quyết định gửi trong transaction, idempotency key cho gửi nhanh/preview/inbox, campaign Email + Zalo dùng reservation | `20ae3fc2` `048ef34b` `ce55f37e` `9311e593` |
| Hoa hồng giới thiệu PR-A1→A5 (xem `hoa-hong-gioi-thieu.md`) | `26cb7c66` `bcc843d1` `705593fe` `e69bb892` `deeba75e` `50c05cd2` |

---

## Nhân viên và quyền

| Việc | Commit |
|---|---|
| Mở rộng quyền nhân viên PR-5→8: chatbot, inbox, thư viện media, hạn mức, luồng duyệt | `f15fb05f` |
| Duyệt campaign + dọn dẹp | `f85e2780` |

Checklist regression cho route nhạy cảm: `employee-route-policy-matrix.md`.

---

## Landing page và lead

| Việc | Commit |
|---|---|
| AI sửa trang tại chỗ thay vì tạo lại; nút hoàn tác, cảnh báo ghi đè | `17664e53` `9e98c22d` `d503f002` |
| CORS cho `/api/public/leads`, tôn trọng `onsubmit` của chủ trang | `f7042790` `a1a5ad66` |
| Tự đồng bộ lead sang Google Sheets qua webhook GAS | `077b1a92` |
| Canvas editor có preview trực tiếp và chat AI | `dc78ef68` |
| Script `founderai-capture.js`: form AI vẽ theo hợp đồng `data-founderai-capture` + `name/email/phone/cf_*` | `77d1673a` `9ad8a94d` `44f90957` |
| Route `/embed/lead-form` khôi phục làm lớp tương thích cho trang cũ (deprecated) | `e92e49e9` |

**Nghị định 330/2026 — đồng ý dữ liệu cá nhân** (PR-N1→N5, 05–07/09)

| Việc | Commit |
|---|---|
| Đồng ý marketing 3 trạng thái true/false/null; form nhúng mặc định bỏ trống, từ chối vẫn gửi được | `b5a8d065` `18d068b0` `4a17d6f4` |
| Lưu bằng chứng đồng ý điều khoản lúc đăng ký; xin đồng ý bổ sung cho user cũ; lịch sử đồng ý | `9de71389` `1f085bf1` |
| Đường rút lại đồng ý cho lead; nguồn đồng ý cho khách hàng | `e6ad563c` |
| Thời hạn lưu và dọn dữ liệu cũ, bảo vệ chứng từ kế toán | `4360c0fc` `4a411ea1` |
| Minh bạch thu thập dữ liệu, mục đích lưu IP | `910296b9` `3933348e` |

**Quyết định còn hiệu lực**
- Ô đồng ý marketing **mặc định bỏ trống** và **không bắt buộc**. `null` nghĩa là "chưa hỏi", không được
  gửi marketing; `false` là "đã hỏi, từ chối".
- Form landing theo hướng **form của AI, dữ liệu của hệ thống**: AI vẽ form đúng hợp đồng, script hệ
  thống bắt submit. Iframe chỉ còn là dự phòng cho trang cũ; gỡ sau khi các trang đó được lưu lại.

**Form landing: bắt lead và trường thêm** (08–09/09, plan `PLAN_FORM_LANDING_AI_GIU_FORM_2026-09-06.md`
và `PLAN_LEAD_FORM_TRUONG_THEM_2026-09-08.md`)

| Việc | Commit |
|---|---|
| PR-2a: `founderai-capture.js` chỉ bắt form có email/SĐT; sửa `inferAutoName` map nhầm SĐT thành tên; thôi tự sinh `cf_<id>`; chỉ strip iframe khi trang đã có form khác; guard AI-edit giữ `data-founderai-capture` | `df078207` `8e23dcee` `8fb28387` `56a0f681` `3f9cfb5f` |
| PR-2b: AI sinh select `occupation`/`interestArea` theo cấu hình; capture gửi hai trường này top-level; khoá `cf_*` lạ bị bỏ qua thay vì mất cả lead | `89d925e3` `9e213b32` `3ed741ba` `b7022fa4` |
| PR-2d-1: khôi phục schema đầy đủ `landingLeadFormConfig.js` (bản tối giản của `3c514bc8` làm "mỗi lần lưu là một lần xoá"); backend áp dụng nháp AI thành khoá tất định `cf_sugg_NN_text`; test vòng tròn GET→normalize→prepare | `b8b9725c` `fdfb56cc` `14204724` `5fe0e260` `36efec39` |
| PR-2d-2: `LeadFormConfigPanel` trở lại trong `SettingsModal` section "Form đăng ký"; lỗi bất biến kiểu/mã option hiện đúng vùng | `67d0e8aa` `e16117bf` `4f9dae2c` `09cc1509` |
| PR-2d-3: prompt sinh trang ra ô cho từng `customFields` (422 nếu thiếu); rule 2b cho phép AI thêm trường vào form có sẵn; panel cảnh báo "trang chưa có ô" + nút "Nhờ AI thêm ô này" | `ff2286b2` `3a2c587e` `44406150` `6fe955b3` `47e60611` |

Nghiệm thu thật trên production 09/09: PR-2d-1 SQL `jsonb_array_length(customFields) = 2` sau hai lần
lưu; PR-2d-2 năm trường với select `opt_a,opt_1,opt_2`, kiểu bị khoá sau khi lưu; PR-2d-3 bước 1–2
đạt, bước 3 bắt được lỗi thật (dòng cuối bảng dưới).

Lỗi có sẵn lộ ra dọc đường nghiệm thu, đều sửa cùng ngày:

| Lỗi | Commit |
|---|---|
| `productId` do LLM viết không phải id số → 400 khi tạo trang; rơi về `other` | `c7b6511d` |
| Nút "Để sau" của modal bổ sung SĐT bị commit dọn lint `1a992e76` xoá mất; khôi phục cả hai mount | `8fedb8b1` `c17d4596` |
| Chốt "AI sinh không đạt" trả 502 bị Cloudflare thay bằng trang lỗi riêng, message mất; đổi 422 | `a3125f47` |
| Không gõ được dấu cách trong nhãn trường thêm vì normalizer trim mỗi phím; trim lúc lưu | `dc1d956f` |
| Danh sách lead hiện `[object Object]` ở cột Thông tin thêm | `9ef3a89b` |
| Model trả JSON hỏng, fallback vớt HTML còn nguyên `\n` `\"`; giải mã bằng `JSON.parse`, không được thì 422 | `731f63d5` |
| "Nhờ AI thêm ô này" chỉ đưa nhãn lựa chọn, AI ghi `<option value="Lựa chọn 1">` thay mã `opt_a` → mọi lead bị từ chối; câu lệnh kèm markup đúng mã, panel cảnh báo mức 2 "không khớp mã", backend 422 ở đường sinh | `ce7c7e23` `a3eb89d0` |

**Quyết định còn hiệu lực**
- Khoá và mã option của trường thêm là **hợp đồng với AI**: mọi câu lệnh sinh/sửa form phải chứa
  nguyên khối markup có `value="<mã>"`, không bao giờ chỉ đưa nhãn. Kiểm sau sinh phải kiểm cả mã,
  không chỉ `name`.
- Chốt chặn AI ở backend trả **422**, không 502: Cloudflare nuốt 502/504 của origin.
- Nghiệm thu form bằng **lead thật gửi từ trang public**, không bằng "panel hết cảnh báo".

---

## Hạ tầng, CI, kiểm thử

| Việc | Commit |
|---|---|
| `bootstrap.sql` thêm 23 bảng thiếu, đạt 100% parity tên cột với production; chốt chặn schema hai chiều | `0cb74a98` `b591c974` `3a21b66c` |
| Migration runner: lock timeout, checksum, kiểm lúc khởi động | `f83798b6` `4825c75a` |
| Tối ưu pipeline deploy, shard integration, chạy lint + test khi push thẳng `main`, báo động deploy đỏ | `09aa1192` `1082ddce` `81244d09` |
| Caching: vá rò quota hero, cách ly memory cache, key embedding | `d82943b7` |
| Chatbot debounce 6 giây, cửa sổ tối đa 10 giây | `8ec0bee1` `67e1ba87` |
| Hoàn tất di trú GCS cho promote và cron đối soát | `ffd539aa` |
| Hiện trạng thái chờ SMTP rate-limit lên UI, lưu nguyên văn phản hồi | `1d392eb8` |
| Báo cáo AI hằng ngày, lịch sử landing page | `a8de697f` |
| Ảnh chụp tự động cho bài hướng dẫn (hết lô 24/08) | `3b9d40ac` … `9f8ea588` |
| Render link trong chat, vá XSS trang chat công khai, chặn kích hoạt gói không có mã | `a99cc994` |

**Lưu ý vận hành đã rút ra**
- Chỉ chạy **một** bộ integration tại một thời điểm trên Postgres `:5433`. Ba agent chạy chồng nhau
  07/09 sinh 161 lỗi giả.
- Nhiều agent dùng chung một working tree: `git fetch` và xem `origin/main..HEAD` trước mọi lần push.
- `schema.sql` lệch production ở cả **kiểu cột**, không chỉ tên: `zalo_settings.last_connected_at` là
  timestamp naive trên production dù file khai `TIMESTAMPTZ`.
- `docker logs` của backend **mất sau mỗi deploy** vì container tạo mới; đo gì bằng log thì kiểm
  `docker inspect .Created` trước, số bền lấy từ DB.
- Traffic `/api` production đi thẳng Cloudflare → cổng `5001`, không qua nginx của frontend; trần
  timeout thật là 100 giây của Cloudflare. Không tự bind 5001 về localhost.
- Workflow deploy có chốt "stale": commit mới hơn đổi backend là run cũ tự huỷ (09/09 `a3eb89d0` bị
  `401f1bd6` vượt). Đây là cố ý, không phải lỗi code.

---

## Hết hạn mức thì phải DỪNG, không được đốt sạch danh sách (10–11/09)

Hai run của một tài khoản sinh **25.165 lượt thất bại / 0 thành công trong 4 ngày**, có lúc quét
5.908 lượt/giờ và chạy xuyên khung giờ yên lặng 23:00–06:00. Nguyên nhân: gói dịch vụ hết hạn →
`checkSendQuota` trả `resetAt: null` → lỗi ném ra bị các catch theo từng người nhận đếm thành
"thất bại" rồi `continue`, nên vòng lặp **không bao giờ chạm tới cổng nhịp** và quét danh sách ở
tốc độ tối đa. Cùng một lỗi hoá ra nằm ở **ba cơ chế hạn mức khác nhau**, phải vá cả ba.

| Việc | Commit |
|---|---|
| PR-1: lỗi hạn mức không tự reset được phải đóng sổ `failed` rồi ném `RUN_STOPPED` | `273bed44` |
| PR-1b: kênh email đi qua `reserveSendQuota` riêng — cùng lỗi, cơ chế khác | `326e38a2` |
| PR-1c: cổng reservation Zalo — cơ chế thứ ba, `PLAN_SEND_LIMIT_EXCEEDED` không ai đọc | `ba720f35` |
| PR-2: kênh kết bạn tuân cooldown tra số; nghỉ tới **00:00 giờ VN** thay vì 3 giờ cố định | `95a3a6f5` `41ea8b18` |
| PR-2b: cooldown ghi xuống `zalo_settings`, nạp lại lúc khởi động (migration 202) | `93ba1671` |
| PR-3: cột `zalo_messages.status` nói thật; một điểm đóng sổ duy nhất cho placeholder bỏ lại | `936c42b8` |
| Fixture schema thiếu `admin_menu_layouts` làm deploy backend đỏ hai lần liên tiếp | `3ba5c173` |

Nghiệm thu bằng sự kiện production, không nhận "test xanh":

- **PR-1b** — run 403: `failed`, `failed_sends=0`, `error_message` có câu hạn mức. Trước vá, run 401
  cùng chiến dịch kết thúc `completed` với 3 lượt thất bại và `error_message` rỗng.
- **PR-2** — log 11/09 13:36:38: `channel=zalo_friend_request … cooldown đến 00:00 12/09`, tức 10,39
  giờ. Luật cũ sẽ quay lại lúc 16:36 cùng ngày, khi Zalo vẫn đang chặn. Dòng log này trước PR-2
  không thể tồn tại vì nhánh kết bạn chưa bao giờ **đặt** cooldown, chỉ **đọc**.
- **PR-3** — dọn 61.649 dòng lệch cột `status` + 6.926 placeholder mồ côi → còn **0** dòng `queued`.

Hai bài học đắt hơn cả bản vá:

- **Nhãn `invalid_format` không phải phép kiểm định dạng** — nó chỉ bắt chữ "không hợp lệ"/"invalid"
  trong câu Zalo trả về. Chẩn đoán ban đầu "danh sách bẩn 89%" là sai: đo thẳng Google Sheet nguồn
  ra **94,4% số đúng định dạng**, bảng `customers` 99,6%.
- **Hạn mức tra số của Zalo tính theo NGÀY, reset lúc nửa đêm** — đọc được nguyên văn trong
  `campaign_executions.error_message`. Điều này giải thích luôn khoảng bị chặn ~15 giờ đo được
  trước đó: đúng bằng khoảng từ 09:00 tới 00:00 hôm sau.

---

## Việc còn treo (tính tới 11/09/2026)

- **Nghiệm thu PR-3** sau 2–3 ngày: đếm dòng `zalo_messages` còn `tracking_metadata->>'status' =
  'queued'` theo ngày, phải về 0 (trước vá là 200–350 dòng/tuần). Dấu hiệu sớm tốt: 0 dòng mới
  trong giờ đầu sau deploy.
- **Nghiệm thu PR-2b**: chờ lần cooldown đầu tiên được ghi vào `zalo_settings.phone_lookup_cooldown_until`,
  rồi restart container và xem log có `Đã nạp N cooldown tra số Zalo còn hiệu lực`.
- **39 tài khoản Zalo ở trạng thái `needs_reauth`** (33 không thuộc tài khoản nội bộ), gồm cụm 31 cái
  hỏng cùng ngày 06/09. Quy tắc cảnh báo `zalo_disconnected` **cố ý loại** trạng thái này và không có
  quy tắc nào khác phủ, nên không ai được báo. Chưa gây hỏng vì không chiến dịch nào đang dùng chúng.
  Cần: báo chủ tài khoản đăng nhập lại, và quyết định có đưa `needs_reauth` vào quy tắc hay không.
- **Hai run Zalo của tài khoản nội bộ (374, 381) vẫn `running`**, 0 thành công sau 5 ngày. Chỉ chủ
  tài khoản dừng được.
- **`401f1bd6` (WhatsApp Baileys, hoangphuc1capri) làm đỏ cả hai deploy**, production kẹt ở `731f63d5`:
  `bootstrap.sql:1819-1824` dùng `CONSTRAINT ... UNIQUE ... WHERE` (không tồn tại trong Postgres, migration
  194 viết đúng bằng partial unique index); `WhatsAppSettings.jsx:1` thừa `eslint-disable`; và thư mục
  phiên đăng nhập WhatsApp bị commit nhầm — phải bỏ theo dõi, thêm `.gitignore`, và chủ tài khoản gỡ
  thiết bị liên kết trong WhatsApp vì xoá khỏi git không thu hồi được lịch sử.
- **Nghiệm thu PR-2d-3 bước 3–4** chờ deploy: trang `slug-test` phải hiện "không khớp mã" → nhờ AI sửa
  → lead thật có `lươngthưởng: <nhãn>`; trang mới qua chat có sẵn `cf_sugg_01_text`/`cf_sugg_02_text`.
  Xong thì gỡ publish `slug-test` (đang public với lead giả).
- **Báo hoangphuc1capri** ba quyết định đã đổi trong `founderai-capture.js` (auto mode, bỏ `cf_<id>`,
  strip iframe có điều kiện), section "Form đăng ký" mới trong `SettingsModal`, và việc commit dọn lint
  `1a992e76` đã xoá nút "Để sau" của modal SĐT.
- **Gửi nhanh PR-3 (kết bạn)**: hỏi có ai cần trước khi làm.
- **Landing**: lộ trình gỡ iframe dựa trên số trang còn `/embed/lead-form` (7 trang, user 1/39/76/143/156);
  các service AI khác (`customChat`, `aiActivity`, `geminiClient`, `aiModelCatalog`) vẫn trả 502 bị
  Cloudflare nuốt; lỗi 520 lúc 08:07 09/09 chưa rõ nguyên nhân, plan đo thời gian sinh và sinh bất đồng
  bộ ở `PLAN_LANDING_SINH_BAT_DONG_BO_2026-09-09.md`.
- **Compiler GĐ5 PR-2→4**: chờ 7 ngày log liên tục, mốc tính lại từ lần deploy backend gần nhất.
- **Bắt bounce bất đồng bộ**: chặn ở phép thử SMTP có tôn trọng `envelope.from` không.
- Backend unit có 2 test trong một suite đỏ lẻ tẻ (hai lần trong hai ngày, chạy lại xanh), chưa bắt
  được tên suite.
- Token Cloudflare thiếu quyền Cache Purge (đã xác minh lỗi `10000`), sửa trên dashboard.
- Báo động deploy đỏ chưa tới người vận hành; 07/09 có 3 lần deploy đỏ không ai biết.
- Lỗi cron restore đếm kết quả bị lock thành "đã khôi phục" trong `cron_job_runs`.
- Ops ngoài hệ thống: GA4 measurement id, UptimeRobot (`_internal/Todo.md`).
- Còn lại từ danh sách 21/08 và master todo tháng 8, đều là quyết định hoặc vận hành, không phải
  code: modal gói dùng thử khi đăng ký bằng Google (P2-1, cần test trình duyệt); `mv uploads` trên
  VPS rồi bật bán lẻ dung lượng; nhập bảng giá theo kênh vào `/admin/plans`; chốt cột `stackable`
  của voucher (bỏ hay làm cho chạy); bài trợ giúp "Liên hệ hỗ trợ"; ETA và nút gửi thử ở Gửi nhanh.
- Nợ bảo mật P2-5 (chỉ hiển thị): `usageTracking.service.js` tính phần trăm 0 khi `limit = 0`,
  màn hạn mức hiện 0% thay vì "đã hết". Đường chặn gửi đã đúng, không ảnh hưởng thu tiền.
- Gửi nhanh cho Zalo nhóm: thẻ xác nhận chỉ mở nút cho `email` và `zalo_personal`, chọn Zalo nhóm
  gửi một lần vẫn tạo chiến dịch. Là PR-2 của `PLAN_GUI_NHANH_MOI_KENH_2026-09-04.md`.
