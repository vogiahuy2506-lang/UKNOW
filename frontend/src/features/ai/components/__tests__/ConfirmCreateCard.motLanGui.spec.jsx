import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmCreateCard } from '../AiChatbotCards';
import viDict from '../../../../i18n/vi';
import enDict from '../../../../i18n/en';

/** Helper translate dùng trực tiếp dictionary để kiểm tra bản dịch thật */
const makeI18n = (dict) => (key) => {
  const parts = key.split('.');
  let current = dict;
  for (const part of parts) {
    current = current?.[part];
  }
  return current !== undefined ? current : key;
};

const createMockConfirmationView = ({
  mode = 'manual',
  channel = 'email',
  recipientType = 'phone',
  stepCount = 1,
  timing = { anchor: 'start', value: 0 },
} = {}) => {
  const steps = [];
  for (let i = 0; i < stepCount; i++) {
    steps.push({
      key: `node-${i + 1}:0`,
      nodeId: `node-${i + 1}`,
      stepIndex: 0,
      channel,
      title: channel === 'email' ? 'Gửi Email' : 'Gửi Zalo',
      timing,
      sender: { id: 1, label: channel === 'email' ? 'sender@uknow.vn' : 'Tài khoản Zalo' },
      recipients: mode ? { mode, type: recipientType, count: 1, sourceLabel: mode === 'manual' ? null : 'Lead từ Landing Page' } : undefined,
      content: {
        subject: 'Tiêu đề thư',
        bodyText: 'Nội dung thư',
        attachments: [],
      },
    });
  }

  return {
    campaign: { name: 'Chiến dịch gửi 1 lần', description: 'Mô tả' },
    readyToCreate: true,
    totals: { sendSteps: stepCount },
    blockingIssues: [],
    steps,
  };
};

const renderCard = (props = {}) => {
  const onConfirmAndRun = vi.fn();
  const utils = render(
    <ConfirmCreateCard
      confirmationView={props.confirmationView}
      onConfirm={vi.fn()}
      onConfirmAndRun={props.noRunHandler ? undefined : onConfirmAndRun}
      // Truyền thừa onQuickSend như caller CŨ: thẻ phải lờ nó đi (ca đột biến để lại nút Gửi nhanh → đỏ).
      onQuickSend={vi.fn()}
      showCreateAndRun={props.showCreateAndRun}
      canCreateCampaign={props.canCreateCampaign}
      canRunCampaign={props.canRunCampaign}
      onEdit={vi.fn()}
      onCancel={vi.fn()}
      t={makeI18n(props.dict || viDict)}
      locale={props.locale || 'vi'}
    />
  );
  return { ...utils, onConfirmAndRun };
};

const runBtn = () => screen.queryByRole('button', { name: /tạo và chạy|create and run/i });
const quickSendBtn = () => screen.queryByRole('button', { name: /gửi nhanh|quick send/i });

// 23/10/2026 — chỉ còn MỘT nút gửi: nút "Gửi nhanh (1 lần)" của thẻ đã bỏ; bản nháp gửi một lần
// (1 bước, người nhận nhập tay, gửi ngay) tự có nút "Tạo và chạy" dù backend không bật `showCreateAndRun`.
describe('ConfirmCreateCard - bản nháp gửi một lần có nút "Tạo và chạy", không còn "Gửi nhanh"', () => {
  it('email + người nhận nhập tay + gửi ngay -> CÓ "Tạo và chạy" (không cần showCreateAndRun), KHÔNG có "Gửi nhanh"', () => {
    const { onConfirmAndRun } = renderCard({ confirmationView: createMockConfirmationView({ mode: 'manual' }) });
    expect(quickSendBtn()).toBeNull();
    const btn = runBtn();
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onConfirmAndRun).toHaveBeenCalledTimes(1);
  });

  it('bản tiếng Anh cũng có nút Create and run, không có Quick Send', () => {
    renderCard({ confirmationView: createMockConfirmationView({ mode: 'manual' }), dict: enDict, locale: 'en' });
    expect(quickSendBtn()).toBeNull();
    expect(runBtn()).toBeInTheDocument();
  });

  it('zalo_personal + manual + phone -> có "Tạo và chạy"', () => {
    renderCard({ confirmationView: createMockConfirmationView({ channel: 'zalo_personal', mode: 'manual', recipientType: 'phone' }) });
    expect(runBtn()).toBeInTheDocument();
  });

  it('zalo_personal + manual + uid -> có "Tạo và chạy"', () => {
    renderCard({ confirmationView: createMockConfirmationView({ channel: 'zalo_personal', mode: 'manual', recipientType: 'uid' }) });
    expect(runBtn()).toBeInTheDocument();
  });

  it('zalo_personal + manual + type lạ -> KHÔNG có "Tạo và chạy" (fail-closed)', () => {
    renderCard({ confirmationView: createMockConfirmationView({ channel: 'zalo_personal', mode: 'manual', recipientType: 'foo' }) });
    expect(runBtn()).toBeNull();
  });

  it('zalo_group + manual (recipients.type = null) -> có "Tạo và chạy"', () => {
    renderCard({ confirmationView: createMockConfirmationView({ channel: 'zalo_group', mode: 'manual', recipientType: null }) });
    expect(runBtn()).toBeInTheDocument();
  });

  it('người nhận từ nguồn (DB / Sheet / Landing) -> KHÔNG tự bật "Tạo và chạy"', () => {
    renderCard({ confirmationView: createMockConfirmationView({ mode: 'source' }) });
    expect(runBtn()).toBeNull();
  });

  it('thiếu recipients.mode -> KHÔNG có "Tạo và chạy" (fail-closed)', () => {
    renderCard({ confirmationView: createMockConfirmationView({ mode: null }) });
    expect(runBtn()).toBeNull();
  });

  it('nhiều bước gửi, hoặc hẹn giờ -> KHÔNG tự bật "Tạo và chạy"', () => {
    const multi = renderCard({ confirmationView: createMockConfirmationView({ mode: 'manual', stepCount: 2 }) });
    expect(runBtn()).toBeNull();
    multi.unmount();
    renderCard({ confirmationView: createMockConfirmationView({ mode: 'manual', timing: { anchor: 'start', value: 2, unit: 'day' } }) });
    expect(runBtn()).toBeNull();
  });

  it('showCreateAndRun={true} (người dùng gõ rõ "tạo và chạy") -> có nút kể cả khi người nhận từ nguồn', () => {
    renderCard({ confirmationView: createMockConfirmationView({ mode: 'source' }), showCreateAndRun: true });
    expect(runBtn()).toBeInTheDocument();
  });

  it('không có handler onConfirmAndRun -> không vẽ nút', () => {
    renderCard({ confirmationView: createMockConfirmationView({ mode: 'manual' }), noRunHandler: true });
    expect(runBtn()).toBeNull();
  });
});

// Nhân viên thiếu quyền: ẩn nút, hiện lời giải thích.
describe('ConfirmCreateCard - Permission gating (canCreateCampaign / canRunCampaign)', () => {
  it('canCreateCampaign={false} -> không có nút tạo, không có nút Tạo và chạy, có dòng giải thích', () => {
    renderCard({ confirmationView: createMockConfirmationView({ mode: 'manual' }), canCreateCampaign: false });
    expect(screen.queryByRole('button', { name: /tạo chiến dịch/i })).toBeNull();
    expect(runBtn()).toBeNull();
    expect(screen.getByText(viDict.aiChatbot.noPermissionCreateCampaign)).toBeInTheDocument();
  });

  it('canCreateCampaign đúng nhưng canRunCampaign={false} -> có nút tạo, không có "Tạo và chạy"', () => {
    renderCard({ confirmationView: createMockConfirmationView({ mode: 'manual' }), canCreateCampaign: true, canRunCampaign: false });
    expect(screen.getByRole('button', { name: /tạo chiến dịch/i })).toBeInTheDocument();
    expect(runBtn()).toBeNull();
  });
});

describe('ConfirmCreateCard - Blocking Issues & Exact Error Messages', () => {
  const issueCodes = [
    {
      code: 'manual_recipients_required',
      expectedVi: 'Chưa có người nhận. Bạn hãy nhập số điện thoại hoặc email trước khi tạo.',
      expectedEn: 'No recipients provided. Please enter phone numbers or emails before creating.',
    },
    {
      code: 'missing_sender',
      expectedVi: 'Chưa chọn tài khoản gửi cho bước này.',
      expectedEn: 'No sender account selected for this step.',
    },
    {
      code: 'missing_message_content',
      expectedVi: 'Bước gửi chưa có nội dung tin nhắn.',
      expectedEn: 'This send step is missing message content.',
    },
    {
      code: 'invalid_template_step',
      expectedVi: 'Mẫu tin của bước gửi không hợp lệ.',
      expectedEn: 'Invalid template configured for this step.',
    },
    {
      code: 'template_not_found',
      expectedVi: 'Không tìm thấy mẫu tin đã chọn.',
      expectedEn: 'Selected template could not be found.',
    },
    {
      code: 'no_send_steps',
      expectedVi: 'Chiến dịch chưa có bước gửi tin nào.',
      expectedEn: 'Campaign does not have any send steps.',
    },
  ];

  for (const { code, expectedVi, expectedEn } of issueCodes) {
    it(`Hiển thị đúng thông điệp lỗi cho mã "${code}" (VI & EN)`, () => {
      // Fixture mô phỏng đúng cấu trúc thật do campaignConfirmation.service.js:100 sinh ra
      const mockIssue = {
        code,
        nodeId: 'node-1',
        stepIndex: 0,
        messageKey: `aiChatbot.confirmation.${code}`,
      };

      const confirmationView = {
        ...createMockConfirmationView(),
        readyToCreate: false,
        blockingIssues: [mockIssue],
      };

      // Test tiếng Việt
      const { unmount } = render(
        <ConfirmCreateCard
          confirmationView={confirmationView}
          onConfirm={vi.fn()}
          onEdit={vi.fn()}
          onCancel={vi.fn()}
          t={makeI18n(viDict)}
          locale="vi"
        />
      );

      expect(screen.getByText(expectedVi)).toBeInTheDocument();
      // Đảm bảo không in câu cứng chung chung khi có mã lỗi cụ thể
      if (code === 'manual_recipients_required') {
        expect(screen.queryByText(/nội dung, mẫu tin hoặc tài khoản/i)).toBeNull();
      }
      unmount();

      // Test tiếng Anh
      render(
        <ConfirmCreateCard
          confirmationView={confirmationView}
          onConfirm={vi.fn()}
          onEdit={vi.fn()}
          onCancel={vi.fn()}
          t={makeI18n(enDict)}
          locale="en"
        />
      );

      expect(screen.getByText(expectedEn)).toBeInTheDocument();
    });
  }

  it('Dùng câu fallback chung khi gặp mã issue lạ không có bản dịch', () => {
    const unknownIssue = {
      code: 'unknown_future_issue',
      nodeId: 'node-1',
      stepIndex: 0,
      messageKey: 'aiChatbot.confirmation.unknown_future_issue',
    };

    const confirmationView = {
      ...createMockConfirmationView(),
      readyToCreate: false,
      blockingIssues: [unknownIssue],
    };

    render(
      <ConfirmCreateCard
        confirmationView={confirmationView}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
        onCancel={vi.fn()}
        t={makeI18n(viDict)}
        locale="vi"
      />
    );

    expect(screen.getByText('Một bước gửi chưa đủ nội dung, mẫu tin hoặc tài khoản gửi.')).toBeInTheDocument();
  });
});
