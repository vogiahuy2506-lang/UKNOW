// Regression (bug thật 25/08/2026): Người dùng gửi file ảnh (.png/.jpg) chứa thông tin khuyến mãi/sản phẩm.
// Model nhận được ảnh qua vision, nhưng wizard state bỏ qua file ảnh (mimeType.startsWith('image/'))
// khiến hasAttachedFile không bật và brief attached_file bị hỏi lại vô tận.
// Fixture này đảm bảo:
// 1. Gửi file ảnh thì hasAttachedFile được bật = true.
// 2. Cổng campaignBrief nhận diện mode=attached_file là ready và đi tiếp sang schedule.
// 3. Sau khi reload (dropMarkers), persistedState vẫn giữ nguyên hasAttachedFile: true.
export default {
  name: 'nội dung từ file ảnh: nhận diện hasAttachedFile và không hỏi lại',
  locale: 'vi',
  resources: {
    emailSenders: [{ id: 7, name: 'Sales', email: 'sales@example.vn', status: 'active' }],
    zaloAccounts: [],
  },
  turns: [
    { push: { role: 'user', content: 'Tạo chiến dịch email quảng cáo khoá học' } },
    { push: { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' } },
    { push: { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":7,"accountName":"Sales"}\nSales' } },
    { push: { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDanh sách khách hàng' } },
    // Người dùng đính kèm file ảnh .png
    { push: { role: 'user', content: 'Nội dung lấy từ ảnh poster này', files: [{ originalName: 'poster.png', contentType: 'image/png' }] } },
    { expectState: { hasAttachedFile: true } },
    { snapshotPersisted: true },
    { push: { role: 'user', content: '[wizard]{"gate":"campaignBrief","contentMode":"attached_file"}\nDùng nội dung trong file ảnh' } },
    // Không bị kẹt lại ở campaignBrief mà phải sang cổng schedule
    { expectGate: 'schedule' },
    { expectState: { hasAttachedFile: true } },
    { push: { role: 'user', content: '[wizard]{"gate":"schedule","value":"once","mode":"once"}\nGửi một lần' } },
    { expectNoGate: true },
    // Reload: bỏ markers, persistedState vẫn phải giữ hasAttachedFile: true
    { snapshotPersisted: true },
    { dropMarkers: true },
    { expectState: { hasAttachedFile: true } },
    { expectNoGate: true },
  ],
};
