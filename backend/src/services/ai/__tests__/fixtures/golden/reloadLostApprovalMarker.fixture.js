// Regression (bug thật 2026-07-11): session reload làm mất marker [wizard] khỏi history.
// (i) planApproved vẫn suy được từ history (template_draft sau content_plan ⇒ đã duyệt);
// (ii) persisted state (đã snapshot trước reload) khôi phục mọi gate ⇒ không hỏi lại gì.
export default {
  name: 'reload mất marker: persisted state khôi phục toàn bộ gate',
  locale: 'vi',
  resources: {
    emailSenders: [{ id: 7, name: 'Sales', email: 'sales@example.vn', status: 'active' }],
    zaloAccounts: [],
  },
  turns: [
    { push: { role: 'user', content: 'Tạo chiến dịch chăm sóc khách hàng mới' } },
    { push: { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' } },
    { push: { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":7,"accountName":"Sales"}\nSales' } },
    { push: { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDanh sách khách hàng' } },
    { push: { role: 'user', content: '[wizard]{"gate":"schedule","value":"drip","mode":"drip","days":3,"slotsPerDay":1}\n3 ngày' } },
    {
      push: {
        role: 'assistant',
        type: 'content_plan',
        content: 'Kế hoạch 3 ngày',
        data: { totalDays: 3, days: [{ day: 1, channel: 'email', slots: [{ channel: 'email', summary: 'Chào mừng' }] }] },
      },
    },
    { push: { role: 'user', content: '[wizard]{"gate":"planApproved","value":true}\nĐồng ý với kế hoạch này.' } },
    { push: { role: 'assistant', type: 'template_draft', content: 'Email 1', data: { channel: 'email', templateName: 'Email 1' } } },
    { expectNoGate: true },
    // Server ghi state sau request này
    { snapshotPersisted: true },
    // Reload: client rebuild history từ DB, marker silent bị mất
    { dropMarkers: true },
    // (i) inference từ history vẫn cho planApproved (template_draft sau content_plan)
    { expectState: { planApproved: true, hasContentPlan: true } },
    // (ii) persisted khôi phục sender/dataSource/schedule ⇒ không hỏi lại gate nào
    { expectState: { channel: 'email', senderAccountId: 7, dataSource: 'db' } },
    { expectNoGate: true },
  ],
};
