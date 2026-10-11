import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import toast from 'react-hot-toast';
import { CustomerDetailModal, JourneyModal } from '../CampaignCustomerModals';
import customerApiService from '../../services/customerApi.service';

/**
 * Chụp-trước/sau cho việc TÁCH `CampaignCustomerModals.jsx` (PR-C3 việc 6): spec này được ghi lần đầu trên
 * file nguyên khối, rồi chạy lại KHÔNG SỬA sau khi tách. Snapshot (`__snapshots__`) phải trùng từng ký tự —
 * tách file chỉ được đổi chỗ ở, không đổi hành vi hay DOM.
 *
 * `t` trả lại khoá (kèm tham số) để snapshot không phụ thuộc câu chữ trong vi.js.
 */
// `t` PHẢI ổn định giữa các lần render: CustomerDetailModal đặt `t` trong deps của useEffect tải dữ liệu.
const mockT = vi.hoisted(() => (key, params) => (params ? `${key}${JSON.stringify(params)}` : key));
const mockCtx = vi.hoisted(() => ({ t: null }));
// `useI18n('ns')` trả thẳng hàm t đã gắn tiền tố; `useI18n()` trả { t }.
vi.mock('../../../../i18n', () => ({
  useI18n: (ns) => (ns ? (key) => `${ns}.${key}` : mockCtx),
}));
mockCtx.t = mockT;

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../services/customerApi.service', () => ({
  default: {
    getCustomerCampaignJourney: vi.fn(),
    getAttachmentPresignedDownload: vi.fn(),
    getAttachmentPresignedByKey: vi.fn(),
  },
}));

const customer = {
  id: 77,
  fullName: 'Nguyễn Văn A',
  email: 'a@example.com',
  phone: '0912345678',
  createdAt: '2026-10-01T03:00:00.000Z',
  orderStatus: 'on-hold',
  consentSource: 'import',
};

const emailBody = [
  '<p>Xin chào</p>',
  '<img src="https://x.test/api/customers/email-tracking/open/tok1" />',
  '<a href="https://x.test/api/customers/email-tracking/click/tok2?url=https%3A%2F%2Fshop.test%2Fkhoa-hoc">Mua ngay</a>',
].join('');

const journeyPayload = {
  purchases: [
    {
      id: 1, courseName: 'Khoá A &amp; B', courseCode: 'KA', orderId: 9001, itemStatus: 'interested',
      statuses: ['Quan tâm'], purchaseDate: '2026-10-02T04:00:00.000Z', idEmailMessage: 11, attributedFromClick: true,
    },
    {
      id: 2, productName: 'Sản phẩm B', courseCode: 'KB', orderId: 9002, itemStatus: 'completed',
      statuses: ['Đã mua'], purchaseDate: '2026-10-03T04:00:00.000Z', idZaloMessage: 21,
    },
  ],
  emails: [
    {
      emailMessageId: 11, emailIndex: 1, subject: 'Ưu đãi &amp; quà', emailTemplateName: 'Mẫu 1',
      sentAt: '2026-10-02T01:00:00.000Z', firstOpenedAt: '2026-10-02T02:00:00.000Z', firstClickedAt: '2026-10-02T03:00:00.000Z',
      runId: 5, runName: 'Đợt 1', senderName: 'Shop', senderEmail: 's@shop.test',
      recipientName: 'Nguyễn Văn A', recipientEmail: 'a@example.com', bodyHtml: emailBody,
      emailJourney: {
        sent: true, sentAt: '2026-10-02T01:00:00.000Z', opened: true, openedAt: '2026-10-02T02:00:00.000Z',
        clicked: true, clickedAt: '2026-10-02T03:00:00.000Z',
        clickedLinks: [{ linkKey: 'l1', label: 'Mua ngay', targetUrl: 'https://shop.test/khoa-hoc', clickedAt: '2026-10-02T03:00:00.000Z' }],
        attachmentDownloaded: false, attachmentName: 'bang-gia.pdf', attachmentFileId: 5,
      },
    },
    {
      emailMessageId: 12, emailIndex: 2, subject: 'Email không nội dung', sentAt: '2026-10-04T01:00:00.000Z',
      runId: 6, runName: null,
    },
  ],
  zaloMessages: [
    {
      id: 21, channel: 'zalo_personal', recipientValue: '0912345678', sentAt: '2026-10-03T01:00:00.000Z',
      messageText: 'Chào bạn, xem khoá học nhé', runId: 5, runName: 'Đợt 1', clickCount: 1,
      attachments: [{ displayName: 'brochure.pdf' }],
    },
    {
      id: 22, channel: 'zalo_group', groupId: 'g1', groupName: 'Nhóm VIP', sentAt: '2026-10-03T02:00:00.000Z',
      messageText: 'Thông báo nhóm', runId: 5, clickCount: 0,
    },
  ],
  journey: [
    { id: 100, eventType: 'order_pending', idEmailMessage: 11, eventAt: '2026-10-02T05:00:00.000Z', eventData: { order_id: 9001, order_number: 'A9001', total: 500000, currency: 'VND', products: [{ product_name: 'Khoá A', product_id: 7, quantity: 1, total: 500000 }] } },
    { id: 101, eventType: 'order_completed', idZaloMessage: 21, eventAt: '2026-10-03T05:00:00.000Z', eventData: { order_id: 9002, order_number: 'B9002', total: 100000, currency: 'VND', products: [] } },
    { id: 102, eventType: 'zalo_clicked', idZaloMessage: 21, eventAt: '2026-10-03T03:00:00.000Z', eventData: { targetUrl: 'https://shop.test/zalo', linkKey: 'zl1' } },
  ],
  runs: [
    { runId: 5, runName: 'Đợt 1', startedAt: '2026-10-02T00:00:00.000Z' },
    { runId: 6, runName: 'Đợt 2', startedAt: '2026-10-04T00:00:00.000Z' },
  ],
};

const bodySnapshot = () => document.body.innerHTML;

describe('CampaignCustomerModals — chụp hành vi trước/sau khi tách file', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    customerApiService.getCustomerCampaignJourney.mockResolvedValue({ data: { data: journeyPayload } });
  });

  describe('CustomerDetailModal', () => {
    it('đóng (isOpen=false) → không render gì và không gọi API', () => {
      render(<CustomerDetailModal customer={customer} campaignId={3} isOpen={false} onClose={() => {}} />);
      expect(document.body.querySelector('[role="dialog"]')).toBeNull();
      expect(customerApiService.getCustomerCampaignJourney).not.toHaveBeenCalled();
    });

    it('mở → gọi API đúng (customer.id, campaignId) và vẽ danh sách khoá học', async () => {
      render(<CustomerDetailModal customer={customer} campaignId={3} isOpen onClose={() => {}} />);
      await screen.findByText('Khoá A & B');
      expect(customerApiService.getCustomerCampaignJourney).toHaveBeenCalledWith(77, 3);
      expect(bodySnapshot()).toMatchSnapshot('detail-1-danh-sach');
    });

    it('mở rộng khoá có email → xem nội dung email (iframe đã gỡ pixel + link theo dõi) và hành trình 4 trạng thái', async () => {
      render(<CustomerDetailModal customer={customer} campaignId={3} isOpen onClose={() => {}} />);
      fireEvent.click(await screen.findByText('Khoá A & B'));
      expect(bodySnapshot()).toMatchSnapshot('detail-2-mo-rong-email');
      fireEvent.click(screen.getByText('campaignCustomerModals.viewEmailContent'));
      const iframe = document.body.querySelector('iframe');
      expect(iframe).toBeTruthy();
      expect(iframe.getAttribute('srcdoc')).not.toContain('email-tracking/open');
      expect(iframe.getAttribute('srcdoc')).toContain('href="https://shop.test/khoa-hoc"');
      expect(bodySnapshot()).toMatchSnapshot('detail-3-noi-dung-email');
      fireEvent.click(screen.getByText('campaignCustomerModals.hideEmailContent'));
      expect(document.body.querySelector('iframe')).toBeNull();
    });

    it('mở rộng khoá có tin Zalo → xem nội dung Zalo', async () => {
      render(<CustomerDetailModal customer={customer} campaignId={3} isOpen onClose={() => {}} />);
      fireEvent.click(await screen.findByText('Sản phẩm B'));
      expect(bodySnapshot()).toMatchSnapshot('detail-4-mo-rong-zalo');
      fireEvent.click(screen.getByText('campaignCustomerModals.viewZaloContent'));
      expect(screen.getAllByText('Chào bạn, xem khoá học nhé').length).toBeGreaterThan(0);
      expect(bodySnapshot()).toMatchSnapshot('detail-5-noi-dung-zalo');
    });

    it('nút đóng và phím Escape gọi onClose; khoá cuộn body khi mở', async () => {
      const onClose = vi.fn();
      const { unmount } = render(<CustomerDetailModal customer={customer} campaignId={3} isOpen onClose={onClose} />);
      await screen.findByText('Khoá A & B');
      expect(document.body.style.overflow).toBe('hidden');
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByLabelText('common.close'));
      expect(onClose).toHaveBeenCalledTimes(2);
      unmount();
      expect(document.body.style.overflow).toBe('');
    });

    it('API lỗi → toast báo lỗi, danh sách rỗng', async () => {
      customerApiService.getCustomerCampaignJourney.mockRejectedValue(new Error('boom'));
      render(<CustomerDetailModal customer={customer} campaignId={3} isOpen onClose={() => {}} />);
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('campaignCustomerModals.cantLoadCourseData'));
      expect(bodySnapshot()).toMatchSnapshot('detail-6-loi');
    });
  });

  describe('JourneyModal', () => {
    it('nhóm theo đợt chạy: email + Zalo cá nhân + Zalo nhóm', async () => {
      render(<JourneyModal customer={customer} campaignId={3} isOpen onClose={() => {}} />);
      await screen.findByText('Ưu đãi & quà');
      expect(customerApiService.getCustomerCampaignJourney).toHaveBeenCalledWith(77, 3);
      expect(bodySnapshot()).toMatchSnapshot('journey-1-nhom-theo-dot');
    });

    it('mở email → hành trình + nút xem nội dung (chỉ khi có nội dung)', async () => {
      render(<JourneyModal customer={customer} campaignId={3} isOpen onClose={() => {}} />);
      fireEvent.click(await screen.findByText('Ưu đãi & quà'));
      expect(bodySnapshot()).toMatchSnapshot('journey-2-mo-email');
      fireEvent.click(screen.getByText('campaignCustomerModals.viewEmailContent'));
      expect(document.body.querySelector('iframe')).toBeTruthy();
      expect(bodySnapshot()).toMatchSnapshot('journey-3-noi-dung-email');
      // chỉ mở được MỘT email một lúc; email không có nội dung thì không có nút xem
      fireEvent.click(screen.getByText('Email không nội dung'));
      expect(screen.queryAllByText('campaignCustomerModals.viewEmailContent').length).toBe(0);
    });

    it('tin Zalo cá nhân: xem nội dung kèm tệp đính kèm', async () => {
      render(<JourneyModal customer={customer} campaignId={3} isOpen onClose={() => {}} />);
      await screen.findByText('Ưu đãi & quà');
      fireEvent.click(screen.getByText('campaignCustomerModals.viewZaloContent'));
      expect(screen.getByText('Chào bạn, xem khoá học nhé')).toBeTruthy();
      expect(bodySnapshot()).toMatchSnapshot('journey-4-noi-dung-zalo');
    });

    it('khách chưa có email/Zalo trong chiến dịch → trạng thái rỗng', async () => {
      customerApiService.getCustomerCampaignJourney.mockResolvedValue({ data: { data: { emails: [], zaloMessages: [], journey: [], runs: [] } } });
      render(<JourneyModal customer={customer} campaignId={3} isOpen onClose={() => {}} />);
      await screen.findByText('campaignCustomerModals.noEmailsInCampaign');
      expect(bodySnapshot()).toMatchSnapshot('journey-5-rong');
    });

    it('API lỗi → toast báo lỗi hành trình', async () => {
      customerApiService.getCustomerCampaignJourney.mockRejectedValue(new Error('boom'));
      render(<JourneyModal customer={customer} campaignId={3} isOpen onClose={() => {}} />);
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('campaignCustomerModals.cantLoadJourney'));
    });

    it('đóng (isOpen=false) → không gọi API', async () => {
      await act(async () => {
        render(<JourneyModal customer={customer} campaignId={3} isOpen={false} onClose={() => {}} />);
      });
      expect(customerApiService.getCustomerCampaignJourney).not.toHaveBeenCalled();
    });
  });
});
