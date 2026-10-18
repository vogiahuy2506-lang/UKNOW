import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';
import campaignBuilderApiService from '../services/campaignBuilderApi.service';
import { buildSchemaFromRows } from '../utils/campaignBuilderRuntime';
import {
  createNodeConfigFormData,
  fetchZaloAccountOptions,
  fetchTelegramAccountOptions,
  fetchWhatsAppAccountOptions,
  isRequestCanceled,
  describeRequestFailure,
  fetchInterestedCourseOptions,
  fetchTemplateDetail,
  handleNodeConfigSaveClick,
  handleMappingTemplateSelect as handleMappingTemplateSelectHelper,
  handleNodeCoursesPreviewLoad,
  handleNodeProductsPreviewLoad,
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
import { NodeConfigSendTelegramSection } from './NodeConfigModalSendTelegramSection';
import { NodeConfigSendWhatsAppSection } from './NodeConfigModalSendWhatsAppSection';
import {
  NodeConfigReadCoursesDbSection,
  NodeConfigReadProductsDbSection,
  NodeConfigReadInterestedCustomersSection,
  NodeConfigReadSheetSection,
} from './NodeConfigModalReadSections';
import { NodeConfigReadLandingLeadsSection } from './NodeConfigReadLandingLeadsSection';
import { NodeConfigReadFormSubmissionsSection } from './NodeConfigReadFormSubmissionsSection';
import { NodeConfigSelectZaloAccountSection } from './NodeConfigModalSelectZaloAccountSection';
import {
  NodeConfigConditionSection,
  NodeConfigTagContactSection,
  NodeConfigUpdateAttributeSection,
} from './NodeConfigModalLogicSection';

/**
 * Form cấu hình MỘT khối chiến dịch (tách khỏi `NodeConfigModal` — PLAN_THIET_LAP_CAU_HINH_TRUC_TIEP PR-A1).
 * Dùng ở hai nơi: hộp cấu hình của Sơ đồ khối (`variant="modal"`, bọc bởi `NodeConfigModal`) và thẻ khối ở tab Thiết lập
 * (`variant="inline"`, sửa tại chỗ). Form chỉ khởi tạo lại khi ĐỔI KHỐI (`node.id`), không theo mỗi lần `nodes` đổi
 * → đang gõ mà trạng thái khối cập nhật (Chạy thử) thì chữ còn nguyên.
 *
 * @param {object} props
 * @param {() => void} props.onCancel bấm Hủy
 * @param {(formData: object) => void} props.onSave bấm Lưu (sau khi qua kiểm tra riêng của từng loại khối)
 * @param {'modal'|'inline'} [props.variant='modal'] 'modal' = thân cuộn 70vh + chân nút; 'inline' = nằm trong thẻ, không khung cuộn
 * @param {(formData: object, isDirty: boolean) => void} [props.onFormChange] báo mỗi lần form đổi; `isDirty` = khác bản vừa khởi tạo
 * @param {string|null} [props.initialSection] id mục form mở sẵn (email / Zalo cá nhân / Zalo nhóm / đọc sheet / khách đã lưu / khoá học /
 *   sản phẩm / lưu khách). Không truyền → mục `basic` như cũ (Sơ đồ khối không truyền). Có truyền → focus ô nhập đầu tiên của mục.
 * @param {number} [props.sectionRequestId] đổi giá trị → áp lại `initialSection` + focus lại (nút Sửa của checklist bấm khi thẻ này đang mở)
 */
const NodeConfigForm = ({
  isOpen = true,
  onCancel,
  variant = 'modal',
  onFormChange,
  initialSection = null,
  sectionRequestId = 0,
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
  campaignType = '',
}) => {
  const { t, locale } = useI18n();
  const nodeType = node?.data?.nodeType;
  const existingConfig = node?.data?.config || {};

  const [formData, setFormData] = useState(
    createNodeConfigFormData({
      config: existingConfig,
      label: node?.data?.label || '',
      normalizeEmailSteps: false,
      nodeType,
      campaignType,
    })
  );

  // `nodes` chỉ cần lúc khởi tạo (đổi `recipientFormula` → `recipientNodeId`) nên đọc qua ref, không đưa vào deps của effect.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  // Bản form ngay sau khi khởi tạo xong (đã gồm bước mặc định do effect thêm) — mốc để biết người dùng có sửa gì chưa.
  const baselineRef = useRef(null);

  const [, setSelectedTemplate] = useState(null);
  const [mappingTemplate, setMappingTemplate] = useState(null);
  const [isCheckingSheet, setIsCheckingSheet] = useState(false);
  const [interestedCourseOptions, setInterestedCourseOptions] = useState([]);
  const [isLoadingInterestedCourses, setIsLoadingInterestedCourses] = useState(false);
  const [courseSearchQuery, setCourseSearchQuery] = useState('');
  // Mục mở sẵn theo loại khối (PR-D): chỉ loại khối nào có thanh mục mới nhận `initialSection`, loại khác giữ 'basic'.
  const sectionFor = (type) => (initialSection && nodeType === type ? initialSection : 'basic');
  const [selectedEmailSection, setSelectedEmailSection] = useState(() => sectionFor('send_email'));
  const [selectedSaveCustomerSection, setSelectedSaveCustomerSection] = useState(() => sectionFor('save_customer'));
  const [selectedReadSheetSection, setSelectedReadSheetSection] = useState(() => sectionFor('read_sheet'));
  const [selectedReadInterestedCustomersSection, setSelectedReadInterestedCustomersSection] = useState(() => sectionFor('read_interested_customers'));
  const [selectedReadCoursesDbSection, setSelectedReadCoursesDbSection] = useState(() => sectionFor('read_courses_db'));
  const [selectedReadProductsDbSection, setSelectedReadProductsDbSection] = useState(() => sectionFor('read_products_db'));
  const [selectedZaloPersonalSection, setSelectedZaloPersonalSection] = useState(() => sectionFor('send_zalo_personal'));
  const [selectedZaloGroupSection, setSelectedZaloGroupSection] = useState(() => sectionFor('send_zalo_group'));
  const contentRef = useRef(null);
  const pendingFocusRef = useRef(0); // số lượt render còn thử focus (ô nhập có thể xuất hiện sau effect khởi tạo)
  const [testPreviewItems, setTestPreviewItems] = useState([]);
  const [isLoadingTestPreview, setIsLoadingTestPreview] = useState(false);
  const [testPreviewSearchQuery, setTestPreviewSearchQuery] = useState('');
  const [coursesPreviewItems, setCoursesPreviewItems] = useState([]);
  const [isLoadingCoursesPreview, setIsLoadingCoursesPreview] = useState(false);
  const [productsPreviewItems, setProductsPreviewItems] = useState([]);
  const [isLoadingProductsPreview, setIsLoadingProductsPreview] = useState(false);
  const [zaloAccounts, setZaloAccounts] = useState([]);
  // idle (chưa/không rõ: bị huỷ) | loading | loaded (API trả thành công, kể cả mảng rỗng) | error.
  // Trước đây một `catch { setZaloAccounts([]) }` biến MỌI lỗi thành "Chưa có tài khoản Zalo khả dụng"
  // — nói sai sự thật (production có 3 tài khoản) và chỉ người dùng đi tìm thứ đang nằm sẵn ở đó.
  const [zaloAccountsStatus, setZaloAccountsStatus] = useState('idle');
  const [zaloAccountsError, setZaloAccountsError] = useState('');
  const [zaloAccountsReloadKey, setZaloAccountsReloadKey] = useState(0);
  const [zaloFriendTemplate, setZaloFriendTemplate] = useState(null);
  // PLAN_PR7_NODE_TELEGRAM_TRINH_DUNG_2026-09-28 Việc 4 — cùng khuôn zaloAccounts* ở trên.
  const [telegramAccounts, setTelegramAccounts] = useState([]);
  const [telegramAccountsStatus, setTelegramAccountsStatus] = useState('idle');
  const [telegramAccountsError, setTelegramAccountsError] = useState('');
  const [telegramAccountsReloadKey, setTelegramAccountsReloadKey] = useState(0);
  // PLAN_WHATSAPP_DAY_DU_2026-09-29 PR-W4b — cùng khuôn telegramAccounts* ở trên.
  const [whatsappAccounts, setWhatsappAccounts] = useState([]);
  const [whatsappAccountsStatus, setWhatsappAccountsStatus] = useState('idle');
  const [whatsappAccountsError, setWhatsappAccountsError] = useState('');
  const [whatsappAccountsReloadKey, setWhatsappAccountsReloadKey] = useState(0);

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

  const handleLoadProductsPreview = async () => {
    await handleNodeProductsPreviewLoad({
      formData,
      setIsLoadingProductsPreview,
      setProductsPreviewItems,
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
          nodeType: node.data?.nodeType,
          campaignType,
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
          const matchedNode = nodesRef.current.find((n) => (n.data?.label || n.data?.nodeType || n.type) === parsed[2]);
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

      // Updater chạy theo thứ tự hàng đợi → thấy form SAU mọi bước khởi tạo ở trên. Idempotent (StrictMode chạy hai lần cũng được).
      setFormData((prev) => {
        baselineRef.current = JSON.stringify(prev);
        return prev;
      });
    }
    // Khởi tạo theo `node?.id` (không theo `node`/`nodes`): object khối đổi identity mỗi lần cha render / mỗi lần Chạy thử cập nhật
    // trạng thái khối, mà dựng lại form lúc đó là mất chữ người dùng đang gõ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id, campaignType]);

  // PR-D: áp `initialSection` (lúc mở và mỗi lần `sectionRequestId` đổi) — khai báo SAU effect khởi tạo ở trên, vì effect đó đặt lại
  // mục Zalo về 'basic'. Sau khi mục hiển thị thì focus ô nhập đầu tiên (effect không deps bên dưới).
  useEffect(() => {
    if (!initialSection || !node) return;
    const setters = {
      send_email: setSelectedEmailSection,
      send_zalo_personal: setSelectedZaloPersonalSection,
      send_zalo_group: setSelectedZaloGroupSection,
      read_sheet: setSelectedReadSheetSection,
      read_interested_customers: setSelectedReadInterestedCustomersSection,
      read_courses_db: setSelectedReadCoursesDbSection,
      read_products_db: setSelectedReadProductsDbSection,
      save_customer: setSelectedSaveCustomerSection,
    };
    const setter = setters[nodeType];
    if (!setter) return;
    setter(initialSection);
    pendingFocusRef.current = 6;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSection, sectionRequestId, node?.id]);

  useEffect(() => {
    if (pendingFocusRef.current <= 0) return;
    const root = contentRef.current;
    if (!root) return;
    const shownSection = {
      send_email: selectedEmailSection,
      send_zalo_personal: selectedZaloPersonalSection,
      send_zalo_group: selectedZaloGroupSection,
      read_sheet: selectedReadSheetSection,
      read_interested_customers: selectedReadInterestedCustomersSection,
      read_courses_db: selectedReadCoursesDbSection,
      read_products_db: selectedReadProductsDbSection,
      save_customer: selectedSaveCustomerSection,
    }[nodeType];
    // Mục yêu cầu chưa hiển thị (state vừa đặt, chờ lượt render kế) → chờ, đừng focus nhầm ô của mục cũ.
    if (shownSection !== initialSection) return;
    const target = root.querySelector('[data-section-focus]')
      || root.querySelector('textarea:not([disabled])')
      || root.querySelector('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=number]):not([disabled]), select:not([disabled])');
    // Chưa có ô nhập (vd bước mặc định của email do effect khởi tạo thêm ở lượt sau) → thử lại ở lượt render kế, tối đa vài lượt.
    if (!target || typeof target.focus !== 'function') {
      pendingFocusRef.current -= 1;
      return;
    }
    pendingFocusRef.current = 0;
    target.focus();
  });

  useEffect(() => {
    if (typeof onFormChange !== 'function') return;
    onFormChange(formData, baselineRef.current !== null && JSON.stringify(formData) !== baselineRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData]);

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
    node?.id,
    campaignId,
    formData.interestedCustomerType,
    formData.interestedDataSource,
    formData.interestedCourseQuery,
    formData.interestedCourseStatuses,
  ]);

  useEffect(() => {
    if (!isOpen || !node || nodeType !== 'select_zalo_account') {
      setZaloAccounts([]);
      setZaloAccountsStatus('idle');
      setZaloAccountsError('');
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    const loadZaloAccounts = async () => {
      setZaloAccountsStatus('loading');
      setZaloAccountsError('');
      try {
        const items = await fetchZaloAccountOptions({ signal: controller.signal });
        if (cancelled) return;
        setZaloAccounts(items);
        setZaloAccountsStatus('loaded');
      } catch (error) {
        if (cancelled) return;
        // Huỷ request KHÔNG phải lỗi: không báo lỗi, cũng không kết luận "chưa có tài khoản".
        if (isRequestCanceled(error)) {
          setZaloAccountsStatus('idle');
          return;
        }
        setZaloAccounts([]);
        setZaloAccountsError(describeRequestFailure(error));
        setZaloAccountsStatus('error');
      }
    };

    loadZaloAccounts();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // `node?.id` chứ không phải `node`: object node đổi identity mỗi lần cha render, hiệu ứng bắn lại
    // rồi tự huỷ chính request đang bay của mình.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, nodeType, node?.id, zaloAccountsReloadKey]);

  // PLAN_PR7_NODE_TELEGRAM_TRINH_DUNG_2026-09-28 Việc 4 — cùng khuôn effect zaloAccounts ở trên.
  useEffect(() => {
    if (!isOpen || !node || nodeType !== 'send_telegram') {
      setTelegramAccounts([]);
      setTelegramAccountsStatus('idle');
      setTelegramAccountsError('');
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    const loadTelegramAccounts = async () => {
      setTelegramAccountsStatus('loading');
      setTelegramAccountsError('');
      try {
        const items = await fetchTelegramAccountOptions({ signal: controller.signal });
        if (cancelled) return;
        setTelegramAccounts(items);
        setTelegramAccountsStatus('loaded');
      } catch (error) {
        if (cancelled) return;
        if (isRequestCanceled(error)) {
          setTelegramAccountsStatus('idle');
          return;
        }
        setTelegramAccounts([]);
        setTelegramAccountsError(describeRequestFailure(error));
        setTelegramAccountsStatus('error');
      }
    };

    loadTelegramAccounts();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, nodeType, node?.id, telegramAccountsReloadKey]);

  // PLAN_WHATSAPP_DAY_DU_2026-09-29 PR-W4b — cùng khuôn effect telegramAccounts ở trên.
  useEffect(() => {
    if (!isOpen || !node || nodeType !== 'send_whatsapp') {
      setWhatsappAccounts([]);
      setWhatsappAccountsStatus('idle');
      setWhatsappAccountsError('');
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    const loadWhatsappAccounts = async () => {
      setWhatsappAccountsStatus('loading');
      setWhatsappAccountsError('');
      try {
        const items = await fetchWhatsAppAccountOptions({ signal: controller.signal });
        if (cancelled) return;
        setWhatsappAccounts(items);
        setWhatsappAccountsStatus('loaded');
      } catch (error) {
        if (cancelled) return;
        if (isRequestCanceled(error)) {
          setWhatsappAccountsStatus('idle');
          return;
        }
        setWhatsappAccounts([]);
        setWhatsappAccountsError(describeRequestFailure(error));
        setWhatsappAccountsStatus('error');
      }
    };

    loadWhatsappAccounts();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, nodeType, node?.id, whatsappAccountsReloadKey]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, node?.id, nodeType, formData.zaloFriendTemplateId]);

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
  }, [nodeType, zaloFriendTemplate]);

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
  const configLabel = (locale === 'vi' && config?.nameVi) || config?.name;

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
        toast.error(error?.response?.data?.message || t('errors.cannotCreateFileLink'));
        return;
      }
    }

    if (!nextUrl) {
      toast.error(t('errors.fileAttachmentNotFound'));
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
            zaloTemplates={zaloTemplates}
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
      case 'read_products_db':
        return (
          <NodeConfigReadProductsDbSection
            formData={formData}
            setFormData={setFormData}
            selectedReadProductsDbSection={selectedReadProductsDbSection}
            setSelectedReadProductsDbSection={setSelectedReadProductsDbSection}
            handleLoadProductsPreview={handleLoadProductsPreview}
            isLoadingProductsPreview={isLoadingProductsPreview}
            productsPreviewItems={productsPreviewItems}
          />
        );
      case 'read_landing_leads':
        return <NodeConfigReadLandingLeadsSection formData={formData} setFormData={setFormData} />;
      case 'read_form_submissions':
        return <NodeConfigReadFormSubmissionsSection formData={formData} setFormData={setFormData} />;
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
            zaloAccountsStatus={zaloAccountsStatus}
            zaloAccountsError={zaloAccountsError}
            onRetryZaloAccounts={() => setZaloAccountsReloadKey((key) => key + 1)}
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
      case 'send_telegram':
        return (
          <NodeConfigSendTelegramSection
            formData={formData}
            setFormData={setFormData}
            telegramAccounts={telegramAccounts}
            telegramAccountsStatus={telegramAccountsStatus}
            telegramAccountsError={telegramAccountsError}
            onRetryTelegramAccounts={() => setTelegramAccountsReloadKey((key) => key + 1)}
            campaignType={campaignType}
            zaloTemplates={zaloTemplates}
            fetchTemplateById={fetchZaloTemplateDetail}
          />
        );
      case 'send_whatsapp':
        return (
          <NodeConfigSendWhatsAppSection
            formData={formData}
            setFormData={setFormData}
            whatsappAccounts={whatsappAccounts}
            whatsappAccountsStatus={whatsappAccountsStatus}
            whatsappAccountsError={whatsappAccountsError}
            onRetryWhatsappAccounts={() => setWhatsappAccountsReloadKey((key) => key + 1)}
            upstreamNodes={upstreamNodes}
            sourceSchema={sourceSchema}
            zaloTemplates={zaloTemplates}
            fetchTemplateById={fetchZaloTemplateDetail}
          />
        );
      case 'condition':
        return <NodeConfigConditionSection formData={formData} setFormData={setFormData} />;
      case 'tag_contact':
        return (
          <NodeConfigTagContactSection
            formData={formData}
            setFormData={setFormData}
            upstreamNodes={upstreamNodes}
          />
        );
      case 'update_attribute':
        return (
          <NodeConfigUpdateAttributeSection
            formData={formData}
            setFormData={setFormData}
            upstreamNodes={upstreamNodes}
          />
        );
      default:
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dk-text mb-1">{t('campaignBuilder.nodeName')}</label>
              <input
                type="text"
                value={formData.label}
                onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dk-border bg-white dark:bg-dk-raised text-gray-900 dark:text-dk-text rounded-lg focus:ring-2 focus:ring-primary-500 dark:placeholder-dk-muted"
                maxLength={255}
              />
            </div>
            <div className="text-sm text-gray-500 dark:text-dk-text2">
              {t('campaignBuilder.pendingConfig', { name: configLabel || nodeType })}
            </div>
          </div>
        );
    }
  };

  const isInline = variant === 'inline';
  return (
    <>
      <div
        ref={contentRef}
        className={isInline ? 'pt-3' : 'p-4 max-h-[70vh] overflow-y-auto'}
        data-testid={isInline ? 'node-config-form-inline' : undefined}
      >
        {renderContent()}
      </div>

      <div
        className={
          isInline
            ? 'mt-4 flex flex-wrap justify-end gap-3 border-t border-gray-200 pt-3 dark:border-dk-border'
            : 'flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-dk-border bg-gray-50 dark:bg-dk-bg rounded-b-xl'
        }
      >
        <button
          type="button"
          onClick={onCancel}
          data-testid="node-config-cancel"
          className="px-4 py-2 text-gray-700 dark:text-dk-text hover:bg-gray-100 dark:hover:bg-dk-raised rounded-lg transition-colors"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={handleSaveClick}
          disabled={isCheckingSheet}
          data-testid="node-config-save"
          className={`px-4 py-2 rounded-lg transition-colors ${
            isCheckingSheet ? 'bg-gray-300 text-gray-600 cursor-not-allowed dark:bg-dk-strong dark:text-dk-text2' : 'bg-primary-500 text-white hover:bg-primary-600'
          }`}
        >
          {t('common.save')}
        </button>
      </div>
    </>
  );
};

export default NodeConfigForm;
