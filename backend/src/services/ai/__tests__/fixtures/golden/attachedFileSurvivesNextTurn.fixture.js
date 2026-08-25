// Regression (bug thật 2026-08-24): chọn "nội dung lấy từ file đính kèm", ném file vào,
// bấm tiếp tục — trợ lý hỏi lại đúng câu đó, mãi không qua được.
//
// Cơ chế (đã đo bằng extractWizardState trên từng tiền tố history):
//   extractWizardState chỉ đếm file gửi kèm TỪ tin nhắn chiến dịch mới nhất trở đi
//   (aiCampaignWizard.service.js:436-450). Mỗi marker [wizard] lại tự nâng
//   latestCampaignMessageIndex, nên ngay ở lượt gửi marker campaignBrief thì tin nhắn
//   mang file đã nằm TRƯỚC mốc đó ⇒ derived.hasAttachedFile quay về false.
//   Chỉ persisted cứu được: mergeWizardState:1020 `d.hasAttachedFile || p.hasAttachedFile`.
//   Bỏ vế `|| p.hasAttachedFile` là brief attached_file hết "ready" ⇒ hỏi lại vô tận.
export default {
  name: 'nội dung từ file đính kèm: không hỏi lại ở lượt kế tiếp',
  locale: 'vi',
  resources: {
    emailSenders: [{ id: 7, name: 'Sales', email: 'sales@example.vn', status: 'active' }],
    zaloAccounts: [],
  },
  turns: [
    { push: { role: 'user', content: 'Tạo chiến dịch email giới thiệu sản phẩm' } },
    { push: { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' } },
    { push: { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":7,"accountName":"Sales"}\nSales' } },
    { push: { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDanh sách khách hàng' } },
    // Lượt người dùng ném file vào — lượt DUY NHẤT derived nhìn thấy file
    { push: { role: 'user', content: 'Nội dung lấy trong file này nhé', files: [{ originalName: 'bang-gia.pdf' }] } },
    { expectState: { hasAttachedFile: true } },
    // Server ghi wizard_state sau request đó
    { snapshotPersisted: true },
    { push: { role: 'user', content: '[wizard]{"gate":"campaignBrief","contentMode":"attached_file"}\nDùng nội dung trong file' } },
    // ↓ Dòng chặn vòng lặp: trước bản vá, chỗ này trả lại 'campaignBrief'
    { expectGate: 'schedule' },
    { expectState: { hasAttachedFile: true } },
    { push: { role: 'user', content: '[wizard]{"gate":"schedule","value":"once","mode":"once"}\nGửi một lần' } },
    { expectNoGate: true },
    // Reload cũng không được làm mất dấu file đã đính kèm
    { snapshotPersisted: true },
    { dropMarkers: true },
    { expectState: { hasAttachedFile: true } },
    { expectNoGate: true },
  ],
};
