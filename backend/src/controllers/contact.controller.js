import * as contactService from '../services/contact.service.js';

export async function submitContact(req, res) {
  try {
    const { name, email, phone, company, companySize, message } = req.body;
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;

    const submission = await contactService.submitContactForm({
      name, email, phone, company, companySize, message, ipAddress,
    });

    return res.status(201).json({
      success: true,
      message: 'Đã ghi nhận yêu cầu của bạn. Chúng tôi sẽ liên hệ trong vòng 24 giờ.',
      data: submission,
    });
  } catch (err) {
    if (err?.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    console.error('Contact submit error:', err);
    return res.status(500).json({ success: false, message: 'Lỗi server, vui lòng thử lại' });
  }
}
