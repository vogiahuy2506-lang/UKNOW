// Zalo nhóm: bắt buộc chọn nhóm sau khi chọn tài khoản; KHÔNG hỏi dataSource
// (nguồn người nhận chính là các nhóm); tiếp theo là lịch gửi.
export default {
  name: 'zalo_group cần group picker, bỏ qua dataSource',
  locale: 'vi',
  resources: {
    emailSenders: [],
    zaloAccounts: [{ id: 12, displayName: 'TK Zalo', status: 'connected', isActive: true }],
  },
  turns: [
    { push: { role: 'user', content: 'Tạo chiến dịch zalo nhóm thông báo khai giảng' } },
    { push: { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo_group"}\nZalo nhóm' } },
    { expectGate: 'senderAccount' },
    { push: { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"zalo_group","accountId":12,"accountName":"TK Zalo"}\nTK Zalo' } },
    { expectGate: 'zaloGroups' },
    { push: { role: 'user', content: '[wizard]{"gate":"zaloGroups","accountId":12,"groupIds":["g1","g2"]}\nTôi chọn 2 nhóm.' } },
    // zalo_group bỏ qua dataSource — gate kế tiếp là campaignBrief rồi schedule
    { expectGate: 'campaignBrief' },
    { push: { role: 'user', content: '[wizard]{"gate":"campaignBrief","contentMode":"custom_topic","topicText":"Thông báo khai giảng"}\nChủ đề' } },
    { expectGate: 'schedule' },
    { push: { role: 'user', content: '[wizard]{"gate":"schedule","value":"once","mode":"once"}\nGửi một lần' } },
    { expectNoGate: true },
    { expectState: { channel: 'zalo_group', zaloGroupIds: ['g1', 'g2'] } },
  ],
};
