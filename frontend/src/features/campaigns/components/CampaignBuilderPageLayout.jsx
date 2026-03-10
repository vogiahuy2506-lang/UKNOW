import { useState } from 'react';
import {
  HiOutlineArrowLeft,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineChevronDown,
  HiOutlinePlay,
  HiOutlineSave,
  HiOutlineSearch,
  HiOutlineStop,
  HiOutlineX,
} from 'react-icons/hi';
import CampaignExecutionLogWorkspace from '../../../components/campaigns/CampaignExecutionLogWorkspace';
import { getCampaignTypeMeta } from '../../../utils/campaignTypeDisplay';
import {
  CampaignNameModal,
  ConfirmModal,
  FlowCanvas,
} from './CampaignBuilderLayout';
import NodeConfigModal from './NodeConfigModal';
import { nodeConfigs } from './CampaignBuilderFlowNodes';
import { formatCampaignDateTime } from '../utils/campaignDateTime.helpers';

const CampaignBuilderPageLayout = ({
  campaignName,
  campaignStatus,
  isDirty,
  lastSavedTime,
  onBackToCampaigns,
  onRunCampaign,
  isRunning,
  onStopRun,
  onOpenNameModal,
  builderSidebarWidth,
  searchTerm,
  setSearchTerm,
  toggleCategory,
  expandedCategories,
  filterNodes,
  allowedActionNodeTypes,
  allowedDataNodeTypes,
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
  onDeleteNode,
  setNodeToConfig,
  setShowConfigModal,
  showRunLogs,
  isResizingLog,
  onLogResizeStart,
  runLogHeight,
  logPanelRef,
  runLogs,
  selectedRunLogId,
  setSelectedRunLogId,
  logListWidth,
  logListMinWidth,
  logDetailMinWidth,
  isResizingLogSplit,
  onLogSplitResizeStart,
  setRunLogs,
  setShowRunLogs,
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
  deleteNodeName,
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
  const campaignTypeMeta = getCampaignTypeMeta(campaignType);
  const [isNodeMenuCollapsed, setIsNodeMenuCollapsed] = useState(false);
  const effectiveBuilderSidebarWidth = isNodeMenuCollapsed ? 52 : builderSidebarWidth;

  return (
    <div className="h-full min-h-0 w-full min-w-0 overflow-hidden flex flex-col">
    <div className="bg-white border-b border-gray-200 px-2.5 sm:px-4 py-2.5 sm:py-3">
      <div className="flex flex-wrap items-start justify-between gap-2.5 sm:gap-3">
        <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
          <button onClick={onBackToCampaigns} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <HiOutlineArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="min-w-0">
            <div className="text-sm text-gray-500 flex items-center gap-2 min-w-0">
              <span className="font-medium text-primary-600 truncate">{campaignName || 'Chiến dịch mới'}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium border ${campaignTypeMeta.className}`}>
                {campaignTypeMeta.label}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                campaignStatus === 'active' ? 'bg-green-100 text-green-700'
                  : campaignStatus === 'paused' ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-100 text-gray-700'
              }`}>
                {campaignStatus === 'active' ? 'Đang hoạt động'
                  : campaignStatus === 'paused' ? 'Tạm dừng'
                    : 'Nháp'}
              </span>
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {isDirty ? (
                <span className="text-amber-600 font-medium">Chưa lưu</span>
              ) : lastSavedTime ? (
                <>
                  <span className="text-green-600 font-medium">✓ Đã lưu</span>
                  <span className="mx-1">—</span>
                  <span>{formatCampaignDateTime(lastSavedTime)}</span>
                </>
              ) : (
                <span className="text-amber-600 font-medium">Chưa lưu</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
          <button
            onClick={onRunCampaign}
            disabled={isRunning}
            className={`px-2.5 sm:px-4 py-1.5 sm:py-2 text-sm sm:text-base rounded-lg transition-colors flex items-center gap-1.5 sm:gap-2 ${
              isRunning ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-green-500 text-white hover:bg-green-600'
            }`}
          >
            <HiOutlinePlay className="w-4 h-4" />
            Chạy
          </button>
          <button
            onClick={onStopRun}
            disabled={!isRunning}
            className={`px-2.5 sm:px-4 py-1.5 sm:py-2 text-sm sm:text-base rounded-lg transition-colors flex items-center gap-1.5 sm:gap-2 ${
              !isRunning ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-red-500 text-white hover:bg-red-600'
            }`}
          >
            <HiOutlineStop className="w-4 h-4" />
            Dừng
          </button>
          <button
            onClick={onOpenNameModal}
            className="px-2.5 sm:px-4 py-1.5 sm:py-2 text-sm sm:text-base bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors flex items-center gap-1.5 sm:gap-2"
          >
            <HiOutlineSave className="w-4 h-4" />
            Lưu
          </button>
        </div>
      </div>
    </div>

    <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden flex-col">
      <div className="flex flex-1 min-h-0 min-w-0 h-full overflow-hidden">
        <div
          className="bg-white border-r border-gray-200 flex flex-col min-h-0 h-full overflow-hidden"
          style={{ width: `${effectiveBuilderSidebarWidth}px` }}
        >
          {isNodeMenuCollapsed ? (
            <div className="p-2 flex justify-center">
              <button
                onClick={() => setIsNodeMenuCollapsed(false)}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
                title="Mở rộng menu node"
              >
                <HiOutlineChevronRight className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div className="p-2.5 sm:p-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Tìm kiếm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <button
                  onClick={() => setIsNodeMenuCollapsed(true)}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
                  title="Thu gọn menu node"
                >
                  <HiOutlineChevronLeft className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {!isNodeMenuCollapsed && (
            <div className="flex-1 min-h-0 overflow-y-auto px-2.5 sm:px-3 pb-2.5 sm:pb-3">
            <div className="mb-2">
              <button
                onClick={() => toggleCategory('Triggers')}
                className="w-full flex items-center justify-between py-2 text-sm font-semibold text-gray-800"
              >
                <span>Điểm khởi đầu (Triggers)</span>
                <HiOutlineChevronDown className={`w-4 h-4 transition-transform ${expandedCategories.includes('Triggers') ? '' : '-rotate-90'}`} />
              </button>
              {expandedCategories.includes('Triggers') && (
                <div className="space-y-1">
                  {filterNodes(nodeConfigs.triggers).map((node) => (
                    <div
                      key={node.type}
                      draggable
                      onDragStart={(e) => onDragStart(e, node.type, node)}
                      className="flex items-center px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg hover:bg-gray-50 cursor-grab active:cursor-grabbing transition-colors gap-2.5 sm:gap-3"
                    >
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: node.bgColor }}>
                        <node.icon className="w-4 h-4" style={{ color: node.iconColor }} />
                      </div>
                      <span className="text-sm text-gray-700 leading-5">{node.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-2">
              <button
                onClick={() => toggleCategory('Actions')}
                className="w-full flex items-center justify-between py-2 text-sm font-semibold text-gray-800"
              >
                <span>Hành động (Actions)</span>
                <HiOutlineChevronDown className={`w-4 h-4 transition-transform ${expandedCategories.includes('Actions') ? '' : '-rotate-90'}`} />
              </button>
              {expandedCategories.includes('Actions') && (
                <div className="space-y-1">
                  {filterNodes(nodeConfigs.actions.filter((node) => allowedActionNodeTypes.has(node.type))).map((node) => (
                    <div
                      key={node.type}
                      draggable
                      onDragStart={(e) => onDragStart(e, node.type, node)}
                      className="flex items-center px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg hover:bg-gray-50 cursor-grab active:cursor-grabbing transition-colors gap-2.5 sm:gap-3"
                    >
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: node.bgColor }}>
                        <node.icon className="w-4 h-4" style={{ color: node.iconColor }} />
                      </div>
                      <span className="text-sm text-gray-700 leading-5">{node.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-2">
              <button
                onClick={() => toggleCategory('Data')}
                className="w-full flex items-center justify-between py-2 text-sm font-semibold text-gray-800"
              >
                <span>Dữ liệu (Data)</span>
                <HiOutlineChevronDown className={`w-4 h-4 transition-transform ${expandedCategories.includes('Data') ? '' : '-rotate-90'}`} />
              </button>
              {expandedCategories.includes('Data') && (
                <div className="space-y-1">
                  {filterNodes(nodeConfigs.data.filter((node) => !allowedDataNodeTypes || allowedDataNodeTypes.has(node.type))).map((node) => (
                    <div
                      key={node.type}
                      draggable
                      onDragStart={(e) => onDragStart(e, node.type, node)}
                      className="flex items-center px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg hover:bg-gray-50 cursor-grab active:cursor-grabbing transition-colors gap-2.5 sm:gap-3"
                    >
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: node.bgColor }}>
                        <node.icon className="w-4 h-4" style={{ color: node.iconColor }} />
                      </div>
                      <span className="text-sm text-gray-700 leading-5">{node.name}</span>
                    </div>
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
              isResizingBuilderSidebar ? 'bg-primary-100' : 'hover:bg-primary-50'
            }`}
            onMouseDown={onBuilderSidebarResizeStart}
            role="separator"
            aria-orientation="vertical"
            title="Kéo để thay đổi kích thước"
          >
            <div className="mx-auto h-full w-px bg-gray-200" />
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
        />

        {selectedNode && (
          <div className="w-56 sm:w-60 md:w-64 xl:w-72 max-w-[52vw] bg-white border-l border-gray-200 flex flex-col">
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200">
              <h3 className="font-medium text-gray-900">Thuộc tính</h3>
              <button onClick={() => setSelectedNode(null)} className="p-1 hover:bg-gray-100 rounded">
                <HiOutlineX className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 p-3 sm:p-4 space-y-3 sm:space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên</label>
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
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Loại</label>
                <p className="text-sm text-gray-500 capitalize">{selectedNode.data.nodeType || selectedNode.type}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ID</label>
                <p className="text-sm text-gray-500 font-mono">{selectedNode.id}</p>
              </div>
              <button
                onClick={() => {
                  setNodeToConfig(selectedNode);
                  setShowConfigModal(true);
                }}
                className="w-full px-4 py-2 bg-primary-50 text-primary-600 text-sm font-medium rounded-lg hover:bg-primary-100 transition-colors"
              >
                Cấu hình chi tiết
              </button>
              <button
                onClick={onDeleteNode}
                className="w-full px-4 py-2 bg-red-50 text-red-600 text-sm font-medium rounded-lg hover:bg-red-100 transition-colors"
              >
                Xóa node
              </button>
            </div>
          </div>
        )}
      </div>

      {showRunLogs && (
        <div
          className={`h-2 w-full cursor-row-resize transition-colors ${
            isResizingLog ? 'bg-primary-100' : 'hover:bg-primary-50'
          }`}
          onMouseDown={onLogResizeStart}
          role="separator"
          aria-orientation="horizontal"
          title="Kéo để thay đổi kích thước"
        >
          <div className="mx-auto h-px w-full bg-gray-200" />
        </div>
      )}
      <div
        className={`border-t border-gray-200 bg-white px-3 py-2 flex-none flex flex-col min-h-0 w-full min-w-0 overflow-hidden ${
          showRunLogs ? '' : 'h-12'
        }`}
        style={showRunLogs ? { height: `${runLogHeight}px` } : undefined}
      >
        <div className="flex items-center justify-between">
          <div className="font-medium text-gray-900">Log chạy chiến dịch</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRunLogs((prev) => !prev)}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              {showRunLogs ? 'Thu gọn' : 'Mở rộng'}
            </button>
            <button
              onClick={() => {
                setRunLogs([]);
                setSelectedRunLogId(null);
              }}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Xóa log
            </button>
          </div>
        </div>
        {showRunLogs && (
          <div ref={logPanelRef} className="mt-2 flex-1 min-h-0 w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden">
            <CampaignExecutionLogWorkspace
              logs={runLogs}
              selectedLogId={selectedRunLogId}
              onSelectLogId={setSelectedRunLogId}
              emptyListText="Chưa có log"
              emptyDetailText="Chọn 1 log để xem chi tiết kết quả."
              listWidth={logListWidth}
              minListWidth={logListMinWidth}
              minDetailWidth={logDetailMinWidth}
              showSplitter
              isResizingSplit={isResizingLogSplit}
              onSplitResizeStart={onLogSplitResizeStart}
            />
          </div>
        )}
      </div>
    </div>

    <CampaignNameModal
      isOpen={showNameModal}
      onClose={() => setShowNameModal(false)}
      onPrimary={onNameModalPrimary}
      title={isNewCampaign ? 'Tạo chiến dịch' : 'Chỉnh sửa thông tin chiến dịch'}
      primaryLabel="Lưu"
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
      title={`Xác nhận xóa node "${deleteNodeName}"`}
      message="Bạn có chắc chắn muốn xóa node? Hành động này không thể hoàn tác."
      confirmLabel="Xóa"
      confirmButtonClassName="bg-red-500 text-white hover:bg-red-600"
    />

    <ConfirmModal
      isOpen={showLeaveConfirmModal}
      onClose={onCloseLeaveConfirmModal}
      onConfirm={onConfirmLeaveBuilder}
      title={leaveModalTitle}
      message={leaveModalMessage}
      confirmLabel="Thoát trang"
      cancelLabel="Ở lại"
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
      runLogs={runLogs}
      campaignId={campaignId}
    />
  </div>
  );
};

export default CampaignBuilderPageLayout;
