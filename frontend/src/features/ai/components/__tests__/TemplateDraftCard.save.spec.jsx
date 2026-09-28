/**
 * PR-3 (LENH_GIAO_TRO_LY_AI_PR3_2026-09-28) Việc 2d — nhân viên thiếu quyền email_templates/
 * zalo_templates: ẩn nút "Lưu vào thư viện", hiện lời giải thích; nút "Chỉnh sửa" vẫn giữ.
 * Khuôn theo LandingPageCard.save.spec.jsx:84-87 ("!canSave → không hiện nút").
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TemplateDraftCard } from '../AiChatbotCards';
import viDict from '../../../../i18n/vi';

const makeI18n = (dict) => (key) => {
  const parts = key.split('.');
  let current = dict;
  for (const part of parts) {
    current = current?.[part];
  }
  return current !== undefined ? current : key;
};

const baseDraft = {
  channel: 'email',
  templateName: 'Chào mừng học viên mới',
  subject: 'Chào mừng bạn!',
  bodyHtml: '<p>Nội dung</p>',
  bodyText: 'Nội dung',
};

describe('TemplateDraftCard — cổng quyền canSave', () => {
  it('canSave mặc định true → hiện nút "Lưu vào thư viện" và nút "Chỉnh sửa"', () => {
    render(
      <TemplateDraftCard
        draft={baseDraft}
        onSave={vi.fn()}
        onEdit={vi.fn()}
        t={makeI18n(viDict)}
      />
    );

    expect(screen.getByText('Lưu vào thư viện')).toBeInTheDocument();
    expect(screen.getByText('Chỉnh sửa')).toBeInTheDocument();
  });

  it('canSave={false} → KHÔNG hiện nút lưu, hiện lời giải thích, nút "Chỉnh sửa" vẫn còn', () => {
    render(
      <TemplateDraftCard
        draft={baseDraft}
        onSave={vi.fn()}
        onEdit={vi.fn()}
        canSave={false}
        t={makeI18n(viDict)}
      />
    );

    expect(screen.queryByText('Lưu vào thư viện')).not.toBeInTheDocument();
    expect(screen.getByText(viDict.aiChatbot.noPermissionSaveTemplate)).toBeInTheDocument();
    expect(screen.getByText('Chỉnh sửa')).toBeInTheDocument();
  });
});
