import {
  HiOutlineClock,
  HiOutlineDuplicate,
  HiOutlineLightningBolt,
  HiOutlineMail,
  HiOutlinePlay,
  HiOutlineSave,
  HiOutlineStop,
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';

const BASE_BUTTON_CLASS = 'px-2.5 sm:px-4 py-1.5 sm:py-2 text-sm sm:text-base rounded-lg transition-colors flex items-center gap-1.5 sm:gap-2';

/**
 * Nhóm nút của trình dựng chiến dịch.
 *
 * Tách khỏi CampaignBuilderPageLayout để test được TỪNG nút gọi đúng hàm nào — trước đây phần này
 * nằm giữa layout khổng lồ (có FlowCanvas/ReactFlow) nên spec phải mock cả layout, và việc nút nào
 * nối vào đâu không ai canh. Đúng chỗ nguy hiểm nhất: "Chạy thử" chỉ chạy trong trình duyệt để xem
 * trước, còn "Chạy ngay" gửi thật cho khách — nối nhầm là tin đã đi rồi mới biết.
 *
 * @param {object} props
 * @param {() => void} props.onRunNow gửi thật trên máy chủ
 * @param {() => void} props.onOpenSchedule mở hộp lên lịch
 * @param {boolean} props.canUseServerRunActions chiến dịch đã lưu lần nào chưa
 * @param {string} props.serverRunActionsDisabledHint tooltip khi 2 nút gửi thật bị vô hiệu
 * @param {() => void} props.onRunCampaign chạy THỬ trong trình duyệt
 * @param {boolean} props.isRunning đang chạy thử
 * @param {() => void} props.onStopRun dừng chạy thử
 * @param {() => void} props.onOpenNameModal mở hộp lưu
 * @param {() => void} props.onOpenShare mở hộp chia sẻ — chỉ hiện khi `canShare`
 * @param {boolean} [props.canShare=false] chiến dịch tự tạo (`origin === 'self_created'`) — không
 *   mặc định hiện khi thiếu dữ liệu, cho hiện oan là lỗi quyền (chiến dịch mua/được chia sẻ)
 * @param {() => void} props.onOpenDuplicate mở hộp nhân bản
 */
const CampaignBuilderToolbar = ({
  onRunNow,
  onOpenSchedule,
  canUseServerRunActions = false,
  serverRunActionsDisabledHint = '',
  onRunCampaign,
  isRunning,
  onStopRun,
  onOpenNameModal,
  onOpenShare,
  canShare = false,
  onOpenDuplicate,
}) => {
  const { t } = useI18n();

  return (
    <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
      {/* Hai nút gửi THẬT đứng trước nhóm chạy thử/dừng: đọc từ trái sang là việc thật → việc thử → lưu. */}
      <button
        onClick={onRunNow}
        disabled={!canUseServerRunActions}
        title={!canUseServerRunActions ? serverRunActionsDisabledHint : undefined}
        className={`${BASE_BUTTON_CLASS} ${
          !canUseServerRunActions ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'
        }`}
      >
        <HiOutlineLightningBolt className="w-4 h-4" />
        {t('campaignBuilder.runNow')}
      </button>
      <button
        onClick={onOpenSchedule}
        disabled={!canUseServerRunActions}
        title={!canUseServerRunActions ? serverRunActionsDisabledHint : undefined}
        className={`${BASE_BUTTON_CLASS} ${
          !canUseServerRunActions ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
        }`}
      >
        <HiOutlineClock className="w-4 h-4" />
        {t('campaignBuilder.schedule')}
      </button>
      <button
        onClick={onRunCampaign}
        disabled={isRunning}
        className={`${BASE_BUTTON_CLASS} ${
          isRunning ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-green-500 text-white hover:bg-green-600'
        }`}
      >
        <HiOutlinePlay className="w-4 h-4" />
        {t('campaignBuilder.testRun')}
      </button>
      <button
        onClick={onStopRun}
        disabled={!isRunning}
        className={`${BASE_BUTTON_CLASS} ${
          !isRunning ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-red-500 text-white hover:bg-red-600'
        }`}
      >
        <HiOutlineStop className="w-4 h-4" />
        {t('campaignBuilder.stop')}
      </button>
      <button
        onClick={onOpenNameModal}
        className={`${BASE_BUTTON_CLASS} bg-primary-500 text-white hover:bg-primary-600`}
      >
        <HiOutlineSave className="w-4 h-4" />
        {t('campaignBuilder.save')}
      </button>
      {canShare && (
        <button
          onClick={onOpenShare}
          disabled={!canUseServerRunActions}
          title={!canUseServerRunActions ? serverRunActionsDisabledHint : undefined}
          className={`${BASE_BUTTON_CLASS} ${
            !canUseServerRunActions ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          <HiOutlineMail className="w-4 h-4" />
          {t('campaignBuilder.share')}
        </button>
      )}
      <button
        onClick={onOpenDuplicate}
        disabled={!canUseServerRunActions}
        title={!canUseServerRunActions ? serverRunActionsDisabledHint : undefined}
        className={`${BASE_BUTTON_CLASS} ${
          !canUseServerRunActions ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
        }`}
      >
        <HiOutlineDuplicate className="w-4 h-4" />
        {t('campaignBuilder.duplicate')}
      </button>
    </div>
  );
};

export default CampaignBuilderToolbar;
