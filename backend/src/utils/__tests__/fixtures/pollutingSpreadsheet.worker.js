// Worker giả cho legacySpreadsheetParser.util.spec.js: làm bẩn Object.prototype (điều prototype
// pollution của SheetJS có thể gây ra) rồi trả về dữ liệu có cả giá trị không phải kiểu thuần.
import { parentPort } from 'node:worker_threads';

Object.prototype.polluted = 'yes';

parentPort.postMessage({
  ok: true,
  result: {
    sheetName: 'Sheet1',
    rows: [
      ['Email', 'SĐT'],
      ['a@example.com', { toString: 'không phải chuỗi' }, null, 42, true],
      'không phải mảng',
    ],
  },
});
