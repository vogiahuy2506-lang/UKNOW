import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineLightningBolt, HiOutlineX } from 'react-icons/hi';
import FullScreenOverlay from '../../../components/FullScreenOverlay';
import campaignBuilderApiService from '../services/campaignBuilderApi.service';
import { buildSchemaFromRows } from '../utils/campaignBuilderRuntime';
import {
  createNodeConfigFormData,
  fetchZaloAccountOptions,
  fetchInterestedCourseOptions,
  fetchTemplateDetail,
  handleNodeConfigSaveClick,
  handleMappingTemplateSelect as handleMappingTemplateSelectHelper,
  handleNodeCoursesPreviewLoad,
  handleNodeSheetConnectionCheck,
  normalizeTemplateVariables,
} from '../utils/nodeConfigModal.helpers';
import {
  buildRunLogMap,
  getSchemaForNodeId as getNodeSchemaById,
  getUpstreamNodes,
} from '../utils/nodeConfigModalSchema';
import { getAllNodeConfigs } from './CampaignBuilderFlowNodes';
import { NodeConfigManualTriggerSection } from './NodeConfigModalSections';
import {
  NodeConfigGetAllFriendsSection,
  NodeConfigGetAllGroupsSection,
} from './NodeConfigModalGetZaloListsSection';
import { NodeConfigMappingDataSection } from './NodeConfigModalMappingDataSection';
import { NodeConfigSaveCustomerSection } from './NodeConfigModalSaveCustomerSection';
import { NodeConfigSendEmailSection } from './NodeConfigModalSendEmailSection';
import {
  NodeConfigSendZaloFriendRequestSection,
  NodeConfigSendZaloGroupSection,
  NodeConfigSendZaloPersonalSection,
} from './NodeConfigModalSendZaloSection';
import {
  NodeConfigReadCoursesDbSection,
  NodeConfigReadInterestedCustomersSection,
  NodeConfigReadSheetSection,
} from './NodeConfigModalReadSections';
import { NodeConfigSelectZaloAccountSection } from './NodeConfigModalSelectZaloAccountSection';

const NodeConfigModal = ({
  isOpen,
  onClose,
  node,
  onSave,
  onCheckSheetConnection,
  emailTemplates = [],
  zaloTemplates = [],
  emailSettings = [],
  nodes = [],
  edges = [],
  runLogs = [],
  campaignId = null,
}) => {
  const nodeType = node?.data?.nodeType;
  const existingConfig = node?.data?.config || {};

  const [formData, setFormData] = useState(
    createNodeConfigFormData({
      config: existingConfig,
      label: node?.data?.label || '',
      normalizeEmailSteps: false,
    })
  );

  const [, setSelectedTemplate] = useState(null);
  const [mappingTemplate, setMappingTemplate] = useState(null);
  const [isCheckingSheet, setIsCheckingSheet] = useState(false);
  const [interestedCourseOptions, setInterestedCourseOptions] = useState([]);
  const [isLoadingInterestedCourses, setIsLoadingInterestedCourses] = useState(false);
  const [courseSearchQuery, setCourseSearchQuery] = useState('');
  const [selectedEmailSection, setSelectedEmailSection] = useState('basic');
  const [selectedSaveCustomerSection, setSelectedSaveCustomerSection] = useState('basic');
  const [selectedReadSheetSection, setSelectedReadSheetSection] = useState('basic');
  const [selectedReadInterestedCustomersSection, setSelectedReadInterestedCustomersSection] = useState('basic');
  const [selectedReadCoursesDbSection, setSelectedReadCoursesDbSection] = useState('basic');
  const [selectedZaloPersonalSection, setSelectedZaloPersonalSection] = useState('basic');
  const [selectedZaloGroupSection, setSelectedZaloGroupSection] = useState('basic');
  const [testPreviewItems, setTestPreviewItems] = useState([]);
  const [isLoadingTestPreview, setIsLoadingTestPreview] = useState(false);
  const [testPreviewSearchQuery, setTestPreviewSearchQuery] = useState('');
  const [coursesPreviewItems, setCoursesPreviewItems] = useState([]);
  const [isLoadingCoursesPreview, setIsLoadingCoursesPreview] = useState(false);
  const [zaloAccounts, setZaloAccounts] = useState([]);
  const [zaloFriendTemplate, setZaloFriendTemplate] = useState(null);

  const handleCheckSheetConnection = async () => {
    return handleNodeSheetConnectionCheck({
      onCheckSheetConnection,
      formData,
      setFormData,
      setIsCheckingSheet,
      toastNotifier: toast,
    });
  };

  const handleLoadCoursesPreview = async () => {
    await handleNodeCoursesPreviewLoad({
      formData,
      setIsLoadingCoursesPreview,
      setCoursesPreviewItems,
      toastNotifier: toast,
    });
  };

  const handleSaveClick = async () => {
    await handleNodeConfigSaveClick({
      nodeType,
      formData,
      onSave,
      handleCheckSheetConnection,
      setIsLoadingTestPreview,
      toastNotifier: toast,
      campaignId,
    });
  };

  useEffect(() => {
    if (node) {
      setSelectedZaloPersonalSection('basic');
      setSelectedZaloGroupSection('basic');
      const config = node.data?.config || {};
      setFormData(
        createNodeConfigFormData({
          config,
          label: node.data?.label || '',
          normalizeEmailSteps: true,
        })
      );
      setCourseSearchQuery(config.interestedCourseQuery || '');
      if (config.emailTemplateId) {
        fetchTemplateDetail(config.emailTemplateId)
          .then((tpl) => {
            setSelectedTemplate(tpl);
            setFormData((prev) => {
              const variables = normalizeTemplateVariables(tpl);
              if (!variables.length) return prev;
              const existingSteps = Array.isArray(prev.emailSteps) ? prev.emailSteps : [];
              if (existingSteps.length) return prev;
              const nextMappings = variables.map((key) => ({ key, sourceType: 'manual', value: '', nodeId: '', field: '' }));
              return {
                ...prev,
                emailSteps: [
                  {
                    id: `step-${Date.now()}`,
                    delayValue: 0,
                    delayUnit: 'minutes',
                    templateId: config.emailTemplateId,
                    enableLinkTracking: true,
                    templateMappings: nextMappings,
                  },
                ],
              };
            });
          })
          .catch(() => setSelectedTemplate(null));
      } else {
        setSelectedTemplate(null);
      }

      if (config.mappingTemplateId) {
        fetchTemplateDetail(config.mappingTemplateId)
          .then((tpl) => setMappingTemplate(tpl))
          .catch(() => setMappingTemplate(null));
      } else {
        setMappingTemplate(null);
      }

      if ((node.data?.nodeType || node.type) === 'send_email') {
        setFormData((prev) => {
          if (Array.isArray(prev.emailSteps) && prev.emailSteps.length) return prev;
          return {
            ...prev,
            emailSteps: [
              {
                id: `step-${Date.now()}`,
                delayValue: 0,
                delayUnit: 'minutes',
                delayFrom: 'start',
                templateId: prev.emailTemplateId || '',
                enableLinkTracking: true,
                templateMappings: [],
              },
            ],
          };
        });
      }

      if ((node.data?.nodeType || node.type) === 'send_zalo_personal') {
        setFormData((prev) => {
          const steps = Array.isArray(prev.zaloPersonalTemplateSteps) ? prev.zaloPersonalTemplateSteps : [];
          const legacyMessage = String(prev.zaloMessage || '').trim();
          if (legacyMessage) return prev;
          if (steps.length > 0) return prev;
          return {
            ...prev,
            zaloPersonalTemplateSteps: [
              {
                id: `zalo-personal-step-${Date.now()}`,
                delayValue: 0,
                delayUnit: 'minutes',
                delayFrom: 'start',
                templateId: '',
                enableLinkTracking: true,
              },
            ],
          };
        });
      }

      if ((node.data?.nodeType || node.type) === 'send_zalo_group') {
        setFormData((prev) => {
          const steps = Array.isArray(prev.zaloGroupTemplateSteps) ? prev.zaloGroupTemplateSteps : [];
          const legacyMessage = String(prev.zaloGroupMessage || '').trim();
          if (legacyMessage) return prev;
          if (steps.length > 0) return prev;
          return {
            ...prev,
            zaloGroupTemplateSteps: [
              {
                id: `zalo-group-step-${Date.now()}`,
                delayValue: 0,
                delayUnit: 'minutes',
                delayFrom: 'start',
                templateId: '',
                enableLinkTracking: true,
              },
            ],
          };
        });
      }

      if (config.recipientFormula && !config.recipientNodeId) {
        const parsed = (String(config.recipientFormula || '').trim())
          ? config.recipientFormula.match(/^\$\(\s*(['"])(.+?)\1\s*\)\.json\.items(?:\.([A-Za-z0-9_]+))?\s*$/)
          : null;
        if (parsed?.[2]) {
          const matchedNode = nodes.find((n) => (n.data?.label || n.data?.nodeType || n.type) === parsed[2]);
          if (matchedNode) {
            setFormData((prev) => ({
              ...prev,
              recipientSource: 'node',
              recipientNodeId: matchedNode.id,
              recipientField: parsed[3] || prev.recipientField || '',
            }));
          }
        }
      }
    }
  }, [node, nodes]);

  useEffect(() => {
    if (!isOpen || !node || nodeType !== 'read_interested_customers') {
      setInterestedCourseOptions([]);
      return;
    }

    let cancelled = false;
    const loadCourseOptions = async () => {
      try {
        setIsLoadingInterestedCourses(true);
        const courses = await fetchInterestedCourseOptions({
          campaignId,
          selectedIds: formData.interestedCourseIds || [],
          customerType: formData.interestedCustomerType || 'interested',
          dataSource: formData.interestedDataSource || 'database',
          courseQuery: formData.interestedCourseQuery || '',
          courseStatuses: formData.interestedCourseStatuses || [],
        });
        if (!cancelled) setInterestedCourseOptions(courses);
      } catch {
        if (!cancelled) setInterestedCourseOptions([]);
      } finally {
        if (!cancelled) setIsLoadingInterestedCourses(false);
      }
    };

    loadCourseOptions();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    nodeType,
    node,
    campaignId,
    formData.interestedCustomerType,
    formData.interestedDataSource,
    formData.interestedCourseQuery,
    formData.interestedCourseStatuses,
  ]);

  useEffect(() => {
    if (!isOpen || !node || nodeType !== 'select_zalo_account') {
      setZaloAccounts([]);
      return;
    }

    let cancelled = false;
    const loadZaloAccounts = async () => {
      try {
        const items = await fetchZaloAccountOptions();
        if (!cancelled) setZaloAccounts(items);
      } catch {
        if (!cancelled) setZaloAccounts([]);
      }
    };

    loadZaloAccounts();
    return () => {
      cancelled = true;
    };
  }, [isOpen, nodeType, node]);

  useEffect(() => {
    if (!isOpen || !node || nodeType !== 'send_zalo_friend_request') {
      setZaloFriendTemplate(null);
      return;
    }
    const templateId = parseInt(formData.zaloFriendTemplateId, 10);
    if (!templateId) {
      setZaloFriendTemplate(null);
      return;
    }
    let cancelled = false;
    const loadTemplate = async () => {
      try {
        const response = await campaignBuilderApiService.getZaloTemplateById(templateId);
        const template = response.data?.data || null;
        if (!cancelled) setZaloFriendTemplate(template);
      } catch {
        if (!cancelled) setZaloFriendTemplate(null);
      }
    };
    loadTemplate();
    return () => {
      cancelled = true;
    };
  }, [isOpen, node, nodeType, formData.zaloFriendTemplateId]);

  useEffect(() => {
    if (!zaloFriendTemplate) return;
    if (nodeType !== 'send_zalo_friend_request') return;
    const variables = normalizeTemplateVariables(zaloFriendTemplate);
    if (!variables.length) return;
    setFormData((prev) => {
      const existing = new Map((prev.zaloFriendTemplateMappings || []).map((m) => [m.key, m]));
      const mappings = variables.map((key) => {
        const current = existing.get(key) || null;
        return {
          key,
          sourceType: current?.sourceType === 'recipient_field'
            ? 'node'
            : (current?.sourceType || 'manual'),
          nodeId: current?.nodeId || prev.zaloFriendNodeId || '',
          field: current?.field || '',
          value: current?.value || '',
        };
      });
      return {
        ...prev,
        zaloFriendTemplateBody: String(
          zaloFriendTemplate.bodyText || zaloFriendTemplate.bodyHtml || prev.zaloFriendTemplateBody || ''
        ),
        zaloFriendTemplateMappings: mappings,
      };
    });
  }, [nodeType, normalizeTemplateVariables, zaloFriendTemplate]);

  const upstreamNodes = getUpstreamNodes({
    currentNodeId: node?.id,
    nodes,
    edges,
  });
  const runLogMap = buildRunLogMap(runLogs);
  const getSchemaForNodeId = (nodeId) =>
    getNodeSchemaById({
      nodeId,
      runLogMap,
      nodes,
      buildSchemaFromRows,
    });
  const sourceSchema = getSchemaForNodeId(formData.recipientNodeId);
  const zaloPhoneSourceSchema = getSchemaForNodeId(formData.zaloRecipientNodeId || formData.zaloFriendNodeId);
  const zaloGroupSourceSchema = getSchemaForNodeId(formData.zaloGroupNodeId);
  const getSaveCustomerSchema = (nodeId) => getSchemaForNodeId(nodeId || formData.saveCustomerNodeId);

  const allConfigs = getAllNodeConfigs();
  const config = allConfigs.find((n) => n.type === nodeType);
  const Icon = config?.icon || HiOutlineLightningBolt;

  const handleMappingTemplateSelect = async (templateId) => {
    await handleMappingTemplateSelectHelper({
      templateId,
      setMappingTemplate,
      setFormData,
    });
  };
  const fetchZaloTemplateDetail = async (templateId) => {
    const response = await campaignBuilderApiService.getZaloTemplateById(templateId);
    return response.data?.data || null;
  };

  /**
   * Mở file đính kèm template ngay trong luồng cấu hình node.
   *
   * Luồng hoạt động:
   * 1. Ưu tiên lấy `key` để xin URL preview mới nhất từ backend.
   * 2. Nếu không có key thì fallback dùng URL có sẵn trong metadata.
   * 3. Mở tab mới để trình duyệt tự render file inline.
   *
   * @param {object} attachment metadata file đính kèm
   */
  const handleOpenTemplateAttachment = async (attachment) => {
    const key = String(
      attachment?.key
      || attachment?.storageKey
      || attachment?.s3Key
      || ''
    ).trim();
    let nextUrl = String(
      attachment?.url
      || attachment?.link
      || attachment?.attachmentUrl
      || ''
    ).trim();

    if (key) {
      try {
        const response = await campaignBuilderApiService.getAttachmentPreviewUrlByKey(key);
        const freshUrl = String(response?.data?.data?.url || '').trim();
        if (freshUrl) {
          nextUrl = freshUrl;
        }
      } catch (error) {
        toast.error(error?.response?.data?.message || 'Không thể tạo link xem file');
        return;
      }
    }

    if (!nextUrl) {
      toast.error('Không tìm thấy đường dẫn tệp đính kèm');
      return;
    }

    window.open(nextUrl, '_blank', 'noopener,noreferrer');
  };

  const renderContent = () => {
    switch (nodeType) {
      case 'manual_trigger':
        return <NodeConfigManualTriggerSection formData={formData} setFormData={setFormData} />;
      case 'read_sheet':
        return (
          <NodeConfigReadSheetSection
            formData={formData}
            setFormData={setFormData}
            selectedReadSheetSection={selectedReadSheetSection}
            setSelectedReadSheetSection={setSelectedReadSheetSection}
            handleCheckSheetConnection={handleCheckSheetConnection}
            isCheckingSheet={isCheckingSheet}
          />
        );
      case 'read_interested_customers':
        return (
          <NodeConfigReadInterestedCustomersSection
            formData={formData}
            setFormData={setFormData}
            selectedReadInterestedCustomersSection={selectedReadInterestedCustomersSection}
            setSelectedReadInterestedCustomersSection={setSelectedReadInterestedCustomersSection}
            interestedCourseOptions={interestedCourseOptions}
            isLoadingInterestedCourses={isLoadingInterestedCourses}
            courseSearchQuery={courseSearchQuery}
            setCourseSearchQuery={setCourseSearchQuery}
            testPreviewItems={testPreviewItems}
            setTestPreviewItems={setTestPreviewItems}
            isLoadingTestPreview={isLoadingTestPreview}
            setIsLoadingTestPreview={setIsLoadingTestPreview}
            testPreviewSearchQuery={testPreviewSearchQuery}
            setTestPreviewSearchQuery={setTestPreviewSearchQuery}
            campaignId={campaignId}
          />
        );
      case 'mapping_data':
        return (
          <NodeConfigMappingDataSection
            formData={formData}
            setFormData={setFormData}
            emailTemplates={emailTemplates}
            mappingTemplate={mappingTemplate}
            handleMappingTemplateSelect={handleMappingTemplateSelect}
          />
        );
      case 'read_courses_db':
        return (
          <NodeConfigReadCoursesDbSection
            formData={formData}
            setFormData={setFormData}
            selectedReadCoursesDbSection={selectedReadCoursesDbSection}
            setSelectedReadCoursesDbSection={setSelectedReadCoursesDbSection}
            handleLoadCoursesPreview={handleLoadCoursesPreview}
            isLoadingCoursesPreview={isLoadingCoursesPreview}
            coursesPreviewItems={coursesPreviewItems}
          />
        );
      case 'save_customer':
        return (
          <NodeConfigSaveCustomerSection
            formData={formData}
            setFormData={setFormData}
            selectedSaveCustomerSection={selectedSaveCustomerSection}
            setSelectedSaveCustomerSection={setSelectedSaveCustomerSection}
            upstreamNodes={upstreamNodes}
            getSaveCustomerSchema={getSaveCustomerSchema}
          />
        );
      case 'send_email':
        return (
          <NodeConfigSendEmailSection
            formData={formData}
            setFormData={setFormData}
            selectedEmailSection={selectedEmailSection}
            setSelectedEmailSection={setSelectedEmailSection}
            emailSettings={emailSettings}
            emailTemplates={emailTemplates}
            upstreamNodes={upstreamNodes}
            sourceSchema={sourceSchema}
            getSchemaForNodeId={getSchemaForNodeId}
            fetchTemplateDetail={fetchTemplateDetail}
            normalizeTemplateVariables={normalizeTemplateVariables}
            onOpenTemplateAttachment={handleOpenTemplateAttachment}
          />
        );
      case 'select_zalo_account':
        return (
          <NodeConfigSelectZaloAccountSection
            formData={formData}
            setFormData={setFormData}
            zaloAccounts={zaloAccounts}
          />
        );
      case 'get_all_friends':
        return (
          <NodeConfigGetAllFriendsSection
            formData={formData}
            setFormData={setFormData}
            upstreamNodes={upstreamNodes}
          />
        );
      case 'get_all_groups':
        return (
          <NodeConfigGetAllGroupsSection
            formData={formData}
            setFormData={setFormData}
            upstreamNodes={upstreamNodes}
          />
        );
      case 'send_zalo_personal':
        return (
          <NodeConfigSendZaloPersonalSection
            formData={formData}
            setFormData={setFormData}
            selectedSection={selectedZaloPersonalSection}
            setSelectedSection={setSelectedZaloPersonalSection}
            upstreamNodes={upstreamNodes}
            phoneSourceSchema={zaloPhoneSourceSchema}
            zaloTemplates={zaloTemplates}
            fetchTemplateById={fetchZaloTemplateDetail}
            getSchemaForNodeId={getSchemaForNodeId}
            normalizeTemplateVariables={normalizeTemplateVariables}
            onOpenTemplateAttachment={handleOpenTemplateAttachment}
          />
        );
      case 'send_zalo_friend_request':
        return (
          <NodeConfigSendZaloFriendRequestSection
            formData={formData}
            setFormData={setFormData}
            upstreamNodes={upstreamNodes}
            phoneSourceSchema={zaloPhoneSourceSchema}
            getSchemaForNodeId={getSchemaForNodeId}
            zaloTemplates={zaloTemplates}
            selectedTemplate={zaloFriendTemplate}
            normalizeTemplateVariables={normalizeTemplateVariables}
          />
        );
      case 'send_zalo_group':
        return (
          <NodeConfigSendZaloGroupSection
            formData={formData}
            setFormData={setFormData}
            selectedSection={selectedZaloGroupSection}
            setSelectedSection={setSelectedZaloGroupSection}
            upstreamNodes={upstreamNodes}
            groupSourceSchema={zaloGroupSourceSchema}
            zaloTemplates={zaloTemplates}
            fetchTemplateById={fetchZaloTemplateDetail}
            getSchemaForNodeId={getSchemaForNodeId}
            normalizeTemplateVariables={normalizeTemplateVariables}
            onOpenTemplateAttachment={handleOpenTemplateAttachment}
          />
        );
      default:
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tên node</label>
              <input
                type="text"
                value={formData.label}
                onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                maxLength={255}
              />
            </div>
            <div className="text-sm text-gray-500">
              Cấu hình chi tiết cho node "{config?.name || nodeType}" sẽ được bổ sung sau.
            </div>
          </div>
        );
    }
  };

  return (
    <FullScreenOverlay isOpen={isOpen} className="overflow-y-auto py-8">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl mx-4 my-auto">
        <div className="flex items-center gap-3 p-4 border-b">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: config?.bgColor || '#E8EAF6' }}
          >
            <Icon className="w-5 h-5" style={{ color: config?.iconColor || '#5C6BC0' }} />
          </div>
          <div>
            <span className="text-sm text-gray-500">Cấu hình:</span>
            <span className="text-primary-600 font-medium ml-1">{config?.name || 'Node'}</span>
          </div>
          <button onClick={onClose} className="ml-auto p-1 hover:bg-gray-100 rounded-lg">
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 max-h-[70vh] overflow-y-auto">{renderContent()}</div>

        <div className="flex justify-end gap-3 p-4 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            Hủy
          </button>
          <button
            onClick={handleSaveClick}
            disabled={isCheckingSheet}
            className={`px-4 py-2 rounded-lg transition-colors ${
              isCheckingSheet ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-primary-500 text-white hover:bg-primary-600'
            }`}
          >
            Lưu
          </button>
        </div>
      </div>
    </FullScreenOverlay>
  );
};

export default NodeConfigModal;
