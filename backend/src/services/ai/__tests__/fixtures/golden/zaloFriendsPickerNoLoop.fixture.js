// Regression (bug thật 2026-08-24): chọn xong bạn bè Zalo thì picker mở lại vô hạn.
// Gốc: mergeWizardState dựng `merged` bằng tay và QUÊN zaloFriendIds — derived có
// ["uid-1","uid-2"] nhưng merged trả undefined, cổng zaloFriends
// (aiCampaignWizard.service.js:834) thấy "không phải mảng" nên mở picker lại.
// Fixture khoá hai điều: (i) ngay sau marker phải sang campaignBrief, KHÔNG quay lại
// zaloFriends; (ii) sau reload (marker mất) persisted vẫn giữ danh sách đã chọn.
export default {
  name: 'zalo cá nhân: chọn bạn bè xong là đi tiếp, không mở lại picker',
  locale: 'vi',
  resources: {
    emailSenders: [],
    zaloAccounts: [{ id: 12, displayName: 'TK Zalo', status: 'connected', isActive: true }],
  },
  turns: [
    { push: { role: 'user', content: 'Tạo chiến dịch zalo cá nhân giới thiệu khoá học mới' } },
    { push: { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo"}\nZalo cá nhân' } },
    { expectGate: 'senderAccount' },
    { push: { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"zalo","accountId":12,"accountName":"TK Zalo"}\nTK Zalo' } },
    // Zalo cá nhân KHÁC zalo nhóm: vẫn phải hỏi nguồn người nhận
    { expectGate: 'dataSource' },
    { push: { role: 'user', content: '[wizard]{"gate":"dataSource","value":"zalo_contacts"}\nDanh bạ Zalo' } },
    { expectGate: 'zaloFriends' },
    { expectGateResponseType: 'zalo_friend_picker' },
    { push: { role: 'user', content: '[wizard]{"gate":"zaloFriends","accountId":12,"friendIds":["uid-1","uid-2"]}\nTôi chọn 2 người.' } },
    // ↓ Dòng chặn vòng lặp: trước bản vá, chỗ này trả lại 'zaloFriends' mãi mãi
    { expectGate: 'campaignBrief' },
    { expectState: { zaloFriendIds: ['uid-1', 'uid-2'] } },
    { push: { role: 'user', content: '[wizard]{"gate":"campaignBrief","contentMode":"custom_topic","topicText":"Giới thiệu khoá học mới"}\nChủ đề' } },
    { expectGate: 'schedule' },
    { push: { role: 'user', content: '[wizard]{"gate":"schedule","value":"once","mode":"once"}\nGửi một lần' } },
    { expectNoGate: true },
    // Reload: marker biến mất khỏi history, persisted phải giữ được người nhận
    { snapshotPersisted: true },
    { dropMarkers: true },
    { expectState: { zaloFriendIds: ['uid-1', 'uid-2'], senderAccountId: 12 } },
    { expectNoGate: true },
  ],
};
