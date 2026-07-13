// Lịch gửi "một lần" (once) → KHÔNG có gate planApproved kể cả khi có content_plan
// trong history (planApproved chỉ áp cho drip nhiều ngày).
export default {
  name: 'schedule once → không bao giờ hỏi planApproved',
  locale: 'vi',
  resources: {
    emailSenders: [{ id: 7, name: 'Sales', email: 'sales@example.vn', status: 'active' }],
    zaloAccounts: [],
  },
  turns: [
    { push: { role: 'user', content: 'Tạo chiến dịch email thông báo khuyến mãi' } },
    { push: { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' } },
    { push: { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":7,"accountName":"Sales"}\nSales' } },
    { push: { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDanh sách khách hàng' } },
    { push: { role: 'user', content: '[wizard]{"gate":"schedule","value":"once","mode":"once"}\nGửi một lần' } },
    { expectNoGate: true },
    // Kể cả khi AI lỡ trả content_plan, schedule once vẫn không sinh gate planApproved
    {
      push: {
        role: 'assistant',
        type: 'content_plan',
        content: 'Kế hoạch',
        data: { totalDays: 1, days: [{ day: 1, channel: 'email', slots: [{ channel: 'email', summary: 'KM' }] }] },
      },
    },
    { expectNoGate: true },
    { expectState: { planApproved: false, hasContentPlan: true } },
  ],
};
