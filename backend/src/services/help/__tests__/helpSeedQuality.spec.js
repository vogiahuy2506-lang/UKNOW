/**
 * Chặn ba lỗi đã từng xảy ra thật với bài trợ giúp:
 *
 * 1. `body_html` lệch `body_md` — trang đọc ưu tiên `bodyHtml`, nên sửa Markdown
 *    mà quên dựng lại HTML là người dùng đọc bản cũ. Bài `doi-goi` đã mất một
 *    dòng về thời điểm xuất hoá đơn đúng theo cách này.
 * 2. Dán URL trần (`/app/settings/inbox`) thay vì chỉ đường trên giao diện.
 *    Người dùng không biết `/app/...` là gì.
 * 3. Gọi sai tên mục menu. Bài từng ghi "Chatbot Studio" và "Hộp thư" trong khi
 *    giao diện ghi "Tạo AI Chatbot" và "Lịch sử trò chuyện" — người dùng đi tìm
 *    thứ không tồn tại.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@jest/globals';
import { HELP_SEED_ARTICLES } from '../helpSeed.data.js';
import { miniMarkdownToHtml } from '../../../../../frontend/src/utils/miniMarkdownToHtml.js';
import viDictionary from '../../../../../frontend/src/i18n/vi.js';
import { CHANNEL_ATTACHMENT_LIMITS } from '../../../../../frontend/src/features/campaigns/utils/channelAttachments.js';

/**
 * Cấu trúc menu THẬT, chép từ `frontend/src/components/layout/admin/Sidebar.jsx`
 * (`userMenuItems`) + nhãn trong `frontend/src/i18n/vi.js` (`nav.*`).
 * Đổi menu bên frontend thì cập nhật bảng này, test sẽ chỉ ra bài nào phải sửa theo.
 */
const REAL_MENU = {
  'AI Chatbot': ['Tạo AI Chatbot', 'Lịch sử trò chuyện', 'Thư viện media'],
  'Chiến dịch': [
    'Gửi nhanh',
    'Quản lý kênh gửi',
    'Thư viện nội dung',
    'Quản lý chiến dịch',
    'Giám sát gửi tin',
    'Khách hàng từ chiến dịch',
  ],
  'Landing page': ['Khách hàng từ Landing page', 'Tạo Landing page', 'Biểu mẫu'],
  'Gói & Thanh toán': ['Tổng quan gói', 'Mua thêm hạn mức'],
  'Cài đặt': ['Hồ sơ doanh nghiệp', 'Nhân viên', 'Nhật ký hoạt động'],
};

/**
 * Nhãn giao diện mà bài nhắc tới bằng chữ in đậm / chữ nghiêng (PLAN_SO_LIEU_DUNG_GON_KHOP PR-11).
 * Mỗi dòng: [bài, khoá trong `frontend/src/i18n/vi.js`, chữ hiện trên màn]. Đổi chữ trên màn thì test đỏ và chỉ
 * đúng bài phải sửa theo — trước đây `campaign-theo-doi` tả "Tin lỗi", "Hiệu quả theo kênh" trong khi trang đã viết lại.
 * Khi so, bỏ dấu chấm cuối câu và đuôi ": {count}" của từ điển (số liệu chèn vào lúc chạy).
 */
const UI_LABELS_IN_ARTICLES = [
  ['quick-send', 'quickSendAdapter.modeConversations', 'Người đã nhắn tới tài khoản'],
  ['quick-send', 'quickSendAdapter.modeManualTelegram', 'Nhập chat id'],
  ['quick-send', 'quickSendAdapter.modeManualWhatsApp', 'Nhập số điện thoại'],
  ['quick-send', 'quickSendAdapter.modeGroups', 'Nhóm'],
  ['quick-send', 'quickSendAdapter.groupsLoad', 'Tải danh sách nhóm'],
  ['quick-send', 'quickSend.zaloRecipientTypeLabel', 'Loại người nhận'],
  ['quick-send', 'quickSend.zaloRecipientTypeGroup', 'Nhóm'],
  ['campaign-theo-doi', 'userDeliveryMonitor.title', 'Giám sát gửi tin'],
  ['campaign-theo-doi', 'userDeliveryMonitor.refresh', 'Làm mới'],
  ['campaign-theo-doi', 'userDeliveryMonitor.cards.sent', 'Đã gửi hôm nay'],
  ['campaign-theo-doi', 'userDeliveryMonitor.cards.failed', 'Chưa gửi được hôm nay'],
  ['campaign-theo-doi', 'userDeliveryMonitor.cards.waiting', 'Đang chờ'],
  ['campaign-theo-doi', 'userDeliveryMonitor.hourlyTitle', 'Tin gửi theo giờ — 24 giờ qua'],
  ['campaign-theo-doi', 'userDeliveryMonitor.hourlyEmpty', 'Chưa có tin nào được gửi trong 24 giờ qua'],
  ['campaign-theo-doi', 'userDeliveryMonitor.runsTitle', 'Lượt chạy gần đây'],
  ['campaign-theo-doi', 'userDeliveryMonitor.col.campaign', 'Chiến dịch'],
  ['campaign-theo-doi', 'userDeliveryMonitor.col.startedAt', 'Bắt đầu'],
  ['campaign-theo-doi', 'userDeliveryMonitor.col.status', 'Trạng thái'],
  ['campaign-theo-doi', 'userDeliveryMonitor.col.sent', 'Đã gửi / Cần gửi'],
  ['campaign-theo-doi', 'userDeliveryMonitor.col.failed', 'Chưa gửi được'],
  ['campaign-theo-doi', 'userDeliveryMonitor.runStatus.running', 'Đang gửi'],
  ['campaign-theo-doi', 'userDeliveryMonitor.runStatus.completed', 'Xong'],
  ['campaign-theo-doi', 'userDeliveryMonitor.runStatus.stopped', 'Đã dừng'],
  ['campaign-theo-doi', 'userDeliveryMonitor.runStatus.failed', 'Lỗi'],
  ['campaign-theo-doi', 'userDeliveryMonitor.waitReason.planQuota', 'đã hết lượt gửi (theo gói hoặc giới hạn bạn đặt)'],
  ['campaign-theo-doi', 'userDeliveryMonitor.waitReason.nextStep', 'chờ tới bước gửi kế tiếp'],
  ['campaign-theo-doi', 'quickSend.deferredReasonQuietHours', 'đang trong khung giờ yên lặng'],
  ['campaign-theo-doi', 'quickSend.deferredReasonRateLimited', 'tài khoản đã đạt giới hạn gửi trong giờ'],
  ['campaign-theo-doi', 'quickSend.deferredReasonPhoneLookupCooldown', 'tài khoản đang bị khoá tra số điện thoại'],
  ['campaign-theo-doi', 'userDeliveryMonitor.failures.recipient', 'Người nhận'],
  ['campaign-theo-doi', 'userDeliveryMonitor.failures.reason', 'Lý do'],
  ['campaign-theo-doi', 'userDeliveryMonitor.failures.count', 'Số lần'],
  ['campaign-theo-doi', 'userDeliveryMonitor.failures.lastAt', 'Lần cuối'],
  ['zalo-gui-cham', 'userDeliveryMonitor.title', 'Giám sát gửi tin'],
  ['zalo-gui-cham', 'userDeliveryMonitor.cards.sent', 'Đã gửi hôm nay'],
  ['zalo-gui-cham', 'userDeliveryMonitor.cards.failed', 'Chưa gửi được hôm nay'],
  ['zalo-gui-cham', 'userDeliveryMonitor.cards.waiting', 'Đang chờ'],
  ['zalo-gui-cham', 'userDeliveryMonitor.runsTitle', 'Lượt chạy gần đây'],
  ['zalo-gui-cham', 'userDeliveryMonitor.col.sent', 'Đã gửi / Cần gửi'],
  ['zalo-gui-cham', 'userDeliveryMonitor.col.failed', 'Chưa gửi được'],
  ['campaign-theo-doi', 'nav.reports', 'Báo cáo'],
  ['campaign-theo-doi', 'common.filter', 'Lọc'],
  ['campaign-theo-doi', 'dashboard.quickSelect', 'Chọn nhanh'],
  ['campaign-theo-doi', 'dashboard.fromDate', 'Từ ngày'],
  ['campaign-theo-doi', 'dashboard.toDate', 'Đến ngày'],
  ['campaign-theo-doi', 'dashboard.channelType', 'Loại kênh'],
  ['campaign-theo-doi', 'dashboard.specificCampaigns', 'Chiến dịch cụ thể'],
  ['campaign-theo-doi', 'dashboard.applyFilter', 'Áp dụng bộ lọc'],
  ['campaign-theo-doi', 'dashboardReport.cards.sent', 'Đã gửi'],
  ['campaign-theo-doi', 'dashboardReport.cards.failed', 'Chưa gửi được'],
  ['campaign-theo-doi', 'dashboardReport.cards.emailEngagement', 'Email · % trên thư đã gửi'],
  ['campaign-theo-doi', 'dashboardReport.cards.emailOpened', 'Email đã mở'],
  ['campaign-theo-doi', 'dashboardReport.cards.emailClicked', 'Email đã bấm link'],
  ['campaign-theo-doi', 'dashboardReport.cards.clicksAllChannels', 'Lượt nhấp link ở mọi kênh'],
  ['campaign-theo-doi', 'dashboardReport.cards.customers', 'Khách phản hồi'],
  ['campaign-theo-doi', 'dashboardReport.cards.leftInfo', 'Để lại thông tin'],
  ['campaign-theo-doi', 'dashboardReport.cards.purchased', 'Đã mua'],
  ['campaign-theo-doi', 'dashboardReport.chart.title', 'Đã gửi mỗi ngày'],
  ['campaign-theo-doi', 'dashboardReport.campaigns.title', 'Chiến dịch trong kỳ'],
  ['campaign-theo-doi', 'dashboardReport.links.deliveryMonitor', 'Xem lượt chạy ở Giám sát gửi tin'],
  ['campaign-theo-doi', 'dashboardReport.links.landing', 'Xem thống kê landing ở mục Landing page'],
  ['campaign-theo-doi', 'dashboard.ordersOverTime', 'Đơn hàng theo thời gian'],
  // PLAN_LAM_GON_TRANG_BAO_CAO (04/10/2026): thẻ AI gọn, nút "Phân tích bằng AI", nút in.
  ['campaign-theo-doi', 'dashboard.analyzeInsight', 'Phân tích bằng AI'],
  ['campaign-theo-doi', 'dashboardReport.ai.title', 'Phân tích AI'],
  ['campaign-theo-doi', 'dashboardReport.ai.todo', 'Nên làm gì'],
  ['campaign-theo-doi', 'dashboardReport.ai.showDetail', 'Xem chi tiết'],
  ['campaign-theo-doi', 'dashboard.printPdf', 'In / PDF'],
  ['campaign-theo-doi', 'ordersTable.title', 'Bảng đơn hàng'],
  ['campaign-theo-doi', 'employee.permissions.reportsView', 'Báo cáo & Thống kê'],
  ['campaign-theo-doi', 'employee.permissions.campaignView', 'Chiến dịch — xem'],
  ['nhan-vien', 'employee.teamActivity', 'Hoạt động nhóm'],
  ['nhan-vien', 'employee.teamColEmployee', 'Nhân viên'],
  ['nhan-vien', 'employee.teamColRunning', 'Chiến dịch đang chạy'],
  ['nhan-vien', 'employee.teamColSent', 'Tin đã gửi tháng này'],
  ['nhan-vien', 'employee.teamColAi', 'Lượt AI kỳ này'],
  ['nhan-vien', 'employee.lastActive', 'Hoạt động gần nhất'],
  ['nhan-vien', 'employee.teamRowYou', 'Bạn'],
  ['nhan-vien', 'employee.teamRowOther', 'Khác (người đã rời nhóm / không xác định)'],
  ['nhan-vien', 'employee.teamRowCompany', 'Cả công ty'],
  ['nhan-vien', 'employee.myContribution.title', 'Tiến độ của bạn'],
  ['nhan-vien', 'employee.limitPerPeriod', 'Giới hạn / kỳ'],
  ['nhan-vien', 'employee.saveLimits', 'Lưu giới hạn'],
  ['nhan-vien', 'nav.reports', 'Báo cáo'],
  ['plan-and-billing', 'billingHub.tabOverview', 'Tổng quan'],
  ['plan-and-billing', 'billingHub.tabLocks', 'Tài nguyên khoá'],
  ['plan-and-billing', 'billingHub.tabOrders', 'Lịch sử đơn'],
  ['plan-and-billing', 'accountProfileModal.messagesInCycle', 'Tin nhắn trong kỳ'],
  ['plan-and-billing', 'accountProfileModal.email', 'Email'],
  ['plan-and-billing', 'accountProfileModal.messagingChannels', 'Zalo'],
  ['plan-and-billing', 'accountProfileModal.telegramMessages', 'Telegram'],
  ['plan-and-billing', 'accountProfileModal.whatsappMessages', 'WhatsApp'],
  ['plan-and-billing', 'accountProfileModal.emailToday', 'Email hôm nay'],
  ['plan-and-billing', 'accountProfileModal.messagingToday', 'Tin nhắn hôm nay'],
  ['plan-and-billing', 'accountProfileModal.messagesCombined', 'Tổng tin nhắn trong kỳ'],
  ['plan-and-billing', 'accountProfileModal.aiUsageTitle', 'Lượt AI trong kỳ'],
  ['plan-and-billing', 'accountProfileModal.aiUsed', 'Đã dùng'],
  ['plan-and-billing', 'accountProfileModal.unlimited', 'Không giới hạn'],
  ['plan-and-billing', 'accountProfileModal.resourcesTitle', 'Tài nguyên'],
  // PLAN_GOP_MAU_TIN_MEDIA PR-H: thư viện nội dung (hai thẻ Email / Tin nhắn) + ô chọn mẫu dùng chung 3 kênh.
  ['mau-tin-nhan', 'channelTemplates.email', 'Email'],
  ['mau-tin-nhan', 'channelTemplates.messages', 'Tin nhắn'],
  ['mau-tin-nhan', 'templates.zaloLibraryTitle', 'Thư viện mẫu tin nhắn'],
  ['mau-tin-nhan', 'channelAttachments.templateLabel', 'Mẫu tin nhắn (dùng chung Zalo, Telegram, WhatsApp)'],
  ['mau-tin-nhan', 'emailTemplateEditor.uploadFile', 'Upload file'],
  ['mau-tin-nhan', 'emailTemplateEditor.files', 'Files'],
  ['campaign-create', 'channelAttachments.templateLabel', 'Mẫu tin nhắn (dùng chung Zalo, Telegram, WhatsApp)'],
  ['nhan-vien', 'employee.permissions.messageTemplates', 'Mẫu tin nhắn'],
  // Thư viện media (2 tab, tên nhóm tệp, nhãn nền tảng của tệp khách gửi).
  ['dung-luong-luu-tru', 'mediaLibrary.title', 'Thư viện media'],
  ['dung-luong-luu-tru', 'mediaLibrary.tabAll', 'Tất cả tệp (Dung lượng)'],
  ['dung-luong-luu-tru', 'mediaLibrary.tabChannels', 'Tệp khách gửi'],
  ['dung-luong-luu-tru', 'mediaLibrary.categorySummary', 'Dung lượng theo danh mục'],
  ['dung-luong-luu-tru', 'mediaLibrary.allCategories', 'Tất cả danh mục'],
  ['dung-luong-luu-tru', 'mediaLibrary.categoryZaloTemplate', 'Mẫu tin nhắn'],
  ['dung-luong-luu-tru', 'mediaLibrary.categoryEmailTemplate', 'Mẫu Email'],
  ['dung-luong-luu-tru', 'mediaLibrary.categoryChat', 'Tin nhắn chat'],
  ['dung-luong-luu-tru', 'mediaLibrary.categoryLandingAsset', 'Ảnh landing page'],
  ['dung-luong-luu-tru', 'mediaLibrary.categoryFormAsset', 'Tệp biểu mẫu'],
  ['dung-luong-luu-tru', 'mediaLibrary.categoryFormReceipt', 'Biên lai biểu mẫu'],
  ['dung-luong-luu-tru', 'mediaLibrary.platformZalo', 'Zalo'],
  ['dung-luong-luu-tru', 'mediaLibrary.platformZaloOa', 'Zalo OA'],
  ['dung-luong-luu-tru', 'mediaLibrary.platformTelegram', 'Telegram'],
  ['dung-luong-luu-tru', 'mediaLibrary.platformWhatsapp', 'WhatsApp'],
  ['dung-luong-luu-tru', 'mediaLibrary.platformLink', 'Link nền tảng · không tính dung lượng'],
  ['dung-luong-luu-tru', 'mediaLibrary.storedOnSystem', 'Lưu trên hệ thống · tính dung lượng'],
  ['dung-luong-luu-tru', 'mediaLibrary.goToManageScreen', 'Đi đến màn hình quản lý'],
  // Trình soạn biểu mẫu (PLAN_DON_GIAN_CAI_DAT_LANDING_VA_BIEU_MAU PR-2): bước chọn mẫu, khối thu gọn, hàng Thêm nhanh.
  ['bieu-mau', 'forms.createNew', 'Tạo biểu mẫu mới'],
  ['bieu-mau', 'forms.editorPage.templates.consult.name', 'Đăng ký tư vấn'],
  ['bieu-mau', 'forms.editorPage.templates.booking.name', 'Đặt lịch hẹn'],
  ['bieu-mau', 'forms.editorPage.templates.payment.name', 'Thu tiền / đặt cọc'],
  ['bieu-mau', 'forms.editorPage.templates.survey.name', 'Khảo sát'],
  ['bieu-mau', 'forms.editorPage.templates.blank.name', 'Trống'],
  ['bieu-mau', 'forms.editorPage.quickAdd.moreTypes', 'Loại khác…'],
  ['bieu-mau', 'forms.editorPage.afterSubmit.title', 'Sau khi gửi'],
  ['bieu-mau', 'forms.editorPage.theme.title', 'Giao diện'],
  ['bieu-mau', 'forms.share', 'Chia sẻ & QR'],
  ['dat-lich-giu-cho', 'forms.editorPage.addBlock.booking', 'Thêm đặt lịch hẹn'],
  ['dat-lich-giu-cho', 'forms.editorPage.addBlock.payment', 'Thu tiền khi gửi'],
  ['dat-lich-giu-cho', 'forms.editorPage.booking.title', 'Đặt lịch hẹn'],
  ['dat-lich-giu-cho', 'forms.editorPage.payment.title', 'Thanh toán'],
  ['dat-lich-giu-cho', 'forms.editorPage.payment.purposeLabel', 'Khách thấy khoản tiền này là'],
  ['dat-lich-giu-cho', 'forms.editorPage.payment.purposeOrder', 'Thanh toán đơn hàng'],
  ['dat-lich-giu-cho', 'forms.editorPage.payment.purposeDeposit', 'Đặt cọc'],
  ['dat-lich-giu-cho', 'forms.editorPage.booking.enableLabel', 'Bật đặt lịch hẹn'],
  ['dat-lich-giu-cho', 'forms.editorPage.payment.enableLabel', 'Bật thanh toán'],
  ['dat-lich-giu-cho', 'forms.sendConfirmation', 'Gửi email xác nhận cho người điền sau khi nộp'],
  ['dat-lich-giu-cho', 'forms.editorPage.afterSubmit.title', 'Sau khi gửi'],
  // PLAN_DON_GIAN_CAI_DAT_LANDING (03/10/2026): Cài đặt trang còn 3 mục (Xuất bản & đường dẫn / Form thu khách / Ảnh đã tải
  // lên). Tên miền riêng đã NỐI LẠI (PR-D: Kiểm tra DNS -> Kết nối tên miền, Gỡ tên miền riêng) và "Dùng biểu mẫu đã tạo"
  // lưu được thật (PR-F) — PLAN_TEN_MIEN_RIENG_VA_BIEU_MAU_LIEN_KET_LANDING_2026-10-03.md; bài tả đúng các nhãn đó.
  ['landing-page', 'landingCanvas.settingsModal.sections.publish.title', 'Xuất bản & đường dẫn'],
  ['landing-page', 'landingCanvas.settingsModal.sections.publish.linkCopy', 'Sao chép'],
  ['landing-page', 'landingCanvas.settingsModal.sections.publish.linkOpen', 'Mở trang'],
  ['landing-page', 'landingCanvas.settingsModal.sections.leadForm.title', 'Form thu khách'],
  ['landing-page', 'landingCanvas.settingsModal.sections.images.title', 'Ảnh đã tải lên'],
  ['landing-page', 'landingCanvas.settingsModal.sections.customDomain.useOwn', 'Dùng tên miền riêng của bạn'],
  ['landing-page', 'landingCanvas.settingsModal.sections.customDomain.check', 'Kiểm tra'],
  ['landing-page', 'landingCanvas.settingsModal.sections.customDomain.recheck', 'Kiểm tra lại'],
  ['landing-page', 'landingCanvas.settingsModal.sections.customDomain.connect', 'Kết nối tên miền'],
  ['landing-page', 'landingCanvas.settingsModal.sections.customDomain.remove', 'Gỡ tên miền riêng'],
  ['landing-page', 'landingCanvas.settingsModal.sections.customDomain.dnsType', 'Loại'],
  ['landing-page', 'landingCanvas.settingsModal.sections.customDomain.dnsHost', 'Tên (Host)'],
  ['landing-page', 'landingCanvas.settingsModal.sections.customDomain.dnsValue', 'Giá trị (Value)'],
  ['landing-page', 'landingCanvas.settingsModal.sections.freeLink.button', 'Dùng lại link miễn phí'],
  // PR-2 (03/10/2026): link miễn phí kẹt pending_verification hiện dòng trạng thái + nút "Thử lại" ngay dưới link.
  ['landing-page', 'landingCanvas.settingsModal.sections.freeLink.pendingBadge', 'Đang chờ cấp link'],
  ['landing-page', 'landingCanvas.settingsModal.sections.freeLink.retry', 'Thử lại'],
  ['landing-page', 'leadFormConfig.addField', 'Thêm câu hỏi'],
  ['landing-page', 'leadFormConfig.askAiAdd', 'Nhờ AI thêm ô này'],
  // PR-F: hai cách thu thông tin + chọn biểu mẫu có sẵn (LeadFormConfigPanel).
  ['landing-page', 'leadFormConfig.modeBasic', 'Form cơ bản'],
  ['landing-page', 'leadFormConfig.modeLinked', 'Dùng biểu mẫu đã tạo'],
  ['landing-page', 'leadFormConfig.pickerCreate', '+ Tạo biểu mẫu mới'],
  ['landing-page', 'leadFormConfig.pickerRefresh', 'Làm mới'],
  ['landing-page', 'forms.submissions', 'Bài nộp'],
  ['landing-page', 'campaignNodes.readFormSubmissions', 'Dữ liệu Biểu mẫu'],
  // Sửa bài theo màn thật (03/10/2026): nút tạo ở danh sách, khung chat sau khi trang có nội dung, thanh trên cùng
  // (Cài đặt / Lưu nằm sẵn trên thanh) và menu "Công cụ" (Template / Trình chỉnh sửa khối / Nhập HTML / Lưu làm template / Lịch sử).
  ['landing-page', 'landingPagesAdmin.createNew', 'Tạo mới'],
  ['landing-page', 'landingCanvas.chat.title', 'AI Assistant'],
  ['landing-page', 'landingCanvas.topbar.settings', 'Cài đặt'],
  ['landing-page', 'landingCanvas.topbar.save', 'Lưu'],
  ['landing-page', 'landingCanvas.topbar.templates', 'Template'],
  ['landing-page', 'landingCanvas.topbar.visualEditor', 'Trình chỉnh sửa khối'],
  ['landing-page', 'landingCanvas.importHtml.button', 'Nhập HTML'],
  ['landing-page', 'landingCanvas.topbar.saveAsTemplate', 'Lưu làm template'],
  ['landing-page', 'landingCanvas.topbar.history', 'Lịch sử'],
  // Xác thực hai lớp (03/10/2026): bài xac-thuc-hai-lop tả đúng chữ trên thẻ Bảo mật, cửa sổ bật 2FA và màn nhập mã.
  ['xac-thuc-hai-lop', 'sidebar.accountInfo', 'Thông tin tài khoản'],
  ['xac-thuc-hai-lop', 'accountProfileModal.tabSecurity', 'Bảo mật'],
  ['xac-thuc-hai-lop', 'twoFactor.enable', 'Bật xác thực hai lớp'],
  ['xac-thuc-hai-lop', 'twoFactor.confirm', 'Xác nhận'],
  ['xac-thuc-hai-lop', 'twoFactor.downloadTxt', 'Tải file .txt'],
  ['xac-thuc-hai-lop', 'twoFactor.savedCodesCheckbox', 'Tôi đã lưu mã khôi phục ở nơi an toàn'],
  ['xac-thuc-hai-lop', 'twoFactor.done', 'Xong'],
  ['xac-thuc-hai-lop', 'twoFactor.manualKey', 'Khoá nhập tay'],
  ['xac-thuc-hai-lop', 'twoFactor.loginTitle', 'Nhập mã xác thực'],
  ['xac-thuc-hai-lop', 'twoFactor.useRecovery', 'Dùng mã khôi phục'],
  ['xac-thuc-hai-lop', 'twoFactor.regenerateCodes', 'Tạo bộ mã khôi phục mới'],
  ['xac-thuc-hai-lop', 'twoFactor.disable', 'Tắt xác thực hai lớp'],
];

/**
 * Nhãn mà bài nhắc tới nhưng giao diện VIẾT CỨNG trong component (không có khoá trong vi.js nên không ghim được ở bảng trên).
 * Mỗi dòng: [bài, file trong `frontend/src`, chữ hiện trên màn]. Test đọc thẳng mã nguồn component: đổi chữ trên màn mà
 * không sửa bài thì đỏ.
 */
const HARDCODED_UI_LABELS_IN_ARTICLES = [
  ['landing-page', 'features/landing-canvas/components/CanvasChatPanel.jsx', 'Bạn muốn tạo Landing Page gì hôm nay?'],
  ['landing-page', 'features/landing-canvas/components/CanvasChatPanel.jsx', 'Dán mã HTML'],
  ['landing-page', 'features/landing-canvas/components/CanvasChatPanel.jsx', 'Thư viện mẫu'],
  ['landing-page', 'features/landing-canvas/components/ChatComposer.jsx', 'Tạo trang'],
  ['landing-page', 'features/landing-canvas/components/LandingCanvasTopbar.jsx', 'Công cụ'],
];

/** Bắt cả hai lối viết: `**Nhóm → Mục**` và `**Nhóm** → **Mục**`. */
function extractMenuPaths(markdown) {
  const paths = [];
  for (const m of markdown.matchAll(/\*\*([^*\n]+?)\s*→\s*([^*\n]+?)\*\*/g)) {
    paths.push([m[1].trim(), m[2].trim()]);
  }
  for (const m of markdown.matchAll(/\*\*([^*\n]+?)\*\*\s*→\s*\*\*([^*\n]+?)\*\*/g)) {
    paths.push([m[1].trim(), m[2].trim()]);
  }
  return paths;
}

describe('chất lượng bài trợ giúp seed', () => {
  it('có đủ 19 bài và bài nào cũng có body_md', () => {
    expect(HELP_SEED_ARTICLES.length).toBeGreaterThanOrEqual(19);
    for (const article of HELP_SEED_ARTICLES) {
      expect(typeof article.body_md).toBe('string');
      expect(article.body_md.length).toBeGreaterThan(0);
    }
  });

  it('body_html luôn đúng bằng bản sinh từ body_md', () => {
    const stale = HELP_SEED_ARTICLES
      .filter((a) => a.body_html && a.body_html !== miniMarkdownToHtml(a.body_md || ''))
      .map((a) => a.slug);

    expect(stale).toEqual([]);
    // Lệch thì chạy: node scripts/regenHelpSeedHtml.mjs
  });

  it('không dán URL trần trong nội dung — phải chỉ đường trên giao diện', () => {
    const offenders = [];
    for (const article of HELP_SEED_ARTICLES) {
      const hits = (article.body_md || '').match(/\/(app|pricing|checkout)(\/[a-z0-9/_-]*)?/gi) || [];
      if (hits.length > 0) offenders.push(`${article.slug}: ${[...new Set(hits)].join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('mọi đường đi menu đều trỏ tới mục có thật trên giao diện', () => {
    const offenders = [];
    for (const article of HELP_SEED_ARTICLES) {
      for (const [group, item] of extractMenuPaths(article.body_md || '')) {
        if (!REAL_MENU[group]) continue; // không phải câu chỉ đường menu
        if (!REAL_MENU[group].includes(item)) {
          offenders.push(`${article.slug}: nhóm "${group}" không có mục "${item}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('không gọi tên cũ của các mục đã đổi tên', () => {
    // Ba tên này KHÔNG tồn tại trên giao diện, nhưng bài từng dùng.
    const bannedMenuLabels = [
      // PLAN_SO_LIEU_DUNG_GON_KHOP PR-4b: mục menu đổi "Hiệu quả chiến dịch" → "Giám sát gửi tin" (menu = tiêu đề trang).
      'Hiệu quả chiến dịch',
      'Menu **Chatbot Studio**',
      'Menu **Hộp thư**',
      'Menu **Nhân viên**',
      '**Chiến dịch → Quản lý kênh**',
      '**Gói dịch vụ →',
      // PLAN_NUT_HANH_DONG_TRONG_SO_DO_CHIEN_DICH_2026-09-16.md, PR-3 Việc 5: nút "Kích hoạt
      // chiến dịch" đã bỏ (chiến dịch nháp tự kích hoạt khi bấm "Chạy ngay"); "Chạy chiến dịch"
      // không còn là trang riêng — đã gộp vào "Quản lý chiến dịch".
      'Kích hoạt chiến dịch',
      'trang Chạy chiến dịch',
      // Màn tạo/sửa landing cũ (ba cách tạo trang + cửa sổ AI ba tab) đã bị thay bằng trình soạn
      // landing-canvas từ 07–14/09/2026; ba nhãn này không còn trong frontend/src/i18n/vi.js.
      // Bài `landing-page` vẫn chỉ đường theo chúng tới 21/09.
      'Sửa trang hiện tại',
      'Tạo mới theo mô tả',
      'Trình sửa trực quan',
      // Studio chatbot cũ có ba tab Cấu hình / Kiến thức / Triển khai; nay Cấu hình là nút mở hộp
      // (Kiến thức là một phần trong hộp đó), Triển khai là cột bên phải. Bài `chatbot` vẫn tả ba
      // tab tới 29/09/2026.
      'Ba tab cần đi qua',
      'tab Cấu hình',
      'tab Kiến thức',
      // PLAN_SO_LIEU_DUNG_GON_KHOP PR-4b / PR-5 (30/09/2026): trang Giám sát gửi tin và trang Báo cáo viết lại.
      // Các nhãn dưới đây KHÔNG còn trên màn (0 lần trong frontend/src/i18n/vi.js) nhưng bài `campaign-theo-doi`
      // từng tả theo chúng — người đọc đi tìm thứ không tồn tại. `Tổng gửi` còn ở một trang admin khác nhưng
      // bài hướng dẫn cho khách không được nhắc tới.
      'Tin lỗi',
      'Hiệu quả theo kênh',
      'Tổng gửi',
      'Tổng chiến dịch',
      'Tỷ lệ click',
      'Tỷ lệ thành công trên lượt thử',
      'Lượt nhấp liên kết',
      'Chiến dịch gần đây',
      'Tất cả chiến dịch đã chạy',
      'Lỗi gần đây',
      'Tốc độ gửi theo giờ',
      'Tình trạng tài khoản & hàng đợi',
      'Thành công / tổng',
      // PR-3: hai đồng hồ theo tháng dương lịch của trang Thanh toán (nay đếm theo kỳ của gói).
      'Email tháng này',
      'Zalo tháng này',
      // PLAN_GOP_MAU_TIN_MEDIA (03/10/2026) PR-H: kho mẫu của Zalo / Telegram / WhatsApp đã gộp thành MỘT tab
      // "Tin nhắn" (thư viện nội dung), và Thư viện media bỏ tab "Tệp tin nhắn", đổi "Zalo / Facebook" thành
      // "Tệp khách gửi". Bài từng gọi kho là "mẫu Zalo", "Template Zalo" và tả tab theo tên cũ.
      'Zalo / Facebook',
      'Tệp tin nhắn',
      'Template Zalo',
      'template Zalo',
      'Mẫu Zalo',
      'mẫu Zalo',
      'mẫu Email và mẫu Zalo tách riêng',
      '(dùng chung với Zalo)',
      // PLAN_DON_GIAN_CAI_DAT_LANDING (03/10/2026): Cài đặt trang gộp "Thông tin trang" + "Tên miền & URL" thành "Xuất bản
      // & đường dẫn", mục "Form đăng ký" đổi thành "Form thu khách", "Ảnh của trang" thành "Ảnh đã tải lên" (còn 3 mục, không
      // còn "Bốn mục").
      'Tên miền & URL',
      '**Form đăng ký**',
      'Ảnh của trang',
      'Bốn mục',
      // 03/10/2026: tên miền riêng (PR-D) và "Dùng biểu mẫu đã tạo" / "Form cơ bản" (PR-F) đã chạy thật nên KHÔNG còn bị
      // cấm — được pin ở bảng nhãn giao diện phía trên. Chỉ còn cấm nhãn CŨ "Lưu tên miền" (nút từng làm backend xoá
      // subdomain miễn phí mà không gắn gì; không còn trong giao diện mới).
      'Lưu tên miền',
    ];
    const offenders = [];
    for (const article of HELP_SEED_ARTICLES) {
      for (const banned of bannedMenuLabels) {
        if ((article.body_md || '').includes(banned)) {
          offenders.push(`${article.slug}: còn dùng "${banned}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('mọi nhãn giao diện bài nhắc tới đều có thật trong vi.js (đúng từng chữ)', () => {
    const offenders = [];
    for (const [slug, key, label] of UI_LABELS_IN_ARTICLES) {
      const actual = key.split('.').reduce((node, part) => (node == null ? node : node[part]), viDictionary);
      if (typeof actual !== 'string' || actual.replace(/\.$|:\s*\{count\}$/, '') !== label) {
        offenders.push(`${slug}: khoá ${key} = ${JSON.stringify(actual)}, bài ghi "${label}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('mỗi nhãn trong bảng nhãn giao diện đều được bài tương ứng nhắc tới', () => {
    const bySlug = new Map(HELP_SEED_ARTICLES.map((a) => [a.slug, a.body_md || '']));
    // Chỉ tính nhãn đứng đầu chữ in đậm / nghiêng hoặc đầu ô bảng: nhắc trong chú thích ảnh [ẢNH: …] không đủ để
    // chứng minh bài còn tả đúng màn (đột biến đổi nhãn trong bảng mà chú thích ảnh còn nguyên phải đỏ).
    const mentioned = (body, label) => body.includes(`*${label}`) || body.includes(`| ${label} |`);
    const missing = UI_LABELS_IN_ARTICLES
      .filter(([slug, , label]) => !mentioned(bySlug.get(slug) || '', label))
      .map(([slug, key, label]) => `${slug}: không còn nhắc "${label}" (${key})`);
    expect(missing).toEqual([]);
  });

  it('nhãn viết cứng trong component mà bài nhắc tới còn đúng chữ trong mã nguồn và còn được bài nhắc', () => {
    const bySlug = new Map(HELP_SEED_ARTICLES.map((a) => [a.slug, a.body_md || '']));
    const mentioned = (body, label) => body.includes(`*${label}`) || body.includes(`| ${label} |`);
    const offenders = [];
    for (const [slug, file, label] of HARDCODED_UI_LABELS_IN_ARTICLES) {
      const source = readFileSync(new URL(`../../../../../frontend/src/${file}`, import.meta.url), 'utf8');
      if (!source.includes(label)) offenders.push(`${slug}: ${file} không còn chữ "${label}"`);
      if (!mentioned(bySlug.get(slug) || '', label)) offenders.push(`${slug}: bài không còn nhắc "${label}"`);
    }
    expect(offenders).toEqual([]);
  });

  it('bài mau-tin-nhan trích đúng từng chữ dòng nhắc giới hạn tệp Telegram/WhatsApp của trình soạn mẫu', () => {
    // Dòng nhắc có chỗ trống {images}/{documents}/{mb} nên không đưa vào bảng nhãn ở trên được: điền số THẬT lấy từ
    // hằng số của frontend (CHANNEL_ATTACHMENT_LIMITS) rồi so với câu bài trích.
    const warning = viDictionary.templates.channelLimitWarning
      .replace('{images}', String(CHANNEL_ATTACHMENT_LIMITS.maxImages))
      .replace('{documents}', String(CHANNEL_ATTACHMENT_LIMITS.maxDocuments))
      .replace('{mb}', String(Math.round(CHANNEL_ATTACHMENT_LIMITS.maxTotalBytes / (1024 * 1024))));
    const body = HELP_SEED_ARTICLES.find((a) => a.slug === 'mau-tin-nhan')?.body_md || '';

    expect(warning).toContain('5 ảnh, 3 tài liệu, tổng 20 MB');
    expect(body).toContain(`*${warning}*`);
  });

  it('bài nào cũng chừa ít nhất 3 chỗ chèn ảnh', () => {
    const thin = HELP_SEED_ARTICLES
      .map((a) => [a.slug, ((a.body_md || '').match(/\[ẢNH:/g) || []).length])
      .filter(([, count]) => count < 3);

    expect(thin).toEqual([]);
  });
});
