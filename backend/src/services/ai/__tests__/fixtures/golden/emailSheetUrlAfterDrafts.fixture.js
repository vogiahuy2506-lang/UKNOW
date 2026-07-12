// Regression (bug thật 2026-07-11): flow email → sheet → duyệt kế hoạch → 3 template
// đã soạn → user dán URL Google Sheet dạng text. Wizard KHÔNG được hỏi lại planApproved,
// và sheetUrl phải được capture vào state.
export default {
  name: 'email + sheet: dán URL sau khi đã soạn template không bị hỏi lại duyệt kế hoạch',
  locale: 'vi',
  resources: {
    emailSenders: [{ id: 7, name: 'Sales', email: 'sales@example.vn', status: 'active' }],
    zaloAccounts: [],
  },
  turns: [
    { push: { role: 'user', content: 'Tôi muốn tạo chiến dịch ra mắt sản phẩm mới' } },
    { expectGate: 'channel' },
    { push: { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' } },
    { expectGate: 'senderAccount' },
    { push: { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":7,"accountName":"Sales"}\nTôi chọn email sender "Sales".' } },
    { expectGate: 'dataSource' },
    { push: { role: 'user', content: '[wizard]{"gate":"dataSource","value":"sheet"}\nFile Excel / Google Sheet' } },
    { expectGate: 'schedule' },
    { push: { role: 'user', content: '[wizard]{"gate":"schedule","value":"drip","mode":"drip","days":3,"slotsPerDay":1}\nChuỗi 3 ngày' } },
    { expectNoGate: true },
    {
      push: {
        role: 'assistant',
        type: 'content_plan',
        content: 'Kế hoạch 3 ngày',
        data: {
          totalDays: 3,
          days: [
            { day: 1, channel: 'email', slots: [{ channel: 'email', summary: 'Ra mắt' }] },
            { day: 2, channel: 'email', slots: [{ channel: 'email', summary: 'Tính năng' }] },
            { day: 3, channel: 'email', slots: [{ channel: 'email', summary: 'Ưu đãi' }] },
          ],
        },
      },
    },
    { expectGate: 'planApproved' },
    { push: { role: 'user', content: '[wizard]{"gate":"planApproved","value":true}\nĐồng ý với kế hoạch này.' } },
    { expectNoGate: true },
    { push: { role: 'assistant', type: 'template_draft', content: 'Email 1', data: { channel: 'email', templateName: 'Email 1' } } },
    { push: { role: 'assistant', type: 'template_draft', content: 'Email 2', data: { channel: 'email', templateName: 'Email 2' } } },
    { push: { role: 'assistant', type: 'template_draft', content: 'Email 3', data: { channel: 'email', templateName: 'Email 3' } } },
    { push: { role: 'user', content: 'https://docs.google.com/spreadsheets/d/abc123/edit?usp=sharing' } },
    { expectNoGate: true },
    {
      expectState: {
        channel: 'email',
        dataSource: 'sheet',
        sheetUrl: 'https://docs.google.com/spreadsheets/d/abc123/edit?usp=sharing',
        planApproved: true,
      },
    },
  ],
};
