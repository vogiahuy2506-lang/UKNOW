// User bấm "dùng tài khoản khác" (marker other:true) → email: hiện setup guide;
// và sau khi chọn account thật thì flow đi tiếp bình thường (không kẹt other).
export default {
  name: 'sender other:true → setup guide, chọn lại account thật → đi tiếp',
  locale: 'vi',
  resources: {
    emailSenders: [{ id: 7, name: 'Sales', email: 'sales@example.vn', status: 'active' }],
    zaloAccounts: [],
  },
  turns: [
    { push: { role: 'user', content: 'Tạo chiến dịch email giới thiệu sản phẩm' } },
    { push: { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' } },
    { push: { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","other":true}\nTôi muốn dùng email sender khác.' } },
    { expectGate: 'senderAccount' },
    { expectGateResponseType: 'email_setup_guide' },
    // User quay lại chọn account có sẵn → hết kẹt "other"
    { push: { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":7,"accountName":"Sales"}\nSales' } },
    { expectGate: 'dataSource' },
  ],
};
