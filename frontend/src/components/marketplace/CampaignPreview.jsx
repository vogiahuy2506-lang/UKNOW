import {
  HiOutlineMail,
  HiOutlineDeviceMobile,
  HiOutlinePlay,
  HiOutlineClock,
  HiOutlineUsers,
  HiOutlineChartBar,
} from 'react-icons/hi';

const NodeIcon = ({ type }) => {
  const config = {
    trigger: { bg: 'bg-blue-100', text: 'text-blue-600', Icon: HiOutlinePlay },
    email: { bg: 'bg-purple-100', text: 'text-purple-600', Icon: HiOutlineMail },
    sms: { bg: 'bg-green-100', text: 'text-green-600', Icon: HiOutlineDeviceMobile },
    delay: { bg: 'bg-amber-100', text: 'text-amber-600', Icon: HiOutlineClock },
    condition: { bg: 'bg-orange-100', text: 'text-orange-600', Icon: HiOutlineUsers },
    action: { bg: 'bg-pink-100', text: 'text-pink-600', Icon: HiOutlineChartBar },
  };
  
  const { bg, text, Icon } = config[type] || config.action;
  
  return (
    <div className={`w-8 h-8 rounded-lg ${bg} ${text} flex items-center justify-center`}>
      <Icon className="w-4 h-4" />
    </div>
  );
};

const NodeCard = ({ node }) => (
  <div className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
    <NodeIcon type={node.nodeType} />
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-gray-900 truncate">
        {node.nodeName || node.nodeType || 'Unknown Node'}
      </p>
      <p className="text-xs text-gray-500 truncate">
        {node.nodeSubtype || node.nodeType}
      </p>
    </div>
  </div>
);

const CampaignPreview = ({ snapshot }) => {
  if (!snapshot) {
    return (
      <div className="text-center py-8 text-gray-500">
        Không có dữ liệu preview
      </div>
    );
  }

  const { nodes = [], connections = [], campaignType } = snapshot;

  return (
    <section className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
          <HiOutlineMail className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-base font-bold text-gray-900">Preview Campaign</h2>
          <p className="text-xs text-gray-500">
            {nodes.length} nodes, {connections.length} kết nối
          </p>
        </div>
      </div>

      {/* Campaign Info */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Tên campaign</p>
          <p className="text-sm font-medium text-gray-900 truncate">
            {snapshot.campaignName || 'Untitled'}
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Loại campaign</p>
          <p className="text-sm font-medium text-gray-900 capitalize">
            {campaignType || 'email'}
          </p>
        </div>
      </div>

      {/* Flow Preview */}
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Flow Nodes</h3>
        {nodes.length > 0 ? (
          <div className="space-y-2">
            {nodes.slice(0, 6).map((node, index) => (
              <div key={node.id || index} className="flex items-center gap-2">
                <NodeCard node={node} />
                {index < nodes.length - 1 && index < 5 && (
                  <div className="absolute left-8 w-0.5 h-6 bg-gray-200" />
                )}
              </div>
            ))}
            {nodes.length > 6 && (
              <p className="text-xs text-gray-500 text-center py-2">
                +{nodes.length - 6} nodes khác
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">
            Không có nodes trong flow
          </p>
        )}
      </div>

      {/* Connections */}
      {connections.length > 0 && (
        <div className="pt-4 border-t border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Kết nối</h3>
          <div className="flex flex-wrap gap-2">
            {connections.slice(0, 4).map((conn, index) => (
              <span
                key={conn.id || index}
                className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded"
              >
                {conn.connectionLabel || `Node ${index + 1} → Node ${index + 2}`}
              </span>
            ))}
            {connections.length > 4 && (
              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                +{connections.length - 4} kết nối khác
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default CampaignPreview;
