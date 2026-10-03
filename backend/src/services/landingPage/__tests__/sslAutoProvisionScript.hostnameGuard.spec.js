// Bộ chặn hostname trong server/scripts/ssl-auto-provision.sh (chạy bằng bash thật, không cần root):
// tên miền lấy từ DB đi thẳng vào heredoc nginx + đường dẫn file + tham số certbot, nên script phải
// từ chối mọi thứ không phải tên miền RFC 1123 chữ thường TRƯỚC khi kiểm quyền root.
import { describe, it, expect } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(here, '../../../../../server/scripts/ssl-auto-provision.sh');

function runScript(domain) {
  const res = spawnSync('bash', [SCRIPT, domain], {
    encoding: 'utf8',
    env: { ...process.env, SSL_PROVISION_LOG: '/dev/null' },
    timeout: 10000,
  });
  return { status: res.status, out: `${res.stdout}\n${res.stderr}` };
}

describe('ssl-auto-provision.sh — chặn hostname không hợp lệ', () => {
  it.each([
    ['chèn chỉ thị nginx', 'a.com; }'],
    ['thoát thư mục', '../etc/x'],
    ['khoảng trắng', 'a.com b.com'],
    ['thiếu TLD', 'founderai'],
    ['nhãn bắt đầu bằng dấu gạch', '-a.com'],
    ['nhãn dài hơn 63 ký tự', `${'a'.repeat(64)}.com`],
    ['dấu gạch dưới', 'a_b.com'],
  ])('từ chối %s: %j', (_label, domain) => {
    const { status, out } = runScript(domain);
    expect(status).toBe(1);
    expect(out).toContain('Invalid domain name');
    expect(out).not.toContain('quyền root');
  });

  it.each([['founderai.biz'], ['digibook.com.vn'], ['a-b.c1.vn'], ['Example.COM']])(
    'nhận %s rồi mới đi tới bước kiểm root',
    (domain) => {
      const { status, out } = runScript(domain);
      // Không chạy bằng root trong test → script dừng ở bước kiểm root, tức hostname đã qua.
      expect(status).toBe(1);
      expect(out).not.toContain('Invalid domain name');
      expect(out).toContain('quyền root');
    }
  );

  it('thiếu tham số → in usage, thoát 1', () => {
    const { status, out } = runScript('');
    expect(status).toBe(1);
    expect(out).toContain('Usage:');
  });
});
