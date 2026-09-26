import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import ResourceLocksTab from './ResourceLocksTab';

const mockGetTopupLocks = vi.fn();
const mockPutTopupLocks = vi.fn();

vi.mock('../../services/topup.service', () => ({
  getTopupLocks: (...args) => mockGetTopupLocks(...args),
  putTopupLocks: (...args) => mockPutTopupLocks(...args),
}));

// "Nợ nhỏ" 26/09 — trước đây Number(null)||0 = 0 khoá nhầm ô chọn cho tài nguyên KHÔNG giới hạn.
// t() giả có nội suy {param} tối thiểu, đủ cho 2 khoá đang kiểm (ceiling / ceilingUnlimited).
const TEMPLATES = {
  'resourceLocks.help': 'help',
  'resourceLocks.empty': 'empty',
  'resourceLocks.chatbots': 'Chatbot',
  'resourceLocks.ceiling': 'Đang giữ {keep}/{max} (gồm {grants} slot mua thêm còn hạn)',
  'resourceLocks.ceilingUnlimited': 'Đang giữ {keep} (không giới hạn)',
  'resourceLocks.locked': 'Đã khoá',
  'resourceLocks.aboutToLock': 'Sắp bị khoá',
  'resourceLocks.save': 'Lưu lựa chọn',
  'common.loading': 'Đang tải...',
  'common.saving': 'Đang lưu...',
};

function t(key, params) {
  let str = TEMPLATES[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(`{${k}}`, v);
    }
  }
  return str;
}

function buildOverview({ effectiveCeiling }) {
  return {
    chatbots: {
      items: [
        { id: 1, label: 'Chatbot A', isLocked: false },
        { id: 2, label: 'Chatbot B', isLocked: false },
      ],
      effectiveCeiling,
      planCeiling: effectiveCeiling,
      activeGrants: 0,
    },
    isGraceActive: false,
    overageGraceUntil: null,
  };
}

describe('ResourceLocksTab — effectiveCeiling null nghĩa là KHÔNG giới hạn', () => {
  beforeEach(() => {
    mockGetTopupLocks.mockReset();
    mockPutTopupLocks.mockReset();
  });

  it('effectiveCeiling: null → hiện "không giới hạn", KHÔNG khoá ô chọn còn lại', async () => {
    mockGetTopupLocks.mockResolvedValue({ data: { result: buildOverview({ effectiveCeiling: null }) } });

    render(<ResourceLocksTab t={t} />);

    await waitFor(() => {
      expect(screen.getByText('Đang giữ 2 (không giới hạn)')).toBeInTheDocument();
    });

    // Cả 2 chatbot đều "đang giữ" (isLocked:false → nằm sẵn trong draftKeep) — checkbox vẫn phải
    // bấm được (không disabled) dù đã giữ đủ 2, vì trần là không giới hạn.
    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach((cb) => expect(cb).not.toBeDisabled());
  });

  it('effectiveCeiling: 2 (bình thường) → hiện đúng số, khoá ô chọn khi đã giữ đủ trần', async () => {
    mockGetTopupLocks.mockResolvedValue({
      data: {
        result: {
          chatbots: {
            items: [
              { id: 1, label: 'Chatbot A', isLocked: false },
              { id: 2, label: 'Chatbot B', isLocked: false },
              { id: 3, label: 'Chatbot C', isLocked: true },
            ],
            effectiveCeiling: 2,
            planCeiling: 2,
            activeGrants: 0,
          },
          isGraceActive: false,
          overageGraceUntil: null,
        },
      },
    });

    render(<ResourceLocksTab t={t} />);

    await waitFor(() => {
      expect(screen.getByText('Đang giữ 2/2 (gồm 0 slot mua thêm còn hạn)')).toBeInTheDocument();
    });

    // Chatbot C đã bị khoá từ trước (isLocked:true, không nằm trong draftKeep ban đầu) — checkbox
    // của nó phải bị disabled vì đã giữ đủ 2/2.
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[2]).toBeDisabled();
  });
});
