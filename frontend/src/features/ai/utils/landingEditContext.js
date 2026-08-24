export const IS_NEW_LANDING_REQ_RE =
  /^\s*(?:tạo|làm|sinh|viết|thiết kế|build|generate|create|make)\s+(?:(?:cho\s+(?:tôi|mình|em)|giúp\s+(?:tôi|mình|em)|hộ\s+(?:tôi|mình|em))\s+)?(?:(?:1|một|cái)\s+)?(?:landing\s*page|trang\s*landing|trang\s*đích|trang\s*web|trang)\s+(?:(?:mới|khác)\s+)?(?:mới|khác|về|cho|bán|giới\s*thiệu|quảng\s*cáo|dành\s*cho|phục\s*vụ|$|\b)|^\s*(?:create|generate|build|make)\s+(?:(?:me|us)\s+)?(?:(?:a|an|another|the)\s+)?(?:new\s+)?(?:landing\s*page|landing|page)\s*(?:about|for|to|$|\b)/i;

export const getLastLandingPageMessage = (msgList = []) => {
  const list = Array.isArray(msgList) ? msgList : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i]?.type === 'landing_page' && list[i]?.data?.html) {
      return { index: i, message: list[i] };
    }
  }
  return null;
};

export const getLastLandingPageMessageIndex = (msgList = []) => {
  const res = getLastLandingPageMessage(msgList);
  return res ? res.index : -1;
};

export const isRecentLandingPageContext = (msgList = []) => {
  const list = Array.isArray(msgList) ? msgList : [];
  const lastLanding = getLastLandingPageMessage(list);
  if (!lastLanding) return null;

  // Sau thẻ landing page, chỉ chấp nhận các tin nhắn xác nhận sửa trang ('landing_edit_ack')
  // hoặc tin nhắn từ phía user. Nếu có BẤT KỲ tin nhắn trợ lý nào khác (text thông thường, wizard card,
  // template draft, error, v.v.), nghĩa là cuộc hội thoại đã chuyển sang chủ đề khác -> thoát ngữ cảnh sửa.
  for (let i = lastLanding.index + 1; i < list.length; i += 1) {
    const msg = list[i];
    if (msg?.role === 'assistant') {
      if (msg?.type !== 'landing_edit_ack') {
        return null;
      }
    }
  }

  return lastLanding;
};
