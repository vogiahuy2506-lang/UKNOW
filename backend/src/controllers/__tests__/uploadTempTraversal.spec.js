import { describe, it, expect } from '@jest/globals';
import path from 'path';
import { promises as fs } from 'fs';
import uploadController from '../upload.controller.js';

/**
 * Path-traversal qua tempId/originalName do client khai.
 * Trước bản vá: readTempFileBuffer('../package', 'x.json') đọc được /app/package.json,
 * '../.env' đọc được secret, '../uploads/<id>/...' đọc file người dùng khác.
 * Bản vá bắt tempId phải là UUID và kẹp đường dẫn trong temp_uploads.
 */
describe('upload.controller — chống path traversal theo tempId', () => {
  const VALID_UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  describe('resolveTempFilePath', () => {
    it('nhận UUID hợp lệ → đường dẫn nằm trong temp_uploads', () => {
      const p = uploadController.resolveTempFilePath(VALID_UUID, 'bao_cao.pdf');
      expect(p.startsWith(uploadController.tempDir + path.sep)).toBe(true);
      expect(p.endsWith(`${VALID_UUID}.pdf`)).toBe(true);
    });

    it('nhận tempId dạng kb_<id> — luồng Knowledge Base không được vỡ', () => {
      const p = uploadController.resolveTempFilePath('kb_42', 'tai_lieu.docx');
      expect(p.startsWith(uploadController.tempDir + path.sep)).toBe(true);
      expect(p.endsWith('kb_42.docx')).toBe(true);
    });

    it('chặn ../package (payload đã khai thác trên production)', () => {
      expect(() => uploadController.resolveTempFilePath('../package', 'x.json')).toThrow();
    });

    it('chặn ../.env', () => {
      expect(() => uploadController.resolveTempFilePath('../.env', 'x')).toThrow();
    });

    it('chặn đọc xuyên tài khoản ../uploads/<id>/chat/...', () => {
      expect(() => uploadController.resolveTempFilePath('../uploads/5/chat/1700_hd', 'x.pdf')).toThrow();
    });

    it('chặn đường dẫn tuyệt đối', () => {
      expect(() => uploadController.resolveTempFilePath('/etc/passwd', 'x')).toThrow();
    });

    it('đuôi lạ trong originalName bị bỏ, không phá được đường dẫn', () => {
      // originalName cố nhét traversal qua "đuôi" — extname chỉ lấy sau dấu . cuối,
      // và regex đuôi chữ-số loại mọi thứ có ký tự đường dẫn.
      const p = uploadController.resolveTempFilePath(VALID_UUID, 'a/../../etc/passwd');
      expect(p.startsWith(uploadController.tempDir + path.sep)).toBe(true);
    });
  });

  describe('readTempFileBuffer', () => {
    it('không đọc file ngoài temp_uploads — ném lỗi thay vì trả nội dung', async () => {
      await expect(
        uploadController.readTempFileBuffer('../package', 'x.json')
      ).rejects.toThrow();
    });

    it('đọc được file tạm hợp lệ do chính uploadTemp tạo', async () => {
      const uuid = '11111111-2222-4333-8444-555555555555';
      await fs.mkdir(uploadController.tempDir, { recursive: true });
      const target = path.join(uploadController.tempDir, `${uuid}.txt`);
      await fs.writeFile(target, 'noi dung hop le', 'utf8');
      try {
        const buf = await uploadController.readTempFileBuffer(uuid, 'goc.txt');
        expect(buf.toString()).toBe('noi dung hop le');
      } finally {
        await fs.unlink(target).catch(() => {});
      }
    });

    it('đọc được file KB hợp lệ (kb_<id>) — không bị bản vá chặn nhầm', async () => {
      await fs.mkdir(uploadController.tempDir, { recursive: true });
      const target = path.join(uploadController.tempDir, 'kb_7.txt');
      await fs.writeFile(target, 'tai lieu kb', 'utf8');
      try {
        const buf = await uploadController.readTempFileBuffer('kb_7', 'x.txt');
        expect(buf.toString()).toBe('tai lieu kb');
      } finally {
        await fs.unlink(target).catch(() => {});
      }
    });
  });
});
