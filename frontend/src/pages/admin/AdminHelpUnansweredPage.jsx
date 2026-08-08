import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineQuestionMarkCircle } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import help from '../../services/help.service';

const formatDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN');
};

const formatSimilarity = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n * 100)}%`;
};

/**
 * Danh sách câu hỏi hướng dẫn AI chưa trả lời được (backlog viết bài mới).
 * Gộp theo câu hỏi giống nhau, sắp theo số lần hỏi giảm dần (từ backend).
 */
export default function AdminHelpUnansweredPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await help.adminListUnansweredHelp(100);
      setRows(res.data?.result || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminHelp.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('adminHelp.unansweredTitle')}</h1>
        <p className="mt-1 text-gray-500">{t('adminHelp.unansweredSubtitle')}</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-slate-400">{t('common.loading')}</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-14 text-slate-400">
            <HiOutlineQuestionMarkCircle className="h-10 w-10" />
            <p>{t('adminHelp.unansweredEmpty')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">{t('adminHelp.question')}</th>
                  <th className="px-5 py-3">{t('adminHelp.askCount')}</th>
                  <th className="px-5 py-3">{t('adminHelp.topSimilarity')}</th>
                  <th className="px-5 py-3">{t('adminHelp.lastAsked')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, idx) => (
                  <tr key={idx}>
                    <td className="px-5 py-4 max-w-md text-slate-800">{row.question}</td>
                    <td className="px-5 py-4 font-medium text-slate-700">{row.ask_count}</td>
                    <td className="px-5 py-4 text-slate-500">{formatSimilarity(row.avg_similarity)}</td>
                    <td className="px-5 py-4 text-slate-500">{formatDate(row.last_asked_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
