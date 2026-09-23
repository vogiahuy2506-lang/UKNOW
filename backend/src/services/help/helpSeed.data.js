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

# Tìm trang này trên màn hình
Nhìn sang **thanh menu bên trái**, kéo xuống gần cuối. Bấm vào nhóm **Cài đặt** cho nó mở ra, rồi chọn mục **Hồ sơ doanh nghiệp**.

[ẢNH: thanh menu bên trái đang mở nhóm Cài đặt, khoanh đỏ mục "Hồ sơ doanh nghiệp"]

Không thấy nhóm **Cài đặt** trong menu? Trang này chỉ dành cho **chủ tài khoản**. Nếu bạn đang đăng nhập bằng tài khoản nhân viên thì mục đó được ẩn đi.

[ẢNH: toàn trang Hồ sơ doanh nghiệp sau khi mở, thấy các mục Thông tin cơ bản / Nhóm khách hàng mục tiêu / Nhận diện thương hiệu xếp từ trên xuống]

# Bốn phần cần khai
## Thông tin cơ bản
Tên công ty và ngành nghề. Ngắn gọn, nhưng viết đúng tên thương hiệu bạn muốn xuất hiện trong tin nhắn gửi khách.

[ẢNH: phần Thông tin cơ bản đã điền tên công ty và ngành nghề]

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

[ẢNH: phần Nhận diện thương hiệu, đang mở danh sách chọn giọng điệu, bên cạnh là ô chọn màu và nút tải logo]

## Thông tin bổ sung
Chỗ để những gì không lọt vào các ô trên: chính sách bảo hành, khu vực phục vụ, điều gì tuyệt đối không được nói. Viết tự do.

[ẢNH: ô Thông tin bổ sung đã điền vài dòng ví dụ]

Điền xong nhớ bấm nút **lưu** ở cuối trang — đóng trang mà chưa lưu là mất hết.

[ẢNH: cuối trang, khoanh đỏ nút lưu]

# Sản phẩm khai ở trang khác
Đừng tìm chỗ nhập sản phẩm trong trang này — **sản phẩm và dịch vụ quản lý ở trang Sản phẩm riêng**. AI và chiến dịch đọc dữ liệu từ đó.

Ngay trong trang hồ sơ có sẵn một liên kết bấm sang trang Sản phẩm, không cần tìm trong menu.

[ẢNH: khoanh đỏ liên kết dẫn sang trang Sản phẩm nằm trong trang hồ sơ]

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
    body_html: `<p>Đây là nơi bạn kể cho trợ lý AI biết bạn là ai, bán gì và nói chuyện với khách theo kiểu nào. Khai <strong>một lần</strong>, sau đó mọi nội dung AI viết — email, tin Zalo, landing page — đều bám theo hồ sơ này.</p><p>Đây là việc nên làm đầu tiên sau khi tạo tài khoản. Bỏ qua thì AI vẫn viết được, nhưng viết chung chung, không nhắc đúng tên sản phẩm của bạn, và bạn mất thời gian sửa từng bài.</p><h2>Tìm trang này trên màn hình</h2><p>Nhìn sang <strong>thanh menu bên trái</strong>, kéo xuống gần cuối. Bấm vào nhóm <strong>Cài đặt</strong> cho nó mở ra, rồi chọn mục <strong>Hồ sơ doanh nghiệp</strong>.</p><p>[ẢNH: thanh menu bên trái đang mở nhóm Cài đặt, khoanh đỏ mục &quot;Hồ sơ doanh nghiệp&quot;]</p><p>Không thấy nhóm <strong>Cài đặt</strong> trong menu? Trang này chỉ dành cho <strong>chủ tài khoản</strong>. Nếu bạn đang đăng nhập bằng tài khoản nhân viên thì mục đó được ẩn đi.</p><p>[ẢNH: toàn trang Hồ sơ doanh nghiệp sau khi mở, thấy các mục Thông tin cơ bản / Nhóm khách hàng mục tiêu / Nhận diện thương hiệu xếp từ trên xuống]</p><h2>Bốn phần cần khai</h2><h3>Thông tin cơ bản</h3><p>Tên công ty và ngành nghề. Ngắn gọn, nhưng viết đúng tên thương hiệu bạn muốn xuất hiện trong tin nhắn gửi khách.</p><p>[ẢNH: phần Thông tin cơ bản đã điền tên công ty và ngành nghề]</p><h3>Nhóm khách hàng mục tiêu</h3><p>Phần này quyết định chất lượng nội dung nhiều nhất, nhưng hay bị bỏ trống.</p><p>Bạn mô tả từng nhóm khách, mỗi nhóm gồm:</p><ul><li><strong>Tên nhóm khách</strong> — ví dụ <em>&quot;Sinh viên IT 18–25 tuổi&quot;</em></li><li><strong>Đặc điểm</strong> — họ là ai, thói quen, khả năng chi trả</li><li><strong>Vấn đề / Nỗi đau chính</strong> — điều gì khiến họ cần sản phẩm của bạn</li></ul><p>Thêm được nhiều nhóm. Nhóm càng cụ thể, AI càng viết trúng — vì nó biết đang nói với ai thay vì viết cho &quot;khách hàng&quot; chung chung.</p><p>[ẢNH: một nhóm khách hàng mục tiêu đã điền đủ tên nhóm, đặc điểm và nỗi đau]</p><h3>Nhận diện thương hiệu</h3><p>Chọn <strong>giọng điệu</strong> bạn muốn AI dùng:</p><table><thead><tr><th>Giọng điệu</th><th>Hợp với</th></tr></thead><tbody><tr><td><strong>Chuyên nghiệp</strong></td><td>Dịch vụ B2B, tư vấn, tài chính</td></tr><tr><td><strong>Thân thiện</strong></td><td>Bán lẻ, dịch vụ chăm sóc khách</td></tr><tr><td><strong>Trang trọng</strong></td><td>Giáo dục, y tế, cơ quan</td></tr><tr><td><strong>Gần gũi, trẻ trung</strong></td><td>Thời trang, F&amp;B, khách trẻ</td></tr><tr><td><strong>Truyền cảm hứng</strong></td><td>Khoá học, huấn luyện, cộng đồng</td></tr></tbody></table><p>Kèm màu thương hiệu và logo, dùng khi AI dựng landing page.</p><p>[ẢNH: phần Nhận diện thương hiệu, đang mở danh sách chọn giọng điệu, bên cạnh là ô chọn màu và nút tải logo]</p><h3>Thông tin bổ sung</h3><p>Chỗ để những gì không lọt vào các ô trên: chính sách bảo hành, khu vực phục vụ, điều gì tuyệt đối không được nói. Viết tự do.</p><p>[ẢNH: ô Thông tin bổ sung đã điền vài dòng ví dụ]</p><p>Điền xong nhớ bấm nút <strong>lưu</strong> ở cuối trang — đóng trang mà chưa lưu là mất hết.</p><p>[ẢNH: cuối trang, khoanh đỏ nút lưu]</p><h2>Sản phẩm khai ở trang khác</h2><p>Đừng tìm chỗ nhập sản phẩm trong trang này — <strong>sản phẩm và dịch vụ quản lý ở trang Sản phẩm riêng</strong>. AI và chiến dịch đọc dữ liệu từ đó.</p><p>Ngay trong trang hồ sơ có sẵn một liên kết bấm sang trang Sản phẩm, không cần tìm trong menu.</p><p>[ẢNH: khoanh đỏ liên kết dẫn sang trang Sản phẩm nằm trong trang hồ sơ]</p><h2>Viết bao nhiêu là đủ</h2><p>Tối thiểu 3–5 câu cụ thể cho mỗi phần. Cụ thể quan trọng hơn dài.</p><p>So sánh nhanh:</p><ul><li>❌ <em>&quot;Chúng tôi bán khoá học chất lượng cao&quot;</em> — AI không rút được gì từ câu này.</li><li>✅ <em>&quot;Khoá học tiếng Anh giao tiếp cho người đi làm 25–35 tuổi, học tối 2 buổi/tuần qua Zoom, cam kết hoàn tiền nếu nghỉ quá 3 buổi&quot;</em> — AI biết đối tượng, hình thức, cam kết.</li></ul><h2>Sửa hồ sơ lúc nào cũng được</h2><p>Hồ sơ cập nhật bất cứ lúc nào. Nội dung AI viết <strong>sau khi sửa</strong> sẽ dùng thông tin mới; những gì đã tạo trước đó giữ nguyên, không tự đổi theo.</p><p>Nên xem lại hồ sơ mỗi khi đổi sản phẩm chính hoặc nhắm sang nhóm khách mới.</p><h2>Lỗi thường gặp</h2><ul><li><strong>Trợ lý AI trả lời chung chung, không nhắc tên sản phẩm</strong> → Hồ sơ còn trống hoặc quá sơ sài. Bổ sung phần Nhóm khách hàng mục tiêu trước, đó là phần ảnh hưởng nhiều nhất.</li><li><strong>Không thấy trang này trong menu</strong> → Chỉ chủ tài khoản vào được.</li><li><strong>Không tìm thấy chỗ nhập sản phẩm</strong> → Sản phẩm nằm ở trang Sản phẩm riêng, không nằm trong hồ sơ.</li><li><strong>AI viết sai giọng so với thương hiệu</strong> → Đổi lại giọng điệu trong phần Nhận diện thương hiệu, rồi tạo lại nội dung.</li></ul><h2>Liên quan</h2><ul><li><a href="/huong-dan/getting-started">Bắt đầu với Founder AI — 4 bước</a></li><li><a href="/huong-dan/mau-tin-nhan">Thư viện nội dung: mẫu tin và biến</a></li><li><a href="/huong-dan/campaign-create">Tạo chiến dịch</a></li></ul>`,
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

# Tìm trang này trên màn hình
Ở **thanh menu bên trái**, bấm vào nhóm **Chiến dịch** cho nó mở ra, rồi chọn mục **Gửi nhanh** — nó nằm đầu tiên trong nhóm.

[ẢNH: menu bên trái đang mở nhóm Chiến dịch, khoanh đỏ mục "Gửi nhanh" ở đầu danh sách]

Trang chia làm ba bước, có thanh đánh số ở đầu trang cho biết bạn đang ở bước nào.

[ẢNH: đầu trang Gửi nhanh, khoanh đỏ thanh 3 bước]

# Ba bước
## Bước 1 — Người nhận
Chọn **kênh gửi** (Email, Zalo hoặc Zalo nhóm), chọn **tài khoản gửi** trong số tài khoản đã nối, rồi nhập danh sách người nhận.

Nhập **mỗi dòng một địa chỉ**, hoặc ngăn cách bằng dấu phẩy. Với Email là địa chỉ email, với Zalo là số điện thoại.

Riêng kênh **Zalo** có thêm ô **Loại người nhận**:

- **Số điện thoại** — dán số như trên. Hệ thống phải tra từng số ra tài khoản Zalo, mà mỗi ngày Zalo chỉ cho tra một lượng nhất định.
- **UID / Bạn bè trong danh bạ** — bấm **Thêm từ danh bạ** để chọn bạn bè của tài khoản Zalo đang gửi, hoặc dán UID Zalo, mỗi dòng một cái. Cách này **không tốn lượt tra số**. UID không có trong danh bạ thì bạn phải tự tích xác nhận trước khi gửi.

Với kênh **Zalo nhóm**, chọn tài khoản Zalo trước, rồi tích các nhóm muốn gửi trong danh sách nhóm của tài khoản đó.

[ẢNH: bước Người nhận, đã chọn kênh Zalo và dán danh sách số điện thoại]

Điền xong, nút sang bước sau ở góc dưới bên phải mới sáng lên.

[ẢNH: góc dưới bên phải, khoanh đỏ nút chuyển sang bước tiếp theo]

## Bước 2 — Nội dung
Chọn một trong hai cách: **Chọn mẫu có sẵn** trong thư viện, hoặc **Soạn nội dung mới** ngay tại đây — không cần tạo mẫu trước.

Chưa có mẫu nào thì vẫn gửi được, cứ chuyển sang **Soạn nội dung mới**.

Lưu ý: mẫu Email và mẫu Zalo tách riêng, chọn kênh nào chỉ thấy mẫu của kênh đó. Nội dung soạn mới chỉ dùng cho lượt gửi này, không tự lưu vào thư viện.

[ẢNH: bước Nội dung, hai lựa chọn "Chọn mẫu có sẵn" và "Soạn nội dung mới" ở đầu, danh sách mẫu Zalo đang hiện bên dưới]

## Bước 3 — Xem lại
Kiểm tra lần cuối rồi bấm **Gửi ngay**.

Ở bước này có **Thời gian hoàn tất ước tính** — đọc kỹ con số đó, giải thích ngay bên dưới.

[ẢNH: bước Xem lại, khoanh đỏ phần Thời gian hoàn tất ước tính và nút "Gửi ngay"]

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
- **Không có mẫu nào để chọn** → Chưa tạo mẫu cho kênh đang chọn (mẫu Email không dùng cho Zalo và ngược lại). Không cần tạo mẫu trước — chuyển sang **Soạn nội dung mới** ở bước 2 để gõ nội dung ngay.
- **Gửi xong báo một phần thất bại** → Bình thường khi danh sách có địa chỉ sai hoặc số chưa dùng Zalo. Phần còn lại vẫn gửi thành công, danh sách lỗi hiện ngay sau khi gửi.
- **Toàn bộ đều thất bại** → Thường do tài khoản gửi mất kết nối. Kiểm tra lại tại trang Quản lý kênh gửi.
- **Gửi Zalo mãi chưa xong** → Xem lại thời gian ước tính ở bước 3, và [Vì sao Zalo gửi chậm hoặc đang dừng](zalo-gui-cham).

# Liên quan
- [Kết nối kênh gửi](channels)
- [Thư viện nội dung: mẫu tin và biến](mau-tin-nhan)
- [Tạo chiến dịch](campaign-create)
- [Vì sao Zalo gửi chậm hoặc đang dừng](zalo-gui-cham)`,
    body_html: `<p>Gửi một lượt tin cho danh sách nhỏ mà không phải dựng chiến dịch. Ba bước, xong trong vài phút.</p><p>Đây cũng là <strong>cách tốt nhất để kiểm tra kênh gửi vừa nối</strong> — gửi thử cho chính mình trước khi chạy chiến dịch thật.</p><h2>Khi nào dùng Gửi nhanh, khi nào dựng chiến dịch</h2><table><thead><tr><th></th><th>Gửi nhanh</th><th>Chiến dịch</th></tr></thead><tbody><tr><td>Danh sách</td><td>Nhỏ, bạn tự dán vào</td><td>Lớn, lấy từ Sheet hoặc landing page</td></tr><tr><td>Số bước gửi</td><td>Một lượt duy nhất</td><td>Nhiều bước, có chờ và rẽ nhánh</td></tr><tr><td>Hẹn giờ</td><td>Không, gửi ngay</td><td>Có, chạy theo lịch hoặc lặp lại</td></tr><tr><td>Dựng mất</td><td>Vài phút</td><td>Lâu hơn</td></tr></tbody></table><p>Cần gửi lặp lại hoặc gửi cho danh sách trong Google Sheet thì dùng <a href="/huong-dan/campaign-create">Tạo chiến dịch</a>.</p><h2>Tìm trang này trên màn hình</h2><p>Ở <strong>thanh menu bên trái</strong>, bấm vào nhóm <strong>Chiến dịch</strong> cho nó mở ra, rồi chọn mục <strong>Gửi nhanh</strong> — nó nằm đầu tiên trong nhóm.</p><p>[ẢNH: menu bên trái đang mở nhóm Chiến dịch, khoanh đỏ mục &quot;Gửi nhanh&quot; ở đầu danh sách]</p><p>Trang chia làm ba bước, có thanh đánh số ở đầu trang cho biết bạn đang ở bước nào.</p><p>[ẢNH: đầu trang Gửi nhanh, khoanh đỏ thanh 3 bước]</p><h2>Ba bước</h2><h3>Bước 1 — Người nhận</h3><p>Chọn <strong>kênh gửi</strong> (Email, Zalo hoặc Zalo nhóm), chọn <strong>tài khoản gửi</strong> trong số tài khoản đã nối, rồi nhập danh sách người nhận.</p><p>Nhập <strong>mỗi dòng một địa chỉ</strong>, hoặc ngăn cách bằng dấu phẩy. Với Email là địa chỉ email, với Zalo là số điện thoại.</p><p>Riêng kênh <strong>Zalo</strong> có thêm ô <strong>Loại người nhận</strong>:</p><ul><li><strong>Số điện thoại</strong> — dán số như trên. Hệ thống phải tra từng số ra tài khoản Zalo, mà mỗi ngày Zalo chỉ cho tra một lượng nhất định.</li><li><strong>UID / Bạn bè trong danh bạ</strong> — bấm <strong>Thêm từ danh bạ</strong> để chọn bạn bè của tài khoản Zalo đang gửi, hoặc dán UID Zalo, mỗi dòng một cái. Cách này <strong>không tốn lượt tra số</strong>. UID không có trong danh bạ thì bạn phải tự tích xác nhận trước khi gửi.</li></ul><p>Với kênh <strong>Zalo nhóm</strong>, chọn tài khoản Zalo trước, rồi tích các nhóm muốn gửi trong danh sách nhóm của tài khoản đó.</p><p>[ẢNH: bước Người nhận, đã chọn kênh Zalo và dán danh sách số điện thoại]</p><p>Điền xong, nút sang bước sau ở góc dưới bên phải mới sáng lên.</p><p>[ẢNH: góc dưới bên phải, khoanh đỏ nút chuyển sang bước tiếp theo]</p><h3>Bước 2 — Nội dung</h3><p>Chọn một trong hai cách: <strong>Chọn mẫu có sẵn</strong> trong thư viện, hoặc <strong>Soạn nội dung mới</strong> ngay tại đây — không cần tạo mẫu trước.</p><p>Chưa có mẫu nào thì vẫn gửi được, cứ chuyển sang <strong>Soạn nội dung mới</strong>.</p><p>Lưu ý: mẫu Email và mẫu Zalo tách riêng, chọn kênh nào chỉ thấy mẫu của kênh đó. Nội dung soạn mới chỉ dùng cho lượt gửi này, không tự lưu vào thư viện.</p><p>[ẢNH: bước Nội dung, hai lựa chọn &quot;Chọn mẫu có sẵn&quot; và &quot;Soạn nội dung mới&quot; ở đầu, danh sách mẫu Zalo đang hiện bên dưới]</p><h3>Bước 3 — Xem lại</h3><p>Kiểm tra lần cuối rồi bấm <strong>Gửi ngay</strong>.</p><p>Ở bước này có <strong>Thời gian hoàn tất ước tính</strong> — đọc kỹ con số đó, giải thích ngay bên dưới.</p><p>[ẢNH: bước Xem lại, khoanh đỏ phần Thời gian hoàn tất ước tính và nút &quot;Gửi ngay&quot;]</p><h2>Thời gian hoàn tất ước tính — đọc trước khi bấm gửi</h2><p>Đây là phần hữu ích nhất của Gửi nhanh, nhưng hay bị bỏ qua.</p><p>Với Email, con số thường là vài giây tới vài phút. Với <strong>Zalo thì có thể là nhiều giờ</strong> — vì mỗi tin cách nhau 80–150 giây để tài khoản không bị khoá.</p><p>Ví dụ gửi Zalo cho 50 người: khoảng 1,5 đến 2 tiếng.</p><p>Thấy con số lớn thì đó là <strong>ước tính đúng</strong>, không phải lỗi. Bấm gửi rồi cứ đóng trang, hệ thống vẫn chạy tiếp ở nền.</p><h2>Giờ yên lặng</h2><p>Nếu bạn gửi Zalo vào lúc gần khuya, hệ thống báo trước rằng nó <strong>tự tạm dừng trong khung 23:00 – 06:00</strong> rồi gửi tiếp vào sáng hôm sau.</p><p>Đây là quy định để bảo vệ tài khoản Zalo của bạn, không tắt được. Cần gửi gấp trong đêm thì dùng Email.</p><h2>Lỗi thường gặp</h2><ul><li><strong>Không chọn được tài khoản gửi</strong> → Chưa nối kênh nào. Xem <a href="/huong-dan/channels">Kết nối kênh gửi</a>.</li><li><strong>Nút sang bước sau bị mờ</strong> → Danh sách người nhận đang trống, hoặc chưa chọn tài khoản gửi.</li><li><strong>Không có mẫu nào để chọn</strong> → Chưa tạo mẫu cho kênh đang chọn (mẫu Email không dùng cho Zalo và ngược lại). Không cần tạo mẫu trước — chuyển sang <strong>Soạn nội dung mới</strong> ở bước 2 để gõ nội dung ngay.</li><li><strong>Gửi xong báo một phần thất bại</strong> → Bình thường khi danh sách có địa chỉ sai hoặc số chưa dùng Zalo. Phần còn lại vẫn gửi thành công, danh sách lỗi hiện ngay sau khi gửi.</li><li><strong>Toàn bộ đều thất bại</strong> → Thường do tài khoản gửi mất kết nối. Kiểm tra lại tại trang Quản lý kênh gửi.</li><li><strong>Gửi Zalo mãi chưa xong</strong> → Xem lại thời gian ước tính ở bước 3, và <a href="/huong-dan/zalo-gui-cham">Vì sao Zalo gửi chậm hoặc đang dừng</a>.</li></ul><h2>Liên quan</h2><ul><li><a href="/huong-dan/channels">Kết nối kênh gửi</a></li><li><a href="/huong-dan/mau-tin-nhan">Thư viện nội dung: mẫu tin và biến</a></li><li><a href="/huong-dan/campaign-create">Tạo chiến dịch</a></li><li><a href="/huong-dan/zalo-gui-cham">Vì sao Zalo gửi chậm hoặc đang dừng</a></li></ul>`,
  },
  {
    slug: 'campaign-create',
    feature_key: 'campaign-create',
    primary_route: '/app/campaigns/new',
    sort_order: 60,
    title: 'Tạo chiến dịch',
    summary: 'Dựng luồng gửi bằng các khối nối với nhau, rồi chạy ngay hoặc lên lịch. Bài này nói rõ thứ tự và chỗ hay tắc.',
    body_md: `Chiến dịch là một **luồng gửi** bạn dựng bằng cách nối các khối lại với nhau. Mỗi khối làm một việc: lấy dữ liệu, chọn tài khoản gửi, gửi tin, chờ, rẽ nhánh.

Cách này linh hoạt hơn Gửi nhanh, nhưng cũng nhiều bước hơn. Chỉ cần gửi một lượt cho danh sách nhỏ thì dùng [Gửi nhanh](quick-send) nhanh hơn.

# Trước khi bắt đầu, cần có sẵn
Thiếu một trong ba thứ này thì sẽ tắc giữa chừng:

1. **Một kênh gửi đã nối** — xem [Kết nối kênh gửi](channels).
2. **Nguồn dữ liệu người nhận** — thường là một Google Sheet đã chia sẻ quyền đọc. Xem [Khách hàng: dữ liệu đến từ đâu](khach-hang).
3. **Nội dung tin nhắn** — nên tạo trước ở [Thư viện nội dung](mau-tin-nhan).

# Mở trình dựng chiến dịch — bốn thao tác
Không có mục menu nào tên "Tạo chiến dịch". Bạn đi qua trang danh sách:

1. Ở **thanh menu bên trái**, mở nhóm **Chiến dịch**, chọn **Quản lý chiến dịch**.

   [ẢNH: menu bên trái đang mở nhóm Chiến dịch, khoanh đỏ mục "Quản lý chiến dịch"]

2. Trong trang, nhìn lên đầu trang và chọn thẻ **Tự tạo**. Nút tạo **chỉ hiện ở thẻ này** — đang đứng ở thẻ khác thì bạn sẽ không thấy nút đâu cả.

   [ẢNH: đầu trang Quản lý chiến dịch, khoanh đỏ thẻ "Tự tạo" đang được chọn]

3. Bấm nút **Tạo** ở góc trên bên phải. Nếu bạn chưa có chiến dịch nào, giữa trang sẽ hiện nút to ghi **Tạo chiến dịch đầu tiên** — bấm cái đó cũng vậy.

   [ẢNH: góc trên bên phải, khoanh đỏ nút "Tạo"]

4. Hộp thoại **Tạo chiến dịch mới** hiện ra. Đặt tên, rồi ở mục **Loại chiến dịch** chọn một trong ba: **Email**, **Zalo cá nhân**, **Zalo nhóm**. Bấm **Tạo và thiết kế** để vào trình dựng.

   [ẢNH: hộp thoại "Tạo chiến dịch mới", khoanh đỏ hàng 3 nút Email / Zalo cá nhân / Zalo nhóm và nút "Tạo và thiết kế"]

Chọn loại ở bước 4 quyết định các khối gửi bạn dùng được sau đó, nên chọn đúng ngay từ đầu.

[ẢNH: trình dựng chiến dịch vừa mở còn trống, bên trái là khu vực kéo thả, bên phải là bảng danh sách khối]

# Bốn nhóm khối bạn sẽ dùng
| Nhóm | Khối tiêu biểu | Việc nó làm |
|---|---|---|
| Bắt đầu | **Khởi chạy** | Điểm bắt đầu của luồng |
| Lấy dữ liệu | **Đọc dữ liệu Sheet**, **Dữ liệu landing page**, **Lấy dữ liệu khách** | Nạp danh sách người nhận |
| Chuẩn bị gửi | **Chọn tài khoản Zalo**, **Lấy danh sách bạn bè Zalo** | Chỉ định gửi bằng tài khoản nào |
| Gửi | **Gửi Email**, **Gửi tin nhắn Zalo cá nhân**, **Gửi tin nhắn nhóm Zalo**, **Gửi lời mời kết bạn Zalo** | Việc gửi thật |

Ngoài ra có các khối phụ trợ: **Chờ**, **Điều kiện** (rẽ nhánh), **Gắn tag**, **Lưu khách hàng**, **Mapping dữ liệu**.

# Dựng luồng trong trình dựng
1. Kéo khối **Khởi chạy** từ bảng bên trái thả vào khu vực trống làm điểm bắt đầu.

   [ẢNH: kéo khối Khởi chạy từ bảng bên trái thả vào khu vực dựng]

2. Thêm khối **lấy dữ liệu**, khai báo nguồn rồi bấm **Kiểm tra kết nối** để nạp danh sách cột.

   [ẢNH: khối lấy dữ liệu đang mở bảng cài đặt, khoanh đỏ nút "Kiểm tra kết nối"]

3. Nếu gửi Zalo, thêm khối **Chọn tài khoản Zalo**.
4. Thêm khối **gửi**, chọn mẫu nội dung.
5. **Nối các khối theo đúng thứ tự** bằng cách kéo từ chấm tròn ở mép khối này sang chấm tròn của khối kia. Đường nối hiện ra là đã nối đúng.

   [ẢNH: hai khối đã được nối, khoanh đỏ đường nối giữa hai chấm tròn]

6. Bấm nút lưu để lưu chiến dịch.

   [ẢNH: thanh công cụ của trình dựng, khoanh đỏ nút lưu]

Bước 2 đừng bỏ qua nút Kiểm tra kết nối. Chưa bấm thì khối gửi ở sau **chưa biết Sheet của bạn có những cột nào**, nên không chèn được tên khách vào nội dung.

# Lưu xong thì chạy được luôn, không cần kích hoạt riêng
Lưu chiến dịch **không tự gửi**. Bạn quay lại **thanh công cụ phía trên** của trình dựng — chỗ vừa bấm nút lưu — rồi chọn một trong hai:

- **Chạy ngay** — gửi luôn một lượt. Chiến dịch còn ở dạng nháp thì hệ thống **tự chuyển sang hoạt động** rồi gửi ngay, không cần bấm thêm bước nào khác.
- **Lên lịch** — hẹn giờ, hoặc đặt chạy lặp lại theo chu kỳ.

[ẢNH: thanh công cụ trình dựng, khoanh đỏ hai nút "Chạy ngay" và "Lên lịch"]

Sơ đồ vừa sửa mà chưa lưu thì hệ thống chặn lại, hỏi lưu trước rồi mới chạy — tránh gửi nhầm bản cũ.

Chiến dịch đang chạy thì **không lên lịch được** — hệ thống báo rõ. Đợi lượt chạy xong hoặc bấm **Dừng lượt chạy** trước.

Muốn tạm ngưng gửi mà không xoá lịch, vào trang **Quản lý chiến dịch** bấm **Tạm dừng** trên dòng chiến dịch đó; bấm **Tiếp tục lịch chạy** để mở lại — thao tác này không gửi tin nào ngay.

# Chạy thử trong builder khác chạy thật
Nút chạy thử ngay trong builder mặc định **chỉ đọc 100 dòng đầu** của Sheet, để xem trước cho nhanh.

Chạy thật bằng **Chạy ngay** hoặc **Lên lịch** thì đọc **đủ toàn bộ dòng**. Thấy chạy thử ra ít người thì đừng lo.

# Lỗi thường gặp
- **Không có người nhận nào** → Khối lấy dữ liệu sai cấu hình. Kiểm tra lại dòng tiêu đề, dòng bắt đầu dữ liệu, và quyền chia sẻ của file Sheet.
- **Nội dung gửi đi bị trống chỗ tên khách** → Chưa bấm Kiểm tra kết nối nên khối gửi không thấy cột, hoặc tên biến trong mẫu không khớp tên cột trong Sheet.
- **Đã lưu mà không thấy chạy** → Bấm **Chạy ngay** hoặc **Lên lịch** trên thanh công cụ trình dựng. Chiến dịch nháp sẽ tự chuyển sang hoạt động khi bấm Chạy ngay.
- **Chiến dịch dừng và báo hết lượt gửi** → Đã dùng hết hạn mức kỳ này. Hệ thống hiện rõ thời điểm tự chạy lại, hoặc bạn bấm **Mua thêm** để chạy tiếp ngay.
- **Chiến dịch Zalo chạy rất chậm hoặc đứng im ban đêm** → Bình thường. Xem [Vì sao Zalo gửi chậm hoặc đang dừng](zalo-gui-cham).
- **Không sửa được mẫu nội dung đang dùng** → Mẫu bị khoá vì chiến dịch đang kích hoạt. Xem [Thư viện nội dung](mau-tin-nhan).

# Nhân bản, chia sẻ và sao chép bước
- **Nhân bản** — tạo một bản sao của cả chiến dịch để sửa lại cho đợt sau, khỏi dựng từ đầu. Nút có trên thanh công cụ của sơ đồ và trên từng dòng ở trang **Quản lý chiến dịch**.
- **Chia sẻ** — nhập email của một tài khoản khác trong hệ thống và chọn quyền: **Chỉ xem**, **Xem và chỉnh sửa**, và có **Cho phép chạy chiến dịch** hay không.
- **Sao chép một bước trong sơ đồ** — bấm chọn bước đó, nhấn Ctrl + C rồi Ctrl + V (máy Mac dùng phím Cmd).

# Liên quan
- [Thư viện nội dung: mẫu tin và biến](mau-tin-nhan)
- [Theo dõi chiến dịch đang chạy](campaign-theo-doi)
- [Khách hàng: dữ liệu đến từ đâu](khach-hang)
- [Gửi nhanh](quick-send)`,
    body_html: `<p>Chiến dịch là một <strong>luồng gửi</strong> bạn dựng bằng cách nối các khối lại với nhau. Mỗi khối làm một việc: lấy dữ liệu, chọn tài khoản gửi, gửi tin, chờ, rẽ nhánh.</p><p>Cách này linh hoạt hơn Gửi nhanh, nhưng cũng nhiều bước hơn. Chỉ cần gửi một lượt cho danh sách nhỏ thì dùng <a href="/huong-dan/quick-send">Gửi nhanh</a> nhanh hơn.</p><h2>Trước khi bắt đầu, cần có sẵn</h2><p>Thiếu một trong ba thứ này thì sẽ tắc giữa chừng:</p><ol><li><strong>Một kênh gửi đã nối</strong> — xem <a href="/huong-dan/channels">Kết nối kênh gửi</a>.</li><li><strong>Nguồn dữ liệu người nhận</strong> — thường là một Google Sheet đã chia sẻ quyền đọc. Xem <a href="/huong-dan/khach-hang">Khách hàng: dữ liệu đến từ đâu</a>.</li><li><strong>Nội dung tin nhắn</strong> — nên tạo trước ở <a href="/huong-dan/mau-tin-nhan">Thư viện nội dung</a>.</li></ol><h2>Mở trình dựng chiến dịch — bốn thao tác</h2><p>Không có mục menu nào tên &quot;Tạo chiến dịch&quot;. Bạn đi qua trang danh sách:</p><ol><li>Ở <strong>thanh menu bên trái</strong>, mở nhóm <strong>Chiến dịch</strong>, chọn <strong>Quản lý chiến dịch</strong>.<p>[ẢNH: menu bên trái đang mở nhóm Chiến dịch, khoanh đỏ mục &quot;Quản lý chiến dịch&quot;]</p></li><li>Trong trang, nhìn lên đầu trang và chọn thẻ <strong>Tự tạo</strong>. Nút tạo <strong>chỉ hiện ở thẻ này</strong> — đang đứng ở thẻ khác thì bạn sẽ không thấy nút đâu cả.<p>[ẢNH: đầu trang Quản lý chiến dịch, khoanh đỏ thẻ &quot;Tự tạo&quot; đang được chọn]</p></li><li>Bấm nút <strong>Tạo</strong> ở góc trên bên phải. Nếu bạn chưa có chiến dịch nào, giữa trang sẽ hiện nút to ghi <strong>Tạo chiến dịch đầu tiên</strong> — bấm cái đó cũng vậy.<p>[ẢNH: góc trên bên phải, khoanh đỏ nút &quot;Tạo&quot;]</p></li><li>Hộp thoại <strong>Tạo chiến dịch mới</strong> hiện ra. Đặt tên, rồi ở mục <strong>Loại chiến dịch</strong> chọn một trong ba: <strong>Email</strong>, <strong>Zalo cá nhân</strong>, <strong>Zalo nhóm</strong>. Bấm <strong>Tạo và thiết kế</strong> để vào trình dựng.<p>[ẢNH: hộp thoại &quot;Tạo chiến dịch mới&quot;, khoanh đỏ hàng 3 nút Email / Zalo cá nhân / Zalo nhóm và nút &quot;Tạo và thiết kế&quot;]</p></li></ol><p>Chọn loại ở bước 4 quyết định các khối gửi bạn dùng được sau đó, nên chọn đúng ngay từ đầu.</p><p>[ẢNH: trình dựng chiến dịch vừa mở còn trống, bên trái là khu vực kéo thả, bên phải là bảng danh sách khối]</p><h2>Bốn nhóm khối bạn sẽ dùng</h2><table><thead><tr><th>Nhóm</th><th>Khối tiêu biểu</th><th>Việc nó làm</th></tr></thead><tbody><tr><td>Bắt đầu</td><td><strong>Khởi chạy</strong></td><td>Điểm bắt đầu của luồng</td></tr><tr><td>Lấy dữ liệu</td><td><strong>Đọc dữ liệu Sheet</strong>, <strong>Dữ liệu landing page</strong>, <strong>Lấy dữ liệu khách</strong></td><td>Nạp danh sách người nhận</td></tr><tr><td>Chuẩn bị gửi</td><td><strong>Chọn tài khoản Zalo</strong>, <strong>Lấy danh sách bạn bè Zalo</strong></td><td>Chỉ định gửi bằng tài khoản nào</td></tr><tr><td>Gửi</td><td><strong>Gửi Email</strong>, <strong>Gửi tin nhắn Zalo cá nhân</strong>, <strong>Gửi tin nhắn nhóm Zalo</strong>, <strong>Gửi lời mời kết bạn Zalo</strong></td><td>Việc gửi thật</td></tr></tbody></table><p>Ngoài ra có các khối phụ trợ: <strong>Chờ</strong>, <strong>Điều kiện</strong> (rẽ nhánh), <strong>Gắn tag</strong>, <strong>Lưu khách hàng</strong>, <strong>Mapping dữ liệu</strong>.</p><h2>Dựng luồng trong trình dựng</h2><ol><li>Kéo khối <strong>Khởi chạy</strong> từ bảng bên trái thả vào khu vực trống làm điểm bắt đầu.<p>[ẢNH: kéo khối Khởi chạy từ bảng bên trái thả vào khu vực dựng]</p></li><li>Thêm khối <strong>lấy dữ liệu</strong>, khai báo nguồn rồi bấm <strong>Kiểm tra kết nối</strong> để nạp danh sách cột.<p>[ẢNH: khối lấy dữ liệu đang mở bảng cài đặt, khoanh đỏ nút &quot;Kiểm tra kết nối&quot;]</p></li><li>Nếu gửi Zalo, thêm khối <strong>Chọn tài khoản Zalo</strong>.</li><li>Thêm khối <strong>gửi</strong>, chọn mẫu nội dung.</li><li><strong>Nối các khối theo đúng thứ tự</strong> bằng cách kéo từ chấm tròn ở mép khối này sang chấm tròn của khối kia. Đường nối hiện ra là đã nối đúng.<p>[ẢNH: hai khối đã được nối, khoanh đỏ đường nối giữa hai chấm tròn]</p></li><li>Bấm nút lưu để lưu chiến dịch.<p>[ẢNH: thanh công cụ của trình dựng, khoanh đỏ nút lưu]</p></li></ol><p>Bước 2 đừng bỏ qua nút Kiểm tra kết nối. Chưa bấm thì khối gửi ở sau <strong>chưa biết Sheet của bạn có những cột nào</strong>, nên không chèn được tên khách vào nội dung.</p><h2>Lưu xong thì chạy được luôn, không cần kích hoạt riêng</h2><p>Lưu chiến dịch <strong>không tự gửi</strong>. Bạn quay lại <strong>thanh công cụ phía trên</strong> của trình dựng — chỗ vừa bấm nút lưu — rồi chọn một trong hai:</p><ul><li><strong>Chạy ngay</strong> — gửi luôn một lượt. Chiến dịch còn ở dạng nháp thì hệ thống <strong>tự chuyển sang hoạt động</strong> rồi gửi ngay, không cần bấm thêm bước nào khác.</li><li><strong>Lên lịch</strong> — hẹn giờ, hoặc đặt chạy lặp lại theo chu kỳ.</li></ul><p>[ẢNH: thanh công cụ trình dựng, khoanh đỏ hai nút &quot;Chạy ngay&quot; và &quot;Lên lịch&quot;]</p><p>Sơ đồ vừa sửa mà chưa lưu thì hệ thống chặn lại, hỏi lưu trước rồi mới chạy — tránh gửi nhầm bản cũ.</p><p>Chiến dịch đang chạy thì <strong>không lên lịch được</strong> — hệ thống báo rõ. Đợi lượt chạy xong hoặc bấm <strong>Dừng lượt chạy</strong> trước.</p><p>Muốn tạm ngưng gửi mà không xoá lịch, vào trang <strong>Quản lý chiến dịch</strong> bấm <strong>Tạm dừng</strong> trên dòng chiến dịch đó; bấm <strong>Tiếp tục lịch chạy</strong> để mở lại — thao tác này không gửi tin nào ngay.</p><h2>Chạy thử trong builder khác chạy thật</h2><p>Nút chạy thử ngay trong builder mặc định <strong>chỉ đọc 100 dòng đầu</strong> của Sheet, để xem trước cho nhanh.</p><p>Chạy thật bằng <strong>Chạy ngay</strong> hoặc <strong>Lên lịch</strong> thì đọc <strong>đủ toàn bộ dòng</strong>. Thấy chạy thử ra ít người thì đừng lo.</p><h2>Lỗi thường gặp</h2><ul><li><strong>Không có người nhận nào</strong> → Khối lấy dữ liệu sai cấu hình. Kiểm tra lại dòng tiêu đề, dòng bắt đầu dữ liệu, và quyền chia sẻ của file Sheet.</li><li><strong>Nội dung gửi đi bị trống chỗ tên khách</strong> → Chưa bấm Kiểm tra kết nối nên khối gửi không thấy cột, hoặc tên biến trong mẫu không khớp tên cột trong Sheet.</li><li><strong>Đã lưu mà không thấy chạy</strong> → Bấm <strong>Chạy ngay</strong> hoặc <strong>Lên lịch</strong> trên thanh công cụ trình dựng. Chiến dịch nháp sẽ tự chuyển sang hoạt động khi bấm Chạy ngay.</li><li><strong>Chiến dịch dừng và báo hết lượt gửi</strong> → Đã dùng hết hạn mức kỳ này. Hệ thống hiện rõ thời điểm tự chạy lại, hoặc bạn bấm <strong>Mua thêm</strong> để chạy tiếp ngay.</li><li><strong>Chiến dịch Zalo chạy rất chậm hoặc đứng im ban đêm</strong> → Bình thường. Xem <a href="/huong-dan/zalo-gui-cham">Vì sao Zalo gửi chậm hoặc đang dừng</a>.</li><li><strong>Không sửa được mẫu nội dung đang dùng</strong> → Mẫu bị khoá vì chiến dịch đang kích hoạt. Xem <a href="/huong-dan/mau-tin-nhan">Thư viện nội dung</a>.</li></ul><h2>Nhân bản, chia sẻ và sao chép bước</h2><ul><li><strong>Nhân bản</strong> — tạo một bản sao của cả chiến dịch để sửa lại cho đợt sau, khỏi dựng từ đầu. Nút có trên thanh công cụ của sơ đồ và trên từng dòng ở trang <strong>Quản lý chiến dịch</strong>.</li><li><strong>Chia sẻ</strong> — nhập email của một tài khoản khác trong hệ thống và chọn quyền: <strong>Chỉ xem</strong>, <strong>Xem và chỉnh sửa</strong>, và có <strong>Cho phép chạy chiến dịch</strong> hay không.</li><li><strong>Sao chép một bước trong sơ đồ</strong> — bấm chọn bước đó, nhấn Ctrl + C rồi Ctrl + V (máy Mac dùng phím Cmd).</li></ul><h2>Liên quan</h2><ul><li><a href="/huong-dan/mau-tin-nhan">Thư viện nội dung: mẫu tin và biến</a></li><li><a href="/huong-dan/campaign-theo-doi">Theo dõi chiến dịch đang chạy</a></li><li><a href="/huong-dan/khach-hang">Khách hàng: dữ liệu đến từ đâu</a></li><li><a href="/huong-dan/quick-send">Gửi nhanh</a></li></ul>`,
  },
  {
    slug: 'mau-tin-nhan',
    feature_key: 'campaign-create',
    primary_route: '/app/settings/templates',
    sort_order: 63,
    title: 'Thư viện nội dung: mẫu tin và biến',
    summary: 'Soạn sẵn mẫu email và Zalo, dùng biến để cá nhân hoá, và hiểu vì sao mẫu bị khoá khi chiến dịch đang chạy.',
    body_md: `Thay vì gõ lại nội dung mỗi lần, bạn soạn sẵn **mẫu** rồi gắn vào chiến dịch. Mẫu dùng lại được nhiều lần và sửa một chỗ áp dụng cho mọi nơi đang dùng.

# Tìm trang này trên màn hình
Ở **thanh menu bên trái**, mở nhóm **Chiến dịch**, rồi chọn mục **Thư viện nội dung**.

[ẢNH: menu bên trái đang mở nhóm Chiến dịch, khoanh đỏ mục "Thư viện nội dung"]

Trang chia 2 thẻ ở đầu trang: **Email** và **Zalo**. Hai loại mẫu tách riêng vì email có tiêu đề và định dạng phong phú, còn Zalo là tin nhắn văn bản ngắn.

[ẢNH: đầu trang Thư viện nội dung, khoanh đỏ 2 thẻ Email / Zalo]

Bấm nút thêm mẫu để mở trình soạn thảo.

[ẢNH: khoanh đỏ nút thêm mẫu mới trên trang Thư viện nội dung]

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

[ẢNH: danh sách mẫu đã gắn nhãn, khoanh đỏ hàng nhãn lọc và ô tìm kiếm ở đầu trang]

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
    body_html: `<p>Thay vì gõ lại nội dung mỗi lần, bạn soạn sẵn <strong>mẫu</strong> rồi gắn vào chiến dịch. Mẫu dùng lại được nhiều lần và sửa một chỗ áp dụng cho mọi nơi đang dùng.</p><h2>Tìm trang này trên màn hình</h2><p>Ở <strong>thanh menu bên trái</strong>, mở nhóm <strong>Chiến dịch</strong>, rồi chọn mục <strong>Thư viện nội dung</strong>.</p><p>[ẢNH: menu bên trái đang mở nhóm Chiến dịch, khoanh đỏ mục &quot;Thư viện nội dung&quot;]</p><p>Trang chia 2 thẻ ở đầu trang: <strong>Email</strong> và <strong>Zalo</strong>. Hai loại mẫu tách riêng vì email có tiêu đề và định dạng phong phú, còn Zalo là tin nhắn văn bản ngắn.</p><p>[ẢNH: đầu trang Thư viện nội dung, khoanh đỏ 2 thẻ Email / Zalo]</p><p>Bấm nút thêm mẫu để mở trình soạn thảo.</p><p>[ẢNH: khoanh đỏ nút thêm mẫu mới trên trang Thư viện nội dung]</p><h2>Biến — cách gọi đúng tên từng khách</h2><p>Biến là chỗ trống trong mẫu, khi gửi sẽ được thay bằng dữ liệu thật của từng người. Viết theo dạng hai ngoặc nhọn:</p><pre><code>Chào {{ten_khach}}, cảm ơn bạn đã quan tâm sản phẩm.</code></pre><p>Khi gửi, mỗi người nhận được tin có tên riêng của họ thay vì lời chào chung chung.</p><p><strong>Tên biến phải khớp tên cột trong nguồn dữ liệu.</strong> Nếu Sheet của bạn có cột tên là <code>Họ tên</code> thì biến phải trỏ đúng cột đó — không tự đoán được. Đây là lý do phải bấm <strong>Kiểm tra kết nối</strong> ở khối lấy dữ liệu trước: nó nạp danh sách cột về để bạn chọn cho khớp.</p><p>Trình soạn thảo có sẵn danh sách biến gợi ý, bấm để chèn thẳng vào chỗ con trỏ đang đứng.</p><p>[ẢNH: trình soạn mẫu, đang mở danh sách biến gợi ý]</p><h2>Phân loại mẫu bằng nhãn</h2><p>Bạn tự tạo nhãn để nhóm mẫu theo cách của mình — ví dụ &quot;Khuyến mãi&quot;, &quot;Chăm sóc sau bán&quot;, &quot;Nhắc lịch&quot;. Nhãn là của riêng tài khoản bạn, không dùng chung với người khác.</p><p>Khi thư viện nhiều mẫu, nhãn cộng với ô tìm kiếm giúp tìm nhanh hơn nhiều so với cuộn tay.</p><p>[ẢNH: danh sách mẫu đã gắn nhãn, khoanh đỏ hàng nhãn lọc và ô tìm kiếm ở đầu trang]</p><h2>Mẫu bị khoá khi chiến dịch đang chạy</h2><p>Đây là hành vi hay gây bất ngờ nhất, nên nói kỹ.</p><p>Nếu một mẫu <strong>đang được dùng bởi chiến dịch đã kích hoạt</strong>, hệ thống <strong>khoá không cho sửa trực tiếp</strong>. Bạn sẽ thấy thông báo kèm danh sách chiến dịch đang dùng mẫu đó.</p><p>Lý do: sửa nội dung giữa chừng làm những người nhận sau đó đọc được thứ khác hẳn những người nhận trước — cùng một chiến dịch mà hai nội dung, rất khó giải thích với khách.</p><p>Cách xử lý: bấm <strong>Tạo bản sao để chỉnh sửa</strong>. Bạn được một mẫu mới giống hệt, sửa thoải mái, rồi gắn bản sao đó vào chiến dịch lần sau.</p><p>Muốn sửa thẳng mẫu gốc thì phải dừng hoặc gỡ kích hoạt chiến dịch đang dùng nó trước.</p><p>[ẢNH: thông báo mẫu bị khoá, thấy nút &quot;Tạo bản sao để chỉnh sửa&quot;]</p><h2>Nhờ trợ lý AI viết mẫu</h2><p>Bạn có thể nhờ trợ lý AI soạn nội dung rồi đưa thẳng vào thư viện. Nội dung AI viết bám theo <strong>Hồ sơ doanh nghiệp</strong> của bạn, nên hồ sơ càng đầy đủ thì bản nháp càng sát, đỡ phải sửa.</p><p>Xem <a href="/huong-dan/ai-profile">Hồ sơ doanh nghiệp</a>.</p><h2>Lỗi thường gặp</h2><ul><li><strong>Gửi đi mà chỗ tên khách bị trống</strong> → Tên biến không khớp tên cột trong nguồn dữ liệu. Mở lại khối lấy dữ liệu, bấm Kiểm tra kết nối, xem đúng tên cột rồi sửa lại mẫu.</li><li><strong>Bấm sửa mà không sửa được</strong> → Mẫu đang bị khoá do chiến dịch chạy. Tạo bản sao.</li><li><strong>Xoá mẫu không được</strong> → Cùng lý do trên, mẫu đang được chiến dịch sử dụng.</li><li><strong>Thêm biến báo đã tồn tại</strong> → Biến đó đã có trong danh sách của mẫu rồi, dùng luôn cái đang có.</li><li><strong>Mẫu Zalo dài quá bị cắt</strong> → Zalo giới hạn độ dài tin nhắn. Tin ngắn cũng ít bị đánh dấu spam hơn.</li></ul><h2>Liên quan</h2><ul><li><a href="/huong-dan/campaign-create">Tạo chiến dịch</a></li><li><a href="/huong-dan/ai-profile">Hồ sơ doanh nghiệp</a></li><li><a href="/huong-dan/khach-hang">Khách hàng: dữ liệu đến từ đâu</a></li></ul>`,
  },
  {
    slug: 'campaign-theo-doi',
    feature_key: 'campaign-create',
    primary_route: '/app/delivery-monitor',
    sort_order: 66,
    title: 'Theo dõi chiến dịch đang chạy',
    summary: 'Xem chiến dịch gửi tới đâu, tốc độ bao nhiêu, lỗi ở đâu — và cách đọc đúng các con số.',
    body_md: `Sau khi bấm chạy, đây là chỗ xem mọi thứ có đang diễn ra đúng không.

# Tìm trang này trên màn hình
Ở **thanh menu bên trái**, mở nhóm **Chiến dịch**, rồi chọn mục **Hiệu quả chiến dịch**.

[ẢNH: menu bên trái đang mở nhóm Chiến dịch, khoanh đỏ mục "Hiệu quả chiến dịch"]

Lưu ý nhỏ kẻo tưởng vào nhầm: mục trong menu tên *Hiệu quả chiến dịch* nhưng tiêu đề in ở đầu trang lại ghi *Giám sát gửi tin*. Cùng một trang.

Trang tự làm mới sau mỗi 15 giây nếu bạn bật tuỳ chọn đó, nên có thể mở và để đấy theo dõi.

[ẢNH: đầu trang, khoanh đỏ công tắc tự làm mới và ô chọn khoảng thời gian]

[ẢNH: hàng ô số liệu ở đầu trang Giám sát gửi tin]

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

[ẢNH: mục Chiến dịch gần đây, một dòng chiến dịch Zalo đang chạy, khoanh đỏ cột Trạng thái và cột Tốc độ]

# Hiệu quả theo kênh và tốc độ theo giờ
Kéo tiếp xuống dưới sẽ thấy mục **Hiệu quả theo kênh** — tách riêng Email và Zalo, kèm số gửi thành công, số lỗi và số click của từng kênh. Đây là chỗ so sánh xem kênh nào đang hiệu quả hơn với khách của bạn.

[ẢNH: mục Hiệu quả theo kênh, hai cột Email và Zalo đặt cạnh nhau]

Ngay dưới đó là biểu đồ **Tốc độ gửi theo giờ**, cho thấy nhịp gửi. Với Zalo, bạn sẽ thấy rõ khoảng trống từ 23:00 đến 06:00 — đó là giờ nghỉ theo thiết kế, không phải sự cố.

[ẢNH: biểu đồ Tốc độ gửi theo giờ, khoanh đỏ khoảng trống từ 23:00 đến 06:00]

# Tình trạng tài khoản và cảnh báo
Kéo xuống nữa tới mục **Tình trạng tài khoản & hàng đợi** — chỗ cảnh báo khi có dấu hiệu bất thường.

Cảnh báo đáng chú ý nhất: **Zalo không xác nhận phát tin**. Nghĩa là hệ thống gửi đi nhưng Zalo không báo lại là đã phát — thường liên quan tới giới hạn hoặc cơ chế chống spam của Zalo.

Gặp cảnh báo này thì nên giãn nhịp gửi và kiểm tra lại tài khoản Zalo, đừng cố đẩy nhanh — nguy cơ bị khoá tài khoản là thật.

[ẢNH: mục Tình trạng tài khoản & hàng đợi đang hiện cảnh báo "Zalo không xác nhận phát tin"]

# Lỗi gần đây
Ở cuối trang là mục **Lỗi gần đây**, liệt kê các tin thất bại kèm nguyên nhân. Đây là chỗ đầu tiên nên xem khi thấy tỷ lệ lỗi cao.

[ẢNH: mục Lỗi gần đây, vài dòng lỗi kèm cột nguyên nhân]

Vài nguyên nhân hay gặp và cách hiểu:

- **Lỗi xác thực email** → Sai thông tin SMTP. Xem [Thêm tài khoản Email](email-account).
- **Địa chỉ email không tồn tại** → Hệ thống ghi nhận và không gửi lại địa chỉ đó nữa.
- **Tài khoản Zalo mất kết nối** → Quét lại QR. Xem [Thêm tài khoản Zalo](zalo-account).
- **Số điện thoại chưa dùng Zalo** → Không gửi được cho người đó, phần còn lại vẫn chạy bình thường.

# Xem ai bị lỗi và vì sao
Trong bảng **Tất cả chiến dịch đã chạy**, dòng nào có tin lỗi đều có nút **Xem chi tiết lỗi**. Bấm vào, một bảng mở ra ngay dưới dòng đó với bốn cột: **Người nhận**, **Lý do**, **Số lần** và **Lần cuối**.

| Lý do | Nghĩa là |
|---|---|
| Chặn tin người lạ | Người nhận tắt nhận tin từ người lạ trên Zalo |
| Người nhận chặn tài khoản | Họ đã chặn tài khoản Zalo đang gửi |
| Không tìm thấy tài khoản | Số đó chưa dùng Zalo |
| Giới hạn tần suất | Zalo đang hạn chế tài khoản gửi, hệ thống tự thử lại sau |
| Thư bị trả lại | Địa chỉ email không nhận được thư |
| Vi phạm chính sách | Nội dung bị nền tảng từ chối |
| Sai định dạng, Tham số không hợp lệ, Lỗi không xác định | Lỗi kỹ thuật. Lặp lại nhiều thì chụp màn hình gửi hỗ trợ |

[ẢNH: một dòng chiến dịch đã bấm "Xem chi tiết lỗi", thấy bảng Người nhận / Lý do / Số lần / Lần cuối]

Phía trên bảng có một dòng tóm tắt, kiểu *120 hàng nguồn → 110 có số → 95 lượt gửi*, kèm lý do các dòng bị bỏ qua: không có số, đã gửi ở lượt trước, chưa tới ngày, đã hoàn thành. Dòng này trả lời câu hỏi "danh sách 120 người sao chỉ gửi 95".

# Lỗi thường gặp
- **Trang trống, báo chưa có dữ liệu** → Chọn khoảng thời gian rộng hơn, hoặc bạn chưa chạy chiến dịch nào trong khoảng đó.
- **Số Tiếp cận thấp hơn Tin đã gửi** → Bình thường, vì một người có thể nhận nhiều tin trong cùng chiến dịch.
- **Tỷ lệ lỗi cao đột ngột** → Xem ngay mục Lỗi gần đây. Thường là kênh gửi mất kết nối chứ không phải danh sách sai.
- **Chiến dịch hiện đang chạy mà tốc độ bằng 0** → Đang trong giờ nghỉ của Zalo, hoặc đang chờ tới lượt gửi tiếp theo.

# Liên quan
- [Vì sao Zalo gửi chậm hoặc đang dừng](zalo-gui-cham)
- [Tạo chiến dịch](campaign-create)
- [Kết nối kênh gửi](channels)`,
    body_html: `<p>Sau khi bấm chạy, đây là chỗ xem mọi thứ có đang diễn ra đúng không.</p><h2>Tìm trang này trên màn hình</h2><p>Ở <strong>thanh menu bên trái</strong>, mở nhóm <strong>Chiến dịch</strong>, rồi chọn mục <strong>Hiệu quả chiến dịch</strong>.</p><p>[ẢNH: menu bên trái đang mở nhóm Chiến dịch, khoanh đỏ mục &quot;Hiệu quả chiến dịch&quot;]</p><p>Lưu ý nhỏ kẻo tưởng vào nhầm: mục trong menu tên <em>Hiệu quả chiến dịch</em> nhưng tiêu đề in ở đầu trang lại ghi <em>Giám sát gửi tin</em>. Cùng một trang.</p><p>Trang tự làm mới sau mỗi 15 giây nếu bạn bật tuỳ chọn đó, nên có thể mở và để đấy theo dõi.</p><p>[ẢNH: đầu trang, khoanh đỏ công tắc tự làm mới và ô chọn khoảng thời gian]</p><p>[ẢNH: hàng ô số liệu ở đầu trang Giám sát gửi tin]</p><h2>Bốn con số ở đầu trang</h2><table><thead><tr><th>Số</th><th>Nghĩa là</th></tr></thead><tbody><tr><td><strong>Tin đã gửi</strong></td><td>Số tin hệ thống đã gửi đi thành công</td></tr><tr><td><strong>Tin lỗi</strong></td><td>Số tin thất bại, kèm lý do bên dưới</td></tr><tr><td><strong>Lượt nhấp liên kết</strong></td><td>Số lần người nhận bấm vào link trong tin</td></tr><tr><td><strong>Chiến dịch đang chạy</strong></td><td>Số lượt chạy còn hoạt động lúc này</td></tr></tbody></table><p>Bên dưới còn hai chỉ số dễ nhầm nhau:</p><ul><li><strong>Tiếp cận</strong> — bao nhiêu <strong>người</strong> đã nhận được, trên tổng số người trong danh sách.</li><li><strong>Tỷ lệ thành công trên lượt thử</strong> — bao nhiêu <strong>lượt gửi</strong> thành công trên tổng số lần hệ thống thử gửi.</li></ul><p>Hai số này khác nhau vì một người có thể được thử gửi nhiều lần. Muốn biết <em>&quot;đã tới tay bao nhiêu khách&quot;</em> thì đọc <strong>Tiếp cận</strong>.</p><h2>Xem từng chiến dịch</h2><p>Mục <strong>Chiến dịch gần đây</strong> liệt kê các lượt chạy trong khoảng thời gian bạn chọn, mới nhất trước. Mỗi dòng có:</p><ul><li><strong>Trạng thái</strong> — đang chạy, hoàn thành, hay lỗi</li><li><strong>Thành công / tổng</strong> — tiến độ</li><li><strong>Tốc độ</strong> — số tin mỗi giờ</li><li><strong>Tỷ lệ lỗi</strong></li><li><strong>Thời lượng</strong> — đã chạy bao lâu</li></ul><p>Với chiến dịch Zalo, <strong>tốc độ khoảng 30 tin mỗi giờ là bình thường</strong>, không phải chậm bất thường. Xem <a href="/huong-dan/zalo-gui-cham">Vì sao Zalo gửi chậm hoặc đang dừng</a>.</p><p>[ẢNH: mục Chiến dịch gần đây, một dòng chiến dịch Zalo đang chạy, khoanh đỏ cột Trạng thái và cột Tốc độ]</p><h2>Hiệu quả theo kênh và tốc độ theo giờ</h2><p>Kéo tiếp xuống dưới sẽ thấy mục <strong>Hiệu quả theo kênh</strong> — tách riêng Email và Zalo, kèm số gửi thành công, số lỗi và số click của từng kênh. Đây là chỗ so sánh xem kênh nào đang hiệu quả hơn với khách của bạn.</p><p>[ẢNH: mục Hiệu quả theo kênh, hai cột Email và Zalo đặt cạnh nhau]</p><p>Ngay dưới đó là biểu đồ <strong>Tốc độ gửi theo giờ</strong>, cho thấy nhịp gửi. Với Zalo, bạn sẽ thấy rõ khoảng trống từ 23:00 đến 06:00 — đó là giờ nghỉ theo thiết kế, không phải sự cố.</p><p>[ẢNH: biểu đồ Tốc độ gửi theo giờ, khoanh đỏ khoảng trống từ 23:00 đến 06:00]</p><h2>Tình trạng tài khoản và cảnh báo</h2><p>Kéo xuống nữa tới mục <strong>Tình trạng tài khoản &amp; hàng đợi</strong> — chỗ cảnh báo khi có dấu hiệu bất thường.</p><p>Cảnh báo đáng chú ý nhất: <strong>Zalo không xác nhận phát tin</strong>. Nghĩa là hệ thống gửi đi nhưng Zalo không báo lại là đã phát — thường liên quan tới giới hạn hoặc cơ chế chống spam của Zalo.</p><p>Gặp cảnh báo này thì nên giãn nhịp gửi và kiểm tra lại tài khoản Zalo, đừng cố đẩy nhanh — nguy cơ bị khoá tài khoản là thật.</p><p>[ẢNH: mục Tình trạng tài khoản &amp; hàng đợi đang hiện cảnh báo &quot;Zalo không xác nhận phát tin&quot;]</p><h2>Lỗi gần đây</h2><p>Ở cuối trang là mục <strong>Lỗi gần đây</strong>, liệt kê các tin thất bại kèm nguyên nhân. Đây là chỗ đầu tiên nên xem khi thấy tỷ lệ lỗi cao.</p><p>[ẢNH: mục Lỗi gần đây, vài dòng lỗi kèm cột nguyên nhân]</p><p>Vài nguyên nhân hay gặp và cách hiểu:</p><ul><li><strong>Lỗi xác thực email</strong> → Sai thông tin SMTP. Xem <a href="/huong-dan/email-account">Thêm tài khoản Email</a>.</li><li><strong>Địa chỉ email không tồn tại</strong> → Hệ thống ghi nhận và không gửi lại địa chỉ đó nữa.</li><li><strong>Tài khoản Zalo mất kết nối</strong> → Quét lại QR. Xem <a href="/huong-dan/zalo-account">Thêm tài khoản Zalo</a>.</li><li><strong>Số điện thoại chưa dùng Zalo</strong> → Không gửi được cho người đó, phần còn lại vẫn chạy bình thường.</li></ul><h2>Xem ai bị lỗi và vì sao</h2><p>Trong bảng <strong>Tất cả chiến dịch đã chạy</strong>, dòng nào có tin lỗi đều có nút <strong>Xem chi tiết lỗi</strong>. Bấm vào, một bảng mở ra ngay dưới dòng đó với bốn cột: <strong>Người nhận</strong>, <strong>Lý do</strong>, <strong>Số lần</strong> và <strong>Lần cuối</strong>.</p><table><thead><tr><th>Lý do</th><th>Nghĩa là</th></tr></thead><tbody><tr><td>Chặn tin người lạ</td><td>Người nhận tắt nhận tin từ người lạ trên Zalo</td></tr><tr><td>Người nhận chặn tài khoản</td><td>Họ đã chặn tài khoản Zalo đang gửi</td></tr><tr><td>Không tìm thấy tài khoản</td><td>Số đó chưa dùng Zalo</td></tr><tr><td>Giới hạn tần suất</td><td>Zalo đang hạn chế tài khoản gửi, hệ thống tự thử lại sau</td></tr><tr><td>Thư bị trả lại</td><td>Địa chỉ email không nhận được thư</td></tr><tr><td>Vi phạm chính sách</td><td>Nội dung bị nền tảng từ chối</td></tr><tr><td>Sai định dạng, Tham số không hợp lệ, Lỗi không xác định</td><td>Lỗi kỹ thuật. Lặp lại nhiều thì chụp màn hình gửi hỗ trợ</td></tr></tbody></table><p>[ẢNH: một dòng chiến dịch đã bấm &quot;Xem chi tiết lỗi&quot;, thấy bảng Người nhận / Lý do / Số lần / Lần cuối]</p><p>Phía trên bảng có một dòng tóm tắt, kiểu <em>120 hàng nguồn → 110 có số → 95 lượt gửi</em>, kèm lý do các dòng bị bỏ qua: không có số, đã gửi ở lượt trước, chưa tới ngày, đã hoàn thành. Dòng này trả lời câu hỏi &quot;danh sách 120 người sao chỉ gửi 95&quot;.</p><h2>Lỗi thường gặp</h2><ul><li><strong>Trang trống, báo chưa có dữ liệu</strong> → Chọn khoảng thời gian rộng hơn, hoặc bạn chưa chạy chiến dịch nào trong khoảng đó.</li><li><strong>Số Tiếp cận thấp hơn Tin đã gửi</strong> → Bình thường, vì một người có thể nhận nhiều tin trong cùng chiến dịch.</li><li><strong>Tỷ lệ lỗi cao đột ngột</strong> → Xem ngay mục Lỗi gần đây. Thường là kênh gửi mất kết nối chứ không phải danh sách sai.</li><li><strong>Chiến dịch hiện đang chạy mà tốc độ bằng 0</strong> → Đang trong giờ nghỉ của Zalo, hoặc đang chờ tới lượt gửi tiếp theo.</li></ul><h2>Liên quan</h2><ul><li><a href="/huong-dan/zalo-gui-cham">Vì sao Zalo gửi chậm hoặc đang dừng</a></li><li><a href="/huong-dan/campaign-create">Tạo chiến dịch</a></li><li><a href="/huong-dan/channels">Kết nối kênh gửi</a></li></ul>`,
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

# Làm quen màn hình trước đã
Sau khi đăng nhập, màn hình chia làm hai phần:

- **Thanh menu dọc bên trái** — nơi bạn đi tới mọi tính năng. Các mục gom thành từng nhóm: **AI Chatbot**, **Chiến dịch**, **Landing page**, **Gói & Thanh toán**, **Cài đặt**. Bấm vào tên nhóm thì nhóm mở ra, hiện các mục con bên trong.
- **Thanh ngang trên cùng** — có nút **Nâng cấp** để xem bảng giá, và nút **Hướng dẫn** để quay lại đúng trang bạn đang đọc.

[ẢNH: toàn màn hình sau khi đăng nhập, khoanh đỏ thanh menu bên trái và thanh ngang trên cùng]

Cả bốn bước dưới đây đều bắt đầu bằng việc bấm vào một nhóm trong thanh menu bên trái.

# Bước 1 — Khai báo hồ sơ doanh nghiệp
Ở thanh menu bên trái, kéo xuống cuối, mở nhóm **Cài đặt** rồi bấm **Hồ sơ doanh nghiệp**.

[ẢNH: menu bên trái đang mở nhóm Cài đặt, khoanh đỏ mục "Hồ sơ doanh nghiệp"]

Điền tên doanh nghiệp, sản phẩm, đối tượng khách và giọng điệu bạn muốn dùng.

[ẢNH: trang Hồ sơ doanh nghiệp đã điền xong phần Thông tin cơ bản]

Làm việc này trước vì trợ lý AI lấy hồ sơ làm ngữ cảnh cho mọi nội dung nó viết. Bỏ trống thì AI viết ra thứ chung chung, không nhắc đúng tên sản phẩm của bạn — và bạn sẽ mất thời gian sửa từng bài.

Viết ít nhất 3–5 câu cụ thể. Hồ sơ càng rõ, nội dung AI đề xuất càng đỡ phải sửa.

→ Chi tiết: [Hồ sơ doanh nghiệp](ai-profile)

# Bước 2 — Nối kênh gửi
Vẫn ở thanh menu bên trái, mở nhóm **Chiến dịch** rồi bấm **Quản lý kênh gửi**.

[ẢNH: menu bên trái đang mở nhóm Chiến dịch, khoanh đỏ mục "Quản lý kênh gửi"]

Trong trang có 2 thẻ ở đầu — **Email** và **Zalo**. Nối ít nhất **một** kênh:

- **Email** — khai báo thông tin SMTP của hộp thư bạn đang dùng. Thư gửi đi mang địa chỉ của bạn.
- **Zalo** — quét mã QR bằng app Zalo trên điện thoại, đợi trạng thái **Đã kết nối**.

[ẢNH: đầu trang Quản lý kênh gửi, khoanh đỏ 2 thẻ Email / Zalo]

Chưa nối kênh nào thì Gửi nhanh và Chiến dịch đều không chạy được — hệ thống không có gì để gửi đi.

[ẢNH: thẻ Zalo sau khi nối xong, khoanh đỏ chữ "Đã kết nối"]

Chưa biết chọn kênh nào thì nhớ: **Email nhanh, Zalo chậm.** Zalo mỗi tin cách nhau 80–150 giây và nghỉ hẳn từ 23:00 đến 06:00, nên không hợp để gửi gấp cho danh sách lớn.

→ Chi tiết: [Kết nối kênh gửi](channels) · [Thêm tài khoản Email](email-account) · [Thêm tài khoản Zalo](zalo-account)

# Bước 3 — Gửi thử cho chính mình
Vẫn trong nhóm **Chiến dịch** ở menu bên trái, bấm mục **Gửi nhanh** — nó nằm đầu nhóm.

[ẢNH: menu bên trái, nhóm Chiến dịch đang mở, khoanh đỏ mục "Gửi nhanh"]

Chọn kênh vừa nối, rồi điền người nhận là **chính email hoặc số Zalo của bạn**.

[ẢNH: bước Người nhận của trang Gửi nhanh, đã chọn kênh và điền địa chỉ của chính mình]

Bước này mất 2 phút và đừng bao giờ bỏ qua. Nó cho biết ngay kênh đã chạy thật hay chưa. Phát hiện sai cấu hình ở đây rẻ hơn rất nhiều so với phát hiện lúc chiến dịch đã gửi được nửa danh sách — tin đã gửi thì không thu hồi được.

→ Chi tiết: [Gửi nhanh](quick-send)

# Bước 4 — Tạo chiến dịch đầu tiên
Vẫn trong nhóm **Chiến dịch**, bấm **Quản lý chiến dịch**. Ở đầu trang chọn thẻ **Tự tạo**, rồi bấm nút **Tạo** ở góc trên bên phải.

[ẢNH: trang Quản lý chiến dịch, khoanh đỏ thẻ "Tự tạo" và nút "Tạo" ở góc trên bên phải]

Hộp thoại hiện ra: đặt tên, chọn **Loại chiến dịch** (Email / Zalo cá nhân / Zalo nhóm), rồi bấm **Tạo và thiết kế**.

[ẢNH: hộp thoại "Tạo chiến dịch mới" với 3 lựa chọn loại chiến dịch]

Trình dựng mở ra. Bạn nối các khối lại với nhau thành luồng: lấy dữ liệu khách → gửi email hoặc Zalo → kết thúc.

Nguồn dữ liệu khách phổ biến nhất là **Google Sheet**. Chuẩn bị sẵn một file có cột tên, số điện thoại hoặc email trước khi vào bước này.

[ẢNH: trình dựng với luồng đơn giản: lấy dữ liệu → gửi tin → kết thúc]

Chưa quen dựng luồng thì bấm mục **Trợ lý AI** ở trên cùng menu bên trái và gõ một câu như *"tạo giúp tôi chiến dịch giới thiệu sản phẩm mới cho khách cũ"* — trợ lý dựng sẵn bản nháp để bạn sửa lại.

[ẢNH: menu bên trái, khoanh đỏ mục "Trợ lý AI" ở trên cùng]

→ Chi tiết: [Tạo chiến dịch](campaign-create) · [Khách hàng: dữ liệu đến từ đâu](khach-hang)

# Sau bốn bước thì làm gì
- **Xem chiến dịch chạy tới đâu** — nhóm **Chiến dịch** → **Hiệu quả chiến dịch**.
- **Xem hạn mức còn lại và lịch sử đơn** — nhóm **Gói & Thanh toán** → **Tổng quan gói**. Nhóm này chỉ chủ tài khoản mới thấy.
- **Sắp hết tin hoặc lượt AI thì mua thêm** — nhóm **Gói & Thanh toán** → **Mua thêm hạn mức**. Xem [Gói dịch vụ & thanh toán](plan-and-billing).

[ẢNH: menu bên trái đang mở nhóm Gói & Thanh toán, thấy 2 mục Tổng quan gói và Mua thêm hạn mức]

# Lỗi thường gặp khi mới bắt đầu
- **Không thấy nhóm Gói & Thanh toán hay nhóm Cài đặt trong menu** → Cả hai nhóm này chỉ **chủ tài khoản** thấy. Đăng nhập bằng tài khoản nhân viên thì chúng được ẩn hẳn khỏi thanh menu, không phải bạn tìm sót.
- **Zalo không gửi gì vào buổi tối** → Hệ thống nghỉ gửi Zalo từ 23:00 đến 06:00 để tài khoản không bị đánh dấu spam. Chiến dịch tự chạy tiếp lúc 6 giờ sáng.
- **Zalo gửi rất chậm, tưởng treo** → Đúng như thiết kế. Xem [Vì sao Zalo gửi chậm hoặc đang dừng](zalo-gui-cham).
- **Gói dùng thử sắp hết mà chưa kịp thử gì** → Xem [Gói dùng thử: có gì và hết hạn thì sao](dung-thu).

# Liên quan
- [Gói dùng thử: có gì và hết hạn thì sao](dung-thu)
- [Kết nối kênh gửi](channels)
- [Khách hàng: dữ liệu đến từ đâu](khach-hang)`,
    body_html: `<p>Mới tạo tài khoản và chưa biết bắt đầu từ đâu? Làm đúng bốn bước dưới đây là bạn gửi được tin đầu tiên. Mỗi bước đều có bài riêng nếu cần chi tiết.</p><p>Đừng đảo thứ tự — bước sau cần kết quả của bước trước.</p><h2>Làm quen màn hình trước đã</h2><p>Sau khi đăng nhập, màn hình chia làm hai phần:</p><ul><li><strong>Thanh menu dọc bên trái</strong> — nơi bạn đi tới mọi tính năng. Các mục gom thành từng nhóm: <strong>AI Chatbot</strong>, <strong>Chiến dịch</strong>, <strong>Landing page</strong>, <strong>Gói &amp; Thanh toán</strong>, <strong>Cài đặt</strong>. Bấm vào tên nhóm thì nhóm mở ra, hiện các mục con bên trong.</li><li><strong>Thanh ngang trên cùng</strong> — có nút <strong>Nâng cấp</strong> để xem bảng giá, và nút <strong>Hướng dẫn</strong> để quay lại đúng trang bạn đang đọc.</li></ul><p>[ẢNH: toàn màn hình sau khi đăng nhập, khoanh đỏ thanh menu bên trái và thanh ngang trên cùng]</p><p>Cả bốn bước dưới đây đều bắt đầu bằng việc bấm vào một nhóm trong thanh menu bên trái.</p><h2>Bước 1 — Khai báo hồ sơ doanh nghiệp</h2><p>Ở thanh menu bên trái, kéo xuống cuối, mở nhóm <strong>Cài đặt</strong> rồi bấm <strong>Hồ sơ doanh nghiệp</strong>.</p><p>[ẢNH: menu bên trái đang mở nhóm Cài đặt, khoanh đỏ mục &quot;Hồ sơ doanh nghiệp&quot;]</p><p>Điền tên doanh nghiệp, sản phẩm, đối tượng khách và giọng điệu bạn muốn dùng.</p><p>[ẢNH: trang Hồ sơ doanh nghiệp đã điền xong phần Thông tin cơ bản]</p><p>Làm việc này trước vì trợ lý AI lấy hồ sơ làm ngữ cảnh cho mọi nội dung nó viết. Bỏ trống thì AI viết ra thứ chung chung, không nhắc đúng tên sản phẩm của bạn — và bạn sẽ mất thời gian sửa từng bài.</p><p>Viết ít nhất 3–5 câu cụ thể. Hồ sơ càng rõ, nội dung AI đề xuất càng đỡ phải sửa.</p><p>→ Chi tiết: <a href="/huong-dan/ai-profile">Hồ sơ doanh nghiệp</a></p><h2>Bước 2 — Nối kênh gửi</h2><p>Vẫn ở thanh menu bên trái, mở nhóm <strong>Chiến dịch</strong> rồi bấm <strong>Quản lý kênh gửi</strong>.</p><p>[ẢNH: menu bên trái đang mở nhóm Chiến dịch, khoanh đỏ mục &quot;Quản lý kênh gửi&quot;]</p><p>Trong trang có 2 thẻ ở đầu — <strong>Email</strong> và <strong>Zalo</strong>. Nối ít nhất <strong>một</strong> kênh:</p><ul><li><strong>Email</strong> — khai báo thông tin SMTP của hộp thư bạn đang dùng. Thư gửi đi mang địa chỉ của bạn.</li><li><strong>Zalo</strong> — quét mã QR bằng app Zalo trên điện thoại, đợi trạng thái <strong>Đã kết nối</strong>.</li></ul><p>[ẢNH: đầu trang Quản lý kênh gửi, khoanh đỏ 2 thẻ Email / Zalo]</p><p>Chưa nối kênh nào thì Gửi nhanh và Chiến dịch đều không chạy được — hệ thống không có gì để gửi đi.</p><p>[ẢNH: thẻ Zalo sau khi nối xong, khoanh đỏ chữ &quot;Đã kết nối&quot;]</p><p>Chưa biết chọn kênh nào thì nhớ: <strong>Email nhanh, Zalo chậm.</strong> Zalo mỗi tin cách nhau 80–150 giây và nghỉ hẳn từ 23:00 đến 06:00, nên không hợp để gửi gấp cho danh sách lớn.</p><p>→ Chi tiết: <a href="/huong-dan/channels">Kết nối kênh gửi</a> · <a href="/huong-dan/email-account">Thêm tài khoản Email</a> · <a href="/huong-dan/zalo-account">Thêm tài khoản Zalo</a></p><h2>Bước 3 — Gửi thử cho chính mình</h2><p>Vẫn trong nhóm <strong>Chiến dịch</strong> ở menu bên trái, bấm mục <strong>Gửi nhanh</strong> — nó nằm đầu nhóm.</p><p>[ẢNH: menu bên trái, nhóm Chiến dịch đang mở, khoanh đỏ mục &quot;Gửi nhanh&quot;]</p><p>Chọn kênh vừa nối, rồi điền người nhận là <strong>chính email hoặc số Zalo của bạn</strong>.</p><p>[ẢNH: bước Người nhận của trang Gửi nhanh, đã chọn kênh và điền địa chỉ của chính mình]</p><p>Bước này mất 2 phút và đừng bao giờ bỏ qua. Nó cho biết ngay kênh đã chạy thật hay chưa. Phát hiện sai cấu hình ở đây rẻ hơn rất nhiều so với phát hiện lúc chiến dịch đã gửi được nửa danh sách — tin đã gửi thì không thu hồi được.</p><p>→ Chi tiết: <a href="/huong-dan/quick-send">Gửi nhanh</a></p><h2>Bước 4 — Tạo chiến dịch đầu tiên</h2><p>Vẫn trong nhóm <strong>Chiến dịch</strong>, bấm <strong>Quản lý chiến dịch</strong>. Ở đầu trang chọn thẻ <strong>Tự tạo</strong>, rồi bấm nút <strong>Tạo</strong> ở góc trên bên phải.</p><p>[ẢNH: trang Quản lý chiến dịch, khoanh đỏ thẻ &quot;Tự tạo&quot; và nút &quot;Tạo&quot; ở góc trên bên phải]</p><p>Hộp thoại hiện ra: đặt tên, chọn <strong>Loại chiến dịch</strong> (Email / Zalo cá nhân / Zalo nhóm), rồi bấm <strong>Tạo và thiết kế</strong>.</p><p>[ẢNH: hộp thoại &quot;Tạo chiến dịch mới&quot; với 3 lựa chọn loại chiến dịch]</p><p>Trình dựng mở ra. Bạn nối các khối lại với nhau thành luồng: lấy dữ liệu khách → gửi email hoặc Zalo → kết thúc.</p><p>Nguồn dữ liệu khách phổ biến nhất là <strong>Google Sheet</strong>. Chuẩn bị sẵn một file có cột tên, số điện thoại hoặc email trước khi vào bước này.</p><p>[ẢNH: trình dựng với luồng đơn giản: lấy dữ liệu → gửi tin → kết thúc]</p><p>Chưa quen dựng luồng thì bấm mục <strong>Trợ lý AI</strong> ở trên cùng menu bên trái và gõ một câu như <em>&quot;tạo giúp tôi chiến dịch giới thiệu sản phẩm mới cho khách cũ&quot;</em> — trợ lý dựng sẵn bản nháp để bạn sửa lại.</p><p>[ẢNH: menu bên trái, khoanh đỏ mục &quot;Trợ lý AI&quot; ở trên cùng]</p><p>→ Chi tiết: <a href="/huong-dan/campaign-create">Tạo chiến dịch</a> · <a href="/huong-dan/khach-hang">Khách hàng: dữ liệu đến từ đâu</a></p><h2>Sau bốn bước thì làm gì</h2><ul><li><strong>Xem chiến dịch chạy tới đâu</strong> — nhóm <strong>Chiến dịch</strong> → <strong>Hiệu quả chiến dịch</strong>.</li><li><strong>Xem hạn mức còn lại và lịch sử đơn</strong> — nhóm <strong>Gói &amp; Thanh toán</strong> → <strong>Tổng quan gói</strong>. Nhóm này chỉ chủ tài khoản mới thấy.</li><li><strong>Sắp hết tin hoặc lượt AI thì mua thêm</strong> — nhóm <strong>Gói &amp; Thanh toán</strong> → <strong>Mua thêm hạn mức</strong>. Xem <a href="/huong-dan/plan-and-billing">Gói dịch vụ &amp; thanh toán</a>.</li></ul><p>[ẢNH: menu bên trái đang mở nhóm Gói &amp; Thanh toán, thấy 2 mục Tổng quan gói và Mua thêm hạn mức]</p><h2>Lỗi thường gặp khi mới bắt đầu</h2><ul><li><strong>Không thấy nhóm Gói &amp; Thanh toán hay nhóm Cài đặt trong menu</strong> → Cả hai nhóm này chỉ <strong>chủ tài khoản</strong> thấy. Đăng nhập bằng tài khoản nhân viên thì chúng được ẩn hẳn khỏi thanh menu, không phải bạn tìm sót.</li><li><strong>Zalo không gửi gì vào buổi tối</strong> → Hệ thống nghỉ gửi Zalo từ 23:00 đến 06:00 để tài khoản không bị đánh dấu spam. Chiến dịch tự chạy tiếp lúc 6 giờ sáng.</li><li><strong>Zalo gửi rất chậm, tưởng treo</strong> → Đúng như thiết kế. Xem <a href="/huong-dan/zalo-gui-cham">Vì sao Zalo gửi chậm hoặc đang dừng</a>.</li><li><strong>Gói dùng thử sắp hết mà chưa kịp thử gì</strong> → Xem <a href="/huong-dan/dung-thu">Gói dùng thử: có gì và hết hạn thì sao</a>.</li></ul><h2>Liên quan</h2><ul><li><a href="/huong-dan/dung-thu">Gói dùng thử: có gì và hết hạn thì sao</a></li><li><a href="/huong-dan/channels">Kết nối kênh gửi</a></li><li><a href="/huong-dan/khach-hang">Khách hàng: dữ liệu đến từ đâu</a></li></ul>`,
  },
  {
    slug: 'dung-thu',
    feature_key: 'getting-started',
    primary_route: '/app/billing',
    sort_order: 7,
    title: 'Gói dùng thử: có gì và hết hạn thì sao',
    summary: 'Tài khoản mới được cấp gói dùng thử tự động. Bài này nói rõ bạn có gì, xem hạn mức ở đâu và điều gì xảy ra khi hết hạn.',
    body_md: `Mỗi tài khoản đăng ký mới đều được **tự động cấp gói dùng thử miễn phí**, không cần nhập thẻ. Đăng ký bằng Google hay bằng email đều như nhau.

Ngay sau khi vào lần đầu, một hộp thoại chào mừng hiện lên giữa màn hình, ghi rõ tên gói, thời hạn và **ngày hết hạn cụ thể của bạn**.

[ẢNH: hộp thoại chào mừng gói dùng thử hiện giữa màn hình, khoanh đỏ tên gói và ngày hết hạn]

Đọc xong rồi hãy đóng — hộp thoại này **chỉ hiện đúng một lần**, đóng rồi là không gọi lại được.

# Bạn có gì trong thời gian dùng thử
Hộp thoại chào mừng liệt kê đúng quyền lợi của bạn: số tin nhắn gửi được, số lượt dùng trợ lý AI, và số chatbot được tạo.

Con số cụ thể có thể thay đổi theo thời điểm, nên **đừng nhớ theo bài này**. Muốn xem đúng hạn mức của riêng bạn: ở **thanh menu bên trái**, mở nhóm **Gói & Thanh toán** rồi bấm **Tổng quan gói**.

[ẢNH: menu bên trái đang mở nhóm Gói & Thanh toán, khoanh đỏ mục "Tổng quan gói"]

[ẢNH: trang Tổng quan gói, khoanh đỏ khu vực hiện hạn mức còn lại và ngày hết hạn]

Thời hạn mặc định là **10 ngày**.

# Nên dùng 10 ngày đó thế nào
Thời gian ngắn, nên đừng dàn trải. Thứ tự hiệu quả nhất:

1. **Ngày đầu** — khai báo hồ sơ doanh nghiệp và nối một kênh gửi. Xem [Bắt đầu với Founder AI](getting-started).
2. **Ngay sau đó** — gửi thử cho chính mình để chắc kênh chạy được.
3. **Vài ngày giữa** — chạy một chiến dịch thật nhưng với danh sách nhỏ, khoảng vài chục người. Đủ để thấy kết quả mà không tiêu hết hạn mức.
4. **Trước khi hết hạn** — xem báo cáo ở nhóm **Chiến dịch** → **Hiệu quả chiến dịch**, rồi quyết định có nâng gói không.

Đừng để dành hạn mức tới ngày cuối. Hạn mức của gói **không cộng dồn sang kỳ sau**, dùng không hết là mất.

# Hết hạn thì chuyện gì xảy ra
Đây là phần nhiều người lo nhất, nên nói rõ:

**Bạn không mất dữ liệu.** Chiến dịch, mẫu nội dung, danh sách khách, landing page và chatbot đều còn nguyên. Hệ thống chỉ **tạm khoá** chứ không xoá.

Khi bạn nâng gói, mọi thứ dùng lại được ngay, không phải làm lại từ đầu.

Trong lúc chờ, những thứ đã tạo vượt quá hạn mức gói mới sẽ bị khoá. Bạn được **tự chọn giữ cái nào**: mở nhóm **Gói & Thanh toán** → **Tổng quan gói**, kéo xuống mục **Tài nguyên khoá**, tick những cái quan trọng nhất để giữ lại trong hạn mức còn hiệu lực.

[ẢNH: mục Tài nguyên khoá trong trang Tổng quan gói, thấy các ô tick để chọn giữ lại]

Lưu ý: tài nguyên bị khoá vẫn chiếm chỗ. Muốn tạo cái mới thì phải xoá cái đang khoá trước.

# Mỗi tài khoản chỉ dùng thử một lần
Gói dùng thử cấp một lần cho mỗi tài khoản. Đăng ký thêm tài khoản mới bằng email khác để dùng thử tiếp **không phải cách dùng đúng** — dữ liệu của bạn sẽ nằm rải rác ở nhiều nơi không gộp lại được, và mọi thứ đã dựng ở tài khoản cũ đều không mang sang được.

Cần thêm thời gian đánh giá thì liên hệ hỗ trợ, đừng tạo tài khoản mới.

# Lỗi thường gặp
- **Không thấy hộp thoại chào mừng** → Hộp thoại chỉ hiện một lần và tắt đi là không hiện lại. Mọi thông tin trong đó đều xem lại được ở nhóm **Gói & Thanh toán** → **Tổng quan gói**.
- **Trong menu không có nhóm Gói & Thanh toán** → Cả nhóm này chỉ **chủ tài khoản** thấy. Tài khoản nhân viên không thấy cả hai mục Tổng quan gói và Mua thêm hạn mức.
- **Muốn nâng gói giữa chừng, sợ mất phần chưa dùng** → Cứ nâng. Dữ liệu và cấu hình giữ nguyên hết.
- **Đã thanh toán mà hạn mức chưa tăng** → Đợi vài phút rồi tải lại trang, hệ thống cần nhận xác nhận từ cổng thanh toán. Quá 15 phút vẫn chưa thấy thì liên hệ hỗ trợ kèm **mã đơn** — đơn không mất đi đâu.

# Liên quan
- [Bắt đầu với Founder AI — 4 bước](getting-started)
- [Gói dịch vụ & thanh toán](plan-and-billing)
- [Câu hỏi thường gặp về thanh toán & hoá đơn](faq-billing)`,
    body_html: `<p>Mỗi tài khoản đăng ký mới đều được <strong>tự động cấp gói dùng thử miễn phí</strong>, không cần nhập thẻ. Đăng ký bằng Google hay bằng email đều như nhau.</p><p>Ngay sau khi vào lần đầu, một hộp thoại chào mừng hiện lên giữa màn hình, ghi rõ tên gói, thời hạn và <strong>ngày hết hạn cụ thể của bạn</strong>.</p><p>[ẢNH: hộp thoại chào mừng gói dùng thử hiện giữa màn hình, khoanh đỏ tên gói và ngày hết hạn]</p><p>Đọc xong rồi hãy đóng — hộp thoại này <strong>chỉ hiện đúng một lần</strong>, đóng rồi là không gọi lại được.</p><h2>Bạn có gì trong thời gian dùng thử</h2><p>Hộp thoại chào mừng liệt kê đúng quyền lợi của bạn: số tin nhắn gửi được, số lượt dùng trợ lý AI, và số chatbot được tạo.</p><p>Con số cụ thể có thể thay đổi theo thời điểm, nên <strong>đừng nhớ theo bài này</strong>. Muốn xem đúng hạn mức của riêng bạn: ở <strong>thanh menu bên trái</strong>, mở nhóm <strong>Gói &amp; Thanh toán</strong> rồi bấm <strong>Tổng quan gói</strong>.</p><p>[ẢNH: menu bên trái đang mở nhóm Gói &amp; Thanh toán, khoanh đỏ mục &quot;Tổng quan gói&quot;]</p><p>[ẢNH: trang Tổng quan gói, khoanh đỏ khu vực hiện hạn mức còn lại và ngày hết hạn]</p><p>Thời hạn mặc định là <strong>10 ngày</strong>.</p><h2>Nên dùng 10 ngày đó thế nào</h2><p>Thời gian ngắn, nên đừng dàn trải. Thứ tự hiệu quả nhất:</p><ol><li><strong>Ngày đầu</strong> — khai báo hồ sơ doanh nghiệp và nối một kênh gửi. Xem <a href="/huong-dan/getting-started">Bắt đầu với Founder AI</a>.</li><li><strong>Ngay sau đó</strong> — gửi thử cho chính mình để chắc kênh chạy được.</li><li><strong>Vài ngày giữa</strong> — chạy một chiến dịch thật nhưng với danh sách nhỏ, khoảng vài chục người. Đủ để thấy kết quả mà không tiêu hết hạn mức.</li><li><strong>Trước khi hết hạn</strong> — xem báo cáo ở nhóm <strong>Chiến dịch</strong> → <strong>Hiệu quả chiến dịch</strong>, rồi quyết định có nâng gói không.</li></ol><p>Đừng để dành hạn mức tới ngày cuối. Hạn mức của gói <strong>không cộng dồn sang kỳ sau</strong>, dùng không hết là mất.</p><h2>Hết hạn thì chuyện gì xảy ra</h2><p>Đây là phần nhiều người lo nhất, nên nói rõ:</p><p><strong>Bạn không mất dữ liệu.</strong> Chiến dịch, mẫu nội dung, danh sách khách, landing page và chatbot đều còn nguyên. Hệ thống chỉ <strong>tạm khoá</strong> chứ không xoá.</p><p>Khi bạn nâng gói, mọi thứ dùng lại được ngay, không phải làm lại từ đầu.</p><p>Trong lúc chờ, những thứ đã tạo vượt quá hạn mức gói mới sẽ bị khoá. Bạn được <strong>tự chọn giữ cái nào</strong>: mở nhóm <strong>Gói &amp; Thanh toán</strong> → <strong>Tổng quan gói</strong>, kéo xuống mục <strong>Tài nguyên khoá</strong>, tick những cái quan trọng nhất để giữ lại trong hạn mức còn hiệu lực.</p><p>[ẢNH: mục Tài nguyên khoá trong trang Tổng quan gói, thấy các ô tick để chọn giữ lại]</p><p>Lưu ý: tài nguyên bị khoá vẫn chiếm chỗ. Muốn tạo cái mới thì phải xoá cái đang khoá trước.</p><h2>Mỗi tài khoản chỉ dùng thử một lần</h2><p>Gói dùng thử cấp một lần cho mỗi tài khoản. Đăng ký thêm tài khoản mới bằng email khác để dùng thử tiếp <strong>không phải cách dùng đúng</strong> — dữ liệu của bạn sẽ nằm rải rác ở nhiều nơi không gộp lại được, và mọi thứ đã dựng ở tài khoản cũ đều không mang sang được.</p><p>Cần thêm thời gian đánh giá thì liên hệ hỗ trợ, đừng tạo tài khoản mới.</p><h2>Lỗi thường gặp</h2><ul><li><strong>Không thấy hộp thoại chào mừng</strong> → Hộp thoại chỉ hiện một lần và tắt đi là không hiện lại. Mọi thông tin trong đó đều xem lại được ở nhóm <strong>Gói &amp; Thanh toán</strong> → <strong>Tổng quan gói</strong>.</li><li><strong>Trong menu không có nhóm Gói &amp; Thanh toán</strong> → Cả nhóm này chỉ <strong>chủ tài khoản</strong> thấy. Tài khoản nhân viên không thấy cả hai mục Tổng quan gói và Mua thêm hạn mức.</li><li><strong>Muốn nâng gói giữa chừng, sợ mất phần chưa dùng</strong> → Cứ nâng. Dữ liệu và cấu hình giữ nguyên hết.</li><li><strong>Đã thanh toán mà hạn mức chưa tăng</strong> → Đợi vài phút rồi tải lại trang, hệ thống cần nhận xác nhận từ cổng thanh toán. Quá 15 phút vẫn chưa thấy thì liên hệ hỗ trợ kèm <strong>mã đơn</strong> — đơn không mất đi đâu.</li></ul><h2>Liên quan</h2><ul><li><a href="/huong-dan/getting-started">Bắt đầu với Founder AI — 4 bước</a></li><li><a href="/huong-dan/plan-and-billing">Gói dịch vụ &amp; thanh toán</a></li><li><a href="/huong-dan/faq-billing">Câu hỏi thường gặp về thanh toán &amp; hoá đơn</a></li></ul>`,
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
Khi đang ở trong trình dựng chiến dịch, thêm một trong các khối sau vào đầu luồng:

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

[ẢNH: một Google Sheet mẫu, khoanh đỏ dòng tiêu đề ở dòng 1 và dữ liệu bắt đầu từ dòng 2]

[ẢNH: hộp thoại chia sẻ của Google Sheet, khoanh đỏ chỗ đặt quyền cho người có liên kết được xem]

## Khai báo trong chiến dịch
1. Thêm khối **Đọc dữ liệu Sheet** vào luồng.
2. Dán **URL Google Sheet** vào ô tương ứng.
3. **Tên Sheet** để trống là được — hệ thống dùng tab đầu tiên. Chỉ điền khi file có nhiều tab và bạn muốn đọc tab khác.
4. Điền **Dòng tiêu đề** và **Dòng bắt đầu dữ liệu**. Nếu tiêu đề ở dòng 1 và dữ liệu từ dòng 2 thì điền lần lượt là 1 và 2.
5. Bấm **Kiểm tra kết nối**.

Bước 5 quan trọng: nó vừa kiểm tra file có đọc được không, **vừa tải danh sách tên cột về**. Chưa bấm nút này thì các khối phía sau chưa biết file của bạn có những cột nào để chèn vào nội dung tin nhắn.

[ẢNH: khối Đọc dữ liệu Sheet đã điền URL, khoanh đỏ nút "Kiểm tra kết nối"]

Sau khi kiểm tra thành công, danh sách cột hiện ra ngay bên dưới. Đó là những cột bạn dùng được để cá nhân hoá nội dung.

[ẢNH: danh sách cột hiện ra sau khi kiểm tra kết nối thành công]

# Một điểm dễ nhầm khi chạy thử
Trong builder có tuỳ chọn **Số dòng tối đa khi chạy thử**, mặc định 100 dòng.

Con số này **chỉ áp dụng khi bạn bấm Chạy thử** để xem trước. Khi chạy thật bằng **Chạy ngay** hoặc **Lên lịch**, hệ thống đọc đủ toàn bộ dòng trong Sheet, không bị giới hạn bởi tuỳ chọn này.

Nói cách khác: thấy chạy thử chỉ ra 100 người thì đừng lo mất dữ liệu.

# Xem khách hàng của chiến dịch ở đâu
Ở **thanh menu bên trái**, mở nhóm **Chiến dịch**, rồi bấm mục **Khách hàng từ chiến dịch** — nó nằm cuối nhóm.

[ẢNH: menu bên trái, nhóm Chiến dịch đang mở, khoanh đỏ mục "Khách hàng từ chiến dịch" ở cuối danh sách]

Đúng như tên gọi, trang này **liệt kê chiến dịch trước**, không phải danh bạ chung. Bấm vào một chiến dịch để xem những ai đã tham gia chiến dịch đó.

[ẢNH: trang Khách hàng từ chiến dịch, danh sách chiến dịch kèm số khách của từng cái]

Bấm vào một dòng sẽ mở ra danh sách khách. Bấm tiếp vào một khách để xem thông tin liên hệ, trạng thái, hành trình đã đi qua và các tin nhắn đã gửi cho họ.

[ẢNH: màn hình chi tiết một khách, thấy thông tin liên hệ và dòng thời gian các tin đã gửi]

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
    body_html: `<p>Đây là chỗ nhiều người mới hiểu nhầm, nên nói thẳng trước:</p><p><strong>Founder AI không có trang &quot;nhập danh sách khách hàng&quot; riêng.</strong> Bạn không tải file lên ở một chỗ nào đó rồi mới dùng. Thay vào đó, danh sách người nhận được <strong>lấy vào ngay trong chiến dịch</strong>, bằng một khối gọi là khối lấy dữ liệu.</p><p>Cách làm này giúp mỗi chiến dịch tự chọn nguồn riêng — chiến dịch này gửi cho khách trong Google Sheet, chiến dịch kia gửi cho người điền form landing page, không cần trộn chung một danh bạ.</p><h2>Bốn nguồn dữ liệu bạn có thể dùng</h2><p>Khi đang ở trong trình dựng chiến dịch, thêm một trong các khối sau vào đầu luồng:</p><table><thead><tr><th>Khối</th><th>Lấy dữ liệu từ</th><th>Hợp khi nào</th></tr></thead><tbody><tr><td><strong>Đọc dữ liệu Sheet</strong></td><td>Một file Google Sheet của bạn</td><td>Đây là cách phổ biến nhất. Bạn có sẵn danh sách trong Excel/Sheet</td></tr><tr><td><strong>Dữ liệu landing page</strong></td><td>Người đã điền form trên landing page của bạn</td><td>Chăm sóc khách mới để lại thông tin</td></tr><tr><td><strong>Lấy dữ liệu khách</strong></td><td>Khách đã lưu trong hệ thống từ chiến dịch trước</td><td>Gửi lại cho người đã từng tương tác</td></tr><tr><td><strong>Lấy danh sách bạn bè Zalo</strong></td><td>Danh bạ của tài khoản Zalo đã nối</td><td>Nhắn cho bạn bè Zalo sẵn có</td></tr></tbody></table><p>Ngoài ra còn khối <strong>Lấy thông tin nhóm Zalo</strong> nếu bạn muốn gửi vào nhóm thay vì gửi cho từng người.</p><h2>Dùng Google Sheet — cách phổ biến nhất</h2><p>Chuẩn bị file trước cho đúng thì các bước sau rất nhanh.</p><h3>Chuẩn bị file Sheet</h3><ol><li>Tạo một Google Sheet, <strong>dòng đầu là tiêu đề cột</strong> — ví dụ: Họ tên, Số điện thoại, Email.</li><li>Dữ liệu thật bắt đầu từ dòng ngay dưới tiêu đề.</li><li><strong>Chia sẻ quyền đọc cho file</strong> — nếu để riêng tư hoàn toàn, hệ thống không đọc được.</li></ol><p>[ẢNH: một Google Sheet mẫu, khoanh đỏ dòng tiêu đề ở dòng 1 và dữ liệu bắt đầu từ dòng 2]</p><p>[ẢNH: hộp thoại chia sẻ của Google Sheet, khoanh đỏ chỗ đặt quyền cho người có liên kết được xem]</p><h3>Khai báo trong chiến dịch</h3><ol><li>Thêm khối <strong>Đọc dữ liệu Sheet</strong> vào luồng.</li><li>Dán <strong>URL Google Sheet</strong> vào ô tương ứng.</li><li><strong>Tên Sheet</strong> để trống là được — hệ thống dùng tab đầu tiên. Chỉ điền khi file có nhiều tab và bạn muốn đọc tab khác.</li><li>Điền <strong>Dòng tiêu đề</strong> và <strong>Dòng bắt đầu dữ liệu</strong>. Nếu tiêu đề ở dòng 1 và dữ liệu từ dòng 2 thì điền lần lượt là 1 và 2.</li><li>Bấm <strong>Kiểm tra kết nối</strong>.</li></ol><p>Bước 5 quan trọng: nó vừa kiểm tra file có đọc được không, <strong>vừa tải danh sách tên cột về</strong>. Chưa bấm nút này thì các khối phía sau chưa biết file của bạn có những cột nào để chèn vào nội dung tin nhắn.</p><p>[ẢNH: khối Đọc dữ liệu Sheet đã điền URL, khoanh đỏ nút &quot;Kiểm tra kết nối&quot;]</p><p>Sau khi kiểm tra thành công, danh sách cột hiện ra ngay bên dưới. Đó là những cột bạn dùng được để cá nhân hoá nội dung.</p><p>[ẢNH: danh sách cột hiện ra sau khi kiểm tra kết nối thành công]</p><h2>Một điểm dễ nhầm khi chạy thử</h2><p>Trong builder có tuỳ chọn <strong>Số dòng tối đa khi chạy thử</strong>, mặc định 100 dòng.</p><p>Con số này <strong>chỉ áp dụng khi bạn bấm Chạy thử</strong> để xem trước. Khi chạy thật bằng <strong>Chạy ngay</strong> hoặc <strong>Lên lịch</strong>, hệ thống đọc đủ toàn bộ dòng trong Sheet, không bị giới hạn bởi tuỳ chọn này.</p><p>Nói cách khác: thấy chạy thử chỉ ra 100 người thì đừng lo mất dữ liệu.</p><h2>Xem khách hàng của chiến dịch ở đâu</h2><p>Ở <strong>thanh menu bên trái</strong>, mở nhóm <strong>Chiến dịch</strong>, rồi bấm mục <strong>Khách hàng từ chiến dịch</strong> — nó nằm cuối nhóm.</p><p>[ẢNH: menu bên trái, nhóm Chiến dịch đang mở, khoanh đỏ mục &quot;Khách hàng từ chiến dịch&quot; ở cuối danh sách]</p><p>Đúng như tên gọi, trang này <strong>liệt kê chiến dịch trước</strong>, không phải danh bạ chung. Bấm vào một chiến dịch để xem những ai đã tham gia chiến dịch đó.</p><p>[ẢNH: trang Khách hàng từ chiến dịch, danh sách chiến dịch kèm số khách của từng cái]</p><p>Bấm vào một dòng sẽ mở ra danh sách khách. Bấm tiếp vào một khách để xem thông tin liên hệ, trạng thái, hành trình đã đi qua và các tin nhắn đã gửi cho họ.</p><p>[ẢNH: màn hình chi tiết một khách, thấy thông tin liên hệ và dòng thời gian các tin đã gửi]</p><h2>Lỗi thường gặp</h2><ul><li><strong>Kiểm tra kết nối báo lỗi</strong> → File Sheet chưa được chia sẻ quyền đọc. Mở file, đổi quyền truy cập rồi thử lại.</li><li><strong>Kết nối được nhưng không thấy cột nào</strong> → Sai số <strong>Dòng tiêu đề</strong>, hoặc sai <strong>Tên Sheet</strong> khi file có nhiều tab.</li><li><strong>Chiến dịch chạy nhưng không có người nhận nào</strong> → Số <strong>Dòng bắt đầu dữ liệu</strong> đang trỏ vào dòng trống, hoặc trỏ nhầm vào chính dòng tiêu đề.</li><li><strong>Trang Khách hàng trống trơn</strong> → Bạn chưa chạy chiến dịch nào. Trang này liệt kê theo chiến dịch nên chưa có chiến dịch thì chưa có gì để xem.</li><li><strong>Muốn tìm một khách cụ thể mà không nhớ ở chiến dịch nào</strong> → Hiện phải vào từng chiến dịch để tìm, chưa có tìm kiếm chung toàn bộ khách.</li></ul><h2>Liên quan</h2><ul><li><a href="/huong-dan/campaign-create">Tạo chiến dịch</a></li><li><a href="/huong-dan/getting-started">Bắt đầu với Founder AI — 4 bước</a></li><li><a href="/huong-dan/quick-send">Gửi nhanh</a></li></ul>`,
  },
  {
    slug: 'channels',
    feature_key: 'channels',
    primary_route: '/app/settings/channels',
    sort_order: 20,
    title: 'Kết nối kênh gửi (Email & Zalo)',
    summary: 'Nơi khai báo tài khoản Email và Zalo. Chưa có kênh nào ở đây thì không gửi được gì.',
    body_md: `Đây là nơi bạn khai báo tài khoản dùng để gửi đi. Founder AI **không có sẵn kênh gửi của riêng nó** — bạn phải nối tài khoản email hoặc Zalo của mình vào. Chưa nối kênh nào thì Gửi nhanh và Chiến dịch đều không chạy được.

# Tìm trang này trên màn hình
Ở **thanh menu bên trái**, bấm vào nhóm **Chiến dịch** cho nó mở ra, rồi chọn mục **Quản lý kênh gửi**.

[ẢNH: menu bên trái đang mở nhóm Chiến dịch, khoanh đỏ mục "Quản lý kênh gửi"]

Trang này chia làm 2 thẻ ở đầu trang: **Email** và **Zalo**. Bấm để chuyển qua lại.

[ẢNH: đầu trang Quản lý kênh gửi, khoanh đỏ 2 thẻ Email / Zalo]

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
1. Mở trang **Quản lý kênh gửi** theo đường đi ở trên.
2. Chọn thẻ **Email** hoặc **Zalo** tuỳ kênh muốn nối.
3. Thêm tài khoản theo hướng dẫn riêng của từng kênh (xem 2 bài ở mục Liên quan).
4. **Gửi thử cho chính mình** trước khi chạy chiến dịch thật — dùng mục **Gửi nhanh** ngay phía trên trong cùng nhóm menu.

Bước 4 đừng bỏ qua. Sai cấu hình mà phát hiện lúc chiến dịch đã chạy được nửa danh sách thì không thu hồi lại được những tin đã gửi.

# Nhiều tài khoản cùng lúc
Cả Email lẫn Zalo đều cho thêm **nhiều tài khoản**. Khi có từ 2 cái trở lên, bạn chọn một cái làm **mặc định** — đó là cái được dùng khi bạn không chỉ định gì khác.

[ẢNH: danh sách nhiều tài khoản trong một thẻ, khoanh đỏ dấu hiệu đánh dấu tài khoản mặc định]

Với Zalo, thêm tài khoản còn là cách duy nhất để tăng lượng gửi: mỗi tài khoản chỉ gửi được khoảng 16.000 tin một tháng, cần nhiều hơn thì phải nối thêm tài khoản chứ mua thêm tin không giải quyết được.

# Lỗi thường gặp
- **Trang trống, không thấy nút nào** → Bạn đang đăng nhập bằng tài khoản nhân viên chưa được cấp quyền kênh gửi. Nhờ chủ tài khoản mở nhóm **Cài đặt** → **Nhân viên** để cấp quyền.
- **Đã nối kênh nhưng chiến dịch báo không có tài khoản gửi** → Kiểm tra tài khoản đó có đang ở trạng thái lỗi không, và đã đặt mặc định chưa.
- **Zalo hiện "Mất kết nối" dù hôm qua vẫn chạy** → Phiên đăng nhập Zalo hết hạn theo thời gian, đây là chuyện bình thường. Bấm **Kết nối lại** và quét QR.

# Liên quan
- [Thêm tài khoản Email](email-account)
- [Thêm tài khoản Zalo](zalo-account)
- [Vì sao Zalo gửi chậm hoặc đang dừng](zalo-gui-cham)
- [Gửi nhanh](quick-send)`,
    body_html: `<p>Đây là nơi bạn khai báo tài khoản dùng để gửi đi. Founder AI <strong>không có sẵn kênh gửi của riêng nó</strong> — bạn phải nối tài khoản email hoặc Zalo của mình vào. Chưa nối kênh nào thì Gửi nhanh và Chiến dịch đều không chạy được.</p><h2>Tìm trang này trên màn hình</h2><p>Ở <strong>thanh menu bên trái</strong>, bấm vào nhóm <strong>Chiến dịch</strong> cho nó mở ra, rồi chọn mục <strong>Quản lý kênh gửi</strong>.</p><p>[ẢNH: menu bên trái đang mở nhóm Chiến dịch, khoanh đỏ mục &quot;Quản lý kênh gửi&quot;]</p><p>Trang này chia làm 2 thẻ ở đầu trang: <strong>Email</strong> và <strong>Zalo</strong>. Bấm để chuyển qua lại.</p><p>[ẢNH: đầu trang Quản lý kênh gửi, khoanh đỏ 2 thẻ Email / Zalo]</p><h2>Nên nối kênh nào trước</h2><p>Tuỳ bạn định gửi gì, không bắt buộc nối cả hai:</p><table><thead><tr><th></th><th>Email</th><th>Zalo</th></tr></thead><tbody><tr><td>Tốc độ</td><td>Rất nhanh, vài trăm tin một phút</td><td>Chậm, mỗi tin cách nhau 80–150 giây</td></tr><tr><td>Cần gì để nối</td><td>Tài khoản email có bật SMTP</td><td>Điện thoại có app Zalo để quét mã</td></tr><tr><td>Gửi đêm</td><td>Được</td><td><strong>Không</strong> — nghỉ từ 23:00 đến 06:00</td></tr><tr><td>Hay dùng để</td><td>Gửi số lượng lớn, gửi tài liệu dài</td><td>Nhắn tin ngắn, chăm sóc khách quen, mời kết bạn</td></tr></tbody></table><p>Nếu bạn cần gửi cho vài nghìn người trong ngày thì phải dùng Email. Zalo hợp với danh sách nhỏ và nội dung mang tính cá nhân.</p><h2>Các bước</h2><ol><li>Mở trang <strong>Quản lý kênh gửi</strong> theo đường đi ở trên.</li><li>Chọn thẻ <strong>Email</strong> hoặc <strong>Zalo</strong> tuỳ kênh muốn nối.</li><li>Thêm tài khoản theo hướng dẫn riêng của từng kênh (xem 2 bài ở mục Liên quan).</li><li><strong>Gửi thử cho chính mình</strong> trước khi chạy chiến dịch thật — dùng mục <strong>Gửi nhanh</strong> ngay phía trên trong cùng nhóm menu.</li></ol><p>Bước 4 đừng bỏ qua. Sai cấu hình mà phát hiện lúc chiến dịch đã chạy được nửa danh sách thì không thu hồi lại được những tin đã gửi.</p><h2>Nhiều tài khoản cùng lúc</h2><p>Cả Email lẫn Zalo đều cho thêm <strong>nhiều tài khoản</strong>. Khi có từ 2 cái trở lên, bạn chọn một cái làm <strong>mặc định</strong> — đó là cái được dùng khi bạn không chỉ định gì khác.</p><p>[ẢNH: danh sách nhiều tài khoản trong một thẻ, khoanh đỏ dấu hiệu đánh dấu tài khoản mặc định]</p><p>Với Zalo, thêm tài khoản còn là cách duy nhất để tăng lượng gửi: mỗi tài khoản chỉ gửi được khoảng 16.000 tin một tháng, cần nhiều hơn thì phải nối thêm tài khoản chứ mua thêm tin không giải quyết được.</p><h2>Lỗi thường gặp</h2><ul><li><strong>Trang trống, không thấy nút nào</strong> → Bạn đang đăng nhập bằng tài khoản nhân viên chưa được cấp quyền kênh gửi. Nhờ chủ tài khoản mở nhóm <strong>Cài đặt</strong> → <strong>Nhân viên</strong> để cấp quyền.</li><li><strong>Đã nối kênh nhưng chiến dịch báo không có tài khoản gửi</strong> → Kiểm tra tài khoản đó có đang ở trạng thái lỗi không, và đã đặt mặc định chưa.</li><li><strong>Zalo hiện &quot;Mất kết nối&quot; dù hôm qua vẫn chạy</strong> → Phiên đăng nhập Zalo hết hạn theo thời gian, đây là chuyện bình thường. Bấm <strong>Kết nối lại</strong> và quét QR.</li></ul><h2>Liên quan</h2><ul><li><a href="/huong-dan/email-account">Thêm tài khoản Email</a></li><li><a href="/huong-dan/zalo-account">Thêm tài khoản Zalo</a></li><li><a href="/huong-dan/zalo-gui-cham">Vì sao Zalo gửi chậm hoặc đang dừng</a></li><li><a href="/huong-dan/quick-send">Gửi nhanh</a></li></ul>`,
  },
  {
    slug: 'email-account',
    feature_key: 'channels',
    primary_route: '/app/settings/channels',
    sort_order: 30,
    title: 'Thêm tài khoản Email',
    summary: 'Khai báo SMTP để gửi email từ địa chỉ của bạn, và kiểm tra bằng 2 nút thử khác nhau.',
    body_md: `Email gửi đi sẽ mang địa chỉ **của bạn**, không phải của Founder AI. Muốn vậy bạn cần cung cấp thông tin SMTP — tức là quyền gửi thư thay mặt hộp thư đó.

# Tìm chỗ khai báo trên màn hình
1. Ở **thanh menu bên trái**, mở nhóm **Chiến dịch**, chọn **Quản lý kênh gửi**.

   [ẢNH: menu bên trái đang mở nhóm Chiến dịch, khoanh đỏ mục "Quản lý kênh gửi"]

2. Ở đầu trang, bấm thẻ **Email**.
3. Bấm nút **Thêm email** ở cột bên trái.

Màn hình chia đôi: cột bên trái là danh sách tài khoản đã có, cột bên phải là biểu mẫu khai báo.

[ẢNH: thẻ Email đang mở, khoanh đỏ nút "Thêm email" ở cột trái và biểu mẫu bên phải]

# Cần chuẩn bị gì trước
Bốn thông tin SMTP từ nhà cung cấp email của bạn: **SMTP Server**, **Port**, **Username / Email**, **Password / App Password**.

Chỗ hay vướng nhất: với Gmail và Outlook, **mật khẩu đăng nhập thường sẽ không dùng được**. Bạn phải tạo một "Mật khẩu ứng dụng" (App Password) riêng. Ngay trong trang có mục **Hướng dẫn cấu hình SMTP** — bấm mở ra là có sẵn các bước cho Gmail, Outlook và nhà cung cấp khác, làm theo đó nhanh nhất.

[ẢNH: mục "Hướng dẫn cấu hình SMTP" đang mở, thấy 3 thẻ Gmail / Outlook / Khác]

# Các bước
1. Bấm **Thêm email**.
2. Điền phần **Thông tin người gửi**:
   - **Tên người gửi** — tên hiện trong hộp thư người nhận, ví dụ tên cửa hàng của bạn.
   - **Email Reply-To** — địa chỉ nhận thư khi khách bấm Trả lời. Điền đúng hộp thư bạn thật sự đọc, không thì mất khách hỏi lại.

   [ẢNH: phần Thông tin người gửi đã điền tên và địa chỉ Reply-To]

3. Kéo xuống phần **Cấu hình SMTP**, điền 4 thông tin đã chuẩn bị.

   [ẢNH: phần Cấu hình SMTP với 4 ô Server / Port / Username / Password đã điền]

4. Bấm **Kiểm tra kết nối**. Nút này chỉ sáng lên khi đã điền đủ cả 4 ô.
5. Bấm **Thêm email** để lưu.
6. Sau khi lưu, bấm **Gửi email test** và nhập địa chỉ của chính bạn để nhận thử.

   [ẢNH: hộp thoại Gửi email test đang điền địa chỉ của chính mình]

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
    body_html: `<p>Email gửi đi sẽ mang địa chỉ <strong>của bạn</strong>, không phải của Founder AI. Muốn vậy bạn cần cung cấp thông tin SMTP — tức là quyền gửi thư thay mặt hộp thư đó.</p><h2>Tìm chỗ khai báo trên màn hình</h2><ol><li>Ở <strong>thanh menu bên trái</strong>, mở nhóm <strong>Chiến dịch</strong>, chọn <strong>Quản lý kênh gửi</strong>.<p>[ẢNH: menu bên trái đang mở nhóm Chiến dịch, khoanh đỏ mục &quot;Quản lý kênh gửi&quot;]</p></li><li>Ở đầu trang, bấm thẻ <strong>Email</strong>.</li><li>Bấm nút <strong>Thêm email</strong> ở cột bên trái.</li></ol><p>Màn hình chia đôi: cột bên trái là danh sách tài khoản đã có, cột bên phải là biểu mẫu khai báo.</p><p>[ẢNH: thẻ Email đang mở, khoanh đỏ nút &quot;Thêm email&quot; ở cột trái và biểu mẫu bên phải]</p><h2>Cần chuẩn bị gì trước</h2><p>Bốn thông tin SMTP từ nhà cung cấp email của bạn: <strong>SMTP Server</strong>, <strong>Port</strong>, <strong>Username / Email</strong>, <strong>Password / App Password</strong>.</p><p>Chỗ hay vướng nhất: với Gmail và Outlook, <strong>mật khẩu đăng nhập thường sẽ không dùng được</strong>. Bạn phải tạo một &quot;Mật khẩu ứng dụng&quot; (App Password) riêng. Ngay trong trang có mục <strong>Hướng dẫn cấu hình SMTP</strong> — bấm mở ra là có sẵn các bước cho Gmail, Outlook và nhà cung cấp khác, làm theo đó nhanh nhất.</p><p>[ẢNH: mục &quot;Hướng dẫn cấu hình SMTP&quot; đang mở, thấy 3 thẻ Gmail / Outlook / Khác]</p><h2>Các bước</h2><ol><li>Bấm <strong>Thêm email</strong>.</li><li>Điền phần <strong>Thông tin người gửi</strong>:<ul><li><strong>Tên người gửi</strong> — tên hiện trong hộp thư người nhận, ví dụ tên cửa hàng của bạn.</li><li><strong>Email Reply-To</strong> — địa chỉ nhận thư khi khách bấm Trả lời. Điền đúng hộp thư bạn thật sự đọc, không thì mất khách hỏi lại.<p>[ẢNH: phần Thông tin người gửi đã điền tên và địa chỉ Reply-To]</p></li></ul></li><li>Kéo xuống phần <strong>Cấu hình SMTP</strong>, điền 4 thông tin đã chuẩn bị.<p>[ẢNH: phần Cấu hình SMTP với 4 ô Server / Port / Username / Password đã điền]</p></li><li>Bấm <strong>Kiểm tra kết nối</strong>. Nút này chỉ sáng lên khi đã điền đủ cả 4 ô.</li><li>Bấm <strong>Thêm email</strong> để lưu.</li><li>Sau khi lưu, bấm <strong>Gửi email test</strong> và nhập địa chỉ của chính bạn để nhận thử.<p>[ẢNH: hộp thoại Gửi email test đang điền địa chỉ của chính mình]</p></li></ol><h2>Hai nút thử khác nhau, đừng nhầm</h2><p>Đây là chỗ nhiều người bỏ sót:</p><ul><li><strong>Kiểm tra kết nối</strong> — chỉ hỏi máy chủ SMTP xem tài khoản/mật khẩu có đúng không. Nhanh, nhưng <strong>không gửi thư nào cả</strong>.</li><li><strong>Gửi email test</strong> — gửi một lá thư thật tới địa chỉ bạn nhập. Đây mới là cách biết thư có vào được hộp thư hay rơi vào spam.</li></ul><p>Chỉ bấm nút đầu mà bỏ nút sau là hay gặp cảnh &quot;cấu hình đúng hết mà khách không nhận được&quot;.</p><p>[ẢNH: hàng nút cuối biểu mẫu, khoanh riêng &quot;Kiểm tra kết nối&quot; và &quot;Gửi email test&quot;]</p><h2>Lỗi thường gặp</h2><ul><li><strong>Kiểm tra kết nối báo thất bại, mã 535</strong> → Sai tài khoản hoặc mật khẩu. Với Gmail/Outlook, gần như chắc chắn do bạn đang dùng mật khẩu đăng nhập thay vì App Password.</li><li><strong>Nút &quot;Kiểm tra kết nối&quot; bị mờ, bấm không được</strong> → Còn ô trống trong 4 ô SMTP.</li><li><strong>Không thấy nút &quot;Gửi email test&quot;</strong> → Nút này chỉ hiện sau khi tài khoản đã được lưu. Lưu trước rồi mới thử gửi được.</li><li><strong>Gửi được nhưng thư rơi vào spam</strong> → Đây là vấn đề uy tín tên miền phía nhà cung cấp email, không phải lỗi cấu hình. Cần khai báo SPF/DKIM cho tên miền của bạn.</li><li><strong>Đang gửi chiến dịch thì email dừng hẳn nhiều giờ</strong> → Nhà cung cấp đã chặn tạm vì gửi quá nhanh. Hệ thống tự chờ rồi gửi tiếp, không cần làm gì.</li><li><strong>Một số người trong danh sách không bao giờ nhận được</strong> → Địa chỉ đó không tồn tại. Hệ thống đánh dấu và <strong>vĩnh viễn không gửi lại</strong> để giữ uy tín cho tên miền của bạn.</li></ul><h2>Liên quan</h2><ul><li><a href="/huong-dan/channels">Kết nối kênh gửi</a></li><li><a href="/huong-dan/quick-send">Gửi nhanh</a></li><li><a href="/huong-dan/plan-and-billing">Gói dịch vụ &amp; thanh toán</a></li></ul>`,
  },
  {
    slug: 'zalo-account',
    feature_key: 'channels',
    primary_route: '/app/settings/channels',
    sort_order: 40,
    title: 'Thêm tài khoản Zalo',
    summary: 'Quét QR để nối Zalo cá nhân, hiểu các trạng thái kết nối và khi nào phải quét lại.',
    body_md: `Nối tài khoản Zalo cá nhân để gửi tin nhắn, tin vào nhóm và lời mời kết bạn. Cách nối là **quét mã QR** giống hệt khi bạn đăng nhập Zalo trên máy tính.

# Tìm chỗ nối Zalo trên màn hình
1. Ở **thanh menu bên trái**, mở nhóm **Chiến dịch**, chọn **Quản lý kênh gửi**.

   [ẢNH: menu bên trái đang mở nhóm Chiến dịch, khoanh đỏ mục "Quản lý kênh gửi"]

2. Ở đầu trang, bấm thẻ **Zalo**.

Chưa có tài khoản nào thì giữa trang hiện nút to ghi **Thêm tài khoản Zalo đầu tiên**. Đã có tài khoản rồi thì dùng nút **Tạo QR đăng nhập**.

[ẢNH: thẻ Zalo khi chưa có tài khoản, khoanh đỏ nút "Thêm tài khoản Zalo đầu tiên"]

# Các bước
Cầm sẵn điện thoại trước khi bắt đầu — mã QR hết hạn nhanh.

1. Bấm **Tạo QR đăng nhập**. Một cửa sổ hiện mã QR.

   [ẢNH: cửa sổ "Quét QR để đăng nhập Zalo" đang hiện mã]

2. Mở **app Zalo trên điện thoại**, vào mục quét mã, quét mã đang hiện trên màn hình máy tính.
3. Xác nhận trên điện thoại.
4. Đợi trạng thái trên máy tính chuyển thành **Đã kết nối**.

   [ẢNH: thẻ Zalo sau khi nối xong, khoanh đỏ dòng trạng thái "Đã kết nối"]

Mã QR **có hạn dùng ngắn**. Để lâu quá sẽ báo hết hạn và bạn phải bấm tạo mã mới.

# Các trạng thái nghĩa là gì
| Trạng thái | Nghĩa là | Bạn cần làm gì |
|---|---|---|
| **Đã kết nối** | Đang chạy bình thường | Không cần làm gì |
| **Mất kết nối** | Phiên đăng nhập đã đứt | Bấm **Kết nối lại**, quét QR |
| **Cần kết nối lại** | Phiên hết hạn, hệ thống **đã chủ động ngừng thử lại** | Bấm **Kết nối lại**, quét QR |
| **Chưa cấu hình** | Tài khoản chưa nối xong | Tạo QR và quét |

Trạng thái **Cần kết nối lại** là cố ý, không phải hỏng. Khi phiên hết hạn, hệ thống dừng thử lại tự động — vì thử đăng nhập liên tục là dấu hiệu khiến Zalo khoá tài khoản của bạn.

[ẢNH: một tài khoản Zalo đang ở trạng thái "Cần kết nối lại", khoanh đỏ nút "Kết nối lại" bên cạnh]

# Nhiều tài khoản và tài khoản mặc định
Nối được nhiều tài khoản Zalo. Khi có từ 2 cái trở lên, bấm **Đặt mặc định** cho cái bạn dùng thường xuyên nhất — đó là cái được chọn sẵn khi tạo chiến dịch.

[ẢNH: danh sách 2 tài khoản Zalo, khoanh đỏ nút "Đặt mặc định"]

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
    body_html: `<p>Nối tài khoản Zalo cá nhân để gửi tin nhắn, tin vào nhóm và lời mời kết bạn. Cách nối là <strong>quét mã QR</strong> giống hệt khi bạn đăng nhập Zalo trên máy tính.</p><h2>Tìm chỗ nối Zalo trên màn hình</h2><ol><li>Ở <strong>thanh menu bên trái</strong>, mở nhóm <strong>Chiến dịch</strong>, chọn <strong>Quản lý kênh gửi</strong>.<p>[ẢNH: menu bên trái đang mở nhóm Chiến dịch, khoanh đỏ mục &quot;Quản lý kênh gửi&quot;]</p></li><li>Ở đầu trang, bấm thẻ <strong>Zalo</strong>.</li></ol><p>Chưa có tài khoản nào thì giữa trang hiện nút to ghi <strong>Thêm tài khoản Zalo đầu tiên</strong>. Đã có tài khoản rồi thì dùng nút <strong>Tạo QR đăng nhập</strong>.</p><p>[ẢNH: thẻ Zalo khi chưa có tài khoản, khoanh đỏ nút &quot;Thêm tài khoản Zalo đầu tiên&quot;]</p><h2>Các bước</h2><p>Cầm sẵn điện thoại trước khi bắt đầu — mã QR hết hạn nhanh.</p><ol><li>Bấm <strong>Tạo QR đăng nhập</strong>. Một cửa sổ hiện mã QR.<p>[ẢNH: cửa sổ &quot;Quét QR để đăng nhập Zalo&quot; đang hiện mã]</p></li><li>Mở <strong>app Zalo trên điện thoại</strong>, vào mục quét mã, quét mã đang hiện trên màn hình máy tính.</li><li>Xác nhận trên điện thoại.</li><li>Đợi trạng thái trên máy tính chuyển thành <strong>Đã kết nối</strong>.<p>[ẢNH: thẻ Zalo sau khi nối xong, khoanh đỏ dòng trạng thái &quot;Đã kết nối&quot;]</p></li></ol><p>Mã QR <strong>có hạn dùng ngắn</strong>. Để lâu quá sẽ báo hết hạn và bạn phải bấm tạo mã mới.</p><h2>Các trạng thái nghĩa là gì</h2><table><thead><tr><th>Trạng thái</th><th>Nghĩa là</th><th>Bạn cần làm gì</th></tr></thead><tbody><tr><td><strong>Đã kết nối</strong></td><td>Đang chạy bình thường</td><td>Không cần làm gì</td></tr><tr><td><strong>Mất kết nối</strong></td><td>Phiên đăng nhập đã đứt</td><td>Bấm <strong>Kết nối lại</strong>, quét QR</td></tr><tr><td><strong>Cần kết nối lại</strong></td><td>Phiên hết hạn, hệ thống <strong>đã chủ động ngừng thử lại</strong></td><td>Bấm <strong>Kết nối lại</strong>, quét QR</td></tr><tr><td><strong>Chưa cấu hình</strong></td><td>Tài khoản chưa nối xong</td><td>Tạo QR và quét</td></tr></tbody></table><p>Trạng thái <strong>Cần kết nối lại</strong> là cố ý, không phải hỏng. Khi phiên hết hạn, hệ thống dừng thử lại tự động — vì thử đăng nhập liên tục là dấu hiệu khiến Zalo khoá tài khoản của bạn.</p><p>[ẢNH: một tài khoản Zalo đang ở trạng thái &quot;Cần kết nối lại&quot;, khoanh đỏ nút &quot;Kết nối lại&quot; bên cạnh]</p><h2>Nhiều tài khoản và tài khoản mặc định</h2><p>Nối được nhiều tài khoản Zalo. Khi có từ 2 cái trở lên, bấm <strong>Đặt mặc định</strong> cho cái bạn dùng thường xuyên nhất — đó là cái được chọn sẵn khi tạo chiến dịch.</p><p>[ẢNH: danh sách 2 tài khoản Zalo, khoanh đỏ nút &quot;Đặt mặc định&quot;]</p><p>Nối thêm tài khoản cũng là <strong>cách duy nhất để gửi được nhiều hơn</strong>. Mỗi tài khoản chỉ gửi khoảng 16.000 tin một tháng, và giới hạn này là do Zalo đặt ra chứ không phải do gói dịch vụ.</p><h2>Phải quét lại QR bao lâu một lần</h2><p>Không có lịch cố định. Phiên Zalo tự hết hạn theo thời gian, và cũng đứt khi bạn đăng xuất Zalo trên máy tính hoặc đổi mật khẩu Zalo.</p><p>Hệ thống có cơ chế tự giữ phiên và tự khôi phục, nên phần lớn thời gian bạn không phải làm gì. Nhưng nên <strong>kiểm tra trạng thái trước mỗi chiến dịch lớn</strong> — rẻ hơn nhiều so với phát hiện lúc đang chạy.</p><h2>Lỗi thường gặp</h2><ul><li><strong>Quét xong mà không lên &quot;Đã kết nối&quot;</strong> → Chưa bấm xác nhận trên điện thoại, hoặc mã đã hết hạn trước khi quét. Tạo mã mới và quét ngay.</li><li><strong>Đang chạy chiến dịch thì rớt xuống &quot;Mất kết nối&quot;</strong> → Chiến dịch dừng lại chứ không mất. Quét QR lại là chạy tiếp phần còn lại.</li><li><strong>Gửi rất chậm, tưởng treo</strong> → Bình thường, mỗi tin cách nhau 80–150 giây. Xem <a href="/huong-dan/zalo-gui-cham">Vì sao Zalo gửi chậm hoặc đang dừng</a>.</li><li><strong>Buổi tối không gửi gì cả</strong> → Hệ thống nghỉ gửi Zalo từ 23:00 đến 06:00, tự chạy lại sáng hôm sau.</li></ul><h2>Liên quan</h2><ul><li><a href="/huong-dan/zalo-gui-cham">Vì sao Zalo gửi chậm hoặc đang dừng</a></li><li><a href="/huong-dan/channels">Kết nối kênh gửi</a></li><li><a href="/huong-dan/campaign-create">Tạo chiến dịch</a></li></ul>`,
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

Ngoài khung giờ đó, đi kiểm tra trạng thái tài khoản Zalo: **menu bên trái** → nhóm **Chiến dịch** → **Quản lý kênh gửi** → thẻ **Zalo**. Nếu trạng thái là **Mất kết nối** hoặc **Cần kết nối lại** thì bấm **Kết nối lại** và quét QR.

[ẢNH: thẻ Zalo trong trang Quản lý kênh gửi, khoanh đỏ dòng trạng thái của tài khoản]

## Chạy được một lúc rồi dừng
Thường là đã chạm trần gửi trong giờ. Hệ thống tự chờ sang khung giờ tiếp theo rồi gửi tiếp — không mất người nào, chỉ là chờ.

Một khả năng khác: Zalo đang **giới hạn tra số điện thoại** của tài khoản đó. Mỗi ngày Zalo chỉ cho một tài khoản tra một lượng số điện thoại nhất định; chạm mức đó thì tài khoản bị khoá tra số **tới 0 giờ hôm sau**, rồi hệ thống tự gửi tiếp. Khi đó trang chiến dịch có dòng báo *đang bị Zalo giới hạn tra số điện thoại — tự gửi tiếp lúc…*, và thẻ tài khoản ở trang Quản lý kênh gửi hiện nhãn *Bị giới hạn tra số tới…*.

Trong lúc bị giới hạn, tin gửi vào **nhóm Zalo** vẫn đi bình thường, và những người hệ thống **đã biết tài khoản Zalo** (từng tra hoặc từng gửi trước đó) cũng vẫn nhận được. Chỉ những số mới, phải tra, mới phải chờ.

## Chạy chậm hơn cả mức bình thường
Nếu bạn chạy nhiều chiến dịch cùng lúc trên **cùng một tài khoản Zalo**, chúng chia nhau lượt gửi chứ không cộng thêm. Hai chiến dịch cùng chạy thì mỗi cái chậm gấp đôi.

Muốn nhanh hơn thật sự thì phải nối thêm tài khoản Zalo, xem [Thêm tài khoản Zalo](zalo-account).

## Vài người trong danh sách không nhận được
Có hai nguyên nhân:

- Hệ thống đã thử lại nhiều lần đều thất bại với người đó rồi bỏ qua để không phí lượt gửi. Chiến dịch chạy một lần thử tối đa **3 lần**, mỗi lần cách nhau ít nhất 6 tiếng; chiến dịch chạy liên tục thử tối đa **5 lần**.
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
Ở **thanh menu bên trái**, mở nhóm **Chiến dịch** rồi bấm **Hiệu quả chiến dịch**. Trang đó cho biết chiến dịch đã gửi được bao nhiêu, còn bao nhiêu, và tin nào thất bại.

[ẢNH: menu bên trái, nhóm Chiến dịch đang mở, khoanh đỏ mục "Hiệu quả chiến dịch"]

[ẢNH: mục Chiến dịch gần đây, khoanh đỏ dòng của một chiến dịch Zalo đang chạy với cột Thành công / tổng]

# Liên quan
- [Thêm tài khoản Zalo](zalo-account)
- [Kết nối kênh gửi](channels)
- [Tạo chiến dịch](campaign-create)`,
    body_html: `<p>Nếu bạn vừa chạy chiến dịch Zalo và thấy nó bò rất chậm, hoặc đứng im hàng giờ — <strong>phần lớn trường hợp đó là cố ý, không phải hỏng.</strong> Bài này giải thích hệ thống đang làm gì.</p><h2>Ba con số cần biết trước</h2><ul><li>Mỗi tin cách nhau <strong>80 đến 150 giây</strong>.</li><li>Không gửi Zalo từ <strong>23:00 đến 06:00</strong>.</li><li>Mỗi tài khoản gửi được khoảng <strong>16.000 tin một tháng</strong>.</li></ul><p>Nghĩa là gửi cho 1.000 người mất <strong>khoảng 10 đến 20 tiếng</strong>, trải qua nhiều buổi. Đây là con số bình thường, không phải hệ thống yếu.</p><h2>Vì sao phải chậm như vậy</h2><p>Zalo không cho phép gửi hàng loạt. Tài khoản nào gửi liên tục, đều đặn, nhanh bất thường sẽ bị nhận diện là công cụ tự động và <strong>bị khoá</strong> — mất luôn tài khoản Zalo cá nhân của bạn, không chỉ mất chiến dịch.</p><p>Khoảng cách 80–150 giây là ngẫu nhiên chứ không đều nhau, để nhịp gửi trông giống người thật đang nhắn tin. Gửi chậm là cái giá để giữ tài khoản.</p><blockquote><p>Nếu bạn cần gửi nhanh cho số lượng lớn, hãy dùng Email. Zalo về bản chất không phải kênh gửi hàng loạt.</p></blockquote><h2>Tra theo triệu chứng</h2><h3>Không gửi gì cả, đứng im hoàn toàn</h3><p>Xem đồng hồ trước. Nếu đang trong khoảng <strong>23:00 – 06:00</strong> thì đúng như thiết kế: hệ thống tạm dừng và <strong>tự chạy tiếp lúc 6 giờ sáng</strong>, bạn không cần làm gì.</p><p>Ngoài khung giờ đó, đi kiểm tra trạng thái tài khoản Zalo: <strong>menu bên trái</strong> → nhóm <strong>Chiến dịch</strong> → <strong>Quản lý kênh gửi</strong> → thẻ <strong>Zalo</strong>. Nếu trạng thái là <strong>Mất kết nối</strong> hoặc <strong>Cần kết nối lại</strong> thì bấm <strong>Kết nối lại</strong> và quét QR.</p><p>[ẢNH: thẻ Zalo trong trang Quản lý kênh gửi, khoanh đỏ dòng trạng thái của tài khoản]</p><h3>Chạy được một lúc rồi dừng</h3><p>Thường là đã chạm trần gửi trong giờ. Hệ thống tự chờ sang khung giờ tiếp theo rồi gửi tiếp — không mất người nào, chỉ là chờ.</p><p>Một khả năng khác: Zalo đang <strong>giới hạn tra số điện thoại</strong> của tài khoản đó. Mỗi ngày Zalo chỉ cho một tài khoản tra một lượng số điện thoại nhất định; chạm mức đó thì tài khoản bị khoá tra số <strong>tới 0 giờ hôm sau</strong>, rồi hệ thống tự gửi tiếp. Khi đó trang chiến dịch có dòng báo <em>đang bị Zalo giới hạn tra số điện thoại — tự gửi tiếp lúc…</em>, và thẻ tài khoản ở trang Quản lý kênh gửi hiện nhãn <em>Bị giới hạn tra số tới…</em>.</p><p>Trong lúc bị giới hạn, tin gửi vào <strong>nhóm Zalo</strong> vẫn đi bình thường, và những người hệ thống <strong>đã biết tài khoản Zalo</strong> (từng tra hoặc từng gửi trước đó) cũng vẫn nhận được. Chỉ những số mới, phải tra, mới phải chờ.</p><h3>Chạy chậm hơn cả mức bình thường</h3><p>Nếu bạn chạy nhiều chiến dịch cùng lúc trên <strong>cùng một tài khoản Zalo</strong>, chúng chia nhau lượt gửi chứ không cộng thêm. Hai chiến dịch cùng chạy thì mỗi cái chậm gấp đôi.</p><p>Muốn nhanh hơn thật sự thì phải nối thêm tài khoản Zalo, xem <a href="/huong-dan/zalo-account">Thêm tài khoản Zalo</a>.</p><h3>Vài người trong danh sách không nhận được</h3><p>Có hai nguyên nhân:</p><ul><li>Hệ thống đã thử lại nhiều lần đều thất bại với người đó rồi bỏ qua để không phí lượt gửi. Chiến dịch chạy một lần thử tối đa <strong>3 lần</strong>, mỗi lần cách nhau ít nhất 6 tiếng; chiến dịch chạy liên tục thử tối đa <strong>5 lần</strong>.</li><li>Số điện thoại đó chưa dùng Zalo, hoặc chặn nhận tin từ người lạ.</li></ul><p>Số còn lại trong danh sách vẫn được gửi bình thường.</p><h2>Khi nào mới là thật sự có vấn đề</h2><p>Bốn dấu hiệu dưới đây mới đáng báo hỗ trợ:</p><ol><li>Tài khoản báo <strong>Đã kết nối</strong>, đang trong giờ được gửi, mà <strong>quá 30 phút không có tin nào đi</strong>.</li><li>Trạng thái nhảy về <strong>Mất kết nối</strong> liên tục dù bạn vừa quét QR.</li><li><strong>Toàn bộ</strong> danh sách đều thất bại, không riêng vài người.</li><li>Bạn nhận được cảnh báo từ chính Zalo về việc tài khoản bị hạn chế.</li></ol><p>Ngoài bốn trường hợp đó, chậm và dừng theo giờ đều là hoạt động bình thường.</p><h2>Xem tiến độ ở đâu</h2><p>Ở <strong>thanh menu bên trái</strong>, mở nhóm <strong>Chiến dịch</strong> rồi bấm <strong>Hiệu quả chiến dịch</strong>. Trang đó cho biết chiến dịch đã gửi được bao nhiêu, còn bao nhiêu, và tin nào thất bại.</p><p>[ẢNH: menu bên trái, nhóm Chiến dịch đang mở, khoanh đỏ mục &quot;Hiệu quả chiến dịch&quot;]</p><p>[ẢNH: mục Chiến dịch gần đây, khoanh đỏ dòng của một chiến dịch Zalo đang chạy với cột Thành công / tổng]</p><h2>Liên quan</h2><ul><li><a href="/huong-dan/zalo-account">Thêm tài khoản Zalo</a></li><li><a href="/huong-dan/channels">Kết nối kênh gửi</a></li><li><a href="/huong-dan/campaign-create">Tạo chiến dịch</a></li></ul>`,
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

## Tìm trang này trên màn hình
Ở **thanh menu bên trái**, bấm vào nhóm **AI Chatbot** cho nó mở ra, rồi chọn mục **Tạo AI Chatbot**.

[ẢNH: menu bên trái đang mở nhóm AI Chatbot, khoanh đỏ mục "Tạo AI Chatbot"]

Chỉ **chủ tài khoản** dùng được trang này. Tài khoản nhân viên bấm vào sẽ bị chặn.

[ẢNH: trang Tạo AI Chatbot, cột trái là danh sách chatbot, phần chính bên phải là các tab]

## Ba tab cần đi qua
Sau khi chọn hoặc tạo một chatbot, phần chính của màn hình có ba tab xếp ngang. Đi lần lượt từ trái sang phải.

[ẢNH: hàng ba tab Cấu hình / Kiến thức / Triển khai, khoanh đỏ cả hàng]

### 1. Cấu hình
Đặt tên chatbot, viết hướng dẫn cách trả lời, chỉnh màu và icon của khung chat trên website. Trong phần cài đặt khung chat còn có ô **Nhãn nút mở chat**: một dòng chữ ngắn hiện cạnh nút tròn, ví dụ *Chat với chúng tôi*. Để trống thì chỉ hiện nút tròn.

Phần hướng dẫn cách trả lời quan trọng hơn bạn nghĩ. Hãy viết rõ: bot xưng hô thế nào, được phép hứa gì, gặp câu ngoài phạm vi thì nói sao. Ví dụ *"Xưng em, gọi khách là anh/chị. Không báo giá cụ thể, hướng khách để lại số điện thoại."*

[ẢNH: tab Cấu hình, khoanh đỏ ô nhập hướng dẫn cách trả lời]

### 2. Kiến thức
Nơi quyết định bot trả lời đúng hay sai. Bạn tải tài liệu lên hoặc dán thẳng văn bản: bảng giá, chính sách bảo hành, câu hỏi thường gặp, mô tả sản phẩm.

Bot chỉ biết những gì có trong đây. Chưa nạp gì thì nó trả lời chung chung.

> Nạp tài liệu **không** tốn credit AI. Chỉ mỗi lượt bot trả lời khách mới tính.

[ẢNH: tab Kiến thức, khoanh đỏ nút tải tài liệu lên]

[ẢNH: tab Kiến thức sau khi đã có vài tài liệu, khoanh đỏ cột trạng thái xử lý của từng tài liệu]

### 3. Triển khai
Chọn nơi đặt bot:

- **Website** — chèn đoạn mã vào trang của bạn, hoặc dùng liên kết công khai nếu chưa có website
- **Zalo Official Account** — cần App ID và App Secret từ Zalo Developer
- **Facebook Messenger** — liên kết Fanpage
- **Zalo cá nhân** — bot trả lời ngay trong tài khoản Zalo bạn đã kết nối
- **Telegram** — liên kết tài khoản Telegram cá nhân bằng cách quét QR, rồi bật chatbot cho từng tài khoản
- **WhatsApp** — gán chatbot trả lời cho từng tài khoản WhatsApp đã kết nối

Cách nối hai kênh này xem [Kết nối Telegram và WhatsApp cho chatbot](chatbot-telegram-whatsapp).

[ẢNH: tab Triển khai, khoanh đỏ các ô chọn kênh]

Với Zalo OA và Facebook, màn hình có sẵn hướng dẫn từng bước kèm ô sao chép Webhook URL và Verify Token. **Verify Token chỉ hiện một lần** lúc tạo — sao chép ngay, đóng lại là không xem lại được.

[ẢNH: phần hướng dẫn Zalo OA, khoanh đỏ hai ô sao chép Webhook URL và Verify Token]

## Bot trả lời rồi thì xem ở đâu
Mọi hội thoại đổ về một chỗ: **menu bên trái** → nhóm **AI Chatbot** → mục **Lịch sử trò chuyện**, ngay dưới mục bạn vừa dùng. Mọi kênh gộp chung ở đó. Xem [Hộp thư hợp nhất](inbox).

[ẢNH: menu bên trái, nhóm AI Chatbot đang mở, khoanh đỏ mục "Lịch sử trò chuyện"]

## Khi bot trả lời sai
Gần như luôn là do phần Kiến thức, không phải do model. Kiểm theo thứ tự:

1. Câu hỏi đó đã có trong tài liệu chưa?
2. Tài liệu đã xử lý xong chưa, hay còn đang nạp?
3. Hướng dẫn cách trả lời có mâu thuẫn với tài liệu không?

## Liên quan
- [Chatbot: khung giờ hoạt động, giới hạn trả lời và AI viết hộ](chatbot-khung-gio)
- [Liên hệ khách để lại trong chat và thư tổng hợp](lien-he-khach-de-lai)
- [Hộp thư hợp nhất](inbox)
- [Hồ sơ doanh nghiệp](ai-profile)
- [Gói dịch vụ & thanh toán](plan-and-billing)`,
    body_html: `<h2>Chatbot AI trả lời khách tự động</h2><p>Chatbot đọc tài liệu bạn nạp vào rồi trả lời khách theo đúng những gì bạn bán — không phải một trợ lý chung chung.</p><h3>Tìm trang này trên màn hình</h3><p>Ở <strong>thanh menu bên trái</strong>, bấm vào nhóm <strong>AI Chatbot</strong> cho nó mở ra, rồi chọn mục <strong>Tạo AI Chatbot</strong>.</p><p>[ẢNH: menu bên trái đang mở nhóm AI Chatbot, khoanh đỏ mục &quot;Tạo AI Chatbot&quot;]</p><p>Chỉ <strong>chủ tài khoản</strong> dùng được trang này. Tài khoản nhân viên bấm vào sẽ bị chặn.</p><p>[ẢNH: trang Tạo AI Chatbot, cột trái là danh sách chatbot, phần chính bên phải là các tab]</p><h3>Ba tab cần đi qua</h3><p>Sau khi chọn hoặc tạo một chatbot, phần chính của màn hình có ba tab xếp ngang. Đi lần lượt từ trái sang phải.</p><p>[ẢNH: hàng ba tab Cấu hình / Kiến thức / Triển khai, khoanh đỏ cả hàng]</p><h4>1. Cấu hình</h4><p>Đặt tên chatbot, viết hướng dẫn cách trả lời, chỉnh màu và icon của khung chat trên website. Trong phần cài đặt khung chat còn có ô <strong>Nhãn nút mở chat</strong>: một dòng chữ ngắn hiện cạnh nút tròn, ví dụ <em>Chat với chúng tôi</em>. Để trống thì chỉ hiện nút tròn.</p><p>Phần hướng dẫn cách trả lời quan trọng hơn bạn nghĩ. Hãy viết rõ: bot xưng hô thế nào, được phép hứa gì, gặp câu ngoài phạm vi thì nói sao. Ví dụ <em>&quot;Xưng em, gọi khách là anh/chị. Không báo giá cụ thể, hướng khách để lại số điện thoại.&quot;</em></p><p>[ẢNH: tab Cấu hình, khoanh đỏ ô nhập hướng dẫn cách trả lời]</p><h4>2. Kiến thức</h4><p>Nơi quyết định bot trả lời đúng hay sai. Bạn tải tài liệu lên hoặc dán thẳng văn bản: bảng giá, chính sách bảo hành, câu hỏi thường gặp, mô tả sản phẩm.</p><p>Bot chỉ biết những gì có trong đây. Chưa nạp gì thì nó trả lời chung chung.</p><blockquote><p>Nạp tài liệu <strong>không</strong> tốn credit AI. Chỉ mỗi lượt bot trả lời khách mới tính.</p></blockquote><p>[ẢNH: tab Kiến thức, khoanh đỏ nút tải tài liệu lên]</p><p>[ẢNH: tab Kiến thức sau khi đã có vài tài liệu, khoanh đỏ cột trạng thái xử lý của từng tài liệu]</p><h4>3. Triển khai</h4><p>Chọn nơi đặt bot:</p><ul><li><strong>Website</strong> — chèn đoạn mã vào trang của bạn, hoặc dùng liên kết công khai nếu chưa có website</li><li><strong>Zalo Official Account</strong> — cần App ID và App Secret từ Zalo Developer</li><li><strong>Facebook Messenger</strong> — liên kết Fanpage</li><li><strong>Zalo cá nhân</strong> — bot trả lời ngay trong tài khoản Zalo bạn đã kết nối</li><li><strong>Telegram</strong> — liên kết tài khoản Telegram cá nhân bằng cách quét QR, rồi bật chatbot cho từng tài khoản</li><li><strong>WhatsApp</strong> — gán chatbot trả lời cho từng tài khoản WhatsApp đã kết nối</li></ul><p>Cách nối hai kênh này xem <a href="/huong-dan/chatbot-telegram-whatsapp">Kết nối Telegram và WhatsApp cho chatbot</a>.</p><p>[ẢNH: tab Triển khai, khoanh đỏ các ô chọn kênh]</p><p>Với Zalo OA và Facebook, màn hình có sẵn hướng dẫn từng bước kèm ô sao chép Webhook URL và Verify Token. <strong>Verify Token chỉ hiện một lần</strong> lúc tạo — sao chép ngay, đóng lại là không xem lại được.</p><p>[ẢNH: phần hướng dẫn Zalo OA, khoanh đỏ hai ô sao chép Webhook URL và Verify Token]</p><h3>Bot trả lời rồi thì xem ở đâu</h3><p>Mọi hội thoại đổ về một chỗ: <strong>menu bên trái</strong> → nhóm <strong>AI Chatbot</strong> → mục <strong>Lịch sử trò chuyện</strong>, ngay dưới mục bạn vừa dùng. Mọi kênh gộp chung ở đó. Xem <a href="/huong-dan/inbox">Hộp thư hợp nhất</a>.</p><p>[ẢNH: menu bên trái, nhóm AI Chatbot đang mở, khoanh đỏ mục &quot;Lịch sử trò chuyện&quot;]</p><h3>Khi bot trả lời sai</h3><p>Gần như luôn là do phần Kiến thức, không phải do model. Kiểm theo thứ tự:</p><ol><li>Câu hỏi đó đã có trong tài liệu chưa?</li><li>Tài liệu đã xử lý xong chưa, hay còn đang nạp?</li><li>Hướng dẫn cách trả lời có mâu thuẫn với tài liệu không?</li></ol><h3>Liên quan</h3><ul><li><a href="/huong-dan/chatbot-khung-gio">Chatbot: khung giờ hoạt động, giới hạn trả lời và AI viết hộ</a></li><li><a href="/huong-dan/lien-he-khach-de-lai">Liên hệ khách để lại trong chat và thư tổng hợp</a></li><li><a href="/huong-dan/inbox">Hộp thư hợp nhất</a></li><li><a href="/huong-dan/ai-profile">Hồ sơ doanh nghiệp</a></li><li><a href="/huong-dan/plan-and-billing">Gói dịch vụ &amp; thanh toán</a></li></ul>`,
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

## Tìm màn hình này
Ở **thanh menu bên trái**, bấm nhóm **AI Chatbot** cho nó mở ra, rồi chọn mục **Lịch sử trò chuyện**.

[ẢNH: menu bên trái đang mở nhóm AI Chatbot, khoanh đỏ mục "Lịch sử trò chuyện"]

Đừng tìm mục nào tên "Hộp thư" — trong menu nó mang tên **Lịch sử trò chuyện**. Chỉ **chủ tài khoản** dùng được.

[ẢNH: toàn màn hình Lịch sử trò chuyện, cột trái là danh sách hội thoại, cột phải là nội dung chat]

## Đọc màn hình này
- **Cột trái** — danh sách hội thoại, mới nhất lên trên. Số tròn màu là tin **chưa đọc**.
- **Cột phải** — nội dung trao đổi. Tin của khách, của AI và của bạn nằm chung một dòng thời gian.
- **Bộ lọc trên đầu** — lọc theo kênh khi chỉ muốn xem riêng Zalo hoặc riêng website.

[ẢNH: khoanh đỏ ba khu vực trên màn hình — cột danh sách bên trái, khung chat bên phải, hàng bộ lọc kênh ở trên đầu]

Số chưa đọc chỉ mất đi khi **chính bạn mở hội thoại đó trên web**. Bot trả lời không làm mất dấu chưa đọc — nên đây là chỗ đáng tin để rà cuối ngày, kể cả khi ứng dụng Zalo trên điện thoại đã hiện là đã đọc.

## Khi bạn muốn tự trả lời
Gõ thẳng vào ô trả lời ở đáy khung chat bên phải rồi gửi. **AI tự dừng lại** cho hội thoại đó ngay khi bạn chen vào — để bot không nói chồng lên bạn giữa chừng.

[ẢNH: đáy khung chat, khoanh đỏ ô nhập câu trả lời]

Hội thoại đang dừng sẽ có nhãn **AI đang tạm dừng** hiện lên. Muốn bot làm việc lại thì gạt **công tắc AI** nằm trên đầu khung chat bên phải.

[ẢNH: đầu khung chat, khoanh đỏ nhãn "AI đang tạm dừng" và công tắc AI bên cạnh]

> Mặc định AI **không tự bật lại**. Nếu muốn nó tự tiếp quản sau một lúc bạn không trả lời nữa, hãy bật tuỳ chọn tự bật lại AI trong phần cài đặt — nên để **30 phút**.

Đây cũng là nguyên nhân phổ biến nhất của tình trạng "hôm qua bot trả lời, hôm nay im": bạn đã trả lời tay người đó một lần, và bot dừng vĩnh viễn với riêng họ.

## Nhắn từ Zalo trên điện thoại
Tin bạn gõ thẳng trong ứng dụng Zalo cũng hiện ở đây và cũng làm AI tạm dừng, y như khi trả lời trên web.

## Tệp và ảnh đã gửi
Ảnh và tệp đính kèm dùng trong các cuộc trò chuyện nằm ở một mục riêng: **menu bên trái** → nhóm **AI Chatbot** → **Thư viện media**, ngay dưới **Lịch sử trò chuyện**.

[ẢNH: menu bên trái, nhóm AI Chatbot đang mở, khoanh đỏ mục "Thư viện media" ở cuối nhóm]

## Liên quan
- [Chatbot AI trả lời khách tự động](chatbot)
- [Thêm tài khoản Zalo](zalo-account)
- [Vì sao Zalo gửi chậm](zalo-gui-cham)`,
    body_html: `<h2>Hộp thư hợp nhất</h2><p>Khách nhắn từ đâu cũng đổ về một màn hình: website, Zalo OA, Facebook Messenger, Zalo cá nhân.</p><h3>Tìm màn hình này</h3><p>Ở <strong>thanh menu bên trái</strong>, bấm nhóm <strong>AI Chatbot</strong> cho nó mở ra, rồi chọn mục <strong>Lịch sử trò chuyện</strong>.</p><p>[ẢNH: menu bên trái đang mở nhóm AI Chatbot, khoanh đỏ mục &quot;Lịch sử trò chuyện&quot;]</p><p>Đừng tìm mục nào tên &quot;Hộp thư&quot; — trong menu nó mang tên <strong>Lịch sử trò chuyện</strong>. Chỉ <strong>chủ tài khoản</strong> dùng được.</p><p>[ẢNH: toàn màn hình Lịch sử trò chuyện, cột trái là danh sách hội thoại, cột phải là nội dung chat]</p><h3>Đọc màn hình này</h3><ul><li><strong>Cột trái</strong> — danh sách hội thoại, mới nhất lên trên. Số tròn màu là tin <strong>chưa đọc</strong>.</li><li><strong>Cột phải</strong> — nội dung trao đổi. Tin của khách, của AI và của bạn nằm chung một dòng thời gian.</li><li><strong>Bộ lọc trên đầu</strong> — lọc theo kênh khi chỉ muốn xem riêng Zalo hoặc riêng website.</li></ul><p>[ẢNH: khoanh đỏ ba khu vực trên màn hình — cột danh sách bên trái, khung chat bên phải, hàng bộ lọc kênh ở trên đầu]</p><p>Số chưa đọc chỉ mất đi khi <strong>chính bạn mở hội thoại đó trên web</strong>. Bot trả lời không làm mất dấu chưa đọc — nên đây là chỗ đáng tin để rà cuối ngày, kể cả khi ứng dụng Zalo trên điện thoại đã hiện là đã đọc.</p><h3>Khi bạn muốn tự trả lời</h3><p>Gõ thẳng vào ô trả lời ở đáy khung chat bên phải rồi gửi. <strong>AI tự dừng lại</strong> cho hội thoại đó ngay khi bạn chen vào — để bot không nói chồng lên bạn giữa chừng.</p><p>[ẢNH: đáy khung chat, khoanh đỏ ô nhập câu trả lời]</p><p>Hội thoại đang dừng sẽ có nhãn <strong>AI đang tạm dừng</strong> hiện lên. Muốn bot làm việc lại thì gạt <strong>công tắc AI</strong> nằm trên đầu khung chat bên phải.</p><p>[ẢNH: đầu khung chat, khoanh đỏ nhãn &quot;AI đang tạm dừng&quot; và công tắc AI bên cạnh]</p><blockquote><p>Mặc định AI <strong>không tự bật lại</strong>. Nếu muốn nó tự tiếp quản sau một lúc bạn không trả lời nữa, hãy bật tuỳ chọn tự bật lại AI trong phần cài đặt — nên để <strong>30 phút</strong>.</p></blockquote><p>Đây cũng là nguyên nhân phổ biến nhất của tình trạng &quot;hôm qua bot trả lời, hôm nay im&quot;: bạn đã trả lời tay người đó một lần, và bot dừng vĩnh viễn với riêng họ.</p><h3>Nhắn từ Zalo trên điện thoại</h3><p>Tin bạn gõ thẳng trong ứng dụng Zalo cũng hiện ở đây và cũng làm AI tạm dừng, y như khi trả lời trên web.</p><h3>Tệp và ảnh đã gửi</h3><p>Ảnh và tệp đính kèm dùng trong các cuộc trò chuyện nằm ở một mục riêng: <strong>menu bên trái</strong> → nhóm <strong>AI Chatbot</strong> → <strong>Thư viện media</strong>, ngay dưới <strong>Lịch sử trò chuyện</strong>.</p><p>[ẢNH: menu bên trái, nhóm AI Chatbot đang mở, khoanh đỏ mục &quot;Thư viện media&quot; ở cuối nhóm]</p><h3>Liên quan</h3><ul><li><a href="/huong-dan/chatbot">Chatbot AI trả lời khách tự động</a></li><li><a href="/huong-dan/zalo-account">Thêm tài khoản Zalo</a></li><li><a href="/huong-dan/zalo-gui-cham">Vì sao Zalo gửi chậm</a></li></ul>`,
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

## Tìm trang này trên màn hình
Ở **thanh menu bên trái**, bấm vào nhóm **Landing page** cho nó mở ra. Bên trong có ba mục — chọn mục **Tạo Landing page**.

[ẢNH: menu bên trái đang mở nhóm Landing page, khoanh đỏ mục "Tạo Landing page"]

Lưu ý kẻo nhầm: nhóm ngoài và mục con **không cùng tên**. Nhóm tên *Landing page*, mục cần bấm tên *Tạo Landing page*. Bấm vào tên nhóm chỉ mở nhóm ra chứ chưa vào trang nào.

[ẢNH: trang danh sách landing page, thấy các trang đã tạo kèm trạng thái đã xuất bản]

## Tạo trang mới
Bấm nút tạo trang mới. Màn hình mở ra **trình soạn trang**: bên trái là khung chat **AI Assistant**, bên phải là phần **Xem trước**. Khi trang còn trống, giữa màn hình có ba lựa chọn:

| Lựa chọn | Hợp khi |
|---|---|
| **Nhờ AI tạo** | Chưa có gì trong tay. Gõ mô tả vào khung chat, AI dựng cả trang |
| **Chọn mẫu** | Muốn bố cục chuẩn rồi tự sửa chữ |
| **Dán HTML có sẵn** | Đã có trang làm ở nơi khác, muốn đưa về đây |

[ẢNH: trình soạn trang còn trống, khoanh đỏ ba lựa chọn Dán HTML có sẵn / Nhờ AI tạo / Chọn mẫu]

Đặt tên trang ở ô tên trên cùng rồi bấm **Lưu**. Chưa có tên thì chưa lưu được.

## Sửa trang bằng cách nói chuyện với AI
Gõ điều bạn muốn đổi vào khung chat, ví dụ *"đổi nền sang màu xanh đậm, thêm phần cảm nhận học viên"*. AI **chỉ sửa đúng phần bạn mô tả** và cập nhật ngay vào phần xem trước. Không ưng thì bấm **Hoàn tác** ngay trong chat để lấy lại bản trước khi AI sửa.

Vài việc làm được ngay bằng chat, không cần mở cài đặt: đổi tên trang, đặt slug, bật hoặc tắt xuất bản, đặt tên miền riêng, bật hoặc tắt một trường trong form.

Bấm **Đính kèm tệp** trong khung chat để gửi ảnh (PNG, JPG, WebP, GIF, HEIC) hoặc tài liệu (PDF, Word, Excel, PowerPoint, TXT, CSV); AI dùng chúng khi dựng trang. Muốn ảnh nằm đúng chỗ như logo hay banner đầu trang thì nói rõ trong chat.

[ẢNH: khung chat AI Assistant bên trái, khoanh đỏ nút Đính kèm tệp và nút Hoàn tác]

## Các nút trên thanh công cụ
| Nút | Để làm gì |
|---|---|
| **Nhập HTML** | Dán mã hoặc chọn tệp .html để thay toàn bộ trang. Trang đang có nội dung thì hệ thống hỏi lại trước khi thay, và có **Hoàn tác** |
| **Template** | Chọn một mẫu có sẵn |
| **Trình chỉnh sửa khối** | Sửa từng khối bằng tay, không cần chat |
| **Lịch sử** | Xem và khôi phục các phiên bản đã lưu, chỉ có với trang đã lưu |
| **Cài đặt** | Bốn mục: Thông tin trang, Tên miền & URL, Form đăng ký, Ảnh của trang |
| **Lưu** | Lưu trang |

Phía trên phần xem trước có nút đổi khổ **Desktop / Tablet / Mobile**, tab **Mã HTML** và nút **Mở trong tab mới**.

[ẢNH: thanh công cụ của trình soạn, khoanh đỏ các nút Nhập HTML, Template, Trình chỉnh sửa khối, Lịch sử, Cài đặt, Lưu]

> Không muốn mở trình soạn? Bạn dựng trang ngay trong khung chat của Trợ lý AI cũng được, xem [Dựng landing page bằng Trợ lý AI](tro-ly-ai-landing).

## Form thu thông tin khách
Mỗi trang có sẵn một vị trí đặt form đăng ký. Khách điền xong, thông tin chảy về mục **Khách hàng từ Landing page** — vẫn ở nhóm **Landing page** trong menu bên trái, là mục đầu tiên của nhóm.

[ẢNH: menu bên trái, nhóm Landing page đang mở, khoanh đỏ mục "Khách hàng từ Landing page"]

Muốn thêm bớt trường của form thì bấm **Cài đặt** rồi mở mục **Form đăng ký**: ở đó bật tắt được Nghề nghiệp, Lĩnh vực và thêm trường tuỳ chỉnh. Trang đã dựng mà thiếu ô cho trường mới thì bấm **Nhờ AI thêm ô này**.

Đừng xoá khối form khi sửa trang — mất nó là trang không thu được ai nữa.

[ẢNH: khối form đăng ký trên trang, khoanh đỏ để người đọc nhận ra khối nào không được xoá]

## Tên miền riêng
Trang mặc định chạy trên tên miền phụ của hệ thống. Muốn dùng tên miền của bạn thì bấm **Cài đặt** trong trình soạn, mở mục **Tên miền & URL**, khai tên miền, rồi trỏ DNS theo hướng dẫn hiện trên màn hình. Chứng chỉ bảo mật được cấp tự động sau khi DNS trỏ đúng.

[ẢNH: phần cài đặt tên miền riêng, thấy ô nhập tên miền và bảng hướng dẫn trỏ DNS]

## Liên quan
- [Dựng landing page bằng Trợ lý AI](tro-ly-ai-landing)
- [Biểu mẫu: thu thông tin, chia sẻ và nhúng vào website](bieu-mau)
- [Hồ sơ doanh nghiệp](ai-profile)
- [Tạo chiến dịch](campaign-create)
- [Khách hàng](khach-hang)`,
    body_html: `<h2>Landing page thu khách hàng</h2><p>Trang giới thiệu kèm form đăng ký, dùng để chạy quảng cáo hoặc gắn vào chiến dịch. Không cần biết code.</p><h3>Tìm trang này trên màn hình</h3><p>Ở <strong>thanh menu bên trái</strong>, bấm vào nhóm <strong>Landing page</strong> cho nó mở ra. Bên trong có ba mục — chọn mục <strong>Tạo Landing page</strong>.</p><p>[ẢNH: menu bên trái đang mở nhóm Landing page, khoanh đỏ mục &quot;Tạo Landing page&quot;]</p><p>Lưu ý kẻo nhầm: nhóm ngoài và mục con <strong>không cùng tên</strong>. Nhóm tên <em>Landing page</em>, mục cần bấm tên <em>Tạo Landing page</em>. Bấm vào tên nhóm chỉ mở nhóm ra chứ chưa vào trang nào.</p><p>[ẢNH: trang danh sách landing page, thấy các trang đã tạo kèm trạng thái đã xuất bản]</p><h3>Tạo trang mới</h3><p>Bấm nút tạo trang mới. Màn hình mở ra <strong>trình soạn trang</strong>: bên trái là khung chat <strong>AI Assistant</strong>, bên phải là phần <strong>Xem trước</strong>. Khi trang còn trống, giữa màn hình có ba lựa chọn:</p><table><thead><tr><th>Lựa chọn</th><th>Hợp khi</th></tr></thead><tbody><tr><td><strong>Nhờ AI tạo</strong></td><td>Chưa có gì trong tay. Gõ mô tả vào khung chat, AI dựng cả trang</td></tr><tr><td><strong>Chọn mẫu</strong></td><td>Muốn bố cục chuẩn rồi tự sửa chữ</td></tr><tr><td><strong>Dán HTML có sẵn</strong></td><td>Đã có trang làm ở nơi khác, muốn đưa về đây</td></tr></tbody></table><p>[ẢNH: trình soạn trang còn trống, khoanh đỏ ba lựa chọn Dán HTML có sẵn / Nhờ AI tạo / Chọn mẫu]</p><p>Đặt tên trang ở ô tên trên cùng rồi bấm <strong>Lưu</strong>. Chưa có tên thì chưa lưu được.</p><h3>Sửa trang bằng cách nói chuyện với AI</h3><p>Gõ điều bạn muốn đổi vào khung chat, ví dụ <em>&quot;đổi nền sang màu xanh đậm, thêm phần cảm nhận học viên&quot;</em>. AI <strong>chỉ sửa đúng phần bạn mô tả</strong> và cập nhật ngay vào phần xem trước. Không ưng thì bấm <strong>Hoàn tác</strong> ngay trong chat để lấy lại bản trước khi AI sửa.</p><p>Vài việc làm được ngay bằng chat, không cần mở cài đặt: đổi tên trang, đặt slug, bật hoặc tắt xuất bản, đặt tên miền riêng, bật hoặc tắt một trường trong form.</p><p>Bấm <strong>Đính kèm tệp</strong> trong khung chat để gửi ảnh (PNG, JPG, WebP, GIF, HEIC) hoặc tài liệu (PDF, Word, Excel, PowerPoint, TXT, CSV); AI dùng chúng khi dựng trang. Muốn ảnh nằm đúng chỗ như logo hay banner đầu trang thì nói rõ trong chat.</p><p>[ẢNH: khung chat AI Assistant bên trái, khoanh đỏ nút Đính kèm tệp và nút Hoàn tác]</p><h3>Các nút trên thanh công cụ</h3><table><thead><tr><th>Nút</th><th>Để làm gì</th></tr></thead><tbody><tr><td><strong>Nhập HTML</strong></td><td>Dán mã hoặc chọn tệp .html để thay toàn bộ trang. Trang đang có nội dung thì hệ thống hỏi lại trước khi thay, và có <strong>Hoàn tác</strong></td></tr><tr><td><strong>Template</strong></td><td>Chọn một mẫu có sẵn</td></tr><tr><td><strong>Trình chỉnh sửa khối</strong></td><td>Sửa từng khối bằng tay, không cần chat</td></tr><tr><td><strong>Lịch sử</strong></td><td>Xem và khôi phục các phiên bản đã lưu, chỉ có với trang đã lưu</td></tr><tr><td><strong>Cài đặt</strong></td><td>Bốn mục: Thông tin trang, Tên miền &amp; URL, Form đăng ký, Ảnh của trang</td></tr><tr><td><strong>Lưu</strong></td><td>Lưu trang</td></tr></tbody></table><p>Phía trên phần xem trước có nút đổi khổ <strong>Desktop / Tablet / Mobile</strong>, tab <strong>Mã HTML</strong> và nút <strong>Mở trong tab mới</strong>.</p><p>[ẢNH: thanh công cụ của trình soạn, khoanh đỏ các nút Nhập HTML, Template, Trình chỉnh sửa khối, Lịch sử, Cài đặt, Lưu]</p><blockquote><p>Không muốn mở trình soạn? Bạn dựng trang ngay trong khung chat của Trợ lý AI cũng được, xem <a href="/huong-dan/tro-ly-ai-landing">Dựng landing page bằng Trợ lý AI</a>.</p></blockquote><h3>Form thu thông tin khách</h3><p>Mỗi trang có sẵn một vị trí đặt form đăng ký. Khách điền xong, thông tin chảy về mục <strong>Khách hàng từ Landing page</strong> — vẫn ở nhóm <strong>Landing page</strong> trong menu bên trái, là mục đầu tiên của nhóm.</p><p>[ẢNH: menu bên trái, nhóm Landing page đang mở, khoanh đỏ mục &quot;Khách hàng từ Landing page&quot;]</p><p>Muốn thêm bớt trường của form thì bấm <strong>Cài đặt</strong> rồi mở mục <strong>Form đăng ký</strong>: ở đó bật tắt được Nghề nghiệp, Lĩnh vực và thêm trường tuỳ chỉnh. Trang đã dựng mà thiếu ô cho trường mới thì bấm <strong>Nhờ AI thêm ô này</strong>.</p><p>Đừng xoá khối form khi sửa trang — mất nó là trang không thu được ai nữa.</p><p>[ẢNH: khối form đăng ký trên trang, khoanh đỏ để người đọc nhận ra khối nào không được xoá]</p><h3>Tên miền riêng</h3><p>Trang mặc định chạy trên tên miền phụ của hệ thống. Muốn dùng tên miền của bạn thì bấm <strong>Cài đặt</strong> trong trình soạn, mở mục <strong>Tên miền &amp; URL</strong>, khai tên miền, rồi trỏ DNS theo hướng dẫn hiện trên màn hình. Chứng chỉ bảo mật được cấp tự động sau khi DNS trỏ đúng.</p><p>[ẢNH: phần cài đặt tên miền riêng, thấy ô nhập tên miền và bảng hướng dẫn trỏ DNS]</p><h3>Liên quan</h3><ul><li><a href="/huong-dan/tro-ly-ai-landing">Dựng landing page bằng Trợ lý AI</a></li><li><a href="/huong-dan/bieu-mau">Biểu mẫu: thu thông tin, chia sẻ và nhúng vào website</a></li><li><a href="/huong-dan/ai-profile">Hồ sơ doanh nghiệp</a></li><li><a href="/huong-dan/campaign-create">Tạo chiến dịch</a></li><li><a href="/huong-dan/khach-hang">Khách hàng</a></li></ul>`,
  },
  {
    slug: 'nhan-vien',
    feature_key: 'nhan-vien',
    primary_route: '/app/settings/employees',
    sort_order: 110,
    title: 'Nhân viên & phân quyền',
    summary: 'Thêm người vào nhóm: người mới có sẵn hai quyền chỉ xem, phần còn lại bạn tự cấp. Kèm cách nhân viên chuyển sang không gian công ty và cách xử lý khi nhân viên không thấy chiến dịch của công ty.',
    body_md: `# Nhân viên & phân quyền
Thêm người trong nhóm vào cùng làm trong không gian của bạn, mỗi người chỉ thấy phần việc bạn cho phép. Người vừa được thêm có sẵn **hai quyền chỉ xem**: xem chiến dịch và mở trang Tổng quan — nên họ vào là thấy việc của công ty ngay. Những phần còn lại (sửa, gửi, khách hàng, Trợ lý AI…) bạn tự tick trong màn **Phân quyền**.

## Tìm trang này trên màn hình
Ở **thanh menu bên trái**, kéo xuống cuối, mở nhóm **Cài đặt** rồi chọn mục **Nhân viên** — nó nằm ngay dưới **Hồ sơ doanh nghiệp**.

[ẢNH: menu bên trái đang mở nhóm Cài đặt, khoanh đỏ mục "Nhân viên"]

Cả nhóm **Cài đặt** chỉ **chủ tài khoản** mới thấy.

Trong danh sách, cột **Quyền** cho biết mỗi người đang có bao nhiêu quyền. Người chưa có quyền nào hiện nhãn vàng **Chưa cấp quyền**; bấm vào nhãn là mở thẳng màn phân quyền của người đó.

[ẢNH: trang Nhân viên, danh sách người đã thêm kèm cột quyền đã cấp]

## Bước 1 — Thêm người
Bấm **Thêm nhân viên**. Hộp thoại có hai tab, chọn theo việc người đó **đã có tài khoản Founder AI hay chưa**:

| Tab | Dùng khi | Bạn nhập gì |
|---|---|---|
| **Tạo tài khoản mới** | Email của họ **chưa** đăng ký Founder AI | Tên đăng nhập, email, họ tên |
| **Link tài khoản có sẵn** | Họ **đã** có tài khoản Founder AI | Đúng email họ dùng để đăng ký |

[ẢNH: hộp thoại Thêm nhân viên, khoanh đỏ hai tab "Tạo tài khoản mới" và "Link tài khoản có sẵn"]

Với **Tạo tài khoản mới**, hệ thống gửi thư mời tới email đó. Nhân viên bấm link trong thư để tự đặt mật khẩu; link có hiệu lực **48 giờ**. Trong lúc chờ, cột trạng thái ghi **Chờ kích hoạt**. Thư thất lạc hoặc quá hạn thì bấm vào nhân viên đó rồi bấm **Gửi lại lời mời**.

[ẢNH: hộp thoại thêm nhân viên, khoanh đỏ ô nhập email]

Người được thêm bằng **Link tài khoản có sẵn** vẫn giữ nguyên tài khoản và dữ liệu riêng của họ. Một người có thể là nhân viên của nhiều doanh nghiệp cùng lúc.

### Thêm không được — ba trường hợp hay gặp
- **Email đã có tài khoản Founder AI**: hộp thoại tự chuyển sang tab **Link tài khoản có sẵn** và điền sẵn email đó. Bạn chỉ cần bấm nút liên kết.
- **Không tìm thấy tài khoản với email này** (ở tab Link): họ chưa đăng ký, hoặc đăng ký bằng email khác. Hỏi lại đúng email, hoặc dùng tab **Tạo tài khoản mới**.
- **Tên đăng nhập này đã có người dùng**: tên đăng nhập dùng chung cho toàn hệ thống, chỉ gồm chữ cái và số, không dấu, không khoảng trắng. Đổi tên khác, ví dụ thêm tên công ty phía sau.

Số nhân viên tối đa phụ thuộc gói đang dùng. Hết suất thì mua thêm: mở nhóm **Gói & Thanh toán** → **Mua thêm hạn mức**.

## Bước 2 — Cấp quyền (bắt buộc)
**Nhân viên mới chỉ có hai quyền xem** (Chiến dịch — xem, Báo cáo & Thống kê). Vì vậy thêm xong, màn **Phân quyền** của người đó tự mở ra để bạn tick tiếp phần họ cần làm. Tick xong bấm **Lưu quyền hạn**. Lỡ đóng mất thì bấm vào dòng nhân viên trong danh sách rồi chọn tab **Phân quyền**.

Hàng **Chọn nhanh** giúp tick một lượt, sau đó bạn vẫn chỉnh từng ô được:

| Nút | Tick sẵn những gì |
|---|---|
| **Chỉ xem** | Xem chiến dịch, báo cáo, khách hàng, leads. Không sửa, không gửi, không dùng Trợ lý AI |
| **Làm marketing** | Ba quyền chiến dịch, mẫu tin nhắn, landing pages, biểu mẫu, khách hàng, leads, báo cáo và Trợ lý AI |
| **Tất cả** | Mọi quyền |
| **Bỏ hết** | Bỏ mọi dấu tick |

Các nút này chỉ tick ô, **chưa lưu**. Phải bấm **Lưu quyền hạn** thì mới có hiệu lực.

Muốn nhân viên **thấy các chiến dịch của công ty**, cần quyền **Chiến dịch — xem**. Tick **Chiến dịch — tạo** hoặc **Chiến dịch — chạy** thì quyền xem tự bật kèm.

[ẢNH: bảng cấp quyền của một nhân viên, khoanh đỏ ba dòng quyền chiến dịch tách riêng]

Ba quyền chiến dịch tách riêng có chủ đích: bạn cấp được quyền *tạo* cho người soạn nội dung mà không cho họ *bấm chạy* — tránh gửi nhầm hàng nghìn tin.

| Quyền | Cho phép làm gì |
|---|---|
| Chiến dịch — xem | Xem danh sách, sơ đồ và kết quả các chiến dịch của công ty |
| Chiến dịch — tạo | Tạo, sửa, nhân bản chiến dịch; dùng Gửi nhanh |
| Chiến dịch — chạy | Bấm chạy, tạm dừng chiến dịch |
| Quản lý kênh gửi | Kết nối, sửa tài khoản email và Zalo |
| Mẫu tin nhắn | Tạo và sửa mẫu email, mẫu Zalo |
| Khách hàng | Xem và sửa danh sách khách |
| Leads landing page | Xem thông tin khách để lại từ landing page |
| Landing pages | Tạo và sửa landing page |
| Biểu mẫu thu thập | Tạo biểu mẫu, xem bài nộp |
| Báo cáo & Thống kê | Mở trang Tổng quan |
| Sử dụng Trợ lý AI | Trò chuyện với trợ lý AI, dùng credits AI của công ty |
| Quản lý Chatbot & kho kiến thức | Mở mục Tạo AI Chatbot, sửa chatbot và kho kiến thức |
| Hộp thư — xem | Mở mục Lịch sử trò chuyện |
| Thư viện media — xem | Mở mục Thư viện media |
| Quản lý sản phẩm | Quản lý danh mục sản phẩm |

Tab **Giới hạn** ngay bên cạnh cho đặt trần số email, tin Zalo và credits AI mỗi ngày, mỗi tháng cho từng người. Để trống là không giới hạn.

Cuối trang có ô **Duyệt chiến dịch lớn**: chiến dịch của nhân viên có từ số người nhận bạn đặt trở lên sẽ phải chờ bạn duyệt trước khi gửi.

## Nhân viên đăng nhập thì vào đâu
Có hai trường hợp:

- **Nhân viên được mời bằng email mới** (chưa có gói riêng): đăng nhập là vào thẳng không gian của công ty bạn.
- **Nhân viên đã có tài khoản Founder AI riêng**: đăng nhập vẫn vào **tài khoản của chính họ**. Trên đầu trang hiện một dải thông báo **Bạn là nhân viên của …** kèm nút **Vào không gian của …**; bấm nút đó là sang không gian công ty.

[ẢNH: dải thông báo trên đầu trang của nhân viên, khoanh đỏ nút Vào không gian của công ty]

Muốn đổi qua lại bất cứ lúc nào, nhân viên bấm vào **ảnh đại diện ở góc trên bên phải**, tìm mục **Không gian làm việc** rồi chọn **Nhân viên của …** để vào công ty, hoặc **Tài khoản của tôi** để quay về.

[ẢNH: menu ảnh đại diện góc trên bên phải của nhân viên, khoanh đỏ mục Không gian làm việc và dòng Nhân viên của công ty]

Cách nhận biết đang ở đâu: dòng chữ nhỏ dưới tên ở góc phải ghi **Nhân viên** là đang ở không gian công ty, ghi **Chủ tài khoản** là đang ở tài khoản của mình.

Nhân viên **không cần đăng xuất hay tải lại trang** để nhận thay đổi. Quyền mới hoặc lời mời mới tự hiện ra khi họ quay lại tab sau khoảng một phút, khi mở menu ảnh đại diện, hoặc khi bấm nút **Tôi đã được cấp quyền — kiểm tra lại**.

## Nhân viên báo không thấy chiến dịch của công ty — kiểm theo thứ tự
1. **Quyền "Chiến dịch — xem" còn không?** Người mới thêm có sẵn quyền này, nhưng nếu đã có ai bỏ tick thì cột **Quyền** trong danh sách sẽ không còn nó. Bấm vào dòng nhân viên, sang tab **Phân quyền**, tick lại rồi bấm **Lưu quyền hạn**.
2. **Nhân viên đang ở đúng không gian chưa?** Người có tài khoản riêng phải bấm nút **Vào không gian của …** trên dải thông báo, hoặc chọn công ty trong menu ảnh đại diện.
3. **Nhân viên đã bấm kiểm tra lại chưa?** Ở màn **Bạn chưa được cấp quyền nào**, bấm **Tôi đã được cấp quyền — kiểm tra lại**.
4. **Nhân viên có bị khoá không?** Cột trạng thái ghi **Đã khóa** thì bấm vào nhân viên rồi bấm **Mở khóa**.
5. **Gói của chủ tài khoản còn hạn không?** Gói hết hạn thì nhân viên cũng bị chặn theo.

Nhân viên chưa có quyền nào sẽ thấy thẻ **Bạn chưa được cấp quyền nào** ở giữa trang, kèm hướng dẫn nhờ chủ tài khoản cấp quyền. Nhân viên có quyền khác nhưng chưa có quyền **Sử dụng Trợ lý AI** thì ở trang đầu thấy thẻ **Trợ lý AI chưa được bật cho bạn**; các mục họ được dùng vẫn nằm đủ ở menu bên trái.

[ẢNH: menu bên trái của nhân viên sau khi được cấp quyền Chiến dịch — xem, đã hiện mục Quản lý chiến dịch]

## Đặt lại mật khẩu cho nhân viên
Bấm vào nhân viên rồi bấm **Reset mật khẩu**. Hệ thống tạo một **mật khẩu tạm** và hiện ra cho bạn **đúng một lần**, kèm nút **Sao chép**. Gửi mật khẩu đó cho nhân viên; lần đăng nhập đầu tiên họ bị buộc đổi sang mật khẩu mới.

## Vì sao nhân viên không vào được vài màn hình
Một số phần **chỉ dành cho chủ tài khoản**, không cấp quyền được cho ai:

| Phần | Nằm ở đâu trong menu |
|---|---|
| Hồ sơ doanh nghiệp | **Cài đặt → Hồ sơ doanh nghiệp** |
| Chính trang Nhân viên này | **Cài đặt → Nhân viên** |
| Nhật ký hoạt động | **Cài đặt → Nhật ký hoạt động** |
| Gói, thanh toán, mua thêm | **Gói & Thanh toán** (cả nhóm) |
| Chương trình đối tác | Mục **Chương trình đối tác** |

Đây là thiết kế, không phải lỗi phân quyền. Những phần đó đụng tới tiền hoặc tới toàn bộ không gian làm việc.

Các phần còn lại hiện trong menu của nhân viên **đúng theo quyền đã cấp**. Mở vào một trang chưa được cấp quyền thì màn hình ghi rõ công ty chưa cấp quyền đó.

## Gỡ một người khỏi nhóm
Bấm vào nhân viên rồi bấm **Xóa khỏi nhóm**. Tài khoản của họ vẫn còn, chỉ là không còn truy cập được dữ liệu của bạn nữa. Riêng người còn đang **Chờ kích hoạt** thì tài khoản bị xoá hẳn, email đó dùng lại được.

## Liên quan
- [Gói dịch vụ & thanh toán](plan-and-billing)
- [Kết nối kênh gửi](channels)
- [Tạo chiến dịch](campaign-create)
- [Nhật ký hoạt động](nhat-ky-hoat-dong)`,
    body_html: `<h2>Nhân viên &amp; phân quyền</h2><p>Thêm người trong nhóm vào cùng làm trong không gian của bạn, mỗi người chỉ thấy phần việc bạn cho phép. Người vừa được thêm có sẵn <strong>hai quyền chỉ xem</strong>: xem chiến dịch và mở trang Tổng quan — nên họ vào là thấy việc của công ty ngay. Những phần còn lại (sửa, gửi, khách hàng, Trợ lý AI…) bạn tự tick trong màn <strong>Phân quyền</strong>.</p><h3>Tìm trang này trên màn hình</h3><p>Ở <strong>thanh menu bên trái</strong>, kéo xuống cuối, mở nhóm <strong>Cài đặt</strong> rồi chọn mục <strong>Nhân viên</strong> — nó nằm ngay dưới <strong>Hồ sơ doanh nghiệp</strong>.</p><p>[ẢNH: menu bên trái đang mở nhóm Cài đặt, khoanh đỏ mục &quot;Nhân viên&quot;]</p><p>Cả nhóm <strong>Cài đặt</strong> chỉ <strong>chủ tài khoản</strong> mới thấy.</p><p>Trong danh sách, cột <strong>Quyền</strong> cho biết mỗi người đang có bao nhiêu quyền. Người chưa có quyền nào hiện nhãn vàng <strong>Chưa cấp quyền</strong>; bấm vào nhãn là mở thẳng màn phân quyền của người đó.</p><p>[ẢNH: trang Nhân viên, danh sách người đã thêm kèm cột quyền đã cấp]</p><h3>Bước 1 — Thêm người</h3><p>Bấm <strong>Thêm nhân viên</strong>. Hộp thoại có hai tab, chọn theo việc người đó <strong>đã có tài khoản Founder AI hay chưa</strong>:</p><table><thead><tr><th>Tab</th><th>Dùng khi</th><th>Bạn nhập gì</th></tr></thead><tbody><tr><td><strong>Tạo tài khoản mới</strong></td><td>Email của họ <strong>chưa</strong> đăng ký Founder AI</td><td>Tên đăng nhập, email, họ tên</td></tr><tr><td><strong>Link tài khoản có sẵn</strong></td><td>Họ <strong>đã</strong> có tài khoản Founder AI</td><td>Đúng email họ dùng để đăng ký</td></tr></tbody></table><p>[ẢNH: hộp thoại Thêm nhân viên, khoanh đỏ hai tab &quot;Tạo tài khoản mới&quot; và &quot;Link tài khoản có sẵn&quot;]</p><p>Với <strong>Tạo tài khoản mới</strong>, hệ thống gửi thư mời tới email đó. Nhân viên bấm link trong thư để tự đặt mật khẩu; link có hiệu lực <strong>48 giờ</strong>. Trong lúc chờ, cột trạng thái ghi <strong>Chờ kích hoạt</strong>. Thư thất lạc hoặc quá hạn thì bấm vào nhân viên đó rồi bấm <strong>Gửi lại lời mời</strong>.</p><p>[ẢNH: hộp thoại thêm nhân viên, khoanh đỏ ô nhập email]</p><p>Người được thêm bằng <strong>Link tài khoản có sẵn</strong> vẫn giữ nguyên tài khoản và dữ liệu riêng của họ. Một người có thể là nhân viên của nhiều doanh nghiệp cùng lúc.</p><h4>Thêm không được — ba trường hợp hay gặp</h4><ul><li><strong>Email đã có tài khoản Founder AI</strong>: hộp thoại tự chuyển sang tab <strong>Link tài khoản có sẵn</strong> và điền sẵn email đó. Bạn chỉ cần bấm nút liên kết.</li><li><strong>Không tìm thấy tài khoản với email này</strong> (ở tab Link): họ chưa đăng ký, hoặc đăng ký bằng email khác. Hỏi lại đúng email, hoặc dùng tab <strong>Tạo tài khoản mới</strong>.</li><li><strong>Tên đăng nhập này đã có người dùng</strong>: tên đăng nhập dùng chung cho toàn hệ thống, chỉ gồm chữ cái và số, không dấu, không khoảng trắng. Đổi tên khác, ví dụ thêm tên công ty phía sau.</li></ul><p>Số nhân viên tối đa phụ thuộc gói đang dùng. Hết suất thì mua thêm: mở nhóm <strong>Gói &amp; Thanh toán</strong> → <strong>Mua thêm hạn mức</strong>.</p><h3>Bước 2 — Cấp quyền (bắt buộc)</h3><p><strong>Nhân viên mới chỉ có hai quyền xem</strong> (Chiến dịch — xem, Báo cáo &amp; Thống kê). Vì vậy thêm xong, màn <strong>Phân quyền</strong> của người đó tự mở ra để bạn tick tiếp phần họ cần làm. Tick xong bấm <strong>Lưu quyền hạn</strong>. Lỡ đóng mất thì bấm vào dòng nhân viên trong danh sách rồi chọn tab <strong>Phân quyền</strong>.</p><p>Hàng <strong>Chọn nhanh</strong> giúp tick một lượt, sau đó bạn vẫn chỉnh từng ô được:</p><table><thead><tr><th>Nút</th><th>Tick sẵn những gì</th></tr></thead><tbody><tr><td><strong>Chỉ xem</strong></td><td>Xem chiến dịch, báo cáo, khách hàng, leads. Không sửa, không gửi, không dùng Trợ lý AI</td></tr><tr><td><strong>Làm marketing</strong></td><td>Ba quyền chiến dịch, mẫu tin nhắn, landing pages, biểu mẫu, khách hàng, leads, báo cáo và Trợ lý AI</td></tr><tr><td><strong>Tất cả</strong></td><td>Mọi quyền</td></tr><tr><td><strong>Bỏ hết</strong></td><td>Bỏ mọi dấu tick</td></tr></tbody></table><p>Các nút này chỉ tick ô, <strong>chưa lưu</strong>. Phải bấm <strong>Lưu quyền hạn</strong> thì mới có hiệu lực.</p><p>Muốn nhân viên <strong>thấy các chiến dịch của công ty</strong>, cần quyền <strong>Chiến dịch — xem</strong>. Tick <strong>Chiến dịch — tạo</strong> hoặc <strong>Chiến dịch — chạy</strong> thì quyền xem tự bật kèm.</p><p>[ẢNH: bảng cấp quyền của một nhân viên, khoanh đỏ ba dòng quyền chiến dịch tách riêng]</p><p>Ba quyền chiến dịch tách riêng có chủ đích: bạn cấp được quyền <em>tạo</em> cho người soạn nội dung mà không cho họ <em>bấm chạy</em> — tránh gửi nhầm hàng nghìn tin.</p><table><thead><tr><th>Quyền</th><th>Cho phép làm gì</th></tr></thead><tbody><tr><td>Chiến dịch — xem</td><td>Xem danh sách, sơ đồ và kết quả các chiến dịch của công ty</td></tr><tr><td>Chiến dịch — tạo</td><td>Tạo, sửa, nhân bản chiến dịch; dùng Gửi nhanh</td></tr><tr><td>Chiến dịch — chạy</td><td>Bấm chạy, tạm dừng chiến dịch</td></tr><tr><td>Quản lý kênh gửi</td><td>Kết nối, sửa tài khoản email và Zalo</td></tr><tr><td>Mẫu tin nhắn</td><td>Tạo và sửa mẫu email, mẫu Zalo</td></tr><tr><td>Khách hàng</td><td>Xem và sửa danh sách khách</td></tr><tr><td>Leads landing page</td><td>Xem thông tin khách để lại từ landing page</td></tr><tr><td>Landing pages</td><td>Tạo và sửa landing page</td></tr><tr><td>Biểu mẫu thu thập</td><td>Tạo biểu mẫu, xem bài nộp</td></tr><tr><td>Báo cáo &amp; Thống kê</td><td>Mở trang Tổng quan</td></tr><tr><td>Sử dụng Trợ lý AI</td><td>Trò chuyện với trợ lý AI, dùng credits AI của công ty</td></tr><tr><td>Quản lý Chatbot &amp; kho kiến thức</td><td>Mở mục Tạo AI Chatbot, sửa chatbot và kho kiến thức</td></tr><tr><td>Hộp thư — xem</td><td>Mở mục Lịch sử trò chuyện</td></tr><tr><td>Thư viện media — xem</td><td>Mở mục Thư viện media</td></tr><tr><td>Quản lý sản phẩm</td><td>Quản lý danh mục sản phẩm</td></tr></tbody></table><p>Tab <strong>Giới hạn</strong> ngay bên cạnh cho đặt trần số email, tin Zalo và credits AI mỗi ngày, mỗi tháng cho từng người. Để trống là không giới hạn.</p><p>Cuối trang có ô <strong>Duyệt chiến dịch lớn</strong>: chiến dịch của nhân viên có từ số người nhận bạn đặt trở lên sẽ phải chờ bạn duyệt trước khi gửi.</p><h3>Nhân viên đăng nhập thì vào đâu</h3><p>Có hai trường hợp:</p><ul><li><strong>Nhân viên được mời bằng email mới</strong> (chưa có gói riêng): đăng nhập là vào thẳng không gian của công ty bạn.</li><li><strong>Nhân viên đã có tài khoản Founder AI riêng</strong>: đăng nhập vẫn vào <strong>tài khoản của chính họ</strong>. Trên đầu trang hiện một dải thông báo <strong>Bạn là nhân viên của …</strong> kèm nút <strong>Vào không gian của …</strong>; bấm nút đó là sang không gian công ty.</li></ul><p>[ẢNH: dải thông báo trên đầu trang của nhân viên, khoanh đỏ nút Vào không gian của công ty]</p><p>Muốn đổi qua lại bất cứ lúc nào, nhân viên bấm vào <strong>ảnh đại diện ở góc trên bên phải</strong>, tìm mục <strong>Không gian làm việc</strong> rồi chọn <strong>Nhân viên của …</strong> để vào công ty, hoặc <strong>Tài khoản của tôi</strong> để quay về.</p><p>[ẢNH: menu ảnh đại diện góc trên bên phải của nhân viên, khoanh đỏ mục Không gian làm việc và dòng Nhân viên của công ty]</p><p>Cách nhận biết đang ở đâu: dòng chữ nhỏ dưới tên ở góc phải ghi <strong>Nhân viên</strong> là đang ở không gian công ty, ghi <strong>Chủ tài khoản</strong> là đang ở tài khoản của mình.</p><p>Nhân viên <strong>không cần đăng xuất hay tải lại trang</strong> để nhận thay đổi. Quyền mới hoặc lời mời mới tự hiện ra khi họ quay lại tab sau khoảng một phút, khi mở menu ảnh đại diện, hoặc khi bấm nút <strong>Tôi đã được cấp quyền — kiểm tra lại</strong>.</p><h3>Nhân viên báo không thấy chiến dịch của công ty — kiểm theo thứ tự</h3><ol><li><strong>Quyền &quot;Chiến dịch — xem&quot; còn không?</strong> Người mới thêm có sẵn quyền này, nhưng nếu đã có ai bỏ tick thì cột <strong>Quyền</strong> trong danh sách sẽ không còn nó. Bấm vào dòng nhân viên, sang tab <strong>Phân quyền</strong>, tick lại rồi bấm <strong>Lưu quyền hạn</strong>.</li><li><strong>Nhân viên đang ở đúng không gian chưa?</strong> Người có tài khoản riêng phải bấm nút <strong>Vào không gian của …</strong> trên dải thông báo, hoặc chọn công ty trong menu ảnh đại diện.</li><li><strong>Nhân viên đã bấm kiểm tra lại chưa?</strong> Ở màn <strong>Bạn chưa được cấp quyền nào</strong>, bấm <strong>Tôi đã được cấp quyền — kiểm tra lại</strong>.</li><li><strong>Nhân viên có bị khoá không?</strong> Cột trạng thái ghi <strong>Đã khóa</strong> thì bấm vào nhân viên rồi bấm <strong>Mở khóa</strong>.</li><li><strong>Gói của chủ tài khoản còn hạn không?</strong> Gói hết hạn thì nhân viên cũng bị chặn theo.</li></ol><p>Nhân viên chưa có quyền nào sẽ thấy thẻ <strong>Bạn chưa được cấp quyền nào</strong> ở giữa trang, kèm hướng dẫn nhờ chủ tài khoản cấp quyền. Nhân viên có quyền khác nhưng chưa có quyền <strong>Sử dụng Trợ lý AI</strong> thì ở trang đầu thấy thẻ <strong>Trợ lý AI chưa được bật cho bạn</strong>; các mục họ được dùng vẫn nằm đủ ở menu bên trái.</p><p>[ẢNH: menu bên trái của nhân viên sau khi được cấp quyền Chiến dịch — xem, đã hiện mục Quản lý chiến dịch]</p><h3>Đặt lại mật khẩu cho nhân viên</h3><p>Bấm vào nhân viên rồi bấm <strong>Reset mật khẩu</strong>. Hệ thống tạo một <strong>mật khẩu tạm</strong> và hiện ra cho bạn <strong>đúng một lần</strong>, kèm nút <strong>Sao chép</strong>. Gửi mật khẩu đó cho nhân viên; lần đăng nhập đầu tiên họ bị buộc đổi sang mật khẩu mới.</p><h3>Vì sao nhân viên không vào được vài màn hình</h3><p>Một số phần <strong>chỉ dành cho chủ tài khoản</strong>, không cấp quyền được cho ai:</p><table><thead><tr><th>Phần</th><th>Nằm ở đâu trong menu</th></tr></thead><tbody><tr><td>Hồ sơ doanh nghiệp</td><td><strong>Cài đặt → Hồ sơ doanh nghiệp</strong></td></tr><tr><td>Chính trang Nhân viên này</td><td><strong>Cài đặt → Nhân viên</strong></td></tr><tr><td>Nhật ký hoạt động</td><td><strong>Cài đặt → Nhật ký hoạt động</strong></td></tr><tr><td>Gói, thanh toán, mua thêm</td><td><strong>Gói &amp; Thanh toán</strong> (cả nhóm)</td></tr><tr><td>Chương trình đối tác</td><td>Mục <strong>Chương trình đối tác</strong></td></tr></tbody></table><p>Đây là thiết kế, không phải lỗi phân quyền. Những phần đó đụng tới tiền hoặc tới toàn bộ không gian làm việc.</p><p>Các phần còn lại hiện trong menu của nhân viên <strong>đúng theo quyền đã cấp</strong>. Mở vào một trang chưa được cấp quyền thì màn hình ghi rõ công ty chưa cấp quyền đó.</p><h3>Gỡ một người khỏi nhóm</h3><p>Bấm vào nhân viên rồi bấm <strong>Xóa khỏi nhóm</strong>. Tài khoản của họ vẫn còn, chỉ là không còn truy cập được dữ liệu của bạn nữa. Riêng người còn đang <strong>Chờ kích hoạt</strong> thì tài khoản bị xoá hẳn, email đó dùng lại được.</p><h3>Liên quan</h3><ul><li><a href="/huong-dan/plan-and-billing">Gói dịch vụ &amp; thanh toán</a></li><li><a href="/huong-dan/channels">Kết nối kênh gửi</a></li><li><a href="/huong-dan/campaign-create">Tạo chiến dịch</a></li><li><a href="/huong-dan/nhat-ky-hoat-dong">Nhật ký hoạt động</a></li></ul>`,
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

## Bốn màn hình cần biết, tìm ở đâu

**Bảng giá** — bấm nút **Nâng cấp** trên **thanh ngang trên cùng**, phía bên phải. Đây là nút màu nổi bật, không nằm trong menu dọc bên trái.

[ẢNH: thanh ngang trên cùng, khoanh đỏ nút "Nâng cấp" bên phải]

**Trang thanh toán** — không có mục menu nào dẫn tới. Bạn chọn gói trong bảng giá, hệ thống tự đưa sang.

**Tổng quan gói** — ở **thanh menu bên trái**, mở nhóm **Gói & Thanh toán**, chọn mục **Tổng quan gói**. Đây là nơi xem hạn mức còn lại, lịch sử đơn và hoá đơn.

[ẢNH: menu bên trái đang mở nhóm Gói & Thanh toán, khoanh đỏ mục "Tổng quan gói"]

**Mua thêm hạn mức** — ngay dưới **Tổng quan gói** trong cùng nhóm đó.

[ẢNH: menu bên trái, khoanh đỏ mục "Mua thêm hạn mức"]

> Không thấy nhóm **Gói & Thanh toán** trong menu? Cả nhóm này chỉ **chủ tài khoản** thấy. Nhân viên không thấy, kể cả đã được cấp mọi quyền khác.

## Mua gói — các bước
1. Bấm **Nâng cấp** trên thanh trên cùng để mở bảng giá.
2. Chọn một gói có sẵn, hoặc kéo xuống chọn **Gói tự chọn** nếu muốn tự đặt hạn mức.

   [ẢNH: bảng giá với các gói xếp ngang, khoanh đỏ nút chọn của một gói]

3. Màn hình thanh toán hiện **mã QR** — mở app ngân hàng quét để trả.

   [ẢNH: màn hình thanh toán đang hiện mã QR PayOS]

4. Trả xong, đợi vài giây là hạn mức gói được kích hoạt. Kiểm lại ở **Gói & Thanh toán → Tổng quan gói**.

   [ẢNH: trang Tổng quan gói sau khi kích hoạt, khoanh đỏ tên gói và hạn mức mới]

## Mua thêm giữa chu kỳ
Sắp hết tin, email hay lượt AI mà chưa tới kỳ làm mới thì mở **Gói & Thanh toán → Mua thêm hạn mức**, chọn loại cần mua rồi thanh toán. Đơn tối thiểu **50.000đ**.

[ẢNH: trang Mua thêm hạn mức, khoanh đỏ các loại hạn mức mua thêm được]

Phần mua thêm **không hết hạn theo chu kỳ** — còn nguyên sang kỳ sau, tiêu tới đâu trừ tới đó.

## Hạn mức gói và phần mua thêm khác nhau thế nào
- **Hạn mức gói** làm mới mỗi kỳ. Dùng không hết thì mất, không cộng dồn.
- **Phần mua thêm** là số dư riêng, không làm mới và không mất khi sang kỳ mới.
- Hệ thống **tiêu hạn mức gói trước**, hết mới trừ vào phần mua thêm — để phần bạn đã trả tiền được giữ lâu nhất.
- Cần **gói còn hiệu lực** mới dùng được phần mua thêm. Gói hết hạn thì số dư vẫn còn nguyên, gia hạn là dùng tiếp.

## Xem lại đơn và hoá đơn ở đâu
Vào **Gói & Thanh toán → Tổng quan gói**, kéo xuống mục **Lịch sử đơn**. Ở đó có đủ đơn mua gói lẫn đơn mua thêm, bấm vào một đơn để mở hoá đơn của đơn đó.

[ẢNH: mục Lịch sử đơn trong trang Tổng quan gói, khoanh đỏ một dòng đơn và chỗ mở hoá đơn]

## Lỗi thường gặp
- **Đã trả tiền nhưng hạn mức chưa tăng** → Đợi vài phút rồi tải lại trang, hệ thống cần nhận xác nhận từ cổng thanh toán.
- **Không mua được tin Zalo** → Năng lực tính theo **số tài khoản Zalo đã kết nối**, không theo gói. Nối Zalo trước ở **Chiến dịch → Quản lý kênh gửi**.
- **Hết credit AI** → Mở **Gói & Thanh toán → Mua thêm hạn mức**, hoặc nâng gói bằng nút **Nâng cấp** trên thanh trên cùng.
- **Gói đã hết hạn, còn số dư mua thêm nhưng không gửi được** → Gia hạn gói; số dư không mất đi đâu.

## Liên quan
- [Đổi gói — nâng cấp, hạ gói, đổi kỳ hạn](doi-goi)
- [Thêm tài khoản Zalo](zalo-account)
- [Kết nối kênh gửi](channels)
- [Câu hỏi thường gặp về thanh toán](faq-billing)
`,
    body_html: `<h2>Gói dịch vụ &amp; thanh toán</h2><p>Quản lý gói thuê bao, thanh toán và mua thêm hạn mức (tin Zalo, email, lượt AI).</p><h3>Bốn màn hình cần biết, tìm ở đâu</h3><p><strong>Bảng giá</strong> — bấm nút <strong>Nâng cấp</strong> trên <strong>thanh ngang trên cùng</strong>, phía bên phải. Đây là nút màu nổi bật, không nằm trong menu dọc bên trái.</p><p>[ẢNH: thanh ngang trên cùng, khoanh đỏ nút &quot;Nâng cấp&quot; bên phải]</p><p><strong>Trang thanh toán</strong> — không có mục menu nào dẫn tới. Bạn chọn gói trong bảng giá, hệ thống tự đưa sang.</p><p><strong>Tổng quan gói</strong> — ở <strong>thanh menu bên trái</strong>, mở nhóm <strong>Gói &amp; Thanh toán</strong>, chọn mục <strong>Tổng quan gói</strong>. Đây là nơi xem hạn mức còn lại, lịch sử đơn và hoá đơn.</p><p>[ẢNH: menu bên trái đang mở nhóm Gói &amp; Thanh toán, khoanh đỏ mục &quot;Tổng quan gói&quot;]</p><p><strong>Mua thêm hạn mức</strong> — ngay dưới <strong>Tổng quan gói</strong> trong cùng nhóm đó.</p><p>[ẢNH: menu bên trái, khoanh đỏ mục &quot;Mua thêm hạn mức&quot;]</p><blockquote><p>Không thấy nhóm <strong>Gói &amp; Thanh toán</strong> trong menu? Cả nhóm này chỉ <strong>chủ tài khoản</strong> thấy. Nhân viên không thấy, kể cả đã được cấp mọi quyền khác.</p></blockquote><h3>Mua gói — các bước</h3><ol><li>Bấm <strong>Nâng cấp</strong> trên thanh trên cùng để mở bảng giá.</li><li>Chọn một gói có sẵn, hoặc kéo xuống chọn <strong>Gói tự chọn</strong> nếu muốn tự đặt hạn mức.<p>[ẢNH: bảng giá với các gói xếp ngang, khoanh đỏ nút chọn của một gói]</p></li><li>Màn hình thanh toán hiện <strong>mã QR</strong> — mở app ngân hàng quét để trả.<p>[ẢNH: màn hình thanh toán đang hiện mã QR PayOS]</p></li><li>Trả xong, đợi vài giây là hạn mức gói được kích hoạt. Kiểm lại ở <strong>Gói &amp; Thanh toán → Tổng quan gói</strong>.<p>[ẢNH: trang Tổng quan gói sau khi kích hoạt, khoanh đỏ tên gói và hạn mức mới]</p></li></ol><h3>Mua thêm giữa chu kỳ</h3><p>Sắp hết tin, email hay lượt AI mà chưa tới kỳ làm mới thì mở <strong>Gói &amp; Thanh toán → Mua thêm hạn mức</strong>, chọn loại cần mua rồi thanh toán. Đơn tối thiểu <strong>50.000đ</strong>.</p><p>[ẢNH: trang Mua thêm hạn mức, khoanh đỏ các loại hạn mức mua thêm được]</p><p>Phần mua thêm <strong>không hết hạn theo chu kỳ</strong> — còn nguyên sang kỳ sau, tiêu tới đâu trừ tới đó.</p><h3>Hạn mức gói và phần mua thêm khác nhau thế nào</h3><ul><li><strong>Hạn mức gói</strong> làm mới mỗi kỳ. Dùng không hết thì mất, không cộng dồn.</li><li><strong>Phần mua thêm</strong> là số dư riêng, không làm mới và không mất khi sang kỳ mới.</li><li>Hệ thống <strong>tiêu hạn mức gói trước</strong>, hết mới trừ vào phần mua thêm — để phần bạn đã trả tiền được giữ lâu nhất.</li><li>Cần <strong>gói còn hiệu lực</strong> mới dùng được phần mua thêm. Gói hết hạn thì số dư vẫn còn nguyên, gia hạn là dùng tiếp.</li></ul><h3>Xem lại đơn và hoá đơn ở đâu</h3><p>Vào <strong>Gói &amp; Thanh toán → Tổng quan gói</strong>, kéo xuống mục <strong>Lịch sử đơn</strong>. Ở đó có đủ đơn mua gói lẫn đơn mua thêm, bấm vào một đơn để mở hoá đơn của đơn đó.</p><p>[ẢNH: mục Lịch sử đơn trong trang Tổng quan gói, khoanh đỏ một dòng đơn và chỗ mở hoá đơn]</p><h3>Lỗi thường gặp</h3><ul><li><strong>Đã trả tiền nhưng hạn mức chưa tăng</strong> → Đợi vài phút rồi tải lại trang, hệ thống cần nhận xác nhận từ cổng thanh toán.</li><li><strong>Không mua được tin Zalo</strong> → Năng lực tính theo <strong>số tài khoản Zalo đã kết nối</strong>, không theo gói. Nối Zalo trước ở <strong>Chiến dịch → Quản lý kênh gửi</strong>.</li><li><strong>Hết credit AI</strong> → Mở <strong>Gói &amp; Thanh toán → Mua thêm hạn mức</strong>, hoặc nâng gói bằng nút <strong>Nâng cấp</strong> trên thanh trên cùng.</li><li><strong>Gói đã hết hạn, còn số dư mua thêm nhưng không gửi được</strong> → Gia hạn gói; số dư không mất đi đâu.</li></ul><h3>Liên quan</h3><ul><li><a href="/huong-dan/doi-goi">Đổi gói — nâng cấp, hạ gói, đổi kỳ hạn</a></li><li><a href="/huong-dan/zalo-account">Thêm tài khoản Zalo</a></li><li><a href="/huong-dan/channels">Kết nối kênh gửi</a></li><li><a href="/huong-dan/faq-billing">Câu hỏi thường gặp về thanh toán</a></li></ul>`,
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
Chỉ **chủ tài khoản**. Nhân viên được cấp quyền vẫn dùng được sản phẩm, nhưng cả nhóm **Gói & Thanh toán** bị ẩn khỏi thanh menu bên trái của họ — để không ai tiêu tiền thay chủ.

[ẢNH: so sánh hai thanh menu cạnh nhau — bên chủ tài khoản có nhóm "Gói & Thanh toán", bên nhân viên không có]

## Mua thêm tin nhắn / email / lượt AI có hết hạn không?
**Không.** Số dư mua thêm nằm ở một ví riêng, không làm mới theo chu kỳ và không mất khi sang kỳ mới. Điều kiện duy nhất là gói phải còn hiệu lực mới tiêu được.

Hệ thống luôn **tiêu hạn mức của gói trước**, hết mới trừ vào ví — để phần bạn đã bỏ tiền mua được giữ lâu nhất có thể.

## Vậy còn tài khoản Zalo, landing page, chatbot mua thêm?
Nhóm này **khác hẳn**: đây là thuê chỗ theo tháng, không phải ví. Khi mua bạn chọn 1, 3, 6 hoặc 12 tháng. Thời hạn tính từ ngày mua, không gắn với ngày hết hạn gói — nên mua sát cuối kỳ cũng không bị thiệt, và gia hạn gói không làm mất slot vừa mua.

## Hết hạn slot thì tôi có mất dữ liệu không?
**Không mất gì.** Hệ thống chỉ **tạm khoá**, toàn bộ nội dung landing page, chatbot và kết nối tài khoản vẫn còn nguyên. Trả tiền là dùng lại được ngay.

Bạn còn được **tự chọn giữ cái nào**: ở **thanh menu bên trái** mở nhóm **Gói & Thanh toán** → **Tổng quan gói**, kéo xuống mục **Tài nguyên khoá**, tick những thứ quan trọng để giữ trong hạn mức còn hiệu lực. Hệ thống cũng gửi email nhắc trước **7 ngày** và **3 ngày**.

[ẢNH: mục Tài nguyên khoá, khoanh đỏ các ô tick chọn giữ lại]

Lưu ý: tài nguyên bị khoá vẫn chiếm chỗ. Muốn tạo cái mới thì xoá cái đang khoá trước.

## Vì sao tôi không mua thêm tin Zalo được?
Hai lý do thường gặp:
- **Chưa kết nối tài khoản Zalo nào.** Mua tin mà không có tài khoản để gửi thì tiền nằm chết — hãy kết nối trước ở **menu bên trái** → nhóm **Chiến dịch** → **Quản lý kênh gửi** → thẻ **Zalo**.
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

Ngay trên màn hình thanh toán, dưới phần mã QR, có một khu vực để điền thông tin xuất hoá đơn, chọn được hai dạng **Công ty** (tên, mã số thuế, địa chỉ) hoặc **Cá nhân**. Phần này **không bắt buộc**:

- **Có điền** → hoá đơn ghi đúng tên bạn hoặc tên công ty, và được **gửi vào email** của bạn kèm file PDF.
- **Không điền** → hệ thống vẫn xuất hoá đơn dưới dạng *"Bán cho người tiêu dùng"* theo đúng quy định, nhưng không gửi email cho bạn.

[ẢNH: màn hình thanh toán, khoanh đỏ khu vực điền thông tin hoá đơn với hai lựa chọn Công ty / Cá nhân]

Xem lại và tải hoá đơn bất cứ lúc nào: **Gói & Thanh toán → Tổng quan gói**, kéo xuống mục **Lịch sử đơn**, bấm vào đơn cần xem.

[ẢNH: mục Lịch sử đơn, khoanh đỏ chỗ bấm để mở hoá đơn của một đơn]

Lưu ý: hoá đơn đã phát hành thì **không sửa và không huỷ được**. Nếu cần hoá đơn mang tên công ty, hãy điền mã số thuế **ngay ở bước thanh toán**, đừng để sau.

## Có hoàn tiền không?
Hệ thống **không có luồng hoàn tiền tự động**. Trường hợp đặc biệt (thanh toán nhầm, trừ tiền hai lần) vui lòng liên hệ hỗ trợ kèm mã đơn.

## Xem lại đơn đã mua ở đâu?
Ở **thanh menu bên trái**, mở nhóm **Gói & Thanh toán** → **Tổng quan gói**, kéo xuống mục **Lịch sử đơn**. Có đủ đơn mua gói lẫn đơn mua thêm.

[ẢNH: menu bên trái đang mở nhóm Gói & Thanh toán, khoanh đỏ mục "Tổng quan gói"]

## Liên quan
- [Gói dịch vụ & thanh toán](plan-and-billing)
- [Đổi gói — nâng cấp, hạ gói, đổi kỳ hạn](doi-goi)
- [Bắt đầu với Founder AI — 4 bước](getting-started)
- [Kết nối kênh gửi](channels)
`,
    body_html: `<h2>Câu hỏi thường gặp về thanh toán &amp; hoá đơn</h2><p>Các câu hỏi hay gặp nhất về tiền bạc. Xem trước phần này thì đỡ phải hỏi hỗ trợ.</p><h3>Ai được mua gói và mua thêm?</h3><p>Chỉ <strong>chủ tài khoản</strong>. Nhân viên được cấp quyền vẫn dùng được sản phẩm, nhưng cả nhóm <strong>Gói &amp; Thanh toán</strong> bị ẩn khỏi thanh menu bên trái của họ — để không ai tiêu tiền thay chủ.</p><p>[ẢNH: so sánh hai thanh menu cạnh nhau — bên chủ tài khoản có nhóm &quot;Gói &amp; Thanh toán&quot;, bên nhân viên không có]</p><h3>Mua thêm tin nhắn / email / lượt AI có hết hạn không?</h3><p><strong>Không.</strong> Số dư mua thêm nằm ở một ví riêng, không làm mới theo chu kỳ và không mất khi sang kỳ mới. Điều kiện duy nhất là gói phải còn hiệu lực mới tiêu được.</p><p>Hệ thống luôn <strong>tiêu hạn mức của gói trước</strong>, hết mới trừ vào ví — để phần bạn đã bỏ tiền mua được giữ lâu nhất có thể.</p><h3>Vậy còn tài khoản Zalo, landing page, chatbot mua thêm?</h3><p>Nhóm này <strong>khác hẳn</strong>: đây là thuê chỗ theo tháng, không phải ví. Khi mua bạn chọn 1, 3, 6 hoặc 12 tháng. Thời hạn tính từ ngày mua, không gắn với ngày hết hạn gói — nên mua sát cuối kỳ cũng không bị thiệt, và gia hạn gói không làm mất slot vừa mua.</p><h3>Hết hạn slot thì tôi có mất dữ liệu không?</h3><p><strong>Không mất gì.</strong> Hệ thống chỉ <strong>tạm khoá</strong>, toàn bộ nội dung landing page, chatbot và kết nối tài khoản vẫn còn nguyên. Trả tiền là dùng lại được ngay.</p><p>Bạn còn được <strong>tự chọn giữ cái nào</strong>: ở <strong>thanh menu bên trái</strong> mở nhóm <strong>Gói &amp; Thanh toán</strong> → <strong>Tổng quan gói</strong>, kéo xuống mục <strong>Tài nguyên khoá</strong>, tick những thứ quan trọng để giữ trong hạn mức còn hiệu lực. Hệ thống cũng gửi email nhắc trước <strong>7 ngày</strong> và <strong>3 ngày</strong>.</p><p>[ẢNH: mục Tài nguyên khoá, khoanh đỏ các ô tick chọn giữ lại]</p><p>Lưu ý: tài nguyên bị khoá vẫn chiếm chỗ. Muốn tạo cái mới thì xoá cái đang khoá trước.</p><h3>Vì sao tôi không mua thêm tin Zalo được?</h3><p>Hai lý do thường gặp:</p><ul><li><strong>Chưa kết nối tài khoản Zalo nào.</strong> Mua tin mà không có tài khoản để gửi thì tiền nằm chết — hãy kết nối trước ở <strong>menu bên trái</strong> → nhóm <strong>Chiến dịch</strong> → <strong>Quản lý kênh gửi</strong> → thẻ <strong>Zalo</strong>.</li><li><strong>Mua vượt năng lực gửi thật.</strong> Mỗi tài khoản Zalo chỉ gửi được khoảng 16.000 tin/tháng. Cần nhiều hơn thì mua thêm tài khoản Zalo, không phải mua thêm tin.</li></ul><h3>Đơn tối thiểu là bao nhiêu?</h3><p><strong>50.000đ</strong> một đơn mua thêm. Dưới mức này phí thanh toán ăn gần hết giá trị đơn.</p><h3>Gói tôi hết hạn, đang trong thời gian ân hạn thì mua được gì?</h3><p>Chỉ mua được <strong>tin nhắn, email, lượt AI</strong>. Không mua được thêm tài khoản Zalo/Email, landing page hay chatbot cho tới khi gia hạn gói.</p><h3>Đã thanh toán nhưng hạn mức chưa tăng?</h3><p>Đợi vài phút rồi tải lại trang — hệ thống cần nhận xác nhận từ cổng thanh toán. Quá 15 phút vẫn chưa thấy thì liên hệ hỗ trợ kèm <strong>mã đơn</strong>, đơn không bị mất.</p><h3>Có xuất hoá đơn điện tử không?</h3><p><strong>Có.</strong> Hệ thống xuất hoá đơn điện tử <strong>tự động ngay sau khi thanh toán thành công</strong>, bạn không phải yêu cầu.</p><p><strong>Giá niêm yết đã là giá cuối cùng.</strong> Dịch vụ thuộc diện không chịu thuế nên hoá đơn <strong>không cộng thêm phần trăm nào</strong> — thấy 299.000đ thì trả đúng 299.000đ.</p><p>Ngay trên màn hình thanh toán, dưới phần mã QR, có một khu vực để điền thông tin xuất hoá đơn, chọn được hai dạng <strong>Công ty</strong> (tên, mã số thuế, địa chỉ) hoặc <strong>Cá nhân</strong>. Phần này <strong>không bắt buộc</strong>:</p><ul><li><strong>Có điền</strong> → hoá đơn ghi đúng tên bạn hoặc tên công ty, và được <strong>gửi vào email</strong> của bạn kèm file PDF.</li><li><strong>Không điền</strong> → hệ thống vẫn xuất hoá đơn dưới dạng <em>&quot;Bán cho người tiêu dùng&quot;</em> theo đúng quy định, nhưng không gửi email cho bạn.</li></ul><p>[ẢNH: màn hình thanh toán, khoanh đỏ khu vực điền thông tin hoá đơn với hai lựa chọn Công ty / Cá nhân]</p><p>Xem lại và tải hoá đơn bất cứ lúc nào: <strong>Gói &amp; Thanh toán → Tổng quan gói</strong>, kéo xuống mục <strong>Lịch sử đơn</strong>, bấm vào đơn cần xem.</p><p>[ẢNH: mục Lịch sử đơn, khoanh đỏ chỗ bấm để mở hoá đơn của một đơn]</p><p>Lưu ý: hoá đơn đã phát hành thì <strong>không sửa và không huỷ được</strong>. Nếu cần hoá đơn mang tên công ty, hãy điền mã số thuế <strong>ngay ở bước thanh toán</strong>, đừng để sau.</p><h3>Có hoàn tiền không?</h3><p>Hệ thống <strong>không có luồng hoàn tiền tự động</strong>. Trường hợp đặc biệt (thanh toán nhầm, trừ tiền hai lần) vui lòng liên hệ hỗ trợ kèm mã đơn.</p><h3>Xem lại đơn đã mua ở đâu?</h3><p>Ở <strong>thanh menu bên trái</strong>, mở nhóm <strong>Gói &amp; Thanh toán</strong> → <strong>Tổng quan gói</strong>, kéo xuống mục <strong>Lịch sử đơn</strong>. Có đủ đơn mua gói lẫn đơn mua thêm.</p><p>[ẢNH: menu bên trái đang mở nhóm Gói &amp; Thanh toán, khoanh đỏ mục &quot;Tổng quan gói&quot;]</p><h3>Liên quan</h3><ul><li><a href="/huong-dan/plan-and-billing">Gói dịch vụ &amp; thanh toán</a></li><li><a href="/huong-dan/doi-goi">Đổi gói — nâng cấp, hạ gói, đổi kỳ hạn</a></li><li><a href="/huong-dan/getting-started">Bắt đầu với Founder AI — 4 bước</a></li><li><a href="/huong-dan/channels">Kết nối kênh gửi</a></li></ul>`,
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

## Mở bảng giá ở đâu
Cả nâng gói lẫn hạ gói đều bắt đầu từ cùng một chỗ: bấm nút **Nâng cấp** trên **thanh ngang trên cùng**, phía bên phải màn hình.

[ẢNH: thanh ngang trên cùng, khoanh đỏ nút "Nâng cấp"]

Tên nút là *Nâng cấp*, nhưng bạn **hạ gói cũng đi qua đây** — cứ bấm vào rồi chọn gói thấp hơn.

[ẢNH: bảng giá với các gói xếp ngang, gói đang dùng được đánh dấu riêng]

## Nâng lên gói cao hơn — dùng được ngay
Chọn gói cao hơn, thanh toán xong là dùng được ngay lập tức.

**Điều quan trọng nhất cần biết:** thời hạn gói mới **tính lại từ ngày bạn nâng cấp**. Phần ngày chưa dùng hết của gói cũ **không được cộng dồn**.

Ví dụ: bạn còn 25 ngày gói Cơ bản, nâng lên gói Chuyên nghiệp hôm nay → bạn có 30 ngày Chuyên nghiệp tính từ hôm nay, 25 ngày Cơ bản kia không được cộng thêm.

Vì vậy nếu không gấp, nâng gói vào **gần cuối chu kỳ** sẽ lợi hơn. Trước khi bấm xác nhận, hệ thống hiện một cảnh báo ghi rõ **số ngày bạn sắp mất** — đọc kỹ dòng đó rồi hãy quyết định.

[ẢNH: hộp cảnh báo trước khi xác nhận nâng gói, khoanh đỏ dòng ghi số ngày sắp mất]

## Hạ xuống gói thấp hơn — dùng hết chu kỳ đã trả
Bạn **không bị cắt quyền lợi giữa chừng**. Gói hiện tại chạy hết chu kỳ đã thanh toán, tới ngày hết hạn hệ thống **tự chuyển sang gói mới**.

Cách làm: chọn gói thấp hơn và **thanh toán ngay hôm nay**. Hệ thống ghi nhận lệnh rồi tự kích hoạt đúng ngày — bạn không phải nhớ, không phải vào lại lần nữa.

Trong thời gian chờ, bạn vẫn dùng đầy đủ quyền lợi của gói cũ. Mở lại **bảng giá** (nút **Nâng cấp** ở thanh ngang trên cùng) sẽ thấy một dải báo đang có lệnh hẹn đổi gói và ngày nó có hiệu lực.

[ẢNH: đầu trang bảng giá, dải báo lệnh hẹn đổi gói kèm ngày hiệu lực]

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

1. Từ ngày gói mới có hiệu lực, bạn có **7 ngày ân hạn** — mọi thứ vẫn chạy bình thường, phần vượt hạn mức được **tô đỏ** ngay trong danh sách để bạn nhìn là biết.

   [ẢNH: danh sách landing page trong thời gian ân hạn, khoanh đỏ những dòng đang bị tô đỏ vì vượt hạn mức]

2. Hết 7 ngày, phần tô đỏ bị **khoá** — không truy cập và không sử dụng được, nhưng **dữ liệu vẫn còn nguyên**.

   [ẢNH: một mục đã bị khoá sau khi hết ân hạn, thấy biểu tượng khoá]

3. Bạn xoá bớt cho tới khi số lượng về đúng hạn mức → mọi thứ **mở khoá lại**.

Bạn được xoá cái nào tuỳ ý, không bắt buộc xoá đúng cái đang bị tô đỏ.

Áp dụng cho landing page, chiến dịch, mẫu tin, tài khoản Zalo/Email, chatbot, nhân viên và dung lượng lưu trữ. Riêng hai loại dưới đây ảnh hưởng ra bên ngoài, nên xử lý sớm:

- **Nhân viên bị khoá** sẽ không vào được khu làm việc của công ty.
- **Chatbot bị khoá** ngưng hoạt động — khách nhắn vào sẽ không có ai trả lời.

Không áp dụng cho tin Zalo, email và lượt AI — ba loại này tự làm mới mỗi chu kỳ.

## Hạn mức làm mới khi nào
Hạn mức làm mới theo **chu kỳ 30 ngày tính từ ngày bạn đăng ký**, không theo ngày đầu tháng. Mua ngày 20 thì hạn mức làm mới vào khoảng ngày 20 hằng tháng.

Mua gói năm cũng vậy: bạn nhận hạn mức **theo từng tháng**, không phải nhận trọn cả năm một lần. Gói 500 tin/tháng mua theo năm nghĩa là mỗi chu kỳ 500 tin, **không phải 6.000 tin dùng tự do**. Dùng không hết thì mất, không cộng dồn sang chu kỳ sau.

Muốn phần không mất khi sang kỳ mới thì mua thêm ở **menu bên trái** → nhóm **Gói & Thanh toán** → **Mua thêm hạn mức**. Phần mua thêm nằm ở ví riêng và không hết hạn.

[ẢNH: menu bên trái đang mở nhóm Gói & Thanh toán, khoanh đỏ mục "Mua thêm hạn mức"]

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
    body_html: `<h2>Đổi gói — nâng cấp, hạ gói, đổi kỳ hạn</h2><p>Bạn đổi gói bất cứ lúc nào, không cần chờ hết hạn. Nhưng nâng gói và hạ gói chạy theo hai cách khác nhau — đọc phần dưới trước khi bấm để không mất tiền oan.</p><h3>Mở bảng giá ở đâu</h3><p>Cả nâng gói lẫn hạ gói đều bắt đầu từ cùng một chỗ: bấm nút <strong>Nâng cấp</strong> trên <strong>thanh ngang trên cùng</strong>, phía bên phải màn hình.</p><p>[ẢNH: thanh ngang trên cùng, khoanh đỏ nút &quot;Nâng cấp&quot;]</p><p>Tên nút là <em>Nâng cấp</em>, nhưng bạn <strong>hạ gói cũng đi qua đây</strong> — cứ bấm vào rồi chọn gói thấp hơn.</p><p>[ẢNH: bảng giá với các gói xếp ngang, gói đang dùng được đánh dấu riêng]</p><h3>Nâng lên gói cao hơn — dùng được ngay</h3><p>Chọn gói cao hơn, thanh toán xong là dùng được ngay lập tức.</p><p><strong>Điều quan trọng nhất cần biết:</strong> thời hạn gói mới <strong>tính lại từ ngày bạn nâng cấp</strong>. Phần ngày chưa dùng hết của gói cũ <strong>không được cộng dồn</strong>.</p><p>Ví dụ: bạn còn 25 ngày gói Cơ bản, nâng lên gói Chuyên nghiệp hôm nay → bạn có 30 ngày Chuyên nghiệp tính từ hôm nay, 25 ngày Cơ bản kia không được cộng thêm.</p><p>Vì vậy nếu không gấp, nâng gói vào <strong>gần cuối chu kỳ</strong> sẽ lợi hơn. Trước khi bấm xác nhận, hệ thống hiện một cảnh báo ghi rõ <strong>số ngày bạn sắp mất</strong> — đọc kỹ dòng đó rồi hãy quyết định.</p><p>[ẢNH: hộp cảnh báo trước khi xác nhận nâng gói, khoanh đỏ dòng ghi số ngày sắp mất]</p><h3>Hạ xuống gói thấp hơn — dùng hết chu kỳ đã trả</h3><p>Bạn <strong>không bị cắt quyền lợi giữa chừng</strong>. Gói hiện tại chạy hết chu kỳ đã thanh toán, tới ngày hết hạn hệ thống <strong>tự chuyển sang gói mới</strong>.</p><p>Cách làm: chọn gói thấp hơn và <strong>thanh toán ngay hôm nay</strong>. Hệ thống ghi nhận lệnh rồi tự kích hoạt đúng ngày — bạn không phải nhớ, không phải vào lại lần nữa.</p><p>Trong thời gian chờ, bạn vẫn dùng đầy đủ quyền lợi của gói cũ. Mở lại <strong>bảng giá</strong> (nút <strong>Nâng cấp</strong> ở thanh ngang trên cùng) sẽ thấy một dải báo đang có lệnh hẹn đổi gói và ngày nó có hiệu lực.</p><p>[ẢNH: đầu trang bảng giá, dải báo lệnh hẹn đổi gói kèm ngày hiệu lực]</p><h3>Đổi kỳ hạn tháng ↔ năm</h3><table><thead><tr><th>Bạn đang dùng</th><th>Muốn đổi sang</th><th>Được không</th></tr></thead><tbody><tr><td>Gói tháng</td><td>Cùng gói đó theo năm</td><td>Được — tính là nâng cấp, 365 ngày từ hôm nay</td></tr><tr><td>Gói tháng</td><td>Gói khác theo năm</td><td>Được — tính là nâng cấp</td></tr><tr><td>Gói năm</td><td>Gói khác theo năm</td><td>Được</td></tr><tr><td>Gói năm</td><td>Bất kỳ gói nào theo tháng</td><td>Chỉ được khi gói năm <strong>còn dưới 30 ngày</strong> hoặc đã hết hạn</td></tr></tbody></table><p>Đang dùng gói năm mà còn nhiều thời gian thì chưa chuyển về gói tháng được — chờ tới khi còn dưới 30 ngày.</p><h3>Gói tự chọn</h3><p>Gói tự chọn được so cao/thấp với gói cố định <strong>bằng giá tiền, và phải cùng kỳ hạn</strong> — gói tự chọn theo tháng so với gói cố định theo tháng.</p><p>Giá cao hơn thì tính là nâng cấp (dùng ngay), giá thấp hơn thì tính là hạ gói (chờ hết chu kỳ).</p><h3>Lệnh hẹn đổi gói — những điều cần biết</h3><p>Khi bạn đã thanh toán để hạ gói từ kỳ sau, đó là một <strong>lệnh hẹn</strong>. Quy tắc:</p><ul><li><strong>Mỗi lúc chỉ có một lệnh hẹn.</strong></li><li><strong>Không huỷ được và không hoàn tiền.</strong> Hãy cân nhắc kỹ trước khi thanh toán.</li><li><strong>Giá đã khoá.</strong> Bảng giá có tăng trong thời gian chờ cũng không thu thêm của bạn.</li><li><strong>Đổi lên gói cao hơn thì được</strong> — bạn chỉ trả thêm phần chênh lệch, không phải trả lại từ đầu. Đổi xuống gói rẻ hơn thì không được.</li><li><strong>Vẫn nâng gói đang dùng bình thường.</strong> Có lệnh hẹn không ngăn bạn nâng cấp ngay hôm nay nếu cần.</li><li><strong>Hoá đơn xuất ngay hôm bạn thanh toán</strong>, không đợi tới ngày gói kích hoạt. Nếu sau đó bạn trả thêm chênh lệch để nâng lệnh hẹn thì lần trả thêm đó có <strong>hoá đơn riêng</strong> — bạn sẽ có hai hoá đơn cho cùng một gói, đây là điều bình thường và đúng quy định.</li></ul><h3>Sau khi hạ gói mà đang dùng quá hạn mức mới</h3><p>Ví dụ bạn có 10 landing page nhưng gói mới chỉ cho 3.</p><p><strong>Hệ thống không xoá gì của bạn.</strong> Cách xử lý:</p><ol><li>Từ ngày gói mới có hiệu lực, bạn có <strong>7 ngày ân hạn</strong> — mọi thứ vẫn chạy bình thường, phần vượt hạn mức được <strong>tô đỏ</strong> ngay trong danh sách để bạn nhìn là biết.<p>[ẢNH: danh sách landing page trong thời gian ân hạn, khoanh đỏ những dòng đang bị tô đỏ vì vượt hạn mức]</p></li><li>Hết 7 ngày, phần tô đỏ bị <strong>khoá</strong> — không truy cập và không sử dụng được, nhưng <strong>dữ liệu vẫn còn nguyên</strong>.<p>[ẢNH: một mục đã bị khoá sau khi hết ân hạn, thấy biểu tượng khoá]</p></li><li>Bạn xoá bớt cho tới khi số lượng về đúng hạn mức → mọi thứ <strong>mở khoá lại</strong>.</li></ol><p>Bạn được xoá cái nào tuỳ ý, không bắt buộc xoá đúng cái đang bị tô đỏ.</p><p>Áp dụng cho landing page, chiến dịch, mẫu tin, tài khoản Zalo/Email, chatbot, nhân viên và dung lượng lưu trữ. Riêng hai loại dưới đây ảnh hưởng ra bên ngoài, nên xử lý sớm:</p><ul><li><strong>Nhân viên bị khoá</strong> sẽ không vào được khu làm việc của công ty.</li><li><strong>Chatbot bị khoá</strong> ngưng hoạt động — khách nhắn vào sẽ không có ai trả lời.</li></ul><p>Không áp dụng cho tin Zalo, email và lượt AI — ba loại này tự làm mới mỗi chu kỳ.</p><h3>Hạn mức làm mới khi nào</h3><p>Hạn mức làm mới theo <strong>chu kỳ 30 ngày tính từ ngày bạn đăng ký</strong>, không theo ngày đầu tháng. Mua ngày 20 thì hạn mức làm mới vào khoảng ngày 20 hằng tháng.</p><p>Mua gói năm cũng vậy: bạn nhận hạn mức <strong>theo từng tháng</strong>, không phải nhận trọn cả năm một lần. Gói 500 tin/tháng mua theo năm nghĩa là mỗi chu kỳ 500 tin, <strong>không phải 6.000 tin dùng tự do</strong>. Dùng không hết thì mất, không cộng dồn sang chu kỳ sau.</p><p>Muốn phần không mất khi sang kỳ mới thì mua thêm ở <strong>menu bên trái</strong> → nhóm <strong>Gói &amp; Thanh toán</strong> → <strong>Mua thêm hạn mức</strong>. Phần mua thêm nằm ở ví riêng và không hết hạn.</p><p>[ẢNH: menu bên trái đang mở nhóm Gói &amp; Thanh toán, khoanh đỏ mục &quot;Mua thêm hạn mức&quot;]</p><h3>Câu hỏi thường gặp</h3><p><strong>Nâng gói có mất dữ liệu không?</strong> Không. Toàn bộ chiến dịch, khách hàng, landing page, chatbot đều giữ nguyên.</p><p><strong>Tôi nâng gói giữa chừng, số ngày cũ có được trả lại không?</strong> Không. Thời hạn tính lại từ ngày nâng cấp.</p><p><strong>Hạ gói rồi tôi có bị cắt quyền lợi ngay không?</strong> Không. Bạn dùng hết chu kỳ đã thanh toán, sau đó mới chuyển.</p><p><strong>Tôi đã đặt hạ gói, giờ muốn đổi ý?</strong> Không huỷ được và không hoàn tiền. Nhưng bạn đổi lên gói cao hơn được bằng cách trả thêm phần chênh lệch.</p><p><strong>Đang dùng gói năm, tôi muốn về gói tháng?</strong> Chờ tới khi gói năm còn dưới 30 ngày.</p><p><strong>Hết 7 ngày ân hạn, hệ thống có xoá landing page của tôi không?</strong> Không xoá. Chỉ khoá lại, dữ liệu còn nguyên, xoá bớt là mở khoá.</p><h3>Liên quan</h3><ul><li><a href="/huong-dan/plan-and-billing">Gói dịch vụ &amp; thanh toán</a></li><li><a href="/huong-dan/faq-billing">Câu hỏi thường gặp về thanh toán &amp; hoá đơn</a></li></ul>`,
  },
  {
    slug: 'chatbot-khung-gio',
    feature_key: 'chatbot',
    primary_route: '/app/chatbot-studio',
    sort_order: 85,
    title: 'Chatbot: khung giờ hoạt động, giới hạn trả lời và AI viết hộ',
    summary: 'Cho chatbot chỉ trả lời trong giờ bạn chọn, đặt trần số lượt trả lời để giữ credit, và nhờ AI viết hộ phần hướng dẫn cách trả lời.',
    body_md: `# Chatbot: khung giờ hoạt động, giới hạn trả lời và AI viết hộ
Ba cài đặt giúp bạn kiểm soát chatbot: **khi nào** nó trả lời, trả lời **tối đa bao nhiêu lượt**, và nhờ AI **viết hộ** phần hướng dẫn cách trả lời. Cả ba nằm trong phần **Cấu hình** của từng chatbot.

## Tìm trang này trên màn hình
Ở **thanh menu bên trái**, bấm vào nhóm **AI Chatbot** cho nó mở ra, chọn mục **Tạo AI Chatbot**, rồi chọn chatbot cần chỉnh và mở phần **Cấu hình**.

[ẢNH: trang Tạo AI Chatbot, đã chọn một chatbot, khoanh đỏ chỗ mở phần Cấu hình]

Chỉ **chủ tài khoản** chỉnh được các mục này.

## Khung giờ hoạt động
Mặc định chatbot **Luôn trả lời (24/7)**. Muốn bot nghỉ ngoài giờ làm việc, chọn **Chỉ trả lời trong khung giờ** rồi khai:

- **Ngày áp dụng trong tuần** — có sẵn ba lựa chọn nhanh: *Thứ 2 – Thứ 6*, *Thứ 2 – Thứ 7*, *Cả tuần*.
- **Các khung giờ hoạt động trong ngày** — tối đa 5 khung giờ, không được chồng lên nhau. Bấm **Thêm khung giờ** để thêm ca.

Giờ tính theo **giờ Việt Nam**. Khung giờ được phép **qua nửa đêm**, ví dụ 18:00 – 05:00; khi đó ô giờ hiện nhãn *Qua đêm (+1)*.

[ẢNH: khối Khung giờ hoạt động đang chọn "Chỉ trả lời trong khung giờ", có hai khung giờ sáng và chiều]

### Khách nhắn ngoài giờ thì sao
Chọn một trong hai cách:

| Lựa chọn | Điều xảy ra |
|---|---|
| **Im lặng** | Bot không trả lời gì. Tin của khách vẫn nằm trong **Lịch sử trò chuyện** để bạn trả lời tay. |
| **Gửi một câu** | Bot gửi đúng câu bạn soạn sẵn (tối đa 500 ký tự), ví dụ *"Shop nghỉ rồi ạ, 8 giờ sáng mai em trả lời anh/chị ngay."* |

Câu ngoài giờ chỉ gửi **tối đa 1 lần cho mỗi khách** trong một đợt ngoài giờ, khách nhắn liên tục cũng không bị lặp lại.

> Ngoài khung giờ, hệ thống **không gọi AI và không trừ credit**. Khung giờ áp dụng cho mọi kênh của chatbot đó: website, Zalo, Facebook.

## Giới hạn lượt chatbot trả lời
Dùng khi bạn sợ một đợt tin nhắn rác đốt hết credit. Đặt trần theo **Mỗi phút**, **Mỗi giờ**, **Mỗi ngày**, **Mỗi tháng** — bật cái nào tuỳ bạn. Trần tính riêng cho chatbot này, gộp mọi khách và mọi kênh.

Khi chạm trần, chọn **Im lặng** hoặc **Thông báo** (gửi khách một câu bạn soạn sẵn). Bấm **Lưu giới hạn** để áp dụng.

[ẢNH: khối Giới hạn lượt chatbot trả lời, đang bật trần Mỗi giờ và Mỗi ngày]

## AI viết hộ phần hướng dẫn
Phần hướng dẫn cách trả lời quyết định giọng của bot, nhưng nhiều người không biết viết gì. Ngay tại ô hướng dẫn có nút **AI viết hộ**:

1. Bấm **AI viết hộ**, gõ một câu mô tả ngắn. Ví dụ: *"Trợ lý tư vấn khoá học tiếng Anh, xưng em, thân thiện."*
2. Bấm **Viết**. AI soạn một bản đầy đủ, có dùng thông tin trong **Hồ sơ doanh nghiệp** của bạn.
3. Bản nháp hiện ở khung **Xem trước** — lúc này **chưa** ghi vào ô hướng dẫn.
4. Ưng thì bấm **Dùng cái này**. Chưa ưng thì **Viết lại**, hoặc **Bỏ**.

[ẢNH: ô hướng dẫn cách trả lời với nút "AI viết hộ", bên dưới là khung Xem trước bản AI vừa viết]

Mỗi lần **Viết** hoặc **Viết lại** dùng **1 lượt AI**. Nếu ô hướng dẫn đang có nội dung, hệ thống hỏi lại trước khi thay.

## Liên quan
- [Chatbot AI trả lời khách tự động](chatbot)
- [Hộp thư hợp nhất](inbox)
- [Hồ sơ doanh nghiệp](ai-profile)`,
    body_html: `<h2>Chatbot: khung giờ hoạt động, giới hạn trả lời và AI viết hộ</h2><p>Ba cài đặt giúp bạn kiểm soát chatbot: <strong>khi nào</strong> nó trả lời, trả lời <strong>tối đa bao nhiêu lượt</strong>, và nhờ AI <strong>viết hộ</strong> phần hướng dẫn cách trả lời. Cả ba nằm trong phần <strong>Cấu hình</strong> của từng chatbot.</p><h3>Tìm trang này trên màn hình</h3><p>Ở <strong>thanh menu bên trái</strong>, bấm vào nhóm <strong>AI Chatbot</strong> cho nó mở ra, chọn mục <strong>Tạo AI Chatbot</strong>, rồi chọn chatbot cần chỉnh và mở phần <strong>Cấu hình</strong>.</p><p>[ẢNH: trang Tạo AI Chatbot, đã chọn một chatbot, khoanh đỏ chỗ mở phần Cấu hình]</p><p>Chỉ <strong>chủ tài khoản</strong> chỉnh được các mục này.</p><h3>Khung giờ hoạt động</h3><p>Mặc định chatbot <strong>Luôn trả lời (24/7)</strong>. Muốn bot nghỉ ngoài giờ làm việc, chọn <strong>Chỉ trả lời trong khung giờ</strong> rồi khai:</p><ul><li><strong>Ngày áp dụng trong tuần</strong> — có sẵn ba lựa chọn nhanh: <em>Thứ 2 – Thứ 6</em>, <em>Thứ 2 – Thứ 7</em>, <em>Cả tuần</em>.</li><li><strong>Các khung giờ hoạt động trong ngày</strong> — tối đa 5 khung giờ, không được chồng lên nhau. Bấm <strong>Thêm khung giờ</strong> để thêm ca.</li></ul><p>Giờ tính theo <strong>giờ Việt Nam</strong>. Khung giờ được phép <strong>qua nửa đêm</strong>, ví dụ 18:00 – 05:00; khi đó ô giờ hiện nhãn <em>Qua đêm (+1)</em>.</p><p>[ẢNH: khối Khung giờ hoạt động đang chọn &quot;Chỉ trả lời trong khung giờ&quot;, có hai khung giờ sáng và chiều]</p><h4>Khách nhắn ngoài giờ thì sao</h4><p>Chọn một trong hai cách:</p><table><thead><tr><th>Lựa chọn</th><th>Điều xảy ra</th></tr></thead><tbody><tr><td><strong>Im lặng</strong></td><td>Bot không trả lời gì. Tin của khách vẫn nằm trong <strong>Lịch sử trò chuyện</strong> để bạn trả lời tay.</td></tr><tr><td><strong>Gửi một câu</strong></td><td>Bot gửi đúng câu bạn soạn sẵn (tối đa 500 ký tự), ví dụ <em>&quot;Shop nghỉ rồi ạ, 8 giờ sáng mai em trả lời anh/chị ngay.&quot;</em></td></tr></tbody></table><p>Câu ngoài giờ chỉ gửi <strong>tối đa 1 lần cho mỗi khách</strong> trong một đợt ngoài giờ, khách nhắn liên tục cũng không bị lặp lại.</p><blockquote><p>Ngoài khung giờ, hệ thống <strong>không gọi AI và không trừ credit</strong>. Khung giờ áp dụng cho mọi kênh của chatbot đó: website, Zalo, Facebook.</p></blockquote><h3>Giới hạn lượt chatbot trả lời</h3><p>Dùng khi bạn sợ một đợt tin nhắn rác đốt hết credit. Đặt trần theo <strong>Mỗi phút</strong>, <strong>Mỗi giờ</strong>, <strong>Mỗi ngày</strong>, <strong>Mỗi tháng</strong> — bật cái nào tuỳ bạn. Trần tính riêng cho chatbot này, gộp mọi khách và mọi kênh.</p><p>Khi chạm trần, chọn <strong>Im lặng</strong> hoặc <strong>Thông báo</strong> (gửi khách một câu bạn soạn sẵn). Bấm <strong>Lưu giới hạn</strong> để áp dụng.</p><p>[ẢNH: khối Giới hạn lượt chatbot trả lời, đang bật trần Mỗi giờ và Mỗi ngày]</p><h3>AI viết hộ phần hướng dẫn</h3><p>Phần hướng dẫn cách trả lời quyết định giọng của bot, nhưng nhiều người không biết viết gì. Ngay tại ô hướng dẫn có nút <strong>AI viết hộ</strong>:</p><ol><li>Bấm <strong>AI viết hộ</strong>, gõ một câu mô tả ngắn. Ví dụ: <em>&quot;Trợ lý tư vấn khoá học tiếng Anh, xưng em, thân thiện.&quot;</em></li><li>Bấm <strong>Viết</strong>. AI soạn một bản đầy đủ, có dùng thông tin trong <strong>Hồ sơ doanh nghiệp</strong> của bạn.</li><li>Bản nháp hiện ở khung <strong>Xem trước</strong> — lúc này <strong>chưa</strong> ghi vào ô hướng dẫn.</li><li>Ưng thì bấm <strong>Dùng cái này</strong>. Chưa ưng thì <strong>Viết lại</strong>, hoặc <strong>Bỏ</strong>.</li></ol><p>[ẢNH: ô hướng dẫn cách trả lời với nút &quot;AI viết hộ&quot;, bên dưới là khung Xem trước bản AI vừa viết]</p><p>Mỗi lần <strong>Viết</strong> hoặc <strong>Viết lại</strong> dùng <strong>1 lượt AI</strong>. Nếu ô hướng dẫn đang có nội dung, hệ thống hỏi lại trước khi thay.</p><h3>Liên quan</h3><ul><li><a href="/huong-dan/chatbot">Chatbot AI trả lời khách tự động</a></li><li><a href="/huong-dan/inbox">Hộp thư hợp nhất</a></li><li><a href="/huong-dan/ai-profile">Hồ sơ doanh nghiệp</a></li></ul>`,
  },
  {
    slug: 'tro-ly-ai-landing',
    feature_key: 'landing-page',
    primary_route: '/app',
    sort_order: 102,
    title: 'Dựng landing page bằng Trợ lý AI',
    summary: 'Gõ yêu cầu, đính kèm tài liệu hoặc ảnh, Trợ lý AI dựng trang ngay trong khung chat. Hệ thống tự kiểm tra hiển thị, có nút Hoàn tác, lưu và xuất bản không cần rời chat.',
    body_md: `# Dựng landing page bằng Trợ lý AI
Bạn mô tả trang mình cần bằng lời thường, Trợ lý AI dựng trang ngay trong khung chat. Không cần biết code, không cần mở trình sửa.

## Tìm Trợ lý AI trên màn hình
Ở **thanh menu bên trái**, mục trên cùng là **Trợ lý AI**. Bấm vào là ra khung chat.

[ẢNH: menu bên trái, khoanh đỏ mục "Trợ lý AI" ở trên cùng]

## Yêu cầu dựng trang
Gõ vào ô chat điều bạn muốn, càng cụ thể càng tốt. Ví dụ: *"Tạo landing page giới thiệu khoá học chăm sóc da cho người mới, có bảng giá ba gói và phần đăng ký."*

Trợ lý có thể hỏi lại vài câu ngắn (trang dành cho ai, mục tiêu là gì). Trả lời xong, trang hiện ra dưới dạng **một thẻ xem trước** ngay trong chat. Bạn cũng có thể gõ "trang web" hay "website", trợ lý hiểu là landing page.

[ẢNH: khung chat với thẻ landing page vừa dựng xong, thấy phần xem trước của trang]

Mỗi lần dựng trang dùng **1 lượt AI**.

## Đính kèm tài liệu và ảnh
Bấm nút đính kèm tệp cạnh ô chat để gửi kèm. Trợ lý đọc nội dung tệp rồi dựng trang bám theo đó, không bịa thêm.

| Loại tệp | Trợ lý dùng để làm gì |
|---|---|
| PDF, Word, PowerPoint, Excel, CSV | Đọc nội dung rồi viết trang đúng theo tài liệu |
| PDF scan (bản chụp, không bôi đen được chữ) | Vẫn đọc được. Mỗi tệp tối đa 10 MB |
| Ảnh PNG, JPG, WebP | Chèn vào trang. Mỗi ảnh tối đa 10 MB |

> Khi bạn **sửa** một trang đã có và gửi kèm ảnh chụp màn hình để chỉ chỗ lỗi, trợ lý hiểu đó là ảnh minh hoạ và **không** chèn vào trang. Muốn chèn thì nói rõ: *"chèn ảnh này vào đầu trang"*.

[ẢNH: ô chat đang có một tệp PDF đính kèm, khoanh đỏ nút đính kèm tệp]

## Đã có sẵn trang HTML
Dán nguyên mã HTML của trang vào ô chat rồi gửi. Trợ lý nhận ra đây là một trang hoàn chỉnh và đưa nó thành thẻ xem trước, **không tốn lượt AI**. Từ đó bạn nhờ AI sửa tiếp như với trang do AI dựng.

## Hệ thống tự kiểm tra hiển thị
Sau mỗi lần dựng hoặc sửa, thẻ hiện dòng **Đang kiểm tra hiển thị…**. Hệ thống tự mở thử trang ở khổ máy tính và khổ điện thoại để tìm chỗ chữ bị che, bị cắt hoặc tràn ra ngoài.

- Không có lỗi: thẻ hiện **Đã kiểm tra hiển thị ✓**.
- Có lỗi: hệ thống **tự sửa**, tối đa hai lượt, **không tính lượt AI** của bạn, rồi báo đã chỉnh gì.
- Vẫn còn lỗi sau hai lượt: thẻ nói còn mấy chỗ và ở phần nào, kèm nút **Trình bày lại phần này · dùng 1 lượt AI**.

Bạn không cần chụp màn hình hay biết kỹ thuật. Thấy chỗ nào chưa ổn, cứ gõ như nói chuyện: *"chữ ở phần lịch trình bị đè lên nhau, sửa giúp tôi"*.

Với trang bạn tự dán HTML, hệ thống chỉ kiểm tra và báo, không tự sửa miễn phí.

[ẢNH: thẻ landing page với dòng trạng thái "Đã kiểm tra hiển thị ✓" ở dưới phần xem trước]

## Sửa trang và Hoàn tác
Bấm **Sửa trang này với AI** trên thẻ, gõ điều muốn đổi rồi bấm **Áp dụng sửa**. Ví dụ: *"đổi nền sang màu tím, thêm lời kêu gọi đăng ký ở cuối trang"*. Mỗi lần sửa dùng **1 lượt AI**.

Không ưng kết quả? Bấm **Hoàn tác** trên thẻ để quay lại bản ngay trước đó.

[ẢNH: thẻ landing page, khoanh đỏ nút "Sửa trang này với AI" và nút "Hoàn tác"]

Trên thẻ còn có nút đổi giữa khổ **Desktop** và **Mobile**, nút **Xem toàn màn hình**, và tab **Mã nguồn** nếu bạn cần chép mã.

## Lưu và xuất bản ngay trong chat
Bấm **Lưu & xuất bản** trên thẻ. Điền **Tiêu đề**, đặt **Slug** (phần đuôi của đường link, viết liền không dấu, ví dụ *khoa-hoc-marketing*), tích **Xuất bản ngay** nếu muốn trang chạy luôn, rồi bấm **Lưu trang**.

Lưu xong, thẻ có thêm **Xem trang** (mở trang thật), **Mở trang soạn** (sang trình sửa đầy đủ) và **Ẩn trang**. Sửa tiếp bằng AI rồi bấm **Cập nhật trang đã lưu** để đưa bản mới lên.

[ẢNH: hộp Lưu & xuất bản với ô Tiêu đề, ô Slug và ô tích Xuất bản ngay]

Trang đã lưu nằm chung chỗ với các trang khác: **menu bên trái** → nhóm **Landing page** → mục **Tạo Landing page**. Tài khoản nhân viên cần được cấp quyền landing page mới lưu được.

## Liên quan
- [Landing page thu khách hàng](landing-page)
- [Biểu mẫu: thu thông tin, chia sẻ và nhúng vào website](bieu-mau)
- [Hồ sơ doanh nghiệp](ai-profile)`,
    body_html: `<h2>Dựng landing page bằng Trợ lý AI</h2><p>Bạn mô tả trang mình cần bằng lời thường, Trợ lý AI dựng trang ngay trong khung chat. Không cần biết code, không cần mở trình sửa.</p><h3>Tìm Trợ lý AI trên màn hình</h3><p>Ở <strong>thanh menu bên trái</strong>, mục trên cùng là <strong>Trợ lý AI</strong>. Bấm vào là ra khung chat.</p><p>[ẢNH: menu bên trái, khoanh đỏ mục &quot;Trợ lý AI&quot; ở trên cùng]</p><h3>Yêu cầu dựng trang</h3><p>Gõ vào ô chat điều bạn muốn, càng cụ thể càng tốt. Ví dụ: <em>&quot;Tạo landing page giới thiệu khoá học chăm sóc da cho người mới, có bảng giá ba gói và phần đăng ký.&quot;</em></p><p>Trợ lý có thể hỏi lại vài câu ngắn (trang dành cho ai, mục tiêu là gì). Trả lời xong, trang hiện ra dưới dạng <strong>một thẻ xem trước</strong> ngay trong chat. Bạn cũng có thể gõ &quot;trang web&quot; hay &quot;website&quot;, trợ lý hiểu là landing page.</p><p>[ẢNH: khung chat với thẻ landing page vừa dựng xong, thấy phần xem trước của trang]</p><p>Mỗi lần dựng trang dùng <strong>1 lượt AI</strong>.</p><h3>Đính kèm tài liệu và ảnh</h3><p>Bấm nút đính kèm tệp cạnh ô chat để gửi kèm. Trợ lý đọc nội dung tệp rồi dựng trang bám theo đó, không bịa thêm.</p><table><thead><tr><th>Loại tệp</th><th>Trợ lý dùng để làm gì</th></tr></thead><tbody><tr><td>PDF, Word, PowerPoint, Excel, CSV</td><td>Đọc nội dung rồi viết trang đúng theo tài liệu</td></tr><tr><td>PDF scan (bản chụp, không bôi đen được chữ)</td><td>Vẫn đọc được. Mỗi tệp tối đa 10 MB</td></tr><tr><td>Ảnh PNG, JPG, WebP</td><td>Chèn vào trang. Mỗi ảnh tối đa 10 MB</td></tr></tbody></table><blockquote><p>Khi bạn <strong>sửa</strong> một trang đã có và gửi kèm ảnh chụp màn hình để chỉ chỗ lỗi, trợ lý hiểu đó là ảnh minh hoạ và <strong>không</strong> chèn vào trang. Muốn chèn thì nói rõ: <em>&quot;chèn ảnh này vào đầu trang&quot;</em>.</p></blockquote><p>[ẢNH: ô chat đang có một tệp PDF đính kèm, khoanh đỏ nút đính kèm tệp]</p><h3>Đã có sẵn trang HTML</h3><p>Dán nguyên mã HTML của trang vào ô chat rồi gửi. Trợ lý nhận ra đây là một trang hoàn chỉnh và đưa nó thành thẻ xem trước, <strong>không tốn lượt AI</strong>. Từ đó bạn nhờ AI sửa tiếp như với trang do AI dựng.</p><h3>Hệ thống tự kiểm tra hiển thị</h3><p>Sau mỗi lần dựng hoặc sửa, thẻ hiện dòng <strong>Đang kiểm tra hiển thị…</strong>. Hệ thống tự mở thử trang ở khổ máy tính và khổ điện thoại để tìm chỗ chữ bị che, bị cắt hoặc tràn ra ngoài.</p><ul><li>Không có lỗi: thẻ hiện <strong>Đã kiểm tra hiển thị ✓</strong>.</li><li>Có lỗi: hệ thống <strong>tự sửa</strong>, tối đa hai lượt, <strong>không tính lượt AI</strong> của bạn, rồi báo đã chỉnh gì.</li><li>Vẫn còn lỗi sau hai lượt: thẻ nói còn mấy chỗ và ở phần nào, kèm nút <strong>Trình bày lại phần này · dùng 1 lượt AI</strong>.</li></ul><p>Bạn không cần chụp màn hình hay biết kỹ thuật. Thấy chỗ nào chưa ổn, cứ gõ như nói chuyện: <em>&quot;chữ ở phần lịch trình bị đè lên nhau, sửa giúp tôi&quot;</em>.</p><p>Với trang bạn tự dán HTML, hệ thống chỉ kiểm tra và báo, không tự sửa miễn phí.</p><p>[ẢNH: thẻ landing page với dòng trạng thái &quot;Đã kiểm tra hiển thị ✓&quot; ở dưới phần xem trước]</p><h3>Sửa trang và Hoàn tác</h3><p>Bấm <strong>Sửa trang này với AI</strong> trên thẻ, gõ điều muốn đổi rồi bấm <strong>Áp dụng sửa</strong>. Ví dụ: <em>&quot;đổi nền sang màu tím, thêm lời kêu gọi đăng ký ở cuối trang&quot;</em>. Mỗi lần sửa dùng <strong>1 lượt AI</strong>.</p><p>Không ưng kết quả? Bấm <strong>Hoàn tác</strong> trên thẻ để quay lại bản ngay trước đó.</p><p>[ẢNH: thẻ landing page, khoanh đỏ nút &quot;Sửa trang này với AI&quot; và nút &quot;Hoàn tác&quot;]</p><p>Trên thẻ còn có nút đổi giữa khổ <strong>Desktop</strong> và <strong>Mobile</strong>, nút <strong>Xem toàn màn hình</strong>, và tab <strong>Mã nguồn</strong> nếu bạn cần chép mã.</p><h3>Lưu và xuất bản ngay trong chat</h3><p>Bấm <strong>Lưu &amp; xuất bản</strong> trên thẻ. Điền <strong>Tiêu đề</strong>, đặt <strong>Slug</strong> (phần đuôi của đường link, viết liền không dấu, ví dụ <em>khoa-hoc-marketing</em>), tích <strong>Xuất bản ngay</strong> nếu muốn trang chạy luôn, rồi bấm <strong>Lưu trang</strong>.</p><p>Lưu xong, thẻ có thêm <strong>Xem trang</strong> (mở trang thật), <strong>Mở trang soạn</strong> (sang trình sửa đầy đủ) và <strong>Ẩn trang</strong>. Sửa tiếp bằng AI rồi bấm <strong>Cập nhật trang đã lưu</strong> để đưa bản mới lên.</p><p>[ẢNH: hộp Lưu &amp; xuất bản với ô Tiêu đề, ô Slug và ô tích Xuất bản ngay]</p><p>Trang đã lưu nằm chung chỗ với các trang khác: <strong>menu bên trái</strong> → nhóm <strong>Landing page</strong> → mục <strong>Tạo Landing page</strong>. Tài khoản nhân viên cần được cấp quyền landing page mới lưu được.</p><h3>Liên quan</h3><ul><li><a href="/huong-dan/landing-page">Landing page thu khách hàng</a></li><li><a href="/huong-dan/bieu-mau">Biểu mẫu: thu thông tin, chia sẻ và nhúng vào website</a></li><li><a href="/huong-dan/ai-profile">Hồ sơ doanh nghiệp</a></li></ul>`,
  },
  {
    slug: 'bieu-mau',
    feature_key: 'landing-page',
    primary_route: '/app/forms',
    sort_order: 104,
    title: 'Biểu mẫu: thu thông tin, chia sẻ và nhúng vào website',
    summary: 'Tạo biểu mẫu thu thông tin khách giống Google Form: tự chọn màu, font, banner; chia sẻ bằng link, mã QR hoặc nhúng vào website; xem bài nộp và dùng lại trong chiến dịch.',
    body_md: `# Biểu mẫu: thu thông tin, chia sẻ và nhúng vào website
Biểu mẫu là một trang hỏi thông tin khách — đăng ký tư vấn, đăng ký sự kiện, đặt lịch hẹn. Cách dùng giống Google Form: bạn tự chọn câu hỏi, tự chỉnh giao diện, rồi gửi link hoặc nhúng vào website của mình.

## Tìm trang này trên màn hình
Ở **thanh menu bên trái**, bấm vào nhóm **Landing page** cho nó mở ra, rồi chọn mục **Biểu mẫu**.

[ẢNH: menu bên trái đang mở nhóm Landing page, khoanh đỏ mục "Biểu mẫu"]

Tài khoản nhân viên chỉ thấy mục này khi được chủ tài khoản cấp quyền biểu mẫu.

## Tạo biểu mẫu
Bấm **Tạo biểu mẫu mới**, điền **Tiêu đề biểu mẫu** và **Mô tả biểu mẫu**, rồi bấm **Thêm trường** cho từng câu hỏi. Mỗi biểu mẫu tối đa 30 trường.

| Kiểu dữ liệu | Dùng khi |
|---|---|
| Văn bản ngắn, Văn bản dài | Họ tên, ghi chú, câu hỏi mở |
| Email, Số điện thoại, Số, Ngày | Hệ thống tự kiểm tra khách điền đúng dạng |
| Hộp chọn, Nút chọn một, Hộp kiểm nhiều lựa chọn | Khách chọn trong danh sách bạn soạn sẵn, ví dụ chọn dịch vụ |

[ẢNH: trang soạn biểu mẫu, khoanh đỏ nút "Thêm trường" và một trường đang chọn kiểu dữ liệu]

### Đừng bỏ qua ô "Vai trò định danh"
Với ba trường họ tên, email, số điện thoại, hãy chọn đúng **Vai trò định danh** tương ứng. Nhờ đó hệ thống biết ô nào là email để gửi thư xác nhận, ô nào là số điện thoại để đưa vào chiến dịch. Không đặt vai trò thì biểu mẫu vẫn chạy, nhưng khách không nhận được thư và bài nộp không dùng lại được.

## Cài đặt biểu mẫu
- **Gửi email thông báo cho chủ form khi có bài nộp mới** — có khách điền là bạn biết ngay.
- **Gửi email xác nhận cho người điền sau khi nộp** — cần có trường Email.
- **Bật ô đồng ý nhận thông tin tiếp thị** — hiện một ô để khách tích đồng ý nhận tin. **Nên bật** nếu bạn định gửi chiến dịch cho những người này.
- **Chữ trên nút gửi**, **Thông báo sau khi nộp thành công**, và **Đường dẫn chuyển hướng sau khi nộp** nếu muốn đưa khách sang trang khác.

## Chỉnh giao diện
Kéo xuống mục **Giao diện**. Chọn một **Mẫu dựng sẵn** (Cổ điển, Thanh lịch, Tươi mới, Ấm áp, Nổi bật) hoặc tự đổi **Màu chủ đạo**, **Màu nền**, **Font chữ**, **Bố cục**, rồi tải **Ảnh banner** và **Ảnh logo**. Khung **Xem trước** ở dưới đổi theo ngay.

[ẢNH: mục Giao diện với hàng mẫu dựng sẵn, ô màu, ô font và khung Xem trước]

Xong thì bấm **Lưu biểu mẫu**. Biểu mẫu mới ở dạng **Bản nháp**; bấm nút hình con mắt ở trang danh sách để **Xuất bản** thì khách mới mở được.

## Chia sẻ và nhúng vào website
Ở trang danh sách, bấm nút **Chia sẻ & QR** trên dòng của biểu mẫu. Hộp hiện ra có bốn thứ:

| Thứ trong hộp | Dùng khi |
|---|---|
| **Đường dẫn trực tiếp** | Gửi link qua Zalo, email, gắn vào bài đăng |
| **Mã QR** kèm nút **Tải ảnh QR về máy** | In ra dán ở quầy, khách quét bằng camera là mở được biểu mẫu |
| **Mã nhúng landing** | Dán vào landing page hoặc website; biểu mẫu tự co giãn chiều cao |
| **Nhúng bằng iframe** | Dành cho nền tảng không cho chèn mã script |

[ẢNH: hộp Chia sẻ & QR, khoanh đỏ bốn phần: mã nhúng, mã QR, đường dẫn trực tiếp, mã iframe]

> Mã QR trong hộp này là mã của **đường link biểu mẫu**, không phải mã chuyển khoản. Đừng lấy app ngân hàng quét nó.

## Xem bài nộp
Ở trang danh sách, bấm vào số **bài nộp** của biểu mẫu. Mỗi dòng là một lượt khách điền: thời gian nộp, người nộp, câu trả lời, và cột **Đồng ý tiếp thị** (Có, Không, hoặc *Đã rút* nếu khách đã rút lại sự đồng ý).

[ẢNH: trang Bài nộp biểu mẫu với vài dòng bài nộp, khoanh đỏ cột "Đồng ý tiếp thị"]

## Gửi chiến dịch cho người đã điền
Trong sơ đồ chiến dịch, chọn nguồn người nhận **Dữ liệu Biểu mẫu** rồi chọn biểu mẫu. Nguồn này **chỉ lấy những người đã tích ô đồng ý nhận tin**. Người không tích, hoặc đã rút đồng ý, sẽ không nhận chiến dịch.

## Câu hỏi hay gặp
**Khách báo "Quá nhiều lần gửi form"?** Cùng một người gửi liên tục sẽ bị chặn tạm 15 phút để chống rác. Chờ rồi gửi lại.

**Biểu mẫu hiện "tạm ngừng"?** Gói của bạn đã hết hạn. Gia hạn gói là biểu mẫu nhận bài trở lại, dữ liệu cũ còn nguyên.

**Xoá biểu mẫu có mất bài nộp không?** Có. Xoá là mất vĩnh viễn cả biểu mẫu lẫn toàn bộ bài nộp, không khôi phục được.

## Liên quan
- [Đặt lịch hẹn và thu tiền giữ chỗ bằng mã QR](dat-lich-giu-cho)
- [Landing page thu khách hàng](landing-page)
- [Tạo chiến dịch](campaign-create)`,
    body_html: `<h2>Biểu mẫu: thu thông tin, chia sẻ và nhúng vào website</h2><p>Biểu mẫu là một trang hỏi thông tin khách — đăng ký tư vấn, đăng ký sự kiện, đặt lịch hẹn. Cách dùng giống Google Form: bạn tự chọn câu hỏi, tự chỉnh giao diện, rồi gửi link hoặc nhúng vào website của mình.</p><h3>Tìm trang này trên màn hình</h3><p>Ở <strong>thanh menu bên trái</strong>, bấm vào nhóm <strong>Landing page</strong> cho nó mở ra, rồi chọn mục <strong>Biểu mẫu</strong>.</p><p>[ẢNH: menu bên trái đang mở nhóm Landing page, khoanh đỏ mục &quot;Biểu mẫu&quot;]</p><p>Tài khoản nhân viên chỉ thấy mục này khi được chủ tài khoản cấp quyền biểu mẫu.</p><h3>Tạo biểu mẫu</h3><p>Bấm <strong>Tạo biểu mẫu mới</strong>, điền <strong>Tiêu đề biểu mẫu</strong> và <strong>Mô tả biểu mẫu</strong>, rồi bấm <strong>Thêm trường</strong> cho từng câu hỏi. Mỗi biểu mẫu tối đa 30 trường.</p><table><thead><tr><th>Kiểu dữ liệu</th><th>Dùng khi</th></tr></thead><tbody><tr><td>Văn bản ngắn, Văn bản dài</td><td>Họ tên, ghi chú, câu hỏi mở</td></tr><tr><td>Email, Số điện thoại, Số, Ngày</td><td>Hệ thống tự kiểm tra khách điền đúng dạng</td></tr><tr><td>Hộp chọn, Nút chọn một, Hộp kiểm nhiều lựa chọn</td><td>Khách chọn trong danh sách bạn soạn sẵn, ví dụ chọn dịch vụ</td></tr></tbody></table><p>[ẢNH: trang soạn biểu mẫu, khoanh đỏ nút &quot;Thêm trường&quot; và một trường đang chọn kiểu dữ liệu]</p><h4>Đừng bỏ qua ô &quot;Vai trò định danh&quot;</h4><p>Với ba trường họ tên, email, số điện thoại, hãy chọn đúng <strong>Vai trò định danh</strong> tương ứng. Nhờ đó hệ thống biết ô nào là email để gửi thư xác nhận, ô nào là số điện thoại để đưa vào chiến dịch. Không đặt vai trò thì biểu mẫu vẫn chạy, nhưng khách không nhận được thư và bài nộp không dùng lại được.</p><h3>Cài đặt biểu mẫu</h3><ul><li><strong>Gửi email thông báo cho chủ form khi có bài nộp mới</strong> — có khách điền là bạn biết ngay.</li><li><strong>Gửi email xác nhận cho người điền sau khi nộp</strong> — cần có trường Email.</li><li><strong>Bật ô đồng ý nhận thông tin tiếp thị</strong> — hiện một ô để khách tích đồng ý nhận tin. <strong>Nên bật</strong> nếu bạn định gửi chiến dịch cho những người này.</li><li><strong>Chữ trên nút gửi</strong>, <strong>Thông báo sau khi nộp thành công</strong>, và <strong>Đường dẫn chuyển hướng sau khi nộp</strong> nếu muốn đưa khách sang trang khác.</li></ul><h3>Chỉnh giao diện</h3><p>Kéo xuống mục <strong>Giao diện</strong>. Chọn một <strong>Mẫu dựng sẵn</strong> (Cổ điển, Thanh lịch, Tươi mới, Ấm áp, Nổi bật) hoặc tự đổi <strong>Màu chủ đạo</strong>, <strong>Màu nền</strong>, <strong>Font chữ</strong>, <strong>Bố cục</strong>, rồi tải <strong>Ảnh banner</strong> và <strong>Ảnh logo</strong>. Khung <strong>Xem trước</strong> ở dưới đổi theo ngay.</p><p>[ẢNH: mục Giao diện với hàng mẫu dựng sẵn, ô màu, ô font và khung Xem trước]</p><p>Xong thì bấm <strong>Lưu biểu mẫu</strong>. Biểu mẫu mới ở dạng <strong>Bản nháp</strong>; bấm nút hình con mắt ở trang danh sách để <strong>Xuất bản</strong> thì khách mới mở được.</p><h3>Chia sẻ và nhúng vào website</h3><p>Ở trang danh sách, bấm nút <strong>Chia sẻ &amp; QR</strong> trên dòng của biểu mẫu. Hộp hiện ra có bốn thứ:</p><table><thead><tr><th>Thứ trong hộp</th><th>Dùng khi</th></tr></thead><tbody><tr><td><strong>Đường dẫn trực tiếp</strong></td><td>Gửi link qua Zalo, email, gắn vào bài đăng</td></tr><tr><td><strong>Mã QR</strong> kèm nút <strong>Tải ảnh QR về máy</strong></td><td>In ra dán ở quầy, khách quét bằng camera là mở được biểu mẫu</td></tr><tr><td><strong>Mã nhúng landing</strong></td><td>Dán vào landing page hoặc website; biểu mẫu tự co giãn chiều cao</td></tr><tr><td><strong>Nhúng bằng iframe</strong></td><td>Dành cho nền tảng không cho chèn mã script</td></tr></tbody></table><p>[ẢNH: hộp Chia sẻ &amp; QR, khoanh đỏ bốn phần: mã nhúng, mã QR, đường dẫn trực tiếp, mã iframe]</p><blockquote><p>Mã QR trong hộp này là mã của <strong>đường link biểu mẫu</strong>, không phải mã chuyển khoản. Đừng lấy app ngân hàng quét nó.</p></blockquote><h3>Xem bài nộp</h3><p>Ở trang danh sách, bấm vào số <strong>bài nộp</strong> của biểu mẫu. Mỗi dòng là một lượt khách điền: thời gian nộp, người nộp, câu trả lời, và cột <strong>Đồng ý tiếp thị</strong> (Có, Không, hoặc <em>Đã rút</em> nếu khách đã rút lại sự đồng ý).</p><p>[ẢNH: trang Bài nộp biểu mẫu với vài dòng bài nộp, khoanh đỏ cột &quot;Đồng ý tiếp thị&quot;]</p><h3>Gửi chiến dịch cho người đã điền</h3><p>Trong sơ đồ chiến dịch, chọn nguồn người nhận <strong>Dữ liệu Biểu mẫu</strong> rồi chọn biểu mẫu. Nguồn này <strong>chỉ lấy những người đã tích ô đồng ý nhận tin</strong>. Người không tích, hoặc đã rút đồng ý, sẽ không nhận chiến dịch.</p><h3>Câu hỏi hay gặp</h3><p><strong>Khách báo &quot;Quá nhiều lần gửi form&quot;?</strong> Cùng một người gửi liên tục sẽ bị chặn tạm 15 phút để chống rác. Chờ rồi gửi lại.</p><p><strong>Biểu mẫu hiện &quot;tạm ngừng&quot;?</strong> Gói của bạn đã hết hạn. Gia hạn gói là biểu mẫu nhận bài trở lại, dữ liệu cũ còn nguyên.</p><p><strong>Xoá biểu mẫu có mất bài nộp không?</strong> Có. Xoá là mất vĩnh viễn cả biểu mẫu lẫn toàn bộ bài nộp, không khôi phục được.</p><h3>Liên quan</h3><ul><li><a href="/huong-dan/dat-lich-giu-cho">Đặt lịch hẹn và thu tiền giữ chỗ bằng mã QR</a></li><li><a href="/huong-dan/landing-page">Landing page thu khách hàng</a></li><li><a href="/huong-dan/campaign-create">Tạo chiến dịch</a></li></ul>`,
  },
  {
    slug: 'dat-lich-giu-cho',
    feature_key: 'landing-page',
    primary_route: '/app/forms',
    sort_order: 106,
    title: 'Đặt lịch hẹn và thu tiền giữ chỗ bằng mã QR',
    summary: 'Cho khách tự chọn ngày giờ hẹn ngay trên biểu mẫu, rồi chuyển khoản giữ chỗ qua mã QR ngân hàng hoặc ví MoMo. Tiền vào thẳng tài khoản của bạn.',
    body_md: `# Đặt lịch hẹn và thu tiền giữ chỗ bằng mã QR
Hai công tắc trong trang soạn biểu mẫu biến một biểu mẫu thường thành trang đặt lịch: khách chọn giờ, bấm gửi, rồi thấy mã QR để chuyển khoản giữ chỗ. Hai công tắc độc lập, bật một hay cả hai đều được.

## Tìm trang này trên màn hình
Ở **thanh menu bên trái**, mở nhóm **Landing page**, chọn mục **Biểu mẫu**, rồi bấm nút sửa (hình cây bút) trên biểu mẫu cần chỉnh. Kéo xuống dưới phần câu hỏi sẽ thấy hai mục **Đặt lịch hẹn** và **Thanh toán giữ chỗ**.

[ẢNH: trang soạn biểu mẫu kéo xuống giữa trang, khoanh đỏ hai mục "Đặt lịch hẹn" và "Thanh toán giữ chỗ"]

## Bật đặt lịch hẹn
Tích **Bật đặt lịch hẹn** rồi khai:

- **Khung giờ theo tuần** — giờ nhận khách của từng ngày. Bấm **Thêm khung giờ** để thêm. Khai xong Thứ 2 thì bấm **Áp khung giờ Thứ 2 cho tất cả các ngày** cho nhanh.
- **Sức chứa mỗi khung giờ** — điền 2 nghĩa là mỗi giờ nhận tối đa 2 khách, đủ thì giờ đó tự đóng. Để trống là không giới hạn.
- **Số ngày cho đặt trước** — khách được đặt xa nhất bao nhiêu ngày.
- **Báo trước tối thiểu (phút)** — điền 60 thì khách không đặt được giờ hẹn còn dưới 1 tiếng nữa.
- **Ngày nghỉ** — những ngày không nhận lịch.

Giờ tính theo **giờ Việt Nam**.

[ẢNH: mục Đặt lịch hẹn đã bật, thấy khung giờ từng ngày và ba ô sức chứa, số ngày đặt trước, báo trước tối thiểu]

Muốn khách nhận **thư xác nhận** và **thư nhắc trước giờ hẹn 24 tiếng**, biểu mẫu phải có trường Email (đặt đúng vai trò Email) và bật **Gửi email xác nhận** ở phần Cài đặt. Thiếu một trong hai, mục Đặt lịch hẹn sẽ hiện dòng nhắc màu xanh.

> Tắt đặt lịch rồi lưu sẽ **xoá toàn bộ khung giờ, sức chứa và ngày nghỉ** đã khai. Hệ thống bắt bạn tích xác nhận trước khi lưu.

## Bật thanh toán giữ chỗ
Tích **Bật thanh toán**, chọn phương thức, điền **Số tiền cần chuyển** (từ 1.000đ) và **Giữ chỗ trong (phút)** — từ 10 đến 120 phút.

| Phương thức | Bạn khai gì | Khách thấy gì |
|---|---|---|
| **Chuyển khoản ngân hàng** | Ngân hàng, Số tài khoản, Tên chủ tài khoản | **Mã QR chuyển khoản** kèm đủ thông tin để sao chép |
| **Ví MoMo** | Số điện thoại ví, Tên chủ ví | Số ví, tên, số tiền, nội dung để khách tự chuyển. Không có mã QR |

[ẢNH: mục Thanh toán giữ chỗ đang chọn Chuyển khoản ngân hàng, đã điền ngân hàng, số tài khoản, tên chủ tài khoản, số tiền]

Ba điều cần biết:

- **Tiền vào thẳng tài khoản của bạn.** Founder AI không giữ tiền và không tự biết tiền đã về.
- **Chỉ chủ tài khoản** sửa được thông tin nhận tiền. Nhân viên chỉ xem.
- Mã QR được tạo từ đúng số tài khoản bạn khai, theo chuẩn VietQR mà các app ngân hàng đều quét được.

## Khách đặt lịch thấy gì
Khách mở biểu mẫu, thấy ngay dòng báo số tiền cần chuyển, điền thông tin, chọn ngày giờ còn chỗ rồi bấm gửi. Màn tiếp theo hiện:

- Đồng hồ **Giữ chỗ trong** đếm ngược.
- **Mã QR chuyển khoản** (nếu bạn chọn ngân hàng).
- Ngân hàng, số tài khoản, chủ tài khoản, số tiền và **Nội dung chuyển khoản**, mỗi dòng có nút **Sao chép**.

[ẢNH: màn giữ chỗ trên điện thoại của khách: đồng hồ đếm ngược, mã QR chuyển khoản và các dòng thông tin có nút Sao chép]

**Nội dung chuyển khoản** là một mã riêng cho từng lượt đặt. Khách phải ghi đúng mã này thì bạn mới biết tiền nào của ai.

> Khách đặt lịch bằng điện thoại thì không tự quét được màn hình của chính mình. Khi đó khách bấm **Sao chép** từng dòng rồi dán vào app ngân hàng.

## Bạn xác nhận đã nhận tiền
Mở trang bài nộp của biểu mẫu. Lượt đặt mới nằm ở trạng thái **Chờ thanh toán**, kèm mã nội dung và số tiền. Mở app ngân hàng, thấy tiền về đúng mã đó thì bấm **Đã nhận tiền**. Lúc này lịch hẹn mới được chốt.

[ẢNH: trang Bài nộp, một dòng đang "Chờ thanh toán", khoanh đỏ cột "Mã & số tiền" và nút "Đã nhận tiền"]

| Trạng thái | Nghĩa là |
|---|---|
| **Chờ thanh toán** | Khách đã đặt, đang giữ chỗ, bạn chưa bấm xác nhận |
| **Đã xác nhận** | Lịch hẹn đã chốt. Biểu mẫu có thu tiền thì vào trạng thái này sau khi bạn bấm Đã nhận tiền; biểu mẫu chỉ đặt lịch, không thu tiền thì vào thẳng trạng thái này |
| **Hết hạn giữ chỗ** | Quá thời gian giữ chỗ mà chưa xác nhận. Chỗ được mở lại cho người khác |
| **Đã huỷ** | Bạn bấm Huỷ lượt này |
| **Đã đặt** | Bài nộp của biểu mẫu thường, không bật đặt lịch lẫn thanh toán |

Dùng ô **Lọc theo ngày hẹn** và nút **Hôm nay** để xem lịch từng ngày.

## Câu hỏi hay gặp
**Khách chuyển tiền muộn, quá giờ giữ chỗ?** Bạn vẫn bấm **Đã nhận tiền** được, miễn giờ đó còn chỗ. Nếu người khác đã lấy mất, hệ thống báo *Khung giờ này đã hết chỗ* — bạn liên hệ khách để đổi giờ.

**App ngân hàng báo mã QR không hợp lệ?** Gần như chắc chắn là quét nhầm mã trong hộp **Chia sẻ & QR**. Mã đó chỉ chứa đường link biểu mẫu. Mã chuyển khoản chỉ hiện ra **sau khi** khách bấm gửi biểu mẫu.

**Quét bằng camera thường chỉ ra một dãy số dài?** Đúng rồi, mã chuyển khoản phải quét bằng **app ngân hàng**, không phải camera.

**Không thấy ngân hàng của tôi trong danh sách?** Danh sách hiện có 39 ngân hàng. Ngân hàng của bạn chưa có thì tạm dùng phương thức **Ví MoMo**, hoặc một tài khoản ngân hàng khác.

## Liên quan
- [Biểu mẫu: thu thông tin, chia sẻ và nhúng vào website](bieu-mau)
- [Landing page thu khách hàng](landing-page)
- [Nhân viên & phân quyền](nhan-vien)`,
    body_html: `<h2>Đặt lịch hẹn và thu tiền giữ chỗ bằng mã QR</h2><p>Hai công tắc trong trang soạn biểu mẫu biến một biểu mẫu thường thành trang đặt lịch: khách chọn giờ, bấm gửi, rồi thấy mã QR để chuyển khoản giữ chỗ. Hai công tắc độc lập, bật một hay cả hai đều được.</p><h3>Tìm trang này trên màn hình</h3><p>Ở <strong>thanh menu bên trái</strong>, mở nhóm <strong>Landing page</strong>, chọn mục <strong>Biểu mẫu</strong>, rồi bấm nút sửa (hình cây bút) trên biểu mẫu cần chỉnh. Kéo xuống dưới phần câu hỏi sẽ thấy hai mục <strong>Đặt lịch hẹn</strong> và <strong>Thanh toán giữ chỗ</strong>.</p><p>[ẢNH: trang soạn biểu mẫu kéo xuống giữa trang, khoanh đỏ hai mục &quot;Đặt lịch hẹn&quot; và &quot;Thanh toán giữ chỗ&quot;]</p><h3>Bật đặt lịch hẹn</h3><p>Tích <strong>Bật đặt lịch hẹn</strong> rồi khai:</p><ul><li><strong>Khung giờ theo tuần</strong> — giờ nhận khách của từng ngày. Bấm <strong>Thêm khung giờ</strong> để thêm. Khai xong Thứ 2 thì bấm <strong>Áp khung giờ Thứ 2 cho tất cả các ngày</strong> cho nhanh.</li><li><strong>Sức chứa mỗi khung giờ</strong> — điền 2 nghĩa là mỗi giờ nhận tối đa 2 khách, đủ thì giờ đó tự đóng. Để trống là không giới hạn.</li><li><strong>Số ngày cho đặt trước</strong> — khách được đặt xa nhất bao nhiêu ngày.</li><li><strong>Báo trước tối thiểu (phút)</strong> — điền 60 thì khách không đặt được giờ hẹn còn dưới 1 tiếng nữa.</li><li><strong>Ngày nghỉ</strong> — những ngày không nhận lịch.</li></ul><p>Giờ tính theo <strong>giờ Việt Nam</strong>.</p><p>[ẢNH: mục Đặt lịch hẹn đã bật, thấy khung giờ từng ngày và ba ô sức chứa, số ngày đặt trước, báo trước tối thiểu]</p><p>Muốn khách nhận <strong>thư xác nhận</strong> và <strong>thư nhắc trước giờ hẹn 24 tiếng</strong>, biểu mẫu phải có trường Email (đặt đúng vai trò Email) và bật <strong>Gửi email xác nhận</strong> ở phần Cài đặt. Thiếu một trong hai, mục Đặt lịch hẹn sẽ hiện dòng nhắc màu xanh.</p><blockquote><p>Tắt đặt lịch rồi lưu sẽ <strong>xoá toàn bộ khung giờ, sức chứa và ngày nghỉ</strong> đã khai. Hệ thống bắt bạn tích xác nhận trước khi lưu.</p></blockquote><h3>Bật thanh toán giữ chỗ</h3><p>Tích <strong>Bật thanh toán</strong>, chọn phương thức, điền <strong>Số tiền cần chuyển</strong> (từ 1.000đ) và <strong>Giữ chỗ trong (phút)</strong> — từ 10 đến 120 phút.</p><table><thead><tr><th>Phương thức</th><th>Bạn khai gì</th><th>Khách thấy gì</th></tr></thead><tbody><tr><td><strong>Chuyển khoản ngân hàng</strong></td><td>Ngân hàng, Số tài khoản, Tên chủ tài khoản</td><td><strong>Mã QR chuyển khoản</strong> kèm đủ thông tin để sao chép</td></tr><tr><td><strong>Ví MoMo</strong></td><td>Số điện thoại ví, Tên chủ ví</td><td>Số ví, tên, số tiền, nội dung để khách tự chuyển. Không có mã QR</td></tr></tbody></table><p>[ẢNH: mục Thanh toán giữ chỗ đang chọn Chuyển khoản ngân hàng, đã điền ngân hàng, số tài khoản, tên chủ tài khoản, số tiền]</p><p>Ba điều cần biết:</p><ul><li><strong>Tiền vào thẳng tài khoản của bạn.</strong> Founder AI không giữ tiền và không tự biết tiền đã về.</li><li><strong>Chỉ chủ tài khoản</strong> sửa được thông tin nhận tiền. Nhân viên chỉ xem.</li><li>Mã QR được tạo từ đúng số tài khoản bạn khai, theo chuẩn VietQR mà các app ngân hàng đều quét được.</li></ul><h3>Khách đặt lịch thấy gì</h3><p>Khách mở biểu mẫu, thấy ngay dòng báo số tiền cần chuyển, điền thông tin, chọn ngày giờ còn chỗ rồi bấm gửi. Màn tiếp theo hiện:</p><ul><li>Đồng hồ <strong>Giữ chỗ trong</strong> đếm ngược.</li><li><strong>Mã QR chuyển khoản</strong> (nếu bạn chọn ngân hàng).</li><li>Ngân hàng, số tài khoản, chủ tài khoản, số tiền và <strong>Nội dung chuyển khoản</strong>, mỗi dòng có nút <strong>Sao chép</strong>.</li></ul><p>[ẢNH: màn giữ chỗ trên điện thoại của khách: đồng hồ đếm ngược, mã QR chuyển khoản và các dòng thông tin có nút Sao chép]</p><p><strong>Nội dung chuyển khoản</strong> là một mã riêng cho từng lượt đặt. Khách phải ghi đúng mã này thì bạn mới biết tiền nào của ai.</p><blockquote><p>Khách đặt lịch bằng điện thoại thì không tự quét được màn hình của chính mình. Khi đó khách bấm <strong>Sao chép</strong> từng dòng rồi dán vào app ngân hàng.</p></blockquote><h3>Bạn xác nhận đã nhận tiền</h3><p>Mở trang bài nộp của biểu mẫu. Lượt đặt mới nằm ở trạng thái <strong>Chờ thanh toán</strong>, kèm mã nội dung và số tiền. Mở app ngân hàng, thấy tiền về đúng mã đó thì bấm <strong>Đã nhận tiền</strong>. Lúc này lịch hẹn mới được chốt.</p><p>[ẢNH: trang Bài nộp, một dòng đang &quot;Chờ thanh toán&quot;, khoanh đỏ cột &quot;Mã &amp; số tiền&quot; và nút &quot;Đã nhận tiền&quot;]</p><table><thead><tr><th>Trạng thái</th><th>Nghĩa là</th></tr></thead><tbody><tr><td><strong>Chờ thanh toán</strong></td><td>Khách đã đặt, đang giữ chỗ, bạn chưa bấm xác nhận</td></tr><tr><td><strong>Đã xác nhận</strong></td><td>Lịch hẹn đã chốt. Biểu mẫu có thu tiền thì vào trạng thái này sau khi bạn bấm Đã nhận tiền; biểu mẫu chỉ đặt lịch, không thu tiền thì vào thẳng trạng thái này</td></tr><tr><td><strong>Hết hạn giữ chỗ</strong></td><td>Quá thời gian giữ chỗ mà chưa xác nhận. Chỗ được mở lại cho người khác</td></tr><tr><td><strong>Đã huỷ</strong></td><td>Bạn bấm Huỷ lượt này</td></tr><tr><td><strong>Đã đặt</strong></td><td>Bài nộp của biểu mẫu thường, không bật đặt lịch lẫn thanh toán</td></tr></tbody></table><p>Dùng ô <strong>Lọc theo ngày hẹn</strong> và nút <strong>Hôm nay</strong> để xem lịch từng ngày.</p><h3>Câu hỏi hay gặp</h3><p><strong>Khách chuyển tiền muộn, quá giờ giữ chỗ?</strong> Bạn vẫn bấm <strong>Đã nhận tiền</strong> được, miễn giờ đó còn chỗ. Nếu người khác đã lấy mất, hệ thống báo <em>Khung giờ này đã hết chỗ</em> — bạn liên hệ khách để đổi giờ.</p><p><strong>App ngân hàng báo mã QR không hợp lệ?</strong> Gần như chắc chắn là quét nhầm mã trong hộp <strong>Chia sẻ &amp; QR</strong>. Mã đó chỉ chứa đường link biểu mẫu. Mã chuyển khoản chỉ hiện ra <strong>sau khi</strong> khách bấm gửi biểu mẫu.</p><p><strong>Quét bằng camera thường chỉ ra một dãy số dài?</strong> Đúng rồi, mã chuyển khoản phải quét bằng <strong>app ngân hàng</strong>, không phải camera.</p><p><strong>Không thấy ngân hàng của tôi trong danh sách?</strong> Danh sách hiện có 39 ngân hàng. Ngân hàng của bạn chưa có thì tạm dùng phương thức <strong>Ví MoMo</strong>, hoặc một tài khoản ngân hàng khác.</p><h3>Liên quan</h3><ul><li><a href="/huong-dan/bieu-mau">Biểu mẫu: thu thông tin, chia sẻ và nhúng vào website</a></li><li><a href="/huong-dan/landing-page">Landing page thu khách hàng</a></li><li><a href="/huong-dan/nhan-vien">Nhân viên &amp; phân quyền</a></li></ul>`,
  },
  {
    slug: 'doi-tac',
    feature_key: 'plan-and-billing',
    primary_route: '/app/affiliate',
    sort_order: 135,
    title: 'Chương trình đối tác: giới thiệu bạn bè, nhận hoa hồng',
    summary: 'Chia sẻ mã hoặc link giới thiệu, nhận hoa hồng từ 10% đến 30% doanh thu mỗi tháng của những người bạn giới thiệu. Rút về tài khoản ngân hàng từ 1.000.000đ.',
    body_md: `# Chương trình đối tác: giới thiệu bạn bè, nhận hoa hồng
Bạn giới thiệu người khác dùng Founder AI. Khi họ mua gói, bạn nhận hoa hồng tính trên số tiền họ trả, từ **10% đến 30%** tuỳ doanh thu trong tháng.

## Tìm trang này trên màn hình
Ở **thanh menu bên trái**, bấm mục **Chương trình đối tác**. Mục này nằm riêng, không thuộc nhóm nào, và chỉ **chủ tài khoản** mới thấy.

[ẢNH: menu bên trái, khoanh đỏ mục "Chương trình đối tác"]

## Lấy mã và link giới thiệu
Trong khối **Thông tin giới thiệu** có **Mã giới thiệu** và **Link giới thiệu** của riêng bạn, mỗi cái có nút sao chép.

[ẢNH: khối Thông tin giới thiệu, khoanh đỏ mã giới thiệu, link giới thiệu và hai nút sao chép]

Người được giới thiệu gắn với bạn bằng một trong hai cách:

1. Đăng ký tài khoản qua **link giới thiệu** của bạn.
2. Tự nhập **mã giới thiệu** ở ô *Mã giới thiệu (không bắt buộc)* khi đăng ký, hoặc ở hộp hỏi mã hiện ra ngay sau khi tạo tài khoản.

> Hộp hỏi mã chỉ hiện **trong 24 giờ đầu** sau khi tạo tài khoản. Bấm bỏ qua rồi thì không nhập lại được. Hãy dặn bạn bè nhập mã ngay lúc đăng ký.

## Năm bậc hoa hồng
Bậc tính theo **tổng doanh thu hợp lệ trong tháng** từ tất cả người bạn giới thiệu:

| Bậc | Doanh thu trong tháng | Tỉ lệ hoa hồng |
|---|---|---|
| 1 | Dưới 10.000.000đ | 10% |
| 2 | 10.000.000 – 20.000.000đ | 15% |
| 3 | 20.000.000 – 50.000.000đ | 20% |
| 4 | 50.000.000 – 100.000.000đ | 25% |
| 5 | Từ 100.000.000đ | 30% |

Hai điều hay hiểu nhầm:

- Lên bậc giữa tháng thì tỉ lệ mới áp cho **toàn bộ** doanh thu tháng đó, không phải chỉ phần vượt.
- Doanh thu tính bậc **về 0 mỗi đầu tháng**. Còn **Số dư ví khả dụng** thì cộng dồn mãi tới khi bạn rút.

[ẢNH: thẻ hoa hồng tháng với thang 5 bậc, thấy bậc hiện tại, doanh thu tháng này và hoa hồng ước tính]

## Khi nào tiền vào ví
Trong tháng, trang chỉ hiện **Hoa hồng ước tính**. Hoa hồng được **chốt sổ đầu tháng sau**, lúc đó mới cộng vào **Số dư ví khả dụng**. Xem lại từng tháng ở bảng **Lịch sử hoa hồng theo tháng**.

## Đơn hàng đang chờ đủ điều kiện
Đơn của người mua **chưa cập nhật số điện thoại tài khoản** thì chưa được tính doanh thu hợp lệ. Trang liệt kê các đơn này ở mục **Đơn hàng đang chờ đủ điều kiện**. Bạn nhắc họ bổ sung số điện thoại trước ngày chốt sổ là đơn được tính.

## Rút tiền
Bấm **Yêu cầu rút tiền** khi số dư từ **1.000.000đ** trở lên. Điền:

- **Số tiền muốn rút**, hoặc bấm **Rút tất cả**.
- **Thông tin cá nhân & Giấy tờ**: họ tên, số CCCD, ngày cấp, nơi cấp.
- **Tài khoản ngân hàng thụ hưởng**: tên chủ tài khoản phải trùng với họ tên trên giấy tờ.

[ẢNH: hộp Yêu cầu rút tiền hoa hồng, thấy phần chi tiết khấu trừ và thực nhận]

Đối tác cá nhân bị **khấu trừ 10% thuế thu nhập cá nhân** theo quy định; hộp rút tiền ghi rõ số tiền **Thực nhận** trước khi bạn gửi. Kế toán xử lý trong **7 ngày làm việc**. Mỗi lúc chỉ có một yêu cầu rút đang chờ. Theo dõi ở bảng **Lịch sử rút hoa hồng**.

Kênh đối tác **Doanh nghiệp / Tổ chức** (xuất hoá đơn GTGT) chưa mở, sẽ có ở đợt sau.

## Liên quan
- [Gói dịch vụ & thanh toán](plan-and-billing)
- [Câu hỏi thường gặp về thanh toán & hoá đơn](faq-billing)
- [Bắt đầu với Founder AI — 4 bước](getting-started)`,
    body_html: `<h2>Chương trình đối tác: giới thiệu bạn bè, nhận hoa hồng</h2><p>Bạn giới thiệu người khác dùng Founder AI. Khi họ mua gói, bạn nhận hoa hồng tính trên số tiền họ trả, từ <strong>10% đến 30%</strong> tuỳ doanh thu trong tháng.</p><h3>Tìm trang này trên màn hình</h3><p>Ở <strong>thanh menu bên trái</strong>, bấm mục <strong>Chương trình đối tác</strong>. Mục này nằm riêng, không thuộc nhóm nào, và chỉ <strong>chủ tài khoản</strong> mới thấy.</p><p>[ẢNH: menu bên trái, khoanh đỏ mục &quot;Chương trình đối tác&quot;]</p><h3>Lấy mã và link giới thiệu</h3><p>Trong khối <strong>Thông tin giới thiệu</strong> có <strong>Mã giới thiệu</strong> và <strong>Link giới thiệu</strong> của riêng bạn, mỗi cái có nút sao chép.</p><p>[ẢNH: khối Thông tin giới thiệu, khoanh đỏ mã giới thiệu, link giới thiệu và hai nút sao chép]</p><p>Người được giới thiệu gắn với bạn bằng một trong hai cách:</p><ol><li>Đăng ký tài khoản qua <strong>link giới thiệu</strong> của bạn.</li><li>Tự nhập <strong>mã giới thiệu</strong> ở ô <em>Mã giới thiệu (không bắt buộc)</em> khi đăng ký, hoặc ở hộp hỏi mã hiện ra ngay sau khi tạo tài khoản.</li></ol><blockquote><p>Hộp hỏi mã chỉ hiện <strong>trong 24 giờ đầu</strong> sau khi tạo tài khoản. Bấm bỏ qua rồi thì không nhập lại được. Hãy dặn bạn bè nhập mã ngay lúc đăng ký.</p></blockquote><h3>Năm bậc hoa hồng</h3><p>Bậc tính theo <strong>tổng doanh thu hợp lệ trong tháng</strong> từ tất cả người bạn giới thiệu:</p><table><thead><tr><th>Bậc</th><th>Doanh thu trong tháng</th><th>Tỉ lệ hoa hồng</th></tr></thead><tbody><tr><td>1</td><td>Dưới 10.000.000đ</td><td>10%</td></tr><tr><td>2</td><td>10.000.000 – 20.000.000đ</td><td>15%</td></tr><tr><td>3</td><td>20.000.000 – 50.000.000đ</td><td>20%</td></tr><tr><td>4</td><td>50.000.000 – 100.000.000đ</td><td>25%</td></tr><tr><td>5</td><td>Từ 100.000.000đ</td><td>30%</td></tr></tbody></table><p>Hai điều hay hiểu nhầm:</p><ul><li>Lên bậc giữa tháng thì tỉ lệ mới áp cho <strong>toàn bộ</strong> doanh thu tháng đó, không phải chỉ phần vượt.</li><li>Doanh thu tính bậc <strong>về 0 mỗi đầu tháng</strong>. Còn <strong>Số dư ví khả dụng</strong> thì cộng dồn mãi tới khi bạn rút.</li></ul><p>[ẢNH: thẻ hoa hồng tháng với thang 5 bậc, thấy bậc hiện tại, doanh thu tháng này và hoa hồng ước tính]</p><h3>Khi nào tiền vào ví</h3><p>Trong tháng, trang chỉ hiện <strong>Hoa hồng ước tính</strong>. Hoa hồng được <strong>chốt sổ đầu tháng sau</strong>, lúc đó mới cộng vào <strong>Số dư ví khả dụng</strong>. Xem lại từng tháng ở bảng <strong>Lịch sử hoa hồng theo tháng</strong>.</p><h3>Đơn hàng đang chờ đủ điều kiện</h3><p>Đơn của người mua <strong>chưa cập nhật số điện thoại tài khoản</strong> thì chưa được tính doanh thu hợp lệ. Trang liệt kê các đơn này ở mục <strong>Đơn hàng đang chờ đủ điều kiện</strong>. Bạn nhắc họ bổ sung số điện thoại trước ngày chốt sổ là đơn được tính.</p><h3>Rút tiền</h3><p>Bấm <strong>Yêu cầu rút tiền</strong> khi số dư từ <strong>1.000.000đ</strong> trở lên. Điền:</p><ul><li><strong>Số tiền muốn rút</strong>, hoặc bấm <strong>Rút tất cả</strong>.</li><li><strong>Thông tin cá nhân &amp; Giấy tờ</strong>: họ tên, số CCCD, ngày cấp, nơi cấp.</li><li><strong>Tài khoản ngân hàng thụ hưởng</strong>: tên chủ tài khoản phải trùng với họ tên trên giấy tờ.</li></ul><p>[ẢNH: hộp Yêu cầu rút tiền hoa hồng, thấy phần chi tiết khấu trừ và thực nhận]</p><p>Đối tác cá nhân bị <strong>khấu trừ 10% thuế thu nhập cá nhân</strong> theo quy định; hộp rút tiền ghi rõ số tiền <strong>Thực nhận</strong> trước khi bạn gửi. Kế toán xử lý trong <strong>7 ngày làm việc</strong>. Mỗi lúc chỉ có một yêu cầu rút đang chờ. Theo dõi ở bảng <strong>Lịch sử rút hoa hồng</strong>.</p><p>Kênh đối tác <strong>Doanh nghiệp / Tổ chức</strong> (xuất hoá đơn GTGT) chưa mở, sẽ có ở đợt sau.</p><h3>Liên quan</h3><ul><li><a href="/huong-dan/plan-and-billing">Gói dịch vụ &amp; thanh toán</a></li><li><a href="/huong-dan/faq-billing">Câu hỏi thường gặp về thanh toán &amp; hoá đơn</a></li><li><a href="/huong-dan/getting-started">Bắt đầu với Founder AI — 4 bước</a></li></ul>`,
  },
  {
    slug: 'tai-khoan-dieu-khoan-sdt',
    feature_key: 'getting-started',
    primary_route: '/app',
    sort_order: 8,
    title: 'Hai hộp thoại sau khi đăng nhập: đồng ý điều khoản và số điện thoại',
    summary: 'Vì sao vừa đăng nhập đã bị hỏi đồng ý điều khoản và số điện thoại, cái nào bắt buộc, cái nào để sau được, và số điện thoại nhập thế nào cho đúng.',
    body_md: `# Hai hộp thoại sau khi đăng nhập: đồng ý điều khoản và số điện thoại
Sau khi đăng nhập, bạn có thể gặp hai hộp thoại hiện giữa màn hình. Chúng hiện ở **mọi trang**, theo thứ tự: đồng ý điều khoản trước, số điện thoại sau.

## Hộp thoại đồng ý điều khoản — bắt buộc
Tiêu đề **Cập nhật thoả thuận điều khoản & dữ liệu cá nhân**. Theo Nghị định 330/2026 về bảo vệ dữ liệu cá nhân, hệ thống phải có sự đồng ý rõ ràng của bạn trước khi xử lý dữ liệu. Bạn tích đủ **ba ô**:

- **Điều khoản dịch vụ**
- **Chính sách bảo mật**
- **Thoả thuận Xử lý Dữ liệu Cá nhân**

rồi bấm **Đồng ý và tiếp tục**. Thiếu một ô là chưa đi tiếp được.

[ẢNH: hộp thoại Cập nhật thoả thuận điều khoản, ba ô tích và nút Đồng ý và tiếp tục]

Hộp thoại này **không có nút Để sau**. Nếu không đồng ý, bấm **Không đồng ý và đăng xuất**. Muốn xoá hẳn tài khoản và dữ liệu thì bấm **Liên hệ hỗ trợ** ngay trong hộp thoại.

### Đã đồng ý rồi sao lại bị hỏi lại
Khi một trong ba văn bản có phiên bản mới, hộp thoại hiện lại với tiêu đề **Văn bản pháp lý đã cập nhật, vui lòng xác nhận lại**. Đọc bản mới rồi đồng ý lại là xong. Người đăng ký bằng Google cũng gặp hộp thoại này ở lần đăng nhập đầu.

## Hộp thoại Bổ sung số điện thoại — để sau được
Hộp thoại này chỉ hiện khi tài khoản **chưa có số điện thoại**, thường là do đăng ký bằng Google. Bạn nhập số rồi bấm **Xác nhận**, hoặc bấm **Để sau** và vẫn dùng hệ thống bình thường.

[ẢNH: hộp thoại Bổ sung số điện thoại với ô nhập số, nút Để sau và nút Xác nhận]

Nên nhập sớm, vì:

- Mục **Biểu mẫu** (tạo form, đặt lịch, thu tiền giữ chỗ) chỉ dùng được khi tài khoản đã có số điện thoại.
- Nếu bạn được ai đó giới thiệu, đơn mua gói của bạn chỉ tính hoa hồng cho họ khi bạn đã có số điện thoại.
- Đội hỗ trợ cần số để gọi khi tài khoản có sự cố.

### Nhập số thế nào cho đúng
| Loại số | Cách nhập | Ví dụ |
|---|---|---|
| Di động Việt Nam | 10 chữ số | 0912345678 |
| Số bàn Việt Nam | Kèm mã vùng | 02838123456 |
| Số nước ngoài | Bắt buộc có dấu + và mã quốc gia | +1 415 555 2671 |

**Một số điện thoại chỉ gắn được với một tài khoản.** Số đã dùng cho tài khoản khác thì hệ thống báo trùng; hãy dùng số khác hoặc đăng nhập lại tài khoản cũ.

[ẢNH: hộp thoại Bổ sung số điện thoại đang báo lỗi số không hợp lệ, thấy dòng hướng dẫn định dạng]

## Liên quan
- [Bắt đầu với Founder AI — 4 bước](getting-started)
- [Biểu mẫu: thu thông tin, chia sẻ và nhúng vào website](bieu-mau)
- [Chương trình đối tác: giới thiệu bạn bè, nhận hoa hồng](doi-tac)`,
    body_html: `<h2>Hai hộp thoại sau khi đăng nhập: đồng ý điều khoản và số điện thoại</h2><p>Sau khi đăng nhập, bạn có thể gặp hai hộp thoại hiện giữa màn hình. Chúng hiện ở <strong>mọi trang</strong>, theo thứ tự: đồng ý điều khoản trước, số điện thoại sau.</p><h3>Hộp thoại đồng ý điều khoản — bắt buộc</h3><p>Tiêu đề <strong>Cập nhật thoả thuận điều khoản &amp; dữ liệu cá nhân</strong>. Theo Nghị định 330/2026 về bảo vệ dữ liệu cá nhân, hệ thống phải có sự đồng ý rõ ràng của bạn trước khi xử lý dữ liệu. Bạn tích đủ <strong>ba ô</strong>:</p><ul><li><strong>Điều khoản dịch vụ</strong></li><li><strong>Chính sách bảo mật</strong></li><li><strong>Thoả thuận Xử lý Dữ liệu Cá nhân</strong></li></ul><p>rồi bấm <strong>Đồng ý và tiếp tục</strong>. Thiếu một ô là chưa đi tiếp được.</p><p>[ẢNH: hộp thoại Cập nhật thoả thuận điều khoản, ba ô tích và nút Đồng ý và tiếp tục]</p><p>Hộp thoại này <strong>không có nút Để sau</strong>. Nếu không đồng ý, bấm <strong>Không đồng ý và đăng xuất</strong>. Muốn xoá hẳn tài khoản và dữ liệu thì bấm <strong>Liên hệ hỗ trợ</strong> ngay trong hộp thoại.</p><h4>Đã đồng ý rồi sao lại bị hỏi lại</h4><p>Khi một trong ba văn bản có phiên bản mới, hộp thoại hiện lại với tiêu đề <strong>Văn bản pháp lý đã cập nhật, vui lòng xác nhận lại</strong>. Đọc bản mới rồi đồng ý lại là xong. Người đăng ký bằng Google cũng gặp hộp thoại này ở lần đăng nhập đầu.</p><h3>Hộp thoại Bổ sung số điện thoại — để sau được</h3><p>Hộp thoại này chỉ hiện khi tài khoản <strong>chưa có số điện thoại</strong>, thường là do đăng ký bằng Google. Bạn nhập số rồi bấm <strong>Xác nhận</strong>, hoặc bấm <strong>Để sau</strong> và vẫn dùng hệ thống bình thường.</p><p>[ẢNH: hộp thoại Bổ sung số điện thoại với ô nhập số, nút Để sau và nút Xác nhận]</p><p>Nên nhập sớm, vì:</p><ul><li>Mục <strong>Biểu mẫu</strong> (tạo form, đặt lịch, thu tiền giữ chỗ) chỉ dùng được khi tài khoản đã có số điện thoại.</li><li>Nếu bạn được ai đó giới thiệu, đơn mua gói của bạn chỉ tính hoa hồng cho họ khi bạn đã có số điện thoại.</li><li>Đội hỗ trợ cần số để gọi khi tài khoản có sự cố.</li></ul><h4>Nhập số thế nào cho đúng</h4><table><thead><tr><th>Loại số</th><th>Cách nhập</th><th>Ví dụ</th></tr></thead><tbody><tr><td>Di động Việt Nam</td><td>10 chữ số</td><td>0912345678</td></tr><tr><td>Số bàn Việt Nam</td><td>Kèm mã vùng</td><td>02838123456</td></tr><tr><td>Số nước ngoài</td><td>Bắt buộc có dấu + và mã quốc gia</td><td>+1 415 555 2671</td></tr></tbody></table><p><strong>Một số điện thoại chỉ gắn được với một tài khoản.</strong> Số đã dùng cho tài khoản khác thì hệ thống báo trùng; hãy dùng số khác hoặc đăng nhập lại tài khoản cũ.</p><p>[ẢNH: hộp thoại Bổ sung số điện thoại đang báo lỗi số không hợp lệ, thấy dòng hướng dẫn định dạng]</p><h3>Liên quan</h3><ul><li><a href="/huong-dan/getting-started">Bắt đầu với Founder AI — 4 bước</a></li><li><a href="/huong-dan/bieu-mau">Biểu mẫu: thu thông tin, chia sẻ và nhúng vào website</a></li><li><a href="/huong-dan/doi-tac">Chương trình đối tác: giới thiệu bạn bè, nhận hoa hồng</a></li></ul>`,
  },
  {
    slug: 'lien-he-khach-de-lai',
    feature_key: 'inbox',
    primary_route: '/app/settings/inbox',
    sort_order: 95,
    title: 'Liên hệ khách để lại trong chat và thư tổng hợp',
    summary: 'Khách nhắn số điện thoại hoặc email cho chatbot là hệ thống tự ghi vào một sổ riêng và gửi email báo cho bạn. Kèm thư tổng hợp hội thoại hàng tuần hoặc hàng tháng.',
    body_md: `# Liên hệ khách để lại trong chat và thư tổng hợp
Khách đang hỏi chatbot mà nhắn lại số điện thoại hoặc email là khách nóng. Hệ thống tự nhặt các thông tin đó ra, ghi vào một sổ riêng và gửi email báo cho bạn, để bạn gọi lại kịp lúc.

## Tìm trang này trên màn hình
Ở **thanh menu bên trái**, mở nhóm **AI Chatbot**, chọn mục **Lịch sử trò chuyện**, rồi bấm tab **Liên hệ để lại**.

[ẢNH: trang Lịch sử trò chuyện, khoanh đỏ tab "Liên hệ để lại"]

## Đọc sổ liên hệ
Mỗi dòng là một khách: **Kênh** (website, Zalo, Facebook…), **Khách hàng**, **Thông tin liên hệ**, **Lần cuối** khách nhắn, **Số lần** để lại liên hệ, và **Trạng thái**.

Ở cột thao tác có ba nút: **Sao chép** số hoặc email, **Mở hội thoại** để đọc lại khách đã hỏi gì, và **Đã liên hệ** để đánh dấu xong việc. Bấm nhầm thì **Bỏ đánh dấu**.

[ẢNH: sổ Liên hệ khách để lại với vài dòng, khoanh đỏ ba nút Sao chép, Mở hội thoại, Đã liên hệ]

Bộ lọc phía trên: **Chưa xử lý / Đã xử lý / Tất cả**, lọc theo **Kênh**, theo **Loại liên hệ** (số điện thoại hay email), và ô tìm theo số, email, tên.

| Trạng thái | Nghĩa là |
|---|---|
| **Chờ thông báo** | Vừa ghi nhận, sắp gửi email cho bạn |
| **Đã báo qua email** | Email báo đã gửi |
| **Đã có người trả lời** | Trong 120 phút gần đó đã có người thật trả lời khách, nên hệ thống không gửi email nữa |
| **Tắt thông báo** | Bạn đang tắt nhận email |
| **Đã liên hệ** | Bạn đã bấm đánh dấu xong |

Hệ thống tự bỏ qua tin rác kiểu rao bán sim, và không lấy số trong các cuộc trò chuyện nhóm. Danh thiếp Zalo khách gửi cũng được nhận là một liên hệ.

## Bật tắt email báo
Ngay trên sổ có công tắc **Nhận email khi khách để lại liên hệ**. Bật thì mỗi khi có liên hệ mới, email gửi về địa chỉ của chủ tài khoản, trong thư có nút mở thẳng hội thoại đó.

Khi khách để lại liên hệ, chatbot cũng tự báo lại cho khách là thông tin đã được ghi nhận.

## Thư tổng hợp hội thoại AI
Ô **Thư tổng hợp hội thoại AI** cho chọn **Hàng tuần**, **Hàng tháng** hoặc **Không gửi**. Thư tóm tắt hoạt động của chatbot trên mọi kênh trong kỳ, để bạn nắm tình hình mà không phải mở từng hội thoại.

[ẢNH: phần cài đặt phía trên sổ, khoanh đỏ công tắc nhận email và ô chọn tần suất thư tổng hợp]

## Liên quan
- [Hộp thư hợp nhất](inbox)
- [Chatbot AI trả lời khách tự động](chatbot)
- [Chatbot: khung giờ hoạt động, giới hạn trả lời và AI viết hộ](chatbot-khung-gio)`,
    body_html: `<h2>Liên hệ khách để lại trong chat và thư tổng hợp</h2><p>Khách đang hỏi chatbot mà nhắn lại số điện thoại hoặc email là khách nóng. Hệ thống tự nhặt các thông tin đó ra, ghi vào một sổ riêng và gửi email báo cho bạn, để bạn gọi lại kịp lúc.</p><h3>Tìm trang này trên màn hình</h3><p>Ở <strong>thanh menu bên trái</strong>, mở nhóm <strong>AI Chatbot</strong>, chọn mục <strong>Lịch sử trò chuyện</strong>, rồi bấm tab <strong>Liên hệ để lại</strong>.</p><p>[ẢNH: trang Lịch sử trò chuyện, khoanh đỏ tab &quot;Liên hệ để lại&quot;]</p><h3>Đọc sổ liên hệ</h3><p>Mỗi dòng là một khách: <strong>Kênh</strong> (website, Zalo, Facebook…), <strong>Khách hàng</strong>, <strong>Thông tin liên hệ</strong>, <strong>Lần cuối</strong> khách nhắn, <strong>Số lần</strong> để lại liên hệ, và <strong>Trạng thái</strong>.</p><p>Ở cột thao tác có ba nút: <strong>Sao chép</strong> số hoặc email, <strong>Mở hội thoại</strong> để đọc lại khách đã hỏi gì, và <strong>Đã liên hệ</strong> để đánh dấu xong việc. Bấm nhầm thì <strong>Bỏ đánh dấu</strong>.</p><p>[ẢNH: sổ Liên hệ khách để lại với vài dòng, khoanh đỏ ba nút Sao chép, Mở hội thoại, Đã liên hệ]</p><p>Bộ lọc phía trên: <strong>Chưa xử lý / Đã xử lý / Tất cả</strong>, lọc theo <strong>Kênh</strong>, theo <strong>Loại liên hệ</strong> (số điện thoại hay email), và ô tìm theo số, email, tên.</p><table><thead><tr><th>Trạng thái</th><th>Nghĩa là</th></tr></thead><tbody><tr><td><strong>Chờ thông báo</strong></td><td>Vừa ghi nhận, sắp gửi email cho bạn</td></tr><tr><td><strong>Đã báo qua email</strong></td><td>Email báo đã gửi</td></tr><tr><td><strong>Đã có người trả lời</strong></td><td>Trong 120 phút gần đó đã có người thật trả lời khách, nên hệ thống không gửi email nữa</td></tr><tr><td><strong>Tắt thông báo</strong></td><td>Bạn đang tắt nhận email</td></tr><tr><td><strong>Đã liên hệ</strong></td><td>Bạn đã bấm đánh dấu xong</td></tr></tbody></table><p>Hệ thống tự bỏ qua tin rác kiểu rao bán sim, và không lấy số trong các cuộc trò chuyện nhóm. Danh thiếp Zalo khách gửi cũng được nhận là một liên hệ.</p><h3>Bật tắt email báo</h3><p>Ngay trên sổ có công tắc <strong>Nhận email khi khách để lại liên hệ</strong>. Bật thì mỗi khi có liên hệ mới, email gửi về địa chỉ của chủ tài khoản, trong thư có nút mở thẳng hội thoại đó.</p><p>Khi khách để lại liên hệ, chatbot cũng tự báo lại cho khách là thông tin đã được ghi nhận.</p><h3>Thư tổng hợp hội thoại AI</h3><p>Ô <strong>Thư tổng hợp hội thoại AI</strong> cho chọn <strong>Hàng tuần</strong>, <strong>Hàng tháng</strong> hoặc <strong>Không gửi</strong>. Thư tóm tắt hoạt động của chatbot trên mọi kênh trong kỳ, để bạn nắm tình hình mà không phải mở từng hội thoại.</p><p>[ẢNH: phần cài đặt phía trên sổ, khoanh đỏ công tắc nhận email và ô chọn tần suất thư tổng hợp]</p><h3>Liên quan</h3><ul><li><a href="/huong-dan/inbox">Hộp thư hợp nhất</a></li><li><a href="/huong-dan/chatbot">Chatbot AI trả lời khách tự động</a></li><li><a href="/huong-dan/chatbot-khung-gio">Chatbot: khung giờ hoạt động, giới hạn trả lời và AI viết hộ</a></li></ul>`,
  },
  {
    slug: 'goi-sap-het-han',
    feature_key: 'plan-and-billing',
    primary_route: '/app/billing',
    sort_order: 123,
    title: 'Gói sắp hết hạn: hệ thống nhắc thế nào, hết hạn thì sao',
    summary: 'Hệ thống nhắc bằng thư và bằng hộp thoại trước khi gói hết hạn. Hết hạn thì gửi tin và AI tạm dừng, dữ liệu còn nguyên, gia hạn là chạy lại.',
    body_md: `# Gói sắp hết hạn: hệ thống nhắc thế nào, hết hạn thì sao
Bạn không bị cắt dịch vụ đột ngột. Trước ngày hết hạn, hệ thống nhắc qua **email** và qua **hộp thoại** khi bạn đăng nhập.

## Thư nhắc
Thư gửi về email của chủ tài khoản trước ngày hết hạn — mặc định là trước **7 ngày** và trước **3 ngày** — và thêm một thư vào **đúng ngày hết hạn**.

## Hộp thoại khi đăng nhập
Khi gói còn **từ 3 ngày trở xuống**, mỗi lần đăng nhập bạn thấy một hộp thoại giữa màn hình. Có ba dạng:

| Nhãn trên hộp thoại | Nghĩa là |
|---|---|
| **Sắp hết hạn** | Gói còn vài ngày. Chiến dịch đang chạy sẽ dừng khi hết hạn |
| **Đang ân hạn** | Gói đã hết hạn nhưng bạn còn vài ngày ân hạn, hộp thoại ghi rõ còn mấy ngày |
| **Đã hết hạn** | Hết cả ân hạn. Chiến dịch đã tạm dừng |

[ẢNH: hộp thoại Gói của bạn sắp hết hạn, khoanh đỏ số ngày còn lại và nút Nâng cấp ngay]

Bấm **Nâng cấp ngay** để sang trang chọn gói, hoặc **Để sau** để đóng. Đóng rồi thì trong lần đăng nhập đó hộp thoại không hiện lại, menu và dữ liệu vẫn dùng bình thường. Lần đăng nhập sau nó nhắc lại.

[ẢNH: sau khi bấm Để sau, menu bên trái và trang đang mở vẫn dùng được bình thường]

## Hết hạn thì cái gì dừng
- **Gửi tin và AI tạm dừng**: chiến dịch Email, Zalo không gửi nữa, các tính năng AI ngừng chạy cho tới khi gia hạn.
- **Biểu mẫu công khai tạm ngừng** nhận bài nộp; khách mở link sẽ thấy thông báo tạm ngừng.
- **Mua thêm hạn mức** cũng bị khoá cho tới khi gia hạn.

**Dữ liệu không mất.** Khách hàng, chiến dịch, landing page, biểu mẫu và bài nộp đều còn nguyên. Gia hạn xong là mọi thứ chạy lại, không phải dựng lại gì.

[ẢNH: trang Tổng quan gói khi gói đã hết hạn, khoanh đỏ dòng báo gửi tin và AI tạm dừng]

## Gia hạn ở đâu
Ở **thanh menu bên trái**, mở nhóm **Gói & Thanh toán**, chọn **Tổng quan gói**, rồi bấm nâng cấp hoặc gia hạn. Chi tiết cách tính ngày khi đổi gói xem [Đổi gói — nâng cấp, hạ gói, đổi kỳ hạn](doi-goi).

## Liên quan
- [Gói dịch vụ & thanh toán](plan-and-billing)
- [Gói dùng thử: có gì và hết hạn thì sao](dung-thu)
- [Câu hỏi thường gặp về thanh toán & hoá đơn](faq-billing)`,
    body_html: `<h2>Gói sắp hết hạn: hệ thống nhắc thế nào, hết hạn thì sao</h2><p>Bạn không bị cắt dịch vụ đột ngột. Trước ngày hết hạn, hệ thống nhắc qua <strong>email</strong> và qua <strong>hộp thoại</strong> khi bạn đăng nhập.</p><h3>Thư nhắc</h3><p>Thư gửi về email của chủ tài khoản trước ngày hết hạn — mặc định là trước <strong>7 ngày</strong> và trước <strong>3 ngày</strong> — và thêm một thư vào <strong>đúng ngày hết hạn</strong>.</p><h3>Hộp thoại khi đăng nhập</h3><p>Khi gói còn <strong>từ 3 ngày trở xuống</strong>, mỗi lần đăng nhập bạn thấy một hộp thoại giữa màn hình. Có ba dạng:</p><table><thead><tr><th>Nhãn trên hộp thoại</th><th>Nghĩa là</th></tr></thead><tbody><tr><td><strong>Sắp hết hạn</strong></td><td>Gói còn vài ngày. Chiến dịch đang chạy sẽ dừng khi hết hạn</td></tr><tr><td><strong>Đang ân hạn</strong></td><td>Gói đã hết hạn nhưng bạn còn vài ngày ân hạn, hộp thoại ghi rõ còn mấy ngày</td></tr><tr><td><strong>Đã hết hạn</strong></td><td>Hết cả ân hạn. Chiến dịch đã tạm dừng</td></tr></tbody></table><p>[ẢNH: hộp thoại Gói của bạn sắp hết hạn, khoanh đỏ số ngày còn lại và nút Nâng cấp ngay]</p><p>Bấm <strong>Nâng cấp ngay</strong> để sang trang chọn gói, hoặc <strong>Để sau</strong> để đóng. Đóng rồi thì trong lần đăng nhập đó hộp thoại không hiện lại, menu và dữ liệu vẫn dùng bình thường. Lần đăng nhập sau nó nhắc lại.</p><p>[ẢNH: sau khi bấm Để sau, menu bên trái và trang đang mở vẫn dùng được bình thường]</p><h3>Hết hạn thì cái gì dừng</h3><ul><li><strong>Gửi tin và AI tạm dừng</strong>: chiến dịch Email, Zalo không gửi nữa, các tính năng AI ngừng chạy cho tới khi gia hạn.</li><li><strong>Biểu mẫu công khai tạm ngừng</strong> nhận bài nộp; khách mở link sẽ thấy thông báo tạm ngừng.</li><li><strong>Mua thêm hạn mức</strong> cũng bị khoá cho tới khi gia hạn.</li></ul><p><strong>Dữ liệu không mất.</strong> Khách hàng, chiến dịch, landing page, biểu mẫu và bài nộp đều còn nguyên. Gia hạn xong là mọi thứ chạy lại, không phải dựng lại gì.</p><p>[ẢNH: trang Tổng quan gói khi gói đã hết hạn, khoanh đỏ dòng báo gửi tin và AI tạm dừng]</p><h3>Gia hạn ở đâu</h3><p>Ở <strong>thanh menu bên trái</strong>, mở nhóm <strong>Gói &amp; Thanh toán</strong>, chọn <strong>Tổng quan gói</strong>, rồi bấm nâng cấp hoặc gia hạn. Chi tiết cách tính ngày khi đổi gói xem <a href="/huong-dan/doi-goi">Đổi gói — nâng cấp, hạ gói, đổi kỳ hạn</a>.</p><h3>Liên quan</h3><ul><li><a href="/huong-dan/plan-and-billing">Gói dịch vụ &amp; thanh toán</a></li><li><a href="/huong-dan/dung-thu">Gói dùng thử: có gì và hết hạn thì sao</a></li><li><a href="/huong-dan/faq-billing">Câu hỏi thường gặp về thanh toán &amp; hoá đơn</a></li></ul>`,
  },
  {
    slug: 'chatbot-telegram-whatsapp',
    feature_key: 'chatbot',
    primary_route: '/app/settings/channels',
    sort_order: 87,
    title: 'Kết nối Telegram và WhatsApp cho chatbot',
    summary: 'Cho chatbot trả lời khách ngay trong tài khoản Telegram cá nhân và WhatsApp của bạn. Chỉ cần quét mã QR, không phải tạo Telegram Bot hay đăng ký với Meta.',
    body_md: `# Kết nối Telegram và WhatsApp cho chatbot
Chatbot trả lời được ngay trong tài khoản **Telegram cá nhân** và **WhatsApp** của bạn. Không cần tạo Telegram Bot, không cần đăng ký gì với Meta: chỉ quét mã QR, giống lúc bạn đăng nhập Telegram hay WhatsApp trên máy tính.

Làm hai việc theo thứ tự: **nối tài khoản**, rồi **chọn chatbot trả lời** cho tài khoản đó.

## Bước 1 — Nối tài khoản
Ở **thanh menu bên trái**, mở nhóm **Chiến dịch**, chọn mục **Quản lý kênh gửi**. Đầu trang có bốn tab: Email, Zalo, **WhatsApp** và **Telegram**.

[ẢNH: trang Quản lý kênh gửi, khoanh đỏ hai tab WhatsApp và Telegram]

### Telegram
1. Mở tab **Telegram**, bấm **Quét QR**.
2. Trên điện thoại, mở Telegram, vào Cài đặt, chọn Thiết bị, chọn Liên kết thiết bị bằng QR rồi hướng camera vào mã.
3. Nhấn xác nhận đăng nhập trên điện thoại. Tài khoản tự hiện trong danh sách **Tài khoản đã liên kết** với trạng thái **Đã kết nối**.

Mã QR có hạn, trên màn hình có đồng hồ đếm. Hết hạn thì bấm **Tạo QR mới**.

[ẢNH: hộp Quét mã QR để kết nối Telegram, bên cạnh là ba bước hướng dẫn]

### WhatsApp
1. Mở tab **WhatsApp**, bấm **Quét QR**.
2. Trên điện thoại, mở WhatsApp, vào Cài đặt, chọn Thiết bị đã liên kết, chọn Liên kết thiết bị rồi hướng camera vào mã.
3. Số WhatsApp hiện trong danh sách với trạng thái **Đã kết nối**. Bạn đặt được **Tên hiển thị** cho dễ phân biệt khi nối nhiều số.

Dùng được với WhatsApp cá nhân. Phiên được lưu trên máy chủ nên không phải quét lại mỗi lần hệ thống cập nhật. Đóng cửa sổ khi chưa quét thì phiên tự huỷ, không để lại gì.

## Bước 2 — Chọn chatbot trả lời
Ở **thanh menu bên trái**, mở nhóm **AI Chatbot**, chọn **Tạo AI Chatbot**, chọn chatbot, mở tab **Triển khai** rồi bấm ô **Telegram** hoặc **WhatsApp**. Hộp hiện ra liệt kê các tài khoản đã nối; bật công tắc ở tài khoản nào thì chatbot này trả lời tin nhắn gửi tới tài khoản đó.

[ẢNH: tab Triển khai, đã bấm ô Telegram, khoanh đỏ công tắc bật chatbot cho một tài khoản]

Nối nhiều tài khoản được, mỗi tài khoản bật tắt riêng.

## Những điều cần biết
- **Khung giờ hoạt động** và **Giới hạn lượt chatbot trả lời** áp dụng cho hai kênh này y như các kênh khác. Nên đặt trần lượt trả lời, vì đây là tài khoản cá nhân của bạn: trả lời quá dày có thể bị nền tảng hạn chế.
- Hội thoại WhatsApp đổ về **Lịch sử trò chuyện**, có nút lọc riêng cho WhatsApp.
- Thấy tài khoản chuyển sang **Ngắt kết nối** thì quét lại QR là xong.
- Telegram: **Đăng xuất** chỉ ngắt kết nối; **Xóa** thì mất luôn các cuộc trò chuyện liên quan. WhatsApp: nút **Ngắt kết nối & xóa phiên**.
- Hai kênh này chỉ để **chatbot trả lời khách**. Gửi chiến dịch hàng loạt vẫn chỉ có Email và Zalo.

## Liên quan
- [Chatbot AI trả lời khách tự động](chatbot)
- [Chatbot: khung giờ hoạt động, giới hạn trả lời và AI viết hộ](chatbot-khung-gio)
- [Kết nối kênh gửi (Email & Zalo)](channels)`,
    body_html: `<h2>Kết nối Telegram và WhatsApp cho chatbot</h2><p>Chatbot trả lời được ngay trong tài khoản <strong>Telegram cá nhân</strong> và <strong>WhatsApp</strong> của bạn. Không cần tạo Telegram Bot, không cần đăng ký gì với Meta: chỉ quét mã QR, giống lúc bạn đăng nhập Telegram hay WhatsApp trên máy tính.</p><p>Làm hai việc theo thứ tự: <strong>nối tài khoản</strong>, rồi <strong>chọn chatbot trả lời</strong> cho tài khoản đó.</p><h3>Bước 1 — Nối tài khoản</h3><p>Ở <strong>thanh menu bên trái</strong>, mở nhóm <strong>Chiến dịch</strong>, chọn mục <strong>Quản lý kênh gửi</strong>. Đầu trang có bốn tab: Email, Zalo, <strong>WhatsApp</strong> và <strong>Telegram</strong>.</p><p>[ẢNH: trang Quản lý kênh gửi, khoanh đỏ hai tab WhatsApp và Telegram]</p><h4>Telegram</h4><ol><li>Mở tab <strong>Telegram</strong>, bấm <strong>Quét QR</strong>.</li><li>Trên điện thoại, mở Telegram, vào Cài đặt, chọn Thiết bị, chọn Liên kết thiết bị bằng QR rồi hướng camera vào mã.</li><li>Nhấn xác nhận đăng nhập trên điện thoại. Tài khoản tự hiện trong danh sách <strong>Tài khoản đã liên kết</strong> với trạng thái <strong>Đã kết nối</strong>.</li></ol><p>Mã QR có hạn, trên màn hình có đồng hồ đếm. Hết hạn thì bấm <strong>Tạo QR mới</strong>.</p><p>[ẢNH: hộp Quét mã QR để kết nối Telegram, bên cạnh là ba bước hướng dẫn]</p><h4>WhatsApp</h4><ol><li>Mở tab <strong>WhatsApp</strong>, bấm <strong>Quét QR</strong>.</li><li>Trên điện thoại, mở WhatsApp, vào Cài đặt, chọn Thiết bị đã liên kết, chọn Liên kết thiết bị rồi hướng camera vào mã.</li><li>Số WhatsApp hiện trong danh sách với trạng thái <strong>Đã kết nối</strong>. Bạn đặt được <strong>Tên hiển thị</strong> cho dễ phân biệt khi nối nhiều số.</li></ol><p>Dùng được với WhatsApp cá nhân. Phiên được lưu trên máy chủ nên không phải quét lại mỗi lần hệ thống cập nhật. Đóng cửa sổ khi chưa quét thì phiên tự huỷ, không để lại gì.</p><h3>Bước 2 — Chọn chatbot trả lời</h3><p>Ở <strong>thanh menu bên trái</strong>, mở nhóm <strong>AI Chatbot</strong>, chọn <strong>Tạo AI Chatbot</strong>, chọn chatbot, mở tab <strong>Triển khai</strong> rồi bấm ô <strong>Telegram</strong> hoặc <strong>WhatsApp</strong>. Hộp hiện ra liệt kê các tài khoản đã nối; bật công tắc ở tài khoản nào thì chatbot này trả lời tin nhắn gửi tới tài khoản đó.</p><p>[ẢNH: tab Triển khai, đã bấm ô Telegram, khoanh đỏ công tắc bật chatbot cho một tài khoản]</p><p>Nối nhiều tài khoản được, mỗi tài khoản bật tắt riêng.</p><h3>Những điều cần biết</h3><ul><li><strong>Khung giờ hoạt động</strong> và <strong>Giới hạn lượt chatbot trả lời</strong> áp dụng cho hai kênh này y như các kênh khác. Nên đặt trần lượt trả lời, vì đây là tài khoản cá nhân của bạn: trả lời quá dày có thể bị nền tảng hạn chế.</li><li>Hội thoại WhatsApp đổ về <strong>Lịch sử trò chuyện</strong>, có nút lọc riêng cho WhatsApp.</li><li>Thấy tài khoản chuyển sang <strong>Ngắt kết nối</strong> thì quét lại QR là xong.</li><li>Telegram: <strong>Đăng xuất</strong> chỉ ngắt kết nối; <strong>Xóa</strong> thì mất luôn các cuộc trò chuyện liên quan. WhatsApp: nút <strong>Ngắt kết nối &amp; xóa phiên</strong>.</li><li>Hai kênh này chỉ để <strong>chatbot trả lời khách</strong>. Gửi chiến dịch hàng loạt vẫn chỉ có Email và Zalo.</li></ul><h3>Liên quan</h3><ul><li><a href="/huong-dan/chatbot">Chatbot AI trả lời khách tự động</a></li><li><a href="/huong-dan/chatbot-khung-gio">Chatbot: khung giờ hoạt động, giới hạn trả lời và AI viết hộ</a></li><li><a href="/huong-dan/channels">Kết nối kênh gửi (Email &amp; Zalo)</a></li></ul>`,
  },
  {
    slug: 'dong-y-nhan-tin',
    feature_key: 'khach-hang',
    primary_route: '/app/customers',
    sort_order: 75,
    title: 'Đồng ý nhận tin: hệ thống tự bỏ qua ai khi gửi chiến dịch',
    summary: 'Người đã từ chối hoặc rút lại đồng ý nhận tin sẽ tự động bị bỏ qua khi bạn gửi chiến dịch, cả Email lẫn Zalo. Bài này nói rõ ai bị bỏ qua, ai vẫn nhận, và khách rút đồng ý bằng cách nào.',
    body_md: `# Đồng ý nhận tin: hệ thống tự bỏ qua ai khi gửi chiến dịch
Luật bảo vệ dữ liệu cá nhân yêu cầu tôn trọng lựa chọn của người nhận. Hệ thống làm việc đó thay bạn: ai đã nói **không** thì chiến dịch tự bỏ qua, bạn không phải lọc tay.

## Ba nhóm người
| Nhóm | Ví dụ | Chiến dịch có gửi không |
|---|---|---|
| **Đã đồng ý** | Khách tích ô đồng ý nhận tin trên form | Có |
| **Chưa từng được hỏi** | Khách đăng ký từ trang cũ chưa có ô đồng ý, danh sách bạn tự nhập | Có |
| **Đã từ chối hoặc đã rút đồng ý** | Khách bỏ trống ô đồng ý khi form có hỏi, hoặc bấm link huỷ nhận tin | **Không** |

## Hệ thống chặn ở đâu
- **Lúc lấy danh sách.** Nguồn người nhận lấy từ landing page tự bỏ qua người đã từ chối hoặc đã rút đồng ý. Trong bước cấu hình nguồn có dòng báo cụ thể bao nhiêu người bị bỏ qua.
- **Lúc gửi.** Ngay trước khi gửi từng tin, hệ thống kiểm lại một lần nữa, cho cả **Email** lẫn **Zalo cá nhân** và **kết bạn Zalo**. Người vừa rút đồng ý sau khi chiến dịch bắt đầu cũng không nhận tin nữa.

Tin gửi vào **nhóm Zalo** không áp dụng quy tắc này, vì nhóm không có người nhận riêng lẻ để đối chiếu.

[ẢNH: bước cấu hình nguồn người nhận từ landing page, khoanh đỏ dòng báo số người bị bỏ qua vì đã từ chối nhận tin]

## Nguồn từ biểu mẫu thì chặt hơn
Nguồn **Dữ liệu Biểu mẫu** chỉ lấy những người **đã tích ô đồng ý**. Biểu mẫu chưa bật ô đồng ý thì nguồn này không lấy được ai, và màn hình báo rõ điều đó. Cách bật xem [Biểu mẫu: thu thông tin, chia sẻ và nhúng vào website](bieu-mau).

## Khách rút đồng ý bằng cách nào
- **Email chiến dịch** có sẵn dòng *hủy đăng ký tại đây* ở cuối thư. Khách bấm là xong, bạn không phải làm gì.
- **Người đã điền biểu mẫu** tự rút được sự đồng ý; trong trang bài nộp, cột **Đồng ý tiếp thị** đổi thành *Đã rút* kèm ngày.

[ẢNH: trang Bài nộp biểu mẫu, khoanh đỏ một dòng có cột Đồng ý tiếp thị ghi "Đã rút"]

## Xem nguồn đồng ý của từng khách
Trong danh sách khách hàng có cột **Nguồn đồng ý**, cho biết khách đến từ landing page, từ biểu mẫu hay do bạn nhập vào.

[ẢNH: danh sách khách hàng, khoanh đỏ cột "Nguồn đồng ý"]

## Câu hỏi hay gặp
**Danh sách 200 người mà chỉ gửi 188?** Xem dòng báo ở bước cấu hình nguồn: số chênh thường là người đã từ chối nhận tin. Trang **Hiệu quả chiến dịch** cũng có dòng tóm tắt bao nhiêu người bị bỏ qua và vì sao.

**Tôi muốn gửi cho cả người đã từ chối?** Không được, và không có công tắc nào để tắt việc này.

## Liên quan
- [Khách hàng: dữ liệu đến từ đâu và xem ở đâu](khach-hang)
- [Theo dõi chiến dịch đang chạy](campaign-theo-doi)
- [Biểu mẫu: thu thông tin, chia sẻ và nhúng vào website](bieu-mau)`,
    body_html: `<h2>Đồng ý nhận tin: hệ thống tự bỏ qua ai khi gửi chiến dịch</h2><p>Luật bảo vệ dữ liệu cá nhân yêu cầu tôn trọng lựa chọn của người nhận. Hệ thống làm việc đó thay bạn: ai đã nói <strong>không</strong> thì chiến dịch tự bỏ qua, bạn không phải lọc tay.</p><h3>Ba nhóm người</h3><table><thead><tr><th>Nhóm</th><th>Ví dụ</th><th>Chiến dịch có gửi không</th></tr></thead><tbody><tr><td><strong>Đã đồng ý</strong></td><td>Khách tích ô đồng ý nhận tin trên form</td><td>Có</td></tr><tr><td><strong>Chưa từng được hỏi</strong></td><td>Khách đăng ký từ trang cũ chưa có ô đồng ý, danh sách bạn tự nhập</td><td>Có</td></tr><tr><td><strong>Đã từ chối hoặc đã rút đồng ý</strong></td><td>Khách bỏ trống ô đồng ý khi form có hỏi, hoặc bấm link huỷ nhận tin</td><td><strong>Không</strong></td></tr></tbody></table><h3>Hệ thống chặn ở đâu</h3><ul><li><strong>Lúc lấy danh sách.</strong> Nguồn người nhận lấy từ landing page tự bỏ qua người đã từ chối hoặc đã rút đồng ý. Trong bước cấu hình nguồn có dòng báo cụ thể bao nhiêu người bị bỏ qua.</li><li><strong>Lúc gửi.</strong> Ngay trước khi gửi từng tin, hệ thống kiểm lại một lần nữa, cho cả <strong>Email</strong> lẫn <strong>Zalo cá nhân</strong> và <strong>kết bạn Zalo</strong>. Người vừa rút đồng ý sau khi chiến dịch bắt đầu cũng không nhận tin nữa.</li></ul><p>Tin gửi vào <strong>nhóm Zalo</strong> không áp dụng quy tắc này, vì nhóm không có người nhận riêng lẻ để đối chiếu.</p><p>[ẢNH: bước cấu hình nguồn người nhận từ landing page, khoanh đỏ dòng báo số người bị bỏ qua vì đã từ chối nhận tin]</p><h3>Nguồn từ biểu mẫu thì chặt hơn</h3><p>Nguồn <strong>Dữ liệu Biểu mẫu</strong> chỉ lấy những người <strong>đã tích ô đồng ý</strong>. Biểu mẫu chưa bật ô đồng ý thì nguồn này không lấy được ai, và màn hình báo rõ điều đó. Cách bật xem <a href="/huong-dan/bieu-mau">Biểu mẫu: thu thông tin, chia sẻ và nhúng vào website</a>.</p><h3>Khách rút đồng ý bằng cách nào</h3><ul><li><strong>Email chiến dịch</strong> có sẵn dòng <em>hủy đăng ký tại đây</em> ở cuối thư. Khách bấm là xong, bạn không phải làm gì.</li><li><strong>Người đã điền biểu mẫu</strong> tự rút được sự đồng ý; trong trang bài nộp, cột <strong>Đồng ý tiếp thị</strong> đổi thành <em>Đã rút</em> kèm ngày.</li></ul><p>[ẢNH: trang Bài nộp biểu mẫu, khoanh đỏ một dòng có cột Đồng ý tiếp thị ghi &quot;Đã rút&quot;]</p><h3>Xem nguồn đồng ý của từng khách</h3><p>Trong danh sách khách hàng có cột <strong>Nguồn đồng ý</strong>, cho biết khách đến từ landing page, từ biểu mẫu hay do bạn nhập vào.</p><p>[ẢNH: danh sách khách hàng, khoanh đỏ cột &quot;Nguồn đồng ý&quot;]</p><h3>Câu hỏi hay gặp</h3><p><strong>Danh sách 200 người mà chỉ gửi 188?</strong> Xem dòng báo ở bước cấu hình nguồn: số chênh thường là người đã từ chối nhận tin. Trang <strong>Hiệu quả chiến dịch</strong> cũng có dòng tóm tắt bao nhiêu người bị bỏ qua và vì sao.</p><p><strong>Tôi muốn gửi cho cả người đã từ chối?</strong> Không được, và không có công tắc nào để tắt việc này.</p><h3>Liên quan</h3><ul><li><a href="/huong-dan/khach-hang">Khách hàng: dữ liệu đến từ đâu và xem ở đâu</a></li><li><a href="/huong-dan/campaign-theo-doi">Theo dõi chiến dịch đang chạy</a></li><li><a href="/huong-dan/bieu-mau">Biểu mẫu: thu thông tin, chia sẻ và nhúng vào website</a></li></ul>`,
  },
  {
    slug: 'marketplace',
    feature_key: 'khac',
    primary_route: '/app/marketplace',
    sort_order: 140,
    title: 'Marketplace: mua, bán và chia sẻ template',
    summary: 'Chợ template của Founder AI: lấy chiến dịch và chatbot dựng sẵn của người khác về dùng ngay, hoặc đăng template của bạn để bán lấy credits.',
    body_md: `# Marketplace: mua, bán và chia sẻ template
Marketplace là chợ template. Bạn lấy **chiến dịch**, **chatbot** hoặc **landing page** người khác đã dựng sẵn về dùng ngay, hoặc đăng cái của mình lên để người khác mua. Thanh toán bằng **credits**, không dùng tiền mặt.

## Tìm trang này trên màn hình
Bấm nút **Marketplace** trên **thanh ngang trên cùng**, cạnh nút Nâng cấp. Mục này không nằm trong menu bên trái.

[ẢNH: thanh ngang trên cùng, khoanh đỏ nút "Marketplace"]

Marketplace mở ra trong một cửa sổ lớn, có hai tab:

| Tab | Có gì |
|---|---|
| **Khám phá** | Tất cả template đang có. Tìm theo tên, lọc theo loại **Chiến dịch** hoặc **Chatbot**, sắp xếp theo đánh giá, mới nhất, phổ biến hoặc theo giá |
| **Của tôi** | Template bạn đã đăng |

[ẢNH: cửa sổ Marketplace, khoanh đỏ hai tab Khám phá và Của tôi]

## Mua một template
Mở template để xem mô tả và đánh giá, rồi bấm mua. Template ghi **Miễn phí** thì lấy về không mất gì; template có giá thì hệ thống trừ đúng số credits ghi trên đó.

Mua xong, hệ thống **sao chép** template đó vào tài khoản của bạn: chiến dịch nằm trong **Quản lý chiến dịch**, chatbot nằm trong **Tạo AI Chatbot**, landing page nằm trong **Tạo Landing page**. Bạn sửa thoải mái, không ảnh hưởng bản gốc của người bán.

- Mỗi template chỉ cần mua **một lần**.
- Không mua được template của chính mình.
- Mua rồi thì bạn viết được đánh giá cho template đó.

## Đăng template để bán
Bấm nút **Đăng bài** ở góc trên bên phải cửa sổ Marketplace. Cửa sổ **Tạo Template mới** dẫn bạn qua ba bước:

1. **Chọn loại**: chọn **Chiến dịch**, **Chatbot** hoặc **Landing Page**, rồi chọn đúng cái bạn muốn đăng trong danh sách của mình.
2. **Thông tin**: đặt tên và viết mô tả cho người mua hiểu template dùng vào việc gì.
3. **Giá bán**: đặt giá bằng credits. Đặt **0 credits** là chia sẻ miễn phí.

Muốn ngừng bán thì tạm dừng template trong tab **Của tôi**.

[ẢNH: cửa sổ Tạo Template mới ở bước Chọn loại, khoanh đỏ ba bước Chọn loại / Thông tin / Giá bán và hàng nút Chiến dịch, Chatbot, Landing Page]

Mỗi lượt bán, bạn nhận **90%** số credits; 10% còn lại là phí nền tảng. Số credits kiếm được ghi vào **số dư người bán** của bạn, tách riêng với credits AI của gói.

> Trước khi đăng, xoá thông tin riêng khỏi template: số điện thoại, link Google Sheet khách hàng, nội dung nội bộ. Người mua nhận một bản sao y nguyên.

## Liên quan
- [Tạo chiến dịch](campaign-create)
- [Chatbot AI trả lời khách tự động](chatbot)
- [Gói dịch vụ & thanh toán](plan-and-billing)`,
    body_html: `<h2>Marketplace: mua, bán và chia sẻ template</h2><p>Marketplace là chợ template. Bạn lấy <strong>chiến dịch</strong>, <strong>chatbot</strong> hoặc <strong>landing page</strong> người khác đã dựng sẵn về dùng ngay, hoặc đăng cái của mình lên để người khác mua. Thanh toán bằng <strong>credits</strong>, không dùng tiền mặt.</p><h3>Tìm trang này trên màn hình</h3><p>Bấm nút <strong>Marketplace</strong> trên <strong>thanh ngang trên cùng</strong>, cạnh nút Nâng cấp. Mục này không nằm trong menu bên trái.</p><p>[ẢNH: thanh ngang trên cùng, khoanh đỏ nút &quot;Marketplace&quot;]</p><p>Marketplace mở ra trong một cửa sổ lớn, có hai tab:</p><table><thead><tr><th>Tab</th><th>Có gì</th></tr></thead><tbody><tr><td><strong>Khám phá</strong></td><td>Tất cả template đang có. Tìm theo tên, lọc theo loại <strong>Chiến dịch</strong> hoặc <strong>Chatbot</strong>, sắp xếp theo đánh giá, mới nhất, phổ biến hoặc theo giá</td></tr><tr><td><strong>Của tôi</strong></td><td>Template bạn đã đăng</td></tr></tbody></table><p>[ẢNH: cửa sổ Marketplace, khoanh đỏ hai tab Khám phá và Của tôi]</p><h3>Mua một template</h3><p>Mở template để xem mô tả và đánh giá, rồi bấm mua. Template ghi <strong>Miễn phí</strong> thì lấy về không mất gì; template có giá thì hệ thống trừ đúng số credits ghi trên đó.</p><p>Mua xong, hệ thống <strong>sao chép</strong> template đó vào tài khoản của bạn: chiến dịch nằm trong <strong>Quản lý chiến dịch</strong>, chatbot nằm trong <strong>Tạo AI Chatbot</strong>, landing page nằm trong <strong>Tạo Landing page</strong>. Bạn sửa thoải mái, không ảnh hưởng bản gốc của người bán.</p><ul><li>Mỗi template chỉ cần mua <strong>một lần</strong>.</li><li>Không mua được template của chính mình.</li><li>Mua rồi thì bạn viết được đánh giá cho template đó.</li></ul><h3>Đăng template để bán</h3><p>Bấm nút <strong>Đăng bài</strong> ở góc trên bên phải cửa sổ Marketplace. Cửa sổ <strong>Tạo Template mới</strong> dẫn bạn qua ba bước:</p><ol><li><strong>Chọn loại</strong>: chọn <strong>Chiến dịch</strong>, <strong>Chatbot</strong> hoặc <strong>Landing Page</strong>, rồi chọn đúng cái bạn muốn đăng trong danh sách của mình.</li><li><strong>Thông tin</strong>: đặt tên và viết mô tả cho người mua hiểu template dùng vào việc gì.</li><li><strong>Giá bán</strong>: đặt giá bằng credits. Đặt <strong>0 credits</strong> là chia sẻ miễn phí.</li></ol><p>Muốn ngừng bán thì tạm dừng template trong tab <strong>Của tôi</strong>.</p><p>[ẢNH: cửa sổ Tạo Template mới ở bước Chọn loại, khoanh đỏ ba bước Chọn loại / Thông tin / Giá bán và hàng nút Chiến dịch, Chatbot, Landing Page]</p><p>Mỗi lượt bán, bạn nhận <strong>90%</strong> số credits; 10% còn lại là phí nền tảng. Số credits kiếm được ghi vào <strong>số dư người bán</strong> của bạn, tách riêng với credits AI của gói.</p><blockquote><p>Trước khi đăng, xoá thông tin riêng khỏi template: số điện thoại, link Google Sheet khách hàng, nội dung nội bộ. Người mua nhận một bản sao y nguyên.</p></blockquote><h3>Liên quan</h3><ul><li><a href="/huong-dan/campaign-create">Tạo chiến dịch</a></li><li><a href="/huong-dan/chatbot">Chatbot AI trả lời khách tự động</a></li><li><a href="/huong-dan/plan-and-billing">Gói dịch vụ &amp; thanh toán</a></li></ul>`,
  },
  {
    slug: 'dung-luong-luu-tru',
    feature_key: 'plan-and-billing',
    primary_route: '/app/billing',
    sort_order: 126,
    title: 'Dung lượng lưu trữ: xem ở đâu, đầy thì làm gì',
    summary: 'Ảnh, tài liệu và tệp đính kèm bạn tải lên đều tính vào dung lượng của gói. Xem mức đã dùng ở Tổng quan gói, đầy thì xoá bớt tệp hoặc mua thêm.',
    body_md: `# Dung lượng lưu trữ: xem ở đâu, đầy thì làm gì
Mọi tệp bạn tải lên — ảnh trong landing page, tệp đính kèm chiến dịch, tài liệu nạp cho chatbot, banner biểu mẫu — đều tính vào **dung lượng lưu trữ** của tài khoản. Mỗi gói có một mức dung lượng riêng.

## Xem đã dùng bao nhiêu
Ở **thanh menu bên trái**, mở nhóm **Gói & Thanh toán**, chọn **Tổng quan gói**. Khối **Dung lượng lưu trữ** ghi *Đã dùng … / …* kèm phần trăm, và dòng **Còn trống**.

[ẢNH: trang Tổng quan gói, khoanh đỏ khối Dung lượng lưu trữ với thanh phần trăm đã dùng]

Khi sắp đầy, hệ thống hiện dòng cảnh báo ngay đầu trang. Tài khoản nhân viên cũng thấy cảnh báo, kèm lời nhắc báo chủ tài khoản.

## Hai giới hạn cần nhớ
- **Mỗi tệp tối đa 100 MB.** Tệp lớn hơn bị từ chối ngay khi chọn.
- **Tổng dung lượng theo gói.** Tệp bạn chọn nặng hơn phần còn trống thì hệ thống báo rõ còn bao nhiêu và tệp nặng bao nhiêu.

[ẢNH: thông báo lỗi khi tải tệp vượt dung lượng còn trống, thấy số còn lại và kích thước tệp]

## Đầy rồi thì làm gì
1. **Xoá bớt tệp cũ.** Vào nhóm **AI Chatbot**, mục **Thư viện media**, xoá các ảnh và tệp không còn dùng.
2. **Mua thêm dung lượng.** Vào nhóm **Gói & Thanh toán**, mục **Mua thêm hạn mức**, chọn thêm dung lượng theo GB.
3. **Nâng gói** nếu bạn cũng cần thêm các hạn mức khác.

[ẢNH: trang Mua thêm hạn mức, khoanh đỏ dòng mua thêm dung lượng lưu trữ theo GB]

Hết dung lượng **không làm mất** tệp đã có; bạn chỉ không tải thêm tệp mới được cho tới khi dọn bớt hoặc mua thêm.

## Liên quan
- [Gói dịch vụ & thanh toán](plan-and-billing)
- [Đổi gói — nâng cấp, hạ gói, đổi kỳ hạn](doi-goi)
- [Hộp thư hợp nhất](inbox)`,
    body_html: `<h2>Dung lượng lưu trữ: xem ở đâu, đầy thì làm gì</h2><p>Mọi tệp bạn tải lên — ảnh trong landing page, tệp đính kèm chiến dịch, tài liệu nạp cho chatbot, banner biểu mẫu — đều tính vào <strong>dung lượng lưu trữ</strong> của tài khoản. Mỗi gói có một mức dung lượng riêng.</p><h3>Xem đã dùng bao nhiêu</h3><p>Ở <strong>thanh menu bên trái</strong>, mở nhóm <strong>Gói &amp; Thanh toán</strong>, chọn <strong>Tổng quan gói</strong>. Khối <strong>Dung lượng lưu trữ</strong> ghi <em>Đã dùng … / …</em> kèm phần trăm, và dòng <strong>Còn trống</strong>.</p><p>[ẢNH: trang Tổng quan gói, khoanh đỏ khối Dung lượng lưu trữ với thanh phần trăm đã dùng]</p><p>Khi sắp đầy, hệ thống hiện dòng cảnh báo ngay đầu trang. Tài khoản nhân viên cũng thấy cảnh báo, kèm lời nhắc báo chủ tài khoản.</p><h3>Hai giới hạn cần nhớ</h3><ul><li><strong>Mỗi tệp tối đa 100 MB.</strong> Tệp lớn hơn bị từ chối ngay khi chọn.</li><li><strong>Tổng dung lượng theo gói.</strong> Tệp bạn chọn nặng hơn phần còn trống thì hệ thống báo rõ còn bao nhiêu và tệp nặng bao nhiêu.</li></ul><p>[ẢNH: thông báo lỗi khi tải tệp vượt dung lượng còn trống, thấy số còn lại và kích thước tệp]</p><h3>Đầy rồi thì làm gì</h3><ol><li><strong>Xoá bớt tệp cũ.</strong> Vào nhóm <strong>AI Chatbot</strong>, mục <strong>Thư viện media</strong>, xoá các ảnh và tệp không còn dùng.</li><li><strong>Mua thêm dung lượng.</strong> Vào nhóm <strong>Gói &amp; Thanh toán</strong>, mục <strong>Mua thêm hạn mức</strong>, chọn thêm dung lượng theo GB.</li><li><strong>Nâng gói</strong> nếu bạn cũng cần thêm các hạn mức khác.</li></ol><p>[ẢNH: trang Mua thêm hạn mức, khoanh đỏ dòng mua thêm dung lượng lưu trữ theo GB]</p><p>Hết dung lượng <strong>không làm mất</strong> tệp đã có; bạn chỉ không tải thêm tệp mới được cho tới khi dọn bớt hoặc mua thêm.</p><h3>Liên quan</h3><ul><li><a href="/huong-dan/plan-and-billing">Gói dịch vụ &amp; thanh toán</a></li><li><a href="/huong-dan/doi-goi">Đổi gói — nâng cấp, hạ gói, đổi kỳ hạn</a></li><li><a href="/huong-dan/inbox">Hộp thư hợp nhất</a></li></ul>`,
  },
  {
    slug: 'nhat-ky-hoat-dong',
    feature_key: 'nhan-vien',
    primary_route: '/app/settings/audit-logs',
    sort_order: 115,
    title: 'Nhật ký hoạt động: ai đã làm gì, lúc nào',
    summary: 'Sổ ghi lại các thao tác quan trọng trong tài khoản: thêm bớt nhân viên, đổi quyền, tạo và sửa chiến dịch. Dùng khi cần biết ai đã thay đổi gì.',
    body_md: `# Nhật ký hoạt động: ai đã làm gì, lúc nào
Khi tài khoản có nhiều nhân viên cùng làm, sớm muộn bạn sẽ cần trả lời câu "ai đã sửa cái này". Nhật ký hoạt động ghi lại các thao tác quan trọng để bạn tra.

## Tìm trang này trên màn hình
Ở **thanh menu bên trái**, mở nhóm **Cài đặt**, chọn mục **Nhật ký hoạt động**. Chỉ **chủ tài khoản** thấy mục này.

[ẢNH: menu bên trái đang mở nhóm Cài đặt, khoanh đỏ mục "Nhật ký hoạt động"]

## Đọc bảng nhật ký
Mỗi dòng là một thao tác, gồm năm cột: **Thời gian**, **Người thực hiện**, **Hành động**, **Đối tượng** và **Chi tiết**.

[ẢNH: bảng Nhật ký hoạt động với vài dòng, khoanh đỏ cột Người thực hiện và cột Hành động]

Những việc được ghi lại gồm:

- **Nhân viên**: thêm, xoá, đổi quyền hạn, đổi giới hạn gửi, đổi trạng thái tài khoản, đặt lại mật khẩu.
- **Chiến dịch**: tạo, cập nhật, xoá, bắt đầu chạy, tạm dừng.
- **Mẫu email và mẫu Zalo**: tạo, cập nhật, xoá.

## Lọc cho nhanh
Phía trên bảng có ô **Tìm theo chi tiết**, hai ô lọc **Tất cả hành động** và **Tất cả đối tượng**, cùng khoảng ngày **Từ ngày** — **Đến ngày**. Bấm **Xóa lọc** để xem lại tất cả.

[ẢNH: hàng bộ lọc phía trên bảng, khoanh đỏ ô lọc hành động và hai ô chọn ngày]

Nhật ký chỉ để xem, không sửa và không xoá được từng dòng.

## Liên quan
- [Nhân viên & phân quyền](nhan-vien)
- [Tạo chiến dịch](campaign-create)`,
    body_html: `<h2>Nhật ký hoạt động: ai đã làm gì, lúc nào</h2><p>Khi tài khoản có nhiều nhân viên cùng làm, sớm muộn bạn sẽ cần trả lời câu &quot;ai đã sửa cái này&quot;. Nhật ký hoạt động ghi lại các thao tác quan trọng để bạn tra.</p><h3>Tìm trang này trên màn hình</h3><p>Ở <strong>thanh menu bên trái</strong>, mở nhóm <strong>Cài đặt</strong>, chọn mục <strong>Nhật ký hoạt động</strong>. Chỉ <strong>chủ tài khoản</strong> thấy mục này.</p><p>[ẢNH: menu bên trái đang mở nhóm Cài đặt, khoanh đỏ mục &quot;Nhật ký hoạt động&quot;]</p><h3>Đọc bảng nhật ký</h3><p>Mỗi dòng là một thao tác, gồm năm cột: <strong>Thời gian</strong>, <strong>Người thực hiện</strong>, <strong>Hành động</strong>, <strong>Đối tượng</strong> và <strong>Chi tiết</strong>.</p><p>[ẢNH: bảng Nhật ký hoạt động với vài dòng, khoanh đỏ cột Người thực hiện và cột Hành động]</p><p>Những việc được ghi lại gồm:</p><ul><li><strong>Nhân viên</strong>: thêm, xoá, đổi quyền hạn, đổi giới hạn gửi, đổi trạng thái tài khoản, đặt lại mật khẩu.</li><li><strong>Chiến dịch</strong>: tạo, cập nhật, xoá, bắt đầu chạy, tạm dừng.</li><li><strong>Mẫu email và mẫu Zalo</strong>: tạo, cập nhật, xoá.</li></ul><h3>Lọc cho nhanh</h3><p>Phía trên bảng có ô <strong>Tìm theo chi tiết</strong>, hai ô lọc <strong>Tất cả hành động</strong> và <strong>Tất cả đối tượng</strong>, cùng khoảng ngày <strong>Từ ngày</strong> — <strong>Đến ngày</strong>. Bấm <strong>Xóa lọc</strong> để xem lại tất cả.</p><p>[ẢNH: hàng bộ lọc phía trên bảng, khoanh đỏ ô lọc hành động và hai ô chọn ngày]</p><p>Nhật ký chỉ để xem, không sửa và không xoá được từng dòng.</p><h3>Liên quan</h3><ul><li><a href="/huong-dan/nhan-vien">Nhân viên &amp; phân quyền</a></li><li><a href="/huong-dan/campaign-create">Tạo chiến dịch</a></li></ul>`,
  },
];

export default HELP_SEED_ARTICLES;
