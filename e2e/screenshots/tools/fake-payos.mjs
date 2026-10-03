/**
 * Máy chủ PayOS GIẢ — để chụp ảnh "màn hình thanh toán đang hiện mã QR" mà không tạo đơn thật.
 *
 * SDK `@payos/node` đọc `PAYOS_BASE_URL`. Chạy máy chủ này, rồi chạy backend e2e với:
 *
 *   PAYOS_BASE_URL=http://127.0.0.1:5099 PAYOS_CLIENT_ID=fake PAYOS_API_KEY=fake PAYOS_CHECKSUM_KEY=fake
 *
 * (đặt trên dòng lệnh, KHÔNG ghi vào e2e/.env.test; KHÔNG bao giờ dùng khoá PayOS thật ở đây.)
 *
 *   node e2e/screenshots/tools/fake-payos.mjs            # cổng 5099, đổi bằng FAKE_PAYOS_PORT
 *
 * Trả đúng khuôn `{ code: '00', desc, data }` của `/v2/payment-requests` (tạo, lấy, huỷ). Phản hồi KHÔNG kèm
 * `signature` nên SDK bỏ qua bước kiểm chữ ký phản hồi (chỉ kiểm khi có).
 *
 * MÃ QR TRONG ẢNH LÀ GIẢ VÀ KHÔNG THANH TOÁN ĐƯỢC: số tài khoản toàn số 0, tên "MAU MINH HOA", và mã kiểm tra
 * CRC cố ý sai ("0000") — ứng dụng ngân hàng từ chối quét. Nên ảnh đưa vào bài hướng dẫn không dẫn khách tới
 * tài khoản của ai.
 */
import http from 'node:http';

const PORT = Number(process.env.FAKE_PAYOS_PORT || 5099);

/** Gói một TLV EMVCo: tag + độ dài 2 chữ số + giá trị. */
const tlv = (tag, value) => `${tag}${String(String(value).length).padStart(2, '0')}${value}`;

/** Chuỗi VietQR giả, cùng khuôn PayOS trả (xem frontend/src/utils/vietqrParser.js) nhưng CRC sai có chủ ý. */
function buildFakeQr({ amount, description }) {
  const beneficiary = tlv('01', tlv('00', '970422') + tlv('01', '0000000000'));
  const template = tlv('38', tlv('00', 'A000000727') + beneficiary + tlv('02', 'QRIBFTTA'));
  return [
    tlv('00', '01'),
    tlv('01', '12'),
    template,
    tlv('53', '704'),
    tlv('54', String(Math.round(Number(amount) || 0))),
    tlv('58', 'VN'),
    tlv('59', 'MAU MINH HOA'),
    tlv('62', tlv('08', String(description || '').slice(0, 25))),
  ].join('') + '63040000';
}

const readBody = async (req) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const send = (status, payload) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
  };

  // POST /v2/payment-requests — tạo link thanh toán.
  if (req.method === 'POST' && url.pathname === '/v2/payment-requests') {
    const body = await readBody(req);
    console.log(`[fake-payos] tạo link orderCode=${body.orderCode} amount=${body.amount}`);
    return send(200, {
      code: '00',
      desc: 'success',
      data: {
        bin: '970422',
        accountNumber: '0000000000',
        accountName: 'MAU MINH HOA',
        amount: body.amount,
        description: body.description,
        orderCode: body.orderCode,
        currency: 'VND',
        paymentLinkId: `fake-${body.orderCode}`,
        status: 'PENDING',
        expiredAt: body.expiredAt,
        checkoutUrl: `http://127.0.0.1:${PORT}/fake-checkout/${body.orderCode}`,
        qrCode: buildFakeQr(body),
      },
    });
  }

  // POST /v2/payment-requests/:id/cancel — backend huỷ link cũ (best effort).
  const cancel = url.pathname.match(/^\/v2\/payment-requests\/([^/]+)\/cancel$/);
  if (req.method === 'POST' && cancel) {
    return send(200, {
      code: '00',
      desc: 'success',
      data: { id: cancel[1], orderCode: Number(cancel[1]) || 0, status: 'CANCELLED', amount: 0, amountPaid: 0, amountRemaining: 0, transactions: [] },
    });
  }

  // GET /v2/payment-requests/:id — đối soát: luôn "chưa trả tiền".
  const get = url.pathname.match(/^\/v2\/payment-requests\/([^/]+)$/);
  if (req.method === 'GET' && get) {
    return send(200, {
      code: '00',
      desc: 'success',
      data: { id: get[1], orderCode: Number(get[1]) || 0, status: 'PENDING', amount: 0, amountPaid: 0, amountRemaining: 0, transactions: [] },
    });
  }

  return send(404, { code: '01', desc: 'fake-payos: không có đường dẫn này', data: null });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[fake-payos] đang nghe 127.0.0.1:${PORT} — mã QR giả, KHÔNG thanh toán được`);
});
