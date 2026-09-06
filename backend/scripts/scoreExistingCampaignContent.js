/**
 * Script chấm điểm nội dung AI trên các campaign thật trong Database (Kế hoạch 7A - Việc 3 & 4)
 *
 * Nhiệm vụ:
 * 1. Chốt mốc chất lượng nội dung trước GĐ 4 (Việc 3).
 * 2. Đo lường tỉ lệ AI soạn vs Template ở kênh Zalo (Việc 4).
 * 3. Chạy chế độ chỉ đọc (read-only), in báo cáo chi tiết, đóng pool an toàn bằng db.pool.end().
 *
 * Cách chạy:
 *   cd backend && node scripts/scoreExistingCampaignContent.js
 */

import 'dotenv/config';
import db from '../src/config/database.js';
import { scoreGeneratedContent } from '../src/services/ai/contentQuality.util.js';
import { getNodeSubtype } from '../src/utils/nodeSubtype.util.js';

async function main() {
  const dbName = process.env.DB_NAME || 'neondb';
  const dbHost = process.env.DB_HOST || 'localhost';

  console.log('='.repeat(78));
  console.log('   UKNOW - THƯỚC ĐO NỘI DUNG CHIẾN DỊCH (7A: VIỆC 3 & VIỆC 4)');
  console.log('='.repeat(78));
  console.log(`Thời gian chạy: ${new Date().toISOString()}`);
  console.log(`Môi trường DB:  ${dbName} @ ${dbHost}\n`);

  try {
    // -------------------------------------------------------------------------
    // 1. Kiểm tra bảng email_messages (Mốc lịch sử 262.300 email)
    // -------------------------------------------------------------------------
    console.log('--- PHẦN 1: ĐO LƯỜNG LỊCH SỬ EMAIL ---');
    let totalEmails = 0;
    let emailWithTemplate = 0;
    let emailAiDirect = 0;
    let emailAiViaTemplate = 0;
    let emailUnrenderedPlaceholders = 0;
    let emailCampaignIds = [];

    try {
      const { rows: emCountRows } = await db.query('SELECT COUNT(*) FROM email_messages');
      totalEmails = Number(emCountRows[0]?.count || 0);

      if (totalEmails > 0) {
        const { rows: tplRows } = await db.query(`
          SELECT 
            COUNT(*) FILTER (WHERE id_email_template IS NOT NULL) AS with_template,
            COUNT(*) FILTER (WHERE id_email_template IS NULL) AS ai_direct,
            COUNT(*) FILTER (WHERE template_code LIKE 'ai_%') AS ai_via_template,
            COUNT(*) FILTER (WHERE body_html LIKE '%{{%') AS unrendered_placeholders
          FROM email_messages
        `);
        emailWithTemplate = Number(tplRows[0]?.with_template || 0);
        emailAiDirect = Number(tplRows[0]?.ai_direct || 0);
        emailAiViaTemplate = Number(tplRows[0]?.ai_via_template || 0);
        emailUnrenderedPlaceholders = Number(tplRows[0]?.unrendered_placeholders || 0);

        const { rows: campRows } = await db.query(`
          SELECT DISTINCT id_campaign 
          FROM email_messages 
          WHERE id_email_template IS NULL AND id_campaign IS NOT NULL
        `);
        emailCampaignIds = campRows.map((r) => Number(r.id_campaign));
      }
    } catch (emErr) {
      console.warn('[Warning] Lỗi khi truy vấn email_messages:', emErr.message);
    }

    console.log(`Tổng số email trong bảng email_messages: ${totalEmails.toLocaleString('vi-VN')}`);
    if (totalEmails > 0) {
      console.log(` - Người tự viết template: ${emailWithTemplate.toLocaleString('vi-VN')} (${((emailWithTemplate / totalEmails) * 100).toFixed(1)}%)`);
      console.log(` - AI soạn trực tiếp (id_email_template IS NULL): ${emailAiDirect.toLocaleString('vi-VN')} (${((emailAiDirect / totalEmails) * 100).toFixed(1)}%)`);
      console.log(` - AI qua template (template_code LIKE 'ai_%'): ${emailAiViaTemplate.toLocaleString('vi-VN')}`);
      console.log(` - Sót placeholder chưa render (body_html LIKE '%{{%'): ${emailUnrenderedPlaceholders} ca`);
    } else {
      console.log(' (Bảng email_messages rỗng trên DB hiện tại; sẽ quét các campaign email qua campaign_nodes)');
    }

    // -------------------------------------------------------------------------
    // 2. Việc 4: Bổ khuyết đo lường Zalo (AI soạn vs Template sẵn)
    // -------------------------------------------------------------------------
    console.log('\n--- PHẦN 2: BỔ KHUYẾT ĐO LƯỜNG ZALO (VIỆC 4) ---');
    let totalZaloMessages = 0;
    try {
      const { rows: zmCountRows } = await db.query('SELECT COUNT(*) FROM zalo_messages');
      totalZaloMessages = Number(zmCountRows[0]?.count || 0);
    } catch (zmErr) {
      console.warn('[Warning] Lỗi khi đếm zalo_messages:', zmErr.message);
    }
    console.log(`Tổng số tin trong bảng zalo_messages: ${totalZaloMessages.toLocaleString('vi-VN')}`);

    // Đọc tất cả các node gửi Zalo trong campaign_nodes để phân loại AI vs Template
    const { rows: zaloNodeRows } = await db.query(`
      SELECT 
        cn.id, 
        cn.id_campaign, 
        cn.node_type, 
        cn.node_subtype, 
        cn.config,
        c.campaign_name,
        COALESCE(c.workspace_owner_id, c.id_user) AS owner_id
      FROM campaign_nodes cn
      JOIN campaigns c ON c.id = cn.id_campaign
      WHERE cn.node_subtype IN ('send_zalo_personal', 'zalo_personal', 'send_zalo_group', 'zalo_group')
         OR cn.node_type IN ('send_zalo_personal', 'send_zalo_group')
      ORDER BY cn.id_campaign ASC, cn.id ASC
    `);

    let totalZaloSteps = 0;
    let zaloStepsWithTemplate = 0;
    let zaloStepsCustomOrAi = 0;
    const zaloCampaignMap = new Map();

    for (const node of zaloNodeRows) {
      const cfg = typeof node.config === 'object' && node.config !== null ? node.config : {};
      const subtype = getNodeSubtype(node);
      const isPersonal = subtype.includes('personal');

      const steps = isPersonal
        ? (Array.isArray(cfg.zaloPersonalTemplateSteps) && cfg.zaloPersonalTemplateSteps.length > 0
            ? cfg.zaloPersonalTemplateSteps
            : (cfg.messageText || cfg.message ? [{ message: cfg.messageText || cfg.message, templateId: cfg.templateId }] : []))
        : (Array.isArray(cfg.zaloGroupTemplateSteps) && cfg.zaloGroupTemplateSteps.length > 0
            ? cfg.zaloGroupTemplateSteps
            : (cfg.messageText || cfg.message ? [{ message: cfg.messageText || cfg.message, templateId: cfg.templateId }] : []));

      let campData = zaloCampaignMap.get(node.id_campaign);
      if (!campData) {
        campData = {
          campaignId: node.id_campaign,
          campaignName: node.campaign_name,
          ownerId: node.owner_id,
          isInternalAccount: [39, 116].includes(Number(node.owner_id)),
          personalSteps: 0,
          groupSteps: 0,
          templateSteps: 0,
          customAiSteps: 0,
        };
        zaloCampaignMap.set(node.id_campaign, campData);
      }

      for (const step of steps) {
        totalZaloSteps++;
        if (isPersonal) campData.personalSteps++;
        else campData.groupSteps++;

        if (step?.templateId) {
          zaloStepsWithTemplate++;
          campData.templateSteps++;
        } else {
          zaloStepsCustomOrAi++;
          campData.customAiSteps++;
        }
      }
    }

    console.log(`Tổng số node gửi Zalo tìm thấy trong DB: ${zaloNodeRows.length} node (trên ${zaloCampaignMap.size} chiến dịch)`);
    console.log(`Tổng số bước (message steps) Zalo: ${totalZaloSteps}`);
    if (totalZaloSteps > 0) {
      console.log(` - Tin dùng mẫu sẵn (có templateId):     ${zaloStepsWithTemplate} (${((zaloStepsWithTemplate / totalZaloSteps) * 100).toFixed(1)}%)`);
      console.log(` - Tin AI soạn / Tự viết (không templateId): ${zaloStepsCustomOrAi} (${((zaloStepsCustomOrAi / totalZaloSteps) * 100).toFixed(1)}%)`);
    }

    // -------------------------------------------------------------------------
    // 3. Việc 3: Chấm điểm nội dung trên Corpus chiến dịch thật
    // -------------------------------------------------------------------------
    console.log('\n--- PHẦN 3: CHẤM ĐIỂM CHẤT LƯỢNG NỘI DUNG (VIỆC 3) ---');

    // Gom danh sách campaign cần chấm:
    // Bao gồm: campaign AI soạn từ email, campaign Zalo (trừ nội bộ), và toàn bộ campaign có node gửi
    const { rows: allSendNodes } = await db.query(`
      SELECT DISTINCT cn.id_campaign, c.campaign_name, COALESCE(c.workspace_owner_id, c.id_user) AS owner_id
      FROM campaign_nodes cn
      JOIN campaigns c ON c.id = cn.id_campaign
      WHERE cn.node_subtype IN ('send_email', 'email', 'send_zalo_personal', 'zalo_personal', 'send_zalo_group', 'zalo_group')
         OR cn.node_type IN ('send_email', 'action/send_email', 'send_zalo_personal', 'send_zalo_group')
      ORDER BY cn.id_campaign ASC
    `);

    console.log(`Tổng số chiến dịch có node gửi nội dung trong DB: ${allSendNodes.length}\n`);

    const scoreResults = [];
    const issueCodeCounts = {
      PLACEHOLDER_UNRESOLVED: 0,
      EMPTY_BODY: 0,
      EMPTY_SUBJECT: 0,
      WRONG_LOCALE: 0,
      STEP_COUNT_MISMATCH: 0,
      TOPIC_ABSENT: 0,
    };

    for (const camp of allSendNodes) {
      const campaignId = camp.id_campaign;

      const { rows: nodes } = await db.query(
        'SELECT * FROM campaign_nodes WHERE id_campaign = $1 ORDER BY execution_order ASC, id ASC',
        [campaignId]
      );
      const { rows: connections } = await db.query(
        'SELECT * FROM campaign_connections WHERE id_campaign = $1',
        [campaignId]
      );

      const script = { nodes, connections };
      const score = scoreGeneratedContent(script, {
        locale: 'vi', // Mặc định chấm theo tiếng Việt cho chiến dịch thị trường VN
      });

      for (const issue of score.issues) {
        if (issueCodeCounts[issue.code] !== undefined) {
          issueCodeCounts[issue.code]++;
        }
      }

      scoreResults.push({
        campaignId,
        campaignName: camp.campaign_name,
        ownerId: camp.owner_id,
        isInternal: [39, 116].includes(Number(camp.owner_id)),
        nodeCount: nodes.length,
        ok: score.ok,
        issueCount: score.issues.length,
        issues: score.issues.map((i) => i.code),
      });
    }

    // In bảng tổng kết chấm điểm
    console.table(
      scoreResults.map((r) => ({
        ID: r.campaignId,
        'Tên chiến dịch': r.campaignName?.slice(0, 30) || 'N/A',
        Owner: r.ownerId,
        'Nội bộ?': r.isInternal ? 'Có' : 'Không',
        Nodes: r.nodeCount,
        'Chuẩn?': r.ok ? '✅ Đạt' : '❌ Lỗi',
        'Mã lỗi phát hiện': r.issues.length > 0 ? Array.from(new Set(r.issues)).join(', ') : '(không)',
      }))
    );

    console.log('\n--- BẢNG PHÂN BỐ MÃ LỖI NỘI DUNG (MỐC CHỐT TRƯỚC GĐ 4) ---');
    console.table(
      Object.entries(issueCodeCounts).map(([code, count]) => ({
        'Mã lỗi': code,
        'Số ca phát hiện': count,
      }))
    );

    console.log('\n✅ Hoàn tất chấm điểm tất định không LLM trên database thật.');
  } finally {
    await db.pool.end();
  }
}

main().catch((err) => {
  console.error('[ScoreExistingCampaignContent] ❌ Lỗi chạy script:', err);
  process.exit(1);
});
