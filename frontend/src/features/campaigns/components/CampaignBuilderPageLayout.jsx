import { useState } from 'react';
import { useI18n } from '../../../i18n';
import {
  HiOutlineArrowLeft,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineChevronDown,
  HiOutlineLockClosed,
  HiOutlineSearch,
  HiOutlineX,
} from 'react-icons/hi';
import { getCampaignTypeMeta } from '../../../utils/campaignTypeDisplay';
import {
  CampaignNameModal,
  ConfirmModal,
  FlowCanvas,
} from './CampaignBuilderLayout';
import CampaignBuilderToolbar from './CampaignBuilderToolbar';
import NodeConfigModal from './NodeConfigModal';
import { nodeConfigs } from './CampaignBuilderFlowNodes';
import { Link } from 'react-router-dom';
import { formatCampaignDateTime } from '../utils/campaignDateTime.helpers';
import { getRunPauseI18nKey } from '../utils/campaignQuotaPause.helpers';
import { isComingSoonNodeType } from '../utils/comingSoonNodes';

/**
 * Số thứ tự cho mỗi node trên palette, đánh theo thứ tự thực thi gợi ý:
 *   Triggers → Zalo (account / friends / groups) → Data → Logic → Actions.
 * Thứ tự thay đổi theo từng loại chiến dịch (email / zalo / zalo_group) — mỗi
 * loại có một dãy số riêng bắt đầu từ 1, giúp người dùng đọc trực quan thứ tự
 * thả node khi dựng flow.
 */
const buildPaletteOrderByCampaignType = (campaignType) => {
  const triggers = nodeConfigs.triggers;
  const logic = nodeConfigs.logic;
  const zaloNodes = nodeConfigs.zalo || [];
  const selectZalo = zaloNodes.find((n) => n.type === 'select_zalo_account');
  const getAllFriends = zaloNodes.find((n) => n.type === 'get_all_friends');
  const getAllGroups = zaloNodes.find((n) => n.type === 'get_all_groups');

  const normalizedType = String(campaignType || '').trim().toLowerCase();

  // Email: chỉ dùng common data + email action; không có node zalo.
  if (normalizedType === 'email') {
    return [...triggers, ...nodeConfigs.data, ...logic, ...nodeConfigs.actions];
  }

  // WhatsApp (PR-W4b): trigger → data chung → logic → khối gửi WhatsApp.
  if (normalizedType === 'whatsapp') {
    const actions = nodeConfigs.actions.filter((n) => n.type === 'send_whatsapp');
    return [...triggers, ...nodeConfigs.data, ...logic, ...actions];
  }

  // Zalo (cả cá nhân lẫn nhóm — hộp tạo chỉ còn một thẻ Zalo): trigger → chọn TK → lấy bạn bè → lấy nhóm → data → logic →
  // action zalo cá nhân / kết bạn / nhóm. Loại `zalo` và `zalo_group` do server suy từ sơ đồ nên dùng chung một bảng khối.
  if (normalizedType === 'zalo' || normalizedType === 'zalo_personal'
      || normalizedType === 'zalo-individual' || normalizedType === 'zalo_individual'
      || normalizedType === 'zalo-group' || normalizedType === 'zalo_group' || normalizedType === 'group_zalo') {
    const zaloFlow = [selectZalo, getAllFriends, getAllGroups].filter(Boolean);
    const actions = nodeConfigs.actions.filter(
      (n) => n.type === 'send_zalo_personal' || n.type === 'send_zalo_friend_request' || n.type === 'send_zalo_group'
    );
    return [...triggers, ...zaloFlow, ...nodeConfigs.data, ...logic, ...actions];
  }

  // Telegram (PR-E1): chỉ trigger → logic → khối gửi Telegram (khối tự lấy người nhận, không có node dữ liệu).
  if (normalizedType === 'telegram' || normalizedType === 'telegram_group') {
    const actions = nodeConfigs.actions.filter((n) => n.type === 'send_telegram');
    return [...triggers, ...logic, ...actions];
  }

  // Fallback: giữ thứ tự gộp đầy đủ (mọi node đều có số, không hiển thị '-').
  return [
    ...triggers,
    ...(selectZalo ? [selectZalo] : []),
    ...(getAllFriends ? [getAllFriends] : []),
    ...(getAllGroups ? [getAllGroups] : []),
    ...nodeConfigs.data,
    ...logic,
    ...nodeConfigs.actions,
  ];
};

const buildNodeOrderIndex = (campaignType) => {
  const order = buildPaletteOrderByCampaignType(campaignType);
  return order.reduce((acc, node, index) => {
    acc[node.type] = index + 1;
    return acc;
  }, {});
};

const NodePaletteItem = ({ node, orderIndex, onDragStart, lockedChannel = null, onLockedClick }) => {
  const { t, locale } = useI18n();
  const hasOrder = typeof orderIndex === 'number' || (typeof orderIndex === 'string' && orderIndex !== '-');
  const nodeLabel = locale === 'vi' ? node.nameVi : node.name;
  const body = (
    <>
      <span
        className="shrink-0 w-5 h-5 sm:w-5 sm:h-5 rounded bg-slate-50 dark:bg-dk-raised text-slate-400 dark:text-dk-text2 text-[10px] font-medium flex items-center justify-center tabular-nums border border-slate-200/70 dark:border-dk-border/70"
        title={hasOrder ? 'Thứ tự gợi ý' : ''}
      >
        {orderIndex}
      </span>
      <div
        className="w-7 h-7 sm:w-8 sm:h-8 rounded flex items-center justify-center shrink-0"
        style={{ backgroundColor: node.bgColor }}
      >
        <node.icon className="w-4 h-4" style={{ color: node.iconColor }} />
      </div>
      <span className="text-sm text-gray-700 dark:text-dk-text leading-5 truncate">
        {nodeLabel}
      </span>
    </>
  );

  // Khối máy chủ chưa chạy thật (Điều kiện, Cập nhật thông tin): thẻ mờ, KHÔNG kéo thả được, không có hành động bấm. Nhãn "Sắp có" nằm DƯỚI
  // tên khối (không chung hàng) để tên không bị cắt thành "Điều ki…" trong thanh bên hẹp.
  if (isComingSoonNodeType(node.type)) {
    return (
      <div
        aria-disabled="true"
        data-testid={`palette-node-${node.type}`}
        data-coming-soon="true"
        title={t('campaignBuilder.comingSoon.tip')}
        className="flex cursor-not-allowed items-center gap-2 rounded-lg px-2.5 py-1.5 opacity-60 sm:gap-2.5 sm:px-3 sm:py-2"
      >
        <span className="shrink-0 w-5 h-5 rounded bg-slate-50 dark:bg-dk-raised text-slate-400 dark:text-dk-text2 text-[10px] font-medium flex items-center justify-center tabular-nums border border-slate-200/70 dark:border-dk-border/70">
          {orderIndex}
        </span>
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: node.bgColor }}>
          <node.icon className="w-4 h-4" style={{ color: node.iconColor }} />
        </div>
        <div className="min-w-0">
          <span className="block truncate text-sm leading-5 text-gray-700 dark:text-dk-text">{nodeLabel}</span>
          <span className="mt-0.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold leading-none text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" data-testid={`palette-coming-soon-${node.type}`}>
            {t('campaignBuilder.comingSoon.badge')}
          </span>
        </div>
      </div>
    );
  }

  // Bước của kênh chưa dùng được (11/10/2026, PLAN_KENH_KHONG_AN_KHOA_VA_GOI_Y_MUA): vẫn hiện nhưng mờ + khoá, KHÔNG kéo thả
  // được (không `draggable`), bấm mở modal giải thích + gợi ý mua. Chiến dịch cũ đã có node này trên canvas giữ nguyên.
  if (lockedChannel) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-disabled="true"
        data-testid={`palette-node-${node.type}`}
        data-locked-channel={lockedChannel}
        title={t('channelUnavailable.lockedTip', { channel: nodeLabel })}
        onClick={() => onLockedClick?.(lockedChannel)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onLockedClick?.(lockedChannel);
          }
        }}
        className="flex items-center px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-dk-raised/60 cursor-pointer opacity-60 transition-colors gap-2 sm:gap-2.5"
      >
        {body}
        <HiOutlineLockClosed className="ml-auto w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-dk-muted" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div
      draggable
      data-testid={`palette-node-${node.type}`}
      onDragStart={(e) => onDragStart(e, node.type, node)}
      className="flex items-center px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-dk-raised/60 cursor-grab active:cursor-grabbing transition-colors gap-2 sm:gap-2.5"
    >
      {body}
    </div>
  );
};

const CampaignBuilderPageLayout = ({
  campaignName,
  campaignStatus,
  isDirty,
  lastSavedTime,
  onBackToCampaigns,
  onOpenNameModal,
  /**
   * Gửi thật trên máy chủ (mọi lần gửi đều đi qua chiến dịch, có lịch sử lượt chạy).
   * Không truyền (hoặc `canUseServerRunActions=false`) thì 2 nút này không hiện.
   */
  onRunNow,
  onOpenSchedule,
  canUseServerRunActions = false,
  serverRunActionsDisabledHint = '',
  viewTabs = null,
  /** 'settings' | 'flow' — tab đang mở; 'settings' vẽ `settingsPanel` thay cho palette + canvas. */
  activeTab = 'flow',
  settingsPanel = null,
  onOpenShare,
  canShare = false,
  onOpenDuplicate,
  builderSidebarWidth,
  searchTerm,
  setSearchTerm,
  toggleCategory,
  expandedCategories,
  filterNodes,
  allowedActionNodeTypes,
  zaloEnabled = true,
  /** { [nodeType]: 'email'|'zalo'|'telegram'|'whatsapp' } — node của kênh chưa dùng được: vẽ mờ + khoá (xem NodePaletteItem). */
  lockedNodeChannels = {},
  /** (channel) => void — bấm node bị khoá thì mở modal gợi ý mua. */
  onLockedNodeClick,
  allowedDataNodeTypes,
  /** Khi true — ẩn «Lấy danh sách bạn bè Zalo» khỏi palette (đang bật pool đa TK) */
  suppressGetAllFriendsPalette = false,
  onDragStart,
  isResizingBuilderSidebar,
  onBuilderSidebarResizeStart,
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onEdgeClick,
  onPaneClick,
  selectedNode,
  selectedEdgeId,
  setNodes,
  setEdges,
  campaignType,
  getAllowedActionNodeTypesByCampaignType,
  getAllowedDataNodeTypesByCampaignType,
  isTriggerNodeType,
  nodeDropOffsetX,
  nodeDropOffsetY,
  nodeTypes,
  edgeTypes,
  setSelectedNode,
  canCopySelectedNode,
  canPasteNode,
  onCopyNode,
  onPasteNode,
  onDeleteNode,
  setNodeToConfig,
  setShowConfigModal,
  activePause = null,
  showNameModal,
  setShowNameModal,
  onNameModalPrimary,
  setCampaignName,
  setCampaignType,
  isNewCampaign,
  campaignDescription,
  setCampaignDescription,
  showDeleteModal,
  setShowDeleteModal,
  onConfirmDeleteNode,
  deleteNodeName: _deleteNodeName,
  showConfigModal,
  nodeToConfig,
  onNodeConfigSave,
  checkSheetConnection,
  emailTemplates,
  zaloTemplates,
  emailSettings,
  campaignId,
  showLeaveConfirmModal,
  onCloseLeaveConfirmModal,
  onConfirmLeaveBuilder,
  leaveModalTitle,
  leaveModalMessage,
}) => {
  const { t } = useI18n();
  const campaignTypeMeta = getCampaignTypeMeta(campaignType);
  const [isNodeMenuCollapsed, setIsNodeMenuCollapsed] = useState(false);
  const effectiveBuilderSidebarWidth = isNodeMenuCollapsed ? 52 : builderSidebarWidth;
  const NODE_ORDER_INDEX = buildNodeOrderIndex(campaignType);
  const normalizedCampaignType = String(campaignType || '').trim().toLowerCase();
  // Campaign Email không có node Zalo → ẩn cả section Zalo để palette không
  // hiển thị category rỗng / gây hiểu nhầm.
  // P12 — gói không có kênh Zalo: cũng ẩn section Zalo (select_zalo_account, get_all_friends/groups chỉ phục vụ Zalo).
  const showZaloSection = zaloEnabled && normalizedCampaignType !== 'email';
  const showingSettings = activeTab === 'settings' && Boolean(settingsPanel);

  return (
    <div className="h-full min-h-0 w-full min-w-0 overflow-hidden flex flex-col bg-white dark:bg-dk-inset">
    <div className="bg-white dark:bg-dk-surface border-b border-gray-200 dark:border-dk-border px-2.5 sm:px-4 py-2.5 sm:py-3">
      <div className="flex flex-wrap items-start justify-between gap-2.5 sm:gap-3">
        <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
          <button onClick={onBackToCampaigns} className="p-2 hover:bg-gray-100 dark:hover:bg-dk-raised rounded-lg transition-colors">
            <HiOutlineArrowLeft className="w-5 h-5 text-gray-600 dark:text-dk-text" />
          </button>
          <div className="min-w-0">
            <div className="text-sm text-gray-500 dark:text-dk-text2 flex items-center gap-2 min-w-0">
              <span className="font-medium text-primary-600 dark:text-primary-400 truncate">{campaignName || t('campaignBuilder.newCampaign')}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium border ${campaignTypeMeta.className}`}>
                {campaignTypeMeta.label}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                campaignStatus === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300'
                  : campaignStatus === 'paused' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/60 dark:text-yellow-300'
                    : 'bg-gray-100 text-gray-700 dark:bg-dk-raised dark:text-dk-text'
              }`}>
                {campaignStatus === 'active' ? t('campaignBuilder.active')
                  : campaignStatus === 'paused' ? t('campaignBuilder.paused')
                    : t('campaignBuilder.draft')}
              </span>
            </div>
            <div className="text-xs text-gray-400 dark:text-dk-muted mt-1">
              {isDirty ? (
                <span className="text-amber-600 dark:text-amber-400 font-medium">{t('campaignBuilder.unsaved')}</span>
              ) : lastSavedTime ? (
                <>
                  <span className="text-green-600 dark:text-green-400 font-medium">✓ {t('campaignBuilder.saved')}</span>
                  <span className="mx-1">—</span>
                  <span>{formatCampaignDateTime(lastSavedTime)}</span>
                </>
              ) : (
                <span className="text-amber-600 dark:text-amber-400 font-medium">{t('campaignBuilder.unsaved')}</span>
              )}
            </div>
          </div>
        </div>
        <CampaignBuilderToolbar
          onRunNow={onRunNow}
          onOpenSchedule={onOpenSchedule}
          canUseServerRunActions={canUseServerRunActions}
          serverRunActionsDisabledHint={serverRunActionsDisabledHint}
          onOpenNameModal={onOpenNameModal}
          isDirty={isDirty}
          onOpenShare={onOpenShare}
          canShare={canShare}
          onOpenDuplicate={onOpenDuplicate}
        />
      </div>
    </div>

    {viewTabs && (
      <div className="bg-white dark:bg-dk-surface border-b border-gray-200 dark:border-dk-border px-2.5 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2" data-testid="campaign-builder-view-tabs">
        {viewTabs}
      </div>
    )}

    <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden flex-col">
      {showingSettings ? settingsPanel : (
      <div className="flex flex-1 min-h-0 min-w-0 h-full overflow-hidden">
        <div
          className="bg-white dark:bg-dk-surface border-r border-gray-200 dark:border-dk-border flex flex-col min-h-0 h-full overflow-hidden"
          style={{ width: `${effectiveBuilderSidebarWidth}px` }}
        >
          {isNodeMenuCollapsed ? (
            <div className="p-2 flex justify-center">
              <button
                onClick={() => setIsNodeMenuCollapsed(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dk-raised text-gray-600 dark:text-dk-text transition-colors"
                title={t('campaignBuilder.expandNodeMenu')}
              >
                <HiOutlineChevronRight className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div className="p-2.5 sm:p-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-dk-muted" />
                  <input
                    type="text"
                    placeholder={t('campaignBuilder.search')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-raised text-gray-900 dark:text-dk-text rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-gray-400 dark:placeholder:text-dk-muted"
                  />
                </div>
                <button
                  onClick={() => setIsNodeMenuCollapsed(true)}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dk-raised text-gray-600 dark:text-dk-text transition-colors"
                  title={t('campaignBuilder.collapseNodeMenu')}
                >
                  <HiOutlineChevronLeft className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {!isNodeMenuCollapsed && (
            <div className="flex-1 min-h-0 overflow-y-auto px-2.5 sm:px-3 pb-2.5 sm:pb-3">
            {/* Hint: thứ tự thực thi gợi ý — số ở đầu mỗi node trong palette. */}
            <div className="mb-3 px-2 py-1.5 rounded-md bg-slate-50 dark:bg-dk-raised/50 border border-slate-100 dark:border-dk-border text-[11px] text-slate-500 dark:text-dk-text2 leading-relaxed">
              {t('campaignBuilder.paletteOrderHint')}
            </div>

            <div className="mb-2">
              <button
                onClick={() => toggleCategory('Triggers')}
                className="w-full flex items-center justify-between py-2 text-sm font-semibold text-gray-800 dark:text-dk-text"
              >
                <span>{t('campaignBuilder.triggers')}</span>
                <HiOutlineChevronDown className={`w-4 h-4 transition-transform ${expandedCategories.includes('Triggers') ? '' : '-rotate-90'}`} />
              </button>
              {expandedCategories.includes('Triggers') && (
                <div className="space-y-1">
                  {filterNodes(nodeConfigs.triggers).map((node) => (
                    <NodePaletteItem
                      key={node.type}
                      node={node}
                      orderIndex={NODE_ORDER_INDEX[node.type] ?? '-'}
                      onDragStart={onDragStart}
                    />
                  ))}
                </div>
              )}
            </div>

            {showZaloSection && (
            <div className="mb-2">
              <button
                onClick={() => toggleCategory('Zalo')}
                className="w-full flex items-center justify-between py-2 text-sm font-semibold text-gray-800 dark:text-dk-text"
              >
                <span>{t('campaignBuilder.zalo')}</span>
                <HiOutlineChevronDown className={`w-4 h-4 transition-transform ${expandedCategories.includes('Zalo') ? '' : '-rotate-90'}`} />
              </button>
              {expandedCategories.includes('Zalo') && (
                <div className="space-y-1">
                  {filterNodes(nodeConfigs.zalo.filter((node) => {
                    if (allowedDataNodeTypes && !allowedDataNodeTypes.has(node.type)) return false;
                    if (suppressGetAllFriendsPalette && node.type === 'get_all_friends') return false;
                    return true;
                  })).map((node) => (
                    <NodePaletteItem
                      key={node.type}
                      node={node}
                      orderIndex={NODE_ORDER_INDEX[node.type] ?? '-'}
                      onDragStart={onDragStart}
                      lockedChannel={lockedNodeChannels[node.type] || null}
                      onLockedClick={onLockedNodeClick}
                    />
                  ))}
                </div>
              )}
            </div>
            )}

            <div className="mb-2">
              <button
                onClick={() => toggleCategory('Data')}
                className="w-full flex items-center justify-between py-2 text-sm font-semibold text-gray-800 dark:text-dk-text"
              >
                <span>{t('campaignBuilder.data')}</span>
                <HiOutlineChevronDown className={`w-4 h-4 transition-transform ${expandedCategories.includes('Data') ? '' : '-rotate-90'}`} />
              </button>
              {expandedCategories.includes('Data') && (
                <div className="space-y-1">
                  {filterNodes(nodeConfigs.data.filter((node) => {
                    if (allowedDataNodeTypes && !allowedDataNodeTypes.has(node.type)) return false;
                    return true;
                  })).map((node) => (
                    <NodePaletteItem
                      key={node.type}
                      node={node}
                      orderIndex={NODE_ORDER_INDEX[node.type] ?? '-'}
                      onDragStart={onDragStart}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="mb-2">
              <button
                onClick={() => toggleCategory('Logic')}
                className="w-full flex items-center justify-between py-2 text-sm font-semibold text-gray-800 dark:text-dk-text"
              >
                <span>{t('campaignBuilder.logic')}</span>
                <HiOutlineChevronDown className={`w-4 h-4 transition-transform ${expandedCategories.includes('Logic') ? '' : '-rotate-90'}`} />
              </button>
              {expandedCategories.includes('Logic') && (
                <div className="space-y-1">
                  {filterNodes(nodeConfigs.logic).map((node) => (
                    <NodePaletteItem
                      key={node.type}
                      node={node}
                      orderIndex={NODE_ORDER_INDEX[node.type] ?? '-'}
                      onDragStart={onDragStart}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="mb-2">
              <button
                onClick={() => toggleCategory('Actions')}
                className="w-full flex items-center justify-between py-2 text-sm font-semibold text-gray-800 dark:text-dk-text"
              >
                <span>{t('campaignBuilder.actions')}</span>
                <HiOutlineChevronDown className={`w-4 h-4 transition-transform ${expandedCategories.includes('Actions') ? '' : '-rotate-90'}`} />
              </button>
              {expandedCategories.includes('Actions') && (
                <div className="space-y-1">
                  {filterNodes(nodeConfigs.actions.filter((node) => allowedActionNodeTypes.has(node.type))).map((node) => (
                    <NodePaletteItem
                      key={node.type}
                      node={node}
                      orderIndex={NODE_ORDER_INDEX[node.type] ?? '-'}
                      onDragStart={onDragStart}
                      lockedChannel={lockedNodeChannels[node.type] || null}
                      onLockedClick={onLockedNodeClick}
                    />
                  ))}
                </div>
              )}
            </div>
            </div>
          )}
        </div>

        {!isNodeMenuCollapsed && (
          <div
            className={`h-full w-2 cursor-col-resize transition-colors ${
              isResizingBuilderSidebar ? 'bg-primary-100 dark:bg-primary-950/60' : 'hover:bg-primary-50 dark:hover:bg-primary-950/30'
            }`}
            onMouseDown={onBuilderSidebarResizeStart}
            role="separator"
            aria-orientation="vertical"
            title={t('campaignBuilder.dragToResize')}
          >
            <div className="mx-auto h-full w-px bg-gray-200 dark:bg-dk-raised" />
          </div>
        )}

        <FlowCanvas
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          selectedNode={selectedNode}
          selectedEdgeId={selectedEdgeId}
          setNodes={setNodes}
          setEdges={setEdges}
          campaignType={campaignType}
          getAllowedActionNodeTypesByCampaignType={getAllowedActionNodeTypesByCampaignType}
          getAllowedDataNodeTypesByCampaignType={getAllowedDataNodeTypesByCampaignType}
          isTriggerNodeType={isTriggerNodeType}
          nodeDropOffsetX={nodeDropOffsetX}
          nodeDropOffsetY={nodeDropOffsetY}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          suppressGetAllFriendsPalette={suppressGetAllFriendsPalette}
        />

        {selectedNode && (
          <div className="w-56 sm:w-60 md:w-64 xl:w-72 max-w-[52vw] bg-white dark:bg-dk-surface border-l border-gray-200 dark:border-dk-border flex flex-col">
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200 dark:border-dk-border">
              <h3 className="font-medium text-gray-900 dark:text-dk-text">{t('campaignBuilder.properties')}</h3>
              <button onClick={() => setSelectedNode(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-dk-raised text-gray-500 dark:text-dk-text2 rounded">
                <HiOutlineX className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 p-3 sm:p-4 space-y-3 sm:space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dk-text mb-1">{t('campaignBuilder.name')}</label>
                <input
                  type="text"
                  value={selectedNode.data.label || ''}
                  onChange={(e) => {
                    const newLabel = e.target.value;
                    setNodes((nds) =>
                      nds.map((n) =>
                        n.id === selectedNode.id ? { ...n, data: { ...n.data, label: newLabel } } : n
                      )
                    );
                    setSelectedNode((prev) => ({ ...prev, data: { ...prev.data, label: newLabel } }));
                  }}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-raised text-gray-900 dark:text-dk-text rounded-lg text-sm focus:ring-2 focus:ring-primary-500 placeholder:text-gray-400 dark:placeholder:text-dk-muted"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dk-text mb-1">{t('campaignBuilder.type')}</label>
                <p className="text-sm text-gray-500 dark:text-dk-text2 capitalize">{selectedNode.data.nodeType || selectedNode.type}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dk-text mb-1">{t('campaignBuilder.id')}</label>
                <p className="text-sm text-gray-500 dark:text-dk-text2 font-mono">{selectedNode.id}</p>
              </div>
              <button
                onClick={() => {
                  setNodeToConfig(selectedNode);
                  setShowConfigModal(true);
                }}
                className="w-full px-4 py-2 bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 text-sm font-medium rounded-lg hover:bg-primary-100 dark:hover:bg-primary-950/70 transition-colors"
              >
                {t('campaignBuilder.configureDetails')}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onCopyNode}
                  disabled={!canCopySelectedNode}
                  title={canCopySelectedNode
                    ? t('campaignBuilder.copyShortcut')
                    : t('campaignBuilder.cannotCopyTrigger')}
                  className="px-3 py-2 bg-gray-50 dark:bg-dk-raised text-gray-700 dark:text-dk-text text-sm font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-dk-strong transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('campaignBuilder.copyNode')}
                </button>
                <button
                  type="button"
                  onClick={onPasteNode}
                  disabled={!canPasteNode}
                  title={t('campaignBuilder.pasteShortcut')}
                  className="px-3 py-2 bg-gray-50 dark:bg-dk-raised text-gray-700 dark:text-dk-text text-sm font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-dk-strong transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('campaignBuilder.pasteNode')}
                </button>
              </div>
              <p className="text-xs text-gray-400 dark:text-dk-muted">{t('campaignBuilder.copyPasteHint')}</p>
              <button
                onClick={onDeleteNode}
                className="w-full px-4 py-2 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-sm font-medium rounded-lg hover:bg-red-100 dark:hover:bg-red-950/70 transition-colors"
              >
                {t('campaignBuilder.deleteNode')}
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {activePause && (
        <div className="flex-none px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-t border-b border-amber-200 dark:border-amber-900/60 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
            <span>
              {t(getRunPauseI18nKey(activePause), {
                until: formatCampaignDateTime(activePause.untilIso),
                account: activePause.accountName || t('campaignRun.zaloAccountFallback'),
              })}
            </span>
          </div>
          {activePause.kind === 'plan_quota' && (
            <Link
              to="/app/topup"
              className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 hover:underline"
            >
              {t('campaignRun.buyTopup')}
            </Link>
          )}
        </div>
      )}

    </div>

    <CampaignNameModal
      isOpen={showNameModal}
      onClose={() => setShowNameModal(false)}
      onPrimary={onNameModalPrimary}
      title={isNewCampaign ? t('campaignBuilder.createCampaign') : t('campaignBuilder.editCampaignInfo')}
      primaryLabel={t('campaignBuilder.save')}
      campaignName={campaignName}
      setCampaignName={setCampaignName}
      campaignType={campaignType}
      setCampaignType={setCampaignType}
      isTypeLocked={!isNewCampaign}
      campaignDescription={campaignDescription}
      setCampaignDescription={setCampaignDescription}
    />

    <ConfirmModal
      isOpen={showDeleteModal}
      onClose={() => setShowDeleteModal(false)}
      onConfirm={onConfirmDeleteNode}
      title={t('campaignBuilder.confirmDeleteNode')}
      message={t('campaignBuilder.confirmDeleteNodeMessage')}
      confirmLabel={t('campaignBuilder.deleteNode')}
      confirmButtonClassName="bg-red-500 text-white hover:bg-red-600"
    />

    <ConfirmModal
      isOpen={showLeaveConfirmModal}
      onClose={onCloseLeaveConfirmModal}
      onConfirm={onConfirmLeaveBuilder}
      title={leaveModalTitle}
      message={leaveModalMessage}
      confirmLabel={t('campaignBuilder.exitPage')}
      cancelLabel={t('campaignBuilder.stay')}
      confirmButtonClassName="bg-primary-500 text-white hover:bg-primary-600"
      iconClassName="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0"
      iconColorClassName="w-6 h-6 text-amber-600"
    />

    <NodeConfigModal
      isOpen={showConfigModal}
      onClose={() => {
        setShowConfigModal(false);
        setNodeToConfig(null);
      }}
      node={nodeToConfig}
      onSave={onNodeConfigSave}
      onCheckSheetConnection={checkSheetConnection}
      emailTemplates={emailTemplates}
      zaloTemplates={zaloTemplates}
      emailSettings={emailSettings}
      nodes={nodes}
      edges={edges}
      campaignId={campaignId}
      campaignType={campaignType}
    />
  </div>
  );
};

export default CampaignBuilderPageLayout;
