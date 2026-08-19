/**
 * Seed 9 Nhóm-1 help articles (Vietnamese).
 * Embeddings are created via reindexArticle when published — call seedHelpArticles() after migration.
 */
export const HELP_SEED_ARTICLES = [
  {
    slug: 'ai-profile',
    feature_key: 'ai-profile',
    primary_route: '/app/settings/ai-profile',
    sort_order: 10,
    title: 'Hồ sơ doanh nghiệp',
    summary: 'Khai một lần để trợ lý AI viết nội dung đúng giọng và đúng khách của bạn. Hồ sơ sơ sài thì AI viết chung chung.',
    body_md: `Đây là nơi bạn kể cho trợ lý AI biết bạn là ai, bán gì và nói chuyện với khách theo kiểu nào. Khai **một lần**, sau đó mọi nội dung AI viết — email, tin Zalo, landing page — đều bám theo hồ sơ này.

Đây là việc nên làm đầu tiên sau khi tạo tài khoản. Bỏ qua thì AI vẫn viết được, nhưng viết chung chung, không nhắc đúng tên sản phẩm của bạn, và bạn mất thời gian sửa từng bài.

# Vào ở đâu
Menu **Cài đặt → Hồ sơ doanh nghiệp**, hoặc [/app/settings/ai-profile](/app/settings/ai-profile).

Trang này chỉ **chủ tài khoản** vào được. Đăng nhập bằng tài khoản nhân viên sẽ không thấy.

[ẢNH: trang Hồ sơ doanh nghiệp, thấy các mục Thông tin cơ bản / Nhóm khách hàng mục tiêu / Nhận diện thương hiệu]

# Bốn phần cần khai
## Thông tin cơ bản
Tên công ty và ngành nghề. Ngắn gọn, nhưng viết đúng tên thương hiệu bạn muốn xuất hiện trong tin nhắn gửi khách.

## Nhóm khách hàng mục tiêu
Phần này quyết định chất lượng nội dung nhiều nhất, nhưng hay bị bỏ trống.

Bạn mô tả từng nhóm khách, mỗi nhóm gồm:
- **Tên nhóm khách** — ví dụ *"Sinh viên IT 18–25 tuổi"*
- **Đặc điểm** — họ là ai, thói quen, khả năng chi trả
- **Vấn đề / Nỗi đau chính** — điều gì khiến họ cần sản phẩm của bạn

Thêm được nhiều nhóm. Nhóm càng cụ thể, AI càng viết trúng — vì nó biết đang nói với ai thay vì viết cho "khách hàng" chung chung.

[ẢNH: một nhóm khách hàng mục tiêu đã điền đủ tên nhóm, đặc điểm và nỗi đau]

## Nhận diện thương hiệu
Chọn **giọng điệu** bạn muốn AI dùng:

| Giọng điệu | Hợp với |
|---|---|
| **Chuyên nghiệp** | Dịch vụ B2B, tư vấn, tài chính |
| **Thân thiện** | Bán lẻ, dịch vụ chăm sóc khách |
| **Trang trọng** | Giáo dục, y tế, cơ quan |
| **Gần gũi, trẻ trung** | Thời trang, F&B, khách trẻ |
| **Truyền cảm hứng** | Khoá học, huấn luyện, cộng đồng |

Kèm màu thương hiệu và logo, dùng khi AI dựng landing page.

## Thông tin bổ sung
Chỗ để những gì không lọt vào các ô trên: chính sách bảo hành, khu vực phục vụ, điều gì tuyệt đối không được nói. Viết tự do.

# Sản phẩm khai ở trang khác
Đừng tìm chỗ nhập sản phẩm trong trang này — **sản phẩm và dịch vụ quản lý ở trang Sản phẩm riêng**. AI và chiến dịch đọc dữ liệu từ đó.

Trong trang hồ sơ có sẵn đường dẫn sang trang Sản phẩm.

# Viết bao nhiêu là đủ
Tối thiểu 3–5 câu cụ thể cho mỗi phần. Cụ thể quan trọng hơn dài.

So sánh nhanh:

- ❌ *"Chúng tôi bán khoá học chất lượng cao"* — AI không rút được gì từ câu này.
- ✅ *"Khoá học tiếng Anh giao tiếp cho người đi làm 25–35 tuổi, học tối 2 buổi/tuần qua Zoom, cam kết hoàn tiền nếu nghỉ quá 3 buổi"* — AI biết đối tượng, hình thức, cam kết.

# Sửa hồ sơ lúc nào cũng được
Hồ sơ cập nhật bất cứ lúc nào. Nội dung AI viết **sau khi sửa** sẽ dùng thông tin mới; những gì đã tạo trước đó giữ nguyên, không tự đổi theo.

Nên xem lại hồ sơ mỗi khi đổi sản phẩm chính hoặc nhắm sang nhóm khách mới.

# Lỗi thường gặp
- **Trợ lý AI trả lời chung chung, không nhắc tên sản phẩm** → Hồ sơ còn trống hoặc quá sơ sài. Bổ sung phần Nhóm khách hàng mục tiêu trước, đó là phần ảnh hưởng nhiều nhất.
- **Không thấy trang này trong menu** → Chỉ chủ tài khoản vào được.
- **Không tìm thấy chỗ nhập sản phẩm** → Sản phẩm nằm ở trang Sản phẩm riêng, không nằm trong hồ sơ.
- **AI viết sai giọng so với thương hiệu** → Đổi lại giọng điệu trong phần Nhận diện thương hiệu, rồi tạo lại nội dung.

# Liên quan
- [Bắt đầu với Founder AI — 4 bước](getting-started)
- [Thư viện nội dung: mẫu tin và biến](mau-tin-nhan)
- [Tạo chiến dịch](campaign-create)`,
    body_html: `<p>Đây là nơi bạn kể cho trợ lý AI biết bạn là ai, bán gì và nói chuyện với khách theo kiểu nào. Khai <strong>một lần</strong>, sau đó mọi nội dung AI viết — email, tin Zalo, landing page — đều bám theo hồ sơ này.</p><p>Đây là việc nên làm đầu tiên sau khi tạo tài khoản. Bỏ qua thì AI vẫn viết được, nhưng viết chung chung, không nhắc đúng tên sản phẩm của bạn, và bạn mất thời gian sửa từng bài.</p><h2>Vào ở đâu</h2><p>Menu <strong>Cài đặt → Hồ sơ doanh nghiệp</strong>, hoặc <a href="/app/settings/ai-profile">/app/settings/ai-profile</a>.</p><p>Trang này chỉ <strong>chủ tài khoản</strong> vào được. Đăng nhập bằng tài khoản nhân viên sẽ không thấy.</p><p>[ẢNH: trang Hồ sơ doanh nghiệp, thấy các mục Thông tin cơ bản / Nhóm khách hàng mục tiêu / Nhận diện thương hiệu]</p><h2>Bốn phần cần khai</h2><h3>Thông tin cơ bản</h3><p>Tên công ty và ngành nghề. Ngắn gọn, nhưng viết đúng tên thương hiệu bạn muốn xuất hiện trong tin nhắn gửi khách.</p><h3>Nhóm khách hàng mục tiêu</h3><p>Phần này quyết định chất lượng nội dung nhiều nhất, nhưng hay bị bỏ trống.</p><p>Bạn mô tả từng nhóm khách, mỗi nhóm gồm:</p><ul><li><strong>Tên nhóm khách</strong> — ví dụ <em>&quot;Sinh viên IT 18–25 tuổi&quot;</em></li><li><strong>Đặc điểm</strong> — họ là ai, thói quen, khả năng chi trả</li><li><strong>Vấn đề / Nỗi đau chính</strong> — điều gì khiến họ cần sản phẩm của bạn</li></ul><p>Thêm được nhiều nhóm. Nhóm càng cụ thể, AI càng viết trúng — vì nó biết đang nói với ai thay vì viết cho &quot;khách hàng&quot; chung chung.</p><p>[ẢNH: một nhóm khách hàng mục tiêu đã điền đủ tên nhóm, đặc điểm và nỗi đau]</p><h3>Nhận diện thương hiệu</h3><p>Chọn <strong>giọng điệu</strong> bạn muốn AI dùng:</p><table><thead><tr><th>Giọng điệu</th><th>Hợp với</th></tr></thead><tbody><tr><td><strong>Chuyên nghiệp</strong></td><td>Dịch vụ B2B, tư vấn, tài chính</td></tr><tr><td><strong>Thân thiện</strong></td><td>Bán lẻ, dịch vụ chăm sóc khách</td></tr><tr><td><strong>Trang trọng</strong></td><td>Giáo dục, y tế, cơ quan</td></tr><tr><td><strong>Gần gũi, trẻ trung</strong></td><td>Thời trang, F&amp;B, khách trẻ</td></tr><tr><td><strong>Truyền cảm hứng</strong></td><td>Khoá học, huấn luyện, cộng đồng</td></tr></tbody></table><p>Kèm màu thương hiệu và logo, dùng khi AI dựng landing page.</p><h3>Thông tin bổ sung</h3><p>Chỗ để những gì không lọt vào các ô trên: chính sách bảo hành, khu vực phục vụ, điều gì tuyệt đối không được nói. Viết tự do.</p><h2>Sản phẩm khai ở trang khác</h2><p>Đừng tìm chỗ nhập sản phẩm trong trang này — <strong>sản phẩm và dịch vụ quản lý ở trang Sản phẩm riêng</strong>. AI và chiến dịch đọc dữ liệu từ đó.</p><p>Trong trang hồ sơ có sẵn đường dẫn sang trang Sản phẩm.</p><h2>Viết bao nhiêu là đủ</h2><p>Tối thiểu 3–5 câu cụ thể cho mỗi phần. Cụ thể quan trọng hơn dài.</p><p>So sánh nhanh:</p><ul><li>❌ <em>&quot;Chúng tôi bán khoá học chất lượng cao&quot;</em> — AI không rút được gì từ câu này.</li><li>✅ <em>&quot;Khoá học tiếng Anh giao tiếp cho người đi làm 25–35 tuổi, học tối 2 buổi/tuần qua Zoom, cam kết hoàn tiền nếu nghỉ quá 3 buổi&quot;</em> — AI biết đối tượng, hình thức, cam kết.</li></ul><h2>Sửa hồ sơ lúc nào cũng được</h2><p>Hồ sơ cập nhật bất cứ lúc nào. Nội dung AI viết <strong>sau khi sửa</strong> sẽ dùng thông tin mới; những gì đã tạo trước đó giữ nguyên, không tự đổi theo.</p><p>Nên xem lại hồ sơ mỗi khi đổi sản phẩm chính hoặc nhắm sang nhóm khách mới.</p><h2>Lỗi thường gặp</h2><ul><li><strong>Trợ lý AI trả lời chung chung, không nhắc tên sản phẩm</strong> → Hồ sơ còn trống hoặc quá sơ sài. Bổ sung phần Nhóm khách hàng mục tiêu trước, đó là phần ảnh hưởng nhiều nhất.</li><li><strong>Không thấy trang này trong menu</strong> → Chỉ chủ tài khoản vào được.</li><li><strong>Không tìm thấy chỗ nhập sản phẩm</strong> → Sản phẩm nằm ở trang Sản phẩm riêng, không nằm trong hồ sơ.</li><li><strong>AI viết sai giọng so với thương hiệu</strong> → Đổi lại giọng điệu trong phần Nhận diện thương hiệu, rồi tạo lại nội dung.</li></ul><h2>Liên quan</h2><ul><li><a href="getting-started">Bắt đầu với Founder AI — 4 bước</a></li><li><a href="mau-tin-nhan">Thư viện nội dung: mẫu tin và biến</a></li><li><a href="campaign-create">Tạo chiến dịch</a></li></ul>`,
  },
  {
    slug: 'quick-send',
    feature_key: 'quick-send',
    primary_route: '/app/quick-send',
    sort_order: 50,
    title: 'Gửi nhanh',
    summary: 'Gửi một lượt cho danh sách nhỏ qua 3 bước, không cần dựng chiến dịch. Kèm cách đọc thời gian hoàn tất ước tính.',
    body_md: `Gửi một lượt tin cho danh sách nhỏ mà không phải dựng chiến dịch. Ba bước, xong trong vài phút.

Đây cũng là **cách tốt nhất để kiểm tra kênh gửi vừa nối** — gửi thử cho chính mình trước khi chạy chiến dịch thật.

# Khi nào dùng Gửi nhanh, khi nào dựng chiến dịch
| | Gửi nhanh | Chiến dịch |
|---|---|---|
| Danh sách | Nhỏ, bạn tự dán vào | Lớn, lấy từ Sheet hoặc landing page |
| Số bước gửi | Một lượt duy nhất | Nhiều bước, có chờ và rẽ nhánh |
| Hẹn giờ | Không, gửi ngay | Có, chạy theo lịch hoặc lặp lại |
| Dựng mất | Vài phút | Lâu hơn |

Cần gửi lặp lại hoặc gửi cho danh sách trong Google Sheet thì dùng [Tạo chiến dịch](campaign-create).

# Vào ở đâu
Menu **Chiến dịch → Gửi nhanh**, hoặc [/app/quick-send](/app/quick-send).

# Ba bước
## Bước 1 — Người nhận
Chọn **kênh gửi** (Email hoặc Zalo), chọn **tài khoản gửi** trong số tài khoản đã nối, rồi nhập danh sách người nhận.

Nhập **mỗi dòng một địa chỉ**, hoặc ngăn cách bằng dấu phẩy. Với Email là địa chỉ email, với Zalo là số điện thoại.

[ẢNH: bước Người nhận, đã chọn kênh Zalo và dán danh sách số điện thoại]

## Bước 2 — Mẫu tin
Chọn một mẫu có sẵn trong thư viện. Chưa có mẫu nào thì tạo trước tại [Thư viện nội dung](mau-tin-nhan).

Lưu ý: mẫu Email và mẫu Zalo tách riêng, chọn kênh nào chỉ thấy mẫu của kênh đó.

## Bước 3 — Xem lại
Kiểm tra lần cuối rồi bấm **Gửi ngay**.

Ở bước này có **Thời gian hoàn tất ước tính** — đọc kỹ con số đó, giải thích ngay bên dưới.

[ẢNH: bước Xem lại, khoanh đỏ phần Thời gian hoàn tất ước tính]

# Thời gian hoàn tất ước tính — đọc trước khi bấm gửi
Đây là phần hữu ích nhất của Gửi nhanh, nhưng hay bị bỏ qua.

Với Email, con số thường là vài giây tới vài phút. Với **Zalo thì có thể là nhiều giờ** — vì mỗi tin cách nhau 80–150 giây để tài khoản không bị khoá.

Ví dụ gửi Zalo cho 50 người: khoảng 1,5 đến 2 tiếng.

Thấy con số lớn thì đó là **ước tính đúng**, không phải lỗi. Bấm gửi rồi cứ đóng trang, hệ thống vẫn chạy tiếp ở nền.

# Giờ yên lặng
Nếu bạn gửi Zalo vào lúc gần khuya, hệ thống báo trước rằng nó **tự tạm dừng trong khung 23:00 – 06:00** rồi gửi tiếp vào sáng hôm sau.

Đây là quy định để bảo vệ tài khoản Zalo của bạn, không tắt được. Cần gửi gấp trong đêm thì dùng Email.

# Lỗi thường gặp
- **Không chọn được tài khoản gửi** → Chưa nối kênh nào. Xem [Kết nối kênh gửi](channels).
- **Nút sang bước sau bị mờ** → Danh sách người nhận đang trống, hoặc chưa chọn tài khoản gửi.
- **Không có mẫu nào để chọn** → Chưa tạo mẫu cho kênh đang chọn. Mẫu Email không dùng cho Zalo và ngược lại.
- **Gửi xong báo một phần thất bại** → Bình thường khi danh sách có địa chỉ sai hoặc số chưa dùng Zalo. Phần còn lại vẫn gửi thành công, danh sách lỗi hiện ngay sau khi gửi.
- **Toàn bộ đều thất bại** → Thường do tài khoản gửi mất kết nối. Kiểm tra lại tại trang Quản lý kênh gửi.
- **Gửi Zalo mãi chưa xong** → Xem lại thời gian ước tính ở bước 3, và [Vì sao Zalo gửi chậm hoặc đang dừng](zalo-gui-cham).

# Liên quan
- [Kết nối kênh gửi](channels)
- [Thư viện nội dung: mẫu tin và biến](mau-tin-nhan)
- [Tạo chiến dịch](campaign-create)
- [Vì sao Zalo gửi chậm hoặc đang dừng](zalo-gui-cham)`,
    body_html: `<p>Gửi một lượt tin cho danh sách nhỏ mà không phải dựng chiến dịch. Ba bước, xong trong vài phút.</p><p>Đây cũng là <strong>cách tốt nhất để kiểm tra kênh gửi vừa nối</strong> — gửi thử cho chính mình trước khi chạy chiến dịch thật.</p><h2>Khi nào dùng Gửi nhanh, khi nào dựng chiến dịch</h2><table><thead><tr><th></th><th>Gửi nhanh</th><th>Chiến dịch</th></tr></thead><tbody><tr><td>Danh sách</td><td>Nhỏ, bạn tự dán vào</td><td>Lớn, lấy từ Sheet hoặc landing page</td></tr><tr><td>Số bước gửi</td><td>Một lượt duy nhất</td><td>Nhiều bước, có chờ và rẽ nhánh</td></tr><tr><td>Hẹn giờ</td><td>Không, gửi ngay</td><td>Có, chạy theo lịch hoặc lặp lại</td></tr><tr><td>Dựng mất</td><td>Vài phút</td><td>Lâu hơn</td></tr></tbody></table><p>Cần gửi lặp lại hoặc gửi cho danh sách trong Google Sheet thì dùng <a href="campaign-create">Tạo chiến dịch</a>.</p><h2>Vào ở đâu</h2><p>Menu <strong>Chiến dịch → Gửi nhanh</strong>, hoặc <a href="/app/quick-send">/app/quick-send</a>.</p><h2>Ba bước</h2><h3>Bước 1 — Người nhận</h3><p>Chọn <strong>kênh gửi</strong> (Email hoặc Zalo), chọn <strong>tài khoản gửi</strong> trong số tài khoản đã nối, rồi nhập danh sách người nhận.</p><p>Nhập <strong>mỗi dòng một địa chỉ</strong>, hoặc ngăn cách bằng dấu phẩy. Với Email là địa chỉ email, với Zalo là số điện thoại.</p><p>[ẢNH: bước Người nhận, đã chọn kênh Zalo và dán danh sách số điện thoại]</p><h3>Bước 2 — Mẫu tin</h3><p>Chọn một mẫu có sẵn trong thư viện. Chưa có mẫu nào thì tạo trước tại <a href="mau-tin-nhan">Thư viện nội dung</a>.</p><p>Lưu ý: mẫu Email và mẫu Zalo tách riêng, chọn kênh nào chỉ thấy mẫu của kênh đó.</p><h3>Bước 3 — Xem lại</h3><p>Kiểm tra lần cuối rồi bấm <strong>Gửi ngay</strong>.</p><p>Ở bước này có <strong>Thời gian hoàn tất ước tính</strong> — đọc kỹ con số đó, giải thích ngay bên dưới.</p><p>[ẢNH: bước Xem lại, khoanh đỏ phần Thời gian hoàn tất ước tính]</p><h2>Thời gian hoàn tất ước tính — đọc trước khi bấm gửi</h2><p>Đây là phần hữu ích nhất của Gửi nhanh, nhưng hay bị bỏ qua.</p><p>Với Email, con số thường là vài giây tới vài phút. Với <strong>Zalo thì có thể là nhiều giờ</strong> — vì mỗi tin cách nhau 80–150 giây để tài khoản không bị khoá.</p><p>Ví dụ gửi Zalo cho 50 người: khoảng 1,5 đến 2 tiếng.</p><p>Thấy con số lớn thì đó là <strong>ước tính đúng</strong>, không phải lỗi. Bấm gửi rồi cứ đóng trang, hệ thống vẫn chạy tiếp ở nền.</p><h2>Giờ yên lặng</h2><p>Nếu bạn gửi Zalo vào lúc gần khuya, hệ thống báo trước rằng nó <strong>tự tạm dừng trong khung 23:00 – 06:00</strong> rồi gửi tiếp vào sáng hôm sau.</p><p>Đây là quy định để bảo vệ tài khoản Zalo của bạn, không tắt được. Cần gửi gấp trong đêm thì dùng Email.</p><h2>Lỗi thường gặp</h2><ul><li><strong>Không chọn được tài khoản gửi</strong> → Chưa nối kênh nào. Xem <a href="channels">Kết nối kênh gửi</a>.</li><li><strong>Nút sang bước sau bị mờ</strong> → Danh sách người nhận đang trống, hoặc chưa chọn tài khoản gửi.</li><li><strong>Không có mẫu nào để chọn</strong> → Chưa tạo mẫu cho kênh đang chọn. Mẫu Email không dùng cho Zalo và ngược lại.</li><li><strong>Gửi xong báo một phần thất bại</strong> → Bình thường khi danh sách có địa chỉ sai hoặc số chưa dùng Zalo. Phần còn lại vẫn gửi thành công, danh sách lỗi hiện ngay sau khi gửi.</li><li><strong>Toàn bộ đều thất bại</strong> → Thường do tài khoản gửi mất kết nối. Kiểm tra lại tại trang Quản lý kênh gửi.</li><li><strong>Gửi Zalo mãi chưa xong</strong> → Xem lại thời gian ước tính ở bước 3, và <a href="zalo-gui-cham">Vì sao Zalo gửi chậm hoặc đang dừng</a>.</li></ul><h2>Liên quan</h2><ul><li><a href="channels">Kết nối kênh gửi</a></li><li><a href="mau-tin-nhan">Thư viện nội dung: mẫu tin và biến</a></li><li><a href="campaign-create">Tạo chiến dịch</a></li><li><a href="zalo-gui-cham">Vì sao Zalo gửi chậm hoặc đang dừng</a></li></ul>`,
  },
  {
    slug: 'campaign-create',
    feature_key: 'campaign-create',
    primary_route: '/app/campaigns/new',
    sort_order: 60,
    title: 'Tạo chiến dịch',
    summary: 'Dựng luồng gửi bằng các khối nối với nhau, rồi kích hoạt và chạy. Bài này nói rõ thứ tự và chỗ hay tắc.',
    body_md: `Chiến dịch là một **luồng gửi** bạn dựng bằng cách nối các khối lại với nhau. Mỗi khối làm một việc: lấy dữ liệu, chọn tài khoản gửi, gửi tin, chờ, rẽ nhánh.

Cách này linh hoạt hơn Gửi nhanh, nhưng cũng nhiều bước hơn. Chỉ cần gửi một lượt cho danh sách nhỏ thì dùng [Gửi nhanh](quick-send) nhanh hơn.

# Trước khi bắt đầu, cần có sẵn
Thiếu một trong ba thứ này thì sẽ tắc giữa chừng:

1. **Một kênh gửi đã nối** — xem [Kết nối kênh gửi](channels).
2. **Nguồn dữ liệu người nhận** — thường là một Google Sheet đã chia sẻ quyền đọc. Xem [Khách hàng: dữ liệu đến từ đâu](khach-hang).
3. **Nội dung tin nhắn** — nên tạo trước ở [Thư viện nội dung](mau-tin-nhan).

# Vào ở đâu
Menu **Chiến dịch → Quản lý chiến dịch**, rồi tạo mới. Hoặc mở thẳng [/app/campaigns/new](/app/campaigns/new).

[ẢNH: builder chiến dịch còn trống, thấy khu vực kéo thả và bảng khối bên cạnh]

# Bốn nhóm khối bạn sẽ dùng
| Nhóm | Khối tiêu biểu | Việc nó làm |
|---|---|---|
| Bắt đầu | **Khởi chạy** | Điểm bắt đầu của luồng |
| Lấy dữ liệu | **Đọc dữ liệu Sheet**, **Dữ liệu landing page**, **Lấy dữ liệu khách** | Nạp danh sách người nhận |
| Chuẩn bị gửi | **Chọn tài khoản Zalo**, **Lấy danh sách bạn bè Zalo** | Chỉ định gửi bằng tài khoản nào |
| Gửi | **Gửi Email**, **Gửi tin nhắn Zalo cá nhân**, **Gửi tin nhắn nhóm Zalo**, **Gửi lời mời kết bạn Zalo** | Việc gửi thật |

Ngoài ra có các khối phụ trợ: **Chờ**, **Điều kiện** (rẽ nhánh), **Gắn tag**, **Lưu khách hàng**, **Mapping dữ liệu**.

# Các bước
1. Kéo khối **Khởi chạy** làm điểm bắt đầu.
2. Thêm khối **lấy dữ liệu**, khai báo nguồn rồi bấm **Kiểm tra kết nối** để nạp danh sách cột.
3. Nếu gửi Zalo, thêm khối **Chọn tài khoản Zalo**.
4. Thêm khối **gửi**, chọn mẫu nội dung.
5. **Nối các khối theo đúng thứ tự** bằng cách kéo từ điểm nối của khối này sang khối kia.
6. Lưu chiến dịch.

Bước 2 đừng bỏ qua nút Kiểm tra kết nối. Chưa bấm thì khối gửi ở sau **chưa biết Sheet của bạn có những cột nào**, nên không chèn được tên khách vào nội dung.

# Lưu xong vẫn chưa chạy — phải kích hoạt
Đây là chỗ nhiều người tưởng hỏng.

Lưu chiến dịch **không làm nó chạy**. Bạn phải sang [/app/campaign-run](/app/campaign-run) (menu **Chiến dịch → Chạy chiến dịch**) và bấm **Kích hoạt chiến dịch**.

Sau khi kích hoạt, bạn có hai lựa chọn:

- **Chạy ngay** — gửi luôn một lượt.
- **Thiết lập lịch chạy** — hẹn giờ, hoặc đặt chạy lặp lại theo chu kỳ.

[ẢNH: trang Chạy chiến dịch, khoanh đỏ nút "Kích hoạt chiến dịch"]

Chiến dịch đang chạy thì **không lên lịch được** — hệ thống báo rõ. Đợi lượt chạy xong hoặc bấm **Dừng lượt chạy** trước.

# Chạy thử trong builder khác chạy thật
Nút chạy thử ngay trong builder mặc định **chỉ đọc 100 dòng đầu** của Sheet, để xem trước cho nhanh.

Chạy thật từ trang Chạy chiến dịch thì đọc **đủ toàn bộ dòng**. Thấy chạy thử ra ít người thì đừng lo.

# Lỗi thường gặp
- **Không có người nhận nào** → Khối lấy dữ liệu sai cấu hình. Kiểm tra lại dòng tiêu đề, dòng bắt đầu dữ liệu, và quyền chia sẻ của file Sheet.
- **Nội dung gửi đi bị trống chỗ tên khách** → Chưa bấm Kiểm tra kết nối nên khối gửi không thấy cột, hoặc tên biến trong mẫu không khớp tên cột trong Sheet.
- **Đã lưu mà không thấy chạy** → Chưa kích hoạt. Sang trang Chạy chiến dịch bấm **Kích hoạt chiến dịch**.
- **Chiến dịch dừng và báo hết lượt gửi** → Đã dùng hết hạn mức kỳ này. Hệ thống hiện rõ thời điểm tự chạy lại, hoặc bạn bấm **Mua thêm** để chạy tiếp ngay.
- **Chiến dịch Zalo chạy rất chậm hoặc đứng im ban đêm** → Bình thường. Xem [Vì sao Zalo gửi chậm hoặc đang dừng](zalo-gui-cham).
- **Không sửa được mẫu nội dung đang dùng** → Mẫu bị khoá vì chiến dịch đang kích hoạt. Xem [Thư viện nội dung](mau-tin-nhan).

# Liên quan
- [Thư viện nội dung: mẫu tin và biến](mau-tin-nhan)
- [Theo dõi chiến dịch đang chạy](campaign-theo-doi)
- [Khách hàng: dữ liệu đến từ đâu](khach-hang)
- [Gửi nhanh](quick-send)`,
    body_html: `<p>Chiến dịch là một <strong>luồng gửi</strong> bạn dựng bằng cách nối các khối lại với nhau. Mỗi khối làm một việc: lấy dữ liệu, chọn tài khoản gửi, gửi tin, chờ, rẽ nhánh.</p><p>Cách này linh hoạt hơn Gửi nhanh, nhưng cũng nhiều bước hơn. Chỉ cần gửi một lượt cho danh sách nhỏ thì dùng <a href="quick-send">Gửi nhanh</a> nhanh hơn.</p><h2>Trước khi bắt đầu, cần có sẵn</h2><p>Thiếu một trong ba thứ này thì sẽ tắc giữa chừng:</p><ol><li><strong>Một kênh gửi đã nối</strong> — xem <a href="channels">Kết nối kênh gửi</a>.</li><li><strong>Nguồn dữ liệu người nhận</strong> — thường là một Google Sheet đã chia sẻ quyền đọc. Xem <a href="khach-hang">Khách hàng: dữ liệu đến từ đâu</a>.</li><li><strong>Nội dung tin nhắn</strong> — nên tạo trước ở <a href="mau-tin-nhan">Thư viện nội dung</a>.</li></ol><h2>Vào ở đâu</h2><p>Menu <strong>Chiến dịch → Quản lý chiến dịch</strong>, rồi tạo mới. Hoặc mở thẳng <a href="/app/campaigns/new">/app/campaigns/new</a>.</p><p>[ẢNH: builder chiến dịch còn trống, thấy khu vực kéo thả và bảng khối bên cạnh]</p><h2>Bốn nhóm khối bạn sẽ dùng</h2><table><thead><tr><th>Nhóm</th><th>Khối tiêu biểu</th><th>Việc nó làm</th></tr></thead><tbody><tr><td>Bắt đầu</td><td><strong>Khởi chạy</strong></td><td>Điểm bắt đầu của luồng</td></tr><tr><td>Lấy dữ liệu</td><td><strong>Đọc dữ liệu Sheet</strong>, <strong>Dữ liệu landing page</strong>, <strong>Lấy dữ liệu khách</strong></td><td>Nạp danh sách người nhận</td></tr><tr><td>Chuẩn bị gửi</td><td><strong>Chọn tài khoản Zalo</strong>, <strong>Lấy danh sách bạn bè Zalo</strong></td><td>Chỉ định gửi bằng tài khoản nào</td></tr><tr><td>Gửi</td><td><strong>Gửi Email</strong>, <strong>Gửi tin nhắn Zalo cá nhân</strong>, <strong>Gửi tin nhắn nhóm Zalo</strong>, <strong>Gửi lời mời kết bạn Zalo</strong></td><td>Việc gửi thật</td></tr></tbody></table><p>Ngoài ra có các khối phụ trợ: <strong>Chờ</strong>, <strong>Điều kiện</strong> (rẽ nhánh), <strong>Gắn tag</strong>, <strong>Lưu khách hàng</strong>, <strong>Mapping dữ liệu</strong>.</p><h2>Các bước</h2><ol><li>Kéo khối <strong>Khởi chạy</strong> làm điểm bắt đầu.</li><li>Thêm khối <strong>lấy dữ liệu</strong>, khai báo nguồn rồi bấm <strong>Kiểm tra kết nối</strong> để nạp danh sách cột.</li><li>Nếu gửi Zalo, thêm khối <strong>Chọn tài khoản Zalo</strong>.</li><li>Thêm khối <strong>gửi</strong>, chọn mẫu nội dung.</li><li><strong>Nối các khối theo đúng thứ tự</strong> bằng cách kéo từ điểm nối của khối này sang khối kia.</li><li>Lưu chiến dịch.</li></ol><p>Bước 2 đừng bỏ qua nút Kiểm tra kết nối. Chưa bấm thì khối gửi ở sau <strong>chưa biết Sheet của bạn có những cột nào</strong>, nên không chèn được tên khách vào nội dung.</p><h2>Lưu xong vẫn chưa chạy — phải kích hoạt</h2><p>Đây là chỗ nhiều người tưởng hỏng.</p><p>Lưu chiến dịch <strong>không làm nó chạy</strong>. Bạn phải sang <a href="/app/campaign-run">/app/campaign-run</a> (menu <strong>Chiến dịch → Chạy chiến dịch</strong>) và bấm <strong>Kích hoạt chiến dịch</strong>.</p><p>Sau khi kích hoạt, bạn có hai lựa chọn:</p><ul><li><strong>Chạy ngay</strong> — gửi luôn một lượt.</li><li><strong>Thiết lập lịch chạy</strong> — hẹn giờ, hoặc đặt chạy lặp lại theo chu kỳ.</li></ul><p>[ẢNH: trang Chạy chiến dịch, khoanh đỏ nút &quot;Kích hoạt chiến dịch&quot;]</p><p>Chiến dịch đang chạy thì <strong>không lên lịch được</strong> — hệ thống báo rõ. Đợi lượt chạy xong hoặc bấm <strong>Dừng lượt chạy</strong> trước.</p><h2>Chạy thử trong builder khác chạy thật</h2><p>Nút chạy thử ngay trong builder mặc định <strong>chỉ đọc 100 dòng đầu</strong> của Sheet, để xem trước cho nhanh.</p><p>Chạy thật từ trang Chạy chiến dịch thì đọc <strong>đủ toàn bộ dòng</strong>. Thấy chạy thử ra ít người thì đừng lo.</p><h2>Lỗi thường gặp</h2><ul><li><strong>Không có người nhận nào</strong> → Khối lấy dữ liệu sai cấu hình. Kiểm tra lại dòng tiêu đề, dòng bắt đầu dữ liệu, và quyền chia sẻ của file Sheet.</li><li><strong>Nội dung gửi đi bị trống chỗ tên khách</strong> → Chưa bấm Kiểm tra kết nối nên khối gửi không thấy cột, hoặc tên biến trong mẫu không khớp tên cột trong Sheet.</li><li><strong>Đã lưu mà không thấy chạy</strong> → Chưa kích hoạt. Sang trang Chạy chiến dịch bấm <strong>Kích hoạt chiến dịch</strong>.</li><li><strong>Chiến dịch dừng và báo hết lượt gửi</strong> → Đã dùng hết hạn mức kỳ này. Hệ thống hiện rõ thời điểm tự chạy lại, hoặc bạn bấm <strong>Mua thêm</strong> để chạy tiếp ngay.</li><li><strong>Chiến dịch Zalo chạy rất chậm hoặc đứng im ban đêm</strong> → Bình thường. Xem <a href="zalo-gui-cham">Vì sao Zalo gửi chậm hoặc đang dừng</a>.</li><li><strong>Không sửa được mẫu nội dung đang dùng</strong> → Mẫu bị khoá vì chiến dịch đang kích hoạt. Xem <a href="mau-tin-nhan">Thư viện nội dung</a>.</li></ul><h2>Liên quan</h2><ul><li><a href="mau-tin-nhan">Thư viện nội dung: mẫu tin và biến</a></li><li><a href="campaign-theo-doi">Theo dõi chiến dịch đang chạy</a></li><li><a href="khach-hang">Khách hàng: dữ liệu đến từ đâu</a></li><li><a href="quick-send">Gửi nhanh</a></li></ul>`,
  },
  {
    slug: 'mau-tin-nhan',
    feature_key: 'campaign-create',
    primary_route: '/app/settings/templates',
    sort_order: 63,
    title: 'Thư viện nội dung: mẫu tin và biến',
    summary: 'Soạn sẵn mẫu email và Zalo, dùng biến để cá nhân hoá, và hiểu vì sao mẫu bị khoá khi chiến dịch đang chạy.',
    body_md: `Thay vì gõ lại nội dung mỗi lần, bạn soạn sẵn **mẫu** rồi gắn vào chiến dịch. Mẫu dùng lại được nhiều lần và sửa một chỗ áp dụng cho mọi nơi đang dùng.

# Vào ở đâu
Menu **Chiến dịch → Thư viện nội dung**, hoặc [/app/settings/templates](/app/settings/templates).

Trang chia 2 thẻ: **Email** và **Zalo**. Hai loại mẫu tách riêng vì email có tiêu đề và định dạng phong phú, còn Zalo là tin nhắn văn bản ngắn.

[ẢNH: Thư viện nội dung, khoanh đỏ 2 thẻ Email / Zalo]

# Biến — cách gọi đúng tên từng khách
Biến là chỗ trống trong mẫu, khi gửi sẽ được thay bằng dữ liệu thật của từng người. Viết theo dạng hai ngoặc nhọn:

\`\`\`
Chào {{ten_khach}}, cảm ơn bạn đã quan tâm sản phẩm.
\`\`\`

Khi gửi, mỗi người nhận được tin có tên riêng của họ thay vì lời chào chung chung.

**Tên biến phải khớp tên cột trong nguồn dữ liệu.** Nếu Sheet của bạn có cột tên là \`Họ tên\` thì biến phải trỏ đúng cột đó — không tự đoán được. Đây là lý do phải bấm **Kiểm tra kết nối** ở khối lấy dữ liệu trước: nó nạp danh sách cột về để bạn chọn cho khớp.

Trình soạn thảo có sẵn danh sách biến gợi ý, bấm để chèn thẳng vào chỗ con trỏ đang đứng.

[ẢNH: trình soạn mẫu, đang mở danh sách biến gợi ý]

# Phân loại mẫu bằng nhãn
Bạn tự tạo nhãn để nhóm mẫu theo cách của mình — ví dụ "Khuyến mãi", "Chăm sóc sau bán", "Nhắc lịch". Nhãn là của riêng tài khoản bạn, không dùng chung với người khác.

Khi thư viện nhiều mẫu, nhãn cộng với ô tìm kiếm giúp tìm nhanh hơn nhiều so với cuộn tay.

# Mẫu bị khoá khi chiến dịch đang chạy
Đây là hành vi hay gây bất ngờ nhất, nên nói kỹ.

Nếu một mẫu **đang được dùng bởi chiến dịch đã kích hoạt**, hệ thống **khoá không cho sửa trực tiếp**. Bạn sẽ thấy thông báo kèm danh sách chiến dịch đang dùng mẫu đó.

Lý do: sửa nội dung giữa chừng làm những người nhận sau đó đọc được thứ khác hẳn những người nhận trước — cùng một chiến dịch mà hai nội dung, rất khó giải thích với khách.

Cách xử lý: bấm **Tạo bản sao để chỉnh sửa**. Bạn được một mẫu mới giống hệt, sửa thoải mái, rồi gắn bản sao đó vào chiến dịch lần sau.

Muốn sửa thẳng mẫu gốc thì phải dừng hoặc gỡ kích hoạt chiến dịch đang dùng nó trước.

[ẢNH: thông báo mẫu bị khoá, thấy nút "Tạo bản sao để chỉnh sửa"]

# Nhờ trợ lý AI viết mẫu
Bạn có thể nhờ trợ lý AI soạn nội dung rồi đưa thẳng vào thư viện. Nội dung AI viết bám theo **Hồ sơ doanh nghiệp** của bạn, nên hồ sơ càng đầy đủ thì bản nháp càng sát, đỡ phải sửa.

Xem [Hồ sơ doanh nghiệp](ai-profile).

# Lỗi thường gặp
- **Gửi đi mà chỗ tên khách bị trống** → Tên biến không khớp tên cột trong nguồn dữ liệu. Mở lại khối lấy dữ liệu, bấm Kiểm tra kết nối, xem đúng tên cột rồi sửa lại mẫu.
- **Bấm sửa mà không sửa được** → Mẫu đang bị khoá do chiến dịch chạy. Tạo bản sao.
- **Xoá mẫu không được** → Cùng lý do trên, mẫu đang được chiến dịch sử dụng.
- **Thêm biến báo đã tồn tại** → Biến đó đã có trong danh sách của mẫu rồi, dùng luôn cái đang có.
- **Mẫu Zalo dài quá bị cắt** → Zalo giới hạn độ dài tin nhắn. Tin ngắn cũng ít bị đánh dấu spam hơn.

# Liên quan
- [Tạo chiến dịch](campaign-create)
- [Hồ sơ doanh nghiệp](ai-profile)
- [Khách hàng: dữ liệu đến từ đâu](khach-hang)`,
    body_html: `<p>Thay vì gõ lại nội dung mỗi lần, bạn soạn sẵn <strong>mẫu</strong> rồi gắn vào chiến dịch. Mẫu dùng lại được nhiều lần và sửa một chỗ áp dụng cho mọi nơi đang dùng.</p><h2>Vào ở đâu</h2><p>Menu <strong>Chiến dịch → Thư viện nội dung</strong>, hoặc <a href="/app/settings/templates">/app/settings/templates</a>.</p><p>Trang chia 2 thẻ: <strong>Email</strong> và <strong>Zalo</strong>. Hai loại mẫu tách riêng vì email có tiêu đề và định dạng phong phú, còn Zalo là tin nhắn văn bản ngắn.</p><p>[ẢNH: Thư viện nội dung, khoanh đỏ 2 thẻ Email / Zalo]</p><h2>Biến — cách gọi đúng tên từng khách</h2><p>Biến là chỗ trống trong mẫu, khi gửi sẽ được thay bằng dữ liệu thật của từng người. Viết theo dạng hai ngoặc nhọn:</p><pre><code>Chào {{ten_khach}}, cảm ơn bạn đã quan tâm sản phẩm.</code></pre><p>Khi gửi, mỗi người nhận được tin có tên riêng của họ thay vì lời chào chung chung.</p><p><strong>Tên biến phải khớp tên cột trong nguồn dữ liệu.</strong> Nếu Sheet của bạn có cột tên là <code>Họ tên</code> thì biến phải trỏ đúng cột đó — không tự đoán được. Đây là lý do phải bấm <strong>Kiểm tra kết nối</strong> ở khối lấy dữ liệu trước: nó nạp danh sách cột về để bạn chọn cho khớp.</p><p>Trình soạn thảo có sẵn danh sách biến gợi ý, bấm để chèn thẳng vào chỗ con trỏ đang đứng.</p><p>[ẢNH: trình soạn mẫu, đang mở danh sách biến gợi ý]</p><h2>Phân loại mẫu bằng nhãn</h2><p>Bạn tự tạo nhãn để nhóm mẫu theo cách của mình — ví dụ &quot;Khuyến mãi&quot;, &quot;Chăm sóc sau bán&quot;, &quot;Nhắc lịch&quot;. Nhãn là của riêng tài khoản bạn, không dùng chung với người khác.</p><p>Khi thư viện nhiều mẫu, nhãn cộng với ô tìm kiếm giúp tìm nhanh hơn nhiều so với cuộn tay.</p><h2>Mẫu bị khoá khi chiến dịch đang chạy</h2><p>Đây là hành vi hay gây bất ngờ nhất, nên nói kỹ.</p><p>Nếu một mẫu <strong>đang được dùng bởi chiến dịch đã kích hoạt</strong>, hệ thống <strong>khoá không cho sửa trực tiếp</strong>. Bạn sẽ thấy thông báo kèm danh sách chiến dịch đang dùng mẫu đó.</p><p>Lý do: sửa nội dung giữa chừng làm những người nhận sau đó đọc được thứ khác hẳn những người nhận trước — cùng một chiến dịch mà hai nội dung, rất khó giải thích với khách.</p><p>Cách xử lý: bấm <strong>Tạo bản sao để chỉnh sửa</strong>. Bạn được một mẫu mới giống hệt, sửa thoải mái, rồi gắn bản sao đó vào chiến dịch lần sau.</p><p>Muốn sửa thẳng mẫu gốc thì phải dừng hoặc gỡ kích hoạt chiến dịch đang dùng nó trước.</p><p>[ẢNH: thông báo mẫu bị khoá, thấy nút &quot;Tạo bản sao để chỉnh sửa&quot;]</p><h2>Nhờ trợ lý AI viết mẫu</h2><p>Bạn có thể nhờ trợ lý AI soạn nội dung rồi đưa thẳng vào thư viện. Nội dung AI viết bám theo <strong>Hồ sơ doanh nghiệp</strong> của bạn, nên hồ sơ càng đầy đủ thì bản nháp càng sát, đỡ phải sửa.</p><p>Xem <a href="ai-profile">Hồ sơ doanh nghiệp</a>.</p><h2>Lỗi thường gặp</h2><ul><li><strong>Gửi đi mà chỗ tên khách bị trống</strong> → Tên biến không khớp tên cột trong nguồn dữ liệu. Mở lại khối lấy dữ liệu, bấm Kiểm tra kết nối, xem đúng tên cột rồi sửa lại mẫu.</li><li><strong>Bấm sửa mà không sửa được</strong> → Mẫu đang bị khoá do chiến dịch chạy. Tạo bản sao.</li><li><strong>Xoá mẫu không được</strong> → Cùng lý do trên, mẫu đang được chiến dịch sử dụng.</li><li><strong>Thêm biến báo đã tồn tại</strong> → Biến đó đã có trong danh sách của mẫu rồi, dùng luôn cái đang có.</li><li><strong>Mẫu Zalo dài quá bị cắt</strong> → Zalo giới hạn độ dài tin nhắn. Tin ngắn cũng ít bị đánh dấu spam hơn.</li></ul><h2>Liên quan</h2><ul><li><a href="campaign-create">Tạo chiến dịch</a></li><li><a href="ai-profile">Hồ sơ doanh nghiệp</a></li><li><a href="khach-hang">Khách hàng: dữ liệu đến từ đâu</a></li></ul>`,
  },
  {
    slug: 'campaign-theo-doi',
    feature_key: 'campaign-create',
    primary_route: '/app/delivery-monitor',
    sort_order: 66,
    title: 'Theo dõi chiến dịch đang chạy',
    summary: 'Xem chiến dịch gửi tới đâu, tốc độ bao nhiêu, lỗi ở đâu — và cách đọc đúng các con số.',
    body_md: `Sau khi bấm chạy, đây là chỗ xem mọi thứ có đang diễn ra đúng không.

# Vào ở đâu
Menu **Chiến dịch → Hiệu quả chiến dịch**, hoặc [/app/delivery-monitor](/app/delivery-monitor).

Lưu ý nhỏ: tên menu là *Hiệu quả chiến dịch* nhưng tiêu đề trong trang ghi *Giám sát gửi tin* — cùng một trang.

Trang tự làm mới sau mỗi 15 giây nếu bạn bật tuỳ chọn đó, nên có thể mở và để đấy theo dõi.

[ẢNH: trang Giám sát gửi tin, thấy các ô số liệu ở đầu trang]

# Bốn con số ở đầu trang
| Số | Nghĩa là |
|---|---|
| **Tin đã gửi** | Số tin hệ thống đã gửi đi thành công |
| **Tin lỗi** | Số tin thất bại, kèm lý do bên dưới |
| **Lượt nhấp liên kết** | Số lần người nhận bấm vào link trong tin |
| **Chiến dịch đang chạy** | Số lượt chạy còn hoạt động lúc này |

Bên dưới còn hai chỉ số dễ nhầm nhau:

- **Tiếp cận** — bao nhiêu **người** đã nhận được, trên tổng số người trong danh sách.
- **Tỷ lệ thành công trên lượt thử** — bao nhiêu **lượt gửi** thành công trên tổng số lần hệ thống thử gửi.

Hai số này khác nhau vì một người có thể được thử gửi nhiều lần. Muốn biết *"đã tới tay bao nhiêu khách"* thì đọc **Tiếp cận**.

# Xem từng chiến dịch
Mục **Chiến dịch gần đây** liệt kê các lượt chạy trong khoảng thời gian bạn chọn, mới nhất trước. Mỗi dòng có:

- **Trạng thái** — đang chạy, hoàn thành, hay lỗi
- **Thành công / tổng** — tiến độ
- **Tốc độ** — số tin mỗi giờ
- **Tỷ lệ lỗi**
- **Thời lượng** — đã chạy bao lâu

Với chiến dịch Zalo, **tốc độ khoảng 30 tin mỗi giờ là bình thường**, không phải chậm bất thường. Xem [Vì sao Zalo gửi chậm hoặc đang dừng](zalo-gui-cham).

# Hiệu quả theo kênh và tốc độ theo giờ
Mục **Hiệu quả theo kênh** tách riêng Email và Zalo, kèm số gửi thành công, số lỗi và số click của từng kênh. Đây là chỗ so sánh xem kênh nào đang hiệu quả hơn với khách của bạn.

Biểu đồ **Tốc độ gửi theo giờ** cho thấy nhịp gửi. Với Zalo, bạn sẽ thấy rõ khoảng trống từ 23:00 đến 06:00 — đó là giờ nghỉ theo thiết kế, không phải sự cố.

# Tình trạng tài khoản và cảnh báo
Mục **Tình trạng tài khoản & hàng đợi** cảnh báo khi có dấu hiệu bất thường.

Cảnh báo đáng chú ý nhất: **Zalo không xác nhận phát tin**. Nghĩa là hệ thống gửi đi nhưng Zalo không báo lại là đã phát — thường liên quan tới giới hạn hoặc cơ chế chống spam của Zalo.

Gặp cảnh báo này thì nên giãn nhịp gửi và kiểm tra lại tài khoản Zalo, đừng cố đẩy nhanh — nguy cơ bị khoá tài khoản là thật.

# Lỗi gần đây
Mục **Lỗi gần đây** liệt kê các tin thất bại kèm nguyên nhân. Đây là chỗ đầu tiên nên xem khi thấy tỷ lệ lỗi cao.

Vài nguyên nhân hay gặp và cách hiểu:

- **Lỗi xác thực email** → Sai thông tin SMTP. Xem [Thêm tài khoản Email](email-account).
- **Địa chỉ email không tồn tại** → Hệ thống ghi nhận và không gửi lại địa chỉ đó nữa.
- **Tài khoản Zalo mất kết nối** → Quét lại QR. Xem [Thêm tài khoản Zalo](zalo-account).
- **Số điện thoại chưa dùng Zalo** → Không gửi được cho người đó, phần còn lại vẫn chạy bình thường.

# Lỗi thường gặp
- **Trang trống, báo chưa có dữ liệu** → Chọn khoảng thời gian rộng hơn, hoặc bạn chưa chạy chiến dịch nào trong khoảng đó.
- **Số Tiếp cận thấp hơn Tin đã gửi** → Bình thường, vì một người có thể nhận nhiều tin trong cùng chiến dịch.
- **Tỷ lệ lỗi cao đột ngột** → Xem ngay mục Lỗi gần đây. Thường là kênh gửi mất kết nối chứ không phải danh sách sai.
- **Chiến dịch hiện đang chạy mà tốc độ bằng 0** → Đang trong giờ nghỉ của Zalo, hoặc đang chờ tới lượt gửi tiếp theo.

# Liên quan
- [Vì sao Zalo gửi chậm hoặc đang dừng](zalo-gui-cham)
- [Tạo chiến dịch](campaign-create)
- [Kết nối kênh gửi](channels)`,
    body_html: `<p>Sau khi bấm chạy, đây là chỗ xem mọi thứ có đang diễn ra đúng không.</p><h2>Vào ở đâu</h2><p>Menu <strong>Chiến dịch → Hiệu quả chiến dịch</strong>, hoặc <a href="/app/delivery-monitor">/app/delivery-monitor</a>.</p><p>Lưu ý nhỏ: tên menu là <em>Hiệu quả chiến dịch</em> nhưng tiêu đề trong trang ghi <em>Giám sát gửi tin</em> — cùng một trang.</p><p>Trang tự làm mới sau mỗi 15 giây nếu bạn bật tuỳ chọn đó, nên có thể mở và để đấy theo dõi.</p><p>[ẢNH: trang Giám sát gửi tin, thấy các ô số liệu ở đầu trang]</p><h2>Bốn con số ở đầu trang</h2><table><thead><tr><th>Số</th><th>Nghĩa là</th></tr></thead><tbody><tr><td><strong>Tin đã gửi</strong></td><td>Số tin hệ thống đã gửi đi thành công</td></tr><tr><td><strong>Tin lỗi</strong></td><td>Số tin thất bại, kèm lý do bên dưới</td></tr><tr><td><strong>Lượt nhấp liên kết</strong></td><td>Số lần người nhận bấm vào link trong tin</td></tr><tr><td><strong>Chiến dịch đang chạy</strong></td><td>Số lượt chạy còn hoạt động lúc này</td></tr></tbody></table><p>Bên dưới còn hai chỉ số dễ nhầm nhau:</p><ul><li><strong>Tiếp cận</strong> — bao nhiêu <strong>người</strong> đã nhận được, trên tổng số người trong danh sách.</li><li><strong>Tỷ lệ thành công trên lượt thử</strong> — bao nhiêu <strong>lượt gửi</strong> thành công trên tổng số lần hệ thống thử gửi.</li></ul><p>Hai số này khác nhau vì một người có thể được thử gửi nhiều lần. Muốn biết <em>&quot;đã tới tay bao nhiêu khách&quot;</em> thì đọc <strong>Tiếp cận</strong>.</p><h2>Xem từng chiến dịch</h2><p>Mục <strong>Chiến dịch gần đây</strong> liệt kê các lượt chạy trong khoảng thời gian bạn chọn, mới nhất trước. Mỗi dòng có:</p><ul><li><strong>Trạng thái</strong> — đang chạy, hoàn thành, hay lỗi</li><li><strong>Thành công / tổng</strong> — tiến độ</li><li><strong>Tốc độ</strong> — số tin mỗi giờ</li><li><strong>Tỷ lệ lỗi</strong></li><li><strong>Thời lượng</strong> — đã chạy bao lâu</li></ul><p>Với chiến dịch Zalo, <strong>tốc độ khoảng 30 tin mỗi giờ là bình thường</strong>, không phải chậm bất thường. Xem <a href="zalo-gui-cham">Vì sao Zalo gửi chậm hoặc đang dừng</a>.</p><h2>Hiệu quả theo kênh và tốc độ theo giờ</h2><p>Mục <strong>Hiệu quả theo kênh</strong> tách riêng Email và Zalo, kèm số gửi thành công, số lỗi và số click của từng kênh. Đây là chỗ so sánh xem kênh nào đang hiệu quả hơn với khách của bạn.</p><p>Biểu đồ <strong>Tốc độ gửi theo giờ</strong> cho thấy nhịp gửi. Với Zalo, bạn sẽ thấy rõ khoảng trống từ 23:00 đến 06:00 — đó là giờ nghỉ theo thiết kế, không phải sự cố.</p><h2>Tình trạng tài khoản và cảnh báo</h2><p>Mục <strong>Tình trạng tài khoản &amp; hàng đợi</strong> cảnh báo khi có dấu hiệu bất thường.</p><p>Cảnh báo đáng chú ý nhất: <strong>Zalo không xác nhận phát tin</strong>. Nghĩa là hệ thống gửi đi nhưng Zalo không báo lại là đã phát — thường liên quan tới giới hạn hoặc cơ chế chống spam của Zalo.</p><p>Gặp cảnh báo này thì nên giãn nhịp gửi và kiểm tra lại tài khoản Zalo, đừng cố đẩy nhanh — nguy cơ bị khoá tài khoản là thật.</p><h2>Lỗi gần đây</h2><p>Mục <strong>Lỗi gần đây</strong> liệt kê các tin thất bại kèm nguyên nhân. Đây là chỗ đầu tiên nên xem khi thấy tỷ lệ lỗi cao.</p><p>Vài nguyên nhân hay gặp và cách hiểu:</p><ul><li><strong>Lỗi xác thực email</strong> → Sai thông tin SMTP. Xem <a href="email-account">Thêm tài khoản Email</a>.</li><li><strong>Địa chỉ email không tồn tại</strong> → Hệ thống ghi nhận và không gửi lại địa chỉ đó nữa.</li><li><strong>Tài khoản Zalo mất kết nối</strong> → Quét lại QR. Xem <a href="zalo-account">Thêm tài khoản Zalo</a>.</li><li><strong>Số điện thoại chưa dùng Zalo</strong> → Không gửi được cho người đó, phần còn lại vẫn chạy bình thường.</li></ul><h2>Lỗi thường gặp</h2><ul><li><strong>Trang trống, báo chưa có dữ liệu</strong> → Chọn khoảng thời gian rộng hơn, hoặc bạn chưa chạy chiến dịch nào trong khoảng đó.</li><li><strong>Số Tiếp cận thấp hơn Tin đã gửi</strong> → Bình thường, vì một người có thể nhận nhiều tin trong cùng chiến dịch.</li><li><strong>Tỷ lệ lỗi cao đột ngột</strong> → Xem ngay mục Lỗi gần đây. Thường là kênh gửi mất kết nối chứ không phải danh sách sai.</li><li><strong>Chiến dịch hiện đang chạy mà tốc độ bằng 0</strong> → Đang trong giờ nghỉ của Zalo, hoặc đang chờ tới lượt gửi tiếp theo.</li></ul><h2>Liên quan</h2><ul><li><a href="zalo-gui-cham">Vì sao Zalo gửi chậm hoặc đang dừng</a></li><li><a href="campaign-create">Tạo chiến dịch</a></li><li><a href="channels">Kết nối kênh gửi</a></li></ul>`,
  },
  {
    slug: 'getting-started',
    feature_key: 'getting-started',
    primary_route: '/app',
    sort_order: 5,
    title: 'Bắt đầu với Founder AI — 4 bước',
    summary: 'Bốn bước từ lúc mới đăng ký tới lúc gửi được tin đầu tiên, kèm thứ tự nên làm và lý do.',
    body_md: `Mới tạo tài khoản và chưa biết bắt đầu từ đâu? Làm đúng bốn bước dưới đây là bạn gửi được tin đầu tiên. Mỗi bước đều có bài riêng nếu cần chi tiết.

Đừng đảo thứ tự — bước sau cần kết quả của bước trước.

# Bước 1 — Khai báo hồ sơ doanh nghiệp
Vào [/app/settings/ai-profile](/app/settings/ai-profile) (menu **Cài đặt → Hồ sơ doanh nghiệp**), điền tên doanh nghiệp, sản phẩm, đối tượng khách và giọng điệu bạn muốn dùng.

Làm việc này trước vì trợ lý AI lấy hồ sơ làm ngữ cảnh cho mọi nội dung nó viết. Bỏ trống thì AI viết ra thứ chung chung, không nhắc đúng tên sản phẩm của bạn — và bạn sẽ mất thời gian sửa từng bài.

Viết ít nhất 3–5 câu cụ thể. Hồ sơ càng rõ, nội dung AI đề xuất càng đỡ phải sửa.

→ Chi tiết: [Hồ sơ doanh nghiệp](ai-profile)

# Bước 2 — Nối kênh gửi
Vào [/app/settings/channels](/app/settings/channels) (menu **Chiến dịch → Quản lý kênh gửi**), nối ít nhất **một** kênh:

- **Email** — khai báo thông tin SMTP của hộp thư bạn đang dùng. Thư gửi đi mang địa chỉ của bạn.
- **Zalo** — quét mã QR bằng app Zalo trên điện thoại, đợi trạng thái **Đã kết nối**.

Chưa nối kênh nào thì Gửi nhanh và Chiến dịch đều không chạy được — hệ thống không có gì để gửi đi.

[ẢNH: trang Quản lý kênh gửi, thẻ Zalo đã hiện trạng thái "Đã kết nối"]

Chưa biết chọn kênh nào thì nhớ: **Email nhanh, Zalo chậm.** Zalo mỗi tin cách nhau 80–150 giây và nghỉ hẳn từ 23:00 đến 06:00, nên không hợp để gửi gấp cho danh sách lớn.

→ Chi tiết: [Kết nối kênh gửi](channels) · [Thêm tài khoản Email](email-account) · [Thêm tài khoản Zalo](zalo-account)

# Bước 3 — Gửi thử cho chính mình
Vào [/app/quick-send](/app/quick-send) (menu **Chiến dịch → Gửi nhanh**), chọn kênh vừa nối, gửi thử tới **chính email hoặc số Zalo của bạn**.

[ẢNH: trang Gửi nhanh, đã chọn kênh và điền người nhận là chính mình]

Bước này mất 2 phút và đừng bao giờ bỏ qua. Nó cho biết ngay kênh đã chạy thật hay chưa. Phát hiện sai cấu hình ở đây rẻ hơn rất nhiều so với phát hiện lúc chiến dịch đã gửi được nửa danh sách — tin đã gửi thì không thu hồi được.

→ Chi tiết: [Gửi nhanh](quick-send)

# Bước 4 — Tạo chiến dịch đầu tiên
Vào [/app/campaigns/new](/app/campaigns/new) (menu **Chiến dịch → Quản lý chiến dịch**), dựng luồng gửi bằng cách nối các khối lại với nhau: lấy dữ liệu khách → gửi email hoặc Zalo → kết thúc.

Nguồn dữ liệu khách phổ biến nhất là **Google Sheet**. Chuẩn bị sẵn một file có cột tên, số điện thoại hoặc email trước khi vào bước này.

[ẢNH: builder chiến dịch với luồng đơn giản: lấy dữ liệu → gửi tin → kết thúc]

Chưa quen dựng luồng thì gõ cho trợ lý AI một câu như *"tạo giúp tôi chiến dịch giới thiệu sản phẩm mới cho khách cũ"* — trợ lý dựng sẵn bản nháp để bạn sửa lại.

→ Chi tiết: [Tạo chiến dịch](campaign-create) · [Khách hàng: dữ liệu đến từ đâu](khach-hang)

# Sau bốn bước thì làm gì
- Xem chiến dịch chạy tới đâu tại [/app/delivery-monitor](/app/delivery-monitor).
- Xem hạn mức còn lại và lịch sử đơn tại [/app/billing](/app/billing).
- Sắp hết tin hoặc lượt AI thì mua thêm — xem [Gói dịch vụ & thanh toán](plan-and-billing).

# Lỗi thường gặp khi mới bắt đầu
- **Không thấy Hồ sơ doanh nghiệp, Mua thêm hay Nhân viên** → Những trang này chỉ **chủ tài khoản** vào được. Nếu bạn đăng nhập bằng tài khoản nhân viên thì sẽ không thấy.
- **Zalo không gửi gì vào buổi tối** → Hệ thống nghỉ gửi Zalo từ 23:00 đến 06:00 để tài khoản không bị đánh dấu spam. Chiến dịch tự chạy tiếp lúc 6 giờ sáng.
- **Zalo gửi rất chậm, tưởng treo** → Đúng như thiết kế. Xem [Vì sao Zalo gửi chậm hoặc đang dừng](zalo-gui-cham).
- **Gói dùng thử sắp hết mà chưa kịp thử gì** → Xem [Gói dùng thử: có gì và hết hạn thì sao](dung-thu).

# Liên quan
- [Gói dùng thử: có gì và hết hạn thì sao](dung-thu)
- [Kết nối kênh gửi](channels)
- [Khách hàng: dữ liệu đến từ đâu](khach-hang)`,
    body_html: `<p>Mới tạo tài khoản và chưa biết bắt đầu từ đâu? Làm đúng bốn bước dưới đây là bạn gửi được tin đầu tiên. Mỗi bước đều có bài riêng nếu cần chi tiết.</p><p>Đừng đảo thứ tự — bước sau cần kết quả của bước trước.</p><h2>Bước 1 — Khai báo hồ sơ doanh nghiệp</h2><p>Vào <a href="/app/settings/ai-profile">/app/settings/ai-profile</a> (menu <strong>Cài đặt → Hồ sơ doanh nghiệp</strong>), điền tên doanh nghiệp, sản phẩm, đối tượng khách và giọng điệu bạn muốn dùng.</p><p>Làm việc này trước vì trợ lý AI lấy hồ sơ làm ngữ cảnh cho mọi nội dung nó viết. Bỏ trống thì AI viết ra thứ chung chung, không nhắc đúng tên sản phẩm của bạn — và bạn sẽ mất thời gian sửa từng bài.</p><p>Viết ít nhất 3–5 câu cụ thể. Hồ sơ càng rõ, nội dung AI đề xuất càng đỡ phải sửa.</p><p>→ Chi tiết: <a href="ai-profile">Hồ sơ doanh nghiệp</a></p><h2>Bước 2 — Nối kênh gửi</h2><p>Vào <a href="/app/settings/channels">/app/settings/channels</a> (menu <strong>Chiến dịch → Quản lý kênh gửi</strong>), nối ít nhất <strong>một</strong> kênh:</p><ul><li><strong>Email</strong> — khai báo thông tin SMTP của hộp thư bạn đang dùng. Thư gửi đi mang địa chỉ của bạn.</li><li><strong>Zalo</strong> — quét mã QR bằng app Zalo trên điện thoại, đợi trạng thái <strong>Đã kết nối</strong>.</li></ul><p>Chưa nối kênh nào thì Gửi nhanh và Chiến dịch đều không chạy được — hệ thống không có gì để gửi đi.</p><p>[ẢNH: trang Quản lý kênh gửi, thẻ Zalo đã hiện trạng thái &quot;Đã kết nối&quot;]</p><p>Chưa biết chọn kênh nào thì nhớ: <strong>Email nhanh, Zalo chậm.</strong> Zalo mỗi tin cách nhau 80–150 giây và nghỉ hẳn từ 23:00 đến 06:00, nên không hợp để gửi gấp cho danh sách lớn.</p><p>→ Chi tiết: <a href="channels">Kết nối kênh gửi</a> · <a href="email-account">Thêm tài khoản Email</a> · <a href="zalo-account">Thêm tài khoản Zalo</a></p><h2>Bước 3 — Gửi thử cho chính mình</h2><p>Vào <a href="/app/quick-send">/app/quick-send</a> (menu <strong>Chiến dịch → Gửi nhanh</strong>), chọn kênh vừa nối, gửi thử tới <strong>chính email hoặc số Zalo của bạn</strong>.</p><p>[ẢNH: trang Gửi nhanh, đã chọn kênh và điền người nhận là chính mình]</p><p>Bước này mất 2 phút và đừng bao giờ bỏ qua. Nó cho biết ngay kênh đã chạy thật hay chưa. Phát hiện sai cấu hình ở đây rẻ hơn rất nhiều so với phát hiện lúc chiến dịch đã gửi được nửa danh sách — tin đã gửi thì không thu hồi được.</p><p>→ Chi tiết: <a href="quick-send">Gửi nhanh</a></p><h2>Bước 4 — Tạo chiến dịch đầu tiên</h2><p>Vào <a href="/app/campaigns/new">/app/campaigns/new</a> (menu <strong>Chiến dịch → Quản lý chiến dịch</strong>), dựng luồng gửi bằng cách nối các khối lại với nhau: lấy dữ liệu khách → gửi email hoặc Zalo → kết thúc.</p><p>Nguồn dữ liệu khách phổ biến nhất là <strong>Google Sheet</strong>. Chuẩn bị sẵn một file có cột tên, số điện thoại hoặc email trước khi vào bước này.</p><p>[ẢNH: builder chiến dịch với luồng đơn giản: lấy dữ liệu → gửi tin → kết thúc]</p><p>Chưa quen dựng luồng thì gõ cho trợ lý AI một câu như <em>&quot;tạo giúp tôi chiến dịch giới thiệu sản phẩm mới cho khách cũ&quot;</em> — trợ lý dựng sẵn bản nháp để bạn sửa lại.</p><p>→ Chi tiết: <a href="campaign-create">Tạo chiến dịch</a> · <a href="khach-hang">Khách hàng: dữ liệu đến từ đâu</a></p><h2>Sau bốn bước thì làm gì</h2><ul><li>Xem chiến dịch chạy tới đâu tại <a href="/app/delivery-monitor">/app/delivery-monitor</a>.</li><li>Xem hạn mức còn lại và lịch sử đơn tại <a href="/app/billing">/app/billing</a>.</li><li>Sắp hết tin hoặc lượt AI thì mua thêm — xem <a href="plan-and-billing">Gói dịch vụ &amp; thanh toán</a>.</li></ul><h2>Lỗi thường gặp khi mới bắt đầu</h2><ul><li><strong>Không thấy Hồ sơ doanh nghiệp, Mua thêm hay Nhân viên</strong> → Những trang này chỉ <strong>chủ tài khoản</strong> vào được. Nếu bạn đăng nhập bằng tài khoản nhân viên thì sẽ không thấy.</li><li><strong>Zalo không gửi gì vào buổi tối</strong> → Hệ thống nghỉ gửi Zalo từ 23:00 đến 06:00 để tài khoản không bị đánh dấu spam. Chiến dịch tự chạy tiếp lúc 6 giờ sáng.</li><li><strong>Zalo gửi rất chậm, tưởng treo</strong> → Đúng như thiết kế. Xem <a href="zalo-gui-cham">Vì sao Zalo gửi chậm hoặc đang dừng</a>.</li><li><strong>Gói dùng thử sắp hết mà chưa kịp thử gì</strong> → Xem <a href="dung-thu">Gói dùng thử: có gì và hết hạn thì sao</a>.</li></ul><h2>Liên quan</h2><ul><li><a href="dung-thu">Gói dùng thử: có gì và hết hạn thì sao</a></li><li><a href="channels">Kết nối kênh gửi</a></li><li><a href="khach-hang">Khách hàng: dữ liệu đến từ đâu</a></li></ul>`,
  },
  {
    slug: 'dung-thu',
    feature_key: 'getting-started',
    primary_route: '/app/billing',
    sort_order: 7,
    title: 'Gói dùng thử: có gì và hết hạn thì sao',
    summary: 'Tài khoản mới được cấp gói dùng thử tự động. Bài này nói rõ bạn có gì, xem hạn mức ở đâu và điều gì xảy ra khi hết hạn.',
    body_md: `Mỗi tài khoản đăng ký mới đều được **tự động cấp gói dùng thử miễn phí**, không cần nhập thẻ. Đăng ký bằng Google hay bằng email đều như nhau.

Ngay sau khi vào lần đầu, bạn thấy một hộp thoại chào mừng ghi rõ tên gói, thời hạn và **ngày hết hạn cụ thể của bạn**.

[ẢNH: hộp thoại chào mừng gói dùng thử, thấy rõ tên gói và ngày hết hạn]

# Bạn có gì trong thời gian dùng thử
Hộp thoại chào mừng liệt kê đúng quyền lợi của bạn: số tin nhắn gửi được, số lượt dùng trợ lý AI, và số chatbot được tạo.

Con số cụ thể có thể thay đổi theo thời điểm, nên **đừng nhớ theo bài này** — hãy xem tại [/app/billing](/app/billing) (menu **Gói dịch vụ → Tổng quan gói**). Trang đó luôn hiện đúng hạn mức còn lại của riêng bạn.

Thời hạn mặc định là **10 ngày**.

# Nên dùng 10 ngày đó thế nào
Thời gian ngắn, nên đừng dàn trải. Thứ tự hiệu quả nhất:

1. **Ngày đầu** — khai báo hồ sơ doanh nghiệp và nối một kênh gửi. Xem [Bắt đầu với Founder AI](getting-started).
2. **Ngay sau đó** — gửi thử cho chính mình để chắc kênh chạy được.
3. **Vài ngày giữa** — chạy một chiến dịch thật nhưng với danh sách nhỏ, khoảng vài chục người. Đủ để thấy kết quả mà không tiêu hết hạn mức.
4. **Trước khi hết hạn** — xem báo cáo tại [/app/delivery-monitor](/app/delivery-monitor) rồi quyết định có nâng gói không.

Đừng để dành hạn mức tới ngày cuối. Hạn mức của gói **không cộng dồn sang kỳ sau**, dùng không hết là mất.

# Hết hạn thì chuyện gì xảy ra
Đây là phần nhiều người lo nhất, nên nói rõ:

**Bạn không mất dữ liệu.** Chiến dịch, mẫu nội dung, danh sách khách, landing page và chatbot đều còn nguyên. Hệ thống chỉ **tạm khoá** chứ không xoá.

Khi bạn nâng gói, mọi thứ dùng lại được ngay, không phải làm lại từ đầu.

Trong lúc chờ, những thứ đã tạo vượt quá hạn mức gói mới sẽ bị khoá. Bạn được **tự chọn giữ cái nào** tại [/app/billing](/app/billing), mục **Tài nguyên khoá** — tick những cái quan trọng nhất để giữ lại trong hạn mức còn hiệu lực.

Lưu ý: tài nguyên bị khoá vẫn chiếm chỗ. Muốn tạo cái mới thì phải xoá cái đang khoá trước.

# Mỗi tài khoản chỉ dùng thử một lần
Gói dùng thử cấp một lần cho mỗi tài khoản. Đăng ký thêm tài khoản mới bằng email khác để dùng thử tiếp **không phải cách dùng đúng** — dữ liệu của bạn sẽ nằm rải rác ở nhiều nơi không gộp lại được, và mọi thứ đã dựng ở tài khoản cũ đều không mang sang được.

Cần thêm thời gian đánh giá thì liên hệ hỗ trợ, đừng tạo tài khoản mới.

# Lỗi thường gặp
- **Không thấy hộp thoại chào mừng** → Hộp thoại chỉ hiện một lần và tắt đi là không hiện lại. Mọi thông tin trong đó đều xem lại được tại [/app/billing](/app/billing).
- **Không thấy trang Tổng quan gói hay Mua thêm** → Hai trang này chỉ **chủ tài khoản** vào được. Tài khoản nhân viên không thấy.
- **Muốn nâng gói giữa chừng, sợ mất phần chưa dùng** → Cứ nâng. Dữ liệu và cấu hình giữ nguyên hết.
- **Đã thanh toán mà hạn mức chưa tăng** → Đợi vài phút rồi tải lại trang, hệ thống cần nhận xác nhận từ cổng thanh toán. Quá 15 phút vẫn chưa thấy thì liên hệ hỗ trợ kèm **mã đơn** — đơn không mất đi đâu.

# Liên quan
- [Bắt đầu với Founder AI — 4 bước](getting-started)
- [Gói dịch vụ & thanh toán](plan-and-billing)
- [Câu hỏi thường gặp về thanh toán & hoá đơn](faq-billing)`,
    body_html: `<p>Mỗi tài khoản đăng ký mới đều được <strong>tự động cấp gói dùng thử miễn phí</strong>, không cần nhập thẻ. Đăng ký bằng Google hay bằng email đều như nhau.</p><p>Ngay sau khi vào lần đầu, bạn thấy một hộp thoại chào mừng ghi rõ tên gói, thời hạn và <strong>ngày hết hạn cụ thể của bạn</strong>.</p><p>[ẢNH: hộp thoại chào mừng gói dùng thử, thấy rõ tên gói và ngày hết hạn]</p><h2>Bạn có gì trong thời gian dùng thử</h2><p>Hộp thoại chào mừng liệt kê đúng quyền lợi của bạn: số tin nhắn gửi được, số lượt dùng trợ lý AI, và số chatbot được tạo.</p><p>Con số cụ thể có thể thay đổi theo thời điểm, nên <strong>đừng nhớ theo bài này</strong> — hãy xem tại <a href="/app/billing">/app/billing</a> (menu <strong>Gói dịch vụ → Tổng quan gói</strong>). Trang đó luôn hiện đúng hạn mức còn lại của riêng bạn.</p><p>Thời hạn mặc định là <strong>10 ngày</strong>.</p><h2>Nên dùng 10 ngày đó thế nào</h2><p>Thời gian ngắn, nên đừng dàn trải. Thứ tự hiệu quả nhất:</p><ol><li><strong>Ngày đầu</strong> — khai báo hồ sơ doanh nghiệp và nối một kênh gửi. Xem <a href="getting-started">Bắt đầu với Founder AI</a>.</li><li><strong>Ngay sau đó</strong> — gửi thử cho chính mình để chắc kênh chạy được.</li><li><strong>Vài ngày giữa</strong> — chạy một chiến dịch thật nhưng với danh sách nhỏ, khoảng vài chục người. Đủ để thấy kết quả mà không tiêu hết hạn mức.</li><li><strong>Trước khi hết hạn</strong> — xem báo cáo tại <a href="/app/delivery-monitor">/app/delivery-monitor</a> rồi quyết định có nâng gói không.</li></ol><p>Đừng để dành hạn mức tới ngày cuối. Hạn mức của gói <strong>không cộng dồn sang kỳ sau</strong>, dùng không hết là mất.</p><h2>Hết hạn thì chuyện gì xảy ra</h2><p>Đây là phần nhiều người lo nhất, nên nói rõ:</p><p><strong>Bạn không mất dữ liệu.</strong> Chiến dịch, mẫu nội dung, danh sách khách, landing page và chatbot đều còn nguyên. Hệ thống chỉ <strong>tạm khoá</strong> chứ không xoá.</p><p>Khi bạn nâng gói, mọi thứ dùng lại được ngay, không phải làm lại từ đầu.</p><p>Trong lúc chờ, những thứ đã tạo vượt quá hạn mức gói mới sẽ bị khoá. Bạn được <strong>tự chọn giữ cái nào</strong> tại <a href="/app/billing">/app/billing</a>, mục <strong>Tài nguyên khoá</strong> — tick những cái quan trọng nhất để giữ lại trong hạn mức còn hiệu lực.</p><p>Lưu ý: tài nguyên bị khoá vẫn chiếm chỗ. Muốn tạo cái mới thì phải xoá cái đang khoá trước.</p><h2>Mỗi tài khoản chỉ dùng thử một lần</h2><p>Gói dùng thử cấp một lần cho mỗi tài khoản. Đăng ký thêm tài khoản mới bằng email khác để dùng thử tiếp <strong>không phải cách dùng đúng</strong> — dữ liệu của bạn sẽ nằm rải rác ở nhiều nơi không gộp lại được, và mọi thứ đã dựng ở tài khoản cũ đều không mang sang được.</p><p>Cần thêm thời gian đánh giá thì liên hệ hỗ trợ, đừng tạo tài khoản mới.</p><h2>Lỗi thường gặp</h2><ul><li><strong>Không thấy hộp thoại chào mừng</strong> → Hộp thoại chỉ hiện một lần và tắt đi là không hiện lại. Mọi thông tin trong đó đều xem lại được tại <a href="/app/billing">/app/billing</a>.</li><li><strong>Không thấy trang Tổng quan gói hay Mua thêm</strong> → Hai trang này chỉ <strong>chủ tài khoản</strong> vào được. Tài khoản nhân viên không thấy.</li><li><strong>Muốn nâng gói giữa chừng, sợ mất phần chưa dùng</strong> → Cứ nâng. Dữ liệu và cấu hình giữ nguyên hết.</li><li><strong>Đã thanh toán mà hạn mức chưa tăng</strong> → Đợi vài phút rồi tải lại trang, hệ thống cần nhận xác nhận từ cổng thanh toán. Quá 15 phút vẫn chưa thấy thì liên hệ hỗ trợ kèm <strong>mã đơn</strong> — đơn không mất đi đâu.</li></ul><h2>Liên quan</h2><ul><li><a href="getting-started">Bắt đầu với Founder AI — 4 bước</a></li><li><a href="plan-and-billing">Gói dịch vụ &amp; thanh toán</a></li><li><a href="faq-billing">Câu hỏi thường gặp về thanh toán &amp; hoá đơn</a></li></ul>`,
  },
  {
    slug: 'khach-hang',
    feature_key: 'khach-hang',
    primary_route: '/app/customers',
    sort_order: 70,
    title: 'Khách hàng: dữ liệu đến từ đâu và xem ở đâu',
    summary: 'Founder AI không có trang nhập danh sách riêng — dữ liệu khách đi vào qua khối lấy dữ liệu trong chiến dịch. Bài này chỉ rõ từng nguồn.',
    body_md: `Đây là chỗ nhiều người mới hiểu nhầm, nên nói thẳng trước:

**Founder AI không có trang "nhập danh sách khách hàng" riêng.** Bạn không tải file lên ở một chỗ nào đó rồi mới dùng. Thay vào đó, danh sách người nhận được **lấy vào ngay trong chiến dịch**, bằng một khối gọi là khối lấy dữ liệu.

Cách làm này giúp mỗi chiến dịch tự chọn nguồn riêng — chiến dịch này gửi cho khách trong Google Sheet, chiến dịch kia gửi cho người điền form landing page, không cần trộn chung một danh bạ.

# Bốn nguồn dữ liệu bạn có thể dùng
Khi dựng chiến dịch tại [/app/campaigns/new](/app/campaigns/new), thêm một trong các khối sau vào đầu luồng:

| Khối | Lấy dữ liệu từ | Hợp khi nào |
|---|---|---|
| **Đọc dữ liệu Sheet** | Một file Google Sheet của bạn | Đây là cách phổ biến nhất. Bạn có sẵn danh sách trong Excel/Sheet |
| **Dữ liệu landing page** | Người đã điền form trên landing page của bạn | Chăm sóc khách mới để lại thông tin |
| **Lấy dữ liệu khách** | Khách đã lưu trong hệ thống từ chiến dịch trước | Gửi lại cho người đã từng tương tác |
| **Lấy danh sách bạn bè Zalo** | Danh bạ của tài khoản Zalo đã nối | Nhắn cho bạn bè Zalo sẵn có |

Ngoài ra còn khối **Lấy thông tin nhóm Zalo** nếu bạn muốn gửi vào nhóm thay vì gửi cho từng người.

# Dùng Google Sheet — cách phổ biến nhất
Chuẩn bị file trước cho đúng thì các bước sau rất nhanh.

## Chuẩn bị file Sheet
1. Tạo một Google Sheet, **dòng đầu là tiêu đề cột** — ví dụ: Họ tên, Số điện thoại, Email.
2. Dữ liệu thật bắt đầu từ dòng ngay dưới tiêu đề.
3. **Chia sẻ quyền đọc cho file** — nếu để riêng tư hoàn toàn, hệ thống không đọc được.

## Khai báo trong chiến dịch
1. Thêm khối **Đọc dữ liệu Sheet** vào luồng.
2. Dán **URL Google Sheet** vào ô tương ứng.
3. Điền **Tên Sheet** — là tên tab ở đáy file, thường là \`Sheet1\`.
4. Điền **Dòng tiêu đề** và **Dòng bắt đầu dữ liệu**. Nếu tiêu đề ở dòng 1 và dữ liệu từ dòng 2 thì điền lần lượt là 1 và 2.
5. Bấm **Kiểm tra kết nối**.

Bước 5 quan trọng: nó vừa kiểm tra file có đọc được không, **vừa tải danh sách tên cột về**. Chưa bấm nút này thì các khối phía sau chưa biết file của bạn có những cột nào để chèn vào nội dung tin nhắn.

[ẢNH: khối Đọc dữ liệu Sheet đã điền URL, khoanh đỏ nút "Kiểm tra kết nối"]

Sau khi kiểm tra thành công, danh sách cột hiện ra ngay bên dưới. Đó là những cột bạn dùng được để cá nhân hoá nội dung.

[ẢNH: danh sách cột hiện ra sau khi kiểm tra kết nối thành công]

# Một điểm dễ nhầm khi chạy thử
Trong builder có tuỳ chọn **Số dòng tối đa khi chạy thử**, mặc định 100 dòng.

Con số này **chỉ áp dụng khi bạn bấm Chạy ngay trong builder** để xem thử. Khi chạy thật từ trang **Chạy chiến dịch**, hệ thống đọc đủ toàn bộ dòng trong Sheet, không bị giới hạn bởi tuỳ chọn này.

Nói cách khác: thấy chạy thử chỉ ra 100 người thì đừng lo mất dữ liệu.

# Xem khách hàng của chiến dịch ở đâu
Vào [/app/customers](/app/customers) — menu **Chiến dịch → Khách hàng từ chiến dịch**.

Đúng như tên gọi, trang này **liệt kê chiến dịch trước**, không phải danh bạ chung. Bấm vào một chiến dịch để xem những ai đã tham gia chiến dịch đó.

Trong đó bạn xem được từng khách: thông tin liên hệ, trạng thái, hành trình đã đi qua và các tin nhắn đã gửi cho họ.

[ẢNH: trang Khách hàng từ chiến dịch, danh sách chiến dịch kèm số khách]

# Lỗi thường gặp
- **Kiểm tra kết nối báo lỗi** → File Sheet chưa được chia sẻ quyền đọc. Mở file, đổi quyền truy cập rồi thử lại.
- **Kết nối được nhưng không thấy cột nào** → Sai số **Dòng tiêu đề**, hoặc sai **Tên Sheet** khi file có nhiều tab.
- **Chiến dịch chạy nhưng không có người nhận nào** → Số **Dòng bắt đầu dữ liệu** đang trỏ vào dòng trống, hoặc trỏ nhầm vào chính dòng tiêu đề.
- **Trang Khách hàng trống trơn** → Bạn chưa chạy chiến dịch nào. Trang này liệt kê theo chiến dịch nên chưa có chiến dịch thì chưa có gì để xem.
- **Muốn tìm một khách cụ thể mà không nhớ ở chiến dịch nào** → Hiện phải vào từng chiến dịch để tìm, chưa có tìm kiếm chung toàn bộ khách.

# Liên quan
- [Tạo chiến dịch](campaign-create)
- [Bắt đầu với Founder AI — 4 bước](getting-started)
- [Gửi nhanh](quick-send)`,
    body_html: `<p>Đây là chỗ nhiều người mới hiểu nhầm, nên nói thẳng trước:</p><p><strong>Founder AI không có trang &quot;nhập danh sách khách hàng&quot; riêng.</strong> Bạn không tải file lên ở một chỗ nào đó rồi mới dùng. Thay vào đó, danh sách người nhận được <strong>lấy vào ngay trong chiến dịch</strong>, bằng một khối gọi là khối lấy dữ liệu.</p><p>Cách làm này giúp mỗi chiến dịch tự chọn nguồn riêng — chiến dịch này gửi cho khách trong Google Sheet, chiến dịch kia gửi cho người điền form landing page, không cần trộn chung một danh bạ.</p><h2>Bốn nguồn dữ liệu bạn có thể dùng</h2><p>Khi dựng chiến dịch tại <a href="/app/campaigns/new">/app/campaigns/new</a>, thêm một trong các khối sau vào đầu luồng:</p><table><thead><tr><th>Khối</th><th>Lấy dữ liệu từ</th><th>Hợp khi nào</th></tr></thead><tbody><tr><td><strong>Đọc dữ liệu Sheet</strong></td><td>Một file Google Sheet của bạn</td><td>Đây là cách phổ biến nhất. Bạn có sẵn danh sách trong Excel/Sheet</td></tr><tr><td><strong>Dữ liệu landing page</strong></td><td>Người đã điền form trên landing page của bạn</td><td>Chăm sóc khách mới để lại thông tin</td></tr><tr><td><strong>Lấy dữ liệu khách</strong></td><td>Khách đã lưu trong hệ thống từ chiến dịch trước</td><td>Gửi lại cho người đã từng tương tác</td></tr><tr><td><strong>Lấy danh sách bạn bè Zalo</strong></td><td>Danh bạ của tài khoản Zalo đã nối</td><td>Nhắn cho bạn bè Zalo sẵn có</td></tr></tbody></table><p>Ngoài ra còn khối <strong>Lấy thông tin nhóm Zalo</strong> nếu bạn muốn gửi vào nhóm thay vì gửi cho từng người.</p><h2>Dùng Google Sheet — cách phổ biến nhất</h2><p>Chuẩn bị file trước cho đúng thì các bước sau rất nhanh.</p><h3>Chuẩn bị file Sheet</h3><ol><li>Tạo một Google Sheet, <strong>dòng đầu là tiêu đề cột</strong> — ví dụ: Họ tên, Số điện thoại, Email.</li><li>Dữ liệu thật bắt đầu từ dòng ngay dưới tiêu đề.</li><li><strong>Chia sẻ quyền đọc cho file</strong> — nếu để riêng tư hoàn toàn, hệ thống không đọc được.</li></ol><h3>Khai báo trong chiến dịch</h3><ol><li>Thêm khối <strong>Đọc dữ liệu Sheet</strong> vào luồng.</li><li>Dán <strong>URL Google Sheet</strong> vào ô tương ứng.</li><li>Điền <strong>Tên Sheet</strong> — là tên tab ở đáy file, thường là <code>Sheet1</code>.</li><li>Điền <strong>Dòng tiêu đề</strong> và <strong>Dòng bắt đầu dữ liệu</strong>. Nếu tiêu đề ở dòng 1 và dữ liệu từ dòng 2 thì điền lần lượt là 1 và 2.</li><li>Bấm <strong>Kiểm tra kết nối</strong>.</li></ol><p>Bước 5 quan trọng: nó vừa kiểm tra file có đọc được không, <strong>vừa tải danh sách tên cột về</strong>. Chưa bấm nút này thì các khối phía sau chưa biết file của bạn có những cột nào để chèn vào nội dung tin nhắn.</p><p>[ẢNH: khối Đọc dữ liệu Sheet đã điền URL, khoanh đỏ nút &quot;Kiểm tra kết nối&quot;]</p><p>Sau khi kiểm tra thành công, danh sách cột hiện ra ngay bên dưới. Đó là những cột bạn dùng được để cá nhân hoá nội dung.</p><p>[ẢNH: danh sách cột hiện ra sau khi kiểm tra kết nối thành công]</p><h2>Một điểm dễ nhầm khi chạy thử</h2><p>Trong builder có tuỳ chọn <strong>Số dòng tối đa khi chạy thử</strong>, mặc định 100 dòng.</p><p>Con số này <strong>chỉ áp dụng khi bạn bấm Chạy ngay trong builder</strong> để xem thử. Khi chạy thật từ trang <strong>Chạy chiến dịch</strong>, hệ thống đọc đủ toàn bộ dòng trong Sheet, không bị giới hạn bởi tuỳ chọn này.</p><p>Nói cách khác: thấy chạy thử chỉ ra 100 người thì đừng lo mất dữ liệu.</p><h2>Xem khách hàng của chiến dịch ở đâu</h2><p>Vào <a href="/app/customers">/app/customers</a> — menu <strong>Chiến dịch → Khách hàng từ chiến dịch</strong>.</p><p>Đúng như tên gọi, trang này <strong>liệt kê chiến dịch trước</strong>, không phải danh bạ chung. Bấm vào một chiến dịch để xem những ai đã tham gia chiến dịch đó.</p><p>Trong đó bạn xem được từng khách: thông tin liên hệ, trạng thái, hành trình đã đi qua và các tin nhắn đã gửi cho họ.</p><p>[ẢNH: trang Khách hàng từ chiến dịch, danh sách chiến dịch kèm số khách]</p><h2>Lỗi thường gặp</h2><ul><li><strong>Kiểm tra kết nối báo lỗi</strong> → File Sheet chưa được chia sẻ quyền đọc. Mở file, đổi quyền truy cập rồi thử lại.</li><li><strong>Kết nối được nhưng không thấy cột nào</strong> → Sai số <strong>Dòng tiêu đề</strong>, hoặc sai <strong>Tên Sheet</strong> khi file có nhiều tab.</li><li><strong>Chiến dịch chạy nhưng không có người nhận nào</strong> → Số <strong>Dòng bắt đầu dữ liệu</strong> đang trỏ vào dòng trống, hoặc trỏ nhầm vào chính dòng tiêu đề.</li><li><strong>Trang Khách hàng trống trơn</strong> → Bạn chưa chạy chiến dịch nào. Trang này liệt kê theo chiến dịch nên chưa có chiến dịch thì chưa có gì để xem.</li><li><strong>Muốn tìm một khách cụ thể mà không nhớ ở chiến dịch nào</strong> → Hiện phải vào từng chiến dịch để tìm, chưa có tìm kiếm chung toàn bộ khách.</li></ul><h2>Liên quan</h2><ul><li><a href="campaign-create">Tạo chiến dịch</a></li><li><a href="getting-started">Bắt đầu với Founder AI — 4 bước</a></li><li><a href="quick-send">Gửi nhanh</a></li></ul>`,
  },
  {
    slug: 'channels',
    feature_key: 'channels',
    primary_route: '/app/settings/channels',
    sort_order: 20,
    title: 'Kết nối kênh gửi (Email & Zalo)',
    summary: 'Nơi khai báo tài khoản Email và Zalo. Chưa có kênh nào ở đây thì không gửi được gì.',
    body_md: `Đây là nơi bạn khai báo tài khoản dùng để gửi đi. Founder AI **không có sẵn kênh gửi của riêng nó** — bạn phải nối tài khoản email hoặc Zalo của mình vào. Chưa nối kênh nào thì Gửi nhanh và Chiến dịch đều không chạy được.

# Vào ở đâu
Menu **Chiến dịch → Quản lý kênh**, hoặc mở thẳng [/app/settings/channels](/app/settings/channels).

Trang này chia làm 2 thẻ ở đầu trang: **Email** và **Zalo**. Bấm để chuyển qua lại.

[ẢNH: đầu trang Quản lý kênh, khoanh đỏ 2 thẻ Email / Zalo]

# Nên nối kênh nào trước
Tuỳ bạn định gửi gì, không bắt buộc nối cả hai:

| | Email | Zalo |
|---|---|---|
| Tốc độ | Rất nhanh, vài trăm tin một phút | Chậm, mỗi tin cách nhau 80–150 giây |
| Cần gì để nối | Tài khoản email có bật SMTP | Điện thoại có app Zalo để quét mã |
| Gửi đêm | Được | **Không** — nghỉ từ 23:00 đến 06:00 |
| Hay dùng để | Gửi số lượng lớn, gửi tài liệu dài | Nhắn tin ngắn, chăm sóc khách quen, mời kết bạn |

Nếu bạn cần gửi cho vài nghìn người trong ngày thì phải dùng Email. Zalo hợp với danh sách nhỏ và nội dung mang tính cá nhân.

# Các bước
1. Mở trang **Quản lý kênh**.
2. Chọn thẻ **Email** hoặc **Zalo** tuỳ kênh muốn nối.
3. Thêm tài khoản theo hướng dẫn riêng của từng kênh (xem 2 bài ở mục Liên quan).
4. **Gửi thử cho chính mình** trước khi chạy chiến dịch thật.

Bước 4 đừng bỏ qua. Sai cấu hình mà phát hiện lúc chiến dịch đã chạy được nửa danh sách thì không thu hồi lại được những tin đã gửi.

# Nhiều tài khoản cùng lúc
Cả Email lẫn Zalo đều cho thêm **nhiều tài khoản**. Khi có từ 2 cái trở lên, bạn chọn một cái làm **mặc định** — đó là cái được dùng khi bạn không chỉ định gì khác.

Với Zalo, thêm tài khoản còn là cách duy nhất để tăng lượng gửi: mỗi tài khoản chỉ gửi được khoảng 16.000 tin một tháng, cần nhiều hơn thì phải nối thêm tài khoản chứ mua thêm tin không giải quyết được.

# Lỗi thường gặp
- **Trang trống, không thấy nút nào** → Bạn đang đăng nhập bằng tài khoản nhân viên chưa được cấp quyền kênh gửi. Nhờ chủ tài khoản cấp quyền trong phần Nhân viên.
- **Đã nối kênh nhưng chiến dịch báo không có tài khoản gửi** → Kiểm tra tài khoản đó có đang ở trạng thái lỗi không, và đã đặt mặc định chưa.
- **Zalo hiện "Mất kết nối" dù hôm qua vẫn chạy** → Phiên đăng nhập Zalo hết hạn theo thời gian, đây là chuyện bình thường. Bấm **Kết nối lại** và quét QR.

# Liên quan
- [Thêm tài khoản Email](email-account)
- [Thêm tài khoản Zalo](zalo-account)
- [Vì sao Zalo gửi chậm hoặc đang dừng](zalo-gui-cham)
- [Gửi nhanh](quick-send)`,
    body_html: `<p>Đây là nơi bạn khai báo tài khoản dùng để gửi đi. Founder AI <strong>không có sẵn kênh gửi của riêng nó</strong> — bạn phải nối tài khoản email hoặc Zalo của mình vào. Chưa nối kênh nào thì Gửi nhanh và Chiến dịch đều không chạy được.</p><h2>Vào ở đâu</h2><p>Menu <strong>Chiến dịch → Quản lý kênh</strong>, hoặc mở thẳng <a href="/app/settings/channels">/app/settings/channels</a>.</p><p>Trang này chia làm 2 thẻ ở đầu trang: <strong>Email</strong> và <strong>Zalo</strong>. Bấm để chuyển qua lại.</p><p>[ẢNH: đầu trang Quản lý kênh, khoanh đỏ 2 thẻ Email / Zalo]</p><h2>Nên nối kênh nào trước</h2><p>Tuỳ bạn định gửi gì, không bắt buộc nối cả hai:</p><table><thead><tr><th></th><th>Email</th><th>Zalo</th></tr></thead><tbody><tr><td>Tốc độ</td><td>Rất nhanh, vài trăm tin một phút</td><td>Chậm, mỗi tin cách nhau 80–150 giây</td></tr><tr><td>Cần gì để nối</td><td>Tài khoản email có bật SMTP</td><td>Điện thoại có app Zalo để quét mã</td></tr><tr><td>Gửi đêm</td><td>Được</td><td><strong>Không</strong> — nghỉ từ 23:00 đến 06:00</td></tr><tr><td>Hay dùng để</td><td>Gửi số lượng lớn, gửi tài liệu dài</td><td>Nhắn tin ngắn, chăm sóc khách quen, mời kết bạn</td></tr></tbody></table><p>Nếu bạn cần gửi cho vài nghìn người trong ngày thì phải dùng Email. Zalo hợp với danh sách nhỏ và nội dung mang tính cá nhân.</p><h2>Các bước</h2><ol><li>Mở trang <strong>Quản lý kênh</strong>.</li><li>Chọn thẻ <strong>Email</strong> hoặc <strong>Zalo</strong> tuỳ kênh muốn nối.</li><li>Thêm tài khoản theo hướng dẫn riêng của từng kênh (xem 2 bài ở mục Liên quan).</li><li><strong>Gửi thử cho chính mình</strong> trước khi chạy chiến dịch thật.</li></ol><p>Bước 4 đừng bỏ qua. Sai cấu hình mà phát hiện lúc chiến dịch đã chạy được nửa danh sách thì không thu hồi lại được những tin đã gửi.</p><h2>Nhiều tài khoản cùng lúc</h2><p>Cả Email lẫn Zalo đều cho thêm <strong>nhiều tài khoản</strong>. Khi có từ 2 cái trở lên, bạn chọn một cái làm <strong>mặc định</strong> — đó là cái được dùng khi bạn không chỉ định gì khác.</p><p>Với Zalo, thêm tài khoản còn là cách duy nhất để tăng lượng gửi: mỗi tài khoản chỉ gửi được khoảng 16.000 tin một tháng, cần nhiều hơn thì phải nối thêm tài khoản chứ mua thêm tin không giải quyết được.</p><h2>Lỗi thường gặp</h2><ul><li><strong>Trang trống, không thấy nút nào</strong> → Bạn đang đăng nhập bằng tài khoản nhân viên chưa được cấp quyền kênh gửi. Nhờ chủ tài khoản cấp quyền trong phần Nhân viên.</li><li><strong>Đã nối kênh nhưng chiến dịch báo không có tài khoản gửi</strong> → Kiểm tra tài khoản đó có đang ở trạng thái lỗi không, và đã đặt mặc định chưa.</li><li><strong>Zalo hiện &quot;Mất kết nối&quot; dù hôm qua vẫn chạy</strong> → Phiên đăng nhập Zalo hết hạn theo thời gian, đây là chuyện bình thường. Bấm <strong>Kết nối lại</strong> và quét QR.</li></ul><h2>Liên quan</h2><ul><li><a href="email-account">Thêm tài khoản Email</a></li><li><a href="zalo-account">Thêm tài khoản Zalo</a></li><li><a href="zalo-gui-cham">Vì sao Zalo gửi chậm hoặc đang dừng</a></li><li><a href="quick-send">Gửi nhanh</a></li></ul>`,
  },
  {
    slug: 'email-account',
    feature_key: 'channels',
    primary_route: '/app/settings/channels',
    sort_order: 30,
    title: 'Thêm tài khoản Email',
    summary: 'Khai báo SMTP để gửi email từ địa chỉ của bạn, và kiểm tra bằng 2 nút thử khác nhau.',
    body_md: `Email gửi đi sẽ mang địa chỉ **của bạn**, không phải của Founder AI. Muốn vậy bạn cần cung cấp thông tin SMTP — tức là quyền gửi thư thay mặt hộp thư đó.

# Vào ở đâu
[/app/settings/channels](/app/settings/channels) → thẻ **Email** → nút **Thêm email**.

Cột bên trái là danh sách tài khoản đã có, bên phải là biểu mẫu khai báo.

[ẢNH: thẻ Email, khoanh đỏ nút "Thêm email" ở cột trái]

# Cần chuẩn bị gì trước
Bốn thông tin SMTP từ nhà cung cấp email của bạn: **SMTP Server**, **Port**, **Username / Email**, **Password / App Password**.

Chỗ hay vướng nhất: với Gmail và Outlook, **mật khẩu đăng nhập thường sẽ không dùng được**. Bạn phải tạo một "Mật khẩu ứng dụng" (App Password) riêng. Ngay trong trang có mục **Hướng dẫn cấu hình SMTP** — bấm mở ra là có sẵn các bước cho Gmail, Outlook và nhà cung cấp khác, làm theo đó nhanh nhất.

[ẢNH: mục "Hướng dẫn cấu hình SMTP" đang mở, thấy 3 thẻ Gmail / Outlook / Khác]

# Các bước
1. Bấm **Thêm email**.
2. Điền phần **Thông tin người gửi**:
   - **Tên người gửi** — tên hiện trong hộp thư người nhận, ví dụ tên cửa hàng của bạn.
   - **Email Reply-To** — địa chỉ nhận thư khi khách bấm Trả lời. Điền đúng hộp thư bạn thật sự đọc, không thì mất khách hỏi lại.
3. Điền phần **Cấu hình SMTP** bằng 4 thông tin đã chuẩn bị.
4. Bấm **Kiểm tra kết nối**. Nút này chỉ sáng lên khi đã điền đủ cả 4 ô.
5. Bấm **Thêm email** để lưu.
6. Sau khi lưu, bấm **Gửi email test** và nhập địa chỉ của chính bạn để nhận thử.

# Hai nút thử khác nhau, đừng nhầm
Đây là chỗ nhiều người bỏ sót:

- **Kiểm tra kết nối** — chỉ hỏi máy chủ SMTP xem tài khoản/mật khẩu có đúng không. Nhanh, nhưng **không gửi thư nào cả**.
- **Gửi email test** — gửi một lá thư thật tới địa chỉ bạn nhập. Đây mới là cách biết thư có vào được hộp thư hay rơi vào spam.

Chỉ bấm nút đầu mà bỏ nút sau là hay gặp cảnh "cấu hình đúng hết mà khách không nhận được".

[ẢNH: hàng nút cuối biểu mẫu, khoanh riêng "Kiểm tra kết nối" và "Gửi email test"]

# Lỗi thường gặp
- **Kiểm tra kết nối báo thất bại, mã 535** → Sai tài khoản hoặc mật khẩu. Với Gmail/Outlook, gần như chắc chắn do bạn đang dùng mật khẩu đăng nhập thay vì App Password.
- **Nút "Kiểm tra kết nối" bị mờ, bấm không được** → Còn ô trống trong 4 ô SMTP.
- **Không thấy nút "Gửi email test"** → Nút này chỉ hiện sau khi tài khoản đã được lưu. Lưu trước rồi mới thử gửi được.
- **Gửi được nhưng thư rơi vào spam** → Đây là vấn đề uy tín tên miền phía nhà cung cấp email, không phải lỗi cấu hình. Cần khai báo SPF/DKIM cho tên miền của bạn.
- **Đang gửi chiến dịch thì email dừng hẳn nhiều giờ** → Nhà cung cấp đã chặn tạm vì gửi quá nhanh. Hệ thống tự chờ rồi gửi tiếp, không cần làm gì.
- **Một số người trong danh sách không bao giờ nhận được** → Địa chỉ đó không tồn tại. Hệ thống đánh dấu và **vĩnh viễn không gửi lại** để giữ uy tín cho tên miền của bạn.

# Liên quan
- [Kết nối kênh gửi](channels)
- [Gửi nhanh](quick-send)
- [Gói dịch vụ & thanh toán](plan-and-billing)`,
    body_html: `<p>Email gửi đi sẽ mang địa chỉ <strong>của bạn</strong>, không phải của Founder AI. Muốn vậy bạn cần cung cấp thông tin SMTP — tức là quyền gửi thư thay mặt hộp thư đó.</p><h2>Vào ở đâu</h2><p><a href="/app/settings/channels">/app/settings/channels</a> → thẻ <strong>Email</strong> → nút <strong>Thêm email</strong>.</p><p>Cột bên trái là danh sách tài khoản đã có, bên phải là biểu mẫu khai báo.</p><p>[ẢNH: thẻ Email, khoanh đỏ nút &quot;Thêm email&quot; ở cột trái]</p><h2>Cần chuẩn bị gì trước</h2><p>Bốn thông tin SMTP từ nhà cung cấp email của bạn: <strong>SMTP Server</strong>, <strong>Port</strong>, <strong>Username / Email</strong>, <strong>Password / App Password</strong>.</p><p>Chỗ hay vướng nhất: với Gmail và Outlook, <strong>mật khẩu đăng nhập thường sẽ không dùng được</strong>. Bạn phải tạo một &quot;Mật khẩu ứng dụng&quot; (App Password) riêng. Ngay trong trang có mục <strong>Hướng dẫn cấu hình SMTP</strong> — bấm mở ra là có sẵn các bước cho Gmail, Outlook và nhà cung cấp khác, làm theo đó nhanh nhất.</p><p>[ẢNH: mục &quot;Hướng dẫn cấu hình SMTP&quot; đang mở, thấy 3 thẻ Gmail / Outlook / Khác]</p><h2>Các bước</h2><ol><li>Bấm <strong>Thêm email</strong>.</li><li>Điền phần <strong>Thông tin người gửi</strong>:<ul><li><strong>Tên người gửi</strong> — tên hiện trong hộp thư người nhận, ví dụ tên cửa hàng của bạn.</li><li><strong>Email Reply-To</strong> — địa chỉ nhận thư khi khách bấm Trả lời. Điền đúng hộp thư bạn thật sự đọc, không thì mất khách hỏi lại.</li></ul></li><li>Điền phần <strong>Cấu hình SMTP</strong> bằng 4 thông tin đã chuẩn bị.</li><li>Bấm <strong>Kiểm tra kết nối</strong>. Nút này chỉ sáng lên khi đã điền đủ cả 4 ô.</li><li>Bấm <strong>Thêm email</strong> để lưu.</li><li>Sau khi lưu, bấm <strong>Gửi email test</strong> và nhập địa chỉ của chính bạn để nhận thử.</li></ol><h2>Hai nút thử khác nhau, đừng nhầm</h2><p>Đây là chỗ nhiều người bỏ sót:</p><ul><li><strong>Kiểm tra kết nối</strong> — chỉ hỏi máy chủ SMTP xem tài khoản/mật khẩu có đúng không. Nhanh, nhưng <strong>không gửi thư nào cả</strong>.</li><li><strong>Gửi email test</strong> — gửi một lá thư thật tới địa chỉ bạn nhập. Đây mới là cách biết thư có vào được hộp thư hay rơi vào spam.</li></ul><p>Chỉ bấm nút đầu mà bỏ nút sau là hay gặp cảnh &quot;cấu hình đúng hết mà khách không nhận được&quot;.</p><p>[ẢNH: hàng nút cuối biểu mẫu, khoanh riêng &quot;Kiểm tra kết nối&quot; và &quot;Gửi email test&quot;]</p><h2>Lỗi thường gặp</h2><ul><li><strong>Kiểm tra kết nối báo thất bại, mã 535</strong> → Sai tài khoản hoặc mật khẩu. Với Gmail/Outlook, gần như chắc chắn do bạn đang dùng mật khẩu đăng nhập thay vì App Password.</li><li><strong>Nút &quot;Kiểm tra kết nối&quot; bị mờ, bấm không được</strong> → Còn ô trống trong 4 ô SMTP.</li><li><strong>Không thấy nút &quot;Gửi email test&quot;</strong> → Nút này chỉ hiện sau khi tài khoản đã được lưu. Lưu trước rồi mới thử gửi được.</li><li><strong>Gửi được nhưng thư rơi vào spam</strong> → Đây là vấn đề uy tín tên miền phía nhà cung cấp email, không phải lỗi cấu hình. Cần khai báo SPF/DKIM cho tên miền của bạn.</li><li><strong>Đang gửi chiến dịch thì email dừng hẳn nhiều giờ</strong> → Nhà cung cấp đã chặn tạm vì gửi quá nhanh. Hệ thống tự chờ rồi gửi tiếp, không cần làm gì.</li><li><strong>Một số người trong danh sách không bao giờ nhận được</strong> → Địa chỉ đó không tồn tại. Hệ thống đánh dấu và <strong>vĩnh viễn không gửi lại</strong> để giữ uy tín cho tên miền của bạn.</li></ul><h2>Liên quan</h2><ul><li><a href="channels">Kết nối kênh gửi</a></li><li><a href="quick-send">Gửi nhanh</a></li><li><a href="plan-and-billing">Gói dịch vụ &amp; thanh toán</a></li></ul>`,
  },
  {
    slug: 'zalo-account',
    feature_key: 'channels',
    primary_route: '/app/settings/channels',
    sort_order: 40,
    title: 'Thêm tài khoản Zalo',
    summary: 'Quét QR để nối Zalo cá nhân, hiểu các trạng thái kết nối và khi nào phải quét lại.',
    body_md: `Nối tài khoản Zalo cá nhân để gửi tin nhắn, tin vào nhóm và lời mời kết bạn. Cách nối là **quét mã QR** giống hệt khi bạn đăng nhập Zalo trên máy tính.

# Vào ở đâu
[/app/settings/channels](/app/settings/channels) → thẻ **Zalo**.

Chưa có tài khoản nào thì trang hiện **Thêm tài khoản Zalo đầu tiên**. Đã có rồi thì dùng nút **Tạo QR đăng nhập**.

[ẢNH: thẻ Zalo khi chưa có tài khoản, khoanh đỏ nút "Thêm tài khoản Zalo đầu tiên"]

# Các bước
1. Bấm **Tạo QR đăng nhập**. Một cửa sổ hiện mã QR.
2. Mở **app Zalo trên điện thoại**, vào mục quét mã, quét mã đang hiện trên màn hình.
3. Xác nhận trên điện thoại.
4. Đợi trạng thái chuyển thành **Đã kết nối**.

Mã QR **có hạn dùng ngắn**. Chuẩn bị sẵn điện thoại rồi hãy bấm tạo mã, để lâu quá sẽ báo hết hạn và phải tạo mã mới.

[ẢNH: cửa sổ "Quét QR để đăng nhập Zalo" đang hiện mã]

# Các trạng thái nghĩa là gì
| Trạng thái | Nghĩa là | Bạn cần làm gì |
|---|---|---|
| **Đã kết nối** | Đang chạy bình thường | Không cần làm gì |
| **Mất kết nối** | Phiên đăng nhập đã đứt | Bấm **Kết nối lại**, quét QR |
| **Cần kết nối lại** | Phiên hết hạn, hệ thống **đã chủ động ngừng thử lại** | Bấm **Kết nối lại**, quét QR |
| **Chưa cấu hình** | Tài khoản chưa nối xong | Tạo QR và quét |

Trạng thái **Cần kết nối lại** là cố ý, không phải hỏng. Khi phiên hết hạn, hệ thống dừng thử lại tự động — vì thử đăng nhập liên tục là dấu hiệu khiến Zalo khoá tài khoản của bạn.

# Nhiều tài khoản và tài khoản mặc định
Nối được nhiều tài khoản Zalo. Khi có từ 2 cái trở lên, bấm **Đặt mặc định** cho cái bạn dùng thường xuyên nhất — đó là cái được chọn sẵn khi tạo chiến dịch.

Nối thêm tài khoản cũng là **cách duy nhất để gửi được nhiều hơn**. Mỗi tài khoản chỉ gửi khoảng 16.000 tin một tháng, và giới hạn này là do Zalo đặt ra chứ không phải do gói dịch vụ.

# Phải quét lại QR bao lâu một lần
Không có lịch cố định. Phiên Zalo tự hết hạn theo thời gian, và cũng đứt khi bạn đăng xuất Zalo trên máy tính hoặc đổi mật khẩu Zalo.

Hệ thống có cơ chế tự giữ phiên và tự khôi phục, nên phần lớn thời gian bạn không phải làm gì. Nhưng nên **kiểm tra trạng thái trước mỗi chiến dịch lớn** — rẻ hơn nhiều so với phát hiện lúc đang chạy.

# Lỗi thường gặp
- **Quét xong mà không lên "Đã kết nối"** → Chưa bấm xác nhận trên điện thoại, hoặc mã đã hết hạn trước khi quét. Tạo mã mới và quét ngay.
- **Đang chạy chiến dịch thì rớt xuống "Mất kết nối"** → Chiến dịch dừng lại chứ không mất. Quét QR lại là chạy tiếp phần còn lại.
- **Gửi rất chậm, tưởng treo** → Bình thường, mỗi tin cách nhau 80–150 giây. Xem [Vì sao Zalo gửi chậm hoặc đang dừng](zalo-gui-cham).
- **Buổi tối không gửi gì cả** → Hệ thống nghỉ gửi Zalo từ 23:00 đến 06:00, tự chạy lại sáng hôm sau.

# Liên quan
- [Vì sao Zalo gửi chậm hoặc đang dừng](zalo-gui-cham)
- [Kết nối kênh gửi](channels)
- [Tạo chiến dịch](campaign-create)`,
    body_html: `<p>Nối tài khoản Zalo cá nhân để gửi tin nhắn, tin vào nhóm và lời mời kết bạn. Cách nối là <strong>quét mã QR</strong> giống hệt khi bạn đăng nhập Zalo trên máy tính.</p><h2>Vào ở đâu</h2><p><a href="/app/settings/channels">/app/settings/channels</a> → thẻ <strong>Zalo</strong>.</p><p>Chưa có tài khoản nào thì trang hiện <strong>Thêm tài khoản Zalo đầu tiên</strong>. Đã có rồi thì dùng nút <strong>Tạo QR đăng nhập</strong>.</p><p>[ẢNH: thẻ Zalo khi chưa có tài khoản, khoanh đỏ nút &quot;Thêm tài khoản Zalo đầu tiên&quot;]</p><h2>Các bước</h2><ol><li>Bấm <strong>Tạo QR đăng nhập</strong>. Một cửa sổ hiện mã QR.</li><li>Mở <strong>app Zalo trên điện thoại</strong>, vào mục quét mã, quét mã đang hiện trên màn hình.</li><li>Xác nhận trên điện thoại.</li><li>Đợi trạng thái chuyển thành <strong>Đã kết nối</strong>.</li></ol><p>Mã QR <strong>có hạn dùng ngắn</strong>. Chuẩn bị sẵn điện thoại rồi hãy bấm tạo mã, để lâu quá sẽ báo hết hạn và phải tạo mã mới.</p><p>[ẢNH: cửa sổ &quot;Quét QR để đăng nhập Zalo&quot; đang hiện mã]</p><h2>Các trạng thái nghĩa là gì</h2><table><thead><tr><th>Trạng thái</th><th>Nghĩa là</th><th>Bạn cần làm gì</th></tr></thead><tbody><tr><td><strong>Đã kết nối</strong></td><td>Đang chạy bình thường</td><td>Không cần làm gì</td></tr><tr><td><strong>Mất kết nối</strong></td><td>Phiên đăng nhập đã đứt</td><td>Bấm <strong>Kết nối lại</strong>, quét QR</td></tr><tr><td><strong>Cần kết nối lại</strong></td><td>Phiên hết hạn, hệ thống <strong>đã chủ động ngừng thử lại</strong></td><td>Bấm <strong>Kết nối lại</strong>, quét QR</td></tr><tr><td><strong>Chưa cấu hình</strong></td><td>Tài khoản chưa nối xong</td><td>Tạo QR và quét</td></tr></tbody></table><p>Trạng thái <strong>Cần kết nối lại</strong> là cố ý, không phải hỏng. Khi phiên hết hạn, hệ thống dừng thử lại tự động — vì thử đăng nhập liên tục là dấu hiệu khiến Zalo khoá tài khoản của bạn.</p><h2>Nhiều tài khoản và tài khoản mặc định</h2><p>Nối được nhiều tài khoản Zalo. Khi có từ 2 cái trở lên, bấm <strong>Đặt mặc định</strong> cho cái bạn dùng thường xuyên nhất — đó là cái được chọn sẵn khi tạo chiến dịch.</p><p>Nối thêm tài khoản cũng là <strong>cách duy nhất để gửi được nhiều hơn</strong>. Mỗi tài khoản chỉ gửi khoảng 16.000 tin một tháng, và giới hạn này là do Zalo đặt ra chứ không phải do gói dịch vụ.</p><h2>Phải quét lại QR bao lâu một lần</h2><p>Không có lịch cố định. Phiên Zalo tự hết hạn theo thời gian, và cũng đứt khi bạn đăng xuất Zalo trên máy tính hoặc đổi mật khẩu Zalo.</p><p>Hệ thống có cơ chế tự giữ phiên và tự khôi phục, nên phần lớn thời gian bạn không phải làm gì. Nhưng nên <strong>kiểm tra trạng thái trước mỗi chiến dịch lớn</strong> — rẻ hơn nhiều so với phát hiện lúc đang chạy.</p><h2>Lỗi thường gặp</h2><ul><li><strong>Quét xong mà không lên &quot;Đã kết nối&quot;</strong> → Chưa bấm xác nhận trên điện thoại, hoặc mã đã hết hạn trước khi quét. Tạo mã mới và quét ngay.</li><li><strong>Đang chạy chiến dịch thì rớt xuống &quot;Mất kết nối&quot;</strong> → Chiến dịch dừng lại chứ không mất. Quét QR lại là chạy tiếp phần còn lại.</li><li><strong>Gửi rất chậm, tưởng treo</strong> → Bình thường, mỗi tin cách nhau 80–150 giây. Xem <a href="zalo-gui-cham">Vì sao Zalo gửi chậm hoặc đang dừng</a>.</li><li><strong>Buổi tối không gửi gì cả</strong> → Hệ thống nghỉ gửi Zalo từ 23:00 đến 06:00, tự chạy lại sáng hôm sau.</li></ul><h2>Liên quan</h2><ul><li><a href="zalo-gui-cham">Vì sao Zalo gửi chậm hoặc đang dừng</a></li><li><a href="channels">Kết nối kênh gửi</a></li><li><a href="campaign-create">Tạo chiến dịch</a></li></ul>`,
  },
  {
    slug: 'zalo-gui-cham',
    feature_key: 'channels',
    primary_route: '/app/settings/channels',
    sort_order: 45,
    title: 'Vì sao Zalo gửi chậm hoặc đang dừng',
    summary: 'Gửi chậm và dừng ban đêm là cố ý, không phải lỗi. Bài này giải thích từng trường hợp và khi nào mới thật sự có vấn đề.',
    body_md: `Nếu bạn vừa chạy chiến dịch Zalo và thấy nó bò rất chậm, hoặc đứng im hàng giờ — **phần lớn trường hợp đó là cố ý, không phải hỏng.** Bài này giải thích hệ thống đang làm gì.

# Ba con số cần biết trước
- Mỗi tin cách nhau **80 đến 150 giây**.
- Không gửi Zalo từ **23:00 đến 06:00**.
- Mỗi tài khoản gửi được khoảng **16.000 tin một tháng**.

Nghĩa là gửi cho 1.000 người mất **khoảng 10 đến 20 tiếng**, trải qua nhiều buổi. Đây là con số bình thường, không phải hệ thống yếu.

# Vì sao phải chậm như vậy
Zalo không cho phép gửi hàng loạt. Tài khoản nào gửi liên tục, đều đặn, nhanh bất thường sẽ bị nhận diện là công cụ tự động và **bị khoá** — mất luôn tài khoản Zalo cá nhân của bạn, không chỉ mất chiến dịch.

Khoảng cách 80–150 giây là ngẫu nhiên chứ không đều nhau, để nhịp gửi trông giống người thật đang nhắn tin. Gửi chậm là cái giá để giữ tài khoản.

> Nếu bạn cần gửi nhanh cho số lượng lớn, hãy dùng Email. Zalo về bản chất không phải kênh gửi hàng loạt.

# Tra theo triệu chứng

## Không gửi gì cả, đứng im hoàn toàn
Xem đồng hồ trước. Nếu đang trong khoảng **23:00 – 06:00** thì đúng như thiết kế: hệ thống tạm dừng và **tự chạy tiếp lúc 6 giờ sáng**, bạn không cần làm gì.

Ngoài khung giờ đó, kiểm tra trạng thái tài khoản Zalo tại [/app/settings/channels](/app/settings/channels). Nếu là **Mất kết nối** hoặc **Cần kết nối lại** thì quét lại QR.

## Chạy được một lúc rồi dừng
Thường là đã chạm trần gửi trong giờ. Hệ thống tự chờ sang khung giờ tiếp theo rồi gửi tiếp — không mất người nào, chỉ là chờ.

Một khả năng khác: hệ thống đang trong thời gian nghỉ vì tra số điện thoại quá nhiều, kéo dài khoảng **3 tiếng**. Trường hợp này cũng tự hết.

## Chạy chậm hơn cả mức bình thường
Nếu bạn chạy nhiều chiến dịch cùng lúc trên **cùng một tài khoản Zalo**, chúng chia nhau lượt gửi chứ không cộng thêm. Hai chiến dịch cùng chạy thì mỗi cái chậm gấp đôi.

Muốn nhanh hơn thật sự thì phải nối thêm tài khoản Zalo, xem [Thêm tài khoản Zalo](zalo-account).

## Vài người trong danh sách không nhận được
Có hai nguyên nhân:

- Hệ thống đã thử **5 lần đều thất bại** với người đó, và bỏ qua để không phí lượt gửi.
- Số điện thoại đó chưa dùng Zalo, hoặc chặn nhận tin từ người lạ.

Số còn lại trong danh sách vẫn được gửi bình thường.

# Khi nào mới là thật sự có vấn đề
Bốn dấu hiệu dưới đây mới đáng báo hỗ trợ:

1. Tài khoản báo **Đã kết nối**, đang trong giờ được gửi, mà **quá 30 phút không có tin nào đi**.
2. Trạng thái nhảy về **Mất kết nối** liên tục dù bạn vừa quét QR.
3. **Toàn bộ** danh sách đều thất bại, không riêng vài người.
4. Bạn nhận được cảnh báo từ chính Zalo về việc tài khoản bị hạn chế.

Ngoài bốn trường hợp đó, chậm và dừng theo giờ đều là hoạt động bình thường.

# Xem tiến độ ở đâu
Vào [/app/delivery-monitor](/app/delivery-monitor) để xem chiến dịch đã gửi được bao nhiêu, còn bao nhiêu, và tin nào thất bại.

[ẢNH: trang Theo dõi gửi tin, thấy tiến độ một chiến dịch Zalo đang chạy]

# Liên quan
- [Thêm tài khoản Zalo](zalo-account)
- [Kết nối kênh gửi](channels)
- [Tạo chiến dịch](campaign-create)`,
    body_html: `<p>Nếu bạn vừa chạy chiến dịch Zalo và thấy nó bò rất chậm, hoặc đứng im hàng giờ — <strong>phần lớn trường hợp đó là cố ý, không phải hỏng.</strong> Bài này giải thích hệ thống đang làm gì.</p><h2>Ba con số cần biết trước</h2><ul><li>Mỗi tin cách nhau <strong>80 đến 150 giây</strong>.</li><li>Không gửi Zalo từ <strong>23:00 đến 06:00</strong>.</li><li>Mỗi tài khoản gửi được khoảng <strong>16.000 tin một tháng</strong>.</li></ul><p>Nghĩa là gửi cho 1.000 người mất <strong>khoảng 10 đến 20 tiếng</strong>, trải qua nhiều buổi. Đây là con số bình thường, không phải hệ thống yếu.</p><h2>Vì sao phải chậm như vậy</h2><p>Zalo không cho phép gửi hàng loạt. Tài khoản nào gửi liên tục, đều đặn, nhanh bất thường sẽ bị nhận diện là công cụ tự động và <strong>bị khoá</strong> — mất luôn tài khoản Zalo cá nhân của bạn, không chỉ mất chiến dịch.</p><p>Khoảng cách 80–150 giây là ngẫu nhiên chứ không đều nhau, để nhịp gửi trông giống người thật đang nhắn tin. Gửi chậm là cái giá để giữ tài khoản.</p><blockquote><p>Nếu bạn cần gửi nhanh cho số lượng lớn, hãy dùng Email. Zalo về bản chất không phải kênh gửi hàng loạt.</p></blockquote><h2>Tra theo triệu chứng</h2><h3>Không gửi gì cả, đứng im hoàn toàn</h3><p>Xem đồng hồ trước. Nếu đang trong khoảng <strong>23:00 – 06:00</strong> thì đúng như thiết kế: hệ thống tạm dừng và <strong>tự chạy tiếp lúc 6 giờ sáng</strong>, bạn không cần làm gì.</p><p>Ngoài khung giờ đó, kiểm tra trạng thái tài khoản Zalo tại <a href="/app/settings/channels">/app/settings/channels</a>. Nếu là <strong>Mất kết nối</strong> hoặc <strong>Cần kết nối lại</strong> thì quét lại QR.</p><h3>Chạy được một lúc rồi dừng</h3><p>Thường là đã chạm trần gửi trong giờ. Hệ thống tự chờ sang khung giờ tiếp theo rồi gửi tiếp — không mất người nào, chỉ là chờ.</p><p>Một khả năng khác: hệ thống đang trong thời gian nghỉ vì tra số điện thoại quá nhiều, kéo dài khoảng <strong>3 tiếng</strong>. Trường hợp này cũng tự hết.</p><h3>Chạy chậm hơn cả mức bình thường</h3><p>Nếu bạn chạy nhiều chiến dịch cùng lúc trên <strong>cùng một tài khoản Zalo</strong>, chúng chia nhau lượt gửi chứ không cộng thêm. Hai chiến dịch cùng chạy thì mỗi cái chậm gấp đôi.</p><p>Muốn nhanh hơn thật sự thì phải nối thêm tài khoản Zalo, xem <a href="zalo-account">Thêm tài khoản Zalo</a>.</p><h3>Vài người trong danh sách không nhận được</h3><p>Có hai nguyên nhân:</p><ul><li>Hệ thống đã thử <strong>5 lần đều thất bại</strong> với người đó, và bỏ qua để không phí lượt gửi.</li><li>Số điện thoại đó chưa dùng Zalo, hoặc chặn nhận tin từ người lạ.</li></ul><p>Số còn lại trong danh sách vẫn được gửi bình thường.</p><h2>Khi nào mới là thật sự có vấn đề</h2><p>Bốn dấu hiệu dưới đây mới đáng báo hỗ trợ:</p><ol><li>Tài khoản báo <strong>Đã kết nối</strong>, đang trong giờ được gửi, mà <strong>quá 30 phút không có tin nào đi</strong>.</li><li>Trạng thái nhảy về <strong>Mất kết nối</strong> liên tục dù bạn vừa quét QR.</li><li><strong>Toàn bộ</strong> danh sách đều thất bại, không riêng vài người.</li><li>Bạn nhận được cảnh báo từ chính Zalo về việc tài khoản bị hạn chế.</li></ol><p>Ngoài bốn trường hợp đó, chậm và dừng theo giờ đều là hoạt động bình thường.</p><h2>Xem tiến độ ở đâu</h2><p>Vào <a href="/app/delivery-monitor">/app/delivery-monitor</a> để xem chiến dịch đã gửi được bao nhiêu, còn bao nhiêu, và tin nào thất bại.</p><p>[ẢNH: trang Theo dõi gửi tin, thấy tiến độ một chiến dịch Zalo đang chạy]</p><h2>Liên quan</h2><ul><li><a href="zalo-account">Thêm tài khoản Zalo</a></li><li><a href="channels">Kết nối kênh gửi</a></li><li><a href="campaign-create">Tạo chiến dịch</a></li></ul>`,
  },
  {
    slug: 'chatbot',
    feature_key: 'chatbot',
    primary_route: '/app/chatbot-studio',
    sort_order: 80,
    title: 'Chatbot AI trả lời khách tự động',
    summary: 'Tạo chatbot riêng, nạp tài liệu để nó trả lời đúng, rồi gắn lên website, Zalo OA, Facebook hoặc Zalo cá nhân.',
    body_md: `# Chatbot AI trả lời khách tự động
Chatbot đọc tài liệu bạn nạp vào rồi trả lời khách theo đúng những gì bạn bán — không phải một trợ lý chung chung.

## Vào ở đâu
Menu **Chatbot Studio**, hoặc [/app/chatbot-studio](/app/chatbot-studio). Trang này chỉ **chủ tài khoản** vào được.

[ẢNH: trang Chatbot Studio với danh sách chatbot bên trái]

## Ba tab cần đi qua

### 1. Cấu hình
Đặt tên chatbot, viết hướng dẫn cách trả lời, chỉnh màu và icon của khung chat trên website.

Phần hướng dẫn cách trả lời quan trọng hơn bạn nghĩ. Hãy viết rõ: bot xưng hô thế nào, được phép hứa gì, gặp câu ngoài phạm vi thì nói sao. Ví dụ *"Xưng em, gọi khách là anh/chị. Không báo giá cụ thể, hướng khách để lại số điện thoại."*

### 2. Kiến thức
Nơi quyết định bot trả lời đúng hay sai. Bạn tải tài liệu lên hoặc dán thẳng văn bản: bảng giá, chính sách bảo hành, câu hỏi thường gặp, mô tả sản phẩm.

Bot chỉ biết những gì có trong đây. Chưa nạp gì thì nó trả lời chung chung.

> Nạp tài liệu **không** tốn credit AI. Chỉ mỗi lượt bot trả lời khách mới tính.

[ẢNH: tab Kiến thức với vài tài liệu đã tải lên]

### 3. Triển khai
Chọn nơi đặt bot:

- **Website** — chèn đoạn mã vào trang của bạn, hoặc dùng liên kết công khai nếu chưa có website
- **Zalo Official Account** — cần App ID và App Secret từ Zalo Developer
- **Facebook Messenger** — liên kết Fanpage
- **Zalo cá nhân** — bot trả lời ngay trong tài khoản Zalo bạn đã kết nối

Với Zalo OA và Facebook, màn hình có sẵn hướng dẫn từng bước kèm ô sao chép Webhook URL và Verify Token.

## Bot trả lời rồi thì xem ở đâu
Mọi hội thoại đổ về **Hộp thư** tại [/app/settings/inbox](/app/settings/inbox), gộp chung cả bốn kênh. Xem [Hộp thư hợp nhất](inbox).

## Khi bot trả lời sai
Gần như luôn là do phần Kiến thức, không phải do model. Kiểm theo thứ tự:

1. Câu hỏi đó đã có trong tài liệu chưa?
2. Tài liệu đã xử lý xong chưa, hay còn đang nạp?
3. Hướng dẫn cách trả lời có mâu thuẫn với tài liệu không?

## Liên quan
- [Hộp thư hợp nhất](inbox)
- [Hồ sơ doanh nghiệp](ai-profile)
- [Gói dịch vụ & thanh toán](plan-and-billing)`,
    body_html: `<h2>Chatbot AI trả lời khách tự động</h2><p>Chatbot đọc tài liệu bạn nạp vào rồi trả lời khách theo đúng những gì bạn bán — không phải một trợ lý chung chung.</p><h3>Vào ở đâu</h3><p>Menu <strong>Chatbot Studio</strong>, hoặc <a href="/app/chatbot-studio">/app/chatbot-studio</a>. Trang này chỉ <strong>chủ tài khoản</strong> vào được.</p><p>[ẢNH: trang Chatbot Studio với danh sách chatbot bên trái]</p><h3>Ba tab cần đi qua</h3><h4>1. Cấu hình</h4><p>Đặt tên chatbot, viết hướng dẫn cách trả lời, chỉnh màu và icon của khung chat trên website.</p><p>Phần hướng dẫn cách trả lời quan trọng hơn bạn nghĩ. Hãy viết rõ: bot xưng hô thế nào, được phép hứa gì, gặp câu ngoài phạm vi thì nói sao. Ví dụ <em>&quot;Xưng em, gọi khách là anh/chị. Không báo giá cụ thể, hướng khách để lại số điện thoại.&quot;</em></p><h4>2. Kiến thức</h4><p>Nơi quyết định bot trả lời đúng hay sai. Bạn tải tài liệu lên hoặc dán thẳng văn bản: bảng giá, chính sách bảo hành, câu hỏi thường gặp, mô tả sản phẩm.</p><p>Bot chỉ biết những gì có trong đây. Chưa nạp gì thì nó trả lời chung chung.</p><blockquote><p>Nạp tài liệu <strong>không</strong> tốn credit AI. Chỉ mỗi lượt bot trả lời khách mới tính.</p></blockquote><p>[ẢNH: tab Kiến thức với vài tài liệu đã tải lên]</p><h4>3. Triển khai</h4><p>Chọn nơi đặt bot:</p><ul><li><strong>Website</strong> — chèn đoạn mã vào trang của bạn, hoặc dùng liên kết công khai nếu chưa có website</li><li><strong>Zalo Official Account</strong> — cần App ID và App Secret từ Zalo Developer</li><li><strong>Facebook Messenger</strong> — liên kết Fanpage</li><li><strong>Zalo cá nhân</strong> — bot trả lời ngay trong tài khoản Zalo bạn đã kết nối</li></ul><p>Với Zalo OA và Facebook, màn hình có sẵn hướng dẫn từng bước kèm ô sao chép Webhook URL và Verify Token.</p><h3>Bot trả lời rồi thì xem ở đâu</h3><p>Mọi hội thoại đổ về <strong>Hộp thư</strong> tại <a href="/app/settings/inbox">/app/settings/inbox</a>, gộp chung cả bốn kênh. Xem <a href="inbox">Hộp thư hợp nhất</a>.</p><h3>Khi bot trả lời sai</h3><p>Gần như luôn là do phần Kiến thức, không phải do model. Kiểm theo thứ tự:</p><ol><li>Câu hỏi đó đã có trong tài liệu chưa?</li><li>Tài liệu đã xử lý xong chưa, hay còn đang nạp?</li><li>Hướng dẫn cách trả lời có mâu thuẫn với tài liệu không?</li></ol><h3>Liên quan</h3><ul><li><a href="inbox">Hộp thư hợp nhất</a></li><li><a href="ai-profile">Hồ sơ doanh nghiệp</a></li><li><a href="plan-and-billing">Gói dịch vụ &amp; thanh toán</a></li></ul>`,
  },
  {
    slug: 'inbox',
    feature_key: 'inbox',
    primary_route: '/app/settings/inbox',
    sort_order: 90,
    title: 'Hộp thư hợp nhất',
    summary: 'Tất cả tin nhắn từ website, Zalo OA, Facebook và Zalo cá nhân về một chỗ; xem AI đã trả lời ai và giành quyền trả lời khi cần.',
    body_md: `# Hộp thư hợp nhất
Khách nhắn từ đâu cũng đổ về một màn hình: website, Zalo OA, Facebook Messenger, Zalo cá nhân.

## Vào ở đâu
Menu **Hộp thư**, hoặc [/app/settings/inbox](/app/settings/inbox). Chỉ **chủ tài khoản** vào được.

[ẢNH: hộp thư hợp nhất, cột trái là danh sách hội thoại, cột phải là nội dung chat]

## Đọc màn hình này
- **Cột trái** — danh sách hội thoại, mới nhất lên trên. Số tròn màu là tin **chưa đọc**.
- **Cột phải** — nội dung trao đổi. Tin của khách, của AI và của bạn nằm chung một dòng thời gian.
- **Bộ lọc trên đầu** — lọc theo kênh khi chỉ muốn xem riêng Zalo hoặc riêng website.

Số chưa đọc chỉ mất đi khi **chính bạn mở hội thoại đó trên web**. Bot trả lời không làm mất dấu chưa đọc — nên đây là chỗ đáng tin để rà cuối ngày, kể cả khi ứng dụng Zalo trên điện thoại đã hiện là đã đọc.

## Khi bạn muốn tự trả lời
Gõ thẳng vào ô trả lời rồi gửi. **AI tự dừng lại** cho hội thoại đó ngay khi bạn chen vào — để bot không nói chồng lên bạn giữa chừng.

Hội thoại đang dừng sẽ có nhãn **AI đang tạm dừng**. Bật lại bằng công tắc AI ngay trên đầu khung chat.

> Mặc định AI **không tự bật lại**. Nếu muốn nó tự tiếp quản sau một lúc bạn không trả lời nữa, hãy bật tuỳ chọn tự bật lại AI trong phần cài đặt — nên để **30 phút**.

Đây cũng là nguyên nhân phổ biến nhất của tình trạng "hôm qua bot trả lời, hôm nay im": bạn đã trả lời tay người đó một lần, và bot dừng vĩnh viễn với riêng họ.

## Nhắn từ Zalo trên điện thoại
Tin bạn gõ thẳng trong ứng dụng Zalo cũng hiện ở đây và cũng làm AI tạm dừng, y như khi trả lời trên web.

## Tệp và ảnh đã gửi
Ảnh, tệp đính kèm dùng trong hộp thư nằm ở **Thư viện media**, tại [/app/settings/media-library](/app/settings/media-library).

## Liên quan
- [Chatbot AI trả lời khách tự động](chatbot)
- [Thêm tài khoản Zalo](zalo-account)
- [Vì sao Zalo gửi chậm](zalo-gui-cham)`,
    body_html: `<h2>Hộp thư hợp nhất</h2><p>Khách nhắn từ đâu cũng đổ về một màn hình: website, Zalo OA, Facebook Messenger, Zalo cá nhân.</p><h3>Vào ở đâu</h3><p>Menu <strong>Hộp thư</strong>, hoặc <a href="/app/settings/inbox">/app/settings/inbox</a>. Chỉ <strong>chủ tài khoản</strong> vào được.</p><p>[ẢNH: hộp thư hợp nhất, cột trái là danh sách hội thoại, cột phải là nội dung chat]</p><h3>Đọc màn hình này</h3><ul><li><strong>Cột trái</strong> — danh sách hội thoại, mới nhất lên trên. Số tròn màu là tin <strong>chưa đọc</strong>.</li><li><strong>Cột phải</strong> — nội dung trao đổi. Tin của khách, của AI và của bạn nằm chung một dòng thời gian.</li><li><strong>Bộ lọc trên đầu</strong> — lọc theo kênh khi chỉ muốn xem riêng Zalo hoặc riêng website.</li></ul><p>Số chưa đọc chỉ mất đi khi <strong>chính bạn mở hội thoại đó trên web</strong>. Bot trả lời không làm mất dấu chưa đọc — nên đây là chỗ đáng tin để rà cuối ngày, kể cả khi ứng dụng Zalo trên điện thoại đã hiện là đã đọc.</p><h3>Khi bạn muốn tự trả lời</h3><p>Gõ thẳng vào ô trả lời rồi gửi. <strong>AI tự dừng lại</strong> cho hội thoại đó ngay khi bạn chen vào — để bot không nói chồng lên bạn giữa chừng.</p><p>Hội thoại đang dừng sẽ có nhãn <strong>AI đang tạm dừng</strong>. Bật lại bằng công tắc AI ngay trên đầu khung chat.</p><blockquote><p>Mặc định AI <strong>không tự bật lại</strong>. Nếu muốn nó tự tiếp quản sau một lúc bạn không trả lời nữa, hãy bật tuỳ chọn tự bật lại AI trong phần cài đặt — nên để <strong>30 phút</strong>.</p></blockquote><p>Đây cũng là nguyên nhân phổ biến nhất của tình trạng &quot;hôm qua bot trả lời, hôm nay im&quot;: bạn đã trả lời tay người đó một lần, và bot dừng vĩnh viễn với riêng họ.</p><h3>Nhắn từ Zalo trên điện thoại</h3><p>Tin bạn gõ thẳng trong ứng dụng Zalo cũng hiện ở đây và cũng làm AI tạm dừng, y như khi trả lời trên web.</p><h3>Tệp và ảnh đã gửi</h3><p>Ảnh, tệp đính kèm dùng trong hộp thư nằm ở <strong>Thư viện media</strong>, tại <a href="/app/settings/media-library">/app/settings/media-library</a>.</p><h3>Liên quan</h3><ul><li><a href="chatbot">Chatbot AI trả lời khách tự động</a></li><li><a href="zalo-account">Thêm tài khoản Zalo</a></li><li><a href="zalo-gui-cham">Vì sao Zalo gửi chậm</a></li></ul>`,
  },
  {
    slug: 'landing-page',
    feature_key: 'landing-page',
    primary_route: '/app/settings/landing-pages',
    sort_order: 100,
    title: 'Landing page thu khách hàng',
    summary: 'Tạo trang bán hàng bằng AI hoặc mẫu có sẵn, gắn form thu thông tin, chạy trên tên miền riêng và xem khách để lại liên hệ.',
    body_md: `# Landing page thu khách hàng
Trang giới thiệu kèm form đăng ký, dùng để chạy quảng cáo hoặc gắn vào chiến dịch. Không cần biết code.

## Vào ở đâu
Menu **Landing page**, hoặc [/app/settings/landing-pages](/app/settings/landing-pages).

[ẢNH: danh sách landing page với trạng thái đã xuất bản]

## Ba cách tạo trang

| Cách | Hợp khi |
|---|---|
| **Tạo với AI** | Chưa có gì trong tay, muốn có bản nháp trong một phút |
| **Chọn mẫu có sẵn** | Muốn bố cục chuẩn rồi tự sửa chữ |
| **Trình sửa trực quan** | Muốn kéo thả từng khối, không đụng vào mã |

## Sửa một chi tiết mà không mất cả trang
Đây là chỗ hay nhầm nhất. Trong cửa sổ AI có **ba tab**:

- **Sửa trang hiện tại** — chỉ đổi đúng phần bạn mô tả, giữ nguyên phần còn lại
- **Chọn mẫu có sẵn** và **Tạo mới theo mô tả** — **tạo lại toàn bộ trang**, giao diện cũ mất

Khi trang đã có nội dung, hệ thống tự mở sẵn tab **Sửa trang hiện tại**. Chỉ muốn đổi màu nút hay thêm một mục thì dùng đúng tab đó, đừng dùng hai tab kia.

> Lỡ ghi đè rồi vẫn cứu được: bấm nút **Hoàn tác** trên thanh công cụ để lấy lại giao diện trước đó.

[ẢNH: cửa sổ AI đang ở tab Sửa trang hiện tại]

## Form thu thông tin khách
Mỗi trang có sẵn một vị trí đặt form đăng ký. Khách điền xong, thông tin về thẳng [/app/landing-leads](/app/landing-leads).

Đừng xoá khối form khi sửa trang — mất nó là trang không thu được ai nữa.

## Tên miền riêng
Trang mặc định chạy trên tên miền phụ của hệ thống. Muốn dùng tên miền của bạn thì khai trong phần cài đặt tên miền của trang, rồi trỏ DNS theo hướng dẫn hiện trên màn hình. Chứng chỉ bảo mật được cấp tự động sau khi DNS trỏ đúng.

## Liên quan
- [Hồ sơ doanh nghiệp](ai-profile)
- [Tạo chiến dịch](campaign-create)
- [Khách hàng](khach-hang)`,
    body_html: `<h2>Landing page thu khách hàng</h2><p>Trang giới thiệu kèm form đăng ký, dùng để chạy quảng cáo hoặc gắn vào chiến dịch. Không cần biết code.</p><h3>Vào ở đâu</h3><p>Menu <strong>Landing page</strong>, hoặc <a href="/app/settings/landing-pages">/app/settings/landing-pages</a>.</p><p>[ẢNH: danh sách landing page với trạng thái đã xuất bản]</p><h3>Ba cách tạo trang</h3><table><thead><tr><th>Cách</th><th>Hợp khi</th></tr></thead><tbody><tr><td><strong>Tạo với AI</strong></td><td>Chưa có gì trong tay, muốn có bản nháp trong một phút</td></tr><tr><td><strong>Chọn mẫu có sẵn</strong></td><td>Muốn bố cục chuẩn rồi tự sửa chữ</td></tr><tr><td><strong>Trình sửa trực quan</strong></td><td>Muốn kéo thả từng khối, không đụng vào mã</td></tr></tbody></table><h3>Sửa một chi tiết mà không mất cả trang</h3><p>Đây là chỗ hay nhầm nhất. Trong cửa sổ AI có <strong>ba tab</strong>:</p><ul><li><strong>Sửa trang hiện tại</strong> — chỉ đổi đúng phần bạn mô tả, giữ nguyên phần còn lại</li><li><strong>Chọn mẫu có sẵn</strong> và <strong>Tạo mới theo mô tả</strong> — <strong>tạo lại toàn bộ trang</strong>, giao diện cũ mất</li></ul><p>Khi trang đã có nội dung, hệ thống tự mở sẵn tab <strong>Sửa trang hiện tại</strong>. Chỉ muốn đổi màu nút hay thêm một mục thì dùng đúng tab đó, đừng dùng hai tab kia.</p><blockquote><p>Lỡ ghi đè rồi vẫn cứu được: bấm nút <strong>Hoàn tác</strong> trên thanh công cụ để lấy lại giao diện trước đó.</p></blockquote><p>[ẢNH: cửa sổ AI đang ở tab Sửa trang hiện tại]</p><h3>Form thu thông tin khách</h3><p>Mỗi trang có sẵn một vị trí đặt form đăng ký. Khách điền xong, thông tin về thẳng <a href="/app/landing-leads">/app/landing-leads</a>.</p><p>Đừng xoá khối form khi sửa trang — mất nó là trang không thu được ai nữa.</p><h3>Tên miền riêng</h3><p>Trang mặc định chạy trên tên miền phụ của hệ thống. Muốn dùng tên miền của bạn thì khai trong phần cài đặt tên miền của trang, rồi trỏ DNS theo hướng dẫn hiện trên màn hình. Chứng chỉ bảo mật được cấp tự động sau khi DNS trỏ đúng.</p><h3>Liên quan</h3><ul><li><a href="ai-profile">Hồ sơ doanh nghiệp</a></li><li><a href="campaign-create">Tạo chiến dịch</a></li><li><a href="khach-hang">Khách hàng</a></li></ul>`,
  },
  {
    slug: 'nhan-vien',
    feature_key: 'nhan-vien',
    primary_route: '/app/settings/employees',
    sort_order: 110,
    title: 'Nhân viên & phân quyền',
    summary: 'Thêm người cùng làm, cấp đúng quyền cần thiết, và hiểu vì sao có màn hình nhân viên không vào được.',
    body_md: `# Nhân viên & phân quyền
Thêm người trong team vào cùng làm, mỗi người chỉ thấy phần việc của mình.

## Vào ở đâu
Menu **Nhân viên**, hoặc [/app/settings/employees](/app/settings/employees). Chỉ **chủ tài khoản** vào được.

[ẢNH: danh sách nhân viên kèm quyền đã cấp]

## Thêm người
Nhập email của họ. Người đó đăng nhập bằng tài khoản riêng, nhưng làm việc trong không gian của bạn — dùng chung khách hàng, chiến dịch, kênh gửi.

Số nhân viên tối đa phụ thuộc gói đang dùng. Hết suất thì mua thêm tại [/app/topup](/app/topup).

## Chín nhóm quyền

| Nhóm quyền | Cho phép làm gì |
|---|---|
| Quản lý kênh gửi | Kết nối, sửa tài khoản email và Zalo |
| Mẫu tin nhắn | Tạo và sửa mẫu email, mẫu Zalo |
| Quản lý sản phẩm | Quản lý danh mục sản phẩm |
| Landing pages | Tạo và sửa landing page |
| Chiến dịch — xem | Chỉ xem, không sửa |
| Chiến dịch — tạo | Tạo và sửa chiến dịch |
| Chiến dịch — chạy | Bấm chạy, tạm dừng chiến dịch |
| Khách hàng | Xem và sửa danh sách khách |
| Leads landing page | Xem thông tin khách để lại từ landing page |

Ba quyền chiến dịch tách riêng có chủ đích: bạn cấp được quyền *tạo* cho người soạn nội dung mà không cho họ *bấm chạy* — tránh gửi nhầm hàng nghìn tin.

## Vì sao nhân viên không vào được vài màn hình
Một số phần **chỉ dành cho chủ tài khoản**, không cấp quyền được cho ai:

- Hồ sơ doanh nghiệp
- Chatbot Studio
- Hộp thư hợp nhất
- Gói dịch vụ, thanh toán, mua thêm
- Chính trang Nhân viên này

Đây là thiết kế, không phải lỗi phân quyền. Những phần đó đụng tới tiền hoặc tới toàn bộ không gian làm việc.

## Gỡ một người khỏi team
Tài khoản của họ vẫn còn, chỉ là không còn truy cập được dữ liệu của bạn nữa.

## Liên quan
- [Gói dịch vụ & thanh toán](plan-and-billing)
- [Kết nối kênh gửi](channels)
- [Tạo chiến dịch](campaign-create)`,
    body_html: `<h2>Nhân viên &amp; phân quyền</h2><p>Thêm người trong team vào cùng làm, mỗi người chỉ thấy phần việc của mình.</p><h3>Vào ở đâu</h3><p>Menu <strong>Nhân viên</strong>, hoặc <a href="/app/settings/employees">/app/settings/employees</a>. Chỉ <strong>chủ tài khoản</strong> vào được.</p><p>[ẢNH: danh sách nhân viên kèm quyền đã cấp]</p><h3>Thêm người</h3><p>Nhập email của họ. Người đó đăng nhập bằng tài khoản riêng, nhưng làm việc trong không gian của bạn — dùng chung khách hàng, chiến dịch, kênh gửi.</p><p>Số nhân viên tối đa phụ thuộc gói đang dùng. Hết suất thì mua thêm tại <a href="/app/topup">/app/topup</a>.</p><h3>Chín nhóm quyền</h3><table><thead><tr><th>Nhóm quyền</th><th>Cho phép làm gì</th></tr></thead><tbody><tr><td>Quản lý kênh gửi</td><td>Kết nối, sửa tài khoản email và Zalo</td></tr><tr><td>Mẫu tin nhắn</td><td>Tạo và sửa mẫu email, mẫu Zalo</td></tr><tr><td>Quản lý sản phẩm</td><td>Quản lý danh mục sản phẩm</td></tr><tr><td>Landing pages</td><td>Tạo và sửa landing page</td></tr><tr><td>Chiến dịch — xem</td><td>Chỉ xem, không sửa</td></tr><tr><td>Chiến dịch — tạo</td><td>Tạo và sửa chiến dịch</td></tr><tr><td>Chiến dịch — chạy</td><td>Bấm chạy, tạm dừng chiến dịch</td></tr><tr><td>Khách hàng</td><td>Xem và sửa danh sách khách</td></tr><tr><td>Leads landing page</td><td>Xem thông tin khách để lại từ landing page</td></tr></tbody></table><p>Ba quyền chiến dịch tách riêng có chủ đích: bạn cấp được quyền <em>tạo</em> cho người soạn nội dung mà không cho họ <em>bấm chạy</em> — tránh gửi nhầm hàng nghìn tin.</p><h3>Vì sao nhân viên không vào được vài màn hình</h3><p>Một số phần <strong>chỉ dành cho chủ tài khoản</strong>, không cấp quyền được cho ai:</p><ul><li>Hồ sơ doanh nghiệp</li><li>Chatbot Studio</li><li>Hộp thư hợp nhất</li><li>Gói dịch vụ, thanh toán, mua thêm</li><li>Chính trang Nhân viên này</li></ul><p>Đây là thiết kế, không phải lỗi phân quyền. Những phần đó đụng tới tiền hoặc tới toàn bộ không gian làm việc.</p><h3>Gỡ một người khỏi team</h3><p>Tài khoản của họ vẫn còn, chỉ là không còn truy cập được dữ liệu của bạn nữa.</p><h3>Liên quan</h3><ul><li><a href="plan-and-billing">Gói dịch vụ &amp; thanh toán</a></li><li><a href="channels">Kết nối kênh gửi</a></li><li><a href="campaign-create">Tạo chiến dịch</a></li></ul>`,
  },
  {
    slug: 'plan-and-billing',
    feature_key: 'plan-and-billing',
    primary_route: '/pricing',
    sort_order: 120,
    title: 'Gói dịch vụ & thanh toán',
    summary: 'Xem bảng giá, nâng gói, thanh toán PayOS và mua thêm hạn mức — phần mua thêm không hết hạn theo chu kỳ.',
    body_md: `# Gói dịch vụ & thanh toán
Quản lý gói thuê bao, thanh toán và mua thêm hạn mức (tin Zalo, email, lượt AI).

## Vào ở đâu
- Bảng giá công khai: [/pricing](/pricing)
- Thanh toán / checkout: [/checkout](/checkout)
- Mua thêm hạn mức: [/app/topup](/app/topup)
- Đơn hàng: [/app/orders](/app/orders) — chỉ **chủ tài khoản** thấy được (nhân viên không thấy)

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
- [Đổi gói — nâng cấp, hạ gói, đổi kỳ hạn](doi-goi)
- [Thêm tài khoản Zalo](zalo-account)
- [Kết nối kênh gửi](channels)
- [Câu hỏi thường gặp về thanh toán](faq-billing)
`,
    body_html: `<h2>Gói dịch vụ &amp; thanh toán</h2><p>Quản lý gói thuê bao, thanh toán và mua thêm hạn mức (tin Zalo, email, lượt AI).</p><h3>Vào ở đâu</h3><ul><li>Bảng giá công khai: <a href="/pricing">/pricing</a></li><li>Thanh toán / checkout: <a href="/checkout">/checkout</a></li><li>Mua thêm hạn mức: <a href="/app/topup">/app/topup</a></li><li>Đơn hàng: <a href="/app/orders">/app/orders</a> — chỉ <strong>chủ tài khoản</strong> thấy được (nhân viên không thấy)</li></ul><h3>Các bước</h3><ol><li>Vào /pricing chọn gói hoặc <strong>Gói tự chọn</strong>.</li><li>Thanh toán qua PayOS (QR). Sau khi thành công, hạn mức gói được kích hoạt.</li><li>Nếu sắp hết tin/email/AI giữa chu kỳ: vào /app/topup mua thêm (tối thiểu 50.000đ/đơn).</li><li>Phần mua thêm <strong>không hết hạn theo chu kỳ</strong> — còn nguyên sang kỳ sau, tiêu tới đâu trừ tới đó.</li></ol><h3>Hạn mức gói và phần mua thêm khác nhau thế nào</h3><ul><li><strong>Hạn mức gói</strong> làm mới mỗi kỳ. Dùng không hết thì mất, không cộng dồn.</li><li><strong>Phần mua thêm</strong> là số dư riêng, không làm mới và không mất khi sang kỳ mới.</li><li>Hệ thống <strong>tiêu hạn mức gói trước</strong>, hết mới trừ vào phần mua thêm — để phần bạn đã trả tiền được giữ lâu nhất.</li><li>Cần <strong>gói còn hiệu lực</strong> mới dùng được phần mua thêm. Gói hết hạn thì số dư vẫn còn nguyên, gia hạn là dùng tiếp.</li></ul><h3>Lỗi thường gặp</h3><ul><li>Đã trả tiền nhưng hạn mức chưa tăng → đợi webhook PayOS vài phút rồi tải lại trang.</li><li>Không mua được tin Zalo → năng lực tính theo <strong>số tài khoản Zalo đã kết nối</strong>, không theo số slot gói; hãy nối Zalo trước.</li><li>Hết credit AI → mua thêm tại /app/topup hoặc nâng gói.</li><li>Gói đã hết hạn, còn số dư mua thêm nhưng không gửi được → gia hạn gói; số dư không mất đi đâu.</li></ul><h3>Liên quan</h3><ul><li><a href="doi-goi">Đổi gói — nâng cấp, hạ gói, đổi kỳ hạn</a></li><li><a href="zalo-account">Thêm tài khoản Zalo</a></li><li><a href="channels">Kết nối kênh gửi</a></li><li><a href="faq-billing">Câu hỏi thường gặp về thanh toán</a></li></ul>`,
  },
  {
    slug: 'faq-billing',
    feature_key: 'plan-and-billing',
    primary_route: '/app/billing',
    sort_order: 125,
    title: 'Câu hỏi thường gặp về thanh toán & hoá đơn',
    summary: 'Ai được mua, mua thêm có hết hạn không, slot hết hạn thì mất dữ liệu không, và cách hệ thống tự xuất hoá đơn điện tử.',
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

## Có xuất hoá đơn điện tử không?
**Có.** Hệ thống xuất hoá đơn điện tử **tự động ngay sau khi thanh toán thành công**, bạn không phải yêu cầu.

**Giá niêm yết đã là giá cuối cùng.** Dịch vụ thuộc diện không chịu thuế nên hoá đơn **không cộng thêm phần trăm nào** — thấy 299.000đ thì trả đúng 299.000đ.

Ở bước thanh toán bạn có thể điền thông tin xuất hoá đơn, theo hai dạng **Công ty** (tên, mã số thuế, địa chỉ) hoặc **Cá nhân**. Phần này **không bắt buộc**:

- **Có điền** → hoá đơn ghi đúng tên bạn hoặc tên công ty, và được **gửi vào email** của bạn kèm file PDF.
- **Không điền** → hệ thống vẫn xuất hoá đơn dưới dạng *"Bán cho người tiêu dùng"* theo đúng quy định, nhưng không gửi email cho bạn.

Xem lại và tải hoá đơn bất cứ lúc nào tại **/invoices/mã-đơn-của-bạn**, mở từ mục Lịch sử đơn.

Lưu ý: hoá đơn đã phát hành thì **không sửa và không huỷ được**. Nếu cần hoá đơn mang tên công ty, hãy điền mã số thuế **ngay ở bước thanh toán**, đừng để sau.

## Có hoàn tiền không?
Hệ thống **không có luồng hoàn tiền tự động**. Trường hợp đặc biệt (thanh toán nhầm, trừ tiền hai lần) vui lòng liên hệ hỗ trợ kèm mã đơn.

## Xem lại đơn đã mua ở đâu?
Vào [/app/billing](/app/billing), mục **Lịch sử đơn** — có đủ đơn mua gói và đơn mua thêm.

## Liên quan
- [Gói dịch vụ & thanh toán](plan-and-billing)
- [Đổi gói — nâng cấp, hạ gói, đổi kỳ hạn](doi-goi)
- [Bắt đầu với Founder AI — 4 bước](getting-started)
- [Kết nối kênh gửi](channels)
`,
    body_html: `<h2>Câu hỏi thường gặp về thanh toán &amp; hoá đơn</h2><p>Các câu hỏi hay gặp nhất về tiền bạc. Xem trước phần này thì đỡ phải hỏi hỗ trợ.</p><h3>Ai được mua gói và mua thêm?</h3><p>Chỉ <strong>chủ tài khoản</strong>. Nhân viên được cấp quyền vẫn dùng được sản phẩm nhưng không thấy trang mua và không tự thanh toán được — để không ai tiêu tiền thay chủ.</p><h3>Mua thêm tin nhắn / email / lượt AI có hết hạn không?</h3><p><strong>Không.</strong> Số dư mua thêm nằm ở một ví riêng, không làm mới theo chu kỳ và không mất khi sang kỳ mới. Điều kiện duy nhất là gói phải còn hiệu lực mới tiêu được.</p><p>Hệ thống luôn <strong>tiêu hạn mức của gói trước</strong>, hết mới trừ vào ví — để phần bạn đã bỏ tiền mua được giữ lâu nhất có thể.</p><h3>Vậy còn tài khoản Zalo, landing page, chatbot mua thêm?</h3><p>Nhóm này <strong>khác hẳn</strong>: đây là thuê chỗ theo tháng, không phải ví. Khi mua bạn chọn 1, 3, 6 hoặc 12 tháng. Thời hạn tính từ ngày mua, không gắn với ngày hết hạn gói — nên mua sát cuối kỳ cũng không bị thiệt, và gia hạn gói không làm mất slot vừa mua.</p><h3>Hết hạn slot thì tôi có mất dữ liệu không?</h3><p><strong>Không mất gì.</strong> Hệ thống chỉ <strong>tạm khoá</strong>, toàn bộ nội dung landing page, chatbot và kết nối tài khoản vẫn còn nguyên. Trả tiền là dùng lại được ngay.</p><p>Bạn còn được <strong>tự chọn giữ cái nào</strong>: vào <a href="/app/billing">/app/billing</a>, mục <strong>Tài nguyên khoá</strong>, tick những thứ quan trọng để giữ trong hạn mức còn hiệu lực. Hệ thống cũng gửi email nhắc trước <strong>7 ngày</strong> và <strong>3 ngày</strong>.</p><p>Lưu ý: tài nguyên bị khoá vẫn chiếm chỗ. Muốn tạo cái mới thì xoá cái đang khoá trước.</p><h3>Vì sao tôi không mua thêm tin Zalo được?</h3><p>Hai lý do thường gặp:</p><ul><li><strong>Chưa kết nối tài khoản Zalo nào.</strong> Mua tin mà không có tài khoản để gửi thì tiền nằm chết — hãy kết nối trước tại <a href="/app/settings/channels">/app/settings/channels</a>.</li><li><strong>Mua vượt năng lực gửi thật.</strong> Mỗi tài khoản Zalo chỉ gửi được khoảng 16.000 tin/tháng. Cần nhiều hơn thì mua thêm tài khoản Zalo, không phải mua thêm tin.</li></ul><h3>Đơn tối thiểu là bao nhiêu?</h3><p><strong>50.000đ</strong> một đơn mua thêm. Dưới mức này phí thanh toán ăn gần hết giá trị đơn.</p><h3>Gói tôi hết hạn, đang trong thời gian ân hạn thì mua được gì?</h3><p>Chỉ mua được <strong>tin nhắn, email, lượt AI</strong>. Không mua được thêm tài khoản Zalo/Email, landing page hay chatbot cho tới khi gia hạn gói.</p><h3>Đã thanh toán nhưng hạn mức chưa tăng?</h3><p>Đợi vài phút rồi tải lại trang — hệ thống cần nhận xác nhận từ cổng thanh toán. Quá 15 phút vẫn chưa thấy thì liên hệ hỗ trợ kèm <strong>mã đơn</strong>, đơn không bị mất.</p><h3>Có xuất hoá đơn điện tử không?</h3><p><strong>Có.</strong> Hệ thống xuất hoá đơn điện tử <strong>tự động ngay sau khi thanh toán thành công</strong>, bạn không phải yêu cầu.</p><p><strong>Giá niêm yết đã là giá cuối cùng.</strong> Dịch vụ thuộc diện không chịu thuế nên hoá đơn <strong>không cộng thêm phần trăm nào</strong> — thấy 299.000đ thì trả đúng 299.000đ.</p><p>Ở bước thanh toán bạn có thể điền thông tin xuất hoá đơn, theo hai dạng <strong>Công ty</strong> (tên, mã số thuế, địa chỉ) hoặc <strong>Cá nhân</strong>. Phần này <strong>không bắt buộc</strong>:</p><ul><li><strong>Có điền</strong> → hoá đơn ghi đúng tên bạn hoặc tên công ty, và được <strong>gửi vào email</strong> của bạn kèm file PDF.</li><li><strong>Không điền</strong> → hệ thống vẫn xuất hoá đơn dưới dạng <em>"Bán cho người tiêu dùng"</em> theo đúng quy định, nhưng không gửi email cho bạn.</li></ul><p>Xem lại và tải hoá đơn bất cứ lúc nào tại <strong>/invoices/mã-đơn-của-bạn</strong>, mở từ mục Lịch sử đơn.</p><p>Lưu ý: hoá đơn đã phát hành thì <strong>không sửa và không huỷ được</strong>. Nếu cần hoá đơn mang tên công ty, hãy điền mã số thuế <strong>ngay ở bước thanh toán</strong>, đừng để sau.</p><h3>Có hoàn tiền không?</h3><p>Hệ thống <strong>không có luồng hoàn tiền tự động</strong>. Trường hợp đặc biệt (thanh toán nhầm, trừ tiền hai lần) vui lòng liên hệ hỗ trợ kèm mã đơn.</p><h3>Xem lại đơn đã mua ở đâu?</h3><p>Vào <a href="/app/billing">/app/billing</a>, mục <strong>Lịch sử đơn</strong> — có đủ đơn mua gói và đơn mua thêm.</p><h3>Liên quan</h3><ul><li><a href="plan-and-billing">Gói dịch vụ &amp; thanh toán</a></li><li><a href="doi-goi">Đổi gói — nâng cấp, hạ gói, đổi kỳ hạn</a></li><li><a href="getting-started">Bắt đầu với Founder AI — 4 bước</a></li><li><a href="channels">Kết nối kênh gửi</a></li></ul>`,
  },
  {
    slug: 'doi-goi',
    feature_key: 'plan-and-billing',
    primary_route: '/pricing',
    sort_order: 128,
    title: 'Đổi gói — nâng cấp, hạ gói, đổi kỳ hạn',
    summary: 'Nâng gói dùng được ngay nhưng mất phần ngày còn lại; hạ gói thì dùng hết chu kỳ rồi mới chuyển. Kèm quy tắc đổi tháng ↔ năm và cách xử lý khi vượt hạn mức.',
    body_md: `# Đổi gói — nâng cấp, hạ gói, đổi kỳ hạn
Bạn đổi gói bất cứ lúc nào, không cần chờ hết hạn. Nhưng nâng gói và hạ gói chạy theo hai cách khác nhau — đọc phần dưới trước khi bấm để không mất tiền oan.

## Nâng lên gói cao hơn — dùng được ngay
Chọn gói cao hơn, thanh toán xong là dùng được ngay lập tức.

**Điều quan trọng nhất cần biết:** thời hạn gói mới **tính lại từ ngày bạn nâng cấp**. Phần ngày chưa dùng hết của gói cũ **không được cộng dồn**.

Ví dụ: bạn còn 25 ngày gói Cơ bản, nâng lên gói Chuyên nghiệp hôm nay → bạn có 30 ngày Chuyên nghiệp tính từ hôm nay, 25 ngày Cơ bản kia không được cộng thêm.

Vì vậy nếu không gấp, nâng gói vào **gần cuối chu kỳ** sẽ lợi hơn. Hệ thống luôn hiện cảnh báo số ngày bạn sắp mất trước khi bấm xác nhận.

## Hạ xuống gói thấp hơn — dùng hết chu kỳ đã trả
Bạn **không bị cắt quyền lợi giữa chừng**. Gói hiện tại chạy hết chu kỳ đã thanh toán, tới ngày hết hạn hệ thống **tự chuyển sang gói mới**.

Cách làm: chọn gói thấp hơn và **thanh toán ngay hôm nay**. Hệ thống ghi nhận lệnh rồi tự kích hoạt đúng ngày — bạn không phải nhớ, không phải vào lại lần nữa.

Trong thời gian chờ, bạn vẫn dùng đầy đủ quyền lợi của gói cũ.

## Đổi kỳ hạn tháng ↔ năm

| Bạn đang dùng | Muốn đổi sang | Được không |
|---|---|---|
| Gói tháng | Cùng gói đó theo năm | Được — tính là nâng cấp, 365 ngày từ hôm nay |
| Gói tháng | Gói khác theo năm | Được — tính là nâng cấp |
| Gói năm | Gói khác theo năm | Được |
| Gói năm | Bất kỳ gói nào theo tháng | Chỉ được khi gói năm **còn dưới 30 ngày** hoặc đã hết hạn |

Đang dùng gói năm mà còn nhiều thời gian thì chưa chuyển về gói tháng được — chờ tới khi còn dưới 30 ngày.

## Gói tự chọn
Gói tự chọn được so cao/thấp với gói cố định **bằng giá tiền, và phải cùng kỳ hạn** — gói tự chọn theo tháng so với gói cố định theo tháng.

Giá cao hơn thì tính là nâng cấp (dùng ngay), giá thấp hơn thì tính là hạ gói (chờ hết chu kỳ).

## Lệnh hẹn đổi gói — những điều cần biết
Khi bạn đã thanh toán để hạ gói từ kỳ sau, đó là một **lệnh hẹn**. Quy tắc:

- **Mỗi lúc chỉ có một lệnh hẹn.**
- **Không huỷ được và không hoàn tiền.** Hãy cân nhắc kỹ trước khi thanh toán.
- **Giá đã khoá.** Bảng giá có tăng trong thời gian chờ cũng không thu thêm của bạn.
- **Đổi lên gói cao hơn thì được** — bạn chỉ trả thêm phần chênh lệch, không phải trả lại từ đầu. Đổi xuống gói rẻ hơn thì không được.
- **Vẫn nâng gói đang dùng bình thường.** Có lệnh hẹn không ngăn bạn nâng cấp ngay hôm nay nếu cần.
- **Hoá đơn xuất ngay hôm bạn thanh toán**, không đợi tới ngày gói kích hoạt. Nếu sau đó bạn trả thêm chênh lệch để nâng lệnh hẹn thì lần trả thêm đó có **hoá đơn riêng** — bạn sẽ có hai hoá đơn cho cùng một gói, đây là điều bình thường và đúng quy định.

## Sau khi hạ gói mà đang dùng quá hạn mức mới
Ví dụ bạn có 10 landing page nhưng gói mới chỉ cho 3.

**Hệ thống không xoá gì của bạn.** Cách xử lý:

1. Từ ngày gói mới có hiệu lực, bạn có **7 ngày ân hạn** — mọi thứ vẫn chạy bình thường, phần vượt hạn mức được **tô đỏ** để bạn biết.
2. Hết 7 ngày, phần tô đỏ bị **khoá** — không truy cập và không sử dụng được, nhưng **dữ liệu vẫn còn nguyên**.
3. Bạn xoá bớt cho tới khi số lượng về đúng hạn mức → mọi thứ **mở khoá lại**.

Bạn được xoá cái nào tuỳ ý, không bắt buộc xoá đúng cái đang bị tô đỏ.

Áp dụng cho landing page, chiến dịch, mẫu tin, tài khoản Zalo/Email, chatbot, nhân viên và dung lượng lưu trữ. Riêng hai loại dưới đây ảnh hưởng ra bên ngoài, nên xử lý sớm:

- **Nhân viên bị khoá** sẽ không vào được khu làm việc của công ty.
- **Chatbot bị khoá** ngưng hoạt động — khách nhắn vào sẽ không có ai trả lời.

Không áp dụng cho tin Zalo, email và lượt AI — ba loại này tự làm mới mỗi chu kỳ.

## Hạn mức làm mới khi nào
Hạn mức làm mới theo **chu kỳ 30 ngày tính từ ngày bạn đăng ký**, không theo ngày đầu tháng. Mua ngày 20 thì hạn mức làm mới vào khoảng ngày 20 hằng tháng.

Mua gói năm cũng vậy: bạn nhận hạn mức **theo từng tháng**, không phải nhận trọn cả năm một lần. Gói 500 tin/tháng mua theo năm nghĩa là mỗi chu kỳ 500 tin, **không phải 6.000 tin dùng tự do**. Dùng không hết thì mất, không cộng dồn sang chu kỳ sau.

Muốn phần không mất khi sang kỳ mới thì mua thêm tại trang mua thêm hạn mức — phần mua thêm nằm ở ví riêng và không hết hạn.

## Câu hỏi thường gặp
**Nâng gói có mất dữ liệu không?** Không. Toàn bộ chiến dịch, khách hàng, landing page, chatbot đều giữ nguyên.

**Tôi nâng gói giữa chừng, số ngày cũ có được trả lại không?** Không. Thời hạn tính lại từ ngày nâng cấp.

**Hạ gói rồi tôi có bị cắt quyền lợi ngay không?** Không. Bạn dùng hết chu kỳ đã thanh toán, sau đó mới chuyển.

**Tôi đã đặt hạ gói, giờ muốn đổi ý?** Không huỷ được và không hoàn tiền. Nhưng bạn đổi lên gói cao hơn được bằng cách trả thêm phần chênh lệch.

**Đang dùng gói năm, tôi muốn về gói tháng?** Chờ tới khi gói năm còn dưới 30 ngày.

**Hết 7 ngày ân hạn, hệ thống có xoá landing page của tôi không?** Không xoá. Chỉ khoá lại, dữ liệu còn nguyên, xoá bớt là mở khoá.

## Liên quan
- [Gói dịch vụ & thanh toán](plan-and-billing)
- [Câu hỏi thường gặp về thanh toán & hoá đơn](faq-billing)
`,
    body_html: `<h2>Đổi gói — nâng cấp, hạ gói, đổi kỳ hạn</h2><p>Bạn đổi gói bất cứ lúc nào, không cần chờ hết hạn. Nhưng nâng gói và hạ gói chạy theo hai cách khác nhau — đọc phần dưới trước khi bấm để không mất tiền oan.</p><h3>Nâng lên gói cao hơn — dùng được ngay</h3><p>Chọn gói cao hơn, thanh toán xong là dùng được ngay lập tức.</p><p><strong>Điều quan trọng nhất cần biết:</strong> thời hạn gói mới <strong>tính lại từ ngày bạn nâng cấp</strong>. Phần ngày chưa dùng hết của gói cũ <strong>không được cộng dồn</strong>.</p><p>Ví dụ: bạn còn 25 ngày gói Cơ bản, nâng lên gói Chuyên nghiệp hôm nay → bạn có 30 ngày Chuyên nghiệp tính từ hôm nay, 25 ngày Cơ bản kia không được cộng thêm.</p><p>Vì vậy nếu không gấp, nâng gói vào <strong>gần cuối chu kỳ</strong> sẽ lợi hơn. Hệ thống luôn hiện cảnh báo số ngày bạn sắp mất trước khi bấm xác nhận.</p><h3>Hạ xuống gói thấp hơn — dùng hết chu kỳ đã trả</h3><p>Bạn <strong>không bị cắt quyền lợi giữa chừng</strong>. Gói hiện tại chạy hết chu kỳ đã thanh toán, tới ngày hết hạn hệ thống <strong>tự chuyển sang gói mới</strong>.</p><p>Cách làm: chọn gói thấp hơn và <strong>thanh toán ngay hôm nay</strong>. Hệ thống ghi nhận lệnh rồi tự kích hoạt đúng ngày — bạn không phải nhớ, không phải vào lại lần nữa.</p><p>Trong thời gian chờ, bạn vẫn dùng đầy đủ quyền lợi của gói cũ.</p><h3>Đổi kỳ hạn tháng ↔ năm</h3><table><thead><tr><th>Bạn đang dùng</th><th>Muốn đổi sang</th><th>Được không</th></tr></thead><tbody><tr><td>Gói tháng</td><td>Cùng gói đó theo năm</td><td>Được — tính là nâng cấp, 365 ngày từ hôm nay</td></tr><tr><td>Gói tháng</td><td>Gói khác theo năm</td><td>Được — tính là nâng cấp</td></tr><tr><td>Gói năm</td><td>Gói khác theo năm</td><td>Được</td></tr><tr><td>Gói năm</td><td>Bất kỳ gói nào theo tháng</td><td>Chỉ được khi gói năm <strong>còn dưới 30 ngày</strong> hoặc đã hết hạn</td></tr></tbody></table><p>Đang dùng gói năm mà còn nhiều thời gian thì chưa chuyển về gói tháng được — chờ tới khi còn dưới 30 ngày.</p><h3>Gói tự chọn</h3><p>Gói tự chọn được so cao/thấp với gói cố định <strong>bằng giá tiền, và phải cùng kỳ hạn</strong> — gói tự chọn theo tháng so với gói cố định theo tháng.</p><p>Giá cao hơn thì tính là nâng cấp (dùng ngay), giá thấp hơn thì tính là hạ gói (chờ hết chu kỳ).</p><h3>Lệnh hẹn đổi gói — những điều cần biết</h3><p>Khi bạn đã thanh toán để hạ gói từ kỳ sau, đó là một <strong>lệnh hẹn</strong>. Quy tắc:</p><ul><li><strong>Mỗi lúc chỉ có một lệnh hẹn.</strong></li><li><strong>Không huỷ được và không hoàn tiền.</strong> Hãy cân nhắc kỹ trước khi thanh toán.</li><li><strong>Giá đã khoá.</strong> Bảng giá có tăng trong thời gian chờ cũng không thu thêm của bạn.</li><li><strong>Đổi lên gói cao hơn thì được</strong> — bạn chỉ trả thêm phần chênh lệch, không phải trả lại từ đầu. Đổi xuống gói rẻ hơn thì không được.</li><li><strong>Vẫn nâng gói đang dùng bình thường.</strong> Có lệnh hẹn không ngăn bạn nâng cấp ngay hôm nay nếu cần.</li></ul><h3>Sau khi hạ gói mà đang dùng quá hạn mức mới</h3><p>Ví dụ bạn có 10 landing page nhưng gói mới chỉ cho 3.</p><p><strong>Hệ thống không xoá gì của bạn.</strong> Cách xử lý:</p><ol><li>Từ ngày gói mới có hiệu lực, bạn có <strong>7 ngày ân hạn</strong> — mọi thứ vẫn chạy bình thường, phần vượt hạn mức được <strong>tô đỏ</strong> để bạn biết.</li><li>Hết 7 ngày, phần tô đỏ bị <strong>khoá</strong> — không truy cập và không sử dụng được, nhưng <strong>dữ liệu vẫn còn nguyên</strong>.</li><li>Bạn xoá bớt cho tới khi số lượng về đúng hạn mức → mọi thứ <strong>mở khoá lại</strong>.</li></ol><p>Bạn được xoá cái nào tuỳ ý, không bắt buộc xoá đúng cái đang bị tô đỏ.</p><p>Áp dụng cho landing page, chiến dịch, mẫu tin, tài khoản Zalo/Email, chatbot, nhân viên và dung lượng lưu trữ. Riêng hai loại dưới đây ảnh hưởng ra bên ngoài, nên xử lý sớm:</p><ul><li><strong>Nhân viên bị khoá</strong> sẽ không vào được khu làm việc của công ty.</li><li><strong>Chatbot bị khoá</strong> ngưng hoạt động — khách nhắn vào sẽ không có ai trả lời.</li></ul><p>Không áp dụng cho tin Zalo, email và lượt AI — ba loại này tự làm mới mỗi chu kỳ.</p><h3>Hạn mức làm mới khi nào</h3><p>Hạn mức làm mới theo <strong>chu kỳ 30 ngày tính từ ngày bạn đăng ký</strong>, không theo ngày đầu tháng. Mua ngày 20 thì hạn mức làm mới vào khoảng ngày 20 hằng tháng.</p><p>Mua gói năm cũng vậy: bạn nhận hạn mức <strong>theo từng tháng</strong>, không phải nhận trọn cả năm một lần. Gói 500 tin/tháng mua theo năm nghĩa là mỗi chu kỳ 500 tin, <strong>không phải 6.000 tin dùng tự do</strong>. Dùng không hết thì mất, không cộng dồn sang chu kỳ sau.</p><p>Muốn phần không mất khi sang kỳ mới thì mua thêm tại trang mua thêm hạn mức — phần mua thêm nằm ở ví riêng và không hết hạn.</p><h3>Câu hỏi thường gặp</h3><p><strong>Nâng gói có mất dữ liệu không?</strong> Không. Toàn bộ chiến dịch, khách hàng, landing page, chatbot đều giữ nguyên.</p><p><strong>Tôi nâng gói giữa chừng, số ngày cũ có được trả lại không?</strong> Không. Thời hạn tính lại từ ngày nâng cấp.</p><p><strong>Hạ gói rồi tôi có bị cắt quyền lợi ngay không?</strong> Không. Bạn dùng hết chu kỳ đã thanh toán, sau đó mới chuyển.</p><p><strong>Tôi đã đặt hạ gói, giờ muốn đổi ý?</strong> Không huỷ được và không hoàn tiền. Nhưng bạn đổi lên gói cao hơn được bằng cách trả thêm phần chênh lệch.</p><p><strong>Đang dùng gói năm, tôi muốn về gói tháng?</strong> Chờ tới khi gói năm còn dưới 30 ngày.</p><p><strong>Hết 7 ngày ân hạn, hệ thống có xoá landing page của tôi không?</strong> Không xoá. Chỉ khoá lại, dữ liệu còn nguyên, xoá bớt là mở khoá.</p><h3>Liên quan</h3><ul><li><a href="plan-and-billing">Gói dịch vụ &amp; thanh toán</a></li><li><a href="faq-billing">Câu hỏi thường gặp về thanh toán &amp; hoá đơn</a></li></ul>`,
  },
];

export default HELP_SEED_ARTICLES;
