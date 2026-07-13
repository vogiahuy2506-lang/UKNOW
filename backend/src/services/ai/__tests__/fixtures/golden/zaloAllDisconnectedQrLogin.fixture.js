// Chọn Zalo nhưng mọi tài khoản đều disconnected → wizard phải trả zalo_qr_login
// (quét QR kết nối lại), không hiện danh sách account chọn.
export default {
  name: 'zalo toàn tài khoản disconnected → zalo_qr_login',
  locale: 'vi',
  resources: {
    emailSenders: [],
    zaloAccounts: [
      { id: 1, displayName: 'TK cũ 1', status: 'disconnected', isActive: true },
      { id: 2, displayName: 'TK cũ 2', status: 'disconnected', isActive: true },
    ],
  },
  turns: [
    { push: { role: 'user', content: 'Tạo chiến dịch tin nhắn zalo cho khách' } },
    { push: { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo"}\nZalo cá nhân' } },
    { expectGate: 'senderAccount' },
    { expectGateResponseType: 'zalo_qr_login' },
  ],
};
