/**
 * Màn "Xem chiến dịch chạy thế nào" của trang chủ (CampaignFlowModal + CampaignFlowLauncher + campaignFlowData.js).
 *
 * Bản cũ quảng cáo bước / chỉ số KHÔNG có thật (NĐ 248, luật bảo vệ người tiêu dùng): "Lấy từ CRM", "Lọc theo điều kiện",
 * "Chờ 24 giờ", "Kiểm tra đã mở? rẽ nhánh", "Email thứ 2 cho khách chưa mở", "Zalo OA" ở luồng gửi chiến dịch, "30-60s" /
 * "Delay 5-10 phút", "Lưu lịch sử chat vào CRM", "Tổng kết reactions và comments", số liệu "Đã đọc 78%" / "Phản hồi 22%" /
 * "Chuyển đổi 12%" / "Reactions 342" và không có nhãn "minh hoạ". Spec này khoá: (1) mọi thẻ là node có trong palette thật của
 * trình tạo chiến dịch và không phải node chạy không có logic, (2) không còn cụm sai ở bất kỳ chữ nào người dùng thấy,
 * (3) khối số liệu chỉ có chỉ số sản phẩm đo thật và luôn kèm nhãn "Số liệu minh hoạ".
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { I18nProvider, useI18n } from '../../../i18n';
import vi18n from '../../../i18n/vi';
import en18n from '../../../i18n/en';
import { getAllNodeConfigs, nodeTypes } from '../../campaigns/components/CampaignBuilderFlowNodes';
import CampaignFlowModal from '../components/CampaignFlowModal';
import CampaignFlowLauncher from '../../../pages/public/components/CampaignFlowLauncher';
import { FLOWS, FLOW_KEYS, getFlowNodeCount } from '../campaignFlowData';

// Palette thật: các `type` ở getAllNodeConfigs() + node `end` (EndNode ở nodeTypes).
const REAL_SUBTYPES = new Set([
  ...getAllNodeConfigs().map((n) => n.type),
  ...Object.keys(nodeTypes).filter((k) => k === 'end'),
]);

// Node có trong palette nhưng chạy KHÔNG có logic (campaignRun.service.js: "Node chưa có logic chạy riêng, bỏ qua") hoặc
// không có trong registry — màn mô phỏng không được dùng làm bước.
const NO_RUNTIME_LOGIC = ['condition', 'tag_contact', 'update_attribute', 'wait', 'wait_time', 'delay', 'switch', 'loop', 'merge', 'branch'];

// Chỉ số sản phẩm thật sự đo và hiện cho khách ở trang Báo cáo (DashboardKpiCards / DashboardCampaignsTable).
const REAL_STAT_LABELS = ['Đã gửi', 'Chưa gửi được', 'Email đã mở', 'Đã bấm link', 'Lượt nhấp link'];

const FORBIDDEN = [
  [/CRM/i, 'CRM (không có module CRM trong trình tạo chiến dịch)'],
  [/Zalo OA/i, 'Zalo OA (chiến dịch gửi qua Zalo cá nhân; Zalo OA chỉ có ở chatbot)'],
  [/Lọc (theo )?điều kiện|Filter by condition/i, 'node điều kiện chạy không có logic'],
  [/Chờ \d+ giờ|Wait \d+ hours/i, 'node chờ không có thật'],
  [/Kiểm tra đã mở|Check if opened/i, 'rẽ nhánh theo hành vi mở email không có thật'],
  [/chưa mở|haven.t opened/i, 'email cho khách chưa mở không có thật'],
  [/Email nhắc|reminder email/i, 'email nhắc theo điều kiện không có thật'],
  [/Đối chiếu/i, 'bước đối chiếu & lọc bạn bè không có thật'],
  [/reactions?|comments?/i, 'Zalo không trả reactions/comments về cho chiến dịch'],
  [/Delay/i, 'node delay không có thật (độ trễ nằm trong cấu hình node gửi)'],
  [/\d+\s*[-–]\s*\d+\s*(s\b|giây|phút)/i, 'khoảng giãn cách ghi số cứng (thật: 80-150 giây mặc định, mức nhanh tối thiểu 30 giây)'],
  [/Đã đọc|Đã xem|Phản hồi\b/i, 'Zalo không có chỉ số đã đọc / phản hồi cho chiến dịch'],
  [/Chuyển đổi|conversion/i, 'không có tỉ lệ chuyển đổi đo từ chiến dịch'],
  [/Tổng thành viên/i, 'tổng thành viên nhóm không đo'],
  [/lịch sử chat/i, 'không lưu lịch sử chat vào CRM'],
  [/\d[\d.]*\s*khách\b|~\s?\d+\s*phút|\d+\s*nhóm\b/i, 'số khách / số phút / số nhóm bịa ở thẻ chiến dịch'],
];

const expectNoForbidden = (text, where) => {
  for (const [re, why] of FORBIDDEN) {
    expect(text, `${where}: còn cụm sai ${re} — ${why}`).not.toMatch(re);
  }
};

const flowText = (flow) => JSON.stringify({
  title: flow.title,
  subtitle: flow.subtitle,
  nodes: flow.nodes.map((n) => ({ label: n.label, desc: n.desc })),
  stats: flow.stats,
});

describe('campaignFlowData — luồng chỉ gồm node có thật', () => {
  it('có đúng 3 luồng: email, zalo, zalo_group', () => {
    expect(FLOW_KEYS).toEqual(['email', 'zalo', 'zalo_group']);
  });

  it.each(FLOW_KEYS)('luồng %s: mọi thẻ là node có trong palette thật, không có node chạy không logic', (key) => {
    const flow = FLOWS[key];
    for (const node of flow.nodes) {
      expect(node.subtypes.length, `thẻ ${node.id}`).toBeGreaterThan(0);
      for (const subtype of node.subtypes) {
        expect(REAL_SUBTYPES.has(subtype), `thẻ ${node.id}: subtype "${subtype}" không có trong palette trình tạo chiến dịch`).toBe(true);
        expect(NO_RUNTIME_LOGIC, `thẻ ${node.id}: "${subtype}" chạy không có logic`).not.toContain(subtype);
      }
    }
  });

  it.each(FLOW_KEYS)('luồng %s: bắt đầu bằng kích hoạt thủ công, kết thúc bằng node Kết thúc', (key) => {
    const { nodes } = FLOWS[key];
    expect(nodes[0].subtypes).toEqual(['manual_trigger']);
    expect(nodes[nodes.length - 1].subtypes).toEqual(['end']);
  });

  it('luồng email: gửi email là MỘT node (nhiều email nằm trong cấu hình), không có thẻ chờ hay rẽ nhánh riêng', () => {
    const subtypes = FLOWS.email.nodes.flatMap((n) => n.subtypes);
    expect(subtypes.filter((s) => s === 'send_email')).toHaveLength(1);
    expect(subtypes).toEqual(expect.arrayContaining(['manual_trigger', 'send_email', 'save_customer', 'end']));
  });

  it('luồng Zalo cá nhân dùng node Zalo cá nhân, luồng nhóm dùng node nhóm — không lẫn kênh', () => {
    const personal = FLOWS.zalo.nodes.flatMap((n) => n.subtypes);
    const group = FLOWS.zalo_group.nodes.flatMap((n) => n.subtypes);
    expect(personal).toEqual(expect.arrayContaining(['select_zalo_account', 'get_all_friends', 'send_zalo_personal']));
    expect(personal).not.toContain('send_zalo_group');
    expect(group).toEqual(expect.arrayContaining(['select_zalo_account', 'get_all_groups', 'send_zalo_group']));
    expect(group).not.toContain('send_zalo_personal');
  });

  it.each(FLOW_KEYS)('luồng %s: chữ hiển thị không còn cụm sai', (key) => {
    expectNoForbidden(flowText(FLOWS[key]), `FLOWS.${key}`);
  });

  it('getFlowNodeCount khớp số thẻ của từng luồng', () => {
    for (const key of FLOW_KEYS) expect(getFlowNodeCount(key)).toBe(FLOWS[key].nodes.length);
    expect(getFlowNodeCount('khong_co')).toBe(0);
  });
});

describe('campaignFlowData — khối số liệu chỉ có chỉ số đo thật', () => {
  it.each(FLOW_KEYS)('luồng %s: mọi nhãn số liệu nằm trong tập chỉ số trang Báo cáo thật sự hiện', (key) => {
    const { stats } = FLOWS[key];
    expect(stats.length).toBeGreaterThan(0);
    for (const stat of stats) {
      expect(REAL_STAT_LABELS, `nhãn "${stat.label}"`).toContain(stat.label);
    }
  });

  it('luồng Zalo không có chỉ số email, luồng nhóm không có lượt nhấp link (node nhóm không có tracking link)', () => {
    expect(FLOWS.zalo.stats.map((s) => s.label)).not.toEqual(expect.arrayContaining(['Email đã mở']));
    expect(FLOWS.zalo_group.stats.map((s) => s.label)).toEqual(['Đã gửi', 'Chưa gửi được']);
  });
});

describe('CampaignFlowModal — hiện nhãn "Số liệu minh hoạ" và không còn câu sai', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    localStorage.clear();
  });

  const finishAnimation = (flowKey) => {
    act(() => {
      vi.advanceTimersByTime(1500 * (FLOWS[flowKey].nodes.length + 2));
    });
  };

  const renderModal = (flowKey) => render(
    <I18nProvider>
      <CampaignFlowModal open flowKey={flowKey} onClose={() => {}} />
    </I18nProvider>,
  );

  it.each(FLOW_KEYS)('tab %s: khi hiện khối số liệu có nhãn "Số liệu minh hoạ" + ghi chú không phải kết quả thật', (key) => {
    renderModal(key);
    // Trước khi chạy xong chưa có khối số liệu.
    expect(screen.queryByTestId('campaign-flow-sample-badge')).toBeNull();
    finishAnimation(key);
    const badge = screen.getByTestId('campaign-flow-sample-badge');
    expect(badge.textContent).toBe('Số liệu minh hoạ');
    expect(screen.getByTestId('campaign-flow-sample-note').textContent).toMatch(/không phải kết quả thật/);
  });

  it.each(FLOW_KEYS)('tab %s: toàn bộ chữ trong modal (sau khi chạy xong) không còn cụm sai', (key) => {
    renderModal(key);
    finishAnimation(key);
    expectNoForbidden(document.body.textContent, `modal ${key}`);
  });

  it('chân modal không còn câu "Tự động chạy lại" (animation không hề lặp)', () => {
    renderModal('email');
    expect(document.body.textContent).not.toMatch(/Tự động chạy lại/);
  });

  it('chuyển tab không làm mất nhãn: mỗi luồng đều có nhãn ở khối số liệu', () => {
    renderModal('email');
    for (const tab of ['Zalo cá nhân', 'Zalo nhóm', 'Email']) {
      act(() => { screen.getAllByText(tab)[0].closest('button').click(); });
      const key = { 'Zalo cá nhân': 'zalo', 'Zalo nhóm': 'zalo_group', Email: 'email' }[tab];
      finishAnimation(key);
      expect(screen.getByTestId('campaign-flow-sample-badge')).toBeTruthy();
    }
  });
});

describe('CampaignFlowLauncher — thẻ chiến dịch không còn số bịa', () => {
  afterEach(() => cleanup());

  it('chip hiện đúng số node của luồng, không có "khách / phút / nhóm" bịa, mô tả không có Zalo OA / chuyển đổi', () => {
    localStorage.clear();
    // Launcher nhận `t` từ HeroPage; dùng từ điển thật qua useI18n để kiểm đúng câu chữ khách thấy.
    function Harness() {
      const { t } = useI18n();
      return <CampaignFlowLauncher t={t} />;
    }
    render(
      <I18nProvider>
        <Harness />
      </I18nProvider>,
    );
    const text = document.body.textContent;
    for (const key of FLOW_KEYS) expect(text).toContain(`${getFlowNodeCount(key)} node`);
    expectNoForbidden(text, 'launcher');
  });
});

describe('i18n vi/en — khối mô phỏng chiến dịch', () => {
  const blocks = [['vi', vi18n], ['en', en18n]];

  it.each(blocks)('%s: mô tả thẻ chiến dịch không còn Zalo OA / theo dõi chuyển đổi / "3 lần"', (_n, dict) => {
    const blob = JSON.stringify(dict.heroPage.campaignDemo);
    expect(blob).not.toMatch(/Zalo OA/i);
    expect(blob).not.toMatch(/chuyển đổi|conversion/i);
    expect(blob).not.toMatch(/3 lần|3x/i);
  });

  it.each(blocks)('%s: campaignFlow có nhãn số liệu minh hoạ + ghi chú + chân modal, không còn autoLoop', (_n, dict) => {
    const flow = dict.heroPage.campaignFlow;
    expect(typeof flow.sampleData).toBe('string');
    expect(flow.sampleData.length).toBeGreaterThan(3);
    expect(typeof flow.sampleDataNote).toBe('string');
    expect(typeof flow.footerNote).toBe('string');
    expect(flow.autoLoop).toBeUndefined();
    expect(flow.subtitle).not.toMatch(/flow thật|real system flow/i);
  });
});
