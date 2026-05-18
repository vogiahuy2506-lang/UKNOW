import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import {
  HiOutlineSparkles, HiOutlinePaperClip, HiOutlineX,
  HiOutlineChevronRight, HiOutlinePlay, HiOutlineArrowRight,
  HiOutlineTerminal, HiOutlinePencilAlt, HiOutlineCheck,
  HiOutlineQuestionMarkCircle,
  HiOutlineMail, HiOutlineChat,
  HiOutlineDatabase, HiOutlineFolderOpen,
  HiOutlineGlobeAlt,
} from 'react-icons/hi';
import { writeCampaignDraft } from '../../utils/campaignDraftStorage';
import { toast } from 'react-hot-toast';
import aiApi from '../../services/aiApi';
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

// Campaign script card
const CampaignScriptCard = ({ script, onCreate, onEdit, onPushToExisting }) => (
  <div className="mt-4 bg-orange-50/50 rounded-2xl p-4 border border-orange-100">
    <div className="flex items-center gap-2 mb-3 text-orange-600">
      <HiOutlineTerminal className="w-5 h-5" />
      <span className="font-black text-[10px] uppercase tracking-[0.2em]">Kịch bản chiến dịch (Draft)</span>
    </div>
    <h4 className="font-bold text-slate-900 text-sm mb-1">{script.campaignName}</h4>
    <p className="text-xs text-slate-500 mb-4 leading-relaxed">{script.description}</p>
    <div className="space-y-2 mb-4">
      {script.nodes?.filter(n => n.nodeType !== 'trigger').slice(0, 5).map((node, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-full bg-white border border-orange-100 flex items-center justify-center text-[10px] font-bold text-orange-500 shadow-sm">{i + 1}</div>
          <div className="flex-1">
            <p className="text-xs text-slate-700 font-bold">{node.nodeName || node.nodeSubtype}</p>
            {node.config?.subject && <p className="text-[10px] text-slate-400 line-clamp-1 italic">Sub: {node.config.subject}</p>}
            {node.config?.zaloAccountId && <p className="text-[10px] text-blue-400 line-clamp-1">Zalo Account: #{node.config.zaloAccountId}</p>}
          </div>
        </div>
      ))}
      {script.nodes?.length > 6 && <span className="text-[10px] text-slate-400 ml-9">+ {script.nodes.length - 6} bước nữa</span>}
    </div>
    <div className="space-y-2">
      <button onClick={onCreate} className="w-full py-2.5 bg-orange-500 text-white font-black text-[11px] uppercase tracking-widest rounded-xl hover:bg-orange-600 flex items-center justify-center gap-2">
        <HiOutlinePlay className="w-4 h-4" /> Tạo chiến dịch
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => onPushToExisting?.(script)} className="py-2.5 bg-white border border-slate-200 text-slate-700 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-slate-50 flex items-center justify-center gap-1.5">
          <HiOutlineDatabase className="w-4 h-4 text-blue-500" /> Đẩy vào campaign có sẵn
        </button>
        <button onClick={() => onEdit?.(script)} className="py-2.5 bg-slate-50 border border-slate-200 text-slate-700 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-slate-100 flex items-center justify-center gap-1.5">
          <HiOutlinePencilAlt className="w-4 h-4 text-orange-500" /> Tùy chỉnh
        </button>
      </div>
    </div>
  </div>
);

// Landing page card - now imported from ./components/LandingPageCard.jsx

const AiChatbot = ({ isOpen, onToggle }) => {
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
  const [currentScript, setCurrentScript] = useState(null);
  const [hasProfile, setHasProfile] = useState(true);
  const [showCampaignPicker, setShowCampaignPicker] = useState(false);
  const [selectedScriptForPush, setSelectedScriptForPush] = useState(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [pendingLandingPrompt, setPendingLandingPrompt] = useState(null);
  const [, setSelectedTemplate] = useState(null);
  const [_creatingCampaign, setCreatingCampaign] = useState(false);
  const [autoCreatedCampaign, setAutoCreatedCampaign] = useState(null);
  
  // Trạng thái cho flow campaign mới: hỏi chọn type → hỏi audience → confirm → tạo
  const [pendingCampaignPrompt, setPendingCampaignPrompt] = useState(null); // Prompt gốc của user
  const [pendingCampaignData, setPendingCampaignData] = useState(null); // Data từ AI khi hỏi campaign type
  const [isEditingDraft, setIsEditingDraft] = useState(false); // Đang chỉnh sửa draft trong chatbot
  const [_selectedCampaignType, setSelectedCampaignType] = useState(null); // Type đã chọn (email/zalo/zalo_group)
  const [_selectedAudience, setSelectedAudience] = useState(null); // Audience đã chọn (interested/cart_abandoned/all)

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      if (!isSuperAdmin) {
        aiApi.getBusinessProfile()
          .then(res => setHasProfile(!!res.data))
          .catch(() => setHasProfile(true));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ scroll khi messages đổi; isOpen chỉ là guard
  }, [messages]);

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setIsUploading(true);
    try {
      const results = await Promise.all(files.map(async (file) => {
        const fd = new FormData();
        fd.append('file', file);
        const res = await api.post('/uploads/temp', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        return res.data.data;
      }));
      setUploadedFiles(prev => [...prev, ...results]);
      toast.success(`Đã tải lên ${results.length} tệp`);
    } catch {
      toast.error('Tải tệp lên thất bại');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() && !uploadedFiles.length) return;
    const userMsg = { role: 'user', content: inputText, files: [...uploadedFiles] };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputText('');
    setUploadedFiles([]);
    setIsTyping(true);

    try {
      const response = await aiApi.chat(newHistory, userMsg.files);
      if (response.success) {
        const { type, content, data, missing_fields } = response.data;

        // Xử lý ask_campaign_type - hỏi user chọn kênh
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
        if (type === 'campaign_script') setCurrentScript(data);
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ Lỗi: ${error.response?.data?.message || error.message}`
      }]);
    } finally {
      setIsTyping(false);
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
        } else if (type === 'campaign_script' && data) {
          // Fallback nếu AI trả về campaign_script
          setCurrentScript({
            ...data,
            campaignType: campaignType,
          });
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: content || 'Chiến dịch đã được tạo!',
            type: 'campaign_script',
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
        } else if (type === 'campaign_script' && data) {
          // Fallback nếu AI trả về campaign_script
          setCurrentScript({
            ...data,
            campaignType: pendingCampaignData?.campaignType,
            audience: audience,
          });
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: content || 'Chiến dịch đã được tạo!',
            type: 'campaign_script',
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
      const response = await aiApi.generateLandingPage(fullPrompt, template?.id || null, uploadedFiles);

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
    <div className={`fixed top-0 right-0 h-full bg-white border-l border-slate-200 shadow-2xl transition-all duration-300 z-40 flex flex-col overflow-hidden ${isOpen ? 'w-full sm:w-[420px] translate-x-0' : 'w-0 translate-x-full'}`}>
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
        <button onClick={onToggle} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-slate-600">
          <HiOutlineArrowRight className="w-5 h-5" />
        </button>
      </div>

      {/* Banner nhắc thiết lập hồ sơ — chỉ hiện cho user_admin */}
      {!isSuperAdmin && !hasProfile && (
        <div className="flex-shrink-0 mx-4 mt-3 flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
          <HiOutlineSparkles className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-orange-800">Chưa có hồ sơ doanh nghiệp</p>
            <p className="text-xs text-orange-600 mt-0.5">Thiết lập để AI cá nhân hóa nội dung theo đúng thương hiệu của bạn.</p>
          </div>
          <Link
            to="/app/settings/ai-profile"
            onClick={onToggle}
            className="shrink-0 text-xs font-bold text-orange-600 hover:text-orange-700 underline underline-offset-2 whitespace-nowrap"
          >
            Thiết lập →
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
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-800">{msg.content}</p>

              {/* Files */}
              {msg.files?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {msg.files.map((f, i) => (
                    <div key={i} className="bg-white rounded-lg px-2 py-1 flex items-center gap-1.5 text-[10px] border border-slate-200">
                      <HiOutlinePaperClip className="w-3 h-3 text-slate-400" />
                      <span className="truncate max-w-[100px] font-medium text-slate-600">{f.originalName}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Ask more */}
              {msg.type === 'ask_more' && msg.missing_fields?.length > 0 && (
                <AskMoreCard missingFields={msg.missing_fields} />
              )}

              {/* Ask campaign type - hỏi user chọn kênh */}
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

              {/* Campaign script */}
              {msg.type === 'campaign_script' && msg.data && (
                <CampaignScriptCard
                  script={msg.data}
                  onCreate={handleCreateCampaign}
                  onEdit={handleEditCampaign}
                  onPushToExisting={handlePushToExisting}
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
      <div className="flex-shrink-0 p-4 border-t border-slate-100 bg-white">
        {uploadedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {uploadedFiles.map(f => (
              <div key={f.tempId} className="flex items-center gap-1.5 bg-slate-50 rounded-xl pl-3 pr-2 py-1.5 text-xs border border-slate-100">
                <HiOutlinePaperClip className="w-3.5 h-3.5 text-slate-400" />
                <span className="truncate max-w-[130px] font-semibold text-slate-600">{f.originalName}</span>
                <button onClick={() => setUploadedFiles(p => p.filter(x => x.tempId !== f.tempId))} className="p-0.5 hover:text-red-500">
                  <HiOutlineX className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="relative">
          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Nhập yêu cầu... (Enter để gửi)"
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-4 pr-12 py-3.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 resize-none min-h-[90px] transition-all"
          />
          <div className="absolute right-3 bottom-3 flex gap-1.5">
            <button onClick={() => fileInputRef.current?.click()} disabled={isUploading}
              className="p-2 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-xl disabled:opacity-50">
              {isUploading
                ? <div className="w-4 h-4 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
                : <HiOutlinePaperClip className="w-4 h-4" />}
            </button>
            <button onClick={handleSend} disabled={!inputText.trim() && !uploadedFiles.length}
              className="p-2 bg-slate-900 text-white rounded-xl hover:bg-orange-500 disabled:bg-slate-200 disabled:shadow-none transition-all">
              <HiOutlineChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-center text-slate-400">Powered by Gemini • Founder AI Marketing AI</p>
      </div>

      <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden"
        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" />

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
