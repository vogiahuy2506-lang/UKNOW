import api from '../../../services/api';

// PLAN_CAU_HINH_LICH_NHAC_HAN_2026-09-13.md, mục 5 (PR-2) — tài nguyên riêng với
// adminSystemEmailTemplateApiService (khác route, khác hình dạng dữ liệu: lịch gửi, không phải
// nội dung thư), nên đặt ở service riêng thay vì nhét thêm hàm vào service mẫu thư.
const adminSubscriptionReminderSettingsApiService = {
  getSettings() {
    return api.get('/admin/subscription-reminder-settings');
  },
  // PLAN_MOC_NHAC_HAN_THEO_KY B5 — lưu MỘT lần cả hai danh sách: daysBefore = gói tháng, daysBeforeYearly = gói năm.
  updateSettings({ daysBefore, daysBeforeYearly }) {
    return api.put('/admin/subscription-reminder-settings', { daysBefore, daysBeforeYearly });
  },
};

export default adminSubscriptionReminderSettingsApiService;
