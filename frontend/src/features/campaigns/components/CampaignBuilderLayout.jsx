import { useCallback, useMemo, useRef } from 'react';
import ReactFlow, { Background, Controls, MarkerType, MiniMap, useReactFlow } from 'reactflow';
import toast from 'react-hot-toast';
import { HiOutlineExclamationCircle, HiOutlineX } from 'react-icons/hi';
import FullScreenOverlay from '../../../components/FullScreenOverlay';
import { useI18n } from '../../../i18n';
import { useThemeStore } from '../../../stores/themeStore';
import { isLogicNodeType } from '../utils/campaignBuilderFlow';
import { createBuilderNode } from '../utils/createBuilderNode';

export const CampaignNameModal = ({
  isOpen,
  onClose,
  onPrimary,
  title,
  primaryLabel,
  campaignName,
  setCampaignName,
  campaignType,
  setCampaignType,
  isTypeLocked = false,
  campaignDescription,
  setCampaignDescription,
}) => {
  const { t } = useI18n();
  if (!isOpen) return null;

  return (
    <FullScreenOverlay isOpen={isOpen}>
      <div className="bg-white dark:bg-dk-surface rounded-xl shadow-xl w-full max-w-md mx-4 border border-transparent dark:border-dk-border">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dk-border">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dk-text">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-dk-raised text-gray-500 dark:text-dk-text2 rounded-lg">
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dk-text mb-1">{t('campaignBuilder.campaignName')}</label>
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dk-border bg-white dark:bg-dk-raised text-gray-900 dark:text-dk-text rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder={t('campaignBuilder.campaignNamePlaceholder')}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dk-text mb-1">{t('campaignBuilder.description')}</label>
            <textarea
              value={campaignDescription}
              onChange={(e) => setCampaignDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dk-border bg-white dark:bg-dk-raised text-gray-900 dark:text-dk-text rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
              placeholder={t('campaignBuilder.descriptionPlaceholder')}
              rows={4}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dk-text mb-1">{t('campaignBuilder.campaignType')}</label>
            <select
              value={campaignType}
              onChange={(e) => setCampaignType?.(e.target.value)}
              disabled={isTypeLocked}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dk-border bg-white dark:bg-dk-raised text-gray-900 dark:text-dk-text rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-dk-raised/60 disabled:text-gray-500 dark:disabled:text-dk-text2"
            >
              <option value="email">{t('campaignBuilder.email')}</option>
              {/* PLAN_THU_CONG_GOP_4_KENH — chỉ một lựa chọn Zalo; 'zalo_group' (loại server suy khi sơ đồ chỉ có khối nhóm) hiện đúng nhãn của nó. */}
              <option value="zalo">{t('campaigns.zaloChannel')}</option>
              {campaignType === 'zalo_group' ? <option value="zalo_group">{t('campaignBuilder.zaloGroup')}</option> : null}
              {campaignType === 'telegram' ? <option value="telegram">{t('campaigns.telegram')}</option> : null}
              {campaignType === 'telegram_group' ? <option value="telegram_group">{t('campaigns.telegramGroup')}</option> : null}
              {campaignType === 'whatsapp' ? <option value="whatsapp">{t('campaigns.whatsapp')}</option> : null}
              {campaignType === 'mixed' ? <option value="mixed">{t('campaignBuilder.mixed')}</option> : null}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-dk-border bg-gray-50 dark:bg-dk-bg rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 dark:text-dk-text hover:bg-gray-100 dark:hover:bg-dk-raised rounded-lg transition-colors">
            {t('campaignBuilder.cancel')}
          </button>
          <button
            onClick={onPrimary}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </FullScreenOverlay>
  );
};

export const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  confirmButtonClassName = 'bg-red-500 text-white hover:bg-red-600',
  iconClassName = 'w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0',
  iconColorClassName = 'w-6 h-6 text-red-600',
}) => {
  if (!isOpen) return null;

  return (
    <FullScreenOverlay isOpen={isOpen}>
      <div className="bg-white dark:bg-dk-surface rounded-xl shadow-xl w-full max-w-md mx-4 border border-transparent dark:border-dk-border">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dk-border">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dk-text">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-dk-raised text-gray-500 dark:text-dk-text2 rounded-lg">
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className={iconClassName}>
              <HiOutlineExclamationCircle className={iconColorClassName} />
            </div>
            <p className="text-gray-600 dark:text-dk-text">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-dk-border bg-gray-50 dark:bg-dk-bg rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 dark:text-dk-text hover:bg-gray-100 dark:hover:bg-dk-raised rounded-lg transition-colors">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg transition-colors ${confirmButtonClassName}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </FullScreenOverlay>
  );
};

export const FlowCanvas = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onEdgeClick,
  onPaneClick,
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
  /** Khi flow đã bật pool đa TK Zalo — không cho thả node «Lấy danh sách bạn bè» lên canvas */
  suppressGetAllFriendsPalette = false,
}) => {
  const { t, locale } = useI18n();
  const isDark = useThemeStore((s) => s.isDark);
  const reactFlowWrapper = useRef(null);
  const { project } = useReactFlow();

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const data = JSON.parse(event.dataTransfer.getData('application/reactflow'));
      const nodeType = data?.nodeType;
      const allowedActionTypes = getAllowedActionNodeTypesByCampaignType(campaignType);
      const allowedDataTypes = getAllowedDataNodeTypesByCampaignType(campaignType);
      const isTriggerNode = isTriggerNodeType(nodeType);
      const isActionNode = String(nodeType || '').startsWith('send_');
      // Logic nodes (condition / tag_contact / update_attribute) LUÔN được phép —
      // không phụ thuộc campaign type.
      const isLogicNode = isLogicNodeType(nodeType);
      const isDataNode = !isTriggerNode && !isActionNode && !isLogicNode;
      const isRestrictedDataNode = isDataNode && allowedDataTypes && !allowedDataTypes.has(nodeType);
      if (isActionNode && !allowedActionTypes.has(nodeType)) {
        toast.error(t('campaignBuilder.nodeTypeNotSupported', { type: campaignType?.toUpperCase() }));
        return;
      }
      if (isRestrictedDataNode) {
        toast.error(t('campaignBuilder.nodeTypeNotSupported', { type: campaignType?.toUpperCase() }));
        return;
      }

      if (nodeType === 'get_all_friends' && suppressGetAllFriendsPalette) {
        toast.error(t('campaignBuilder.poolModeGetFriendsWarning'));
        return;
      }

      const position = project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      position.x -= nodeDropOffsetX;
      position.y -= nodeDropOffsetY;

      // Dựng khối bằng hàm dùng chung với tab Thiết lập (`createBuilderNode`): id, tên không trùng, kiểu ReactFlow.
      const newNode = createBuilderNode(nodeType, position, {
        locale,
        nodeData: data?.nodeData || {},
        existingNames: nodes.map((n) => n.data?.label).filter(Boolean),
      });

      if (isTriggerNodeType(nodeType)) {
        const existingTrigger = nodes.find((n) => isTriggerNodeType(n.data?.nodeType || n.type));
        setNodes((nds) => {
          const withoutTriggers = nds.filter((n) => !isTriggerNodeType(n.data?.nodeType || n.type));
          return [...withoutTriggers, newNode];
        });
        if (existingTrigger) {
          setEdges((eds) => eds.map((e) => (e.source === existingTrigger.id ? { ...e, source: newNode.id } : e)));
        }
      } else {
        setNodes((nds) => [...nds, newNode]);
      }
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      campaignType,
      getAllowedActionNodeTypesByCampaignType,
      getAllowedDataNodeTypesByCampaignType,
      isTriggerNodeType,
      locale,
      nodeDropOffsetX,
      nodeDropOffsetY,
      nodes,
      project,
      setEdges,
      setNodes,
      suppressGetAllFriendsPalette,
    ]
  );

  const edgesWithSelection = useMemo(
    () => edges.map((e) => ({ ...e, selected: e.id === selectedEdgeId })),
    [edges, selectedEdgeId]
  );

  return (
    <div ref={reactFlowWrapper} className="flex-1 relative bg-[#FAFAFA] dark:bg-dk-bg">
      <ReactFlow
        nodes={nodes}
        edges={edgesWithSelection}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, minZoom: 0.45, maxZoom: 0.9 }}
        minZoom={0.35}
        maxZoom={1.2}
        defaultEdgeOptions={{
          type: 'custom',
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#FFB74D',
          },
        }}
        connectionLineStyle={{ stroke: '#FFB74D', strokeWidth: 2 }}
      >
        <Background variant="dots" gap={20} size={1} color={isDark ? '#1e293b' : '#E5E7EB'} />
        <MiniMap
          position="bottom-left"
          className="!w-32 !h-20 sm:!w-40 sm:!h-24 md:!w-48 md:!h-28 bg-white dark:bg-dk-surface rounded-lg shadow border border-gray-200 dark:border-dk-border overflow-hidden"
          maskColor={isDark ? 'rgba(11, 15, 25, 0.7)' : 'rgba(240, 242, 245, 0.7)'}
          nodeColor={isDark ? '#1e293b' : '#e2e8f0'}
          pannable
          zoomable
        />
        <Controls
          position="bottom-right"
          className="dark:[&_button]:!bg-dk-surface dark:[&_button]:!border-dk-border dark:[&_button]:!fill-dk-text dark:[&_button_path]:!fill-dk-text dark:[&_button:hover]:!bg-dk-raised"
        />
      </ReactFlow>
    </div>
  );
};
