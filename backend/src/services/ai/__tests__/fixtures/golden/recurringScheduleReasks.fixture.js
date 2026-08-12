// User đòi gửi lặp định kỳ ("mỗi 7 ngày") — chưa hỗ trợ → wizard re-ask schedule
// với lựa chọn once/drip, không đi tiếp.
export default {
  name: 'schedule recurring (mỗi N ngày) → re-ask schedule',
  locale: 'vi',
  resources: {
    emailSenders: [{ id: 7, name: 'Sales', email: 'sales@example.vn', status: 'active' }],
    zaloAccounts: [],
  },
  turns: [
    { push: { role: 'user', content: 'Tạo chiến dịch email gửi mỗi 7 ngày cho khách trong DB' } },
    { push: { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":7,"accountName":"Sales"}\nSales' } },
    { push: { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDB' } },
    { expectGate: 'campaignBrief' },
    { push: { role: 'user', content: '[wizard]{"gate":"campaignBrief","contentMode":"custom_topic","topicText":"Chăm sóc khách định kỳ"}\nChủ đề' } },
    { expectGate: 'schedule' },
    // Trả lời bằng marker schedule recurring tường minh → vẫn re-ask
    { push: { role: 'user', content: '[wizard]{"gate":"schedule","value":"recurring","mode":"recurring","days":7}\nMỗi 7 ngày' } },
    { expectGate: 'schedule' },
    // Đổi sang drip hợp lệ → đi tiếp (không còn gate — chờ AI sinh content_plan)
    { push: { role: 'user', content: '[wizard]{"gate":"schedule","value":"drip","mode":"drip","days":3,"slotsPerDay":1}\n3 ngày' } },
    { expectNoGate: true },
  ],
};
