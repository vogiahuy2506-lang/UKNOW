import { useI18n } from '../../i18n';

const ComingSoonModal = ({ open, onClose }) => {
  const { t } = useI18n();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 py-6 px-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center text-3xl">
          🚧
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          {t('quickSend.comingSoonTitle')}
        </h2>
        <p className="text-sm text-gray-600 mb-5">
          {t('quickSend.comingSoonDesc')}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center px-5 py-2 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 transition-colors"
        >
          {t('quickSend.comingSoonClose')}
        </button>
      </div>
    </div>
  );
};

export default ComingSoonModal;