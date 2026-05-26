import { useState, useRef, useEffect } from 'react';
import useIsMobile from '../../hooks/useIsMobile';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import {
  HiOutlineSparkles, HiOutlinePaperClip, HiOutlineX,
  HiOutlineChevronRight, HiOutlinePlay, HiOutlineArrowRight,
  HiOutlineTerminal, HiOutlinePencilAlt, HiOutlineCheck,
  HiOutlineQuestionMarkCircle,
  HiOutlineMail, HiOutlineChat,
  HiOutlineFolderOpen,
  HiOutlineGlobeAlt,
  HiOutlinePlus,
} from 'react-icons/hi';
import { writeCampaignDraft } from '../../utils/campaignDraftStorage';
import { toast } from 'react-hot-toast';
import aiApi from '../../services/aiApi';

// Render AI message content — convert basic markdown to JSX
function AiContent({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  const renderInline = (str, baseKey) =>
    str.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={`${baseKey}-${j}`}>{part.slice(2, -2)}</strong>
        : part
    );
  return (
    <div className="text-sm leading-relaxed text-slate-800 space-y-1">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        // Bullet: lines starting with - or *
        if (/^[-*]\s/.test(line)) {
          const content = line.replace(/^[-*]\s/, '');
          return <div key={i} className="flex gap-1.5"><span className="text-slate-400 shrink-0 mt-0.5">•</span><span>{renderInline(content, i)}</span></div>;
        }
        return <p key={i}>{renderInline(line, i)}</p>;
      })}
    </div>
  );
}
import api from '../../services/api';
import LandingPageCard from './components/LandingPageCard';
import TemplateSelector from './components/TemplateSelector';

const CATEGORIES = [
  { id: 'marketing', label: '📢 Marketing' },
  { id: 'notification', label: '🔔 Thông báo' },
];

// Category picker overlay
const CategoryPicker = ({ onSelect, onCancel }) => (
  <div className="mt-3 p-3 bg-orange-50 rounded-xl border border-orange-100">
    <p className="text-xs font-bold text-orange-700 mb-2">📂 Lưu vào danh mục nào?</p>
    <div className="flex gap-2">
      {CATEGORIES.map(cat => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className="flex-1 py-2 text-xs font-semibold bg-white border border-orange-200 rounded-lg hover:bg-orange-500 hover:text-white hover:border-orange-500 transition-all"
        >
          {cat.label}
        </button>
      ))}
    </div>
    <button onClick={onCancel} className="w-full mt-2 text-xs text-slate-400 hover:text-slate-600">Huỷ</button>
  </div>
);

// Template preview card
const TemplateDraftCard = ({ draft, onSave, onEdit }) => {
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async (category) => {
    setSaving(true);
    setShowCategoryPicker(false);
    try {
      const endpoint = draft.channel === 'zalo' ? '/zalo-templates' : '/email-templates';
      await api.post(endpoint, {
        templateName: draft.templateName,
        subject: draft.subject || '',
        bodyHtml: draft.bodyHtml || '',
        bodyText: draft.bodyText || '',
        category,
        variables: [],
      });
      toast.success('✅ Đã lưu template thành công!');
      onSave?.();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-50 to-amber-50 border-b border-slate-100">
        {draft.channel === 'email'
          ? <HiOutlineMail className="w-4 h-4 text-orange-500" />
          : <HiOutlineChat className="w-4 h-4 text-blue-500" />}
        <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">
          {draft.channel === 'email' ? 'Template Email' : 'Template Zalo'}
        </span>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Tên template</p>
          <p className="text-sm font-bold text-slate-800">{draft.templateName}</p>
        </div>

        {draft.subject && (
          <div>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Tiêu đề</p>
            <p className="text-sm text-slate-700">{draft.subject}</p>
          </div>
        )}

        <div>
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-1">Nội dung</p>
          {draft.channel === 'email' && draft.bodyHtml ? (
            <div
              className="text-xs text-slate-600 leading-relaxed max-h-40 overflow-y-auto border border-slate-100 rounded-lg p-2 bg-gray-50"
              dangerouslySetInnerHTML={{ __html: draft.bodyHtml }}
            />
          ) : (
            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
              {draft.bodyText}
            </p>
          )}
        </div>

        {showCategoryPicker ? (
          <CategoryPicker onSelect={handleSave} onCancel={() => setShowCategoryPicker(false)} />
        ) : (
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setShowCategoryPicker(true)}
              disabled={saving}
              className="flex-1 py-2.5 bg-orange-500 text-white text-xs font-black rounded-xl hover:bg-orange-600 flex items-center justify-center gap-1.5 transition-all disabled:opacity-60"
            >
              <HiOutlineCheck className="w-4 h-4" />
              {saving ? 'Đang lưu...' : 'Lưu vào thư viện'}
            </button>
            <button
              onClick={() => onEdit?.(draft)}
              className="flex-1 py-2.5 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-black rounded-xl hover:bg-slate-100 flex items-center justify-center gap-1.5 transition-all"
            >
              <HiOutlinePencilAlt className="w-4 h-4 text-orange-500" />
              Chỉnh sửa
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Ask-more card
const AskMoreCard = ({ missingFields }) => (
  <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
    <HiOutlineQuestionMarkCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
    <div>
      <p className="text-xs font-bold text-amber-800 mb-1">Cần thêm thông tin:</p>
      <ul className="space-y-0.5">
        {missingFields.map((f, i) => (
          <li key={i} className="text-xs text-amber-700 flex items-center gap-1">
            <span className="w-1 h-1 bg-amber-500 rounded-full shrink-0" />{f}
          </li>
        ))}
      </ul>
    </div>
  </div>
);

// Ask campaign type card - hỏi user chọn kênh
const AskCampaignTypeCard = ({ data, onSelect }) => {
  if (!data?.campaignOptions) return null;
  
  return (
    <div className="mt-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <HiOutlineSparkles className="w-5 h-5 text-blue-500" />
        <span className="font-black text-[10px] uppercase tracking-[0.2em] text-blue-600">Chọn kênh chiến dịch</span>
      </div>
      {data.campaignName && (
        <h4 className="font-bold text-slate-900 text-sm mb-1">{data.campaignName}</h4>
      )}
      {data.description && (
        <p className="text-xs text-slate-500 mb-4 leading-relaxed">{data.description}</p>
      )}
      <p className="text-xs text-slate-600 mb-3">Bạn muốn gửi qua kênh nào?</p>
      <div className="space-y-2">
        {data.campaignOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => onSelect(option.value)}
            className="w-full flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
              style={{
                backgroundColor: option.value === 'email' ? '#fff7ed' : option.value === 'zalo' ? '#eff6ff' : '#faf5ff'
              }}
            >
              {option.value === 'email' ? '📧' : option.value === 'zalo' ? '💬' : '👥'}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-800 group-hover:text-blue-700">{option.label}</p>
              <p className="text-[10px] text-slate-500">{option.description}</p>
            </div>
            <HiOutlineChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500" />
          </button>
        ))}
      </div>
    </div>
  );
};

// Ask campaign details - hỏi gộp tất cả câu hỏi cần thiết trong 1 lần
const AskCampaignDetailsCard = ({ data, onSubmit }) => {
  const [answers, setAnswers] = useState({});
  if (!data?.questions?.length) return null;

  const allAnswered = data.questions.every(q => answers[q.id]);

  const pick = (qId, val) => setAnswers(prev => ({ ...prev, [qId]: val }));

  const handleSubmit = () => {
    if (!allAnswered) return;
    const lines = data.questions.map(q => {
      const opt = q.options.find(o => o.value === answers[q.id]);
      return `${q.label} ${opt?.label || answers[q.id]}`;
    });
    onSubmit(lines.join('\n'), answers);
  };

  return (
    <div className="mt-4 bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-2xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <HiOutlineSparkles className="w-5 h-5 text-orange-500" />
        <span className="font-black text-[10px] uppercase tracking-[0.2em] text-orange-600">
          Thiết kế chiến dịch
        </span>
      </div>

      {data.campaignName && (
        <p className="text-sm font-bold text-slate-800">{data.campaignName}</p>
      )}

      {data.questions.map(q => (
        <div key={q.id}>
          <p className="text-xs font-semibold text-slate-600 mb-2">{q.label}</p>
          <div className="flex flex-wrap gap-2">
            {q.options.map(opt => (
              <button
                key={opt.value}
                onClick={() => pick(q.id, opt.value)}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                  answers[q.id] === opt.value
                    ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300 hover:bg-orange-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      <button
        onClick={handleSubmit}
        disabled={!allAnswered}
        className="w-full py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-orange-500 hover:bg-orange-600 text-white"
      >
        {allAnswered ? '✓ Tạo chiến dịch theo lựa chọn này' : 'Chọn hết các mục bên trên để tiếp tục'}
      </button>
    </div>
  );
};

// Ask landing details card - hỏi gộp thông tin để tạo landing page
const AskLandingDetailsCard = ({ data, onSubmit }) => {
  // formFields mặc định 'basic' — không bắt buộc thay đổi
  const [answers, setAnswers] = useState({ formFields: 'basic' });
  const [customFieldsText, setCustomFieldsText] = useState('');
  if (!data?.questions?.length) return null;

  const allAnswered = data.questions.every(q => answers[q.id]);
  const canSubmit = allAnswered && (answers.formFields !== 'custom' || customFieldsText.trim().length > 0);
  const pick = (qId, val) => setAnswers(prev => ({ ...prev, [qId]: val }));

  const handleSubmit = () => {
    if (!canSubmit) return;
    const lines = data.questions.map(q => {
      const opt = q.options.find(o => o.value === answers[q.id]);
      return `${q.label} ${opt?.label || answers[q.id]}`;
    });
    if (answers.formFields === 'extended') {
      lines.push('Form thu thập thêm: Nghề nghiệp (occupation) và Lĩnh vực quan tâm (interestArea)');
    } else if (answers.formFields === 'custom' && customFieldsText.trim()) {
      lines.push(`Form thu thập thêm các trường tùy chỉnh: ${customFieldsText.trim()}`);
    }
    onSubmit(lines.join('\n'), { ...answers, customFields: customFieldsText.trim() });
  };

  return (
    <div className="mt-4 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <HiOutlineGlobeAlt className="w-5 h-5 text-indigo-500" />
        <span className="font-black text-[10px] uppercase tracking-[0.2em] text-indigo-600">
          Thiết kế Landing Page
        </span>
      </div>

      {data.pageTitle && (
        <p className="text-sm font-bold text-slate-800">{data.pageTitle}</p>
      )}

      {data.questions.map(q => (
        <div key={q.id}>
          <p className="text-xs font-semibold text-slate-600 mb-2">{q.label}</p>
          <div className="flex flex-wrap gap-2">
            {q.options.map(opt => (
              <button
                key={opt.value}
                onClick={() => pick(q.id, opt.value)}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                  answers[q.id] === opt.value
                    ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Câu hỏi cố định: form fields — luôn hiển thị */}
      <div className="pt-1 border-t border-indigo-100">
        <p className="text-xs font-semibold text-slate-600 mb-1">📋 Thông tin form đăng ký</p>
        <p className="text-[10px] text-slate-400 mb-2">
          Mặc định thu thập: <span className="font-medium text-slate-500">Họ, Tên, Email, SĐT</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => pick('formFields', 'basic')}
            className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
              answers.formFields === 'basic'
                ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'
            }`}
          >
            Chỉ thông tin cơ bản
          </button>
          <button
            onClick={() => pick('formFields', 'extended')}
            className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
              answers.formFields === 'extended'
                ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'
            }`}
          >
            + Nghề nghiệp & Lĩnh vực
          </button>
          <button
            onClick={() => pick('formFields', 'custom')}
            className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
              answers.formFields === 'custom'
                ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'
            }`}
          >
            Tự chọn trường khác
          </button>
        </div>
        {answers.formFields === 'custom' && (
          <div className="mt-2">
            <textarea
              value={customFieldsText}
              onChange={e => setCustomFieldsText(e.target.value)}
              placeholder="Nhập tên các trường bạn muốn thu thập, ví dụ: Công ty, Chức vụ, Ngành hàng, Doanh thu hàng tháng..."
              rows={2}
              className="w-full text-xs rounded-xl border border-indigo-200 bg-white px-3 py-2 text-slate-700 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <p className="text-[10px] text-slate-400 mt-1">Mỗi trường cách nhau bằng dấu phẩy</p>
          </div>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-indigo-500 hover:bg-indigo-600 text-white"
      >
        {canSubmit ? '✓ Tạo Landing Page theo lựa chọn này' : answers.formFields === 'custom' ? 'Nhập tên trường để tiếp tục' : 'Chọn hết các mục bên trên để tiếp tục'}
      </button>
    </div>
  );
};

// Ask audience card - hỏi user chọn đối tượng khách hàng
const AskAudienceCard = ({ data, onSelect }) => {
  if (!data?.campaignOptions) return null;
  
  return (
    <div className="mt-4 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <HiOutlineSparkles className="w-5 h-5 text-purple-500" />
        <span className="font-black text-[10px] uppercase tracking-[0.2em] text-purple-600">Chọn đối tượng khách hàng</span>
      </div>
      {data.campaignName && (
        <h4 className="font-bold text-slate-900 text-sm mb-1">{data.campaignName}</h4>
      )}
      {data.description && (
        <p className="text-xs text-slate-500 mb-4 leading-relaxed">{data.description}</p>
      )}
      <p className="text-xs text-slate-600 mb-3">Bạn muốn gửi cho đối tượng nào?</p>
      <div className="space-y-2">
        {data.campaignOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => onSelect(option.value)}
            className="w-full flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:border-purple-400 hover:bg-purple-50 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
              style={{
                backgroundColor: option.value === 'all' ? '#e0e7ff' : option.value === 'has_email' ? '#fff7ed' : '#eff6ff'
              }}
            >
              {option.value === 'all' ? '👥' : option.value === 'has_email' ? '📧' : '💬'}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-800 group-hover:text-purple-700">{option.label}</p>
              <p className="text-[10px] text-slate-500">{option.description}</p>
            </div>
            <HiOutlineChevronRight className="w-4 h-4 text-slate-300 group-hover:text-purple-500" />
          </button>
        ))}
      </div>
      <p className="text-[10px] text-slate-400 mt-3">
        💡 <strong>Lưu ý:</strong> Với <strong>Zalo nhóm</strong>, tin nhắn sẽ gửi vào nhóm Zalo đã kết nối thay vì gửi riêng từng người.
      </p>
    </div>
  );
};

// Campaign Draft Editor - Chỉnh sửa draft ngay trong chatbot
const CampaignDraftEditor = ({ script, onSave, onCancel }) => {
  // AI có thể trả về nodes hoặc summary.steps
  const rawNodes = script?.nodes || [];
  const rawSteps = script?.summary?.steps || [];
  
  const [editedScript, setEditedScript] = useState({
    campaignName: script?.campaignName || '',
    description: script?.description || '',
    nodes: rawNodes,
    connections: script?.connections || [],
    // Lưu steps để hiển thị
    steps: rawSteps,
  });
  const [activeTab, setActiveTab] = useState('basic'); // 'basic' | 'nodes'

  // Get action nodes (non-trigger) - mở rộng điều kiện lọc
  const actionNodes = editedScript.nodes.filter(n => {
    if (!n) return false;
    const type = n.nodeType || '';
    const subtype = n.nodeSubtype || n.subtype || '';
    return type === 'action' || type === 'send_email' || type === 'send_zalo_personal' || 
           type === 'send_zalo_group' || subtype.includes('send_') || 
           subtype.includes('email') || subtype.includes('zalo');
  });

  // Nếu không có nodes thì dùng steps
  const displayItems = actionNodes.length > 0 ? actionNodes : editedScript.steps;

  const handleNodeConfigChange = (tempId, field, value) => {
    setEditedScript(prev => ({
      ...prev,
      nodes: prev.nodes.map(node => 
        node.tempId === tempId || node.id === tempId
          ? { ...node, config: { ...node.config, [field]: value } }
          : node
      )
    }));
  };

  const handleNodeNameChange = (tempId, name) => {
    setEditedScript(prev => ({
      ...prev,
      nodes: prev.nodes.map(node => 
        node.tempId === tempId || node.id === tempId
          ? { ...node, nodeName: name }
          : node
      )
    }));
  };

  const getNodeIcon = (node) => {
    const subtype = node.nodeSubtype || node.subtype || '';
    if (subtype.includes('email')) return '📧';
    if (subtype.includes('zalo_personal') || subtype === 'zalo') return '💬';
    if (subtype.includes('zalo_group') || subtype === 'zalo_group') return '👥';
    return '⚡';
  };

  const handleSave = () => {
    onSave(editedScript);
  };

  return (
    <div className="mt-4 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-orange-500 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HiOutlinePencilAlt className="w-5 h-5" />
            <span className="font-black text-[10px] uppercase tracking-[0.2em]">Chỉnh sửa Draft</span>
          </div>
          <button onClick={onCancel} className="p-1 hover:bg-orange-400 rounded-lg">
            <HiOutlineX className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-orange-100">
        <button
          onClick={() => setActiveTab('basic')}
          className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
            activeTab === 'basic' ? 'text-orange-600 border-b-2 border-orange-500' : 'text-slate-400'
          }`}
        >
          📝 Cơ bản
        </button>
        <button
          onClick={() => setActiveTab('nodes')}
          className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
            activeTab === 'nodes' ? 'text-orange-600 border-b-2 border-orange-500' : 'text-slate-400'
          }`}
        >
          📋 Nodes ({displayItems.length})
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        {activeTab === 'basic' && (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Tên chiến dịch
              </label>
              <input
                type="text"
                value={editedScript.campaignName}
                onChange={(e) => setEditedScript(prev => ({ ...prev, campaignName: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-400/20 outline-none"
                placeholder="Nhập tên chiến dịch..."
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Mô tả
              </label>
              <textarea
                value={editedScript.description}
                onChange={(e) => setEditedScript(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-400/20 outline-none resize-none"
                rows={3}
                placeholder="Nhập mô tả chiến dịch..."
              />
            </div>
          </div>
        )}

        {activeTab === 'nodes' && (
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {displayItems.length > 0 ? displayItems.map((item, i) => {
              const isStep = item.step !== undefined; // Là step hay node
              const nodeId = item.tempId || item.id || i;
              return (
                <div key={nodeId} className="bg-white rounded-lg p-3 border border-slate-100">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{isStep ? '📝' : getNodeIcon(item)}</span>
                    <span className="text-xs font-bold text-slate-600">Bước {item.step || i + 1}</span>
                    <span className="text-[10px] text-slate-400">
                      {isStep ? (item.action || '') : (item.nodeSubtype || item.subtype || 'action')}
                    </span>
                  </div>
                  {isStep ? (
                    // Hiển thị step (text-only)
                    <div className="space-y-1">
                      <p className="text-xs text-slate-700">{item.action || item.description || ''}</p>
                      <p className="text-[10px] text-slate-400">{item.timing || ''}</p>
                    </div>
                  ) : (
                    // Hiển thị node
                    <>
                      <input
                        type="text"
                        value={item.nodeName || ''}
                        onChange={(e) => handleNodeNameChange(nodeId, e.target.value)}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs mb-2 focus:border-orange-400 outline-none"
                        placeholder="Tên node..."
                      />
                      {/* Email config */}
                      {(item.nodeSubtype || item.subtype || '').includes('email') && (
                        <div className="space-y-1">
                          <input
                            type="text"
                            value={item.config?.emailSubject || ''}
                            onChange={(e) => handleNodeConfigChange(nodeId, 'emailSubject', e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:border-orange-400 outline-none"
                            placeholder="Tiêu đề email..."
                          />
                        </div>
                      )}
                      {/* Zalo config */}
                      {(item.nodeSubtype || item.subtype || '').includes('zalo') && (
                        <textarea
                          value={item.config?.message || ''}
                          onChange={(e) => handleNodeConfigChange(nodeId, 'message', e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs resize-none focus:border-orange-400 outline-none"
                          rows={3}
                          placeholder="Nội dung tin nhắn Zalo..."
                        />
                      )}
                    </>
                  )}
                </div>
              );
            }) : (
              <p className="text-xs text-slate-400 text-center py-4">Không có node nào để chỉnh sửa</p>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 bg-white/50 border-t border-orange-100 flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2 bg-slate-100 text-slate-600 font-bold text-xs uppercase tracking-wider rounded-lg hover:bg-slate-200 transition-colors"
        >
          Huỷ
        </button>
        <button
          onClick={handleSave}
          className="flex-1 py-2 bg-orange-500 text-white font-bold text-xs uppercase tracking-wider rounded-lg hover:bg-orange-600 transition-colors"
        >
          Lưu thay đổi
        </button>
      </div>
    </div>
  );
};

// Confirm create card - hiển thị summary và hỏi xác nhận
const ConfirmCreateCard = ({ script, onConfirm, onEdit, onCancel }) => {
  const summary = script?.summary || {};
  const steps = summary.steps || [];
  
  return (
    <div className="mt-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-emerald-500 text-white">
        <div className="flex items-center gap-2 mb-2">
          <HiOutlineSparkles className="w-5 h-5" />
          <span className="font-black text-[10px] uppercase tracking-[0.2em]">Xác nhận tạo chiến dịch</span>
        </div>
        <h4 className="font-bold text-lg">{script?.campaignName}</h4>
        {script?.description && (
          <p className="text-xs text-emerald-100 mt-1">{script.description}</p>
        )}
      </div>
      
      {/* Summary stats */}
      <div className="p-4 border-b border-emerald-100">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/60 rounded-lg p-2 text-center">
            <p className="text-lg font-black text-emerald-700">{summary.totalSteps || script?.nodes?.length || 0}</p>
            <p className="text-[10px] text-emerald-600 uppercase tracking-wider">Bước</p>
          </div>
          <div className="bg-white/60 rounded-lg p-2 text-center">
            <p className="text-lg font-black text-emerald-700">{summary.duration || 'N/A'}</p>
            <p className="text-[10px] text-emerald-600 uppercase tracking-wider">Thời gian</p>
          </div>
          <div className="bg-white/60 rounded-lg p-2 text-center">
            <p className="text-lg font-black text-emerald-700">
              {script?.campaignType === 'email' ? '📧' : 
               script?.campaignType === 'zalo' ? '💬' : 
               script?.campaignType === 'zalo_group' ? '👥' : '📱'}
            </p>
            <p className="text-[10px] text-emerald-600 uppercase tracking-wider">
              {script?.campaignType === 'email' ? 'Email' : 
               script?.campaignType === 'zalo' ? 'Zalo' : 
               script?.campaignType === 'zalo_group' ? 'Nhóm' : 'Đa kênh'}
            </p>
          </div>
        </div>
      </div>
      
      {/* Steps preview */}
      <div className="p-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Các bước:</p>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {steps.length > 0 ? steps.map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                {step.step}
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-slate-700">{step.action}</p>
                <p className="text-[10px] text-slate-400">{step.timing}</p>
              </div>
            </div>
          )) : (
            script?.nodes?.filter(n => n.nodeType !== 'trigger' && n.nodeType !== 'start').slice(0, 5).map((node, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-slate-700">{node.nodeName || node.nodeSubtype}</p>
                  <p className="text-[10px] text-slate-400">
                    {node.nodeType === 'action' ? (
                      node.nodeSubtype === 'send_email' ? '📧 Email' :
                      node.nodeSubtype === 'send_zalo_personal' ? '💬 Zalo cá nhân' :
                      node.nodeSubtype === 'send_zalo_group' ? '👥 Zalo nhóm' :
                      node.nodeSubtype === 'delay' || node.nodeSubtype === 'wait_time' ? '⏰ Chờ' :
                      '⚡ Action'
                    ) : node.nodeType === 'logic' ? '⏰ Chờ' : '▶️ Bước'}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      
      {/* Actions */}
      <div className="p-4 bg-white/50 border-t border-emerald-100">
        <div className="space-y-2">
          <button 
            onClick={onConfirm}
            className="w-full py-3 bg-emerald-500 text-white font-black text-sm uppercase tracking-widest rounded-xl hover:bg-emerald-600 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30"
          >
            <HiOutlineCheck className="w-5 h-5" />
            Tạo chiến dịch
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={onEdit}
              className="py-2.5 bg-white border border-slate-200 text-slate-700 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-slate-50 flex items-center justify-center gap-1.5"
            >
              <HiOutlinePencilAlt className="w-4 h-4 text-orange-500" />
              Chỉnh sửa
            </button>
            <button 
              onClick={onCancel}
              className="py-2.5 bg-slate-50 border border-slate-200 text-slate-500 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-slate-100 flex items-center justify-center gap-1.5"
            >
              Huỷ bỏ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Auto-creating campaign progress card
const AutoCreatingCard = ({ campaignName, onView }) => (
  <div className="mt-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-4">
    <div className="flex items-center gap-3 mb-3">
      <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center animate-pulse">
        <HiOutlinePlay className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold text-green-800">Đang tạo và chạy chiến dịch...</p>
        <p className="text-xs text-green-600">{campaignName}</p>
      </div>
    </div>
    <div className="flex items-center gap-2 mb-3">
      <div className="flex-1 h-2 bg-green-100 rounded-full overflow-hidden">
        <div className="h-full bg-green-500 rounded-full animate-pulse w-full" />
      </div>
    </div>
    <p className="text-xs text-green-700 mb-3">
      ✨ Chiến dịch sẽ được tạo tự động và bắt đầu chạy ngay!
    </p>
    {onView && (
      <button
        onClick={onView}
        className="w-full py-2.5 bg-green-500 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-green-600 flex items-center justify-center gap-2"
      >
        <HiOutlineTerminal className="w-4 h-4" />
        Xem chiến dịch
      </button>
    )}
  </div>
);

// Success card after auto-creating campaign
const AutoCreatedSuccessCard = ({ result, onView }) => (
  <div className="mt-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-4">
    <div className="flex items-center gap-3 mb-3">
      <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center">
        <HiOutlineCheck className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-sm font-bold text-green-800">Chiến dịch đang chạy!</p>
        <p className="text-xs text-green-600">{result.campaignName}</p>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2 mb-3">
      <div className="bg-white/60 rounded-lg p-2">
        <p className="text-[10px] text-green-600 uppercase tracking-wider">Campaign ID</p>
        <p className="text-sm font-bold text-green-800">#{result.campaignId}</p>
      </div>
      {result.runId && (
        <div className="bg-white/60 rounded-lg p-2">
          <p className="text-[10px] text-green-600 uppercase tracking-wider">Run ID</p>
          <p className="text-sm font-bold text-green-800">#{result.runId}</p>
        </div>
      )}
    </div>
    <div className="flex items-center gap-2 text-xs text-green-700 mb-3">
      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
      <span>Đang chạy và gửi tin nhắn</span>
    </div>
    {onView && (
      <button
        onClick={onView}
        className="w-full py-2.5 bg-white border border-green-300 text-green-700 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-green-50 flex items-center justify-center gap-2"
      >
        <HiOutlineTerminal className="w-4 h-4" />
        Xem chiến dịch
      </button>
    )}
  </div>
);

// Campaign picker modal
const CampaignPickerModal = ({ isOpen, onClose, onSelect }) => {
  const [campaigns, setCampaigns] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoadingCampaigns(true);
      api.get('/campaigns', { params: { status: 'draft,active,paused', limit: 50 } })
        .then(res => setCampaigns(res.data.data || []))
        .catch(() => setCampaigns([]))
        .finally(() => setLoadingCampaigns(false));
    }
  }, [isOpen]);

  const filtered = campaigns.filter(c =>
    c.campaignName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[70vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <HiOutlineFolderOpen className="w-5 h-5 text-orange-500" />
            <h3 className="font-bold text-slate-800">Chọn chiến dịch</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-lg">
            <HiOutlineX className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-4 border-b border-slate-100">
          <input
            type="text"
            placeholder="Tìm kiếm chiến dịch..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loadingCampaigns ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8">Không có chiến dịch nào</p>
          ) : (
            <div className="space-y-1">
              {filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => onSelect(c)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-left transition-colors"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                    c.campaignType === 'email' ? 'bg-orange-100 text-orange-600' :
                    c.campaignType === 'zalo' ? 'bg-blue-100 text-blue-600' :
                    c.campaignType === 'zalo_group' ? 'bg-purple-100 text-purple-600' :
                    'bg-green-100 text-green-600'
                  }`}>
                    {c.campaignType?.charAt(0).toUpperCase() || 'M'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{c.campaignName}</p>
                    <p className="text-[10px] text-slate-400">{c.campaignType} • {c.status}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Landing page card - now imported from ./components/LandingPageCard.jsx

const AiChatbot = ({ isOpen, onToggle, panelWidth = 420, onWidthChange, onResizeStart, onResizeEnd }) => {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'admin';

  const welcomeMessage = isSuperAdmin
    ? 'Xin chào Admin! 📊 Tôi có thể giúp bạn phân tích dữ liệu nền tảng Founder AI theo thời gian thực.\n\nBạn có thể hỏi tôi về:\n- Doanh thu, đơn hàng tháng này\n- Số lượng thành viên, ai sắp hết hạn\n- Phân bố gói dịch vụ\n- Tình trạng chiến dịch toàn nền tảng\n\nHãy hỏi tôi!'
    : 'Chào bạn! 👋 Tôi có thể giúp bạn:\n\n📧 Viết template Email / Zalo\n🚀 Tạo và chạy chiến dịch tự động\n🌐 Thiết kế Landing Page\n\nChỉ cần mô tả yêu cầu, tôi sẽ tự tạo và chạy chiến dịch cho bạn!';

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
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [pendingLandingPrompt, setPendingLandingPrompt] = useState(null);
  const [pendingLandingData, setPendingLandingData] = useState(null);
  const [, setSelectedTemplate] = useState(null);
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

  const loadSession = async (sessionId) => {
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
    setShowSessionList(false);
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
    const userMsg = { role: 'user', content: inputText, files: [...uploadedFiles] };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputText('');
    setUploadedFiles([]);
    setIsTyping(true);

    try {
      const response = await aiApi.chat(newHistory, userMsg.files, currentSessionId);
      if (response.success) {
        const { type, content, data, missing_fields, sessionId: returnedSessionId, sessionTitle } = response.data;
        // Cập nhật session state
        if (returnedSessionId && !currentSessionId) {
          setCurrentSessionId(returnedSessionId);
          setSessions(prev => [{ id: returnedSessionId, title: sessionTitle || inputText.slice(0, 60), updated_at: new Date().toISOString(), created_at: new Date().toISOString() }, ...prev]);
        } else if (returnedSessionId) {
          setSessions(prev => prev.map(s => s.id === returnedSessionId ? { ...s, updated_at: new Date().toISOString() } : s));
        }

        // Xử lý ask_campaign_details - hỏi gộp tất cả câu hỏi 1 lần
        if (type === 'ask_campaign_details' && data) {
          setPendingCampaignPrompt(inputText);
          setPendingCampaignData(data);
          setMessages(prev => [...prev, { role: 'assistant', content, type, data }]);
          return;
        }

        // Xử lý ask_landing_details - hỏi gộp thông tin để tạo landing page
        if (type === 'ask_landing_details' && data) {
          setPendingLandingPrompt(inputText);
          setPendingLandingData(data);
          setMessages(prev => [...prev, { role: 'assistant', content, type, data }]);
          return;
        }

        // Xử lý ask_campaign_type - hỏi user chọn kênh (legacy)
        if (type === 'ask_campaign_type' && data) {
          setPendingCampaignPrompt(inputText);
          setPendingCampaignData(data);
          setMessages(prev => [...prev, {
            role: 'assistant', content, type, data,
          }]);
          return;
        }

        // Xử lý ask_audience - skip, AI sẽ trả trực tiếp confirm_create
        if (type === 'ask_audience' && data) {
          // Skip ask_audience, AI sẽ trả confirm_create ngay
          setPendingCampaignData(prev => prev ? { ...prev, ...data } : data);
          setMessages(prev => [...prev, {
            role: 'assistant', content, type, data,
          }]);
          return;
        }

        // Xử lý confirm_create - hiển thị summary và hỏi xác nhận
        if (type === 'confirm_create' && data) {
          setCurrentScript(data);
          setMessages(prev => [...prev, {
            role: 'assistant', content, type, data,
          }]);
          return;
        }

        // Xử lý create_and_run - tự động tạo và chạy campaign
        if (type === 'create_and_run' && data) {
          setCreatingCampaign(true);
          const scriptData = {
            ...data,
            isAiDraft: false,
            autoRun: true,
          };

          // Thêm message là đang tạo
          setMessages(prev => [...prev, {
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
              setMessages(prev => [...prev, {
                role: 'assistant',
                content: `🎉 Chiến dịch "${createResult.data.campaignName}" đã được tạo và đang chạy!\n\nRun ID: ${createResult.data.runId || 'N/A'}\n\nBạn có thể theo dõi tiến trình tại trang Chiến dịch.`,
                type: 'auto_created_success',
                data: createResult.data,
              }]);
            } else {
              setMessages(prev => [...prev, {
                role: 'assistant',
                content: `⚠️ ${createResult.message || 'Có lỗi khi tạo chiến dịch. Vui lòng thử lại.'}`,
                type: 'error',
              }]);
            }
          } catch (createErr) {
            setCreatingCampaign(false);
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `⚠️ Lỗi: ${createErr.response?.data?.message || createErr.message}`,
              type: 'error',
            }]);
          }
          return;
        }

        // Xử lý các type khác như bình thường
        setMessages(prev => [...prev, {
          role: 'assistant', content, type, data,
          missing_fields: missing_fields || [],
        }]);
        if (type === 'confirm_create') setCurrentScript(data);
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ Lỗi: ${error.response?.data?.message || error.message}`
      }]);
    } finally {
      setIsTyping(false);
      isSendingRef.current = false;
    }
  };

  const handleEditTemplate = (draft) => {
    navigate('/app/settings/templates', { state: { aiDraft: draft } });
    onToggle?.();
  };

  // Write AI campaign script to sessionStorage draft so CampaignBuilder loads it directly
  const handleEditCampaign = (script) => {
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
    setMessages(prev => [...prev, { role: 'user', content: summaryText }]);

    try {
      const enrichedHistory = [
        ...messages,
        { role: 'user', content: pendingCampaignPrompt },
        { role: 'assistant', content: 'Cho tôi hỏi vài điều để thiết kế chiến dịch phù hợp.' },
        { role: 'user', content: summaryText },
      ];
      const response = await aiApi.chat(enrichedHistory, uploadedFiles);
      if (response.success) {
        const { type, content, data } = response.data;
        if (type === 'confirm_create' && data) {
          setCurrentScript({ ...data, ...answers });
          setMessages(prev => [...prev, { role: 'assistant', content, type, data: { ...data, ...answers } }]);
        } else {
          setMessages(prev => [...prev, { role: 'assistant', content, type, data }]);
          if (type === 'campaign_script' && data) setCurrentScript({ ...data, ...answers });
        }
        setPendingCampaignPrompt(null);
        setPendingCampaignData(null);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi khi tạo chiến dịch');
    } finally {
      setIsTyping(false);
    }
  };

  const handleLandingDetailsSubmit = async (summaryText, answers) => {
    if (!pendingLandingPrompt) return;
    setIsTyping(true);
    setMessages(prev => [...prev, { role: 'user', content: summaryText }]);

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
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Đã tạo landing page "${title}" cho bạn! Bạn có thể xem trước và lưu vào thư viện.`,
          type: 'landing_page',
          data: { title, html, css },
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Có lỗi khi tạo landing page: ${err.response?.data?.message || err.message}`,
      }]);
    } finally {
      setIsTyping(false);
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
      
      const response = await aiApi.chat(enrichedHistory, []);
      
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

      const response = await aiApi.chat(enrichedHistory, []);

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

  const handlePushToExisting = (script) => {
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

  // Handle template selection and generate landing page
  const handleTemplateSelect = async (template) => {
    if (!pendingLandingPrompt) return;

    setSelectedTemplate(template);
    setShowTemplateSelector(false);
    setIsTyping(true);

    const templateContext = template
      ? `Tôi muốn dựa trên template "${template.name}" (${template.category}). `
      : 'Tôi muốn tạo landing page từ đầu. ';

    const fullPrompt = templateContext + pendingLandingPrompt;

    try {
      const response = await aiApi.generateLandingPage(fullPrompt, template?.id || null, uploadedFiles, currentSessionId);

      if (response.success) {
        const { title, html, css, variables } = response.data;

        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Đã tạo landing page "${title}" cho bạn! Bạn có thể xem trước, chỉnh sửa và lưu vào thư viện.`,
          type: 'landing_page',
          data: {
            title,
            html,
            css,
            variables,
            templateId: template?.id,
            templateName: template?.name,
          },
        }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ Lỗi khi tạo landing page: ${error.response?.data?.message || error.message}`
      }]);
    } finally {
      setIsTyping(false);
      setSelectedTemplate(null);
      setPendingLandingPrompt(null);
    }
  };

  // Handle generate new landing page from existing card
  const handleGenerateNewLandingPage = () => {
    setShowTemplateSelector(true);
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
          <p className="text-sm font-semibold text-orange-600">Thả file để tải lên</p>
          <p className="text-xs text-orange-400">PDF, Word, Excel, ảnh đều được</p>
        </div>
      )}
      {/* Header */}
      <div className="flex-shrink-0 h-16 border-b border-slate-100 flex items-center justify-between px-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shadow-lg shadow-orange-500/20">
            <HiOutlineSparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Founder AI AI Assistant</h3>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Sẵn sàng</span>
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
          title="Cuộc trò chuyện mới"
          className={`shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
            !currentSessionId
              ? 'bg-orange-50 text-orange-500 border border-orange-200'
              : 'text-slate-400 hover:bg-slate-100 hover:text-orange-500'
          }`}
        >
          <HiOutlinePlus className="w-3 h-3 shrink-0" />
          Mới
        </button>
      </div>

      {/* Banner hồ sơ doanh nghiệp — chỉ hiện cho user_admin */}
      {!isSuperAdmin && (
        <div className={`flex-shrink-0 mx-4 mt-3 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 ${hasProfile ? 'bg-slate-50 border border-slate-200' : 'bg-orange-50 border border-orange-200'}`}>
          <HiOutlineSparkles className={`w-3.5 h-3.5 shrink-0 ${hasProfile ? 'text-slate-400' : 'text-orange-500'}`} />
          <p className={`flex-1 text-xs ${hasProfile ? 'text-slate-500' : 'text-orange-700 font-medium'}`}>
            {hasProfile ? 'AI đang dùng hồ sơ doanh nghiệp của bạn' : 'Chưa có hồ sơ — AI chưa biết về doanh nghiệp bạn'}
          </p>
          <Link
            to="/app/settings/ai-profile"
            onClick={onToggle}
            className={`shrink-0 text-xs font-semibold whitespace-nowrap ${hasProfile ? 'text-slate-500 hover:text-orange-500' : 'text-orange-600 hover:text-orange-700'}`}
          >
            {hasProfile ? 'Xem →' : 'Thiết lập →'}
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
            Tạo Campaign
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
            Template Email
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
                <AskMoreCard missingFields={msg.missing_fields} />
              )}

              {/* Ask campaign type - hỏi user chọn kênh */}
              {msg.type === 'ask_campaign_details' && msg.data && (
                <AskCampaignDetailsCard
                  data={msg.data}
                  onSubmit={handleCampaignDetailsSubmit}
                />
              )}

              {msg.type === 'ask_landing_details' && msg.data && (
                <AskLandingDetailsCard
                  data={msg.data}
                  onSubmit={handleLandingDetailsSubmit}
                />
              )}

              {msg.type === 'ask_campaign_type' && msg.data && (
                <AskCampaignTypeCard
                  data={msg.data}
                  onSelect={handleSelectCampaignType}
                />
              )}

              {/* Ask audience - hỏi user chọn đối tượng khách hàng */}
              {msg.type === 'ask_audience' && msg.data && (
                <AskAudienceCard
                  data={msg.data}
                  onSelect={handleSelectAudience}
                />
              )}

              {/* Confirm create - xác nhận trước khi tạo */}
              {msg.type === 'confirm_create' && msg.data && !isEditingDraft && (
                <ConfirmCreateCard
                  script={msg.data}
                  onConfirm={handleConfirmCreate}
                  onEdit={() => setIsEditingDraft(true)}
                  onCancel={handleCancelCreate}
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
                />
              )}

              {/* Template draft */}
              {msg.type === 'template_draft' && msg.data && (
                <TemplateDraftCard
                  draft={msg.data}
                  onSave={() => {}}
                  onEdit={handleEditTemplate}
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
                />
              )}

              {/* Auto created success */}
              {msg.type === 'auto_created_success' && msg.data && (
                <AutoCreatedSuccessCard
                  result={msg.data}
                  onView={() => navigate(`/app/campaigns/${msg.data.campaignId}/builder`)}
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
            placeholder={isDragging ? 'Thả file vào đây...' : 'Nhập yêu cầu...'}
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
              <span>Đính kèm</span>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-300">Enter để gửi</span>
              <button onClick={handleSend} disabled={!inputText.trim() && !uploadedFiles.length}
                className="w-8 h-8 flex items-center justify-center bg-slate-800 text-white rounded-xl hover:bg-orange-500 disabled:bg-slate-200 disabled:text-slate-400 transition-all">
                <HiOutlineChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-center text-slate-400">Powered by Gemini • Kéo thả PDF, Word, Excel, ảnh vào đây</p>
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
      />

      {/* Template Selector Modal */}
      <TemplateSelector
        isOpen={showTemplateSelector}
        onClose={() => {
          setShowTemplateSelector(false);
          setPendingLandingPrompt(null);
        }}
        onSelect={handleTemplateSelect}
      />
    </div>
  );
};

export default AiChatbot;
