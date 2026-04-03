import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLocalStorageState } from '../../hooks/useLocalStorageState';
import { addEdge, useNodesState, useEdgesState } from 'reactflow';
import 'reactflow/dist/style.css';
import campaignBuilderApiService from '../../features/campaigns/services/campaignBuilderApi.service';
import campaignRunApiService from '../../features/campaigns/services/campaignRunApi.service';
import useBrowserRouterBlocker from '../../features/campaigns/hooks/useBrowserRouterBlocker';
import {
  campaignFlowHasZaloPoolMulti,
  getAllowedActionNodeTypesByCampaignType,
  getAllowedDataNodeTypesByCampaignType,
  isTriggerNodeType,
} from '../../features/campaigns/utils/campaignBuilderFlow';
import { buildFlowFromCampaign } from '../../features/campaigns/utils/campaignBuilderFlowSerialization';
import {
  applyMappingsForRow,
  buildSchemaFromRows,
  normalizeKey,
  parseEmailList,
  renderTemplateString,
  resolveColumnKey,
} from '../../features/campaigns/utils/campaignBuilderRuntime';
import {
  buildExecutionOrder,
  validateNodeForRun,
} from '../../features/campaigns/utils/campaignBuilderRunValidation';
import { edgeTypes, nodeTypes } from '../../features/campaigns/components/CampaignBuilderFlowNodes';
import { createCampaignNodeRunner } from '../../features/campaigns/utils/campaignBuilderNodeRunner';
import { executeCampaignRun } from '../../features/campaigns/utils/campaignBuilderRunExecutor';
import CampaignBuilderPageLayout from '../../features/campaigns/components/CampaignBuilderPageLayout';
import useCampaignBuilderLayoutState from '../../features/campaigns/hooks/useCampaignBuilderLayoutState';
import toast from 'react-hot-toast';
import { readCampaignDraft, writeCampaignDraft, clearCampaignDraft } from '../../utils/campaignDraftStorage';
import {
  HiOutlineMail,
  HiOutlineCursorClick,
  HiOutlineTrash,
  HiOutlineExclamationCircle,
  HiOutlineDocumentText,
  HiOutlineDocument,
  HiOutlineLink,
  HiOutlinePlus,
} from 'react-icons/hi';

const LOG_LIST_MIN_WIDTH = 200;
const LOG_DETAIL_MIN_WIDTH = 220;
const NODE_DROP_OFFSET_X = 76;
const NODE_DROP_OFFSET_Y = 50;
const ADJACENT_ZALO_NODE_DELAY_MS = 2500;
const RUNNING_CAMPAIGN_SAVE_BLOCK_MESSAGE =
  'Chiến dịch đang chạy. Vui lòng dừng lượt chạy tại trang Chạy chiến dịch (CampaignRun) trước khi lưu thay đổi.';
const ZALO_NODE_TYPES = new Set([
  'select_zalo_account',
  'get_all_friends',
  'get_all_groups',
  'send_zalo_personal',
  'send_zalo_friend_request',
  'send_zalo_group',
]);

// Initial nodes - empty
const initialNodes = [];
const initialEdges = [];

/**
 * Check whether a flow node belongs to Zalo execution pipeline.
 *
 * @param {object} node flow node
 * @returns {boolean}
 */
const isZaloExecutionNode = (node) => {
  const normalizedType = String(node?.data?.nodeType || node?.type || '').trim().toLowerCase();
  return normalizedType.includes('zalo') || ZALO_NODE_TYPES.has(normalizedType);
};

const CampaignBuilder = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [campaignName, setCampaignName] = useState('');
  const [campaignDescription, setCampaignDescription] = useState('');
  const [campaignType, setCampaignType] = useState('email');
  const [campaignStatus, setCampaignStatus] = useState('draft');
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [runLogs, setRunLogs] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [showRunLogs, setShowRunLogs] = useLocalStorageState('uknow_builder_showRunLogs', true);
  /** Chế độ cắt log/preview trên Builder: luôn `100` (node Sheet có thể ghi đè trong cấu hình). */
  const builderLogItemsMode = '100';
  const [selectedRunLogId, setSelectedRunLogId] = useState(null);
  const runTokenRef = useRef(0);
  const runAbortControllerRef = useRef(null);
  const pendingLeaveActionRef = useRef(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useLocalStorageState('uknow_builder_expandedCategories', ['Triggers', 'Actions', 'Logic', 'Data']);
  const [showNameModal, setShowNameModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState(false);
  const [leaveConfirmContext, setLeaveConfirmContext] = useState('dirty');
  const [nodeToConfig, setNodeToConfig] = useState(null);
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [zaloTemplates, setZaloTemplates] = useState([]);
  const [emailSettings, setEmailSettings] = useState([]);
  const previewSessionKey = `uknow_builder_preview_data_${id || 'new'}`;
  const deleteNodeName =
    selectedNode?.data?.label?.trim() ||
    selectedNode?.data?.nodeType ||
    selectedNode?.type ||
    'node';
  const lastClickTime = useRef(0);
  const lastClickedNode = useRef(null);
  const lastSavedSnapshotRef = useRef('');
  const pendingBaselineRef = useRef(false);
  const hasBaselineRef = useRef(false);
  const hasHydratedDraftRef = useRef(false);
  const isNewCampaign = !id || id === 'new';
  const shouldBlockNavigation = isRunning || isDirty;
  const navigationBlocker = useBrowserRouterBlocker(shouldBlockNavigation);
  const {
    runLogHeight,
    isResizingLog,
    logListWidth,
    isResizingLogSplit,
    builderSidebarWidth,
    isResizingBuilderSidebar,
    logPanelRef,
    handleLogResizeStart,
    handleLogSplitResizeStart,
    handleBuilderSidebarResizeStart,
  } = useCampaignBuilderLayoutState({
    showRunLogs,
    logListMinWidth: LOG_LIST_MIN_WIDTH,
    logDetailMinWidth: LOG_DETAIL_MIN_WIDTH,
  });

  const readPreviewSessionData = useCallback(() => {
    try {
      const raw = sessionStorage.getItem(previewSessionKey);
      return raw ? JSON.parse(raw) : { customers: [], emails: [] };
    } catch {
      return { customers: [], emails: [] };
    }
  }, [previewSessionKey]);

  const writePreviewSessionData = useCallback((data) => {
    try {
      sessionStorage.setItem(previewSessionKey, JSON.stringify(data || { customers: [], emails: [] }));
    } catch {
      // Ignore session storage errors (private mode / quota exceeded)
    }
  }, [previewSessionKey]);
  /**
   * Stop current preview run and abort in-flight requests.
   *
   * @param {object} options stop options
   * @param {boolean} options.updateRunningState control `isRunning` state update
   * @returns {void}
   */
  const cancelCurrentRun = useCallback((options = {}) => {
    const { updateRunningState = true } = options;
    runTokenRef.current = 0;
    if (runAbortControllerRef.current) {
      runAbortControllerRef.current.abort();
      runAbortControllerRef.current = null;
    }
    if (updateRunningState) {
      setIsRunning(false);
    }
  }, []);

  useEffect(() => {
    const fetchZaloTemplates = async () => {
      try {
        const response = await campaignBuilderApiService.getZaloTemplates({
          params: { page: 1, limit: 100 },
        });
        const items = response.data?.data?.items;
        setZaloTemplates(Array.isArray(items) ? items : []);
      } catch (error) {
        console.error('Failed to fetch zalo templates:', error);
      }
    };
    fetchZaloTemplates();
  }, []);

  const buildSnapshot = useCallback((nameValue, nodeList, edgeList) => {
    const normalizedNodes = (nodeList || [])
      .map((n) => ({
        id: String(n.id || ''),
        type: n.type || '',
        position: {
          x: Math.round(n.position?.x || 0),
          y: Math.round(n.position?.y || 0),
        },
        data: {
          label: n.data?.label || '',
          nodeType: n.data?.nodeType || n.type || '',
          config: n.data?.config || {},
        },
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    const normalizedEdges = (edgeList || [])
      .map((e) => ({
        id: String(e.id || ''),
        source: String(e.source || ''),
        target: String(e.target || ''),
        type: e.type || 'default',
        label: e.label || null,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    return JSON.stringify({
      name: String(nameValue || '').trim(),
      nodes: normalizedNodes,
      edges: normalizedEdges,
    });
  }, []);

  useEffect(() => {
    return () => {
      try {
        sessionStorage.removeItem(previewSessionKey);
      } catch {
        // noop
      }
    };
  }, [previewSessionKey]);

  useEffect(() => {
    if (!shouldBlockNavigation) return undefined;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [shouldBlockNavigation]);

  useEffect(() => {
    if (navigationBlocker.state !== 'blocked') return;
    pendingLeaveActionRef.current = null;
    setLeaveConfirmContext(isRunning ? 'running' : 'dirty');
    setShowLeaveConfirmModal(true);
  }, [isRunning, navigationBlocker.state]);

  const handleCloseLeaveConfirmModal = useCallback(() => {
    setShowLeaveConfirmModal(false);
    pendingLeaveActionRef.current = null;
    navigationBlocker.reset();
  }, [navigationBlocker]);

  const handleConfirmLeaveBuilder = useCallback(() => {
    setShowLeaveConfirmModal(false);
    const pendingLeaveAction = pendingLeaveActionRef.current;
    pendingLeaveActionRef.current = null;
    if (isRunning) {
      cancelCurrentRun();
    }
    if (typeof pendingLeaveAction === 'function') {
      pendingLeaveAction();
      return;
    }
    navigationBlocker.proceed();
  }, [cancelCurrentRun, isRunning, navigationBlocker]);

  // Fetch email templates for send_email node config
  useEffect(() => {
    const fetchEmailTemplates = async () => {
      try {
        const response = await campaignBuilderApiService.getEmailTemplates();
        const items = response.data?.data?.items;
        setEmailTemplates(Array.isArray(items) ? items : []);
      } catch (error) {
        console.error('Failed to fetch email templates:', error);
      }
    };
    fetchEmailTemplates();
  }, []);

  // Fetch active SMTP settings for send_email
  useEffect(() => {
    const fetchEmailSettings = async () => {
      try {
        // Dùng danh sách email settings với status=active thay vì /active
        const response = await campaignBuilderApiService.getActiveEmailSettings();
        const items = response.data?.data?.items;
        setEmailSettings(Array.isArray(items) ? items : []);
      } catch (error) {
        console.error('Failed to fetch email settings:', error);
      }
    };
    fetchEmailSettings();
  }, []);

  // Fetch campaign data when editing
  useEffect(() => {
    const fetchCampaign = async () => {
      if (isNewCampaign) {
        // Reset về state ban đầu khi tạo mới và hydrate từ draft tạm nếu có
        const draft = readCampaignDraft();
        const draftNodes = Array.isArray(draft?.nodes) ? draft.nodes : [];
        const draftEdges = Array.isArray(draft?.edges) ? draft.edges : [];
        setCampaignName(draft?.campaignName || '');
        setCampaignDescription(draft?.campaignDescription || '');
        setCampaignType(draft?.campaignType || 'email');
        setCampaignStatus('draft');
        setLastSavedTime(null);
        setNodes(draftNodes.length ? draftNodes : initialNodes);
        setEdges(draftEdges.length ? draftEdges : initialEdges);
        setIsDirty(false);
        setRunLogs([]);
        setSelectedNode(null);
        setSelectedEdgeId(null);
        setSelectedRunLogId(null);
        lastSavedSnapshotRef.current = '';
        hasBaselineRef.current = false;
        pendingBaselineRef.current = false;
        hasHydratedDraftRef.current = true;
        return;
      }
      try {
        const response = await campaignBuilderApiService.getCampaignById(id);
        const campaignData = response.data?.data;

        if (!campaignData) {
          toast.error('Không thể tải thông tin chiến dịch');
          navigate('/campaigns');
          return;
        }

        setCampaignName(campaignData.campaignName || '');
        setCampaignDescription(campaignData.description || '');
        setCampaignType(campaignData.campaignType || 'email');
        setCampaignStatus(campaignData.status || 'draft');
        setLastSavedTime(campaignData.updatedAt || campaignData.createdAt || new Date().toISOString());
        const { nodes: loadedNodes, edges: loadedEdges } = buildFlowFromCampaign(campaignData);
        const arr = Array.isArray(loadedNodes) ? loadedNodes : [];
        const triggers = arr.filter((n) => isTriggerNodeType(n.data?.nodeType || n.type));
        const normalizedNodes = triggers.length <= 1 ? arr : arr.filter((n) => !isTriggerNodeType(n.data?.nodeType || n.type) || n.id === triggers[0].id);
        let normalizedEdges = Array.isArray(loadedEdges) ? loadedEdges : [];
        if (triggers.length > 1) {
          const keptTriggerId = String(triggers[0].id);
          const removedIds = new Set(triggers.slice(1).map((n) => String(n.id)));
          normalizedEdges = normalizedEdges
            .map((e) => (removedIds.has(String(e.source)) ? { ...e, source: keptTriggerId } : e))
            .filter((e) => !removedIds.has(String(e.target)));
        }
        setNodes(normalizedNodes);
        setEdges(normalizedEdges);
        pendingBaselineRef.current = true;
      } catch (error) {
        console.error('Fetch campaign error:', error);
        toast.error('Không thể tải thông tin chiến dịch');
        navigate('/campaigns');
      }
    };

    fetchCampaign();
  }, [id, isNewCampaign, navigate, setEdges, setNodes]);

  // When creating a new campaign, ask for name first
  useEffect(() => {
    if (isNewCampaign) {
      const draft = readCampaignDraft();
      const hasPrefilledInfo = !!String(draft?.campaignName || '').trim();
      if (!hasPrefilledInfo) {
        setShowNameModal(true);
      }
      if (!hasBaselineRef.current) {
        pendingBaselineRef.current = true;
      }
    } else {
      setShowNameModal(false);
    }
  }, [isNewCampaign]);

  useEffect(() => {
    if (!isNewCampaign) return;
    if (!hasHydratedDraftRef.current) return;
    writeCampaignDraft({
      campaignName: campaignName || '',
      campaignDescription: campaignDescription || '',
      campaignType: campaignType || 'email',
      nodes: Array.isArray(nodes) ? nodes : [],
      edges: Array.isArray(edges) ? edges : [],
      updatedAt: new Date().toISOString(),
    });
  }, [campaignDescription, campaignName, campaignType, edges, isNewCampaign, nodes]);

  useEffect(() => {
    if (pendingBaselineRef.current) {
      lastSavedSnapshotRef.current = buildSnapshot(campaignName, nodes, edges);
      hasBaselineRef.current = true;
      pendingBaselineRef.current = false;
      setIsDirty(false);
      return;
    }

    if (!hasBaselineRef.current) return;
    const currentSnapshot = buildSnapshot(campaignName, nodes, edges);
    setIsDirty(currentSnapshot !== lastSavedSnapshotRef.current);
  }, [buildSnapshot, campaignName, edges, nodes]);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, type: 'custom' }, eds)),
    [setEdges]
  );

  // Handle single click and double click
  const onNodeClick = useCallback((event, node) => {
    setSelectedEdgeId(null);
    const now = Date.now();
    const timeDiff = now - lastClickTime.current;

    if (timeDiff < 300 && lastClickedNode.current === node.id) {
      // Double click - open config modal
      setNodeToConfig(node);
      setShowConfigModal(true);
      lastClickTime.current = 0;
      lastClickedNode.current = null;
    } else {
      // Single click - select node
      setSelectedNode(node);
      lastClickTime.current = now;
      lastClickedNode.current = node.id;
    }
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdgeId(null);
  }, []);

  const onEdgeClick = useCallback((event, edge) => {
    setSelectedNode(null);
    setSelectedEdgeId((prev) => (prev === edge.id ? null : edge.id));
  }, []);

  const onDragStart = (event, nodeType, nodeData) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify({ nodeType, nodeData }));
    event.dataTransfer.effectAllowed = 'move';
    const dragPreview = document.createElement('div');
    dragPreview.className = 'rounded-md border border-primary-200 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm';
    dragPreview.textContent = nodeData?.name || 'Node';
    document.body.appendChild(dragPreview);
    event.dataTransfer.setDragImage(dragPreview, 60, 16);
    window.setTimeout(() => {
      if (dragPreview.parentNode) {
        dragPreview.parentNode.removeChild(dragPreview);
      }
    }, 0);
  };

  const toggleCategory = (category) => {
    setExpandedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  // Keyboard Delete/Backspace: node -> confirm modal, edge -> delete immediately
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const target = event.target;
      if (target && (target.matches('input, textarea, [contenteditable="true"]') || target.closest('input, textarea, [contenteditable="true"]'))) return;

      if (selectedEdgeId) {
        event.preventDefault();
        setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
        setSelectedEdgeId(null);
        setIsDirty(true);
        toast.success('Đã xóa dây nối');
        return;
      }
      if (selectedNode) {
        event.preventDefault();
        setShowDeleteModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode, selectedEdgeId, setEdges]);

  const handleDeleteNode = () => {
    if (selectedNode) {
      setShowDeleteModal(true);
    }
  };

  /**
   * Kiểm tra chiến dịch hiện tại có run đang chạy hay không trước khi cho phép lưu.
   *
   * Luồng hoạt động:
   * 1. Gọi API danh sách run theo campaign hiện tại.
   * 2. Tìm run có trạng thái `running`.
   * 3. Trả về true để chặn lưu nếu còn run đang chạy.
   *
   * @returns {Promise<boolean>} true nếu chiến dịch còn run đang chạy
   */
  const hasRunningCampaignRunBeforeSave = useCallback(async () => {
    if (isNewCampaign || !id) return false;
    const runResponse = await campaignRunApiService.getCampaignRuns(`campaignId=${id}&limit=20`);
    const campaignRuns = Array.isArray(runResponse.data?.data) ? runResponse.data.data : [];
    return campaignRuns.some((run) => String(run?.status || '').toLowerCase() === 'running');
  }, [id, isNewCampaign]);

  const confirmDeleteNode = () => {
    if (selectedNode) {
      setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
      setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
      setSelectedNode(null);
      setSelectedEdgeId(null);
      setShowDeleteModal(false);
      setIsDirty(true);
      toast.success('Đã xóa node');
    }
  };

  const handleSave = async () => {
    if (!campaignName.trim()) {
      toast.error('Vui lòng nhập tên chiến dịch');
      return;
    }

    const triggerCount = nodes.filter((n) => isTriggerNodeType(n.data?.nodeType || n.type)).length;
    if (triggerCount > 1) {
      toast.error('Một chiến dịch chỉ được có 1 node điểm khởi đầu. Vui lòng xóa bớt trigger.');
      return;
    }

    try {
      const hasRunningCampaignRun = await hasRunningCampaignRunBeforeSave();
      if (hasRunningCampaignRun) {
        toast.error(RUNNING_CAMPAIGN_SAVE_BLOCK_MESSAGE);
        return;
      }

      // Transform nodes to match backend format
      const transformedNodes = nodes.map((node, index) => ({
        tempId: node.id,
        nodeType: node.data?.nodeType?.includes('trigger') ? 'trigger' : 
                  [
                    'send_email',
                    'send_zalo_personal',
                    'send_zalo_friend_request',
                    'send_zalo_group',
                    'add_tag',
                    'update_customer',
                    'create_task',
                    'webhook',
                  ].includes(node.data?.nodeType) ? 'action' :
                  ['wait', 'condition', 'switch', 'loop', 'merge'].includes(node.data?.nodeType) ? 'logic' : 'data',
        nodeSubtype: node.data?.nodeType || node.type,
        nodeName: node.data?.label || '',
        nodeDescription: node.data?.config?.description || '',
        positionX: Math.round(node.position?.x || 0),
        positionY: Math.round(node.position?.y || 0),
        config: node.data?.config || {},
        executionOrder: index + 1
      }));

      const nodeIds = new Set(nodes.map((n) => n.id));
      const transformedConnections = edges
        .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
        .map((edge) => ({
          sourceNodeId: edge.source,
          targetNodeId: edge.target,
          connectionType: edge.type || 'default',
          connectionLabel: edge.label || null
        }));

        const campaignData = {
          campaignName: campaignName.trim(),
          description: campaignDescription.trim(),
          campaignType,
          flowJson: { nodes, edges },
          nodes: transformedNodes,
          connections: transformedConnections
        };

      let savedCampaignId = id;
      if (!isNewCampaign) {
        await campaignBuilderApiService.updateCampaign(id, campaignData);
      } else {
        const response = await campaignBuilderApiService.createCampaign(campaignData);
        savedCampaignId = response.data?.data?.id || savedCampaignId;
        clearCampaignDraft();
      }
      setLastSavedTime(new Date().toISOString());
      lastSavedSnapshotRef.current = buildSnapshot(campaignName, nodes, edges);
      hasBaselineRef.current = true;
      setIsDirty(false);
      setShowNameModal(false);
      if (isNewCampaign && savedCampaignId) {
        navigate(`/campaigns/${savedCampaignId}/builder`, { replace: true });
      }
      toast.success('Đã lưu chiến dịch');
    } catch (error) {
      console.error('Save campaign error:', error);
      const statusCode = Number(error?.response?.status);
      if (statusCode === 409) {
        toast.error(error.response?.data?.message || RUNNING_CAMPAIGN_SAVE_BLOCK_MESSAGE);
        return;
      }
      const msg = error.response?.data?.message || error.message || 'Không thể lưu chiến dịch';
      toast.error(typeof msg === 'string' ? msg : 'Không thể lưu chiến dịch');
    }
  };

  const handleNodeConfigSave = (formData) => {
    if (nodeToConfig) {
      console.log('Saving node config:', {
        nodeType: nodeToConfig.data?.nodeType,
        interestedSelectedCustomerIds: formData.interestedSelectedCustomerIds,
        formData,
      });

      const savedNodeType = nodeToConfig.data?.nodeType || nodeToConfig.type;
      const poolOn =
        savedNodeType === 'select_zalo_account'
        && Boolean(formData.zaloPoolMultiAccountEnabled);
      const poolIds = Array.isArray(formData.zaloPoolAccountIds)
        ? formData.zaloPoolAccountIds.map((id) => String(id || '').trim()).filter(Boolean)
        : [];
      const shouldStripFriendListNodes = poolOn && poolIds.length > 0;

      const friendNodeIds = shouldStripFriendListNodes
        ? nodes
          .filter((n) => (n.data?.nodeType || n.type) === 'get_all_friends')
          .map((n) => n.id)
        : [];

      // Cập nhật node với config mới
      const updatedNode = {
        ...nodeToConfig,
        data: { ...nodeToConfig.data, label: formData.label, config: formData },
      };

      setNodes((nds) => {
        const mapped = nds.map((n) => (n.id === nodeToConfig.id ? updatedNode : n));
        if (!shouldStripFriendListNodes) return mapped;
        return mapped.filter((n) => (n.data?.nodeType || n.type) !== 'get_all_friends');
      });

      if (shouldStripFriendListNodes && friendNodeIds.length > 0) {
        setEdges((eds) => eds.filter(
          (e) => !friendNodeIds.includes(e.source) && !friendNodeIds.includes(e.target)
        ));
      }

      // Cập nhật selectedNode nếu đang được chọn
      if (selectedNode && selectedNode.id === nodeToConfig.id) {
        setSelectedNode(updatedNode);
      }
      if (shouldStripFriendListNodes && selectedNode && friendNodeIds.includes(selectedNode.id)) {
        setSelectedNode(null);
      }

      setShowConfigModal(false);
      setNodeToConfig(null);
      toast.success(
        shouldStripFriendListNodes && friendNodeIds.length > 0
          ? 'Đã lưu cấu hình node và gỡ node «Lấy danh sách bạn bè Zalo» (không dùng khi gửi bằng pool nhiều tài khoản).'
          : 'Đã lưu cấu hình node'
      );
    }
  };

  // Filter nodes by search
  const filterNodes = (nodeList) => {
    if (!searchTerm) return nodeList;
    return nodeList.filter(node =>
      node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const allowedActionNodeTypes = useMemo(
    () => getAllowedActionNodeTypesByCampaignType(campaignType),
    [campaignType]
  );
  const allowedDataNodeTypes = useMemo(
    () => getAllowedDataNodeTypesByCampaignType(campaignType),
    [campaignType]
  );

  /** Đang bật pool đa TK trên node «Chọn tài khoản Zalo» → ẩn / chặn node «Lấy danh sách bạn bè» */
  const suppressGetAllFriendsPalette = useMemo(
    () => campaignFlowHasZaloPoolMulti(nodes),
    [nodes]
  );

  const addRunLog = (entry) => {
    setRunLogs((prev) => [...prev, entry]);
  };

  /**
   * Detect whether a request failed because current run was canceled.
   *
   * @param {any} error request error
   * @returns {boolean}
   */
  const isRunCancelledError = useCallback((error) => {
    const code = String(error?.code || '').toUpperCase();
    const name = String(error?.name || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();
    return (
      code === 'ERR_CANCELED' ||
      name === 'cancelederror' ||
      name === 'aborterror' ||
      message.includes('canceled') ||
      message.includes('cancelled') ||
      message.includes('aborted')
    );
  }, []);

  /**
   * Add new log or update existing log by id.
   *
   * @param {object} entry log payload to persist
   * @returns {void}
   */
  const upsertRunLog = useCallback((entry) => {
    setRunLogs((prev) => {
      const index = prev.findIndex((log) => log.id === entry.id);
      if (index < 0) return [...prev, entry];
      const next = [...prev];
      next[index] = {
        ...next[index],
        ...entry,
      };
      return next;
    });
  }, []);

  /**
   * Build normalized realtime log entry for one node.
   *
   * @param {object} params node log data
   * @returns {object}
   */
  const buildNodeRealtimeLog = useCallback((params) => ({
    id: params.id,
    status: params.status || 'info',
    nodeId: params.nodeId,
    nodeType: params.nodeType,
    nodeName: params.nodeName,
    message: params.message || 'Đang thực thi node',
    timestamp: new Date(),
    result: params.result ?? null,
  }), []);

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const { checkSheetConnection, buildRunResultForNode } = createCampaignNodeRunner({
    campaignId: id,
    apiService: campaignBuilderApiService,
    buildSchemaFromRows,
    applyMappingsForRow,
    normalizeKey,
    parseEmailList,
    renderTemplateString,
    resolveColumnKey,
    readPreviewSessionData,
    writePreviewSessionData,
    toastNotifier: toast,
    isRunCancelledError,
    sleep,
    logItemsMode: builderLogItemsMode,
  });

  const handleRunCampaign = async () => {
    await executeCampaignRun({
      isRunning,
      nodes,
      edges,
      toastNotifier: toast,
      setShowRunLogs,
      setRunLogs,
      setIsRunning,
      setSelectedRunLogId,
      runTokenRef,
      runAbortControllerRef,
      buildExecutionOrder,
      validateNodeForRun,
      buildRunResultForNode,
      isRunCancelledError,
      upsertRunLog,
      buildNodeRealtimeLog,
      addRunLog,
      sleep,
      interZaloNodeDelayMs: ADJACENT_ZALO_NODE_DELAY_MS,
      isZaloNode: isZaloExecutionNode,
      logItemsMode: builderLogItemsMode,
    });
  };

  const handleStopRun = () => {
    if (!isRunning) return;
    cancelCurrentRun();
  };

  /**
   * Leave builder safely while preview run may still be in progress.
   *
   * @returns {void}
   */
  const handleBackToCampaigns = () => {
    if (shouldBlockNavigation) {
      pendingLeaveActionRef.current = () => navigate('/campaigns');
      setLeaveConfirmContext(isRunning ? 'running' : 'dirty');
      setShowLeaveConfirmModal(true);
      return;
    }
    navigate('/campaigns');
  };

  const handleNameModalPrimary = () => {
    if (!campaignName.trim()) {
      toast.error('Vui lòng nhập tên chiến dịch');
      return;
    }
    handleSave();
  };

  const leaveModalTitle = leaveConfirmContext === 'running'
    ? 'Xác nhận thoát Builder khi đang chạy'
    : 'Bạn có thay đổi chưa lưu';
  const leaveModalMessage = leaveConfirmContext === 'running'
    ? 'Chiến dịch đang chạy preview. Nếu rời trang Builder lúc này, tiến trình chạy sẽ bị dừng. Bạn có chắc chắn muốn thoát?'
    : 'Bạn đang có thay đổi chưa lưu. Nếu thoát khỏi trang Builder, các thay đổi này sẽ bị mất. Bạn có chắc chắn muốn thoát?';

  return (
    <CampaignBuilderPageLayout
      campaignName={campaignName}
      campaignStatus={campaignStatus}
      isDirty={isDirty}
      lastSavedTime={lastSavedTime}
      onBackToCampaigns={handleBackToCampaigns}
      onRunCampaign={handleRunCampaign}
      isRunning={isRunning}
      onStopRun={handleStopRun}
      onOpenNameModal={() => setShowNameModal(true)}
      builderSidebarWidth={builderSidebarWidth}
      searchTerm={searchTerm}
      setSearchTerm={setSearchTerm}
      toggleCategory={toggleCategory}
      expandedCategories={expandedCategories}
      filterNodes={filterNodes}
      allowedActionNodeTypes={allowedActionNodeTypes}
      allowedDataNodeTypes={allowedDataNodeTypes}
      suppressGetAllFriendsPalette={suppressGetAllFriendsPalette}
      onDragStart={onDragStart}
      isResizingBuilderSidebar={isResizingBuilderSidebar}
      onBuilderSidebarResizeStart={handleBuilderSidebarResizeStart}
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
      nodeDropOffsetX={NODE_DROP_OFFSET_X}
      nodeDropOffsetY={NODE_DROP_OFFSET_Y}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      setSelectedNode={setSelectedNode}
      onDeleteNode={handleDeleteNode}
      setNodeToConfig={setNodeToConfig}
      setShowConfigModal={setShowConfigModal}
      showRunLogs={showRunLogs}
      isResizingLog={isResizingLog}
      onLogResizeStart={handleLogResizeStart}
      runLogHeight={runLogHeight}
      logPanelRef={logPanelRef}
      runLogs={runLogs}
      selectedRunLogId={selectedRunLogId}
      setSelectedRunLogId={setSelectedRunLogId}
      logListWidth={logListWidth}
      logListMinWidth={LOG_LIST_MIN_WIDTH}
      logDetailMinWidth={LOG_DETAIL_MIN_WIDTH}
      isResizingLogSplit={isResizingLogSplit}
      onLogSplitResizeStart={handleLogSplitResizeStart}
      setRunLogs={setRunLogs}
      setShowRunLogs={setShowRunLogs}
      showNameModal={showNameModal}
      setShowNameModal={setShowNameModal}
      onNameModalPrimary={handleNameModalPrimary}
      setCampaignName={setCampaignName}
      setCampaignType={setCampaignType}
      isNewCampaign={isNewCampaign}
      campaignDescription={campaignDescription}
      setCampaignDescription={setCampaignDescription}
      showDeleteModal={showDeleteModal}
      setShowDeleteModal={setShowDeleteModal}
      onConfirmDeleteNode={confirmDeleteNode}
      deleteNodeName={deleteNodeName}
      showConfigModal={showConfigModal}
      nodeToConfig={nodeToConfig}
      onNodeConfigSave={handleNodeConfigSave}
      checkSheetConnection={checkSheetConnection}
      emailTemplates={emailTemplates}
      zaloTemplates={zaloTemplates}
      emailSettings={emailSettings}
      campaignId={isNewCampaign ? null : id}
      showLeaveConfirmModal={showLeaveConfirmModal}
      onCloseLeaveConfirmModal={handleCloseLeaveConfirmModal}
      onConfirmLeaveBuilder={handleConfirmLeaveBuilder}
      leaveModalTitle={leaveModalTitle}
      leaveModalMessage={leaveModalMessage}
    />
  );
};

// Wrap with ReactFlowProvider
import { ReactFlowProvider } from 'reactflow';

const CampaignBuilderWrapper = () => (
  <ReactFlowProvider>
    <CampaignBuilder />
  </ReactFlowProvider>
);

export default CampaignBuilderWrapper;








