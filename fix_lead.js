const fs = require('fs');
const path = 'd:\\workInProcess\\UKNOW\\backend\\src\\services\\lead\\lead.service.js';
let content = fs.readFileSync(path, 'utf8');
const old = `    if (phone && phone.replace(/\\D/g, '').length < 7) {
      const err = new Error('Số điện thoại không hợp lệ');
      err.statusCode = 400;
      throw err;
    }
    // N?u marketingConsent kh?ng ???c g?i ho?c undefined/null \u2192 coi nh? ??ng ? (opt-in m?m)
    const effectiveConsent = marketingConsent !== false;`;
const neu = `    if (phone && phone.replace(/\\D/g, '').length < 7) {
      const err = new Error('Số điện thoại không hợp lệ');
      err.statusCode = 400;
      throw err;
    }
    // marketingConsent gửi tường minh false => từ chối (opt-out cứng)
    if (body && (body.marketingConsent === false || body.marketing_consent === false)) {
      const err = new Error('Vui lòng đồng ý nhận thông tin marketing để gửi yêu cầu');
      err.statusCode = 400;
      err.code = 'MARKETING_CONSENT_REQUIRED';
      throw err;
    }
    const effectiveConsent = !(body && (body.marketingConsent === false || body.marketing_consent === false));`;
if (content.includes(old)) {
  content = content.replace(old, neu);
  fs.writeFileSync(path, content);
  console.log('OK');
} else {
  console.log('NOT FOUND - try fuzzy');
  // Use fuzzy
  const fuzzyOld = `    const effectiveConsent = marketingConsent !== false;`;
  const fuzzyNew = `    if (body && (body.marketingConsent === false || body.marketing_consent === false)) {
      const err = new Error('Vui lòng đồng ý nhận thông tin marketing để gửi yêu cầu');
      err.statusCode = 400;
      err.code = 'MARKETING_CONSENT_REQUIRED';
      throw err;
    }
    const effectiveConsent = !(body && (body.marketingConsent === false || body.marketing_consent === false));`;
  if (content.includes(fuzzyOld)) {
    content = content.replace(fuzzyOld, fuzzyNew);
    fs.writeFileSync(path, content);
    console.log('FUZZY OK');
  }
}
