// Nguồn "Người điền Biểu mẫu" (bug thật 10/10/2026): wizard cho chọn nguồn `form` nhưng KHÔNG gate nào lưu biểu mẫu đã chọn →
// intent `form` luôn thiếu audience.formId → compiler từ chối, kịch bản rơi về model thuần và node read_form_submissions mang formId ''.
// Nay sau khi chọn nguồn `form` wizard hỏi biểu mẫu (gate `formId`), lưu id, và intent mang audience.formId.
export default {
  name: 'nguồn biểu mẫu: chọn nguồn form → hỏi chọn biểu mẫu → audience.formId=7',
  locale: 'vi',
  resources: {
    emailSenders: [{ id: 7, name: 'Sales', email: 'sales@example.vn', status: 'active' }],
    zaloAccounts: [],
    formPicker: {
      forms: [
        { id: 7, title: 'Đăng ký tư vấn', consentEnabled: true, consentedCount: 12 },
        { id: 9, title: 'Khảo sát khoá học', consentEnabled: false, consentedCount: 0 },
      ],
    },
  },
  expectIntentAudience: { type: 'form', formId: 7 },
  turns: [
    { push: { role: 'user', content: 'Tạo chiến dịch email nhắc người đã nộp biểu mẫu tư vấn' } },
    { push: { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' } },
    { push: { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":7,"accountName":"Sales"}\nSales' } },
    { expectGate: 'dataSource' },
    { push: { role: 'user', content: '[wizard]{"gate":"dataSource","value":"form"}\nNgười điền Biểu mẫu' } },
    // Trước đây: nhảy thẳng sang campaignBrief với formId không ai lưu.
    { expectGate: 'formId' },
    { expectGateResponseType: 'ask_campaign_details' },
    { push: { role: 'user', content: '[wizard]{"gate":"formId","formId":7}\nĐã chọn biểu mẫu Đăng ký tư vấn.' } },
    { expectState: { dataSource: 'form', formId: 7 } },
    { expectGate: 'campaignBrief' },
    // Mất marker khi tải lại trang: formId đã lưu phải sống sót
    { snapshotPersisted: true },
    { dropMarkers: true },
    { expectState: { dataSource: 'form', formId: 7 } },
    { push: { role: 'user', content: '[wizard]{"gate":"campaignBrief","contentMode":"custom_topic","topicText":"Nhắc lịch tư vấn"}\nChủ đề' } },
    { push: { role: 'user', content: '[wizard]{"gate":"schedule","value":"once","mode":"once"}\nGửi một lần' } },
    { expectNoGate: true },
    { expectState: { channel: 'email', formId: 7 } },
  ],
};
