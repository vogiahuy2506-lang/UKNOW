import { HiOutlineLightningBolt, HiOutlineX } from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import FullScreenOverlay from '../../../components/FullScreenOverlay';
import { getAllNodeConfigs } from './CampaignBuilderFlowNodes';
import NodeConfigForm from './NodeConfigForm';

/**
 * Hộp cấu hình khối của Sơ đồ khối: vỏ `FullScreenOverlay` + tiêu đề, phần form nằm ở `NodeConfigForm`
 * (cùng form được nhúng tại chỗ ở tab Thiết lập).
 */
const NodeConfigModal = ({ isOpen, onClose, node, ...formProps }) => {
  const { t, locale } = useI18n();
  const nodeType = node?.data?.nodeType;
  const config = getAllNodeConfigs().find((n) => n.type === nodeType);
  const Icon = config?.icon || HiOutlineLightningBolt;
  const configLabel = (locale === 'vi' && config?.nameVi) || config?.name;

  return (
    <FullScreenOverlay isOpen={isOpen} className="overflow-y-auto py-8">
      <div className="bg-white dark:bg-dk-surface rounded-xl shadow-xl w-full max-w-4xl mx-4 my-auto border border-transparent dark:border-dk-border text-gray-900 dark:text-dk-text">
        <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-dk-border">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: config?.bgColor || '#E8EAF6' }}
          >
            <Icon className="w-5 h-5" style={{ color: config?.iconColor || '#5C6BC0' }} />
          </div>
          <div>
            <span className="text-sm text-gray-500 dark:text-dk-text2">{t('campaignBuilder.configuring')}</span>
            <span className="text-primary-600 dark:text-primary-400 font-medium ml-1">{configLabel || t('campaignBuilder.nodeName')}</span>
          </div>
          <button onClick={onClose} className="ml-auto p-1 hover:bg-gray-100 dark:hover:bg-dk-raised text-gray-500 dark:text-dk-text2 rounded-lg">
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        <NodeConfigForm {...formProps} isOpen={isOpen} node={node} onCancel={onClose} variant="modal" />
      </div>
    </FullScreenOverlay>
  );
};

export default NodeConfigModal;
