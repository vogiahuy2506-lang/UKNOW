/**
 * Điểm vào cũ của hai modal khách theo chiến dịch. Đã tách (PR-C3) thành:
 *  - `CustomerDetailModal.jsx`   chi tiết khách + khoá học/đơn trong chiến dịch
 *  - `JourneyModal.jsx`          hành trình email/Zalo theo đợt chạy
 *  - `CustomerJourneyItems.jsx`  các mục hành trình dùng chung (email, Zalo)
 *  - `CustomerModalBase.jsx`     khung modal
 * Giữ file này để nơi import cũ không phải đổi.
 */
export { default as CustomerDetailModal } from './CustomerDetailModal';
export { default as JourneyModal } from './JourneyModal';
