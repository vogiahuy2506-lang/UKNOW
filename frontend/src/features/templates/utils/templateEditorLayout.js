/**
 * Bố cục trang soạn mẫu: dải "Thông tin mẫu" đóng/mở, cột "Chèn thông tin khách" đóng/mở + kéo giãn.
 * Trạng thái nhớ theo từng trình duyệt (localStorage). Mọi thao tác storage bọc try/catch:
 * chế độ riêng tư / chặn dữ liệu có thể ném lỗi thì dùng giá trị mặc định.
 */
export const PANEL_MIN_WIDTH = 240;
export const PANEL_MAX_WIDTH = 520;
export const PANEL_DEFAULT_WIDTH = 320;
export const PANEL_KEY_STEP = 16;

export const STORAGE_KEYS = {
  infoOpen: 'uknow.templateEditor.infoOpen',
  panelOpen: 'uknow.templateEditor.panelOpen',
  panelWidth: 'uknow.templateEditor.panelWidth',
};

/** Ép độ rộng cột vào [240, 520]; giá trị không phải số -> mặc định. */
export function clampPanelWidth(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return PANEL_DEFAULT_WIDTH;
  return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, Math.round(n)));
}

function readRaw(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    /* bỏ qua: không lưu được thì lần sau dùng mặc định */
  }
}

export function loadBooleanPref(key, fallback) {
  const raw = readRaw(key);
  if (raw === '1') return true;
  if (raw === '0') return false;
  return fallback;
}

export function saveBooleanPref(key, value) {
  writeRaw(key, value ? '1' : '0');
}

export function loadPanelWidth() {
  const raw = readRaw(STORAGE_KEYS.panelWidth);
  return raw == null ? PANEL_DEFAULT_WIDTH : clampPanelWidth(raw);
}

export function savePanelWidth(width) {
  writeRaw(STORAGE_KEYS.panelWidth, clampPanelWidth(width));
}
