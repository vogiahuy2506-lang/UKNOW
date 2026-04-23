import { useCallback, useMemo, useRef } from 'react';
import ReactFlow, { Background, Controls, MarkerType, MiniMap, useReactFlow } from 'reactflow';
import toast from 'react-hot-toast';
import { HiOutlineExclamationCircle, HiOutlineX } from 'react-icons/hi';
import FullScreenOverlay from '../../../components/FullScreenOverlay';

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
  if (!isOpen) return null;

  return (
    <FullScreenOverlay isOpen={isOpen}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tên chiến dịch</label>
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Nhập tên chiến dịch..."
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Miêu tả</label>
            <textarea
              value={campaignDescription}
              onChange={(e) => setCampaignDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
              placeholder="Nhập miêu tả chiến dịch..."
              rows={4}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Loại chiến dịch</label>
            <select
              value={campaignType}
              onChange={(e) => setCampaignType?.(e.target.value)}
              disabled={isTypeLocked}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
            >
              <option value="email">Email</option>
              <option value="zalo">Zalo cá nhân</option>
              <option value="zalo_group">Zalo nhóm</option>
              {campaignType === 'mixed' ? <option value="mixed">Kết hợp (legacy)</option> : null}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-4 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            Hủy
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
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className={iconClassName}>
              <HiOutlineExclamationCircle className={iconColorClassName} />
            </div>
            <p className="text-gray-600">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-4 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
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
      const isDataNode = !isTriggerNode && !isActionNode;
      const isRestrictedDataNode = isDataNode && allowedDataTypes && !allowedDataTypes.has(nodeType);
      if (isActionNode && !allowedActionTypes.has(nodeType)) {
        toast.error(`Loại chiến dịch ${campaignType?.toUpperCase()} không hỗ trợ node này`);
        return;
      }
      if (isRestrictedDataNode) {
        toast.error(`Loại chiến dịch ${campaignType?.toUpperCase()} không hỗ trợ node này`);
        return;
      }

      if (nodeType === 'get_all_friends' && suppressGetAllFriendsPalette) {
        toast.error(
          'Đang bật gửi bằng pool nhiều tài khoản Zalo — không dùng node «Lấy danh sách bạn bè».'
        );
        return;
      }

      const position = project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      position.x -= nodeDropOffsetX;
      position.y -= nodeDropOffsetY;

      let nodeName = data.nodeData.name;
      const existingNames = nodes.map((n) => n.data?.label).filter(Boolean);
      const samePrefixNames = existingNames.filter(
        (name) =>
          name === nodeName ||
          name.match(new RegExp(`^${nodeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\d+$`))
      );
      if (samePrefixNames.length > 0) {
        let counter = 1;
        let newName = `${nodeName} ${counter}`;
        while (existingNames.includes(newName)) {
          counter += 1;
          newName = `${nodeName} ${counter}`;
        }
        nodeName = newName;
      }

      const newNode = {
        id: `${data.nodeType}-${Date.now()}`,
        type: data.nodeType === 'start' ? 'start' : data.nodeType === 'end' ? 'end' : 'task',
        position,
        data: { label: nodeName, nodeType: data.nodeType },
      };

      if (isTriggerNodeType(data.nodeType)) {
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
    [
      campaignType,
      getAllowedActionNodeTypesByCampaignType,
      getAllowedDataNodeTypesByCampaignType,
      isTriggerNodeType,
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
    <div ref={reactFlowWrapper} className="flex-1 relative" style={{ background: '#FAFAFA' }}>
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
        <Background variant="dots" gap={20} size={1} color="#E5E7EB" />
        <MiniMap
          position="bottom-left"
          className="!w-32 !h-20 sm:!w-40 sm:!h-24 md:!w-48 md:!h-28 bg-white rounded-lg shadow border border-gray-200 overflow-hidden"
          pannable
          zoomable
        />
        <Controls position="bottom-right" />
      </ReactFlow>
    </div>
  );
};
