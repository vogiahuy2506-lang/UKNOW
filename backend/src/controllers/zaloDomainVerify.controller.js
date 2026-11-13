import domainVerificationRepository from '../repositories/domainVerification.repository.js';

class ZaloDomainVerifyController {
  /**
   * Lưu mã xác thực tên miền Zalo
   * POST /api/zalo-oa/domain-verify
   */
  async saveVerificationCode(req, res) {
    try {
      const rawInput = String(req.body?.verification_code || req.body?.code || '').trim();
      if (!rawInput) {
        return res.status(400).json({ success: false, message: 'Vui lòng cung cấp mã xác thực tên miền' });
      }

      // Hỗ trợ người dùng dán nguyên chuỗi 'zalo-platform-site-verification=xyz' hoặc chỉ 'xyz'
      let cleanCode = rawInput;
      if (cleanCode.includes('zalo-platform-site-verification=')) {
        cleanCode = cleanCode.split('zalo-platform-site-verification=')[1].split('"')[0].split("'")[0].trim();
      }

      // Lấy domain hiện tại từ header hoặc env
      const domain = req.body?.domain || req.get?.('host') || 'system';
      const fileName = `zalo-platform-site-verification-${cleanCode}.html`;

      const saved = await domainVerificationRepository.upsertVerification({
        platform: 'zalo',
        domain,
        verificationCode: cleanCode,
        fileName,
      });

      return res.json({
        success: true,
        message: 'Đã lưu mã xác thực tên miền Zalo thành công',
        data: {
          verification_code: cleanCode,
          file_name: fileName,
          domain: saved.domain,
          full_tag: `zalo-platform-site-verification=${cleanCode}`,
        },
      });
    } catch (err) {
      console.error('[ZaloDomainVerify] Save error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Lấy mã xác thực tên miền hiện tại
   * GET /api/zalo-oa/domain-verify
   */
  async getVerificationCode(req, res) {
    try {
      const domain = req.query?.domain || req.get?.('host') || 'system';
      let record = await domainVerificationRepository.getVerification('zalo', domain);
      if (!record) {
        record = await domainVerificationRepository.getLatestVerification('zalo');
      }

      return res.json({
        success: true,
        data: record
          ? {
              verification_code: record.verification_code,
              file_name: record.file_name,
              domain: record.domain,
              full_tag: `zalo-platform-site-verification=${record.verification_code}`,
              updated_at: record.updated_at,
            }
          : null,
      });
    } catch (err) {
      console.error('[ZaloDomainVerify] Get error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Phục vụ request từ Zalo Crawler khi bấm "Xác thực" trên Zalo Developers
   * GET /zalo-platform-site-verification:code.html hoặc GET /:fileName
   */
  async serveVerificationFile(req, res) {
    try {
      const requestedPath = req.path || '';
      const domain = req.get?.('host') || 'system';
      let record = await domainVerificationRepository.getVerification('zalo', domain);
      if (!record) {
        record = await domainVerificationRepository.getLatestVerification('zalo');
      }

      if (!record) {
        return res.status(404).send('Zalo verification code not configured');
      }

      // Trả về HTML chứa cả mã chuỗi lẫn thẻ meta để Zalo crawler chấp nhận mọi phương thức
      const code = record.verification_code;
      const html = `<!DOCTYPE html>
<html>
<head>
    <meta name="zalo-platform-site-verification" content="${code}" />
    <title>Zalo Site Verification</title>
</head>
<body>
zalo-platform-site-verification=${code}
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    } catch (err) {
      console.error('[ZaloDomainVerify] Serve error:', err);
      return res.status(500).send('Verification error');
    }
  }
}

export default new ZaloDomainVerifyController();

