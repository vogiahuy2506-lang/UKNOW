import { FaEnvelope, FaCheck, FaEnvelopeOpen, FaTimes, FaChartLine } from 'react-icons/fa';

export default function NotificationStatsCard({ stats, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg p-4 border border-gray-200 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div className="h-8 bg-gray-200 rounded w-3/4"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const items = [
    {
      label: 'Tổng gửi',
      value: stats.sent_count || 0,
      icon: FaEnvelope,
      color: '#6b7280',
      bgColor: '#f3f4f6'
    },
    {
      label: 'Thành công',
      value: stats.delivered_count || 0,
      icon: FaCheck,
      color: '#22c55e',
      bgColor: '#f0fdf4'
    },
    {
      label: 'Đã mở',
      value: stats.opened_count || 0,
      icon: FaEnvelopeOpen,
      color: '#2563eb',
      bgColor: '#eff6ff'
    },
    {
      label: 'Thất bại',
      value: stats.failed_count || 0,
      icon: FaTimes,
      color: '#dc2626',
      bgColor: '#fef2f2'
    },
    {
      label: 'Tỷ lệ mở',
      value: `${stats.open_rate || 0}%`,
      icon: FaChartLine,
      color: '#f97316',
      bgColor: '#fff7ed'
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <div
            key={index}
            className="bg-white rounded-lg p-4 border border-gray-200"
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: item.bgColor }}
              >
                <Icon style={{ color: item.color }} size={16} />
              </div>
              <span className="text-sm text-gray-600">{item.label}</span>
            </div>
            <p
              className="text-2xl font-bold"
              style={{ color: item.color }}
            >
              {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function NotificationStatsBar({ sent, delivered, opened, failed }) {
  const total = sent || (delivered + opened + failed) || 1;

  return (
    <div className="space-y-2">
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
        {sent > 0 && (
          <div
            className="bg-gray-400 h-full transition-all"
            style={{ width: `${(sent / total) * 100}%` }}
            title={`Đã gửi: ${sent}`}
          />
        )}
        {delivered > 0 && (
          <div
            className="bg-green-500 h-full transition-all"
            style={{ width: `${(delivered / total) * 100}%` }}
            title={`Đã nhận: ${delivered}`}
          />
        )}
        {opened > 0 && (
          <div
            className="bg-blue-500 h-full transition-all"
            style={{ width: `${(opened / total) * 100}%` }}
            title={`Đã mở: ${opened}`}
          />
        )}
        {failed > 0 && (
          <div
            className="bg-red-500 h-full transition-all"
            style={{ width: `${(failed / total) * 100}%` }}
            title={`Thất bại: ${failed}`}
          />
        )}
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>Đã gửi: {sent}</span>
        <span>Đã nhận: {delivered}</span>
        <span>Đã mở: {opened}</span>
        <span>Thất bại: {failed}</span>
      </div>
    </div>
  );
}
