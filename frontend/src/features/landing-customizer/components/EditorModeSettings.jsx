import { HiOutlineCheckCircle, HiOutlineExclamation } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

const MODES = ['canva', 'html'];

/**
 * Nội dung modal "Cài đặt" dùng chung cho hai trình soạn Tuỳ chỉnh Landing (Canva Editor / HTML Full):
 * 1) CHẾ ĐỘ SOẠN — đổi giữa hai trình soạn (state `editorMode` nằm ở trang cha);
 * 2) TRẠNG THÁI HIỂN THỊ của trang đang chọn — trang công khai đang dùng bản mặc định (React + chữ/màu đã sửa ở Canva) hay
 *    HTML tuỳ chỉnh. `displayState`: 'default' | 'html' | 'loading' | 'unknown'. Các nút bật/tắt đi vào `children`.
 *
 * Chỉ là trình bày: không giữ state, không gọi API — mọi hành động đi qua props.
 */
export default function EditorModeSettings({ mode, onModeChange, displayState, pageLabel, pagePath, children }) {
  const { t } = useI18n();
  const tt = (key, params) => t(`landingCustomizer.editor.settings.${key}`, params);

  const statusTone = displayState === 'html'
    ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300'
    : displayState === 'default'
      ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
      : 'bg-gray-100 dark:bg-dk-raised text-gray-600 dark:text-dk-text2';

  return (
    <div className="space-y-7">
      {onModeChange && (
        <section>
          <h3 className="text-sm font-bold text-gray-900 dark:text-dk-text">{tt('editModeTitle')}</h3>
          <p className="text-xs text-gray-500 dark:text-dk-text2 mt-0.5">{tt('editModeHint')}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2" role="group" aria-label={tt('editModeTitle')}>
            {MODES.map((key) => {
              const active = mode === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => { if (!active) onModeChange(key); }}
                  className={`text-left rounded-xl border px-4 py-3 transition-all ${
                    active
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30 ring-2 ring-orange-500/15'
                      : 'border-gray-200 dark:border-dk-border bg-white dark:bg-dk-raised hover:border-orange-300 dark:hover:border-orange-700 hover:bg-gray-50 dark:hover:bg-dk-strong'
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-semibold ${active ? 'text-orange-700 dark:text-orange-300' : 'text-gray-900 dark:text-dk-text'}`}>
                      {tt(`${key}Name`)}
                    </span>
                    {active && <HiOutlineCheckCircle className="w-5 h-5 text-orange-500 shrink-0" aria-hidden="true" />}
                  </span>
                  <span className="block text-xs text-gray-500 dark:text-dk-text2 mt-1">{tt(`${key}Desc`)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h3 className="text-sm font-bold text-gray-900 dark:text-dk-text">{tt('displayTitle')}</h3>
        <p className="text-xs text-gray-500 dark:text-dk-text2 mt-0.5">{tt('displayHint')}</p>
        <div className="mt-3 rounded-xl border border-gray-200 dark:border-dk-border bg-gray-50 dark:bg-dk-inset px-4 py-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <span className="font-semibold text-gray-900 dark:text-dk-text">{pageLabel}</span>
            {pagePath && <code className="text-xs text-orange-600 dark:text-orange-400">{pagePath}</code>}
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusTone}`}>
              {tt(`state.${displayState || 'unknown'}`)}
            </span>
          </div>
          {displayState === 'default' && (
            <p className="text-xs text-gray-600 dark:text-dk-text2">{tt('stateDefaultDesc')}</p>
          )}
          {displayState === 'html' && (
            <p className="text-xs text-gray-600 dark:text-dk-text2 flex gap-1.5">
              <HiOutlineExclamation className="w-4 h-4 text-orange-500 shrink-0 mt-px" aria-hidden="true" />
              <span>{tt('stateHtmlDesc')}</span>
            </p>
          )}
          {children}
        </div>
      </section>
    </div>
  );
}
