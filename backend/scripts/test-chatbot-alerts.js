import { scanAndNotify } from '../src/services/chatbot/chatbotContactAlert.service.js';
import chatbotDigestService from '../src/services/chatbot/chatbotDigest.service.js';


async function runTest() {
  try {
    console.log('--- 1. Đang quét và gửi thông báo liên hệ mới (Alerts) ---');
    await scanAndNotify();
    console.log('✅ Quét liên hệ xong!');
    
    console.log('\n--- 2. Đang gửi báo cáo tổng hợp tuần (Weekly Digests) ---');
    await chatbotDigestService.sendDigests({ frequency: 'weekly' });
    console.log('✅ Gửi báo cáo tuần xong!');

    console.log('\n--- 3. Đang gửi báo cáo tổng hợp tháng (Monthly Digests) ---');
    await chatbotDigestService.sendDigests({ frequency: 'monthly' });
    console.log('✅ Gửi báo cáo tháng xong!');

  } catch (error) {
    console.error('❌ Có lỗi xảy ra trong quá trình test:', error);
  } finally {
    process.exit(0);
  }
}

runTest();
