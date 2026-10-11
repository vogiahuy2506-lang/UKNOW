import { HiOutlineDesktopComputer, HiOutlineDeviceMobile } from 'react-icons/hi';
import { useI18n } from '../../../../i18n';
import { TopbarSegmented } from '../../../../components/editor/AdminEditorShell';
import FormRenderer from '../FormRenderer';

// Bề rộng khung điện thoại (khớp màn hình rộng ~390px cần kiểm tra không tràn ngang).
const MOBILE_FRAME_WIDTH = 390;

const noopSubmit = () => {};

/**
 * Cột PHẢI của trình soạn: xem trước SỐNG dùng chính FormRenderer của trang công khai (previewMode — mọi ô bị khoá,
 * nút gửi không làm gì, KHÔNG gọi API nộp bài). Dựng từ state nháp hiện tại chứ không phải bản đã lưu, nên thấy ngay
 * ô đồng ý (theo cài đặt thật), bộ chọn lịch (khi bật đặt lịch), chữ hướng dẫn, placeholder, màu, font, banner, logo.
 * Chuyển Máy tính / Điện thoại (khung rộng 390px).
 */
export default function FormPreviewPane({ form, backgroundColor, device, onDeviceChange }) {
  const { t } = useI18n();
  const isMobile = device === 'mobile';

  return (
    <div className="p-3 sm:p-4 space-y-3 min-w-0" data-testid="form-preview-pane">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-dk-text">{t('forms.editorPage.preview.title')}</h2>
          <p className="text-[11px] text-slate-500 dark:text-dk-text2">{t('forms.editorPage.preview.hint')}</p>
        </div>
        <TopbarSegmented
          ariaLabel={t('forms.editorPage.preview.deviceLabel')}
          value={device}
          onChange={onDeviceChange}
          options={[
            { value: 'desktop', label: t('forms.editorPage.preview.desktop'), icon: HiOutlineDesktopComputer },
            { value: 'mobile', label: t('forms.editorPage.preview.mobile'), icon: HiOutlineDeviceMobile },
          ]}
        />
      </div>

      <div
        data-testid="form-preview-canvas"
        className="rounded-2xl border border-gray-200 dark:border-dk-border p-3 sm:p-5 overflow-x-hidden box-border bg-gray-50 dark:bg-dk-surface"
        style={backgroundColor ? { backgroundColor } : undefined}
      >
        <div
          data-testid="form-preview-frame"
          data-device={device}
          style={isMobile ? { width: MOBILE_FRAME_WIDTH, maxWidth: '100%' } : undefined}
          className={
            isMobile
              ? 'mx-auto rounded-[28px] border-[6px] border-slate-800 shadow-xl overflow-hidden bg-white'
              : 'w-full'
          }
        >
          <FormRenderer form={form} onSubmit={noopSubmit} previewMode />
        </div>
      </div>
    </div>
  );
}
