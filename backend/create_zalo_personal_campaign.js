/**
 * Script tạo chiến dịch ZALO CÁ NHÂN với format ReactFlow đúng
 */

import pg from 'pg';
const { Pool } = pg;

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

// Cấu hình chiến dịch ZALO CÁ NHÂN
const CAMPAIGN_CONFIG = {
  name: 'Chiến dịch Zalo Cá Nhân',
  description: 'Chiến dịch gửi tin nhắn Zalo OA đến khách hàng cá nhân',
  type: 'zalo',
  startDate: new Date().toISOString(),
  endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
};

// Nodes format ReactFlow
const NODES = [
  {
    id: 'launch_1',
    type: 'start',
    position: { x: 250, y: 50 },
    data: {
      label: 'Khởi chạy',
      nodeType: 'launch',
      config: {
        name: 'Khởi chạy',
        description: 'Điểm bắt đầu chiến dịch Zalo cá nhân',
        runMode: 'immediate',
        scheduleCron: null,
        timezone: 'Asia/Ho_Chi_Minh',
      },
    },
  },
  {
    id: 'read_sheet_1',
    type: 'task',
    position: { x: 250, y: 180 },
    data: {
      label: 'Đọc dữ liệu Sheet',
      nodeType: 'read_sheet',
      config: {
        name: 'Đọc dữ liệu Sheet',
        description: 'Lấy danh sách khách hàng từ Google Sheet',
        sheetUrl: 'https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit',
        sheetName: 'Sheet1',
        hasHeaderRow: true,
        dataSelectedColumns: ['phone', 'full_name', 'email', 'course_interest'],
        deduplicateBy: 'phone',
        rowLimit: null,
      },
    },
  },
  {
    id: 'read_courses_1',
    type: 'task',
    position: { x: 50, y: 310 },
    data: {
      label: 'Đọc dữ liệu khóa học',
      nodeType: 'read_courses_db',
      config: {
        name: 'Đọc dữ liệu khóa học',
        description: 'Lấy thông tin các khóa học từ database',
        coursesDbSelectedIds: [],
        coursesDbSearchTerm: '',
        coursesDbStatuses: ['published'],
        coursesDbLimit: 100,
        includeInterestedCustomers: true,
        interestedLimit: 1000,
      },
    },
  },
  {
    id: 'interested_1',
    type: 'task',
    position: { x: 450, y: 310 },
    data: {
      label: 'Lấy khách quan tâm',
      nodeType: 'interested_customers',
      config: {
        name: 'Lấy khách quan tâm',
        description: 'Lấy danh sách khách đã đăng ký khóa học',
        interestedCustomerType: 'interested',
        interestedDataSource: 'database',
        interestedCourseIds: [],
        interestedCourseStatuses: ['interested', 'pending'],
        interestedCourseQuery: '',
        interestedLimit: 1000,
        interestedSelectionMode: 'all',
        interestedSelectedCustomerIds: [],
        interestedExcludedCustomerIds: [],
      },
    },
  },
  {
    id: 'landing_1',
    type: 'start',
    position: { x: 650, y: 310 },
    data: {
      label: 'Dữ liệu Landing Page',
      nodeType: 'read_landing_leads',
      config: {
        name: 'Dữ liệu Landing Page',
        description: 'Lấy lead từ landing page',
        landingPageIds: [],
        onlyNewLeads: true,
        dateFrom: null,
        dateTo: null,
        leadLimit: 500,
      },
    },
  },
  {
    id: 'save_customer_1',
    type: 'task',
    position: { x: 250, y: 440 },
    data: {
      label: 'Lưu khách hàng',
      nodeType: 'save_customer',
      config: {
        name: 'Lưu khách hàng',
        description: 'Lưu thông tin khách vào database',
        fieldMap: {
          phone: { mode: 'node', nodeId: 'read_sheet_1', field: 'phone' },
          fullName: { mode: 'node', nodeId: 'read_sheet_1', field: 'full_name' },
          email: { mode: 'node', nodeId: 'read_sheet_1', field: 'email' },
          courseInterest: { mode: 'node', nodeId: 'read_sheet_1', field: 'course_interest' },
        },
        customFields: [],
        onDuplicate: 'update',
        onlyUpdateIfValueExists: true,
      },
    },
  },
  {
    id: 'zalo_friend_1',
    type: 'task',
    position: { x: 50, y: 610 },
    data: {
      label: 'Gửi lời mời kết bạn Zalo',
      nodeType: 'send_zalo_friend_request',
      config: {
        name: 'Gửi lời mời kết bạn Zalo',
        description: 'Gửi lời mời kết bạn Zalo đến khách hàng',
        phoneSource: 'node',
        phoneSourceNodeId: 'save_customer_1',
        phoneField: 'phone',
        zaloAccountId: null,
        messageText: 'Xin chào {{fullName}}! Mình là tư vấn viên của UKNOW. Bạn inbox mình để được tư vấn khóa học nhé!',
        variables: {
          fullName: { mode: 'node', nodeId: 'save_customer_1', field: 'fullName' },
        },
        sendDelay: 0,
        rateLimitPerMinute: 20,
        skipIfNoPhone: true,
      },
    },
  },
  {
    id: 'zalo_send_1',
    type: 'task',
    position: { x: 450, y: 610 },
    data: {
      label: 'Gửi tin nhắn Zalo',
      nodeType: 'send_zalo_personal',
      config: {
        name: 'Gửi tin nhắn Zalo',
        description: 'Gửi tin nhắn Zalo OA đến khách hàng cá nhân',
        phoneSource: 'node',
        phoneSourceNodeId: 'save_customer_1',
        phoneField: 'phone',
        zaloAccountId: null,
        zaloTemplateId: null,
        messageType: 'text',
        messageText: 'Xin chào {{fullName}}! Cảm ơn bạn đã quan tâm đến khóa học của UKNOW. Xem ngay: https://uknow.edu.vn',
        variables: {
          fullName: { mode: 'node', nodeId: 'save_customer_1', field: 'fullName' },
        },
        sendDelay: 0,
        rateLimitPerMinute: 30,
        skipIfNoPhone: true,
      },
    },
  },
];

const EDGES = [
  { id: 'e1', source: 'launch_1', target: 'read_sheet_1', type: 'custom' },
  { id: 'e2', source: 'launch_1', target: 'read_courses_1', type: 'custom' },
  { id: 'e3', source: 'launch_1', target: 'interested_1', type: 'custom' },
  { id: 'e4', source: 'launch_1', target: 'landing_1', type: 'custom' },
  { id: 'e5', source: 'read_sheet_1', target: 'save_customer_1', type: 'custom' },
  { id: 'e6', source: 'save_customer_1', target: 'zalo_friend_1', type: 'custom' },
  { id: 'e7', source: 'save_customer_1', target: 'zalo_send_1', type: 'custom' },
];

async function createCampaign(userId = 1) {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const flowJson = { nodes: NODES, edges: EDGES };

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
        JSON.stringify(flowJson),
      ]
    );

    const campaignId = campaignResult.rows[0].id;

    for (const node of NODES) {
      await client.query(
        `INSERT INTO campaign_nodes 
         (id_campaign, node_name, node_description, node_type, node_subtype, config, position_x, position_y, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          campaignId,
          node.data.label,
          node.data.config.description,
          node.data.nodeType.includes('launch') ? 'trigger' : 'action',
          node.data.nodeType,
          JSON.stringify(node.data.config),
          node.position.x,
          node.position.y,
          true,
        ]
      );
    }

    await client.query('COMMIT');

    console.log('\n' + '='.repeat(60));
    console.log('✅ TẠO CHIẾN DỊCH ZALO CÁ NHÂN THÀNH CÔNG!');
    console.log('='.repeat(60));
    console.log(`ID: ${campaignId} | Tên: ${CAMPAIGN_CONFIG.name}`);
    console.log('-'.repeat(60));
    NODES.forEach((n, i) => console.log(`  ${i + 1}. [${n.data.nodeType}] ${n.data.label}`));
    console.log('='.repeat(60));

    return campaignId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

createCampaign(1).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
