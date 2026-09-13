import api from '../../../services/api';

// PLAN_CAU_HINH_LICH_NHAC_HAN_2026-09-13.md, mục 5 (PR-2) — tài nguyên riêng với
// adminSystemEmailTemplateApiService (khác route, khác hình dạng dữ liệu: lịch gửi, không phải
// nội dung thư), nên đặt ở service riêng thay vì nhét thêm hàm vào service mẫu thư.
const adminSubscriptionReminderSettingsApiService = {
  getSettings() {
    return api.get('/admin/subscription-reminder-settings');
  },
  updateSettings(daysBefore) {
    return api.put('/admin/subscription-reminder-settings', { daysBefore });
  },
};

export default adminSubscriptionReminderSettingsApiService;
