// Regression (bug thật 2026-08-25): tải lại trang giữa chuỗi drip, bấm "Lưu vào thư viện"
// thì trợ lý đứng im, không sinh tiếp slot sau.
//
// Bug đó có hai nửa. Nửa TRÌNH DUYỆT (cờ _planTemplate/_planSlotKey chỉ sống trong RAM,
// reload là mất) được dựng lại từ planSlotKey — đã có test riêng ở
// frontend/src/features/ai/utils/planWorkflowReconstitution. Nửa MÁY TRẠNG THÁI là
// fixture này: sau reload, mọi cổng phải im lặng để chuỗi chạy tiếp, kể cả khi lượt kế
// tiếp là prompt máy xin slot sau — nếu một cổng bật lên ở đây, chuỗi đứt đúng như
// người dùng thấy.
//
// Khác với reloadLostApprovalMarker (email, dừng ngay sau template_draft đầu tiên):
// ca này là zalo cá nhân nhiều slot/ngày và đi TIẾP qua reload.
export default {
  name: 'reload rồi lưu template: chuỗi drip chạy tiếp, không cổng nào bật lại',
  locale: 'vi',
  resources: {
    emailSenders: [],
    zaloAccounts: [{ id: 12, displayName: 'TK Zalo', status: 'connected', isActive: true }],
  },
  turns: [
    { push: { role: 'user', content: 'Tạo chuỗi zalo 3 ngày nhắc học viên vào lớp' } },
    { push: { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo"}\nZalo cá nhân' } },
    { push: { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"zalo","accountId":12,"accountName":"TK Zalo"}\nTK Zalo' } },
    { push: { role: 'user', content: '[wizard]{"gate":"dataSource","value":"zalo_contacts"}\nDanh bạ Zalo' } },
    { push: { role: 'user', content: '[wizard]{"gate":"zaloFriends","accountId":12,"friendIds":["uid-1","uid-2"]}\nTôi chọn 2 người.' } },
    { push: { role: 'user', content: '[wizard]{"gate":"campaignBrief","contentMode":"custom_topic","topicText":"Nhắc học viên vào lớp"}\nChủ đề' } },
    { push: { role: 'user', content: '[wizard]{"gate":"schedule","value":"drip","mode":"drip","days":3,"slotsPerDay":2}\n3 ngày, 2 tin mỗi ngày' } },
    {
      push: {
        role: 'assistant',
        type: 'content_plan',
        content: 'Kế hoạch 3 ngày',
        data: { totalDays: 3, days: [{ day: 1, channel: 'zalo', slots: [{ channel: 'zalo', summary: 'Nhắc lịch' }] }] },
      },
    },
    { push: { role: 'user', content: '[wizard]{"gate":"planApproved","value":true}\nĐồng ý với kế hoạch này.' } },
    { push: { role: 'assistant', type: 'template_draft', content: 'Tin ngày 1 slot 1', data: { channel: 'zalo', planSlotKey: 'd1-s1' } } },
    { expectNoGate: true },
    { snapshotPersisted: true },
    // ↓ Reload trang: marker [wizard] biến mất khỏi history client dựng lại từ DB
    { dropMarkers: true },
    {
      expectState: {
        channel: 'zalo',
        senderAccountId: 12,
        zaloFriendIds: ['uid-1', 'uid-2'],
        schedule: { mode: 'drip', days: 3, slotsPerDay: 2 },
        planApproved: true,
        hasContentPlan: true,
      },
    },
    { expectNoGate: true },
    // Bấm "Lưu vào thư viện" (patchWizardState, không sinh tin nhắn) rồi client tự xin slot kế
    { push: { role: 'user', content: 'Tạo chi tiết template cho ngày 1, slot 2 (Zalo).' } },
    // ↓ Dòng chặn "đứng im": có cổng nào bật ở đây là chuỗi đứt
    { expectNoGate: true },
    { push: { role: 'assistant', type: 'template_draft', content: 'Tin ngày 1 slot 2', data: { channel: 'zalo', planSlotKey: 'd1-s2' } } },
    { expectNoGate: true },
  ],
};
