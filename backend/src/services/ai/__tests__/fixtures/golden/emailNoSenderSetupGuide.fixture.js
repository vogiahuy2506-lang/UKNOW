// Chọn kênh email nhưng chưa có email sender nào → wizard phải trả email_setup_guide
// (onboarding), không hỏi tiếp gate khác.
export default {
  name: 'email không có sender → email_setup_guide',
  locale: 'vi',
  resources: { emailSenders: [], zaloAccounts: [] },
  turns: [
    { push: { role: 'user', content: 'Tạo chiến dịch chăm sóc khách hàng' } },
    { expectGate: 'channel' },
    { push: { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' } },
    { expectGate: 'senderAccount' },
    { expectGateResponseType: 'email_setup_guide' },
  ],
};
