import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

/**
 * Tải một danh sách khi bước hiện ra (hoặc khi `deps` đổi) và cho phép thử lại.
 *
 * - Lượt cũ về muộn bị bỏ (đổi `deps` / gỡ bước giữa chừng).
 * - Request bị `api.js` huỷ vì khử trùng GET song song (React StrictMode gắn effect hai lần) KHÔNG phải lỗi: bỏ qua,
 *   lượt sau trả kết quả.
 *
 * @template T
 * @param {() => Promise<T>} loader hàm tải (đọc qua ref, đổi tham chiếu không kéo theo tải lại)
 * @param {Array<unknown>} deps khi nào cần tải lại
 * @returns {{ status: 'loading'|'ready'|'error', data: T|null, error: string, reload: () => void }}
 */
export default function useAsyncResource(loader, deps = []) {
  const [state, setState] = useState({ status: 'loading', data: null, error: '' });
  const [reloadKey, setReloadKey] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let cancelled = false;
    setState((prev) => (prev.status === 'loading' ? prev : { status: 'loading', data: null, error: '' }));
    Promise.resolve()
      .then(() => loaderRef.current())
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data, error: '' });
      })
      .catch((error) => {
        if (cancelled || axios.isCancel(error) || error?.code === 'ERR_CANCELED') return;
        setState({
          status: 'error',
          data: null,
          error: String(error?.response?.data?.message || error?.message || '').trim(),
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `deps` do nơi gọi truyền vào có chủ đích
  }, [reloadKey, ...deps]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  return { ...state, reload };
}
