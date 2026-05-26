import { useState } from 'react';
/* eslint-disable react-refresh/only-export-components -- nodeConfigs registry exported alongside node UI */
import { BaseEdge, getBezierPath, Handle, Position, useReactFlow } from 'reactflow';
import { HiOutlineAdjustments, HiOutlineChat, HiOutlineDocumentText, HiOutlineGlobe, HiOutlineMail, HiOutlinePencil, HiOutlinePlay, HiOutlineShoppingCart, HiOutlineStop, HiOutlineTable, HiOutlineTag, HiOutlineUserAdd, HiOutlineX } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

const NODE_CARD_CONTAINER_CLASS =
  'relative w-[148px] sm:w-[160px] md:w-[172px] bg-white rounded-xl shadow-sm border-2 transition-all duration-200 group';
const NODE_TITLE_CLASS =
  'text-[12px] sm:text-sm font-semibold text-gray-800 leading-4 sm:leading-5 line-clamp-2 min-h-[2.15rem] sm:min-h-[2.35rem] break-words';
const NODE_DESCRIPTION_CLASS =
  'text-[10px] sm:text-[11px] text-gray-500 mt-0.1 leading-4 line-clamp-2 min-h-[1.1rem] sm:min-h-[1.85rem] break-words';

// Factory function to get translated node configs
export function getNodeConfigs(t) {
  return {
    triggers: [
      {
        type: 'manual_trigger',
        name: t('campaignNodes.manualTrigger'),
        icon: HiOutlinePlay,
        bgColor: '#E8EAF6',
        iconColor: '#5C6BC0',
        description: t('campaignNodes.startCampaignDesc'),
      },
    ],
    actions: [
      {
        type: 'send_email',
        name: t('campaignNodes.sendEmail'),
        icon: HiOutlineMail,
        bgColor: '#FFF3E0',
        iconColor: '#F57C00',
        description: t('campaignNodes.sendEmailDesc'),
      },
      {
        type: 'send_zalo_personal',
        name: t('campaignNodes.sendZaloPersonal'),
        icon: HiOutlineChat,
        bgColor: '#E3F2FD',
        iconColor: '#0068FF',
        description: t('campaignNodes.sendZaloPersonalDesc'),
      },
      {
        type: 'send_zalo_friend_request',
        name: t('campaignNodes.sendZaloFriendRequest'),
        icon: HiOutlineUserAdd,
        bgColor: '#E3F2FD',
        iconColor: '#0068FF',
        description: t('campaignNodes.sendZaloFriendRequestDesc'),
      },
      {
        type: 'send_zalo_group',
        name: t('campaignNodes.sendZaloGroup'),
        icon: HiOutlineChat,
        bgColor: '#E3F2FD',
        iconColor: '#0068FF',
        description: t('campaignNodes.sendZaloGroupDesc'),
      },
    ],
    logic: [
      {
        type: 'condition',
        name: t('campaignNodes.condition'),
        icon: HiOutlineAdjustments,
        bgColor: '#EDE7F6',
        iconColor: '#6A1B9A',
        description: t('campaignNodes.conditionDesc'),
      },
      {
        type: 'tag_contact',
        name: t('campaignNodes.tagContact'),
        icon: HiOutlineTag,
        bgColor: '#E8F5E9',
        iconColor: '#2E7D32',
        description: t('campaignNodes.tagContactDesc'),
      },
      {
        type: 'update_attribute',
        name: t('campaignNodes.updateAttribute'),
        icon: HiOutlinePencil,
        bgColor: '#FFF8E1',
        iconColor: '#F9A825',
        description: t('campaignNodes.updateAttributeDesc'),
      },
    ],
    data: [
      {
        type: 'read_sheet',
        name: t('campaignNodes.readSheet'),
        icon: HiOutlineTable,
        bgColor: '#E8F5E9',
        iconColor: '#2E7D32',
        description: t('campaignNodes.readSheetDesc'),
      },
      {
        type: 'read_courses_db',
        name: t('campaignNodes.readCourses'),
        icon: HiOutlineShoppingCart,
        bgColor: '#FFF3E0',
        iconColor: '#E65100',
        description: t('campaignNodes.readCoursesDesc'),
      },
      {
        type: 'read_interested_customers',
        name: t('campaignNodes.readCustomers'),
        icon: HiOutlineDocumentText,
        bgColor: '#FFF8E1',
        iconColor: '#F57F17',
        description: t('campaignNodes.readCustomersDesc'),
      },
      {
        type: 'read_landing_leads',
        name: t('campaignNodes.readLeads'),
        icon: HiOutlineGlobe,
        bgColor: '#E0F2F1',
        iconColor: '#0D6E6E',
        description: t('campaignNodes.readLeadsDesc'),
      },
      {
        type: 'select_zalo_account',
        name: t('campaignNodes.selectZaloAccount'),
        icon: HiOutlineChat,
        bgColor: '#E3F2FD',
        iconColor: '#0068FF',
        description: t('campaignNodes.selectZaloAccountDesc'),
      },
      {
        type: 'get_all_friends',
        name: t('campaignNodes.getZaloFriends'),
        icon: HiOutlineUserAdd,
        bgColor: '#E3F2FD',
        iconColor: '#0068FF',
        description: t('campaignNodes.getZaloFriendsDesc'),
      },
      {
        type: 'get_all_groups',
        name: t('campaignNodes.getZaloGroups'),
        icon: HiOutlineChat,
        bgColor: '#E3F2FD',
        iconColor: '#0068FF',
        description: t('campaignNodes.getZaloGroupsDesc'),
      },
      {
        type: 'save_customer',
        name: t('campaignNodes.saveCustomer'),
        icon: HiOutlineUserAdd,
        bgColor: '#E0F7FA',
        iconColor: '#00838F',
        description: t('campaignNodes.saveCustomerDesc'),
      },
    ],
  };
}

// Default node configs (bilingual - EN/VI)
export const nodeConfigs = {
  triggers: [
    {
      type: 'manual_trigger',
      name: 'Start Campaign',
      nameVi: 'Khởi chạy',
      icon: HiOutlinePlay,
      bgColor: '#E8EAF6',
      iconColor: '#5C6BC0',
      description: 'Start campaign',
      descriptionVi: 'Khởi chạy chiến dịch',
    },
  ],
  actions: [
    {
      type: 'send_email',
      name: 'Send Email',
      nameVi: 'Gửi Email',
      icon: HiOutlineMail,
      bgColor: '#FFF3E0',
      iconColor: '#F57C00',
      description: 'Send email via template',
      descriptionVi: 'Gửi email theo template',
    },
    {
      type: 'send_zalo_personal',
      name: 'Send Zalo Message',
      nameVi: 'Gửi tin nhắn Zalo cá nhân',
      icon: HiOutlineChat,
      bgColor: '#E3F2FD',
      iconColor: '#0068FF',
      description: 'Send message to phone list',
      descriptionVi: 'Gửi tin nhắn đến danh sách số điện thoại',
    },
    {
      type: 'send_zalo_friend_request',
      name: 'Send Zalo Friend Request',
      nameVi: 'Gửi lời mời kết bạn Zalo',
      icon: HiOutlineUserAdd,
      bgColor: '#E3F2FD',
      iconColor: '#0068FF',
      description: 'Send friend request by phone',
      descriptionVi: 'Gửi lời mời kết bạn theo số điện thoại',
    },
    {
      type: 'send_zalo_group',
      name: 'Send Zalo Group Message',
      nameVi: 'Gửi tin nhắn nhóm Zalo',
      icon: HiOutlineChat,
      bgColor: '#E3F2FD',
      iconColor: '#0068FF',
      description: 'Send message to Zalo groups',
      descriptionVi: 'Gửi tin nhắn đến danh sách nhóm Zalo',
    },
  ],
  logic: [
    {
      type: 'condition',
      name: 'Condition',
      nameVi: 'Điều kiện',
      icon: HiOutlineAdjustments,
      bgColor: '#EDE7F6',
      iconColor: '#6A1B9A',
      description: 'Branch by condition',
      descriptionVi: 'Rẽ nhánh theo điều kiện',
    },
    {
      type: 'tag_contact',
      name: 'Tag Contact',
      nameVi: 'Gắn tag',
      icon: HiOutlineTag,
      bgColor: '#E8F5E9',
      iconColor: '#2E7D32',
      description: 'Add/remove tag from contact',
      descriptionVi: 'Gắn / xóa tag cho contact',
    },
    {
      type: 'update_attribute',
      name: 'Update Attribute',
      nameVi: 'Cập nhật thuộc tính',
      icon: HiOutlinePencil,
      bgColor: '#FFF8E1',
      iconColor: '#F9A825',
      description: 'Update contact field',
      descriptionVi: 'Cập nhật field của contact',
    },
  ],
  data: [
    {
      type: 'read_sheet',
      name: 'Read Sheet Data',
      nameVi: 'Đọc dữ liệu Sheet',
      icon: HiOutlineTable,
      bgColor: '#E8F5E9',
      iconColor: '#2E7D32',
      description: 'Get data from Google Sheet/Excel',
      descriptionVi: 'Đọc dữ liệu từ Google Sheet/Excel',
    },
    {
      type: 'read_courses_db',
      name: 'Read Courses Data',
      nameVi: 'Đọc dữ liệu khóa học',
      icon: HiOutlineShoppingCart,
      bgColor: '#FFF3E0',
      iconColor: '#E65100',
      description: 'Get courses data from database',
      descriptionVi: 'Lấy dữ liệu khóa học từ database',
    },
    {
      type: 'read_interested_customers',
      name: 'Get Customer Data',
      nameVi: 'Lấy dữ liệu khách',
      icon: HiOutlineDocumentText,
      bgColor: '#FFF8E1',
      iconColor: '#F57F17',
      description: 'Get customer data from system',
      descriptionVi: 'Lấy dữ liệu khách hàng từ hệ thống',
    },
    {
      type: 'read_landing_leads',
      name: 'Landing Page Data',
      nameVi: 'Dữ liệu landing page',
      icon: HiOutlineGlobe,
      bgColor: '#E0F2F1',
      iconColor: '#0D6E6E',
      description: 'Leads from Founder AI landing form',
      descriptionVi: 'Lead từ form landing Founder AI (lọc ngày, nghề, lĩnh vực)',
    },
    {
      type: 'select_zalo_account',
      name: 'Select Zalo Account',
      nameVi: 'Chọn tài khoản Zalo',
      icon: HiOutlineChat,
      bgColor: '#E3F2FD',
      iconColor: '#0068FF',
      description: 'Select Zalo account to send messages',
      descriptionVi: 'Chọn tài khoản Zalo gửi tin',
    },
    {
      type: 'get_all_friends',
      name: 'Get Zalo Friends',
      nameVi: 'Lấy danh sách bạn bè Zalo',
      icon: HiOutlineUserAdd,
      bgColor: '#E3F2FD',
      iconColor: '#0068FF',
      description: 'Get friends list from selected account',
      descriptionVi: 'Lấy danh sách bạn bè từ tài khoản đã chọn',
    },
    {
      type: 'get_all_groups',
      name: 'Get Zalo Groups',
      nameVi: 'Lấy thông tin nhóm Zalo',
      icon: HiOutlineChat,
      bgColor: '#E3F2FD',
      iconColor: '#0068FF',
      description: 'Get group info from selected account',
      descriptionVi: 'Lấy thông tin nhóm từ tài khoản đã chọn',
    },
    {
      type: 'save_customer',
      name: 'Save Customer',
      nameVi: 'Lưu khách hàng',
      icon: HiOutlineUserAdd,
      bgColor: '#E0F7FA',
      iconColor: '#00838F',
      description: 'Save customer data to database',
      descriptionVi: 'Lưu dữ liệu khách hàng vào database',
    },
  ],
};

export const getAllNodeConfigs = () => [
  ...nodeConfigs.triggers,
  ...nodeConfigs.actions,
  ...nodeConfigs.logic,
  ...nodeConfigs.data,
];

// Custom edge type with hover and delete functionality
const CustomEdge = ({
  id,
  style,
  markerEnd,
  selected,
  label,
  labelX,
  labelY,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const { setEdges } = useReactFlow();

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const handleEdgeClick = (event) => {
    event.stopPropagation();
    setEdges((edges) => edges.filter((e) => e.id !== id));
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
  const { locale } = useI18n();
  const allConfigs = getAllNodeConfigs();
  const config = allConfigs.find((item) => item.type === data.nodeType) || {
    icon: HiOutlinePlay,
    bgColor: '#E8EAF6',
    iconColor: '#5C6BC0',
  };
  const Icon = config.icon;

  const displayName = data.label || config.name || (locale === 'vi' ? 'Bắt đầu' : 'Start');
  const displayDesc = locale === 'vi' ? 'Thả để kết nối' : 'Drop to connect';

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
          <div className={NODE_TITLE_CLASS}>{displayName}</div>
          <div className={NODE_DESCRIPTION_CLASS}>{displayDesc}</div>
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

const EndNode = ({ data, selected }) => {
  const { locale } = useI18n();
  const displayName = data.label || (locale === 'vi' ? 'Kết thúc' : 'End');
  const displayDesc = locale === 'vi' ? 'Điểm cuối quy trình' : 'End point';

  return (
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
          <div className={NODE_TITLE_CLASS}>{displayName}</div>
          <div className={NODE_DESCRIPTION_CLASS}>{displayDesc}</div>
        </div>
      </div>
    </div>
  );
};

const TaskNode = ({ data, selected }) => {
  const { locale } = useI18n();
  const allConfigs = getAllNodeConfigs();
  const config = allConfigs.find((item) => item.type === data.nodeType) || allConfigs[0];
  const Icon = config?.icon || HiOutlinePlay;

  const displayName = data.label || config?.name || (locale === 'vi' ? 'Node' : 'Node');
  const displayDesc = locale === 'vi'
    ? (config?.descriptionVi || config?.description || 'Task')
    : (config?.description || config?.descriptionVi || 'Task');

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
          <div className={NODE_TITLE_CLASS} title={displayName}>
            {displayName}
          </div>
          <div className={NODE_DESCRIPTION_CLASS}>{displayDesc}</div>
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
