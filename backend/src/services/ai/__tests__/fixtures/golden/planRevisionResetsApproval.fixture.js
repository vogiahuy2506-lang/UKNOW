// Góp ý chỉnh kế hoạch phải reset planApproved/hasContentPlan — thắng cả persisted state.
export default {
  name: 'revision text reset duyệt kế hoạch dù persisted đã approved',
  locale: 'vi',
  resources: {
    emailSenders: [],
    zaloAccounts: [{ id: 12, displayName: 'TK Zalo', status: 'connected', isActive: true }],
  },
  turns: [
    { push: { role: 'user', content: 'Tạo chiến dịch tin nhắn zalo chăm sóc khách 5 ngày' } },
    { push: { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo"}\nZalo cá nhân' } },
    { push: { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"zalo","accountId":12,"accountName":"TK Zalo"}\nTK Zalo' } },
    { push: { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDanh sách khách hàng' } },
    { push: { role: 'user', content: '[wizard]{"gate":"campaignBrief","contentMode":"custom_topic","topicText":"Chăm sóc khách 5 ngày"}\nChủ đề' } },
    { push: { role: 'user', content: '[wizard]{"gate":"schedule","value":"drip","mode":"drip","days":5,"slotsPerDay":1}\n5 ngày' } },
    {
      push: {
        role: 'assistant',
        type: 'content_plan',
        content: 'Kế hoạch 5 ngày',
        data: { totalDays: 5, days: [{ day: 1, channel: 'zalo', slots: [{ channel: 'zalo', summary: 'Chào' }] }] },
      },
    },
    { push: { role: 'user', content: '[wizard]{"gate":"planApproved","value":true}\nĐồng ý với kế hoạch này.' } },
    { expectState: { planApproved: true, hasContentPlan: true } },
    { snapshotPersisted: true },
    { push: { role: 'user', content: 'Góp ý chỉnh kế hoạch: chỉ 4 ngày thôi, ngày cuối nhắc ưu đãi' } },
    { expectState: { planApproved: false, hasContentPlan: false } },
    // Không còn content plan ⇒ không có gate nào chặn — AI sẽ sinh plan mới
    { expectNoGate: true },
  ],
};
