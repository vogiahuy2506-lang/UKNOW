import { useState, useEffect, useCallback, useMemo } from 'react';
import { useI18n } from '../../i18n';
import {
  HiOutlineRefresh,
  HiOutlineSparkles,
  HiOutlineExclamationCircle,
  HiOutlineChatAlt2,
  HiOutlineSearch,
  HiOutlinePlay,
  HiOutlineExternalLink,
} from 'react-icons/hi';
import chatbotApi from '../chatbot/services/chatbotApi.service';
import toast from 'react-hot-toast';

function formatTime(isoStr, locale = 'vi') {
  if (!isoStr) return '--:--';
  const d = new Date(isoStr);
  return d.toLocaleTimeString(locale === 'en' ? 'en-US' : 'vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function getTodayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function AiActivityReport({
  onSelectConversation,
  selectedAccountId = null,
  className = '',
  canManage = true,
  canSummarize = true,
}) {
  const { t, locale } = useI18n();
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [reportData, setReportData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isResumingAll, setIsResumingAll] = useState(false);
  const [filterType, setFilterType] = useState('all'); // all | ai_replied | unread | paused | need_human
  const [searchQuery, setSearchQuery] = useState('');

  const fetchReport = useCallback(async (date = selectedDate) => {
    setIsLoading(true);
    try {
      const res = await chatbotApi.getAiActivityReport({
        date,
        accountId: selectedAccountId,
      });
      if (res?.data?.success) {
        setReportData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch AI activity report:', err);
      toast.error(t('inbox.aiReport.fetchError'));
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate, selectedAccountId, t]);

  useEffect(() => {
    fetchReport(selectedDate);
  }, [fetchReport, selectedDate, selectedAccountId]);

  const handleResumeAll = async () => {
    setIsResumingAll(true);
    try {
      const res = await chatbotApi.resumeAllAi();
      if (res?.data?.success) {
        toast.success(t('inbox.aiReport.resumeAllSuccess', { count: res.data.data?.resumedCount || 0 }));
        fetchReport();
      }
    } catch (err) {
      toast.error(t('inbox.aiReport.resumeAllError'));
    } finally {
      setIsResumingAll(false);
    }
  };

  const handleSummarize = async () => {
    setIsSummarizing(true);
    try {
      const res = await chatbotApi.summarizeAiActivity({ date: selectedDate });
      if (res?.data?.success) {
        toast.success(res.data.data?.cached ? t('inbox.aiReport.summarizeSuccessCached') : t('inbox.aiReport.summarizeSuccess'));
        fetchReport();
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || t('inbox.aiReport.summarizeError'));
    } finally {
      setIsSummarizing(false);
    }
  };

  const conversations = useMemo(() => reportData?.conversations || [], [reportData?.conversations]);
  const stats = reportData?.stats || {
    totalConversations: 0,
    totalKhachNhan: 0,
    totalAiTraLoi: 0,
    totalNguoiTraLoi: 0,
    totalChuaDoc: 0,
    totalAiPaused: 0,
    stalePausedCount: 0,
  };

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = c.visitorName?.toLowerCase().includes(q);
        const matchSummary = c.summary?.y_chinh?.toLowerCase().includes(q);
        if (!matchName && !matchSummary) return false;
      }

      if (filterType === 'ai_replied') return c.aiTraLoi > 0;
      if (filterType === 'unread') return c.chuaDoc > 0;
      if (filterType === 'paused') return c.aiPaused;
      if (filterType === 'need_human') return c.summary?.can_nguoi_that_khong === true;
      return true;
    });
  }, [conversations, filterType, searchQuery]);

  return (
    <div className={`h-full min-h-0 flex flex-col bg-gray-50 overflow-hidden ${className}`}>
      {/* Top Header */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-sm">
                <HiOutlineSparkles className="w-5 h-5" />
              </div>
              <h1 className="text-base sm:text-lg font-bold text-gray-900">
                {t('inbox.aiReport.title')}
              </h1>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {t('inbox.aiReport.subtitle')}
            </p>
          </div>

          {/* Action buttons & Date Picker */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-gray-100 p-0.5 rounded-lg border border-gray-200 text-xs">
              <button
                type="button"
                onClick={() => setSelectedDate(getTodayString())}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  selectedDate === getTodayString()
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t('inbox.aiReport.today')}
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent px-2 py-0.5 text-xs text-gray-700 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => fetchReport()}
              disabled={isLoading}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all border border-gray-200 bg-white"
              title={t('inbox.aiReport.refreshTitle')}
            >
              <HiOutlineRefresh className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            {canSummarize && <button
              type="button"
              onClick={handleSummarize}
              disabled={isSummarizing || conversations.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-sm transition-all disabled:opacity-50"
            >
              <HiOutlineSparkles className={`w-4 h-4 ${isSummarizing ? 'animate-spin' : ''}`} />
              <span>{isSummarizing ? t('inbox.aiReport.summarizing') : t('inbox.aiReport.summarizeAi')}</span>
            </button>}
          </div>
        </div>

        {/* Stale Paused Warning Banner */}
        {canManage && stats.stalePausedCount > 0 && (
          <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-amber-800">
              <HiOutlineExclamationCircle className="w-5 h-5 text-amber-500 shrink-0" />
              <span>
                {t('inbox.aiReport.staleWarning', { count: stats.stalePausedCount })}
              </span>
            </div>
            <button
              type="button"
              onClick={handleResumeAll}
              disabled={isResumingAll}
              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-all shadow-sm disabled:opacity-50"
            >
              <HiOutlinePlay className="w-3.5 h-3.5" />
              <span>{isResumingAll ? t('inbox.aiReport.resumingBtn') : t('inbox.aiReport.resumeAllBtn')}</span>
            </button>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="shrink-0 px-4 py-3 sm:px-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        <div className="bg-white p-3 rounded-xl border border-gray-200/80 shadow-sm">
          <p className="text-[11px] font-medium text-gray-500">{t('inbox.aiReport.kpiConversations')}</p>
          <p className="text-lg font-bold text-gray-900 mt-0.5">{stats.totalConversations}</p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-gray-200/80 shadow-sm">
          <p className="text-[11px] font-medium text-gray-500">{t('inbox.aiReport.kpiIncoming')}</p>
          <p className="text-lg font-bold text-blue-600 mt-0.5">{stats.totalKhachNhan} <span className="text-xs font-normal text-gray-400">{t('inbox.aiReport.messagesUnit')}</span></p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-gray-200/80 shadow-sm">
          <p className="text-[11px] font-medium text-gray-500">{t('inbox.aiReport.kpiAiReplied')}</p>
          <p className="text-lg font-bold text-indigo-600 mt-0.5">{stats.totalAiTraLoi} <span className="text-xs font-normal text-gray-400">{t('inbox.aiReport.messagesUnit')}</span></p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-gray-200/80 shadow-sm">
          <p className="text-[11px] font-medium text-gray-500">{t('inbox.aiReport.kpiHumanReplied')}</p>
          <p className="text-lg font-bold text-emerald-600 mt-0.5">{stats.totalNguoiTraLoi} <span className="text-xs font-normal text-gray-400">{t('inbox.aiReport.messagesUnit')}</span></p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-gray-200/80 shadow-sm">
          <p className="text-[11px] font-medium text-gray-500">{t('inbox.aiReport.kpiUnread')}</p>
          <p className={`text-lg font-bold mt-0.5 ${stats.totalChuaDoc > 0 ? 'text-rose-600' : 'text-gray-800'}`}>
            {stats.totalChuaDoc} <span className="text-xs font-normal text-gray-400">{t('inbox.aiReport.messagesUnit')}</span>
          </p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-gray-200/80 shadow-sm">
          <p className="text-[11px] font-medium text-gray-500">{t('inbox.aiReport.kpiAiPaused')}</p>
          <p className={`text-lg font-bold mt-0.5 ${stats.totalAiPaused > 0 ? 'text-amber-600' : 'text-gray-800'}`}>
            {stats.totalAiPaused} <span className="text-xs font-normal text-gray-400">{t('inbox.aiReport.peopleUnit')}</span>
          </p>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="shrink-0 px-4 sm:px-6 pb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              filterType === 'all'
                ? 'bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t('inbox.aiReport.filterAll', { count: conversations.length })}
          </button>
          <button
            type="button"
            onClick={() => setFilterType('ai_replied')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              filterType === 'ai_replied'
                ? 'bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t('inbox.aiReport.filterAiReplied', { count: conversations.filter(c => c.aiTraLoi > 0).length })}
          </button>
          <button
            type="button"
            onClick={() => setFilterType('unread')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              filterType === 'unread'
                ? 'bg-rose-50 text-rose-700 font-semibold border border-rose-200'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t('inbox.aiReport.filterUnread', { count: conversations.filter(c => c.chuaDoc > 0).length })}
          </button>
          <button
            type="button"
            onClick={() => setFilterType('paused')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              filterType === 'paused'
                ? 'bg-amber-50 text-amber-700 font-semibold border border-amber-200'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t('inbox.aiReport.filterPaused', { count: conversations.filter(c => c.aiPaused).length })}
          </button>
          {reportData?.hasSummaryCache && (
            <button
              type="button"
              onClick={() => setFilterType('need_human')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterType === 'need_human'
                  ? 'bg-purple-50 text-purple-700 font-semibold border border-purple-200'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {t('inbox.aiReport.filterNeedHuman', { count: conversations.filter(c => c.summary?.can_nguoi_that_khong).length })}
            </button>
          )}
        </div>

        <div className="relative w-full sm:w-64">
          <HiOutlineSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('inbox.aiReport.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Main Table / List */}
      <div className="flex-1 min-h-0 px-4 sm:px-6 pb-4 overflow-y-auto">
        {isLoading ? (
          <div className="h-64 flex flex-col items-center justify-center text-gray-400 gap-2">
            <HiOutlineRefresh className="w-8 h-8 animate-spin text-indigo-500" />
            <p className="text-xs">{t('inbox.aiReport.loadingReport')}</p>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="h-64 bg-white rounded-2xl border border-gray-200 flex flex-col items-center justify-center text-center p-6">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mb-2">
              <HiOutlineChatAlt2 className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-gray-700">{t('inbox.aiReport.emptyTitle')}</p>
            <p className="text-xs text-gray-500 mt-1">{t('inbox.aiReport.emptySubtitle')}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-100">
              {filteredConversations.map((conv) => {
                const hasSummary = Boolean(conv.summary);
                const needHuman = conv.summary?.can_nguoi_that_khong === true;

                return (
                  <div
                    key={conv.id}
                    className="p-4 hover:bg-gray-50/80 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                  >
                    {/* Left Column: Info & Message stats */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-gray-900 truncate">
                          {conv.visitorName}
                        </span>
                        {conv.aiPaused && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                            {t('inbox.aiReport.badgeAiPaused')}
                          </span>
                        )}
                        {conv.chuaDoc > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-200 animate-pulse">
                            {t('inbox.aiReport.badgeUnread', { count: conv.chuaDoc })}
                          </span>
                        )}
                      </div>

                      {/* Summary details if available */}
                      {hasSummary ? (
                        <div className="mt-2 space-y-1 bg-indigo-50/40 p-2.5 rounded-xl border border-indigo-100">
                          <p className="text-xs text-gray-800">
                            <span className="font-semibold text-indigo-900">{t('inbox.aiReport.labelMainPoint')}</span> {conv.summary.y_chinh}
                          </p>
                          {conv.summary.khach_muon_gi && (
                            <p className="text-xs text-gray-600">
                              <span className="font-semibold text-gray-700">{t('inbox.aiReport.labelCustomerNeed')}</span> {conv.summary.khach_muon_gi}
                            </p>
                          )}
                          {needHuman && (
                            <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 text-rose-800">
                              <span>{t('inbox.aiReport.labelNeedHuman', { reason: conv.summary.ly_do_can_nguoi || t('inbox.aiReport.defaultNeedHumanReason') })}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 mt-1">
                          {t('inbox.aiReport.firstMsg', { time: formatTime(conv.tinDau, locale) })} · {t('inbox.aiReport.lastMsg', { time: formatTime(conv.tinCuoi, locale) })}
                        </p>
                      )}

                      {/* Stat badges */}
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          {t('inbox.aiReport.statCustomer', { count: conv.khachNhan })}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-indigo-500" />
                          {t('inbox.aiReport.statAi', { count: conv.aiTraLoi })}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          {t('inbox.aiReport.statHuman', { count: conv.nguoiTraLoi })}
                        </span>
                        <span>{t('inbox.aiReport.lastTime', { time: formatTime(conv.tinCuoi, locale) })}</span>
                      </div>
                    </div>

                    {/* Right Column: Open Chat Action */}
                    <div className="shrink-0 flex items-center gap-2 self-end lg:self-center">
                      <button
                        type="button"
                        onClick={() => onSelectConversation?.(conv.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-all shadow-sm"
                      >
                        <HiOutlineExternalLink className="w-4 h-4" />
                        <span>{t('inbox.aiReport.openConversation')}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
