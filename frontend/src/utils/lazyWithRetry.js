import { lazy } from 'react';

// Sau mỗi lần deploy, tên chunk (hash) đổi và chunk cũ bị xoá. Tab mở từ bản cũ bấm sang trang
// khác sẽ gọi chunk không còn nữa -> các thông báo lỗi dưới đây (Chrome / Safari / Firefox).
const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i;

const FLAG_PREFIX = 'lazy-retry-reloaded:';

export const isChunkLoadError = (error) =>
  CHUNK_ERROR_PATTERN.test(String(error?.message ?? error ?? ''));

const getFlagKey = () => {
  try {
    return FLAG_PREFIX + window.location.pathname + window.location.search;
  } catch {
    return FLAG_PREFIX;
  }
};

const readFlag = (key) => {
  try {
    return window.sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};

const writeFlag = (key) => {
  try {
    window.sessionStorage.setItem(key, '1');
    return true;
  } catch {
    return false;
  }
};

const clearFlag = (key) => {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // sessionStorage bị chặn -> bỏ qua
  }
};

/**
 * Bọc `React.lazy`: nếu chunk không tải được (chunk cũ đã mất sau deploy) thì reload trang đúng MỘT lần
 * cho URL hiện tại để lấy bản mới; lần hai trở đi ném lỗi lên ErrorBoundary.
 * Lỗi không phải lỗi tải chunk được ném ngay, không reload.
 * `reload` chỉ để test thay thế (jsdom không cho mock `location.reload`).
 */
export function lazyWithRetry(importer, { reload = () => window.location.reload() } = {}) {
  return lazy(async () => {
    try {
      const mod = await importer();
      clearFlag(getFlagKey());
      return mod;
    } catch (error) {
      if (!isChunkLoadError(error)) throw error;
      const key = getFlagKey();
      if (readFlag(key)) throw error;
      // Không ghi được cờ (sessionStorage bị chặn) thì không reload để khỏi lặp vô hạn.
      if (!writeFlag(key)) throw error;
      reload();
      // Giữ Suspense ở trạng thái chờ trong lúc trang đang tải lại, tránh nháy màn lỗi.
      return new Promise(() => {});
    }
  });
}

export default lazyWithRetry;
