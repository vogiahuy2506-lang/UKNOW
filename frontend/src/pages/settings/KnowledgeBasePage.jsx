import { useState, useEffect, useRef } from 'react';
import {
  HiOutlineBookOpen, HiOutlinePlus, HiOutlineTrash, HiOutlineUpload,
  HiOutlineLink, HiOutlineDocumentText, HiOutlineRefresh, HiOutlineSave,
  HiOutlineEye, HiOutlineX, HiOutlineCheck, HiOutlineClock,
  HiOutlineExclamationCircle, HiOutlineSparkles, HiOutlineChip,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import chatbotApi from '../../services/chatbotApi';
import { useI18n } from '../../i18n';

const STATUS_COLORS = {
  pending: 'text-slate-400 bg-slate-100',
  processing: 'text-blue-600 bg-blue-100',
  ready: 'text-green-600 bg-green-100',
  error: 'text-red-600 bg-red-100',
};

const STATUS_ICONS = {
  pending: HiOutlineClock,
  processing: HiOutlineRefresh,
  ready: HiOutlineCheck,
  error: HiOutlineExclamationCircle,
};

function KnowledgeBasePage() {
  const { t } = useI18n();
  const [kbs, setKbs] = useState([]);
  const [selectedKb, setSelectedKb] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showTextModal, setShowTextModal] = useState(false);
  const [showChunksModal, setShowChunksModal] = useState(false);
  const [chunks, setChunks] = useState([]);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [addingText, setAddingText] = useState(false);
  const [newKbForm, setNewKbForm] = useState({ name: '', description: '' });
  const [uploadForm, setUploadForm] = useState({ title: '', file: null });
  const [textForm, setTextForm] = useState({ title: '', content: '' });
  const [urlForm, setUrlForm] = useState({ title: '', url: '' });
  const [activeTab, setActiveTab] = useState('documents');
  const [deletingDoc, setDeletingDoc] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => { fetchKBs(); }, []);

  const fetchKBs = async () => {
    setLoading(true);
    try {
      const res = await chatbotApi.listKBs();
      setKbs(res.data || []);
    } catch { toast.error(t('errors.loadFailed')); }
    finally { setLoading(false); }
  };

  const selectKb = async (kb) => {
    setSelectedKb(kb);
    setActiveTab('documents');
    try {
      const res = await chatbotApi.listDocuments(kb.id);
      setDocuments(res.data || []);
    } catch { toast.error(t('errors.loadFailed')); }
  };

  const createKB = async (e) => {
    e.preventDefault();
    if (!newKbForm.name.trim()) { toast.error(t('errors.validationError')); return; }
    setCreating(true);
    try {
      const res = await chatbotApi.createKB(newKbForm);
      setKbs(prev => [res.data, ...prev]);
      setShowCreateModal(false);
      setNewKbForm({ name: '', description: '' });
      toast.success(t('common.success'));
      selectKb(res.data);
    } catch { toast.error(t('errors.saveFailed')); }
    finally { setCreating(false); }
  };

  const deleteKB = async (kb, e) => {
    e.stopPropagation();
    if (!confirm(`Xóa Knowledge Base "${kb.name}" và tất cả tài liệu?`)) return;
    try {
      await chatbotApi.deleteKB(kb.id);
      setKbs(prev => prev.filter(k => k.id !== kb.id));
      if (selectedKb?.id === kb.id) setSelectedKb(null);
      toast.success(t('common.success'));
    } catch { toast.error(t('errors.deleteFailed')); }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) { toast.error(t('chatbot.knowledgeBase.fileTooLarge')); return; }
      setUploadForm(prev => ({ ...prev, file, title: file.name.replace(/\.[^.]+$/, '') }));
    }
    e.target.value = '';
  };

  const uploadFile = async (e) => {
    e.preventDefault();
    if (!uploadForm.file) { toast.error(t('errors.validationError')); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('title', uploadForm.title || uploadForm.file.name);
      formData.append('file', uploadForm.file);
      const res = await chatbotApi.uploadDocument(selectedKb.id, formData);
      setDocuments(prev => [res.data, ...prev]);
      setShowUploadModal(false);
      setUploadForm({ title: '', file: null });
      toast.success(t('chatbot.knowledgeBase.processing'));
    } catch { toast.error(t('errors.uploadFailed')); }
    finally { setUploading(false); }
  };

  const addTextContent = async (e) => {
    e.preventDefault();
    if (!textForm.content.trim()) { toast.error(t('errors.validationError')); return; }
    setAddingText(true);
    try {
      const res = await chatbotApi.addTextDocument(selectedKb.id, textForm);
      setDocuments(prev => [res.data, ...prev]);
      setShowTextModal(false);
      setTextForm({ title: '', content: '' });
      toast.success(t('chatbot.knowledgeBase.processing'));
    } catch { toast.error(t('errors.addFailed')); }
    finally { setAddingText(false); }
  };

  const addUrlContent = async (e) => {
    e.preventDefault();
    if (!urlForm.url.trim()) { toast.error(t('errors.validationError')); return; }
    setAddingText(true);
    try {
      const res = await chatbotApi.addUrlDocument(selectedKb.id, urlForm);
      setDocuments(prev => [res.data, ...prev]);
      setShowTextModal(false);
      setUrlForm({ title: '', url: '' });
      toast.success(t('chatbot.knowledgeBase.fetching'));
    } catch { toast.error(t('errors.addFailed')); }
    finally { setAddingText(false); }
  };

  const deleteDocument = async (doc) => {
    if (!confirm(`Xóa tài liệu "${doc.title}"?`)) return;
    setDeletingDoc(doc.id);
    try {
      await chatbotApi.deleteDocument(selectedKb.id, doc.id);
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      toast.success(t('common.success'));
    } catch { toast.error(t('errors.deleteFailed')); }
    finally { setDeletingDoc(null); }
  };

  const viewChunks = async (doc) => {
    setShowChunksModal(true);
    try {
      const res = await chatbotApi.getChunks(selectedKb.id, { limit: 50 });
      const docChunks = (res.data || []).filter(c => String(c.id_document) === String(doc.id));
      setChunks(docChunks);
    } catch { toast.error(t('errors.loadFailed')); }
  };

  const reprocessDocument = async (doc, e) => {
    e.stopPropagation();
    try {
      await chatbotApi.reprocessDocument(selectedKb.id, doc.id);
      toast.success(t('chatbot.knowledgeBase.reprocessSuccess'));
    } catch { toast.error(t('errors.reprocessFailed')); }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center shrink-0">
            <HiOutlineBookOpen className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">{t('chatbot.knowledgeBase.title')}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {t('chatbot.knowledgeBase.description')}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-purple-500 text-white text-sm font-semibold rounded-xl hover:bg-purple-600 transition-all shadow-sm"
        >
          <HiOutlinePlus className="w-4 h-4" />
          {t('chatbot.knowledgeBase.createNew')}
        </button>
      </div>

      {/* KB List + Detail */}
      <div className="grid grid-cols-3 gap-5">
        {/* Sidebar */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {t('chatbot.knowledgeBase.knowledgeBases')} ({kbs.length})
            </p>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">{t('common.loading')}</div>
          ) : kbs.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-400 mb-3">{t('chatbot.knowledgeBase.noKnowledgeBases')}</p>
              <button onClick={() => setShowCreateModal(true)} className="text-xs text-purple-500 font-medium hover:underline">
                {t('chatbot.knowledgeBase.createFirst')}
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {kbs.map(kb => (
                <div
                  key={kb.id}
                  onClick={() => selectKb(kb)}
                  className={`px-4 py-3 cursor-pointer hover:bg-purple-50 transition-colors ${selectedKb?.id === kb.id ? 'bg-purple-50 border-l-2 border-purple-500' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{kb.name}</p>
                      {kb.description && (
                        <p className="text-xs text-slate-400 truncate mt-0.5">{kb.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-slate-400">{kb.document_count || 0} {t('chatbot.knowledgeBase.documents').toLowerCase()}</span>
                        <span className="text-[10px] text-slate-400">{kb.total_chunks || 0} chunks</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => deleteKB(kb, e)}
                      className="p-1 text-slate-300 hover:text-red-400 transition-colors shrink-0"
                    >
                      <HiOutlineTrash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className="col-span-2">
          {selectedKb ? (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              {/* KB Header */}
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">{selectedKb.name}</h3>
                  {selectedKb.description && (
                    <p className="text-xs text-slate-400 mt-0.5">{selectedKb.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:border-purple-400 hover:text-purple-600 transition-all"
                  >
                    <HiOutlineUpload className="w-3.5 h-3.5" />
                    {t('chatbot.knowledgeBase.uploadFile')}
                  </button>
                  <button
                    onClick={() => setShowTextModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500 text-white text-xs font-semibold rounded-lg hover:bg-purple-600 transition-all"
                  >
                    <HiOutlinePlus className="w-3.5 h-3.5" />
                    {t('chatbot.knowledgeBase.addContent')}
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-100">
                {['documents', 'chunks'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => { setActiveTab(tab); if (tab === 'chunks') viewChunks({ id: 'all' }); }}
                    className={`px-5 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
                      activeTab === tab
                        ? 'text-purple-600 border-purple-500'
                        : 'text-slate-400 border-transparent hover:text-slate-600'
                    }`}
                  >
                    {tab === 'documents' ? t('chatbot.knowledgeBase.documents') : t('chatbot.knowledgeBase.chunks')}
                  </button>
                ))}
              </div>

              {/* Documents Tab */}
              {activeTab === 'documents' && (
                <div className="p-5">
                  {documents.length === 0 ? (
                    <div className="py-12 text-center">
                      <HiOutlineDocumentText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                      <p className="text-sm text-slate-400 mb-4">{t('chatbot.knowledgeBase.noDocuments')}</p>
                      <div className="flex items-center justify-center gap-3">
                        <button onClick={() => setShowUploadModal(true)} className="text-xs text-purple-500 font-medium hover:underline">
                          {t('chatbot.knowledgeBase.uploadFile')}
                        </button>
                        <span className="text-slate-300">{t('common.or')}</span>
                        <button onClick={() => setShowTextModal(true)} className="text-xs text-purple-500 font-medium hover:underline">
                          {t('chatbot.knowledgeBase.addContent')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {documents.map(doc => {
                        const StatusIcon = STATUS_ICONS[doc.status] || HiOutlineClock;
                        return (
                          <div key={doc.id} className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${STATUS_COLORS[doc.status] || STATUS_COLORS.pending}`}>
                              <StatusIcon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-700 truncate">{doc.title}</p>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-[10px] text-slate-400">{doc.source_type === 'file' ? doc.file_name : doc.source_type}</span>
                                <span className="text-[10px] text-slate-400">{doc.chunk_count || 0} {t('chatbot.knowledgeBase.chunkCount')}</span>
                                {doc.status === 'processing' && (
                                  <span className="text-[10px] text-blue-500 animate-pulse">{t('chatbot.knowledgeBase.processing')}</span>
                                )}
                                {doc.status === 'error' && (
                                  <span className="text-[10px] text-red-500" title={doc.error_message}>{t('chatbot.knowledgeBase.error')}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {doc.status === 'ready' && (
                                <button
                                  onClick={() => viewChunks(doc)}
                                  className="p-1.5 text-slate-400 hover:text-purple-600 transition-colors"
                                  title={t('chatbot.knowledgeBase.viewChunks')}
                                >
                                  <HiOutlineEye className="w-4 h-4" />
                                </button>
                              )}
                              {(doc.status === 'error' || doc.status === 'ready') && (
                                <button
                                  onClick={(e) => reprocessDocument(doc, e)}
                                  className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
                                  title={t('chatbot.knowledgeBase.reprocess')}
                                >
                                  <HiOutlineRefresh className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => deleteDocument(doc)}
                                disabled={deletingDoc === doc.id}
                                className="p-1.5 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40"
                              >
                                <HiOutlineTrash className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Chunks Tab */}
              {activeTab === 'chunks' && (
                <div className="p-5">
                  {chunks.length === 0 ? (
                    <div className="py-8 text-center text-sm text-slate-400">
                      {t('chatbot.knowledgeBase.noChunks')}
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {chunks.map((chunk, i) => (
                        <div key={chunk.id || i} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-semibold text-slate-500">
                              Chunk {i + 1} {chunk.document_title && `— ${chunk.document_title}`}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {chunk.chunk_text?.length || 0} {t('chatbot.knowledgeBase.chars')}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed">{chunk.chunk_text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl h-full flex items-center justify-center min-h-64">
              <div className="text-center">
                <HiOutlineSparkles className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-400">{t('chatbot.knowledgeBase.selectKbFirst')}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create KB Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">{t('chatbot.knowledgeBase.createNew')}</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={createKB} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.knowledgeBase.kbName')} *</label>
                <input
                  type="text" value={newKbForm.name}
                  onChange={e => setNewKbForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={t('chatbot.knowledgeBase.kbNamePlaceholder')}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400 transition-all"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.knowledgeBase.kbDescription')}</label>
                <textarea
                  value={newKbForm.description}
                  onChange={e => setNewKbForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder={t('chatbot.knowledgeBase.kbDescriptionPlaceholder')}
                  rows={2}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400 transition-all resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">
                  {t('common.cancel')}
                </button>
                <button type="submit" disabled={creating} className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white text-sm font-semibold rounded-xl hover:bg-purple-600 disabled:opacity-60 transition-all">
                  {creating ? <><HiOutlineRefresh className="w-4 h-4 animate-spin" />{t('chatbot.knowledgeBase.creating')}</> : <><HiOutlinePlus className="w-4 h-4" />{t('chatbot.knowledgeBase.createKb')}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">{t('chatbot.knowledgeBase.uploadFile')}</h3>
              <button onClick={() => setShowUploadModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={uploadFile} className="p-5 space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) { setUploadForm(prev => ({ ...prev, file: f, title: f.name.replace(/\.[^.]+$/, '') })); } }}
                className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-purple-400 transition-colors"
              >
                <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt,.csv,.xlsx,.xls" className="hidden" onChange={handleFileSelect} />
                {uploadForm.file ? (
                  <div>
                    <HiOutlineDocumentText className="w-8 h-8 text-purple-500 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-700">{uploadForm.file.name}</p>
                    <p className="text-xs text-slate-400 mt-1">{(uploadForm.file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div>
                    <HiOutlineUpload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">{t('chatbot.knowledgeBase.selectFile')} <span className="text-purple-500 font-medium">{t('common.select')}</span></p>
                    <p className="text-xs text-slate-400 mt-1">{t('chatbot.knowledgeBase.supportedFormats')}</p>
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.knowledgeBase.fileTitle')}</label>
                <input
                  type="text" value={uploadForm.title}
                  onChange={e => setUploadForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder={t('chatbot.knowledgeBase.fileTitlePlaceholder')}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400 transition-all"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowUploadModal(false)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">{t('common.cancel')}</button>
                <button type="submit" disabled={uploading || !uploadForm.file} className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white text-sm font-semibold rounded-xl hover:bg-purple-600 disabled:opacity-60 transition-all">
                  {uploading ? <><HiOutlineRefresh className="w-4 h-4 animate-spin" />{t('chatbot.knowledgeBase.processing')}</> : <><HiOutlineUpload className="w-4 h-4" />{t('chatbot.knowledgeBase.upload')}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Text/URL Modal */}
      {showTextModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">{t('chatbot.knowledgeBase.addContent')}</h3>
              <button onClick={() => setShowTextModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 pt-4">
              <div className="flex gap-2 mb-4">
                <button onClick={() => setActiveTab('add-text')} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeTab === 'add-text' ? 'bg-purple-100 text-purple-600' : 'text-slate-500 hover:bg-slate-100'}`}>
                  {t('chatbot.knowledgeBase.enterText')}
                </button>
                <button onClick={() => setActiveTab('add-url')} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeTab === 'add-url' ? 'bg-purple-100 text-purple-600' : 'text-slate-500 hover:bg-slate-100'}`}>
                  <HiOutlineLink className="w-3.5 h-3.5 inline mr-1" />
                  {t('chatbot.knowledgeBase.fromUrl')}
                </button>
              </div>
            </div>
            <div className="p-5">
              {activeTab === 'add-text' ? (
                <form onSubmit={addTextContent} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.knowledgeBase.fileTitle')}</label>
                    <input type="text" value={textForm.title} onChange={e => setTextForm(prev => ({ ...prev, title: e.target.value }))}
                      placeholder={t('chatbot.knowledgeBase.fileTitlePlaceholder')}
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400 transition-all" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.knowledgeBase.content')} *</label>
                    <textarea value={textForm.content} onChange={e => setTextForm(prev => ({ ...prev, content: e.target.value }))}
                      placeholder={t('chatbot.knowledgeBase.contentPlaceholder')}
                      rows={8}
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400 transition-all resize-none" />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={() => setShowTextModal(false)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">{t('common.cancel')}</button>
                    <button type="submit" disabled={addingText} className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white text-sm font-semibold rounded-xl hover:bg-purple-600 disabled:opacity-60 transition-all">
                      {addingText ? <><HiOutlineRefresh className="w-4 h-4 animate-spin" />{t('chatbot.knowledgeBase.processing')}</> : <><HiOutlineChip className="w-4 h-4" />{t('chatbot.knowledgeBase.addAndProcess')}</>}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={addUrlContent} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.knowledgeBase.fileTitle')}</label>
                    <input type="text" value={urlForm.title} onChange={e => setUrlForm(prev => ({ ...prev, title: e.target.value }))}
                      placeholder={t('chatbot.knowledgeBase.fileTitlePlaceholder')}
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400 transition-all" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.knowledgeBase.url')} *</label>
                    <input type="url" value={urlForm.url} onChange={e => setUrlForm(prev => ({ ...prev, url: e.target.value }))}
                      placeholder={t('chatbot.knowledgeBase.urlPlaceholder')}
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400 transition-all" />
                    <p className="text-[10px] text-slate-400 mt-1">{t('chatbot.knowledgeBase.urlDescription')}</p>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={() => setShowTextModal(false)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">{t('common.cancel')}</button>
                    <button type="submit" disabled={addingText} className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white text-sm font-semibold rounded-xl hover:bg-purple-600 disabled:opacity-60 transition-all">
                      {addingText ? <><HiOutlineRefresh className="w-4 h-4 animate-spin" />{t('chatbot.knowledgeBase.processing')}</> : <><HiOutlineLink className="w-4 h-4" />{t('chatbot.knowledgeBase.fetchFromUrl')}</>}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chunks Preview Modal */}
      {showChunksModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <h3 className="text-sm font-bold text-slate-800">{t('chatbot.knowledgeBase.chunks')} ({chunks.length})</h3>
              <button onClick={() => setShowChunksModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-5 space-y-3">
              {chunks.map((chunk, i) => (
                <div key={chunk.id || i} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-semibold text-slate-500">{t('chatbot.knowledgeBase.chunks')} {i + 1}</span>
                    <span className="text-[10px] text-slate-400">{chunk.chunk_text?.length || 0} {t('chatbot.knowledgeBase.chars')}</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{chunk.chunk_text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default KnowledgeBasePage;
