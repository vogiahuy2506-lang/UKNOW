import toast from 'react-hot-toast';

export const SCHEDULE_OVERLAP_TOAST_ID = 'schedule-overlap-toast';
export const SCHEDULE_OVERLAP_TOAST_DURATION_MS = 12000;

/**
 * Toast dài cho 409 SCHEDULE_OVERLAP khi BẬT lại lịch (không có modal biểu mẫu để hiện khối lỗi):
 * câu của server + danh sách gợi ý + nút đóng. Cùng id nên bấm lặp không chồng nhiều toast.
 *
 * @param {{ message: string, suggestions: string[], t: (key: string) => string }} params
 */
export const showScheduleOverlapToast = ({ message, suggestions, t }) => {
  toast.custom(
    (tst) => (
      <div
        role="alert"
        data-testid="schedule-overlap-toast"
        className="max-w-md rounded-lg border border-red-200 bg-white px-4 py-3 text-sm text-red-700 shadow-lg"
        style={{ opacity: tst.visible ? 1 : 0 }}
      >
        <div className="flex items-start gap-3">
          <p className="m-0 flex-1">{message}</p>
          <button
            type="button"
            onClick={() => toast.dismiss(tst.id)}
            className="text-xs font-semibold text-gray-500 hover:text-gray-700"
          >
            {t('common.close')}
          </button>
        </div>
        {suggestions.length > 0 && (
          <ul className="mt-2 list-disc space-y-0.5 pl-5" data-testid="schedule-overlap-toast-suggestions">
            {suggestions.map((suggestion) => (
              <li key={suggestion}>{suggestion}</li>
            ))}
          </ul>
        )}
      </div>
    ),
    { id: SCHEDULE_OVERLAP_TOAST_ID, duration: SCHEDULE_OVERLAP_TOAST_DURATION_MS },
  );
};
