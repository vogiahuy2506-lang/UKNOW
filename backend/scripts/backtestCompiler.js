/**
 * Backtest Compiler Script (Backtest - Việc 2 & Việc 3)
 *
 * Nhiệm vụ: Chạy kiểm điểm bất động (Backtest) trên toàn bộ campaign đã lưu trong database.
 * Quy trình: Graph đã lưu -> deriveIntentFromGraph -> compileCampaign -> compareCompiledWithLegacy -> Báo cáo phân loại.
 * CHỈ ĐỌC, KHÔNG GHI DATABASE.
 */

import 'dotenv/config';
import db from '../src/config/database.js';
import { compileCampaign } from '../src/services/ai/campaignCompiler.service.js';
import { compareCompiledWithLegacy } from '../src/services/ai/campaignCompilerShadow.service.js';
import { isCompilableIntent } from '../src/services/ai/campaignIntent.schema.js';
import { deriveIntentFromGraph } from '../src/services/ai/campaignIntentFromGraph.service.js';

async function runBacktest() {
  console.log('='.repeat(70));
  console.log('   UKNOW CAMPAIGN COMPILER BACKTEST REPORT (KIỂM ĐIỂM BẤT ĐỘNG)');
  console.log('='.repeat(70));
  console.log(`Thời gian chạy: ${new Date().toISOString()}`);
  console.log(`Database: ${process.env.DB_NAME || 'uknow_campaign'} @ ${process.env.DB_HOST || 'localhost'}\n`);

  try {
    // 1. Lấy danh sách tất cả các campaign có nodes trong DB
    const { rows: campaignRows } = await db.query(
      'SELECT DISTINCT id_campaign FROM campaign_nodes ORDER BY id_campaign ASC'
    );

    const totalCampaigns = campaignRows.length;
    console.log(`Tổng số chiến dịch tìm thấy trong database: ${totalCampaigns}\n`);

    if (totalCampaigns === 0) {
      console.log('Database hiện không có campaign nào để backtest.');
      return;
    }

    // 4 nhóm kết quả
    const group1_unsupported = {}; // { reason: count }
    const group2_incomplete = {}; // { missingField: count }
    const group3_perfectMatch = []; // [ { campaignId, channel, schedule } ]
    const group4_mismatched = {}; // { diffType: [campaignIds] }

    let processedCount = 0;

    for (const row of campaignRows) {
      const campaignId = row.id_campaign;
      processedCount++;

      // Đọc nodes và connections của campaign
      const { rows: nodes } = await db.query(
        'SELECT * FROM campaign_nodes WHERE id_campaign = $1 ORDER BY execution_order ASC, id ASC',
        [campaignId]
      );
      const { rows: connections } = await db.query(
        'SELECT * FROM campaign_connections WHERE id_campaign = $1',
        [campaignId]
      );

      // Bước 1: Rút intent ngược từ graph
      const { intent, unsupported } = deriveIntentFromGraph(nodes, connections);

      if (!intent || unsupported.length > 0) {
        for (const u of unsupported) {
          group1_unsupported[u] = (group1_unsupported[u] || 0) + 1;
        }
        continue;
      }

      // Bước 2: Kiểm tra tính compilable của intent
      const compilableCheck = isCompilableIntent(intent);
      if (!compilableCheck.ok) {
        const missingKey = compilableCheck.missing.sort().join(', ');
        group2_incomplete[missingKey] = (group2_incomplete[missingKey] || 0) + 1;
        continue;
      }

      // Bước 3: Biên dịch bằng compiler và đối chiếu với graph gốc
      try {
        const compiled = compileCampaign(intent);
        const diffResult = compareCompiledWithLegacy(compiled, { nodes, connections });

        if (diffResult.match) {
          group3_perfectMatch.push({
            campaignId,
            channel: intent.channel,
            schedule: intent.schedule?.type,
          });
        } else {
          for (const diff of diffResult.differences) {
            // Gom nhóm diff bằng cách chuẩn hoá pattern
            const normalizedDiff = diff
              .replace(/compiler=\d+/, 'compiler=N')
              .replace(/legacy=\d+/, 'legacy=N')
              .replace(/fromEmailId khác nhau.*/, 'fromEmailId khác nhau')
              .replace(/zaloAccountId khác nhau.*/, 'zaloAccountId khác nhau');

            if (!group4_mismatched[normalizedDiff]) {
              group4_mismatched[normalizedDiff] = [];
            }
            group4_mismatched[normalizedDiff].push(campaignId);
          }
        }
      } catch (compileErr) {
        const errKey = `Compiler Error: ${compileErr.message}`;
        group4_mismatched[errKey] = (group4_mismatched[errKey] || 0) + 1;
      }
    }

    // TỔNG HỢP VÀ IN BÁO CÁO PHÂN LOẠI
    const countGroup1 = Object.values(group1_unsupported).reduce((a, b) => a + b, 0);
    const countGroup2 = Object.values(group2_incomplete).reduce((a, b) => a + b, 0);
    const countGroup3 = group3_perfectMatch.length;
    const countGroup4Campaigns = new Set(Object.values(group4_mismatched).flat()).size;

    console.log('='.repeat(70));
    console.log('BẢNG TỔNG HỢP PHÂN LOẠI BACKTEST');
    console.log('='.repeat(70));
    console.table([
      { 'Nhóm': '1. Không rút được Intent (Chứa node chưa hỗ trợ / rỗng)', 'Số lượng': countGroup1 },
      { 'Nhóm': '2. Intent khuyết trường bắt buộc (isCompilable từ chối)', 'Số lượng': countGroup2 },
      { 'Nhóm': '3. KHỚP HOÀN TOÀN 100% VỚI GRAPH GỐC (Parity Pass)', 'Số lượng': countGroup3 },
      { 'Nhóm': '4. Biên dịch được nhưng lệch cấu trúc graph', 'Số lượng': countGroup4Campaigns },
    ]);

    // CHI TIẾT NHÓM 1
    if (Object.keys(group1_unsupported).length > 0) {
      console.log('\n--- CHI TIẾT NHÓM 1: Các subtype / nguyên nhân chưa hỗ trợ ---');
      console.table(
        Object.entries(group1_unsupported).map(([subtype, count]) => ({
          'Subtype / Nguyên nhân': subtype,
          'Số chiến dịch': count,
        }))
      );
    }

    // CHI TIẾT NHÓM 2
    if (Object.keys(group2_incomplete).length > 0) {
      console.log('\n--- CHI TIẾT NHÓM 2: Danh sách các trường còn thiếu trong Intent ---');
      console.table(
        Object.entries(group2_incomplete).map(([missingFields, count]) => ({
          'Trường thiếu': missingFields,
          'Số chiến dịch': count,
        }))
      );
    }

    // CHI TIẾT NHÓM 3
    if (group3_perfectMatch.length > 0) {
      console.log('\n--- CHI TIẾT NHÓM 3: Phân bổ các campaign Khớp hoàn toàn theo kênh ---');
      const channelBreakdown = {};
      for (const item of group3_perfectMatch) {
        const key = `${item.channel} (${item.schedule})`;
        channelBreakdown[key] = (channelBreakdown[key] || 0) + 1;
      }
      console.table(
        Object.entries(channelBreakdown).map(([channelMode, count]) => ({
          'Kênh & Chế độ': channelMode,
          'Số chiến dịch khớp 100%': count,
        }))
      );
    }

    // CHI TIẾT NHÓM 4
    if (Object.keys(group4_mismatched).length > 0) {
      console.log('\n--- CHI TIẾT NHÓM 4: Gom nhóm các dạng sai khác graph ---');
      console.table(
        Object.entries(group4_mismatched).map(([diffType, campaignIds]) => ({
          'Dạng sai khác': diffType,
          'Số campaign bị ảnh hưởng': Array.isArray(campaignIds) ? campaignIds.length : campaignIds,
          'Campaign IDs ví dụ': Array.isArray(campaignIds) ? campaignIds.slice(0, 5).join(', ') : '',
        }))
      );
    }

    // ĐÁNH GIÁ TỔNG QUAN VÀ TIÊU CHÍ BẬT FEATURE FLAG
    console.log('\n' + '='.repeat(70));
    const totalCompilable = countGroup3 + countGroup4Campaigns;
    if (totalCompilable > 0) {
      const matchRate = ((countGroup3 / totalCompilable) * 100).toFixed(1);
      console.log(`TỈ LỆ PARITY TRÊN CÁC CAMPAIGN COMPILABLE: ${matchRate}% (${countGroup3}/${totalCompilable})`);
      if (Number(matchRate) >= 95) {
        console.log('✅ ĐẠT TIÊU CHÍ BẬT FEATURE FLAG CHO CÁC LUỒNG ĐÃ ĐỐI CHIẾU (≥ 95%)');
      } else {
        console.log('⚠️ CHƯA ĐẠT TIÊU CHÍ 95% - Cần phân tích nhóm 4 để hoàn thiện biến thể');
      }
    }
    console.log('='.repeat(70) + '\n');
  } catch (err) {
    console.error('Lỗi trong quá trình backtest:', err);
  } finally {
    if (db.pool && typeof db.pool.end === 'function') {
      await db.pool.end();
    }
  }
}

runBacktest();
