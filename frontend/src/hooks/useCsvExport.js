import { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../i18n';
import { CSV_EXPORT_MAX_ROWS, downloadCsvFromRequest } from '../utils/csvExportDownload';

/**
 * Nút "Xuất CSV" dùng chung (PR-8c): chạy lệnh xuất, tải file, báo kết quả bằng toast (số dòng · bị cắt ở trần · lỗi).
 * Chỉ cho một lệnh xuất chạy cùng lúc (bấm liên tiếp không tạo nhiều tệp).
 *
 * @returns {{ exportCsv: (requestFactory: () => Promise<import('axios').AxiosResponse>, fallbackFilename?: string) => Promise<void>, isExporting: boolean }}
 */
export default function useCsvExport() {
  const { t } = useI18n();
  const [isExporting, setIsExporting] = useState(false);
  const inFlight = useRef(false);

  const exportCsv = useCallback(
    async (requestFactory, fallbackFilename) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setIsExporting(true);
      try {
        const { rowCount, total, truncated } = await downloadCsvFromRequest(requestFactory(), fallbackFilename);
        if (truncated) {
          toast(
            t('csvExport.truncated', {
              count: rowCount.toLocaleString('vi-VN'),
              total: total.toLocaleString('vi-VN'),
              max: CSV_EXPORT_MAX_ROWS.toLocaleString('vi-VN'),
            }),
            { duration: 9000 }
          );
        } else if (rowCount === 0) {
          toast(t('csvExport.doneEmpty'));
        } else {
          toast.success(t('csvExport.done', { count: rowCount.toLocaleString('vi-VN') }));
        }
      } catch (error) {
        toast.error(error?.response?.data?.message || t('csvExport.failed'));
      } finally {
        inFlight.current = false;
        setIsExporting(false);
      }
    },
    [t]
  );

  return { exportCsv, isExporting };
}
