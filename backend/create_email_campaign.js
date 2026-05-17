/**
 * Script tạo chiến dịch EMAIL với đầy đủ các node
 * Format đúng cho ReactFlow frontend
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

// Cấu hình chiến dịch EMAIL
const CAMPAIGN_CONFIG = {
  name: 'Chiến dịch Email Marketing',
  description: 'Chiến dịch gửi email marketing tự động',
  type: 'email',
  startDate: new Date().toISOString(),
  endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
};

// Nodes format cho ReactFlow (có data.label, data.nodeType, data.config)
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
        description: 'Điểm bắt đầu chiến dịch email',
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
        dataSelectedColumns: ['email', 'full_name', 'phone', 'course_interest'],
        deduplicateBy: 'email',
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
          email: { mode: 'node', nodeId: 'read_sheet_1', field: 'email' },
          fullName: { mode: 'node', nodeId: 'read_sheet_1', field: 'full_name' },
          phone: { mode: 'node', nodeId: 'read_sheet_1', field: 'phone' },
          courseInterest: { mode: 'node', nodeId: 'read_sheet_1', field: 'course_interest' },
        },
        customFields: [],
        onDuplicate: 'update',
        onlyUpdateIfValueExists: true,
      },
    },
  },
  {
    id: 'send_email_1',
    type: 'task',
    position: { x: 250, y: 610 },
    data: {
      label: 'Gửi Email',
      nodeType: 'send_email',
      config: {
        name: 'Gửi Email',
        description: 'Gửi email marketing cho khách hàng',
        emailSource: 'node',
        emailSourceNodeId: 'save_customer_1',
        fromEmail: 'marketing@yourdomain.com',
        fromName: 'UKNOW Marketing',
        emailTemplateId: null,
        subject: 'Ưu đãi đặc biệt dành cho bạn từ UKNOW!',
        htmlContent: '<h1>Xin chào {{fullName}}!</h1><p>Cảm ơn bạn đã quan tâm đến khóa học của chúng tôi.</p><p><a href="https://uknow.edu.vn">Khám phá ngay</a></p>',
        variables: {
          fullName: { mode: 'node', nodeId: 'save_customer_1', field: 'fullName' },
        },
        sendDelay: 0,
        trackOpens: true,
        trackClicks: true,
        rateLimitPerMinute: 50,
      },
    },
  },
];

// Edges format cho ReactFlow
const EDGES = [
  { id: 'e1', source: 'launch_1', target: 'read_sheet_1', type: 'custom' },
  { id: 'e2', source: 'launch_1', target: 'read_courses_1', type: 'custom' },
  { id: 'e3', source: 'launch_1', target: 'interested_1', type: 'custom' },
  { id: 'e4', source: 'launch_1', target: 'landing_1', type: 'custom' },
  { id: 'e5', source: 'read_sheet_1', target: 'save_customer_1', type: 'custom' },
  { id: 'e6', source: 'save_customer_1', target: 'send_email_1', type: 'custom' },
];

async function createCampaign(userId = 1) {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // flow_json với format đúng: nodes + edges
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

    // Lưu nodes vào campaign_nodes với tempId = id trong flow_json
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
    console.log('✅ TẠO CHIẾN DỊCH EMAIL THÀNH CÔNG!');
    console.log('='.repeat(60));
    console.log(`ID: ${campaignId} | Tên: ${CAMPAIGN_CONFIG.name}`);
    console.log('-'.repeat(60));
    console.log('NODES:');
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
