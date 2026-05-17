/**
 * Script tạo chiến dịch ZALO NHÓM với format ReactFlow đúng
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

// Cấu hình chiến dịch ZALO NHÓM
const CAMPAIGN_CONFIG = {
  name: 'Chiến dịch Zalo Nhóm',
  description: 'Chiến dịch gửi tin nhắn vào nhóm Zalo',
  type: 'zalo_group',
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
        description: 'Điểm bắt đầu chiến dịch Zalo nhóm',
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
      label: 'Đọc danh sách nhóm',
      nodeType: 'read_sheet',
      config: {
        name: 'Đọc danh sách nhóm',
        description: 'Lấy danh sách nhóm Zalo từ Google Sheet',
        sheetUrl: 'https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit',
        sheetName: 'Sheet1',
        hasHeaderRow: true,
        dataSelectedColumns: ['group_id', 'group_name', 'member_count', 'description'],
        deduplicateBy: 'group_id',
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
        includeInterestedCustomers: false,
        interestedLimit: 0,
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
    id: 'send_group_1',
    type: 'task',
    position: { x: 250, y: 440 },
    data: {
      label: 'Gửi tin nhắn nhóm',
      nodeType: 'send_zalo_group',
      config: {
        name: 'Gửi tin nhắn nhóm',
        description: 'Gửi tin nhắn vào nhóm Zalo',
        zaloAccountId: null,
        zaloGroupId: null,
        zaloGroupIdSource: 'sheet',
        zaloGroupIdField: 'group_id',
        messageType: 'text',
        messageText: '📢 Thông báo từ UKNOW!\n\nKhóa học mới đã ra mắt!\n🌟 {{courseName}}\n💰 Học phí: {{coursePrice}}\n\n👉 Đăng ký ngay: https://uknow.edu.vn',
        variables: {
          courseName: { mode: 'node', nodeId: 'read_courses_1', field: 'course_name' },
          coursePrice: { mode: 'node', nodeId: 'read_courses_1', field: 'price' },
        },
        sendDelay: 0,
        rateLimitPerMinute: 10,
        triggerOnNewMember: false,
        sendToAllGroups: true,
      },
    },
  },
];

const EDGES = [
  { id: 'e1', source: 'launch_1', target: 'read_sheet_1', type: 'custom' },
  { id: 'e2', source: 'launch_1', target: 'read_courses_1', type: 'custom' },
  { id: 'e3', source: 'launch_1', target: 'interested_1', type: 'custom' },
  { id: 'e4', source: 'read_courses_1', target: 'send_group_1', type: 'custom' },
  { id: 'e5', source: 'read_sheet_1', target: 'send_group_1', type: 'custom' },
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
    console.log('✅ TẠO CHIẾN DỊCH ZALO NHÓM THÀNH CÔNG!');
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
