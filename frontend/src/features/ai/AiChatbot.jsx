import { useState, useRef, useEffect } from 'react';
import useIsMobile from '../../hooks/useIsMobile';
import { useNavigate, Link } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';
import {
  HiOutlineSparkles, HiOutlinePaperClip, HiOutlineX,
  HiOutlineChevronRight, HiOutlinePlay, HiOutlineArrowRight,
  HiOutlineMail,
  HiOutlineGlobeAlt,
  HiOutlinePlus,
} from 'react-icons/hi';
import { writeCampaignDraft } from '../../utils/campaignDraftStorage';
import { toast } from 'react-hot-toast';
import aiApi from '../../services/aiApi';
import api from '../../services/api';
import LandingPageCard from './components/LandingPageCard';
import {
  AiContent, TemplateDraftCard, AskMoreCard, AskCampaignTypeCard, AskCampaignDetailsCard,
  AskLandingDetailsCard, AskAudienceCard, CampaignDraftEditor, ConfirmCreateCard,
  AutoCreatingCard, AutoCreatedSuccessCard, CampaignPickerModal,
} from './components/AiChatbotCards';

const AiChatbot = ({ isOpen, onToggle, panelWidth = 420, onWidthChange, onResizeStart, onResizeEnd }) => {
  const { t, locale } = useI18n();
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'admin';

  const welcomeMessage = isSuperAdmin
    ? t('aiChatbot.welcomeAdmin')
    : t('aiChatbot.welcomeUser');

  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: welcomeMessage,
  }]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [currentScript, setCurrentScript] = useState(null);
  const [hasProfile, setHasProfile] = useState(true);
  const [showCampaignPicker, setShowCampaignPicker] = useState(false);
  const [selectedScriptForPush, setSelectedScriptForPush] = useState(null);
  const [pendingLandingPrompt, setPendingLandingPrompt] = useState(null);
  const [pendingLandingData, setPendingLandingData] = useState(null);
  const [_creatingCampaign, setCreatingCampaign] = useState(false);
  const [autoCreatedCampaign, setAutoCreatedCampaign] = useState(null);
  
  // Trạng thái cho flow campaign mới: hỏi chọn type → hỏi audience → confirm → tạo
  const [pendingCampaignPrompt, setPendingCampaignPrompt] = useState(null); // Prompt gốc của user
  const [pendingCampaignData, setPendingCampaignData] = useState(null); // Data từ AI khi hỏi campaign type
  const [isEditingDraft, setIsEditingDraft] = useState(false); // Đang chỉnh sửa draft trong chatbot
  const [_selectedCampaignType, setSelectedCampaignType] = useState(null); // Type đã chọn (email/zalo/zalo_group)
  const [_selectedAudience, setSelectedAudience] = useState(null); // Audience đã chọn (interested/cart_abandoned/all)

  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);

  const isMobile = useIsMobile();
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const panelDragStartXRef = useRef(0);
  const panelDragStartWidthRef = useRef(panelWidth);

  const messagesEndRef = useRef(null);
  const isSendingRef = useRef(false);
  const fileInputRef = useRef(null);
  const hasInitializedRef = useRef(false);
  const tabsScrollRef = useRef(null);
  const tabsDragRef = useRef({ dragging: false, startX: 0, scrollLeft: 0, moved: false });
  const currentSessionIdRef = useRef(null);
  const sessionMessagesCache = useRef(new Map()); // sessionId → messages[] (for background generation)
  const pendingTabIdRef = useRef(new Set()); // non-rendering check
  const [pendingTabIds, setPendingTabIds] = useState(new Set()); // for tab dot indicator
  const navigate = useNavigate();

  useEffect(() => {
    if (!isResizingPanel) return;

    const handleMouseMove = (e) => {
      const delta = panelDragStartXRef.current - e.clientX;
      const nextWidth = Math.min(700, Math.max(320, panelDragStartWidthRef.current + delta));
      onWidthChange?.(nextWidth);
    };

    const handleMouseUp = () => {
      setIsResizingPanel(false);
      onResizeEnd?.();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingPanel, onWidthChange, onResizeEnd]);

  const handlePanelResizeStart = (e) => {
    e.preventDefault();
    setIsResizingPanel(true);
    panelDragStartXRef.current = e.clientX;
    panelDragStartWidthRef.current = panelWidth;
    onResizeStart?.();
  };

  // Keep currentSessionIdRef in sync so async closures can check the current session
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  const markTabPending = (sessionId) => {
    if (!sessionId) return;
    pendingTabIdRef.current.add(sessionId);
    setPendingTabIds(new Set(pendingTabIdRef.current));
  };
  const clearTabPending = (sessionId) => {
    if (!sessionId) return;
    pendingTabIdRef.current.delete(sessionId);
    setPendingTabIds(new Set(pendingTabIdRef.current));
  };
  // Creates a session-aware setMessages wrapper. Updates cache always; updates display only if user is still on this session.
  const makeUpdater = (sessionId, baseMessages) => {
    let snapshot = baseMessages;
    return (updater) => {
      snapshot = typeof updater === 'function' ? updater(snapshot) : updater;
      if (sessionId) {
        sessionMessagesCache.current.set(sessionId, snapshot);
        if (currentSessionIdRef.current === sessionId) setMessages(updater);
      } else {
        setMessages(updater); // new session (no ID yet): use normal update
      }
    };
  };

  const loadSession = async (sessionId) => {
    // If this session has cached messages (background generation in-progress or just completed), load from cache
    if (sessionMessagesCache.current.has(sessionId)) {
      setCurrentSessionId(sessionId);
      setMessages(sessionMessagesCache.current.get(sessionId));
      setIsTyping(pendingTabIdRef.current.has(sessionId));
      return;
    }
    try {
      const res = await aiApi.getSessionMessages(sessionId);
      const dbMessages = res.data || [];

      // Tìm assistant message cuối cùng có type tương tác
      let lastAssistantIdx = -1;
      for (let i = dbMessages.length - 1; i >= 0; i--) {
        if (dbMessages[i].role === 'assistant') { lastAssistantIdx = i; break; }
      }
      const lastAssistant = lastAssistantIdx >= 0 ? dbMessages[lastAssistantIdx] : null;
      const interactiveTypes = ['ask_landing_details', 'ask_campaign_details', 'ask_campaign_type', 'ask_audience', 'confirm_create', 'landing_page', 'template_draft', 'auto_created_success'];

      const mappedMessages = dbMessages.map((m) => {
        if (m.role === 'assistant' && interactiveTypes.includes(m.type)) {
          return { role: m.role, content: m.content, type: m.type, data: m.data };
        }
        return { role: m.role, content: m.content };
      });

      setMessages([{ role: 'assistant', content: welcomeMessage }, ...mappedMessages]);
      setCurrentSessionId(sessionId);

      // Restore pending state cho card tương tác cuối cùng
      const lastUserMsg = lastAssistantIdx > 0
        ? [...dbMessages].slice(0, lastAssistantIdx).reverse().find(m => m.role === 'user')
        : null;

      if (lastAssistant?.type === 'ask_landing_details') {
        setPendingLandingPrompt(lastUserMsg?.content || '');
        setPendingLandingData(lastAssistant.data);
        setPendingCampaignPrompt(null); setPendingCampaignData(null); setCurrentScript(null);
      } else if (['ask_campaign_details', 'ask_campaign_type'].includes(lastAssistant?.type)) {
        setPendingCampaignPrompt(lastUserMsg?.content || '');
        setPendingCampaignData(lastAssistant.data);
        setPendingLandingPrompt(null); setPendingLandingData(null); setCurrentScript(null);
      } else if (lastAssistant?.type === 'confirm_create') {
        setCurrentScript(lastAssistant.data);
        setPendingCampaignPrompt(null); setPendingCampaignData(null);
        setPendingLandingPrompt(null); setPendingLandingData(null);
      } else {
        setPendingCampaignPrompt(null); setPendingCampaignData(null);
        setPendingLandingPrompt(null); setPendingLandingData(null); setCurrentScript(null);
      }
    } catch { /* silent */ }
  };

  const startNewChat = () => {
    setCurrentSessionId(null);
    setMessages([{ role: 'assistant', content: welcomeMessage }]);
    setPendingCampaignPrompt(null);
    setPendingCampaignData(null);
    setPendingLandingPrompt(null);
    setPendingLandingData(null);
    setCurrentScript(null);
  };

  const handleDeleteSession = async (sessionId, e) => {
    e.stopPropagation();
    try {
      await aiApi.deleteSession(sessionId);
      const updated = sessions.filter(s => s.id !== sessionId);
      setSessions(updated);
      if (currentSessionId === sessionId) {
        if (updated.length > 0) {
          await loadSession(updated[0].id);
        } else {
          startNewChat();
        }
      }
    } catch { /* silent */ }
  };

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      if (!isSuperAdmin) {
        aiApi.getBusinessProfile()
          .then(res => setHasProfile(!!res.data))
          .catch(() => setHasProfile(true));
      }
      // Load sessions một lần khi panel mở lần đầu
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true;
        aiApi.getSessions()
          .then(res => {
            const list = res.data || [];
            setSessions(list);
            if (list.length > 0) loadSession(list[0].id);
          })
          .catch(() => {});
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ scroll khi messages đổi; isOpen chỉ là guard
  }, [messages]);

  const uploadFiles = async (files) => {
    if (!files.length) return;
    setIsUploading(true);
    try {
      const results = await Promise.all(files.map(async (file) => {
        const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
        const fd = new FormData();
        fd.append('file', file);
        const res = await api.post('/uploads/temp', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        return { ...res.data.data, previewUrl };
      }));
      setUploadedFiles(prev => [...prev, ...results]);
      toast.success(`Đã tải lên ${results.length} tệp`);
    } catch {
      toast.error('Tải tệp lên thất bại');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = (e) => uploadFiles(Array.from(e.target.files));

  const fileChipMeta = (f) => {
    const ext = (f.originalName || '').split('.').pop().toLowerCase();
    if (f.previewUrl || ['jpg','jpeg','png','webp','gif'].includes(ext))
      return { label: 'Ảnh', icon: null, bg: 'bg-blue-50 border-blue-200', text: 'text-blue-600' };
    if (['xlsx','xls','csv'].includes(ext))
      return { label: 'Excel', icon: null, bg: 'bg-green-50 border-green-200', text: 'text-green-600' };
    if (ext === 'pdf')
      return { label: 'PDF', icon: null, bg: 'bg-red-50 border-red-200', text: 'text-red-500' };
    if (['doc','docx'].includes(ext))
      return { label: 'Word', icon: null, bg: 'bg-sky-50 border-sky-200', text: 'text-sky-600' };
    return { label: 'File', icon: null, bg: 'bg-slate-100 border-slate-200', text: 'text-slate-500' };
  };

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragEnter = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) uploadFiles(files);
  };

  const handleSend = async () => {
    if (isSendingRef.current) return;
    if (!inputText.trim() && !uploadedFiles.length) return;
    isSendingRef.current = true;

    // Background-safe session tracking
    let mySessionId = currentSessionId;
    const update = makeUpdater(mySessionId, [...messages]);
    if (mySessionId) markTabPending(mySessionId);

    const userMsg = { role: 'user', content: inputText, files: [...uploadedFiles] };
    const newHistory = [...messages, userMsg];
    update(newHistory);
    setInputText('');
    setUploadedFiles([]);
    setIsTyping(true);

    try {
      const response = await aiApi.chat(newHistory, userMsg.files, currentSessionId, locale);
      if (response.success) {
        const { type, content, data, missing_fields, sessionId: returnedSessionId, sessionTitle } = response.data;
        // Cập nhật session state
        if (returnedSessionId && !currentSessionId) {
          mySessionId = returnedSessionId;
          markTabPending(mySessionId);
          setCurrentSessionId(returnedSessionId);
          setSessions(prev => [{ id: returnedSessionId, title: sessionTitle || inputText.slice(0, 60), updated_at: new Date().toISOString(), created_at: new Date().toISOString() }, ...prev]);
        } else if (returnedSessionId) {
          setSessions(prev => prev.map(s => s.id === returnedSessionId ? { ...s, updated_at: new Date().toISOString() } : s));
        }

        // Xử lý ask_campaign_details - hỏi gộp tất cả câu hỏi 1 lần
        if (type === 'ask_campaign_details' && data) {
          setPendingCampaignPrompt(inputText);
          setPendingCampaignData(data);
          update(prev => [...prev, { role: 'assistant', content, type, data }]);
          return;
        }

        // Xử lý ask_landing_details - hỏi gộp thông tin để tạo landing page
        if (type === 'ask_landing_details' && data) {
          setPendingLandingPrompt(inputText);
          setPendingLandingData(data);
          update(prev => [...prev, { role: 'assistant', content, type, data }]);
          return;
        }

        // Xử lý ask_campaign_type - hỏi user chọn kênh (legacy)
        if (type === 'ask_campaign_type' && data) {
          setPendingCampaignPrompt(inputText);
          setPendingCampaignData(data);
          update(prev => [...prev, { role: 'assistant', content, type, data }]);
          return;
        }

        // Xử lý ask_audience - skip, AI sẽ trả trực tiếp confirm_create
        if (type === 'ask_audience' && data) {
          setPendingCampaignData(prev => prev ? { ...prev, ...data } : data);
          update(prev => [...prev, { role: 'assistant', content, type, data }]);
          return;
        }

        // Xử lý confirm_create - hiển thị summary và hỏi xác nhận
        if (type === 'confirm_create' && data) {
          setCurrentScript(data);
          update(prev => [...prev, { role: 'assistant', content, type, data }]);
          return;
        }

        // Xử lý create_and_run - tự động tạo và chạy campaign
        if (type === 'create_and_run' && data) {
          setCreatingCampaign(true);
          const scriptData = { ...data, isAiDraft: false, autoRun: true };
          update(prev => [...prev, {
            role: 'assistant',
            content: content || 'Đang tạo và chạy chiến dịch cho bạn...',
            type: 'auto_creating',
            data: { campaignName: data.campaignName },
          }]);

          try {
            const createResult = await aiApi.createAndRunCampaign(scriptData);
            setCreatingCampaign(false);
            if (createResult.success) {
              setAutoCreatedCampaign(createResult.data);
              update(prev => [...prev, {
                role: 'assistant',
                content: `🎉 Chiến dịch "${createResult.data.campaignName}" đã được tạo và đang chạy!\n\nRun ID: ${createResult.data.runId || 'N/A'}\n\nBạn có thể theo dõi tiến trình tại trang Chiến dịch.`,
                type: 'auto_created_success',
                data: createResult.data,
              }]);
            } else {
              update(prev => [...prev, {
                role: 'assistant',
                content: `⚠️ ${createResult.message || 'Có lỗi khi tạo chiến dịch. Vui lòng thử lại.'}`,
                type: 'error',
              }]);
            }
          } catch (createErr) {
            setCreatingCampaign(false);
            update(prev => [...prev, {
              role: 'assistant',
              content: `⚠️ Lỗi: ${createErr.response?.data?.message || createErr.message}`,
              type: 'error',
            }]);
          }
          return;
        }

        // Xử lý các type khác như bình thường
        update(prev => [...prev, {
          role: 'assistant', content, type, data,
          missing_fields: missing_fields || [],
        }]);
        if (type === 'confirm_create') setCurrentScript(data);
      }
    } catch (error) {
      update(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ Lỗi: ${error.response?.data?.message || error.message}`
      }]);
    } finally {
      setIsTyping(false);
      isSendingRef.current = false;
      clearTabPending(mySessionId);
    }
  };

  const handleEditTemplate = (draft) => {
    navigate('/app/settings/templates', { state: { aiDraft: draft } });
    onToggle?.();
  };

  // Write AI campaign script to sessionStorage draft so CampaignBuilder loads it directly
  const _handleEditCampaign = (script) => {
    console.log('[AI Chatbot] handleEditCampaign called with script:', JSON.stringify(script, null, 2));
    const draftData = {
      campaignName: script.campaignName || '',
      campaignDescription: script.description || '',
      campaignType: script.campaignType || 'mixed',
      // Store raw script nodes/connections for buildFlowFromCampaign (legacy format)
      _aiScript: script,
      updatedAt: new Date().toISOString(),
    };
    console.log('[AI Chatbot] Saving draftData:', JSON.stringify(draftData, null, 2));
    writeCampaignDraft(draftData);
    console.log('[AI Chatbot] Draft saved, navigating to builder');
    // Force reload to ensure CampaignBuilder remounts and reads the new draft
    // Use a query param to force React Router to recognize a new navigation
    const timestamp = Date.now();
    navigate(`/app/campaigns/new/builder?t=${timestamp}`, { replace: true });
    onToggle?.();
  };

  const handleSaveLandingPage = (page) => {
    navigate('/app/settings/landing-pages', { state: { aiDraft: page } });
    onToggle?.();
  };

  /**
   * Xử lý khi user chọn campaign type (email/zalo/zalo_group)
   */
  /**
   * Xử lý khi user submit câu trả lời từ AskCampaignDetailsCard
   * summaryText: chuỗi mô tả lựa chọn, answers: { channel, productCount, sendingStyle, audienceCount }
   */
  const handleCampaignDetailsSubmit = async (summaryText, answers) => {
    if (!pendingCampaignPrompt) return;
    setIsTyping(true);
    const mySessionId = currentSessionId;
    const update = makeUpdater(mySessionId, [...messages]);
    if (mySessionId) markTabPending(mySessionId);
    update(prev => [...prev, { role: 'user', content: summaryText }]);

    // Nếu user chọn dùng mẫu email có sẵn, fetch template content để nhúng vào prompt
    let emailTemplateContext = '';
    if (answers.emailChoice === 'existing' && answers.emailTemplateName) {
      try {
        const searchRes = await api.get('/email-templates', {
          params: { search: answers.emailTemplateName, limit: 1 },
        });
        const found = searchRes.data?.data?.items?.[0];
        if (found) {
          const detailRes = await api.get(`/email-templates/${found.id}`);
          const tpl = detailRes.data?.data;
          if (tpl) {
            emailTemplateContext = `\n\nSử dụng mẫu email có sẵn (KHÔNG tạo nội dung mới):\nTên mẫu: ${tpl.templateName}\nTiêu đề email: ${tpl.subject || ''}\nNội dung HTML:\n${tpl.bodyHtml || tpl.bodyText || ''}`;
            answers = { ...answers, emailTemplateId: found.id };
          }
        } else {
          toast(`⚠️ Không tìm thấy mẫu email "${answers.emailTemplateName}", AI sẽ tạo nội dung mới.`, { icon: '⚠️' });
        }
      } catch {
        // silently fall back to AI-generated content
      }
    }

    try {
      const enrichedHistory = [
        ...messages,
        { role: 'user', content: pendingCampaignPrompt },
        { role: 'assistant', content: 'Cho tôi hỏi vài điều để thiết kế chiến dịch phù hợp.' },
        { role: 'user', content: summaryText + emailTemplateContext },
      ];
      const response = await aiApi.chat(enrichedHistory, uploadedFiles, null, locale);
      if (response.success) {
        const { type, content, data } = response.data;
        if (type === 'confirm_create' && data) {
          setCurrentScript({ ...data, ...answers });
          update(prev => [...prev, { role: 'assistant', content, type, data: { ...data, ...answers } }]);
        } else {
          update(prev => [...prev, { role: 'assistant', content, type, data }]);
          if (type === 'campaign_script' && data) setCurrentScript({ ...data, ...answers });
        }
        setPendingCampaignPrompt(null);
        setPendingCampaignData(null);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi khi tạo chiến dịch');
    } finally {
      setIsTyping(false);
      clearTabPending(mySessionId);
    }
  };

  const handleLandingDetailsSubmit = async (summaryText, answers) => {
    if (!pendingLandingPrompt) return;
    setIsTyping(true);
    const mySessionId = currentSessionId;
    const update = makeUpdater(mySessionId, [...messages]);
    if (mySessionId) markTabPending(mySessionId);
    update(prev => [...prev, { role: 'user', content: summaryText }]);

    const goalLabels = {
      lead: 'Thu thập thông tin đăng ký (lead form)',
      product: 'Giới thiệu sản phẩm / dịch vụ',
      event: 'Đăng ký sự kiện / hội thảo',
      trial: 'Dùng thử miễn phí / nhận ưu đãi',
    };
    const audienceLabels = {
      student: 'Học viên / người muốn học',
      business: 'Doanh nghiệp / B2B',
      consumer: 'Cá nhân phổ thông',
      parent_child: 'Phụ huynh & trẻ em',
    };

    if (!hasProfile) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ Bạn chưa có hồ sơ doanh nghiệp — AI sẽ tự suy luận nội dung từ mô tả của bạn. Để landing page chính xác hơn, hãy thiết lập hồ sơ tại Thiết lập → Hồ sơ AI.',
      }]);
    }

    const parts = [pendingLandingPrompt];
    if (answers.pageGoal) parts.push(`Mục tiêu trang: ${goalLabels[answers.pageGoal] || answers.pageGoal}`);
    if (answers.targetAudience) parts.push(`Đối tượng: ${audienceLabels[answers.targetAudience] || answers.targetAudience}`);
    if (answers.product && answers.product !== 'other' && pendingLandingData?.questions) {
      const productQ = pendingLandingData.questions.find(q => q.id === 'product');
      const productOpt = productQ?.options?.find(o => o.value === answers.product);
      if (productOpt) parts.push(`Sản phẩm: ${productOpt.label}`);
    }
    if (answers.formFields === 'extended') {
      parts.push('Form lead thu thập thêm: Nghề nghiệp và Lĩnh vực quan tâm');
    } else if (answers.formFields === 'custom' && answers.customFields) {
      parts.push(`Form lead thu thập thêm các trường: ${answers.customFields}`);
    }
    const enrichedPrompt = parts.join('. ');

    try {
      const response = await aiApi.generateLandingPage(enrichedPrompt, null, uploadedFiles, currentSessionId, summaryText);
      if (response.success) {
        const { title, html, css } = response.data;
        update(prev => [...prev, {
          role: 'assistant',
          content: `Đã tạo landing page "${title}" cho bạn! Bạn có thể xem trước và lưu vào thư viện.`,
          type: 'landing_page',
          data: { title, html, css },
        }]);
      }
    } catch (err) {
      update(prev => [...prev, {
        role: 'assistant',
        content: `Có lỗi khi tạo landing page: ${err.response?.data?.message || err.message}`,
      }]);
    } finally {
      setIsTyping(false);
      clearTabPending(mySessionId);
      setPendingLandingPrompt(null);
      setPendingLandingData(null);
    }
  };

  const handleSelectCampaignType = async (campaignType) => {
    if (!pendingCampaignPrompt || !pendingCampaignData) return;
    
    setIsTyping(true);
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `Tôi đã chọn kênh ${campaignType === 'email' ? '📧 Email' : campaignType === 'zalo' ? '💬 Zalo cá nhân' : '👥 Zalo nhóm'}. Đang thiết kế chiến dịch...`,
    }]);

    try {
      // Gửi lại prompt với campaign type đã chọn
      const enrichedHistory = [
        ...messages,
        { role: 'user', content: pendingCampaignPrompt },
        { role: 'assistant', content: 'Tôi sẽ hỏi bạn chọn kênh trước.' },
        { role: 'user', content: `Tôi muốn gửi qua ${campaignType}` }
      ];
      
      const response = await aiApi.chat(enrichedHistory, [], null, locale);
      
      if (response.success) {
        const { type, content, data } = response.data;
        
        // Nếu AI trả về confirm_create
        if (type === 'confirm_create' && data) {
          setCurrentScript({
            ...data,
            campaignType: campaignType, // Override với type user đã chọn
          });
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: content || 'Chiến dịch đã sẵn sàng!',
            type: 'confirm_create',
            data: { ...data, campaignType },
          }]);
        } else {
          // AI trả lời khác, hiển thị như bình thường
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: content || 'Tôi đang xử lý yêu cầu của bạn...',
            type,
            data,
          }]);
        }

        // Clear pending state
        setPendingCampaignPrompt(null);
        setPendingCampaignData(null);
        setSelectedCampaignType(campaignType);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi khi tạo chiến dịch');
    } finally {
      setIsTyping(false);
    }
  };

  /**
   * Xử lý khi user chọn đối tượng khách hàng (all/has_email/has_zalo_phone)
   */
  const handleSelectAudience = async (audience) => {
    if (!pendingCampaignPrompt || !pendingCampaignData) return;

    setIsTyping(true);
    const audienceLabel = audience === 'all' ? 'tất cả khách hàng' : audience === 'has_email' ? 'khách hàng có email' : 'khách hàng có Zalo/phone';
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `Tôi sẽ gửi cho đối tượng ${audienceLabel}. Đang thiết kế chiến dịch hoàn chỉnh...`,
    }]);

    try {
      // Gửi lại prompt với audience đã chọn
      const enrichedHistory = [
        ...messages,
        { role: 'user', content: pendingCampaignPrompt },
        { role: 'assistant', content: 'Tôi sẽ hỏi bạn chọn kênh trước.' },
        { role: 'user', content: `Tôi muốn gửi qua ${pendingCampaignData?.campaignType || 'đa kênh'}` },
        { role: 'assistant', content: 'Bạn muốn gửi cho đối tượng nào?' },
        { role: 'user', content: `Gửi cho ${audienceLabel}` }
      ];

      const response = await aiApi.chat(enrichedHistory, [], null, locale);

      if (response.success) {
        const { type, content, data } = response.data;

        // Nếu AI trả về confirm_create
        if (type === 'confirm_create' && data) {
          setCurrentScript({
            ...data,
            campaignType: pendingCampaignData?.campaignType,
            audience: audience,
          });
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: content || 'Chiến dịch đã sẵn sàng!',
            type: 'confirm_create',
            data: { ...data, campaignType: pendingCampaignData?.campaignType, audience },
          }]);
        } else {
          // AI trả lời khác, hiển thị như bình thường
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: content || 'Tôi đang xử lý yêu cầu của bạn...',
            type,
            data,
          }]);
        }

        // Clear pending state
        setPendingCampaignPrompt(null);
        setPendingCampaignData(null);
        setSelectedCampaignType(pendingCampaignData?.campaignType);
        setSelectedAudience(audience);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi khi tạo chiến dịch');
    } finally {
      setIsTyping(false);
    }
  };

  /**
   * Xử lý khi user xác nhận tạo chiến dịch
   */
  const handleConfirmCreate = async () => {
    if (!currentScript) return;
    await handleCreateCampaign();
  };

  /**
   * Xử lý khi user hủy tạo chiến dịch
   */
  const handleCancelCreate = () => {
    setCurrentScript(null);
    setPendingCampaignPrompt(null);
    setPendingCampaignData(null);
    setSelectedCampaignType(null);
    setSelectedAudience(null);
    setIsEditingDraft(false);
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Đã hủy tạo chiến dịch. Bạn cần tôi giúp gì khác không?',
    }]);
  };

  /**
   * Create campaign from AI draft (NO auto-run).
   * User will go to builder to review and run manually.
   */
  const handleCreateCampaign = async () => {
    if (!currentScript) return;
    const t = toast.loading('Đang tạo chiến dịch...');
    try {
      const res = await aiApi.createCampaignFromDraft(currentScript);
      if (res.success) {
        toast.success('Đã tạo chiến dịch từ draft AI!', { id: t });
        setCurrentScript(null);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `🎉 Chiến dịch "${currentScript.campaignName}" đã được tạo thành công!\n\nVào Campaign Builder để xem chi tiết và nhấn "Chạy" khi sẵn sàng.`
        }]);
        // Navigate to the new campaign builder
        if (res.campaignId) {
          navigate(`/app/campaigns/${res.campaignId}/builder`);
          onToggle?.();
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không thể tạo chiến dịch.', { id: t });
    }
  };

  const _handlePushToExisting = (script) => {
    setSelectedScriptForPush(script);
    setShowCampaignPicker(true);
  };

  const handleSelectCampaign = async (campaign) => {
    if (!selectedScriptForPush) return;
    setShowCampaignPicker(false);
    const t = toast.loading('Đang đẩy kịch bản vào chiến dịch...');
    try {
      const res = await aiApi.pushToCampaign(campaign.id, selectedScriptForPush, true);
      if (res.success) {
        toast.success(`Đã đẩy kịch bản vào "${campaign.campaignName}" và kích hoạt!`, { id: t });
        setCurrentScript(null);
        setSelectedScriptForPush(null);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `🎉 Kịch bản đã được đẩy vào chiến dịch "${campaign.campaignName}" và đang chạy! Theo dõi tại mục Quản lý chiến dịch nhé.`
        }]);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không thể đẩy kịch bản.', { id: t });
    }
  };

  const handleGenerateNewLandingPage = () => {
    setPendingLandingPrompt(null);
    setPendingLandingData(null);
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Bạn muốn tạo landing page mới về chủ đề gì? Hãy mô tả ngắn gọn sản phẩm/dịch vụ, đối tượng khách hàng và phong cách thiết kế bạn muốn nhé! 🎨',
    }]);
  };

  return (
    <div
      className={`fixed top-0 right-0 h-full bg-white border-l border-slate-200 shadow-2xl z-40 flex flex-col overflow-hidden ${isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`}
      style={{
        width: isMobile ? '100%' : `${panelWidth}px`,
        transition: isResizingPanel ? 'none' : 'transform 0.3s ease-in-out',
      }}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag handle — chỉ trên desktop */}
      {!isMobile && isOpen && (
        <div
          className={`absolute left-0 top-0 h-full w-1.5 cursor-col-resize z-50 transition-colors ${isResizingPanel ? 'bg-orange-300' : 'hover:bg-orange-200'}`}
          onMouseDown={handlePanelResizeStart}
        />
      )}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-orange-50/90 border-2 border-dashed border-orange-400 rounded pointer-events-none">
          <HiOutlinePaperClip className="w-10 h-10 text-orange-400" />
          <p className="text-sm font-semibold text-orange-600">{t('aiChatbot.dropFileToUpload')}</p>
          <p className="text-xs text-orange-400">{t('aiChatbot.supportedFormats')}</p>
        </div>
      )}
      {/* Header */}
      <div className="flex-shrink-0 h-16 border-b border-slate-100 flex items-center justify-between px-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shadow-lg shadow-orange-500/20">
            <HiOutlineSparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">{t('aiChatbot.title')}</h3>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t('aiChatbot.ready')}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onToggle} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-slate-600">
            <HiOutlineArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Session tabs — kéo ngang để xem thêm */}
      <div
        ref={tabsScrollRef}
        className="flex-shrink-0 flex items-center gap-1 px-3 py-2 border-b border-slate-100 overflow-x-auto select-none"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', cursor: 'grab' }}
        onMouseDown={(e) => {
          tabsDragRef.current = { dragging: true, startX: e.clientX, scrollLeft: tabsScrollRef.current.scrollLeft, moved: false };
          tabsScrollRef.current.style.cursor = 'grabbing';
        }}
        onMouseMove={(e) => {
          if (!tabsDragRef.current.dragging) return;
          const dx = e.clientX - tabsDragRef.current.startX;
          if (Math.abs(dx) > 4) tabsDragRef.current.moved = true;
          tabsScrollRef.current.scrollLeft = tabsDragRef.current.scrollLeft - dx;
        }}
        onMouseUp={() => { tabsDragRef.current.dragging = false; if (tabsScrollRef.current) tabsScrollRef.current.style.cursor = 'grab'; }}
        onMouseLeave={() => { tabsDragRef.current.dragging = false; if (tabsScrollRef.current) tabsScrollRef.current.style.cursor = 'grab'; }}
      >
        {sessions.map(session => (
          <div
            key={session.id}
            title={session.title}
            className={`shrink-0 group flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full text-[11px] font-semibold transition-all min-w-[60px] max-w-[130px] ${
              currentSessionId === session.id
                ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/30'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            {pendingTabIds.has(session.id) && currentSessionId !== session.id && (
              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse mr-0.5" title="Đang xử lý ngầm..." />
            )}
            <span
              className="truncate flex-1 cursor-pointer"
              onMouseDown={(e) => e.stopPropagation()}
              onMouseUp={() => { if (!tabsDragRef.current.moved) loadSession(session.id); }}
            >
              {session.title}
            </span>
            <span
              onMouseDown={(e) => e.stopPropagation()}
              onMouseUp={(e) => { if (!tabsDragRef.current.moved) handleDeleteSession(session.id, e); }}
              className={`shrink-0 p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${
                currentSessionId === session.id ? 'hover:bg-orange-400' : 'hover:bg-slate-200'
              }`}
            >
              <HiOutlineX className="w-3 h-3" />
            </span>
          </div>
        ))}
        <button
          onMouseUp={() => { if (!tabsDragRef.current.moved) startNewChat(); }}
          onMouseDown={(e) => e.stopPropagation()}
          title={t('aiChatbot.newConversation')}
          className={`shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
            !currentSessionId
              ? 'bg-orange-50 text-orange-500 border border-orange-200'
              : 'text-slate-400 hover:bg-slate-100 hover:text-orange-500'
          }`}
        >
          <HiOutlinePlus className="w-3 h-3 shrink-0" />
          {t('aiChatbot.newChat')}
        </button>
      </div>

      {/* Banner hồ sơ doanh nghiệp — chỉ hiện cho user_admin */}
      {!isSuperAdmin && (
        <div className={`flex-shrink-0 mx-4 mt-3 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 ${hasProfile ? 'bg-slate-50 border border-slate-200' : 'bg-orange-50 border border-orange-200'}`}>
          <HiOutlineSparkles className={`w-3.5 h-3.5 shrink-0 ${hasProfile ? 'text-slate-400' : 'text-orange-500'}`} />
          <p className={`flex-1 text-xs ${hasProfile ? 'text-slate-500' : 'text-orange-700 font-medium'}`}>
            {hasProfile ? t('aiChatbot.usingBusinessProfile') : t('aiChatbot.noProfile')}
          </p>
          <Link
            to="/app/settings/ai-profile"
            onClick={onToggle}
            className={`shrink-0 text-xs font-semibold whitespace-nowrap ${hasProfile ? 'text-slate-500 hover:text-orange-500' : 'text-orange-600 hover:text-orange-700'}`}
          >
            {hasProfile ? t('aiChatbot.view') : t('aiChatbot.setup')}
          </Link>
        </div>
      )}

      {/* Quick Actions */}
      {!isSuperAdmin && (
        <div className="flex-shrink-0 mx-4 mt-3 flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => {
              setInputText('Tạo chiến dịch quảng cáo cho khóa học tiếng Anh cho trẻ em 6 tuổi, gửi email và Zalo cá nhân');
            }}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-green-50 hover:bg-green-100 rounded-full text-xs font-medium text-green-700 transition-all whitespace-nowrap"
          >
            <HiOutlinePlay className="w-3.5 h-3.5" />
            {t('aiChatbot.createCampaign')}
          </button>
          <button
            onClick={() => {
              setInputText('Tạo landing page thu thập lead cho sản phẩm [tên sản phẩm]');
              setPendingLandingPrompt('Tạo landing page thu thập lead cho sản phẩm [tên sản phẩm]');
            }}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-full text-xs font-medium text-slate-600 transition-all whitespace-nowrap"
          >
            <HiOutlineGlobeAlt className="w-3.5 h-3.5" />
            Landing Page
          </button>
          <button
            onClick={() => {
              setInputText('Viết template email chào mừng khách hàng mới');
            }}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 hover:bg-orange-100 rounded-full text-xs font-medium text-orange-700 transition-all whitespace-nowrap"
          >
            <HiOutlineMail className="w-3.5 h-3.5" />
            {t('aiChatbot.emailTemplate')}
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[92%] ${msg.role === 'user' ? 'bg-slate-100 rounded-2xl px-4 py-3' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-5 h-5 bg-orange-100 rounded-md flex items-center justify-center">
                    <HiOutlineSparkles className="w-3 h-3 text-orange-500" />
                  </div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">AI</span>
                </div>
              )}
              <AiContent text={msg.content} />

              {/* Files */}
              {msg.files?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {msg.files.map((f, i) => {
                    const { bg, text } = fileChipMeta(f);
                    return (
                      <div key={i} className={`flex items-center gap-1.5 ${bg} border rounded-xl overflow-hidden pr-2 py-1`}>
                        {f.previewUrl
                          ? <img src={f.previewUrl} alt="" className="w-7 h-7 object-cover rounded-lg shrink-0 ml-1" />
                          : <span className={`ml-2 text-[10px] font-bold uppercase ${text}`}>{fileChipMeta(f).label}</span>
                        }
                        <span className="truncate max-w-[100px] text-[11px] font-medium text-slate-700 ml-0.5">{f.originalName}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Ask more */}
              {msg.type === 'ask_more' && msg.missing_fields?.length > 0 && (
                <AskMoreCard missingFields={msg.missing_fields} t={t} />
              )}

              {/* Ask campaign type - hỏi user chọn kênh */}
              {msg.type === 'ask_campaign_details' && msg.data && (
                <AskCampaignDetailsCard
                  data={msg.data}
                  onSubmit={handleCampaignDetailsSubmit}
                  t={t}
                />
              )}

              {msg.type === 'ask_landing_details' && msg.data && (
                <AskLandingDetailsCard
                  data={msg.data}
                  onSubmit={handleLandingDetailsSubmit}
                  t={t}
                />
              )}

              {msg.type === 'ask_campaign_type' && msg.data && (
                <AskCampaignTypeCard
                  data={msg.data}
                  onSelect={handleSelectCampaignType}
                  t={t}
                />
              )}

              {/* Ask audience - hỏi user chọn đối tượng khách hàng */}
              {msg.type === 'ask_audience' && msg.data && (
                <AskAudienceCard
                  data={msg.data}
                  onSelect={handleSelectAudience}
                  t={t}
                />
              )}

              {/* Confirm create - xác nhận trước khi tạo */}
              {msg.type === 'confirm_create' && msg.data && !isEditingDraft && (
                <ConfirmCreateCard
                  script={msg.data}
                  onConfirm={handleConfirmCreate}
                  onEdit={() => setIsEditingDraft(true)}
                  onCancel={handleCancelCreate}
                  t={t}
                />
              )}
              
              {/* Campaign Draft Editor - Chỉnh sửa trong chatbot */}
              {msg.type === 'confirm_create' && msg.data && isEditingDraft && (
                <CampaignDraftEditor
                  script={msg.data}
                  onSave={(editedScript) => {
                    setCurrentScript({ ...msg.data, ...editedScript });
                    setIsEditingDraft(false);
                    toast.success('Đã cập nhật draft!');
                  }}
                  onCancel={() => setIsEditingDraft(false)}
                  t={t}
                />
              )}

              {/* Template draft */}
              {msg.type === 'template_draft' && msg.data && (
                <TemplateDraftCard
                  draft={msg.data}
                  onSave={() => {}}
                  onEdit={handleEditTemplate}
                  t={t}
                />
              )}

              {/* Landing page */}
              {msg.type === 'landing_page' && msg.data && (
                <LandingPageCard
                  page={msg.data}
                  onSaveToLibrary={handleSaveLandingPage}
                  onGenerateNew={handleGenerateNewLandingPage}
                />
              )}

              {/* Auto creating campaign */}
              {msg.type === 'auto_creating' && (
                <AutoCreatingCard
                  campaignName={msg.data?.campaignName}
                  onView={autoCreatedCampaign ? () => navigate(`/app/campaigns/${autoCreatedCampaign.campaignId}/builder`) : null}
                  t={t}
                />
              )}

              {/* Auto created success */}
              {msg.type === 'auto_created_success' && msg.data && (
                <AutoCreatedSuccessCard
                  result={msg.data}
                  onView={() => navigate(`/app/campaigns/${msg.data.campaignId}/builder`)}
                  t={t}
                />
              )}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="flex gap-1.5 px-4 py-3 bg-slate-50 rounded-2xl">
              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" />
              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-4 pt-3 pb-4 border-t border-slate-100 bg-white">
        <div className={`rounded-2xl border transition-all outline-none ${isDragging ? 'border-orange-300 bg-orange-50/40' : 'border-slate-200 bg-slate-50 focus-within:bg-white'}`}>
          {/* File chips */}
          {uploadedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-3">
              {uploadedFiles.map(f => {
                const { bg, text } = fileChipMeta(f);
                return (
                  <div key={f.tempId} className={`flex items-center gap-1.5 ${bg} border rounded-xl overflow-hidden pr-1.5 py-1`}>
                    {f.previewUrl
                      ? <img src={f.previewUrl} alt="" className="w-7 h-7 object-cover rounded-lg shrink-0 ml-1" />
                      : <span className={`ml-2 text-[10px] font-bold uppercase ${text}`}>{fileChipMeta(f).label}</span>
                    }
                    <span className="truncate max-w-[100px] text-xs font-medium text-slate-700 ml-1">{f.originalName}</span>
                    <button onClick={() => setUploadedFiles(p => p.filter(x => x.tempId !== f.tempId))}
                      className="p-0.5 ml-0.5 text-slate-400 hover:text-red-500 transition-colors shrink-0">
                      <HiOutlineX className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {/* Textarea */}
          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleSend(); } }}
            placeholder={isDragging ? t('aiChatbot.dropFilePlaceholder') : t('aiChatbot.inputPlaceholder')}
            rows={2}
            className="w-full bg-transparent px-3.5 pt-3 pb-1 text-sm outline-none focus:outline-none focus:ring-0 resize-none text-slate-800 placeholder-slate-400"
            style={{ WebkitAppearance: 'none', boxShadow: 'none' }}
          />
          {/* Toolbar */}
          <div className="flex items-center justify-between px-2 pb-2">
            <button onClick={() => fileInputRef.current?.click()} disabled={isUploading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-xl transition-all disabled:opacity-50">
              {isUploading
                ? <div className="w-3.5 h-3.5 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
                : <HiOutlinePaperClip className="w-3.5 h-3.5" />}
              <span>{t('aiChatbot.attach')}</span>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-300">{t('aiChatbot.enterToSend')}</span>
              <button onClick={handleSend} disabled={!inputText.trim() && !uploadedFiles.length}
                className="w-8 h-8 flex items-center justify-center bg-slate-800 text-white rounded-xl hover:bg-orange-500 disabled:bg-slate-200 disabled:text-slate-400 transition-all">
                <HiOutlineChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-center text-slate-400">{t('aiChatbot.poweredBy')}</p>
      </div>

      <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden"
        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv" />

      {/* Campaign Picker Modal */}
      <CampaignPickerModal
        isOpen={showCampaignPicker}
        onClose={() => {
          setShowCampaignPicker(false);
          setSelectedScriptForPush(null);
        }}
        onSelect={handleSelectCampaign}
        t={t}
      />

    </div>
  );
};

export default AiChatbot;
