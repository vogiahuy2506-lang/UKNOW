/**
 * Script tạo chiến dịch mẫu với đầy đủ các node
 * Sử dụng: node create_sample_campaign.js
 */

import pg from 'pg';
const { Pool } = pg;

// Kết nối database trực tiếp với credentials từ .env
const pool = new Pool({
  host: 'ep-purple-recipe-aozj2siy-pooler.c-2.ap-southeast-1.aws.neon.tech',
  port: 5432,
  database: 'neondb',
  user: 'neondb_owner',
  password: 'npg_NIwRYl4VLj8W',
  ssl: { rejectUnauthorized: false }
});

const db = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
};

// Cấu hình chiến dịch
const CAMPAIGN_CONFIG = {
  name: 'Chiến dịch Marketing Đa Kênh',
  description: 'Chiến dịch marketing tự động với đọc dữ liệu sheet, lưu khách, gửi email và gửi Zalo',
  type: 'email', // email | zalo_oa | zalo_group
  startDate: new Date().toISOString(),
  endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
};

// Nodes - định nghĩa các node trong flow
const NODES = [
  // Node 1: Khởi chạy (Launch) - Trigger
  {
    id: 'node_launch_1',
    node_type: 'trigger',
    node_subtype: 'launch',
    position: { x: 250, y: 50 },
    config: {
      name: 'Khởi chạy',
      description: 'Điểm bắt đầu chiến dịch',
      runMode: 'immediate', // immediate | scheduled | continuous
      // immediate: chạy ngay
      // scheduled: chạy theo lịch
      // continuous: chạy liên tục (theo dõi khách mới)
      scheduleCron: null,
      timezone: 'Asia/Ho_Chi_Minh',
    },
  },

  // Node 2: Đọc dữ liệu từ Google Sheet
  {
    id: 'node_read_sheet_1',
    node_type: 'data',
    node_subtype: 'read_sheet',
    position: { x: 250, y: 180 },
    config: {
      name: 'Đọc dữ liệu Sheet',
      description: 'Lấy danh sách khách hàng từ Google Sheet',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit',
      sheetName: 'Sheet1',
      hasHeaderRow: true,
      // Lọc cột cần lấy
      dataSelectedColumns: ['email', 'full_name', 'phone', 'course_interest'],
      // Xử lý trùng lặp
      deduplicateBy: 'email',
      // Giới hạn số dòng (null = không giới hạn)
      rowLimit: null,
    },
  },

  // Node 3: Đọc dữ liệu khóa học
  {
    id: 'node_read_courses_1',
    node_type: 'data',
    node_subtype: 'read_courses_db',
    position: { x: 50, y: 310 },
    config: {
      name: 'Đọc dữ liệu khóa học',
      description: 'Lấy thông tin các khóa học từ database',
      // Lọc theo khóa học cụ thể (điền ID khóa học)
      coursesDbSelectedIds: [], // [1, 2, 3]
      // Tìm kiếm theo tên
      coursesDbSearchTerm: '',
      // Lọc theo trạng thái: published, draft, archived
      coursesDbStatuses: ['published'],
      // Giới hạn số khóa học
      coursesDbLimit: 100,
      // Lấy thêm thông tin khách đã đăng ký
      includeInterestedCustomers: true,
      // Giới hạn khách quan tâm
      interestedLimit: 1000,
    },
  },

  // Node 4: Lấy dữ liệu khách quan tâm
  {
    id: 'node_interested_customers_1',
    node_type: 'data',
    node_subtype: 'interested_customers',
    position: { x: 450, y: 310 },
    config: {
      name: 'Lấy khách quan tâm',
      description: 'Lấy danh sách khách đã đăng ký khóa học',
      // Loại khách: interested | purchased | completed
      interestedCustomerType: 'interested',
      // Nguồn dữ liệu: database | api
      interestedDataSource: 'database',
      // Lọc theo khóa học cụ thể
      interestedCourseIds: [],
      // Trạng thái khóa học của khách
      interestedCourseStatuses: ['interested', 'pending'],
      // Query bổ sung
      interestedCourseQuery: '',
      // Giới hạn số khách
      interestedLimit: 1000,
      // Chế độ chọn: all | fixed | all_exclude
      interestedSelectionMode: 'all',
      // Chỉ định khách cụ thể
      interestedSelectedCustomerIds: [],
      // Loại trừ khách cụ thể
      interestedExcludedCustomerIds: [],
    },
  },

  // Node 5: Dữ liệu từ Landing Page
  {
    id: 'node_landing_data_1',
    node_type: 'data',
    node_subtype: 'read_landing_leads',
    position: { x: 650, y: 310 },
    config: {
      name: 'Dữ liệu Landing Page',
      description: 'Lấy lead từ landing page',
      // Lọc theo landing page cụ thể (điền ID)
      landingPageIds: [],
      // Chỉ lấy leads chưa được xử lý
      onlyNewLeads: true,
      // Khoảng thời gian (null = tất cả)
      dateFrom: null,
      dateTo: null,
      // Giới hạn
      leadLimit: 500,
    },
  },

  // Node 6: Lưu khách hàng
  {
    id: 'node_save_customer_1',
    node_type: 'action',
    node_subtype: 'save_customer',
    position: { x: 250, y: 440 },
    config: {
      name: 'Lưu khách hàng',
      description: 'Lưu thông tin khách vào database',
      // Ánh xạ trường dữ liệu
      fieldMap: {
        email: { mode: 'node', nodeId: 'node_read_sheet_1', field: 'email' },
        fullName: { mode: 'node', nodeId: 'node_read_sheet_1', field: 'full_name' },
        phone: { mode: 'node', nodeId: 'node_read_sheet_1', field: 'phone' },
        courseInterest: { mode: 'node', nodeId: 'node_read_sheet_1', field: 'course_interest' },
      },
      // Trường tùy chỉnh
      customFields: [],
      // Xử lý khi trùng email
      onDuplicate: 'update', // skip | update | replace
      // Chỉ cập nhật các trường có giá trị
      onlyUpdateIfValueExists: true,
    },
  },

  // Node 7: Gửi Email
  {
    id: 'node_send_email_1',
    node_type: 'action',
    node_subtype: 'send_email',
    position: { x: 250, y: 610 },
    config: {
      name: 'Gửi Email',
      description: 'Gửi email marketing cho khách hàng',
      // Nguồn email khách
      emailSource: 'node', // manual | node | sheet
      emailSourceNodeId: 'node_save_customer_1',
      // Email người gửi
      fromEmail: 'marketing@yourdomain.com',
      fromName: 'UKNOW Marketing',
      // Template email
      emailTemplateId: null, // ID template đã tạo
      // Hoặc nội dung email trực tiếp
      subject: 'Ưu đãi đặc biệt dành cho bạn từ UKNOW!',
      htmlContent: `
        <h1>Xin chào {{fullName}}!</h1>
        <p>Cảm ơn bạn đã quan tâm đến khóa học của chúng tôi.</p>
        <p>Đây là thông tin khóa học bạn quan tâm: {{courseInterest}}</p>
        <p><a href="https://uknow.edu.vn">Khám phá ngay</a></p>
      `.trim(),
      // Biến động trong email
      variables: {
        fullName: { mode: 'node', nodeId: 'node_save_customer_1', field: 'fullName' },
        courseInterest: { mode: 'node', nodeId: 'node_save_customer_1', field: 'courseInterest' },
      },
      // Cài đặt gửi
      sendDelay: 0, // Delay giây trước khi gửi
      trackOpens: true,
      trackClicks: true,
      // Rate limit
      rateLimitPerMinute: 50,
    },
  },

  // ========== ZALO NODES ==========

  // Node 8: Gửi Zalo cá nhân
  {
    id: 'node_send_zalo_personal_1',
    node_type: 'action',
    node_subtype: 'send_zalo_personal',
    position: { x: 50, y: 780 },
    config: {
      name: 'Gửi Zalo cá nhân',
      description: 'Gửi tin nhắn Zalo OA đến khách hàng cá nhân',
      // Nguồn phone khách
      phoneSource: 'node', // manual | node
      phoneSourceNodeId: 'node_save_customer_1',
      phoneField: 'phone',
      // Tài khoản Zalo gửi
      zaloAccountId: null, // ID Zalo OA đã kết nối
      // Template Zalo
      zaloTemplateId: null, // ID template Zalo đã tạo
      // Nội dung tin nhắn (nếu không dùng template)
      messageType: 'text', // text | template
      messageText: 'Xin chào {{fullName}}! Cảm ơn bạn đã quan tâm đến khóa học của UKNOW. Xem ngay: https://uknow.edu.vn',
      // Biến động
      variables: {
        fullName: { mode: 'node', nodeId: 'node_save_customer_1', field: 'fullName' },
      },
      // Cài đặt gửi
      sendDelay: 0,
      rateLimitPerMinute: 30,
      // Chỉ gửi nếu có số điện thoại
      skipIfNoPhone: true,
    },
  },

  // Node 9: Gửi lời mời kết bạn Zalo
  {
    id: 'node_send_zalo_friend_1',
    node_type: 'action',
    node_subtype: 'send_zalo_friend_request',
    position: { x: 250, y: 780 },
    config: {
      name: 'Gửi lời mời kết bạn Zalo',
      description: 'Gửi lời mời kết bạn Zalo đến khách hàng',
      // Nguồn phone khách
      phoneSource: 'node',
      phoneSourceNodeId: 'node_save_customer_1',
      phoneField: 'phone',
      // Tài khoản Zalo gửi
      zaloAccountId: null,
      // Tin nhắn đính kèm lời mời
      messageText: 'Xin chào {{fullName}}! Mình là tư vấn viên của UKNOW. Bạn có thể inbox mình để được tư vấn khóa học nhé!',
      // Biến
      variables: {
        fullName: { mode: 'node', nodeId: 'node_save_customer_1', field: 'fullName' },
      },
      // Cài đặt
      sendDelay: 0,
      rateLimitPerMinute: 20,
      skipIfNoPhone: true,
    },
  },

  // Node 10: Gửi Zalo nhóm
  {
    id: 'node_send_zalo_group_1',
    node_type: 'action',
    node_subtype: 'send_zalo_group',
    position: { x: 450, y: 780 },
    config: {
      name: 'Gửi Zalo nhóm',
      description: 'Gửi tin nhắn vào nhóm Zalo',
      // Tài khoản Zalo gửi
      zaloAccountId: null,
      // Nhóm Zalo đích
      zaloGroupId: null, // ID nhóm Zalo
      // Nội dung tin nhắn
      messageType: 'text',
      messageText: '📢 Thông báo từ UKNOW: Khóa học mới đã ra mắt! Đăng ký ngay tại https://uknow.edu.vn',
      // Chỉ gửi khi có thành viên mới trong nhóm
      triggerOnNewMember: true,
      // Cài đặt
      sendDelay: 0,
      rateLimitPerMinute: 10,
    },
  },
];

// Kết nối giữa các nodes
const CONNECTIONS = [
  // Launch -> Read Sheet
  {
    id: 'conn_launch_sheet',
    sourceNodeName: 'Khởi chạy',
    targetNodeName: 'Đọc dữ liệu Sheet',
  },
  // Launch -> Read Courses
  {
    id: 'conn_launch_courses',
    sourceNodeName: 'Khởi chạy',
    targetNodeName: 'Đọc dữ liệu khóa học',
  },
  // Launch -> Interested Customers
  {
    id: 'conn_launch_interested',
    sourceNodeName: 'Khởi chạy',
    targetNodeName: 'Lấy khách quan tâm',
  },
  // Launch -> Landing Data
  {
    id: 'conn_launch_landing',
    sourceNodeName: 'Khởi chạy',
    targetNodeName: 'Dữ liệu Landing Page',
  },
  // Read Sheet -> Save Customer
  {
    id: 'conn_sheet_save',
    sourceNodeName: 'Đọc dữ liệu Sheet',
    targetNodeName: 'Lưu khách hàng',
  },
  // Save Customer -> Send Email
  {
    id: 'conn_save_email',
    sourceNodeName: 'Lưu khách hàng',
    targetNodeName: 'Gửi Email',
  },
  // Save Customer -> Send Zalo Personal
  {
    id: 'conn_save_zalo_personal',
    sourceNodeName: 'Lưu khách hàng',
    targetNodeName: 'Gửi Zalo cá nhân',
  },
  // Save Customer -> Send Zalo Friend Request
  {
    id: 'conn_save_zalo_friend',
    sourceNodeName: 'Lưu khách hàng',
    targetNodeName: 'Gửi lời mời kết bạn Zalo',
  },
  // Save Customer -> Send Zalo Group
  {
    id: 'conn_save_zalo_group',
    sourceNodeName: 'Lưu khách hàng',
    targetNodeName: 'Gửi Zalo nhóm',
  },
];

async function createCampaign(userId = 1) {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Tạo campaign
    const campaignResult = await client.query(
      `INSERT INTO campaigns 
       (id_user, campaign_name, description, campaign_type, start_date, end_date, timezone, status, flow_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        userId,
        CAMPAIGN_CONFIG.name,
        CAMPAIGN_CONFIG.description,
        CAMPAIGN_CONFIG.type,
        CAMPAIGN_CONFIG.startDate,
        CAMPAIGN_CONFIG.endDate,
        'Asia/Ho_Chi_Minh',
        'draft',
        JSON.stringify({ nodes: NODES, connections: CONNECTIONS }),
      ]
    );

    const campaignId = campaignResult.rows[0].id;

    // Lưu nodes vào bảng campaign_nodes
    for (const node of NODES) {
      await client.query(
        `INSERT INTO campaign_nodes 
         (id_campaign, node_name, node_description, node_type, node_subtype, config, position_x, position_y, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          campaignId,
          node.config.name,
          node.config.description,
          node.node_type,
          node.node_subtype,
          JSON.stringify(node.config),
          node.position.x,
          node.position.y,
          true,
        ]
      );
    }

    // Lấy các node IDs sau khi insert
    const nodeIdsResult = await client.query(
      'SELECT id, node_name FROM campaign_nodes WHERE id_campaign = $1 ORDER BY created_at',
      [campaignId]
    );

    // Tạo map từ node_name trong config -> id
    const nodeNameToId = {};
    nodeIdsResult.rows.forEach(row => {
      nodeNameToId[row.node_name] = row.id;
    });
    console.log('Node IDs mapped:', nodeNameToId);

    // Lưu connections vào bảng campaign_connections
    for (const conn of CONNECTIONS) {
      const sourceId = nodeNameToId[conn.sourceNodeName];
      const targetId = nodeNameToId[conn.targetNodeName];
      console.log(`Connection: ${conn.sourceNodeName} (${sourceId}) -> ${conn.targetNodeName} (${targetId})`);
      await client.query(
        `INSERT INTO campaign_connections 
         (id_campaign, source_node_id, target_node_id, connection_type)
         VALUES ($1, $2, $3, $4)`,
        [campaignId, sourceId, targetId, 'default']
      );
    }

    await client.query('COMMIT');

    console.log('='.repeat(60));
    console.log('✅ TẠO CHIẾN DỊCH THÀNH CÔNG!');
    console.log('='.repeat(60));
    console.log(`ID Chiến dịch: ${campaignId}`);
    console.log(`Tên: ${CAMPAIGN_CONFIG.name}`);
    console.log(`Mô tả: ${CAMPAIGN_CONFIG.description}`);
    console.log(`Loại: ${CAMPAIGN_CONFIG.type}`);
    console.log('-'.repeat(60));
    console.log('CÁC NODE TRONG CHIẾN DỊCH:');
    console.log('-'.repeat(60));
    
    NODES.forEach((node, index) => {
      console.log(`${index + 1}. [${node.node_type.toUpperCase()}] ${node.config.name}`);
      console.log(`   ID: ${node.id}`);
      console.log(`   Subtype: ${node.node_subtype}`);
      console.log(`   Mô tả: ${node.config.description}`);
      console.log('');
    });

    console.log('-'.repeat(60));
    console.log('KẾT NỐI:');
    console.log('-'.repeat(60));
    CONNECTIONS.forEach((conn) => {
      console.log(`${conn.source} → ${conn.target}`);
    });

    console.log('='.repeat(60));
    console.log('📝 HƯỚNG DẪN SỬ DỤNG:');
    console.log('='.repeat(60));
    console.log('1. Mở chiến dịch và chỉnh sửa các node');
    console.log('2. Cập nhật Google Sheet URL trong node "Đọc dữ liệu Sheet"');
    console.log('3. Cấu hình email template trong node "Gửi Email"');
    console.log('4. Nhấn "Xuất bản" để kích hoạt chiến dịch');
    console.log('='.repeat(60));

    return campaignId;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Lỗi tạo chiến dịch:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Chạy script
createCampaign(1)
  .then(() => {
    console.log('\n✅ Hoàn tất!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Thất bại:', error.message);
    process.exit(1);
  });
