import {
  HiOutlineChatAlt2,
  HiOutlineClipboardList,
  HiOutlineDatabase,
  HiOutlineGlobeAlt,
  HiOutlinePencilAlt,
  HiOutlineTable,
  HiOutlineUserGroup,
  HiOutlineUsers,
} from 'react-icons/hi';

/** Biểu tượng + tông màu của từng nguồn người nhận — dùng chung bước "Gửi cho ai" của trình từng bước và thẻ "Gửi cho ai?" ở tab Thiết lập. */
export const AUDIENCE_CARDS = Object.freeze({
  customers: { icon: HiOutlineDatabase, tone: 'blue' },
  landing: { icon: HiOutlineGlobeAlt, tone: 'rose' },
  form: { icon: HiOutlineClipboardList, tone: 'emerald' },
  sheet: { icon: HiOutlineTable, tone: 'emerald' },
  manual: { icon: HiOutlinePencilAlt, tone: 'slate' },
  zalo_friends: { icon: HiOutlineUsers, tone: 'sky' },
  zalo_groups: { icon: HiOutlineUserGroup, tone: 'violet' },
  telegram_groups: { icon: HiOutlineUserGroup, tone: 'violet' },
  whatsapp_groups: { icon: HiOutlineUserGroup, tone: 'violet' },
  conversations: { icon: HiOutlineChatAlt2, tone: 'sky' },
});
