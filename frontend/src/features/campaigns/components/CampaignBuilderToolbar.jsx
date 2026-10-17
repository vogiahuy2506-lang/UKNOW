import { useEffect, useRef, useState } from 'react';
import {
  HiOutlineClock,
  HiOutlineDotsHorizontal,
  HiOutlineDuplicate,
  HiOutlineLightningBolt,
  HiOutlineMail,
  HiOutlinePlay,
  HiOutlineSave,
  HiOutlineStop,
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';

const BASE_BUTTON_CLASS = 'px-2.5 sm:px-4 py-1.5 sm:py-2 text-sm sm:text-base rounded-lg transition-colors flex items-center gap-1.5 sm:gap-2';
const DISABLED_CLASS = 'bg-gray-200 dark:bg-dk-raised text-gray-500 dark:text-dk-muted cursor-not-allowed';
const SECONDARY_CLASS = 'bg-white dark:bg-dk-raised text-gray-700 dark:text-dk-text border border-gray-300 dark:border-dk-border hover:bg-gray-50 dark:hover:bg-dk-strong';

/**
 * Menu "⋯" của thanh nút: gom hành động ít dùng (Chia sẻ, Nhân bản) cho thanh trên gọn. Đóng khi bấm ra ngoài / Esc,
 * mũi tên lên-xuống đi giữa các mục, Esc trả tiêu điểm về nút mở.
 */
const OverflowMenu = ({ items, label }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const itemRefs = useRef([]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) itemRefs.current.find((node) => node && !node.disabled)?.focus();
  }, [open]);

  const close = (restoreFocus) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const onMenuKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const enabled = itemRefs.current.filter((node) => node && !node.disabled);
    if (enabled.length === 0) return;
    const index = enabled.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown' ? (index + 1) % enabled.length : (index - 1 + enabled.length) % enabled.length;
    enabled[next].focus();
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.stopPropagation();
            close(true);
          }
        }}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="campaign-more-actions"
        className={`${BASE_BUTTON_CLASS} ${SECONDARY_CLASS} !px-2.5`}
      >
        <HiOutlineDotsHorizontal className="w-5 h-5" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-30 mt-1 min-w-[11rem] rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-dk-border dark:bg-dk-surface"
        >
          {items.map((item, index) => (
            <button
              key={item.key}
              ref={(node) => { itemRefs.current[index] = node; }}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              title={item.title}
              onClick={() => {
                close(false);
                item.onSelect();
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                item.disabled
                  ? 'cursor-not-allowed text-gray-400 dark:text-dk-muted'
                  : 'text-gray-700 hover:bg-gray-50 dark:text-dk-text dark:hover:bg-dk-raised'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Nhóm nút của trình dựng chiến dịch (thanh trên, dùng chung hai tab): Lưu · Lên lịch · Chạy ngay · ⋯ (Chia sẻ, Nhân bản).
 * "Chạy thử" / "Dừng" KHÔNG ở đây nữa — xem `FlowRunControls` (chỉ tab Sơ đồ khối).
 *
 * Tách khỏi CampaignBuilderPageLayout để test được TỪNG nút gọi đúng hàm nào. Đúng chỗ nguy hiểm nhất: "Chạy ngay"
 * gửi thật cho khách — nối nhầm là tin đã đi rồi mới biết.
 *
 * @param {object} props
 * @param {() => void} props.onRunNow gửi thật trên máy chủ
 * @param {() => void} props.onOpenSchedule mở hộp lên lịch
 * @param {boolean} props.canUseServerRunActions chiến dịch đã lưu lần nào chưa
 * @param {string} props.serverRunActionsDisabledHint tooltip khi các nút cần bản đã lưu bị vô hiệu
 * @param {() => void} props.onOpenNameModal mở hộp lưu
 * @param {boolean} [props.isDirty=false] có thay đổi chưa lưu — nút Lưu nổi màu chính; đã lưu thì kiểu phụ nhạt (vẫn bấm được)
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
  onOpenNameModal,
  isDirty = false,
  onOpenShare,
  canShare = false,
  onOpenDuplicate,
}) => {
  const { t } = useI18n();
  const serverHint = !canUseServerRunActions ? serverRunActionsDisabledHint : undefined;

  const menuItems = [
    ...(canShare
      ? [{
        key: 'share',
        label: t('campaignBuilder.share'),
        icon: <HiOutlineMail className="w-4 h-4" aria-hidden="true" />,
        disabled: !canUseServerRunActions,
        title: serverHint,
        onSelect: onOpenShare,
      }]
      : []),
    {
      key: 'duplicate',
      label: t('campaignBuilder.duplicate'),
      icon: <HiOutlineDuplicate className="w-4 h-4" aria-hidden="true" />,
      disabled: !canUseServerRunActions,
      title: serverHint,
      onSelect: onOpenDuplicate,
    },
  ];

  return (
    <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
      <button
        onClick={onOpenNameModal}
        data-testid="campaign-save-button"
        data-emphasis={isDirty ? 'primary' : 'secondary'}
        className={`${BASE_BUTTON_CLASS} ${isDirty ? 'bg-primary-500 text-white hover:bg-primary-600' : SECONDARY_CLASS}`}
      >
        <HiOutlineSave className="w-4 h-4" />
        {t('campaignBuilder.save')}
      </button>
      <button
        onClick={onOpenSchedule}
        disabled={!canUseServerRunActions}
        title={serverHint}
        className={`${BASE_BUTTON_CLASS} ${!canUseServerRunActions ? DISABLED_CLASS : SECONDARY_CLASS}`}
      >
        <HiOutlineClock className="w-4 h-4" />
        {t('campaignBuilder.schedule')}
      </button>
      <button
        onClick={onRunNow}
        disabled={!canUseServerRunActions}
        title={serverHint}
        className={`${BASE_BUTTON_CLASS} ${!canUseServerRunActions ? DISABLED_CLASS : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
      >
        <HiOutlineLightningBolt className="w-4 h-4" />
        {t('campaignBuilder.runNow')}
      </button>
      <OverflowMenu items={menuItems} label={t('campaignBuilder.moreActions')} />
    </div>
  );
};

/**
 * "Chạy thử" / "Dừng" — chỉ trong trình duyệt để xem trước, KHÔNG gửi thật. Nằm ở thanh của tab Sơ đồ khối (không ở thanh
 * trên) để không ai nhầm với "Chạy ngay". "Dừng" thay chỗ "Chạy thử" khi đang chạy thử.
 *
 * @param {object} props
 * @param {() => void} props.onRunCampaign chạy THỬ trong trình duyệt
 * @param {boolean} props.isRunning đang chạy thử
 * @param {() => void} props.onStopRun dừng chạy thử
 */
export const FlowRunControls = ({ onRunCampaign, isRunning, onStopRun }) => {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2" data-testid="flow-run-controls">
      {isRunning ? (
        <button
          onClick={onStopRun}
          className={`${BASE_BUTTON_CLASS} bg-red-500 text-white hover:bg-red-600 !py-1.5 !text-sm`}
        >
          <HiOutlineStop className="w-4 h-4" />
          {t('campaignBuilder.stop')}
        </button>
      ) : (
        <button
          onClick={onRunCampaign}
          className={`${BASE_BUTTON_CLASS} bg-green-500 text-white hover:bg-green-600 !py-1.5 !text-sm`}
        >
          <HiOutlinePlay className="w-4 h-4" />
          {t('campaignBuilder.testRun')}
        </button>
      )}
    </div>
  );
};

export default CampaignBuilderToolbar;
