import { useState } from 'react';
import { HiX, HiUser, HiPhone, HiMail, HiLocationMarker, HiClock, HiTag, HiDocumentText, HiInformationCircle } from 'react-icons/hi';
import { useI18n } from '../../i18n';

const ConversationDetails = ({ conversation, onClose, onAddTag, onAddNote }) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('info');
  const [newTag, setNewTag] = useState('');
  const [newNote, setNewNote] = useState('');

  if (!conversation) return null;

  // Parse visitor info
  const visitorInfo = typeof conversation.visitor_info === 'string' 
    ? JSON.parse(conversation.visitor_info || '{}') 
    : (conversation.visitor_info || {});

  // Parse metadata
  const metadata = conversation.metadata || {};

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get channel icon and label
  const getChannelInfo = () => {
    const channels = {
      web: { icon: '💬', label: 'Web Chat' },
      zalo_oa: { icon: '📱', label: 'Zalo OA' },
      facebook: { icon: '📘', label: 'Facebook' },
      zalo_personal: { icon: '👤', label: 'Zalo Cá nhân' },
      zalo_group: { icon: '👥', label: 'Zalo Nhóm' },
    };
    return channels[conversation.channel] || { icon: '💬', label: conversation.channel };
  };

  const channel = getChannelInfo();

  // Handle add tag
  const handleAddTag = () => {
    if (newTag.trim()) {
      onAddTag?.(newTag.trim());
      setNewTag('');
    }
  };

  // Handle add note
  const handleAddNote = () => {
    if (newNote.trim()) {
      onAddNote?.(newNote.trim());
      setNewNote('');
    }
  };

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">{t('inbox.conversationDetails')}</h3>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
        >
          <HiX className="w-5 h-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('info')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'info'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <HiInformationCircle className="w-4 h-4 inline mr-1" />
          {t('inbox.info')}
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'notes'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <HiDocumentText className="w-4 h-4 inline mr-1" />
          {t('inbox.notes')}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'info' && (
          <div className="space-y-4">
            {/* Visitor Info */}
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-primary-500 flex items-center justify-center text-white text-lg font-medium">
                  {conversation.visitor_name?.[0]?.toUpperCase() || '?'}
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">
                    {conversation.visitor_name || t('inbox.anonymousCustomer')}
                  </h4>
                  <p className="text-sm text-gray-500">
                    {channel.icon} {channel.label}
                  </p>
                </div>
              </div>

              {/* Contact details */}
              <div className="space-y-2">
                {visitorInfo.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <HiPhone className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600">{visitorInfo.phone}</span>
                  </div>
                )}
                {visitorInfo.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <HiMail className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600">{visitorInfo.email}</span>
                  </div>
                )}
                {visitorInfo.location && (
                  <div className="flex items-center gap-2 text-sm">
                    <HiLocationMarker className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600">{visitorInfo.location}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Timeline */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <HiClock className="w-4 h-4" />
                {t('inbox.timeline')}
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('inbox.startedAt')}</span>
                  <span className="text-gray-700">{formatDate(conversation.started_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('inbox.lastMessage')}</span>
                  <span className="text-gray-700">{formatDate(conversation.last_message_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('inbox.status')}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    conversation.status === 'active' 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {conversation.status === 'active' ? t('inbox.active') : t('inbox.closed')}
                  </span>
                </div>
                {conversation.unreadCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('inbox.unread')}</span>
                    <span className="text-red-600 font-medium">{conversation.unreadCount}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Tags */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <HiTag className="w-4 h-4" />
                {t('inbox.tags')}
              </h4>
              <div className="flex flex-wrap gap-1 mb-2">
                {(conversation.tags || []).map((tag, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-1 bg-primary-100 text-primary-700 text-xs rounded-full flex items-center gap-1"
                  >
                    {tag}
                    <button className="hover:text-primary-900">
                      <HiX className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {(!conversation.tags || conversation.tags.length === 0) && (
                  <span className="text-sm text-gray-400">{t('inbox.noTags')}</span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                  placeholder={t('inbox.addTag')}
                  className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button
                  onClick={handleAddTag}
                  className="px-3 py-1.5 bg-primary-500 text-white text-sm rounded-lg hover:bg-primary-600 transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            {/* Group info */}
            {visitorInfo.is_group && (
              <div className="bg-purple-50 rounded-lg p-3">
                <h4 className="text-sm font-medium text-purple-700 mb-2">
                  👥 {t('inbox.groupInfo')}
                </h4>
                <div className="space-y-2 text-sm">
                  {visitorInfo.group_name && (
                    <div className="flex justify-between">
                      <span className="text-purple-600">{t('inbox.groupName')}</span>
                      <span className="text-purple-800 font-medium">{visitorInfo.group_name}</span>
                    </div>
                  )}
                  {visitorInfo.sender_name && (
                    <div className="flex justify-between">
                      <span className="text-purple-600">{t('inbox.sender')}</span>
                      <span className="text-purple-800 font-medium">{visitorInfo.sender_name}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="space-y-4">
            {/* Notes list */}
            <div className="space-y-2">
              {(conversation.notes || []).map((note, idx) => (
                <div key={idx} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs text-gray-500">{note.author || t('inbox.agent')}</span>
                    <span className="text-xs text-gray-400">{formatDate(note.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-700">{note.content}</p>
                </div>
              ))}
              {(!conversation.notes || conversation.notes.length === 0) && (
                <p className="text-sm text-gray-400 text-center py-4">
                  {t('inbox.noNotes')}
                </p>
              )}
            </div>

            {/* Add note */}
            <div className="border-t border-gray-200 pt-4">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder={t('inbox.addNote')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
              <button
                onClick={handleAddNote}
                disabled={!newNote.trim()}
                className="mt-2 w-full px-4 py-2 bg-primary-500 text-white text-sm rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('inbox.saveNote')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversationDetails;
