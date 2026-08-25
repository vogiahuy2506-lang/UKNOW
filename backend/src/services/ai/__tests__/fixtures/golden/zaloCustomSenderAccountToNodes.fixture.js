// Regression (bug thật 25/08/2026): Người dùng chọn tài khoản Zalo không phải mặc định (ID 2 thay vì ID 1),
// nhưng node vẫn nhận tài khoản mặc định do senderAccountId bị rỗng lúc chuyển xuống bộ vá.
// Fixture này đảm bảo:
// 1. senderAccountId được ghi nhận và duy trì qua tất cả các bước wizard.
// 2. Kể cả sau khi reload (dropMarkers), persistedState vẫn giữ đúng senderAccountId đã chọn.
export default {
  name: 'zalo cá nhân: chọn tài khoản không phải mặc định → giữ đúng senderAccountId',
  locale: 'vi',
  resources: {
    emailSenders: [],
    zaloAccounts: [
      { id: 1, displayName: 'TK Mặc Định', status: 'connected', isDefault: true, isActive: true },
      { id: 2, displayName: 'Nhật Minh', status: 'connected', isDefault: false, isActive: true },
    ],
  },
  turns: [
    { push: { role: 'user', content: 'Tạo chiến dịch Zalo gửi lời chào khách hàng' } },
    { push: { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo"}\nZalo cá nhân' } },
    { expectGate: 'senderAccount' },
    // Người dùng chủ động chọn tài khoản ID 2 (Nhật Minh) thay vì tài khoản ID 1
    { push: { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"zalo","accountId":2,"accountName":"Nhật Minh"}\nTôi chọn tài khoản "Nhật Minh".' } },
    { expectGate: 'dataSource' },
    { expectState: { senderAccountId: 2, channel: 'zalo' } },
    { push: { role: 'user', content: '[wizard]{"gate":"dataSource","value":"sheet"}\nFile Excel / Google Sheet' } },
    { expectNoGate: true }, // Dừng để hỏi URL
    { push: { role: 'user', content: 'https://docs.google.com/spreadsheets/d/abc-zalo-123/edit' } },
    { expectGate: 'campaignBrief' },
    { expectState: { senderAccountId: 2, dataSource: 'sheet' } },
    { push: { role: 'user', content: '[wizard]{"gate":"campaignBrief","contentMode":"custom_topic","topicText":"Chào khách hàng"}\nChủ đề' } },
    { expectGate: 'schedule' },
    { push: { role: 'user', content: '[wizard]{"gate":"schedule","value":"once","mode":"once"}\nGửi một lần' } },
    { expectNoGate: true },
    // Reload: marker biến mất khỏi history, persisted phải giữ được senderAccountId = 2
    { snapshotPersisted: true },
    { dropMarkers: true },
    { expectState: { senderAccountId: 2, channel: 'zalo', dataSource: 'sheet' } },
    { expectNoGate: true },
  ],
};
