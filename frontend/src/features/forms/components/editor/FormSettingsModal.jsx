import {
  HiOutlineDocumentText,
  HiOutlineClipboardCheck,
  HiOutlineCalendar,
  HiOutlineCreditCard,
  HiOutlineColorSwatch,
  HiOutlineShoppingCart,
} from 'react-icons/hi';
import { useI18n } from '../../../../i18n';
import { EditorSettingsModal } from '../../../../components/editor/AdminEditorShell';
import GeneralTab from './settings/GeneralTab';
import AfterSubmitTab from './settings/AfterSubmitTab';
import BookingTab from './settings/BookingTab';
import PaymentTab from './settings/PaymentTab';
import ThemeTab from './settings/ThemeTab';
import ProductTab from './settings/ProductTab';

const TAB_ICONS = {
  general: HiOutlineDocumentText,
  afterSubmit: HiOutlineClipboardCheck,
  booking: HiOutlineCalendar,
  payment: HiOutlineCreditCard,
  theme: HiOutlineColorSwatch,
  product: HiOutlineShoppingCart,
};

/**
 * Modal "Cài đặt" của trình soạn biểu mẫu: gom MỌI cấu hình ngoài việc soạn trường (thông tin chung, sau khi gửi,
 * đặt lịch, thanh toán, giao diện, sản phẩm) thành các tab. Chỉ tab đang chọn được dựng; state luôn nằm ở FormEditorPage
 * nên đóng/mở modal hay đổi tab không mất dữ liệu.
 *
 * @param {object} props
 * @param {string|null} props.activeTab khoá tab đang mở, null = modal đóng
 * @param {Record<string, boolean>} props.tabOn tab nào đang có tính năng bật (chấm xanh)
 * @param {Record<string, boolean>} props.tabError tab nào có ô lỗi (chấm đỏ)
 */
export default function FormSettingsModal({
  activeTab,
  onTabChange,
  onClose,
  tabOn,
  tabError,
  general,
  afterSubmit,
  booking,
  payment,
  theme,
  product,
}) {
  const { t } = useI18n();

  const tabs = Object.keys(TAB_ICONS).map((key) => ({
    key,
    icon: TAB_ICONS[key],
    label: (
      <span className="inline-flex items-center gap-1.5">
        <span>{t(`forms.editorPage.settings.tabs.${key}`)}</span>
        {tabError[key] ? (
          <span
            aria-hidden="true"
            data-testid={`settings-tab-error-${key}`}
            title={t('forms.editorPage.settings.tabError')}
            className="w-1.5 h-1.5 rounded-full bg-red-500"
          />
        ) : tabOn[key] ? (
          <span
            aria-hidden="true"
            data-testid={`settings-tab-on-${key}`}
            title={t('forms.editorPage.settings.tabOn')}
            className="w-1.5 h-1.5 rounded-full bg-emerald-500"
          />
        ) : null}
      </span>
    ),
  }));

  return (
    <EditorSettingsModal
      open={Boolean(activeTab)}
      onClose={onClose}
      title={t('forms.editorPage.settings.title')}
      subtitle={t('forms.editorPage.settings.subtitle')}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={onTabChange}
    >
      {activeTab === 'general' && <GeneralTab {...general} />}
      {activeTab === 'afterSubmit' && <AfterSubmitTab {...afterSubmit} />}
      {activeTab === 'booking' && <BookingTab {...booking} />}
      {activeTab === 'payment' && <PaymentTab {...payment} />}
      {activeTab === 'theme' && <ThemeTab {...theme} />}
      {activeTab === 'product' && <ProductTab {...product} />}
    </EditorSettingsModal>
  );
}
