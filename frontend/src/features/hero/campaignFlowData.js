import {
  HiOutlinePlay, HiOutlineTable, HiOutlineMail, HiOutlineChatAlt2, HiOutlineUserGroup,
  HiOutlineUserAdd, HiOutlineCheckCircle, HiOutlineGlobe, HiOutlineUsers,
} from 'react-icons/hi';

/**
 * Dữ liệu màn "Xem chiến dịch chạy thế nào" của trang chủ (CampaignFlowModal + CampaignFlowLauncher).
 *
 * LUẬT: mỗi thẻ chỉ được là node CÓ THẬT ở trình tạo chiến dịch. `subtypes` ghi các `nodeSubtype` mà thẻ đại diện
 * (thẻ nguồn dữ liệu đại diện cho "một trong các node đọc danh sách"); spec `campaignFlowData.spec.js` đối chiếu với
 * palette thật (CampaignBuilderFlowNodes.jsx) và cấm các node chạy không có logic (condition / tag_contact /
 * update_attribute — campaignRun.service.js chỉ log "Node chưa có logic chạy riêng, bỏ qua").
 *
 * Bản cũ ghi những bước KHÔNG có thật: "Lấy từ CRM", "Lọc theo điều kiện", "Chờ 24 giờ", "Kiểm tra đã mở? rẽ nhánh",
 * "Email thứ 2 cho khách chưa mở" (không có node chờ / rẽ nhánh theo hành vi mở; độ trễ nằm trong cấu hình node gửi,
 * email thứ hai gửi cho mọi người nhận chưa huỷ đăng ký / chưa bounce), "Zalo OA" (chiến dịch gửi qua Zalo cá nhân,
 * Zalo OA chỉ có ở chatbot), "30-60s giữa mỗi tin" / "Delay 5-10 phút" (số cứng sai), "Lưu lịch sử chat vào CRM",
 * "Tổng kết reactions và comments".
 *
 * Số liệu `stats` CHỈ gồm chỉ số sản phẩm đo và hiện cho khách (trang Báo cáo — Dashboard.jsx / DashboardKpiCards.jsx /
 * DashboardCampaignsTable.jsx; đếm ở backend/src/services/stats/sendStats.service.js): đã gửi, chưa gửi được, email đã mở,
 * email đã bấm link, lượt nhấp link Zalo. Không có "đã đọc", "phản hồi", "reactions", "tỉ lệ chuyển đổi" — đã bỏ.
 * Giá trị là SỐ MẪU: giao diện luôn gắn nhãn "Số liệu minh hoạ" cạnh khối này.
 */

const TRIGGER_NODE = {
  id: 'trigger',
  type: 'trigger',
  subtypes: ['manual_trigger'],
  label: 'Kích hoạt thủ công',
  icon: HiOutlinePlay,
  desc: 'Bắt đầu chiến dịch khi bạn bấm nút Chạy',
  color: 'indigo',
};

const END_NODE = {
  id: 'end',
  type: 'end',
  subtypes: ['end'],
  label: 'Kết thúc',
  icon: HiOutlineCheckCircle,
  desc: 'Điểm cuối quy trình',
  color: 'green',
};

export const FLOWS = {
  email: {
    type: 'email',
    title: 'Chiến dịch Email Marketing',
    subtitle: 'Gửi email hàng loạt theo mẫu, theo dõi lượt mở và lượt bấm link',
    color: 'blue',
    bgClass: 'bg-blue-50',
    borderClass: 'border-blue-200',
    textClass: 'text-blue-700',
    barClass: 'bg-blue-500',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    nodes: [
      TRIGGER_NODE,
      {
        id: 'data',
        type: 'data',
        subtypes: ['read_sheet', 'read_landing_leads', 'read_form_submissions', 'read_interested_customers'],
        label: 'Đọc danh sách khách',
        icon: HiOutlineTable,
        desc: 'Từ Google Sheet, lead landing page, biểu mẫu hoặc khách có sẵn trong hệ thống',
        color: 'amber',
      },
      {
        id: 'action',
        type: 'action',
        subtypes: ['send_email'],
        label: 'Gửi Email',
        icon: HiOutlineMail,
        desc: 'Chọn mẫu email, chèn tên khách; gửi được nhiều email nối tiếp, đặt thời gian chờ giữa các email',
        color: 'orange',
      },
      {
        id: 'save',
        type: 'data',
        subtypes: ['save_customer'],
        label: 'Lưu khách (tuỳ chọn)',
        icon: HiOutlineUserAdd,
        desc: 'Lưu thông tin người nhận vào danh sách khách hàng',
        color: 'blue',
      },
      END_NODE,
    ],
    stats: [
      { label: 'Đã gửi', value: '1.250' },
      { label: 'Chưa gửi được', value: '12' },
      { label: 'Email đã mở', value: '36%', rate: 'trên thư đã gửi' },
      { label: 'Đã bấm link', value: '7%', rate: 'trên thư đã gửi' },
    ],
  },
  zalo: {
    type: 'zalo',
    title: 'Chiến dịch Zalo cá nhân',
    subtitle: 'Gửi tin nhắn Zalo cá nhân đến từng khách hàng',
    color: 'emerald',
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200',
    textClass: 'text-emerald-700',
    barClass: 'bg-emerald-500',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    nodes: [
      TRIGGER_NODE,
      {
        id: 'account',
        type: 'data',
        subtypes: ['select_zalo_account'],
        label: 'Chọn tài khoản Zalo',
        icon: HiOutlineUserAdd,
        desc: 'Chọn tài khoản Zalo cá nhân đã kết nối để gửi tin',
        color: 'blue',
      },
      {
        id: 'friends',
        type: 'data',
        subtypes: ['get_all_friends'],
        label: 'Lấy danh sách bạn bè Zalo',
        icon: HiOutlineUsers,
        desc: 'Lấy bạn bè của tài khoản đã chọn; chọn một số hoặc loại bớt người không gửi',
        color: 'amber',
      },
      {
        id: 'action',
        type: 'action',
        subtypes: ['send_zalo_personal'],
        label: 'Gửi tin nhắn Zalo cá nhân',
        icon: HiOutlineChatAlt2,
        desc: 'Gửi theo mẫu tin, chèn tên khách, tới bạn bè hoặc số điện thoại; hệ thống tự giãn cách giữa các tin',
        color: 'blue',
      },
      END_NODE,
    ],
    stats: [
      { label: 'Đã gửi', value: '451' },
      { label: 'Chưa gửi được', value: '29' },
      { label: 'Lượt nhấp link', value: '38' },
    ],
  },
  zalo_group: {
    type: 'zalo_group',
    title: 'Chiến dịch Zalo nhóm',
    subtitle: 'Gửi tin nhắn vào các nhóm Zalo đã tham gia',
    color: 'violet',
    bgClass: 'bg-violet-50',
    borderClass: 'border-violet-200',
    textClass: 'text-violet-700',
    barClass: 'bg-violet-500',
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
    nodes: [
      TRIGGER_NODE,
      {
        id: 'account',
        type: 'data',
        subtypes: ['select_zalo_account'],
        label: 'Chọn tài khoản Zalo',
        icon: HiOutlineUserAdd,
        desc: 'Chọn tài khoản Zalo đã tham gia các nhóm cần gửi',
        color: 'blue',
      },
      {
        id: 'groups',
        type: 'data',
        subtypes: ['get_all_groups'],
        label: 'Lấy thông tin nhóm Zalo',
        icon: HiOutlineUserGroup,
        desc: 'Lấy danh sách nhóm của tài khoản; chọn những nhóm muốn gửi',
        color: 'amber',
      },
      {
        id: 'action',
        type: 'action',
        subtypes: ['send_zalo_group'],
        label: 'Gửi tin nhắn nhóm Zalo',
        icon: HiOutlineGlobe,
        desc: 'Gửi theo mẫu tin, có thể kèm tệp đính kèm; hệ thống tự giãn cách giữa các lần gửi',
        color: 'violet',
      },
      END_NODE,
    ],
    stats: [
      { label: 'Đã gửi', value: '24' },
      { label: 'Chưa gửi được', value: '1' },
    ],
  },
};

export const FLOW_KEYS = Object.keys(FLOWS);

/** Số node của một luồng — launcher hiện số này thay cho số cứng cũ ("8 node", "7 node"). */
export const getFlowNodeCount = (flowKey) => FLOWS[flowKey]?.nodes.length ?? 0;
