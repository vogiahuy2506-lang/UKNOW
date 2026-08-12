// Đổi kênh phải reset mọi gate downstream — persisted state KHÔNG được hồi sinh chúng.
export default {
  name: 'đổi kênh reset downstream, persisted không hồi sinh',
  locale: 'vi',
  resources: {
    emailSenders: [{ id: 7, name: 'Sales', email: 'sales@example.vn', status: 'active' }],
    zaloAccounts: [{ id: 12, displayName: 'TK Zalo', status: 'connected', isActive: true }],
  },
  turns: [
    { push: { role: 'user', content: 'Tạo chiến dịch ra mắt sản phẩm' } },
    { push: { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' } },
    { push: { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":7,"accountName":"Sales"}\nSales' } },
    { push: { role: 'user', content: '[wizard]{"gate":"dataSource","value":"sheet"}\nGoogle Sheet' } },
    { push: { role: 'user', content: '[wizard]{"gate":"campaignBrief","contentMode":"custom_topic","topicText":"Ra mắt sản phẩm"}\nChủ đề' } },
    { push: { role: 'user', content: '[wizard]{"gate":"schedule","value":"drip","mode":"drip","days":3,"slotsPerDay":1}\n3 ngày' } },
    {
      push: {
        role: 'assistant',
        type: 'content_plan',
        content: 'Kế hoạch 3 ngày',
        data: { totalDays: 3, days: [{ day: 1, channel: 'email', slots: [{ channel: 'email', summary: 'Ra mắt' }] }] },
      },
    },
    { push: { role: 'user', content: '[wizard]{"gate":"planApproved","value":true}\nĐồng ý.' } },
    { expectNoGate: true },
    { snapshotPersisted: true },
    // Đổi kênh sang Zalo cá nhân
    { push: { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo"}\nĐổi qua Zalo' } },
    {
      expectState: {
        channel: 'zalo',
        senderAccountId: null,
        dataSource: null,
        schedule: null,
        planApproved: false,
      },
    },
    { expectGate: 'senderAccount' },
  ],
};
