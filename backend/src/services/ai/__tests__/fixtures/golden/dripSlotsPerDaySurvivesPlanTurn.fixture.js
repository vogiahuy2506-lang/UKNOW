// Regression (bug thật 2026-08-23): chọn "chuỗi 5 ngày, 2 tin/ngày" xong, tới lượt xin
// content_plan thì trợ lý hỏi lại lịch gửi từ đầu.
//
// Gốc: chỉ cần slotsPerDay rơi khỏi state là isValidDripSchedule
// (aiCampaignWizard.service.js:52-58) trả false ⇒ cổng schedule bật lại, dù days vẫn còn.
// Hai lượt "prompt máy" (xin content_plan, xin template từng slot) do frontend tự sinh
// đều là tin nhắn role=user — chúng nâng latestCampaignMessageIndex, nên đây đúng là
// chỗ state hay bị đánh rơi. Fixture khoá NGUYÊN khối schedule qua cả hai lượt đó
// lẫn qua reload.
export default {
  name: 'drip 5 ngày × 2 tin: lịch gửi sống qua lượt xin content_plan',
  locale: 'vi',
  resources: {
    emailSenders: [{ id: 7, name: 'Sales', email: 'sales@example.vn', status: 'active' }],
    zaloAccounts: [],
  },
  turns: [
    { push: { role: 'user', content: 'Tạo chuỗi email 5 ngày chăm sóc khách hàng mới' } },
    { push: { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' } },
    { push: { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":7,"accountName":"Sales"}\nSales' } },
    { push: { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDanh sách khách hàng' } },
    { push: { role: 'user', content: '[wizard]{"gate":"campaignBrief","contentMode":"custom_topic","topicText":"Chăm sóc khách hàng mới"}\nChủ đề' } },
    { push: { role: 'user', content: '[wizard]{"gate":"schedule","value":"drip","mode":"drip","days":5,"slotsPerDay":2}\n5 ngày, 2 tin mỗi ngày' } },
    { expectState: { schedule: { mode: 'drip', days: 5, slotsPerDay: 2 } } },
    { snapshotPersisted: true },
    // Lượt prompt máy do frontend sinh (AiChatbot.jsx:1851) — không được đụng vào lịch
    { push: { role: 'user', content: 'Hãy trả về content_plan JSON (kế hoạch từng ngày, không viết full nội dung tin) cho: chuỗi 5 ngày chăm sóc khách hàng mới' } },
    { expectState: { schedule: { mode: 'drip', days: 5, slotsPerDay: 2 } } },
    { expectNoGate: true },
    {
      push: {
        role: 'assistant',
        type: 'content_plan',
        content: 'Kế hoạch 5 ngày',
        data: { totalDays: 5, days: [{ day: 1, channel: 'email', slots: [{ channel: 'email', summary: 'Chào mừng' }] }] },
      },
    },
    { expectGate: 'planApproved' },
    { push: { role: 'user', content: '[wizard]{"gate":"planApproved","value":true}\nĐồng ý với kế hoạch này.' } },
    // Lượt prompt máy thứ hai (AiChatbot.jsx:2187) — cũng không được đụng vào lịch
    { push: { role: 'user', content: 'Tạo chi tiết template cho ngày 1, slot 2 (Email).' } },
    { expectState: { schedule: { mode: 'drip', days: 5, slotsPerDay: 2 } } },
    { expectNoGate: true },
    // Reload giữa chừng: persisted phải giữ đủ CẢ days LẪN slotsPerDay
    { snapshotPersisted: true },
    { dropMarkers: true },
    { expectState: { schedule: { mode: 'drip', days: 5, slotsPerDay: 2 } } },
    { expectNoGate: true },
  ],
};
