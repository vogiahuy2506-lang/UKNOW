// Regression (bug thật 29/08/2026): Người dùng đưa Google Sheet quản lý công việc không có cột SĐT/Email.
// Async check phát hiện sheetCheck.status = 'no_contact'.
// Wizard state machine phải chặn tại gate 'sheetUrl' với response type 'text' và không cho đi tiếp sang campaignBrief/schedule.
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/job-tracker-no-contact/edit';

export default {
  name: 'google sheet thiếu cột liên hệ: chặn ở gate sheetUrl và không tạo chiến dịch',
  locale: 'vi',
  resources: {
    emailSenders: [],
    zaloAccounts: [{ id: 1, name: 'Zalo 1', is_active: true, status: 'connected' }],
    courses: [{ id: 10, name: 'Khoá học Marketing' }],
  },
  turns: [
    { push: { role: 'user', content: 'Tạo chiến dịch Zalo gửi danh sách khách' } },
    { push: { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo"}\nZalo cá nhân' } },
    { push: { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"zalo","accountId":1,"accountName":"Zalo 1"}\nZalo 1' } },
    { push: { role: 'user', content: '[wizard]{"gate":"dataSource","value":"sheet"}\nFile Excel / Google Sheet' } },
    // Dán link Google Sheet không có cột liên hệ
    { push: { role: 'user', content: `Dùng danh sách này nhé: ${SHEET_URL}` } },
    { snapshotPersisted: true },
    // Async checker ghi nhận sheetCheck = no_contact
    {
      patchPersisted: {
        sheetCheck: {
          url: SHEET_URL,
          status: 'no_contact',
        },
      },
    },
    // Wizard phải chặn tại gate 'sheetUrl'
    { expectGate: 'sheetUrl' },
    { expectGateResponseType: 'text' },
  ],
};
