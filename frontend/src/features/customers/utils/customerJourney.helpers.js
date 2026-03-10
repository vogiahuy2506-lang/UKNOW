import { decodeHtmlEntities } from './customerDisplay.helpers';

export const sanitizeEmailHtmlForPreview = (html) => {
  const raw = String(html || '').trim();
  if (!raw) return '';
  if (typeof document === 'undefined') return raw;

  const container = document.createElement('div');
  container.innerHTML = raw;

  container.querySelectorAll('img').forEach((img) => img.remove());

  container.querySelectorAll('a').forEach((link) => {
    link.setAttribute('href', '#');
    link.setAttribute('onclick', 'return false;');
    link.style.pointerEvents = 'none';
    link.style.textDecoration = 'underline';
  });

  return container.innerHTML;
};

export const normalizeStatusLabel = (label) => {
  const raw = String(label || '').trim();
  if (!raw) return '--';

  const lowered = raw.toLowerCase();
  if (lowered.includes('link')) return 'Đã nhấn link khóa học';
  if (lowered.includes('email')) return 'Đã nhận email';
  if (lowered.includes('quan') || lowered.includes('on-hold') || lowered.includes('onhold')) {
    return 'Để lại thông tin';
  }
  if (lowered.includes('mua')) return 'Đã mua';

  return raw;
};

export const formatEventType = (eventType) => {
  const type = String(eventType || '').toLowerCase();
  if (type === 'email_sent') return 'Email đã gửi';
  if (type === 'email_opened') return 'Email đã mở';
  if (type === 'email_clicked') return 'Email đã nhấp';
  if (type === 'attachment_downloaded') return 'Tải tệp đính kèm';
  if (type === 'course_interest') return 'Để lại thông tin';
  if (type === 'course_purchase') return 'Mua hàng thành công';
  if (type === 'order_pending') return 'Đơn hàng chờ xử lý';
  if (type === 'order_completed') return 'Đơn hàng hoàn thành';
  if (type === 'zalo_sent') return 'Tin nhắn Zalo đã gửi';
  if (type === 'zalo_clicked') return 'Đã nhấp link trong Zalo';
  return eventType || 'Sự kiện';
};

export const normalizeJourneyDescription = (event) => {
  const type = String(event?.eventType || '').toLowerCase();
  const raw = decodeHtmlEntities(event?.description || '');
  const lowered = raw.toLowerCase();

  if (type === 'email_sent') return 'Đã gửi email';
  if (type === 'email_opened') return 'Khách hàng đã mở email';
  if (type === 'email_clicked') return 'Khách hàng đã nhấp vào link trong email';
  if (type === 'attachment_downloaded') return 'Khách hàng đã tải tệp đính kèm';
  if (type === 'course_interest') return 'Khách hàng để lại thông tin (đơn hàng on-hold)';
  if (type === 'course_purchase') return 'Khách hàng mua hàng thành công';
  if (type === 'order_pending') return 'Đơn hàng chờ xử lý - Khách hàng đã đặt hàng nhưng chưa thanh toán';
  if (type === 'order_completed') return 'Đơn hàng hoàn thành - Khách hàng đã mua hàng thành công';
  if (type === 'zalo_sent') return 'Đã gửi tin nhắn Zalo';
  if (type === 'zalo_clicked') return 'Khách hàng đã nhấp link trong tin nhắn Zalo';

  if (lowered.includes('khach hang da mo email')) return 'Khách hàng đã mở email';
  if (lowered.includes('khach hang da click') || lowered.includes('khach hang da nhan link')) {
    return 'Khách hàng đã nhấp vào link trong email';
  }
  if (lowered.includes('khach hang dang quan tam') || lowered.includes('don hang on-hold')) {
    return 'Khách hàng để lại thông tin (đơn hàng on-hold)';
  }
  if (lowered.includes('da gui email')) return 'Đã gửi email';

  return raw || event?.eventType || 'Sự kiện';
};
