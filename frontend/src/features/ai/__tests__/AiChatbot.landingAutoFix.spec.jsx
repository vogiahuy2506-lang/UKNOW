/**
 * PLAN_LANDING_TU_KIEM_HIEN_THI_TU_SUA mục 12.4 — vòng tự kiểm → tự sửa trong AiChatbot thật.
 * Mock: bộ đo (jsdom không có layout), aiApi, api. Từ điển i18n THẬT để kiểm câu người dùng thấy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AiChatbot from '../AiChatbot';
import aiApi from '../../../services/aiApi';
import api from '../../../services/api';
import { runLayoutAudit } from '../utils/layoutAudit.js';

const mockToast = vi.hoisted(() => {
  const toast = vi.fn();
  toast.error = vi.fn();
  toast.success = vi.fn();
  toast.loading = vi.fn();
  toast.dismiss = vi.fn();
  return toast;
});
vi.mock('react-hot-toast', () => ({ toast: mockToast, default: mockToast, Toaster: () => null }));
vi.mock('../../../services/aiApi');
vi.mock('../../../services/api');
vi.mock('../../../hooks/useIsMobile', () => ({ default: () => false }));
vi.mock('../../../i18n', async () => (await import('../../../test/realI18n.js')).realI18nModule());
vi.mock('../utils/layoutAudit.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runLayoutAudit: vi.fn(),
}));
vi.mock('../../../stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 1, role: 'user' },
    isAuthenticated: true,
    fetchAiCredits: vi.fn().mockResolvedValue(undefined),
    refreshAiCredits: vi.fn().mockResolvedValue(undefined),
    billingStatus: 'active',
    aiCredits: 100,
    addons: null,
    activeContext: null,
  }),
}));
vi.mock('../../storage/useStorageQuota', () => ({
  default: () => ({ usage: null, refreshQuota: vi.fn() }),
}));
vi.mock('../../settings/services/zaloSettingsApi.service', () => ({
  default: { getChannels: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../../services/help.service', () => ({
  getHelpArticle: vi.fn().mockResolvedValue(null),
}));

const finding = (over = {}) => ({
  kind: 'text_covered', width: 1280, text: '03/02/2026',
  selector: 'span.block.text-lg.font-extrabold:nth-of-type(1)',
  coveredBy: { text: '1', selector: 'div.absolute.-left-11.w-8:nth-of-type(1)' },
  overlapPx: 12, side: 'right', sectionTitle: 'Dòng thời gian', ...over,
});
const CLEAN = { findings: [], timedOut: false, errors: [] };
const BROKEN = { findings: [finding(), finding({ text: '26/04/2026' })], timedOut: false, errors: [] };
const SUMMARY = 'Đã nới cột ngày ở phần Dòng thời gian để năm không bị che';
const httpError = (status, code) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data: { code } } });

const generatedPage = { title: 'Trang khoá học', html: '<div>v0</div>', css: '', messageId: 4242 };

async function openSession(dbMessages) {
  aiApi.getSessions.mockResolvedValue({ data: [{ id: 'sess_1', title: 'Phiên landing' }] });
  aiApi.getSessionMessages.mockResolvedValue({ data: dbMessages });
  render(
    <MemoryRouter>
      <AiChatbot isOpen />
    </MemoryRouter>,
  );
  fireEvent.mouseUp(await screen.findByText('Phiên landing'));
}

const askDetails = [
  { id: 1, role: 'user', content: 'Tạo landing page cho khoá học' },
  {
    id: 2,
    role: 'assistant',
    type: 'ask_landing_details',
    content: 'Bạn muốn phong cách nào?',
    data: { questions: [{ id: 'style', label: 'Phong cách:', options: [{ value: 'modern', label: 'Hiện đại' }] }] },
  },
];

async function submitLandingDetails() {
  await openSession(askDetails);
  fireEvent.click(await screen.findByText('Hiện đại'));
  fireEvent.click(await screen.findByText(/Tạo Landing Page theo lựa chọn này/));
  await screen.findByText('Trang khoá học');
}

describe('AiChatbot — vòng tự kiểm → tự sửa hiển thị landing (PR-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runLayoutAudit.mockReset();
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/preview');
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    aiApi.getBusinessProfile = vi.fn().mockResolvedValue({ data: null });
    api.get.mockResolvedValue({ data: {} });
    api.post.mockResolvedValue({ data: {} });
    aiApi.generateLandingPage.mockResolvedValue({ success: true, data: generatedPage });
  });

  describe('sau khi SINH trang', () => {
    it('lỗi rồi sạch: thẻ mang id = data.messageId, ĐÚNG 1 lượt sửa tự động, đo lại, ✓ + tin "Đã chỉnh hiển thị: …" + Hoàn tác', async () => {
      runLayoutAudit.mockResolvedValueOnce(BROKEN).mockResolvedValue(CLEAN);
      aiApi.editLandingHtml.mockResolvedValue({
        success: true,
        data: { title: 'Trang khoá học', html: '<div>v1</div>', changeSummary: SUMMARY, canRevert: true },
      });

      await submitLandingDetails();

      await screen.findByText(`Đã chỉnh hiển thị: ${SUMMARY}`);
      expect(aiApi.editLandingHtml).toHaveBeenCalledTimes(1);
      const call = aiApi.editLandingHtml.mock.calls[0][0];
      expect(call).toMatchObject({
        autoLayoutFix: true,
        currentHtml: '<div>v0</div>',
        sessionId: 'sess_1',
        messageId: 4242, // id tin từ response sinh → tin landing_page mang id → vòng tự sửa gửi đúng id
        layoutFindings: BROKEN.findings,
      });
      expect(call.instruction).toBeUndefined(); // lệnh do SERVER viết
      expect(runLayoutAudit).toHaveBeenCalledTimes(2); // đo, sửa, ĐO LẠI
      expect(runLayoutAudit.mock.calls[1][0]).toContain('<div>v1</div>');

      expect(await screen.findByText('Đã kiểm tra hiển thị ✓')).toBeInTheDocument();
      expect(screen.getByText('Hoàn tác')).toBeInTheDocument();
      expect(mockToast.error).not.toHaveBeenCalled();
    });

    it('thẻ vừa sinh mang id tin → Hoàn tác sau lượt tự sửa gọi PATCH revert đúng (phiên, id)', async () => {
      runLayoutAudit.mockResolvedValueOnce(BROKEN).mockResolvedValue(CLEAN);
      aiApi.editLandingHtml.mockResolvedValue({
        success: true, data: { title: 'Trang khoá học', html: '<div>v1</div>', changeSummary: SUMMARY, canRevert: true },
      });
      aiApi.revertLandingMessage.mockResolvedValue({ success: true, data: { title: 'Trang khoá học', html: '<div>v0</div>', canRevert: true } });
      await submitLandingDetails();
      fireEvent.click(await screen.findByText('Hoàn tác'));
      await waitFor(() => expect(aiApi.revertLandingMessage).toHaveBeenCalledWith('sess_1', 4242));
    });

    it('trang sạch ngay: ✓, KHÔNG gọi edit, KHÔNG thêm tin nào', async () => {
      runLayoutAudit.mockResolvedValue(CLEAN);
      await submitLandingDetails();
      expect(await screen.findByText('Đã kiểm tra hiển thị ✓')).toBeInTheDocument();
      expect(aiApi.editLandingHtml).not.toHaveBeenCalled();
      expect(screen.queryByText(/Đã chỉnh hiển thị/)).toBeNull();
    });

    it('2 vòng vẫn lỗi: câu tiếng người + nút "Trình bày lại phần này · dùng 1 lượt AI"; KHÔNG vòng 3, KHÔNG ✓', async () => {
      runLayoutAudit.mockResolvedValue(BROKEN);
      let n = 0;
      aiApi.editLandingHtml.mockImplementation(async () => ({
        success: true, data: { title: 'Trang khoá học', html: `<div>v${++n}</div>`, canRevert: true },
      }));
      await submitLandingDetails();

      expect(await screen.findByText('Trình bày lại phần này · dùng 1 lượt AI')).toBeInTheDocument();
      expect(screen.getByText('Còn 2 chỗ chữ bị che ở phần "Dòng thời gian".')).toBeInTheDocument();
      expect(aiApi.editLandingHtml).toHaveBeenCalledTimes(2);
      expect(screen.queryByText('Đã kiểm tra hiển thị ✓')).toBeNull();
      expect(screen.queryByText(/Đã chỉnh hiển thị/)).toBeNull();
      // người dùng không thấy chữ kỹ thuật ở đâu trên thẻ
      expect(document.body.textContent).not.toMatch(/nth-of-type|absolute\.|overlapPx|text-lg/);
    });

    it('chưa kiểm được (timedOut): IM LẶNG — không ✓, không câu lỗi, không nút, KHÔNG gọi edit', async () => {
      runLayoutAudit.mockResolvedValue({ findings: [], timedOut: true, errors: [] });
      await submitLandingDetails();
      await waitFor(() => expect(runLayoutAudit).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByText('Đang kiểm tra hiển thị…')).toBeNull());
      for (const text of ['Đã kiểm tra hiển thị ✓', /Trình bày lại/, /Còn \d+ chỗ/]) expect(screen.queryByText(text)).toBeNull();
      expect(aiApi.editLandingHtml).not.toHaveBeenCalled();
      expect(mockToast.error).not.toHaveBeenCalled();
    });

    it('script đo báo scan_incomplete: cũng IM LẶNG, không ✓', async () => {
      runLayoutAudit.mockResolvedValue({ findings: [], timedOut: false, errors: ['scan_incomplete'] });
      await submitLandingDetails();
      await waitFor(() => expect(screen.queryByText('Đang kiểm tra hiển thị…')).toBeNull());
      expect(screen.queryByText('Đã kiểm tra hiển thị ✓')).toBeNull();
      expect(aiApi.editLandingHtml).not.toHaveBeenCalled();
    });

    it.each([
      ['429 AUTO_LAYOUT_FIX_LIMIT', httpError(429, 'AUTO_LAYOUT_FIX_LIMIT')],
      ['404 LANDING_MESSAGE_NOT_FOUND', httpError(404, 'LANDING_MESSAGE_NOT_FOUND')],
      ['lỗi mạng', new Error('Network Error')],
    ])('lượt tự sửa lỗi %s: IM LẶNG — không toast, không tin lỗi trong chat', async (_label, error) => {
      runLayoutAudit.mockResolvedValue(BROKEN);
      aiApi.editLandingHtml.mockRejectedValue(error);
      await submitLandingDetails();

      expect(await screen.findByText('Trình bày lại phần này · dùng 1 lượt AI')).toBeInTheDocument();
      expect(aiApi.editLandingHtml).toHaveBeenCalledTimes(1);
      expect(mockToast.error).not.toHaveBeenCalled();
      expect(document.body.textContent).not.toMatch(/Có lỗi khi chỉnh sửa|AUTO_LAYOUT_FIX_LIMIT|HTTP 4/);
    });
  });

  describe('người dùng gõ yêu cầu sửa (thẻ đã có id sau khi tải lại phiên)', () => {
    const landingDb = [
      { id: 10, role: 'user', content: 'Tạo landing page' },
      { id: 77, role: 'assistant', type: 'landing_page', content: 'Đã tạo', data: { title: 'Trang cũ', html: '<div>Trang gốc</div>' } },
    ];
    const typeAndSend = async (text) => {
      const textarea = await screen.findByPlaceholderText('Nhập yêu cầu...');
      fireEvent.change(textarea, { target: { value: text } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    };

    it('thẻ tải lại từ phiên mang id của tin → lượt sửa gửi đúng messageId (mapper không còn vứt id)', async () => {
      runLayoutAudit.mockResolvedValue(CLEAN);
      aiApi.editLandingHtml.mockResolvedValue({ success: true, data: { title: 'Trang cũ', html: '<div>Mới</div>' } });
      await openSession(landingDb);
      await screen.findByText('Trang cũ');
      await typeAndSend('Đổi màu nền header sang màu cam');
      await waitFor(() => expect(aiApi.editLandingHtml).toHaveBeenCalledTimes(1));
      expect(aiApi.editLandingHtml.mock.calls[0][0].messageId).toBe(77);
    });

    it('câu than phiền lỗi hiển thị → ĐO trước, nối kết quả vào instruction GỬI ĐI; tin hiển thị vẫn là câu người dùng gõ', async () => {
      runLayoutAudit.mockResolvedValueOnce(BROKEN).mockResolvedValue(CLEAN);
      aiApi.editLandingHtml.mockResolvedValue({ success: true, data: { title: 'Trang cũ', html: '<div>Mới</div>' } });
      await openSession(landingDb);
      await screen.findByText('Trang cũ');
      await typeAndSend('chữ ở dòng thời gian bị đè lên nhau');

      await waitFor(() => expect(aiApi.editLandingHtml).toHaveBeenCalledTimes(1));
      const { instruction, autoLayoutFix } = aiApi.editLandingHtml.mock.calls[0][0];
      expect(autoLayoutFix).toBeUndefined(); // đây là lượt sửa THƯỜNG (có credit), không phải tự sửa
      expect(instruction.startsWith('chữ ở dòng thời gian bị đè lên nhau')).toBe(true);
      expect(instruction).toContain('[Đo bố cục ở 1280px] Chữ "03/02/2026"');
      expect(instruction).toContain('span.block.text-lg.font-extrabold:nth-of-type(1)');
      // người dùng chỉ thấy đúng câu mình gõ
      expect(await screen.findByText('chữ ở dòng thời gian bị đè lên nhau')).toBeInTheDocument();
      expect(screen.queryByText(/\[Đo bố cục/)).toBeNull();
    });

    it('câu sửa thường (không than phiền, không ảnh) → KHÔNG đo trước, instruction giữ nguyên', async () => {
      runLayoutAudit.mockResolvedValue(CLEAN);
      aiApi.editLandingHtml.mockResolvedValue({ success: true, data: { title: 'Trang cũ', html: '<div>Mới</div>' } });
      await openSession(landingDb);
      await screen.findByText('Trang cũ');
      await typeAndSend('Đổi tiêu đề thành Xin chào');
      await waitFor(() => expect(aiApi.editLandingHtml).toHaveBeenCalledTimes(1));
      expect(aiApi.editLandingHtml.mock.calls[0][0].instruction).toBe('Đổi tiêu đề thành Xin chào');
      // chỉ có lần đo SAU khi sửa xong (kiểm tra hiển thị của trang mới), không có lần đo trước khi gửi
      await waitFor(() => expect(runLayoutAudit).toHaveBeenCalledTimes(1));
      expect(runLayoutAudit.mock.calls[0][0]).toContain('<div>Mới</div>');
    });

    it('than phiền nhưng CHƯA đo được → gửi như cũ, không nối gì', async () => {
      runLayoutAudit.mockResolvedValueOnce({ findings: [finding()], timedOut: true, errors: [] }).mockResolvedValue(CLEAN);
      aiApi.editLandingHtml.mockResolvedValue({ success: true, data: { title: 'Trang cũ', html: '<div>Mới</div>' } });
      await openSession(landingDb);
      await screen.findByText('Trang cũ');
      await typeAndSend('chữ bị che mất');
      await waitFor(() => expect(aiApi.editLandingHtml).toHaveBeenCalledTimes(1));
      expect(aiApi.editLandingHtml.mock.calls[0][0].instruction).toBe('chữ bị che mất');
    });

    it('câu xác nhận dùng changeSummary: "Đã sửa: …" (không còn câu dài lặp lại yêu cầu)', async () => {
      runLayoutAudit.mockResolvedValue(CLEAN);
      aiApi.editLandingHtml.mockResolvedValue({
        success: true, data: { title: 'Trang cũ', html: '<div>Mới</div>', changeSummary: SUMMARY, canRevert: true },
      });
      await openSession(landingDb);
      await screen.findByText('Trang cũ');
      await typeAndSend('Đổi tiêu đề thành Xin chào');
      expect(await screen.findByText(`Đã sửa: ${SUMMARY}`)).toBeInTheDocument();
      expect(screen.queryByText(/Mình đã cập nhật landing page/)).toBeNull();
      // server báo có bản trước → có nút Hoàn tác
      expect(await screen.findByText('Hoàn tác')).toBeInTheDocument();
    });

    it('không có changeSummary → giữ câu xác nhận cũ', async () => {
      runLayoutAudit.mockResolvedValue(CLEAN);
      aiApi.editLandingHtml.mockResolvedValue({ success: true, data: { title: 'Trang cũ', html: '<div>Mới</div>' } });
      await openSession(landingDb);
      await screen.findByText('Trang cũ');
      await typeAndSend('Đổi tiêu đề thành Xin chào');
      expect(await screen.findByText(/Mình đã cập nhật landing page "Trang cũ" theo yêu cầu: "Đổi tiêu đề thành Xin chào"/)).toBeInTheDocument();
    });
  });

  describe('Hoàn tác', () => {
    const withPrevious = [
      { id: 10, role: 'user', content: 'Tạo landing page' },
      {
        id: 77, role: 'assistant', type: 'landing_page', content: 'Đã tạo',
        data: { title: 'Trang sau sửa', html: '<div>SAU</div>', previousHtml: '<div>TRƯỚC</div>', previousTitle: 'Trang trước sửa' },
      },
    ];

    it('bấm Hoàn tác → PATCH revert đúng phiên + đúng tin; thẻ về bản trước, toast "Đã quay lại bản trước", nút biến mất', async () => {
      aiApi.revertLandingMessage.mockResolvedValue({ success: true, data: { title: 'Trang trước sửa', html: '<div>TRƯỚC</div>', canRevert: true } });
      await openSession(withPrevious);
      fireEvent.click(await screen.findByText('Hoàn tác'));

      await waitFor(() => expect(aiApi.revertLandingMessage).toHaveBeenCalledWith('sess_1', 77));
      expect(await screen.findByText('Trang trước sửa')).toBeInTheDocument();
      expect(screen.queryByText('Trang sau sửa')).toBeNull();
      expect(mockToast.success).toHaveBeenCalledWith('Đã quay lại bản trước');
      await waitFor(() => expect(screen.queryByText('Hoàn tác')).toBeNull());
      expect(aiApi.editLandingHtml).not.toHaveBeenCalled(); // hoàn tác không tự sửa lại
    });

    it('409 NOTHING_TO_REVERT → ẩn nút, IM LẶNG (không toast lỗi)', async () => {
      aiApi.revertLandingMessage.mockRejectedValue(httpError(409, 'NOTHING_TO_REVERT'));
      await openSession(withPrevious);
      fireEvent.click(await screen.findByText('Hoàn tác'));
      await waitFor(() => expect(screen.queryByText('Hoàn tác')).toBeNull());
      expect(mockToast.error).not.toHaveBeenCalled();
      expect(screen.getByText('Trang sau sửa')).toBeInTheDocument(); // thẻ giữ nguyên
    });

    it('lỗi khác (mạng) → có toast lỗi vì đây là việc người dùng bấm; nút vẫn còn để thử lại', async () => {
      aiApi.revertLandingMessage.mockRejectedValue(new Error('Network Error'));
      await openSession(withPrevious);
      fireEvent.click(await screen.findByText('Hoàn tác'));
      await waitFor(() => expect(mockToast.error).toHaveBeenCalledTimes(1));
      expect(screen.getByText('Hoàn tác')).toBeInTheDocument();
    });
  });
});
