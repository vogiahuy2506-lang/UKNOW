import {
  HiOutlineArrowLeft,
  HiOutlineCalendar,
  HiOutlineCash,
  HiOutlineChatAlt2,
  HiOutlineClipboardList,
  HiOutlineDocument,
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import { FORM_TEMPLATES } from '../constants/formTemplates';

const TEMPLATE_ICONS = {
  consult: HiOutlineChatAlt2,
  booking: HiOutlineCalendar,
  payment: HiOutlineCash,
  survey: HiOutlineClipboardList,
  blank: HiOutlineDocument,
};

/**
 * Bước đầu khi TẠO biểu mẫu mới: chọn một mẫu dựng sẵn (hoặc "Trống").
 * Chỉ hiện ở /app/forms/new — sửa biểu mẫu cũ đi thẳng vào trình soạn.
 *
 * @param {{ onSelect: (templateId: string) => void, onBack: () => void, isEmployee: boolean }} props
 *   isEmployee: mẫu `ownerOnly` (thu tiền) chỉ chủ tài khoản dùng được — nhân viên không gửi được paymentConfig.
 */
export default function FormTemplatePicker({ onSelect, onBack, isEmployee = false }) {
  const { t } = useI18n();

  return (
    <div className="space-y-6" data-testid="form-template-picker">
      <div className="flex items-center gap-3 py-3.5 border-b border-gray-100">
        <button
          type="button"
          onClick={onBack}
          className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-900 shadow-2xs transition-all"
          title={t('forms.submissionsPage.backToForms')}
        >
          <HiOutlineArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t('forms.createNew')}</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">{t('forms.editorPage.templates.subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FORM_TEMPLATES.map((template) => {
          const Icon = TEMPLATE_ICONS[template.id] || HiOutlineDocument;
          const locked = template.ownerOnly && isEmployee;
          return (
            <button
              key={template.id}
              type="button"
              disabled={locked}
              onClick={() => onSelect(template.id)}
              data-testid={`form-template-${template.id}`}
              className="text-left p-5 rounded-2xl border border-gray-200/90 bg-white shadow-xs hover:border-orange-300 hover:shadow-sm active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-gray-200/90 disabled:hover:shadow-xs space-y-3"
            >
              <div className="inline-flex p-2.5 rounded-xl bg-orange-50 text-orange-600">
                <Icon className="w-6 h-6" />
              </div>
              <div>
                <div className="text-base font-bold text-gray-900">{t(template.nameKey)}</div>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{t(template.descKey)}</p>
                {locked && (
                  <p className="text-xs text-amber-700 mt-2">{t('forms.editorPage.payment.employeeReadOnlyNotice')}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
