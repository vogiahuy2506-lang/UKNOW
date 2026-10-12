/**
 * HỢP ĐỒNG giữa danh mục loại tệp của frontend (trình soạn + renderer) và của backend (nguồn sự thật) — PR-4b.
 * Frontend giữ bản sao `frontend/src/features/forms/utils/formFileKinds.util.js` (không có chữ ký/MIME). Lệch nhóm / đuôi / danh sách
 * cấm / giới hạn thì đỏ ở đây, thay vì trình soạn cho chọn thứ backend từ chối (hoặc ngược lại: backend nhận mà giao diện chặn).
 */
import { describe, expect, it } from '@jest/globals';
import {
  DEFAULT_FORM_FILE_CONFIG,
  FORBIDDEN_FILE_EXTENSIONS,
  FORM_FILE_KINDS,
  FORM_FILE_KIND_IDS,
  MAX_FORM_FILE_BYTES,
  MAX_FORM_FILE_COUNT,
  MIN_FORM_FILE_BYTES,
  MIN_FORM_FILE_COUNT,
  buildAcceptAttribute,
  normalizeFormFileConfig,
} from '../formFileKinds.util.js';
import * as fe from '../../../../frontend/src/features/forms/utils/formFileKinds.util.js';
import viDictionary from '../../../../frontend/src/i18n/vi.js';
import enDictionary from '../../../../frontend/src/i18n/en.js';

const MB = 1024 * 1024;

describe('formFileKinds: frontend ↔ backend', () => {
  it('cùng danh sách nhóm, cùng thứ tự', () => {
    expect(fe.FORM_FILE_KIND_IDS).toEqual([...FORM_FILE_KIND_IDS]);
  });

  it.each([...FORM_FILE_KIND_IDS])('nhóm %s: cùng danh sách đuôi', (kind) => {
    expect(fe.FORM_FILE_KIND_EXTS[kind]).toEqual([...FORM_FILE_KINDS[kind].exts]);
  });

  it('cùng danh sách CẤM tuyệt đối', () => {
    expect([...fe.FORBIDDEN_FILE_EXTENSIONS].sort()).toEqual([...FORBIDDEN_FILE_EXTENSIONS].sort());
  });

  it('cùng giới hạn: dung lượng 1 MB..1 GB, số tệp 1..10, mặc định', () => {
    expect(fe.MIN_FORM_FILE_MB * MB).toBe(MIN_FORM_FILE_BYTES);
    expect(fe.MAX_FORM_FILE_MB * MB).toBe(MAX_FORM_FILE_BYTES);
    expect(fe.MIN_FORM_FILE_COUNT).toBe(MIN_FORM_FILE_COUNT);
    expect(fe.MAX_FORM_FILE_COUNT).toBe(MAX_FORM_FILE_COUNT);
    expect({ kinds: [...fe.DEFAULT_FORM_FILE_CONFIG.kinds], maxBytes: fe.DEFAULT_FORM_FILE_CONFIG.maxBytes, maxFiles: fe.DEFAULT_FORM_FILE_CONFIG.maxFiles })
      .toEqual({ kinds: [...DEFAULT_FORM_FILE_CONFIG.kinds], maxBytes: DEFAULT_FORM_FILE_CONFIG.maxBytes, maxFiles: DEFAULT_FORM_FILE_CONFIG.maxFiles });
  });

  it('thuộc tính accept của hai bên giống nhau cho mọi nhóm và cho tổ hợp', () => {
    for (const kind of FORM_FILE_KIND_IDS) {
      expect(fe.buildAcceptAttribute([kind])).toBe(buildAcceptAttribute([kind]));
    }
    expect(fe.buildAcceptAttribute([...FORM_FILE_KIND_IDS])).toBe(buildAcceptAttribute([...FORM_FILE_KIND_IDS]));
  });

  it('cấu hình mặc định của frontend là cấu hình backend chuẩn hoá ra (qua readFileConfig ↔ normalizeFormFileConfig)', () => {
    expect(fe.readFileConfig(undefined)).toEqual(normalizeFormFileConfig(undefined));
    const custom = { kinds: ['zip', 'word'], maxBytes: 25 * MB, maxFiles: 4 };
    expect(fe.readFileConfig(custom)).toEqual(normalizeFormFileConfig(custom));
  });

  it('mọi tệp mà kiểm nhanh phía client cho qua thì backend cũng nhận đuôi đó, và ngược lại với đuôi cấm', () => {
    const config = { kinds: [...FORM_FILE_KIND_IDS], maxBytes: 10 * MB };
    for (const kind of FORM_FILE_KIND_IDS) {
      for (const ext of FORM_FILE_KINDS[kind].exts) {
        expect(fe.validateClientFile({ name: `tep.${ext}`, size: 100 }, config)).toEqual({ ok: true });
      }
    }
    for (const ext of FORBIDDEN_FILE_EXTENSIONS) {
      expect(fe.validateClientFile({ name: `tep.${ext}`, size: 100 }, config)).toEqual({ ok: false, reason: 'forbidden' });
    }
  });

  it('mỗi nhóm có nhãn i18n vi + en cho ô chọn nhóm trong trình soạn', () => {
    for (const kind of FORM_FILE_KIND_IDS) {
      expect(viDictionary.forms.editorPage.properties.fileKind[kind]).toEqual(expect.any(String));
      expect(enDictionary.forms.editorPage.properties.fileKind[kind]).toEqual(expect.any(String));
    }
  });
});
