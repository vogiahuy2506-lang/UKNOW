/**
 * Seed 9 Nhóm-1 help articles (Vietnamese).
 * Embeddings are created via reindexArticle when published — call seedHelpArticles() after migration.
 */
export const HELP_SEED_ARTICLES = [
  {
    slug: 'getting-started',
    feature_key: 'getting-started',
    primary_route: '/app',
    sort_order: 5,
    title: 'Bắt đầu với Founder AI — 4 bước',
    summary: 'Người mới bắt đầu từ đâu: khai báo hồ sơ, kết nối kênh gửi, gửi thử, rồi tạo chiến dịch đầu tiên.',
    body_md: `# Bắt đầu với Founder AI — 4 bước
Mới tạo tài khoản và chưa biết làm gì trước? Làm đúng 4 bước dưới đây là gửi được tin đầu tiên. Mỗi bước có bài hướng dẫn riêng nếu bạn cần chi tiết.

## Bước 1 — Khai báo hồ sơ doanh nghiệp
Vào [/app/settings/ai-profile](/app/settings/ai-profile), điền tên doanh nghiệp, sản phẩm, đối tượng khách và giọng điệu muốn dùng.

Làm bước này trước vì trợ lý AI lấy hồ sơ làm ngữ cảnh. Bỏ qua thì mọi nội dung AI viết ra đều chung chung, không nhắc đúng tên sản phẩm của bạn.

→ Chi tiết: [Hồ sơ doanh nghiệp](ai-profile)

## Bước 2 — Kết nối kênh gửi
Vào [/app/settings/channels](/app/settings/channels), thêm ít nhất **một** kênh:
- **Email**: khai báo SMTP hoặc SendGrid, gửi thử một email để chắc chắn chạy.
- **Zalo**: quét QR đăng nhập, đợi trạng thái hiện **connected**.

Chưa có kênh nào kết nối thì các bước sau đều bị khoá — hệ thống không có gì để gửi đi.

→ Chi tiết: [Kết nối kênh gửi](channels) · [Thêm tài khoản Email](email-account) · [Thêm tài khoản Zalo](zalo-account)

## Bước 3 — Gửi thử bằng Gửi nhanh
Vào [/app/quick-send](/app/quick-send), chọn kênh vừa kết nối, gửi thử cho **chính số/email của bạn**.

Đừng bỏ qua bước này. Gửi thử mất 2 phút và cho biết ngay kênh đã chạy thật hay chưa — phát hiện lỗi ở đây rẻ hơn nhiều so với phát hiện lúc chiến dịch đã chạy được nửa danh sách.

→ Chi tiết: [Gửi nhanh](quick-send)

## Bước 4 — Tạo chiến dịch đầu tiên
Vào [/app/campaigns/new](/app/campaigns/new), dựng luồng gửi: lấy dữ liệu khách → gửi email hoặc Zalo → kết thúc. Lưu rồi chạy ngay hoặc hẹn lịch.

Nếu chưa quen builder, gõ cho trợ lý AI một câu kiểu "tạo giúp tôi chiến dịch giới thiệu sản phẩm mới cho khách cũ" — trợ lý dựng nháp để bạn sửa lại.

→ Chi tiết: [Tạo chiến dịch](campaign-create)

## Sau 4 bước thì làm gì
- Xem hạn mức còn lại và lịch sử đơn tại [/app/billing](/app/billing).
- Sắp hết tin/email/lượt AI thì mua thêm — xem [Gói dịch vụ & thanh toán](plan-and-billing).
- Thắc mắc về tiền bạc, hoá đơn: [Câu hỏi thường gặp về thanh toán](faq-billing).

## Lỗi thường gặp khi mới bắt đầu
- **Không thấy trang Hồ sơ AI hay Mua thêm** → hai trang này chỉ chủ tài khoản vào được, nhân viên không thấy.
- **Zalo gửi không đi vào buổi tối** → hệ thống không gửi Zalo từ 23:00 đến 06:00 để tránh bị đánh dấu spam. Đợi sáng hôm sau, chiến dịch tự chạy tiếp.
- **Zalo gửi rất chậm** → đúng như thiết kế, mỗi tin cách nhau hơn một phút để tài khoản không bị khoá. Danh sách lớn cần vài giờ.
`,
  },
  {
    slug: 'ai-profile',
    feature_key: 'ai-profile',
    primary_route: '/app/settings/ai-profile',
    sort_order: 10,
    title: 'Hồ sơ doanh nghiệp (AI Profile)',
    summary: 'Khai báo thông tin doanh nghiệp để trợ lý AI viết nội dung đúng ngữ cảnh.',
    body_md: `# Hồ sơ doanh nghiệp (AI Profile)
Dùng để lưu thông tin thương hiệu, sản phẩm và giọng điệu — trợ lý AI lấy làm ngữ cảnh khi soạn chiến dịch hoặc landing.

## Vào ở đâu
Menu **Cài đặt → Hồ sơ AI** hoặc mở [/app/settings/ai-profile](/app/settings/ai-profile).

## Các bước
1. Vào trang Hồ sơ AI.
2. Điền tên doanh nghiệp, mô tả ngắn, đối tượng khách, điểm bán hàng.
3. Lưu. Có thể bổ sung tài liệu đính kèm nếu hệ thống hỗ trợ.
4. Thử hỏi trợ lý một câu về sản phẩm để kiểm tra ngữ cảnh.

## Lỗi thường gặp
- Trợ lý trả lời chung chung → hồ sơ còn trống hoặc mô tả quá ngắn; bổ sung ít nhất 3–5 câu cụ thể.
- Nhân viên không thấy trang → cần quyền/owner; đăng nhập đúng ngữ cảnh chủ shop.

## Liên quan
- [Kết nối kênh gửi](channels)
- [Tạo chiến dịch](campaign-create)
`,
  },
  {
    slug: 'channels',
    feature_key: 'channels',
    primary_route: '/app/settings/channels',
    sort_order: 20,
    title: 'Kết nối kênh gửi (Email & Zalo)',
    summary: 'Quản lý tài khoản Email SMTP và Zalo dùng để gửi chiến dịch.',
    body_md: `# Kết nối kênh gửi (Email & Zalo)
Nơi thêm/sửa tài khoản gửi email và Zalo trước khi chạy chiến dịch hoặc gửi nhanh.

## Vào ở đâu
Menu **Cài đặt → Kênh gửi** — [/app/settings/channels](/app/settings/channels).
(Các đường dẫn cũ /app/settings/email và /app/settings/zalo sẽ chuyển về đây.)

## Các bước
1. Mở trang Kênh gửi.
2. Tab Email: thêm SMTP/SendGrid, kiểm tra gửi thử.
3. Tab Zalo: quét QR / đăng nhập, đợi trạng thái **connected**.
4. Đặt tài khoản mặc định nếu có nhiều tài khoản.

## Lỗi thường gặp
- Zalo báo disconnected → quét lại QR; không gửi được khi tài khoản mất phiên.
- Email lỗi 535 → sai mật khẩu/API key SMTP; không retry được cho đến khi sửa credentials.
- Chưa nối Zalo mà mua thêm tin → hãy kết nối ít nhất 1 tài khoản trước.

## Liên quan
- [Thêm tài khoản Email](email-account)
- [Thêm tài khoản Zalo](zalo-account)
- [Gửi nhanh](quick-send)
`,
  },
  {
    slug: 'email-account',
    feature_key: 'email-account',
    primary_route: '/app/settings/channels',
    sort_order: 30,
    title: 'Thêm tài khoản Email',
    summary: 'Cấu hình SMTP/SendGrid để gửi email chiến dịch.',
    body_md: `# Thêm tài khoản Email
Cấu hình máy chủ gửi thư (SMTP hoặc SendGrid) để hệ thống gửi email marketing.

## Vào ở đâu
[/app/settings/channels](/app/settings/channels) → tab **Email**.

## Các bước
1. Bấm thêm tài khoản Email.
2. Nhập host, port, user, mật khẩu/API key và địa chỉ gửi (from).
3. Lưu và gửi email thử.
4. Chọn làm mặc định nếu dùng thường xuyên.

## Lỗi thường gặp
- Gửi thử thất bại 535 → sai mật khẩu ứng dụng hoặc API key.
- Vào spam → kiểm tra domain/DKIM phía nhà cung cấp email.
- Đạt hạn mức tháng → nâng gói hoặc [mua thêm hạn mức](plan-and-billing).

## Liên quan
- [Kết nối kênh gửi](channels)
- [Gói & thanh toán](plan-and-billing)
`,
  },
  {
    slug: 'zalo-account',
    feature_key: 'zalo-account',
    primary_route: '/app/settings/channels',
    sort_order: 40,
    title: 'Thêm tài khoản Zalo',
    summary: 'Kết nối Zalo cá nhân để gửi tin / kết bạn trong chiến dịch.',
    body_md: `# Thêm tài khoản Zalo
Kết nối tài khoản Zalo (cá nhân) để gửi tin nhắn, tin nhóm hoặc lời mời kết bạn.

## Vào ở đâu
[/app/settings/channels](/app/settings/channels) → tab **Zalo**.

## Các bước
1. Bấm thêm / kết nối Zalo.
2. Quét mã QR bằng app Zalo trên điện thoại.
3. Chờ trạng thái **Đã kết nối (connected)**.
4. Đặt mặc định nếu có nhiều tài khoản.

## Lỗi thường gặp
- QR hết hạn → tạo lại mã và quét ngay.
- Chiến dịch Zalo dừng đêm khuya → khung giờ yên lặng mặc định 23:00–06:00 (giờ Việt Nam); hệ thống tự tạm dừng và tiếp tục sau 6h.
- Gửi rất chậm → bình thường, mỗi tin cách nhau khoảng 20–50 giây để tránh bị khoá.
- Đạt 100 tin/giờ → chờ cửa sổ giờ reset; hoặc đang cooldown tra số điện thoại (~3 giờ).

## Liên quan
- [Kết nối kênh gửi](channels)
- [Gửi nhanh](quick-send)
- [Tạo chiến dịch](campaign-create)
`,
  },
  {
    slug: 'quick-send',
    feature_key: 'quick-send',
    primary_route: '/app/quick-send',
    sort_order: 50,
    title: 'Gửi nhanh',
    summary: 'Gửi một lượt email/Zalo ngay mà không cần dựng chiến dịch đầy đủ.',
    body_md: `# Gửi nhanh
Gửi nhanh một thông điệp tới danh sách nhỏ khi chưa cần builder chiến dịch.

## Vào ở đâu
Menu **Gửi nhanh** — [/app/quick-send](/app/quick-send).

## Các bước
1. Chọn kênh Email hoặc Zalo.
2. Chọn tài khoản gửi đã kết nối.
3. Chọn người nhận (dán danh sách hoặc chọn từ khách hàng).
4. Soạn nội dung / chọn mẫu → gửi.

## Lỗi thường gặp
- Nút gửi bị khoá → chưa chọn tài khoản hoặc danh sách trống.
- Bị chặn hạn mức → xem [Gói & thanh toán](plan-and-billing) hoặc mua thêm.
- Zalo không gửi đêm → khung giờ yên lặng 23h–6h.

## Liên quan
- [Tạo chiến dịch](campaign-create)
- [Thêm tài khoản Zalo](zalo-account)
`,
  },
  {
    slug: 'campaign-create',
    feature_key: 'campaign-create',
    primary_route: '/app/campaigns/new',
    sort_order: 60,
    title: 'Tạo chiến dịch',
    summary: 'Tạo chiến dịch mới bằng builder nút (email / Zalo) và chạy theo lịch hoặc ngay.',
    body_md: `# Tạo chiến dịch
Dựng luồng gửi đa bước với builder trực quan (trigger → dữ liệu → hành động → kết thúc).

## Vào ở đâu
Menu **Chiến dịch → Tạo mới** — [/app/campaigns/new](/app/campaigns/new).
Hoặc nhờ trợ lý AI: "Tạo giúp tôi chiến dịch…".

## Các bước
1. Tạo chiến dịch mới, đặt tên và loại kênh.
2. Thêm node lấy dữ liệu (khách hàng / sheet / landing leads).
3. Thêm node gửi email hoặc Zalo, gắn mẫu nội dung.
4. Kết nối các node → Lưu → Chạy hoặc lên lịch.

## Lỗi thường gặp
- Chiến dịch Zalo dừng giữa chừng ban đêm → khung giờ yên lặng 23:00–06:00; đợi sáng hoặc xem Delivery Monitor.
- Không có người nhận → kiểm tra node dữ liệu và bộ lọc.
- Lỗi template → mở lại mẫu Email/Zalo và kiểm tra biến {{}}.

## Liên quan
- [Gửi nhanh](quick-send)
- [Hồ sơ doanh nghiệp](ai-profile)
- [Gói & thanh toán](plan-and-billing)
`,
  },
  {
    slug: 'plan-and-billing',
    feature_key: 'plan-and-billing',
    primary_route: '/pricing',
    sort_order: 70,
    title: 'Gói dịch vụ & thanh toán',
    summary: 'Xem bảng giá, nâng gói, thanh toán PayOS và mua thêm hạn mức — phần mua thêm không hết hạn theo chu kỳ.',
    body_md: `# Gói dịch vụ & thanh toán
Quản lý gói thuê bao, thanh toán và mua thêm hạn mức (tin Zalo, email, lượt AI).

## Vào ở đâu
- Bảng giá công khai: [/pricing](/pricing)
- Thanh toán / checkout: [/checkout](/checkout)
- Mua thêm hạn mức: [/app/topup](/app/topup)
- Đơn hàng (admin hệ thống): [/app/orders](/app/orders) — chỉ tài khoản admin

## Các bước
1. Vào /pricing chọn gói hoặc **Gói tự chọn**.
2. Thanh toán qua PayOS (QR). Sau khi thành công, hạn mức gói được kích hoạt.
3. Nếu sắp hết tin/email/AI giữa chu kỳ: vào /app/topup mua thêm (tối thiểu 50.000đ/đơn).
4. Phần mua thêm **không hết hạn theo chu kỳ** — còn nguyên sang kỳ sau, tiêu tới đâu trừ tới đó.

## Hạn mức gói và phần mua thêm khác nhau thế nào
- **Hạn mức gói** làm mới mỗi kỳ. Dùng không hết thì mất, không cộng dồn.
- **Phần mua thêm** là số dư riêng, không làm mới và không mất khi sang kỳ mới.
- Hệ thống **tiêu hạn mức gói trước**, hết mới trừ vào phần mua thêm — để phần bạn đã trả tiền được giữ lâu nhất.
- Cần **gói còn hiệu lực** mới dùng được phần mua thêm. Gói hết hạn thì số dư vẫn còn nguyên, gia hạn là dùng tiếp.

## Lỗi thường gặp
- Đã trả tiền nhưng hạn mức chưa tăng → đợi webhook PayOS vài phút rồi tải lại trang.
- Không mua được tin Zalo → năng lực tính theo **số tài khoản Zalo đã kết nối**, không theo số slot gói; hãy nối Zalo trước.
- Hết credit AI → mua thêm tại /app/topup hoặc nâng gói.
- Gói đã hết hạn, còn số dư mua thêm nhưng không gửi được → gia hạn gói; số dư không mất đi đâu.

## Liên quan
- [Thêm tài khoản Zalo](zalo-account)
- [Kết nối kênh gửi](channels)
- [Câu hỏi thường gặp về thanh toán](faq-billing)
`,
  },
  {
    slug: 'faq-billing',
    feature_key: 'faq-billing',
    primary_route: '/app/billing',
    sort_order: 75,
    title: 'Câu hỏi thường gặp về thanh toán & hoá đơn',
    summary: 'Ai được mua, mua thêm có hết hạn không, slot hết hạn thì mất dữ liệu không, và tình trạng hoá đơn VAT.',
    body_md: `# Câu hỏi thường gặp về thanh toán & hoá đơn
Các câu hỏi hay gặp nhất về tiền bạc. Xem trước phần này thì đỡ phải hỏi hỗ trợ.

## Ai được mua gói và mua thêm?
Chỉ **chủ tài khoản**. Nhân viên được cấp quyền vẫn dùng được sản phẩm nhưng không thấy trang mua và không tự thanh toán được — để không ai tiêu tiền thay chủ.

## Mua thêm tin nhắn / email / lượt AI có hết hạn không?
**Không.** Số dư mua thêm nằm ở một ví riêng, không làm mới theo chu kỳ và không mất khi sang kỳ mới. Điều kiện duy nhất là gói phải còn hiệu lực mới tiêu được.

Hệ thống luôn **tiêu hạn mức của gói trước**, hết mới trừ vào ví — để phần bạn đã bỏ tiền mua được giữ lâu nhất có thể.

## Vậy còn tài khoản Zalo, landing page, chatbot mua thêm?
Nhóm này **khác hẳn**: đây là thuê chỗ theo tháng, không phải ví. Khi mua bạn chọn 1, 3, 6 hoặc 12 tháng. Thời hạn tính từ ngày mua, không gắn với ngày hết hạn gói — nên mua sát cuối kỳ cũng không bị thiệt, và gia hạn gói không làm mất slot vừa mua.

## Hết hạn slot thì tôi có mất dữ liệu không?
**Không mất gì.** Hệ thống chỉ **tạm khoá**, toàn bộ nội dung landing page, chatbot và kết nối tài khoản vẫn còn nguyên. Trả tiền là dùng lại được ngay.

Bạn còn được **tự chọn giữ cái nào**: vào [/app/billing](/app/billing), mục **Tài nguyên khoá**, tick những thứ quan trọng để giữ trong hạn mức còn hiệu lực. Hệ thống cũng gửi email nhắc trước **7 ngày** và **3 ngày**.

Lưu ý: tài nguyên bị khoá vẫn chiếm chỗ. Muốn tạo cái mới thì xoá cái đang khoá trước.

## Vì sao tôi không mua thêm tin Zalo được?
Hai lý do thường gặp:
- **Chưa kết nối tài khoản Zalo nào.** Mua tin mà không có tài khoản để gửi thì tiền nằm chết — hãy kết nối trước tại [/app/settings/channels](/app/settings/channels).
- **Mua vượt năng lực gửi thật.** Mỗi tài khoản Zalo chỉ gửi được khoảng 16.000 tin/tháng. Cần nhiều hơn thì mua thêm tài khoản Zalo, không phải mua thêm tin.

## Đơn tối thiểu là bao nhiêu?
**50.000đ** một đơn mua thêm. Dưới mức này phí thanh toán ăn gần hết giá trị đơn.

## Gói tôi hết hạn, đang trong thời gian ân hạn thì mua được gì?
Chỉ mua được **tin nhắn, email, lượt AI**. Không mua được thêm tài khoản Zalo/Email, landing page hay chatbot cho tới khi gia hạn gói.

## Đã thanh toán nhưng hạn mức chưa tăng?
Đợi vài phút rồi tải lại trang — hệ thống cần nhận xác nhận từ cổng thanh toán. Quá 15 phút vẫn chưa thấy thì liên hệ hỗ trợ kèm **mã đơn**, đơn không bị mất.

## Có xuất hoá đơn VAT không?
**Hiện chưa.** Sau khi thanh toán bạn nhận được email xác nhận có đầy đủ mã đơn, số tiền, gói đã mua và ngày hết hạn — dùng để đối chiếu nội bộ được, nhưng **chưa phải hoá đơn giá trị gia tăng hợp lệ**.

Chức năng xuất hoá đơn điện tử tự động đang chờ hoàn thiện. Nếu bạn cần hoá đơn VAT cho đơn đã thanh toán, hãy liên hệ hỗ trợ kèm mã đơn và mã số thuế để được xử lý thủ công.

## Có hoàn tiền không?
Hệ thống **không có luồng hoàn tiền tự động**. Trường hợp đặc biệt (thanh toán nhầm, trừ tiền hai lần) vui lòng liên hệ hỗ trợ kèm mã đơn.

## Xem lại đơn đã mua ở đâu?
Vào [/app/billing](/app/billing), mục **Lịch sử đơn** — có đủ đơn mua gói và đơn mua thêm.

## Liên quan
- [Gói dịch vụ & thanh toán](plan-and-billing)
- [Bắt đầu với Founder AI — 4 bước](getting-started)
- [Kết nối kênh gửi](channels)
`,
  },
];

export default HELP_SEED_ARTICLES;
