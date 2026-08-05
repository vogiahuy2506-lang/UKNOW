/**
 * Seed 7 Nhóm-1 help articles (Vietnamese).
 * Embeddings are created via reindexArticle when published — call seedHelpArticles() after migration.
 */
export const HELP_SEED_ARTICLES = [
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
    summary: 'Xem bảng giá, nâng gói, thanh toán PayOS và mua thêm hạn mức giữa chu kỳ.',
    body_md: `# Gói dịch vụ & thanh toán
Quản lý gói thuê bao, thanh toán và mua thêm hạn mức (tin Zalo, email, lượt AI) trong chu kỳ hiện tại.

## Vào ở đâu
- Bảng giá công khai: [/pricing](/pricing)
- Thanh toán / checkout: [/checkout](/checkout)
- Mua thêm hạn mức: [/app/topup](/app/topup)
- Đơn hàng (admin hệ thống): [/app/orders](/app/orders) — chỉ tài khoản admin

## Các bước
1. Vào /pricing chọn gói hoặc **Gói tự chọn**.
2. Thanh toán qua PayOS (QR). Sau khi thành công, hạn mức gói được kích hoạt.
3. Nếu sắp hết tin/email/AI giữa chu kỳ: vào /app/topup mua thêm (tối thiểu 50.000đ/đơn).
4. Phần mua thêm **hết hạn cuối chu kỳ, không cộng dồn**.

## Lỗi thường gặp
- Đã trả tiền nhưng hạn mức chưa tăng → đợi webhook PayOS vài phút; tải lại trang; với top-up kiểm tra đã hết hạn gói chưa.
- Không mua được tin Zalo → năng lực tính theo **số tài khoản Zalo đã kết nối**, không theo số slot gói; hãy nối Zalo trước.
- Hết credit AI → mua thêm tại /app/topup hoặc nâng gói.

## Liên quan
- [Thêm tài khoản Zalo](zalo-account)
- [Kết nối kênh gửi](channels)
`,
  },
];

export default HELP_SEED_ARTICLES;
