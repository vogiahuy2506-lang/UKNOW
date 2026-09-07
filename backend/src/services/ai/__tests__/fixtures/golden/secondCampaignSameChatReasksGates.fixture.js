// PLAN_WIZARD_VONG_DOI_2026-09-07 PR-1 — ranh giới campaign_created.
//
// Bug thật báo 06/09/2026: tạo xong chiến dịch Zalo nhóm A trong chat, gõ tiếp "tạo chiến
// dịch nữa" — trợ lý CHỈ hỏi gửi một lần hay nhiều lần (nhảy thẳng lịch gửi), không hỏi tài
// khoản gửi, không hỏi nhóm; thẻ xác nhận điền sẵn nhóm + tài khoản của A. Nguyên nhân: không
// nơi nào biết chiến dịch A đã tạo xong — gates persisted vẫn giữ sender/nhóm của A.
//
// Fixture này mô phỏng ĐÚNG hai việc production làm khi mark_campaign_created chạy:
// 1. saveAssistantMessage ghi tin `campaign_created` vào history (ranh giới nằm trong lịch sử,
//    ba nơi đều thấy — không phụ thuộc chỉ số tin nhắn).
// 2. applyWizardStateAction('mark_campaign_created') ghi next.gates =
//    createEmptyWizardState().gates lên server — patchPersisted mô phỏng đúng giá trị đó.
export default {
  name: 'hai chiến dịch trong một hội thoại — campaign_created đóng luồng, B hỏi lại từ đầu',
  locale: 'vi',
  resources: {
    zaloAccounts: [
      { id: 8, displayName: 'TK 8', status: 'connected', isActive: true },
      { id: 9, displayName: 'TK 9', status: 'connected', isActive: true },
    ],
  },
  turns: [
    // ---- Chiến dịch A: Zalo nhóm, TK 8, nhóm "ĐI LÀM" (g1) ----
    { push: { role: 'user', content: 'Tạo chiến dịch Zalo nhóm thông báo lịch nghỉ' } },
    { push: { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo_group"}\nZalo nhóm' } },
    { push: { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"zalo_group","accountId":8}\nTK 8' } },
    { push: { role: 'user', content: '[wizard]{"gate":"zaloGroups","accountId":8,"groupIds":["g1"]}\nChọn nhóm ĐI LÀM' } },
    { push: { role: 'assistant', type: 'confirm_create', content: 'Xác nhận tạo chiến dịch A?', data: { campaignType: 'zalo_group' } } },

    // ---- Server tạo xong A: ghi ranh giới + đóng luồng (mark_campaign_created) ----
    { push: { role: 'assistant', type: 'campaign_created', content: '🎉 Chiến dịch A đã được tạo.', data: { campaignId: 100 } } },
    {
      patchPersisted: {
        isCampaignFlow: false,
        channel: null,
        senderAccountId: null,
        senderAccountName: null,
        dataSource: null,
        sheetUrl: null,
        sheetCheck: null,
        zaloGroupIds: [],
        zaloFriendIds: [],
        schedule: null,
        planApproved: false,
        senderOtherRequested: false,
        hasContentPlan: false,
        hasAttachedFile: false,
        hasAttachedSpreadsheet: false,
        fileUsage: null,
        abandonedAtMessageCount: null,
      },
    },

    // ---- Chiến dịch B: CÙNG hội thoại, gõ tiếp ngay sau ranh giới ----
    { push: { role: 'user', content: 'Tạo thêm chiến dịch Zalo nhóm nữa' } },
    // Đúng lỗi thật: KHÔNG được nhảy thẳng lịch gửi hay điền sẵn TK 8 / nhóm g1 của A.
    { expectGate: 'senderAccount' },
    { push: { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"zalo_group","accountId":9}\nTK 9' } },
    // TK của B, KHÔNG phải TK 8; nhóm vẫn rỗng, KHÔNG phải g1 của A.
    { expectState: { senderAccountId: 9, zaloGroupIds: [] } },
    { expectGate: 'zaloGroups' },
  ],
};
