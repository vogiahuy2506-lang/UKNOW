import { useState } from 'react';
import { BaseEdge, getBezierPath, Handle, Position, useReactFlow } from 'reactflow';
import { HiOutlineChat, HiOutlineDocumentText, HiOutlineGlobe, HiOutlineMail, HiOutlinePlay, HiOutlineShoppingCart, HiOutlineStop, HiOutlineTable, HiOutlineUserAdd, HiOutlineX } from 'react-icons/hi';

const NODE_CARD_CONTAINER_CLASS =
  'relative w-[148px] sm:w-[160px] md:w-[172px] bg-white rounded-xl shadow-sm border-2 transition-all duration-200 group';
const NODE_TITLE_CLASS =
  'text-[12px] sm:text-sm font-semibold text-gray-800 leading-4 sm:leading-5 line-clamp-2 min-h-[2.15rem] sm:min-h-[2.35rem] break-words';
const NODE_DESCRIPTION_CLASS =
  'text-[10px] sm:text-[11px] text-gray-500 mt-0.1 leading-4 line-clamp-2 min-h-[1.1rem] sm:min-h-[1.85rem] break-words';

export const nodeConfigs = {
  triggers: [
    {
      type: 'manual_trigger',
      name: 'Khởi chạy',
      icon: HiOutlinePlay,
      bgColor: '#E8EAF6',
      iconColor: '#5C6BC0',
      description: 'Khởi chạy chiến dịch',
    },
  ],
  actions: [
    {
      type: 'send_email',
      name: 'Gửi Email',
      icon: HiOutlineMail,
      bgColor: '#FFF3E0',
      iconColor: '#F57C00',
      description: 'Gửi email theo template',
    },
    {
      type: 'send_zalo_personal',
      name: 'Gửi tin nhắn Zalo cá nhân',
      icon: HiOutlineChat,
      bgColor: '#E3F2FD',
      iconColor: '#0068FF',
      description: 'Gửi tin nhắn đến danh sách số điện thoại',
    },
    {
      type: 'send_zalo_friend_request',
      name: 'Gửi lời mời kết bạn Zalo',
      icon: HiOutlineUserAdd,
      bgColor: '#E3F2FD',
      iconColor: '#0068FF',
      description: 'Gửi lời mời kết bạn theo số điện thoại',
    },
    {
      type: 'send_zalo_group',
      name: 'Gửi tin nhắn nhóm Zalo',
      icon: HiOutlineChat,
      bgColor: '#E3F2FD',
      iconColor: '#0068FF',
      description: 'Gửi tin nhắn đến danh sách nhóm Zalo',
    },
  ],
  logic: [],
  data: [
    {
      type: 'read_sheet',
      name: 'Đọc dữ liệu Sheet',
      icon: HiOutlineTable,
      bgColor: '#E8F5E9',
      iconColor: '#2E7D32',
      description: 'Đọc dữ liệu từ Google Sheet/Excel',
    },
    {
      type: 'read_courses_db',
      name: 'Đọc dữ liệu khóa học',
      icon: HiOutlineShoppingCart,
      bgColor: '#FFF3E0',
      iconColor: '#E65100',
      description: 'Lấy dữ liệu khóa học từ database',
    },
    {
      type: 'read_interested_customers',
      name: 'Lấy dữ liệu khách',
      icon: HiOutlineDocumentText,
      bgColor: '#FFF8E1',
      iconColor: '#F57F17',
      description: 'Lấy dữ liệu khách hàng từ hệ thống',
    },
    {
      type: 'read_landing_leads',
      name: 'Dữ liệu landing page',
      icon: HiOutlineGlobe,
      bgColor: '#E0F2F1',
      iconColor: '#0D6E6E',
      description: 'Lead từ form landing UKnow (lọc ngày, nghề, lĩnh vực)',
    },
    {
      type: 'select_zalo_account',
      name: 'Chọn tài khoản Zalo',
      icon: HiOutlineChat,
      bgColor: '#E3F2FD',
      iconColor: '#0068FF',
      description: 'Chọn tài khoản Zalo gửi tin',
    },
    {
      type: 'get_all_friends',
      name: 'Lấy danh sách bạn bè Zalo',
      icon: HiOutlineUserAdd,
      bgColor: '#E3F2FD',
      iconColor: '#0068FF',
      description: 'Lấy danh sách bạn bè từ tài khoản đã chọn',
    },
    {
      type: 'get_all_groups',
      name: 'Lấy thông tin nhóm Zalo',
      icon: HiOutlineChat,
      bgColor: '#E3F2FD',
      iconColor: '#0068FF',
      description: 'Lấy thông tin nhóm từ tài khoản đã chọn',
    },
    {
      type: 'save_customer',
      name: 'Lưu khách hàng',
      icon: HiOutlineUserAdd,
      bgColor: '#E0F7FA',
      iconColor: '#00838F',
      description: 'Lưu dữ liệu khách hàng vào database',
    },
  ],
};

export const getAllNodeConfigs = () => [
  ...nodeConfigs.triggers,
  ...nodeConfigs.actions,
  ...nodeConfigs.logic,
  ...nodeConfigs.data,
];

const CustomEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  label,
  selected,
}) => {
  const { setEdges } = useReactFlow();
  const [isHovered, setIsHovered] = useState(false);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const handleEdgeClick = (event) => {
    event.stopPropagation();
    setEdges((edges) => edges.filter((edge) => edge.id !== id));
  };

  return (
    <g onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: 'pointer' }}
        onClick={handleEdgeClick}
      />
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: isHovered || selected ? 3 : 2,
          stroke: isHovered || selected ? '#FB8C00' : '#FFB74D',
          cursor: 'pointer',
        }}
      />
      {isHovered && (
        <foreignObject width={24} height={24} x={labelX - 12} y={labelY - 12} style={{ overflow: 'visible' }}>
          <div
            className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-red-600 shadow-md"
            onClick={handleEdgeClick}
          >
            <HiOutlineX className="w-4 h-4 text-white" />
          </div>
        </foreignObject>
      )}
      {label && !isHovered && (
        <foreignObject width={150} height={30} x={labelX - 75} y={labelY - 15} className="overflow-visible">
          <div className="flex items-center justify-center">
            <span className="bg-white px-2 py-0.5 text-xs text-gray-500 whitespace-nowrap">{label}</span>
          </div>
        </foreignObject>
      )}
    </g>
  );
};

const StartNode = ({ data, selected }) => {
  const allConfigs = getAllNodeConfigs();
  const config = allConfigs.find((item) => item.type === data.nodeType) || {
    icon: HiOutlinePlay,
    bgColor: '#E8EAF6',
    iconColor: '#5C6BC0',
  };
  const Icon = config.icon;

  return (
    <div
      className={`${NODE_CARD_CONTAINER_CLASS}
      ${selected ? 'border-primary-500 shadow-md ring-2 ring-primary-100' : 'border-transparent hover:border-gray-200 hover:shadow-md'}
    `}
    >
      <div className="p-2.5 sm:p-3 flex flex-col items-center justify-center gap-2 sm:gap-2.5">
        <div
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-colors"
          style={{ backgroundColor: config.bgColor }}
        >
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: config.iconColor }} />
        </div>
        <div className="text-center w-full">
          <div className={NODE_TITLE_CLASS}>{data.label || 'Bắt đầu'}</div>
          <div className={NODE_DESCRIPTION_CLASS}>Thả để kết nối</div>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-orange-400 !border-2 !border-white !-right-1.5 transition-transform group-hover:scale-125"
      />
    </div>
  );
};

const EndNode = ({ data, selected }) => (
  <div
    className={`${NODE_CARD_CONTAINER_CLASS}
    ${selected ? 'border-red-500 shadow-md' : 'border-transparent hover:border-gray-200 hover:shadow-md'}
  `}
  >
    <Handle
      type="target"
      position={Position.Left}
      className="!w-2.5 !h-2.5 !bg-orange-400 !border-2 !border-white !-left-1.5 transition-transform group-hover:scale-125"
    />
    <div className="p-2.5 sm:p-3 flex flex-col items-center justify-center gap-2 sm:gap-2.5">
      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-red-50 flex items-center justify-center">
        <HiOutlineStop className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />
      </div>
      <div className="text-center w-full">
        <div className={NODE_TITLE_CLASS}>{data.label || 'Kết thúc'}</div>
        <div className={NODE_DESCRIPTION_CLASS}>Điểm cuối quy trình</div>
      </div>
    </div>
  </div>
);

const TaskNode = ({ data, selected }) => {
  const allConfigs = getAllNodeConfigs();
  const config = allConfigs.find((item) => item.type === data.nodeType) || allConfigs[0];
  const Icon = config?.icon || HiOutlinePlay;

  return (
    <div
      className={`${NODE_CARD_CONTAINER_CLASS}
      ${selected ? 'border-primary-500 shadow-md ring-2 ring-primary-100' : 'border-transparent hover:border-gray-200 hover:shadow-md'}
    `}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-orange-400 !border-2 !border-white !-left-1.5 transition-transform group-hover:scale-125"
      />
      <div className="p-2.5 sm:p-3 flex flex-col items-center justify-center gap-2 sm:gap-2.5">
        <div
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-colors"
          style={{ backgroundColor: config?.bgColor || '#E8EAF6' }}
        >
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: config?.iconColor || '#5C6BC0' }} />
        </div>
        <div className="text-center w-full">
          <div className={NODE_TITLE_CLASS} title={data.label || config?.name}>
            {data.label || config?.name || 'Node'}
          </div>
          <div className={NODE_DESCRIPTION_CLASS}>{config?.description || 'Task'}</div>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-orange-400 !border-2 !border-white !-right-1.5 transition-transform group-hover:scale-125"
      />
    </div>
  );
};

export const nodeTypes = {
  start: StartNode,
  end: EndNode,
  task: TaskNode,
};

export const edgeTypes = {
  custom: CustomEdge,
};
