import { useState, useEffect } from 'react';
import {
  HiOutlineCode, HiOutlinePlus, HiOutlineTrash, HiOutlineSave,
  HiOutlineRefresh, HiOutlineX,
  HiOutlineClipboardCopy, HiOutlineCheck,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import chatbotApi from '../../services/chatbotApi';
import { useI18n } from '../../i18n';

function WebWidgetPage() {
  const { t } = useI18n();
  const [widgets, setWidgets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newForm, setNewForm] = useState({ display_name: '', theme_color: '#6366F1' });
  const [copiedKey, setCopiedKey] = useState(null);
  const [_previewMode, _setPreviewMode] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchWidgets(); }, []);

  const fetchWidgets = async () => {
    setLoading(true);
    try {
      const res = await chatbotApi.listWidgets();
      setWidgets(res.data || []);
    } catch { toast.error(t('errors.loadFailed')); }
    finally { setLoading(false); }
  };

  const selectWidget = async (widget) => {
    setSelected(widget);
    setForm({
      display_name: widget.display_name || '',
      theme_color: widget.theme_color || '#6366F1',
      position: widget.position || 'bottom-right',
      welcome_message: widget.welcome_message || '',
      is_active: widget.is_active !== false,
      // Customization
      logo_url: widget.logo_url || '',
      primary_color: widget.primary_color || '#3B82F6',
      background_color: widget.background_color || '#FFFFFF',
      text_color: widget.text_color || '#1F2937',
      accent_color: widget.accent_color || '#60A5FA',
      suggested_questions: widget.suggested_questions || [],
      border_radius: widget.border_radius || 16,
      show_avatar: widget.show_avatar !== false,
      chat_height: widget.chat_height || '500px',
    });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newForm.display_name.trim()) { toast.error(t('common.required')); return; }
    setCreating(true);
    try {
      const res = await chatbotApi.createWidget(newForm);
      setWidgets(prev => [res.data, ...prev]);
      setShowCreate(false);
      setNewForm({ display_name: '', theme_color: '#6366F1' });
      selectWidget(res.data);
      toast.success(t('common.success'));
    } catch { toast.error(t('errors.createFailed')); }
    finally { setCreating(false); }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await chatbotApi.updateWidget(selected.id, form);
      setWidgets(prev => prev.map(w => w.id === selected.id ? res.data : w));
      setSelected(res.data);
      toast.success(t('common.success'));
    } catch { toast.error(t('errors.saveFailed')); }
    finally { setSaving(false); }
  };

  const handleDelete = async (widget, e) => {
    e.stopPropagation();
    if (!confirm(`${t('common.confirm')} Xóa widget "${widget.display_name}"?`)) return;
    try {
      await chatbotApi.deleteWidget(widget.id);
      setWidgets(prev => prev.filter(w => w.id !== widget.id));
      if (selected?.id === widget.id) setSelected(null);
      toast.success(t('common.success'));
    } catch { toast.error(t('errors.deleteFailed')); }
  };

  const copyEmbedCode = (widgetKey) => {
    const code = `<script>
  (function(w,d,s,o,f,js,fjs){
    w['UKnowWidget']=o;w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
    js=d.createElement(s);fjs=d.getElementsByTagName(s)[0];
    js.id='uknow-widget-sdk';js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);
  }(window,document,'script','uw','${window.location.origin}/widget.js'));
  uw('init', { key: '${widgetKey}', position: 'bottom-right' });
</script>`;
    navigator.clipboard.writeText(code);
    setCopiedKey(widgetKey);
    setTimeout(() => setCopiedKey(null), 2000);
    toast.success(t('chatbot.widget.copied'));
  };

  const addSuggestedQuestion = () => {
    if (!newQuestion.trim()) return;
    if (form.suggested_questions.length >= 5) {
      toast.error('Tối đa 5 câu hỏi gợi ý');
      return;
    }
    setForm(p => ({
      ...p,
      suggested_questions: [...(p.suggested_questions || []), newQuestion.trim()]
    }));
    setNewQuestion('');
  };

  const removeSuggestedQuestion = (index) => {
    setForm(p => ({
      ...p,
      suggested_questions: p.suggested_questions.filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
            <HiOutlineCode className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">{t('chatbot.widget.title')}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {t('chatbot.widget.description')}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-violet-500 text-white text-sm font-semibold rounded-xl hover:bg-violet-600 transition-all shadow-sm"
        >
          <HiOutlinePlus className="w-4 h-4" />
          {t('chatbot.widget.createNew')}
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">{t('chatbot.widget.createModalTitle')}</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.widget.widgetName')} *</label>
                <input type="text" value={newForm.display_name} onChange={e => setNewForm(p => ({ ...p, display_name: e.target.value }))}
                  placeholder={t('chatbot.widget.widgetNamePlaceholder')}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 transition-all" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.widget.themeColor')}</label>
                <div className="flex items-center gap-3 mt-1">
                  <input type="color" value={newForm.theme_color} onChange={e => setNewForm(p => ({ ...p, theme_color: e.target.value }))}
                    className="w-10 h-10 rounded-xl border border-slate-200 cursor-pointer p-1" />
                  <input type="text" value={newForm.theme_color} onChange={e => setNewForm(p => ({ ...p, theme_color: e.target.value }))}
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 transition-all font-mono" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">{t('common.cancel')}</button>
                <button type="submit" disabled={creating} className="flex items-center gap-2 px-4 py-2 bg-violet-500 text-white text-sm font-semibold rounded-xl hover:bg-violet-600 disabled:opacity-60 transition-all">
                  {creating ? <><HiOutlineRefresh className="w-4 h-4 animate-spin" />{t('chatbot.widget.creating')}</> : <><HiOutlinePlus className="w-4 h-4" />{t('chatbot.widget.createNew')}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-5">
        {/* Sidebar */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {t('chatbot.widget.widgets')} ({widgets.length})
            </p>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">{t('common.loading')}</div>
          ) : widgets.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-400 mb-3">{t('chatbot.widget.noWidgets')}</p>
              <button onClick={() => setShowCreate(true)} className="text-xs text-violet-500 font-medium hover:underline">
                {t('chatbot.widget.createFirst')}
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {widgets.map(w => (
                <div
                  key={w.id}
                  onClick={() => selectWidget(w)}
                  className={`px-4 py-3 cursor-pointer hover:bg-violet-50 transition-colors ${selected?.id === w.id ? 'bg-violet-50 border-l-2 border-violet-500' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: w.theme_color }} />
                        <p className="text-sm font-medium text-slate-700 truncate">{w.display_name || w.widget_key}</p>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono mt-1">{w.widget_key}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{w.conversation_count || 0} {t('chatbot.widget.conversations')}</p>
                    </div>
                    <button onClick={(e) => handleDelete(w, e)} className="p-1 text-slate-300 hover:text-red-400 transition-colors shrink-0">
                      <HiOutlineTrash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Edit Panel */}
        <div className="col-span-2">
          {selected ? (
            <div className="space-y-4">
              <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800">{t('chatbot.widget.widgetSettings')}</h3>
                  <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-1.5 bg-violet-500 text-white text-xs font-semibold rounded-lg hover:bg-violet-600 disabled:opacity-60 transition-all">
                    {saving ? <><HiOutlineRefresh className="w-3.5 h-3.5 animate-spin" />{t('chatbot.widget.saving')}</> : <><HiOutlineSave className="w-3.5 h-3.5" />{t('common.save')}</>}
                  </button>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.widget.widgetName')}</label>
                      <input type="text" value={form.display_name} onChange={e => setForm(p => ({ ...p, display_name: e.target.value }))}
                        className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 transition-all" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('common.status')}</label>
                      <select value={form.is_active ? 'on' : 'off'} onChange={e => setForm(p => ({ ...p, is_active: e.target.value === 'on' }))}
                        className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 transition-all bg-white">
                        <option value="on">{t('chatbot.subAssistant.active')}</option>
                        <option value="off">{t('chatbot.subAssistant.disabled')}</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.widget.themeColor')}</label>
                      <div className="flex items-center gap-2 mt-1">
                        <input type="color" value={form.theme_color} onChange={e => setForm(p => ({ ...p, theme_color: e.target.value }))}
                          className="w-10 h-10 rounded-xl border border-slate-200 cursor-pointer p-1" />
                        <input type="text" value={form.theme_color} onChange={e => setForm(p => ({ ...p, theme_color: e.target.value }))}
                          className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 transition-all font-mono" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.widget.position')}</label>
                      <select value={form.position} onChange={e => setForm(p => ({ ...p, position: e.target.value }))}
                        className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 transition-all bg-white">
                        <option value="bottom-right">{t('chatbot.widget.positionBottomRight')}</option>
                        <option value="bottom-left">{t('chatbot.widget.positionBottomLeft')}</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.widget.welcomeMessage')}</label>
                    <input type="text" value={form.welcome_message} onChange={e => setForm(p => ({ ...p, welcome_message: e.target.value }))}
                      placeholder={t('chatbot.widget.welcomeMessagePlaceholder')}
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 transition-all" />
                  </div>

                  {/* Customization Section */}
                  <div className="border-t border-slate-100 pt-4 mt-4">
                    <h4 className="text-sm font-bold text-slate-700 mb-3">Tuỳ chỉnh giao diện</h4>
                    
                    {/* Logo */}
                    <div className="mb-4">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.widget.logo') || 'Logo'}</label>
                      <input type="url" value={form.logo_url} onChange={e => setForm(p => ({ ...p, logo_url: e.target.value }))}
                        placeholder="https://example.com/logo.png"
                        className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 transition-all" />
                    </div>

                    {/* Colors Grid */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Màu chính</label>
                        <div className="flex items-center gap-2 mt-1">
                          <input type="color" value={form.primary_color} onChange={e => setForm(p => ({ ...p, primary_color: e.target.value }))}
                            className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer" />
                          <input type="text" value={form.primary_color} onChange={e => setForm(p => ({ ...p, primary_color: e.target.value }))}
                            className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-violet-400 font-mono" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Màu nền</label>
                        <div className="flex items-center gap-2 mt-1">
                          <input type="color" value={form.background_color} onChange={e => setForm(p => ({ ...p, background_color: e.target.value }))}
                            className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer" />
                          <input type="text" value={form.background_color} onChange={e => setForm(p => ({ ...p, background_color: e.target.value }))}
                            className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-violet-400 font-mono" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Màu chữ</label>
                        <div className="flex items-center gap-2 mt-1">
                          <input type="color" value={form.text_color} onChange={e => setForm(p => ({ ...p, text_color: e.target.value }))}
                            className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer" />
                          <input type="text" value={form.text_color} onChange={e => setForm(p => ({ ...p, text_color: e.target.value }))}
                            className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-violet-400 font-mono" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Màu nhấn</label>
                        <div className="flex items-center gap-2 mt-1">
                          <input type="color" value={form.accent_color} onChange={e => setForm(p => ({ ...p, accent_color: e.target.value }))}
                            className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer" />
                          <input type="text" value={form.accent_color} onChange={e => setForm(p => ({ ...p, accent_color: e.target.value }))}
                            className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-violet-400 font-mono" />
                        </div>
                      </div>
                    </div>

                    {/* Show Avatar Toggle */}
                    <div className="flex items-center gap-3 mb-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={form.show_avatar} onChange={e => setForm(p => ({ ...p, show_avatar: e.target.checked }))}
                          className="w-4 h-4 rounded border-slate-300 text-violet-500 focus:ring-violet-400" />
                        <span className="text-sm text-slate-600">Hiển thị avatar bot</span>
                      </label>
                    </div>

                    {/* Suggested Questions */}
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Câu hỏi gợi ý (tối đa 5)
                      </label>
                      <div className="flex gap-2 mt-1">
                        <input type="text" value={newQuestion} onChange={e => setNewQuestion(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSuggestedQuestion())}
                          placeholder="Nhập câu hỏi..."
                          className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-violet-400 transition-all" />
                        <button type="button" onClick={addSuggestedQuestion}
                          className="px-3 py-2 bg-violet-500 text-white rounded-xl text-sm hover:bg-violet-600 transition-colors">
                          Thêm
                        </button>
                      </div>
                      {form.suggested_questions?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {form.suggested_questions.map((q, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-3 py-1 bg-violet-50 text-violet-600 rounded-full text-xs">
                              {q}
                              <button onClick={() => removeSuggestedQuestion(i)} className="hover:text-violet-800 ml-1">×</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </form>

              {/* Embed Code */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-800">{t('chatbot.widget.embedCode')}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{t('chatbot.widget.embedCodeTip')}</p>
                </div>
                <div className="p-5">
                  <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-xs font-mono overflow-x-auto leading-relaxed">
{`<script>
  (function(w,d,s,o,f,js,fjs){
    w['UKnowWidget']=o;w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
    js=d.createElement(s);fjs=d.getElementsByTagName(s)[0];
    js.id='uknow-widget-sdk';js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);
  }(window,document,'script','uw','${window.location.origin}/widget.js'));
  uw('init', { key: '${selected.widget_key}', position: '${form.position || 'bottom-right'}' });
</script>`}
                  </pre>
                  <button
                    onClick={() => copyEmbedCode(selected.widget_key)}
                    className="mt-3 flex items-center gap-2 px-4 py-2 bg-violet-500 text-white text-xs font-semibold rounded-xl hover:bg-violet-600 transition-all"
                  >
                    {copiedKey === selected.widget_key ? <><HiOutlineCheck className="w-4 h-4" />{t('chatbot.channels.copied')}</> : <><HiOutlineClipboardCopy className="w-4 h-4" />{t('chatbot.widget.copyCode')}</>}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl h-full flex items-center justify-center min-h-64">
              <div className="text-center">
                <HiOutlineCode className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-400">{t('chatbot.widget.selectFirst')}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default WebWidgetPage;
