import { useI18n } from '../../../i18n';

/**
 * Câu đồng ý chung cho 3 văn bản bắt buộc (Điều khoản sử dụng, Chính sách quyền riêng tư,
 * Thoả thuận xử lý dữ liệu). Dùng ở trang đăng ký và hộp thoại hỏi lại sau đăng nhập —
 * cả hai chỉ có MỘT ô tích, mỗi văn bản là một link mở tab mới.
 *
 * @param {{ linkClassName?: string }} props
 */
const DEFAULT_LINK_CLASS = 'text-orange-600 dark:text-orange-400 hover:underline font-medium';

const ConsentAgreementText = ({ linkClassName = DEFAULT_LINK_CLASS }) => {
  const { t } = useI18n();

  const link = (href, label) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkClassName}>
      {label}
    </a>
  );

  return (
    <>
      {t('auth.agreeAllIntro')}{' '}
      {link('/terms', t('auth.termsOfUse'))}, {link('/privacy-policy', t('auth.privacyPolicy'))}{' '}
      {t('auth.and')} {link('/public-dpa', t('auth.publicDPA'))}
    </>
  );
};

export default ConsentAgreementText;
