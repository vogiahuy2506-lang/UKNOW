/**
 * PLAN_TRO_LY_CHINH_LANDING_TRON_GOI_2026-09-13.md, Việc 2.2/2.4 — form "Lưu & xuất bản".
 *
 * LandingPageCard KHÔNG tự gọi createLandingPageAdmin/updateLandingPageAdmin — nó gọi lên
 * `onSaveAndPublish` (AiChatbot.jsx#handleSaveAndPublishLandingPage sở hữu API thật, quyết định
 * create/update bằng page.landingPageId — Bẫy 5). Test ở đây khoá đúng payload thẻ gửi lên và
 * đúng hành vi UI theo kết quả trả về (thành công / 409 / lỗi khác).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LandingPageCard from '../LandingPageCard';

vi.mock('../../../../i18n', () => ({
  useI18n: (namespace = null) => {
    const t = (key) => (namespace ? `${namespace}.${key}` : key);
    if (namespace) return t;
    return { t, locale: 'vi' };
  },
}));

const basePage = { title: 'Trang test', html: '<div>Nội dung landing</div>' };

const renderCard = (props = {}) => {
  const onSaveAndPublish = props.onSaveAndPublish ?? vi.fn().mockResolvedValue({ id: 1 });
  const utils = render(
    <MemoryRouter>
      <LandingPageCard
        page={props.page ?? basePage}
        messageId={props.messageId ?? 7}
        messageIndex={props.messageIndex ?? 0}
        canSave={props.canSave ?? true}
        onSaveAndPublish={onSaveAndPublish}
        onGenerateNew={vi.fn()}
        onEditWithAi={vi.fn()}
      />
    </MemoryRouter>
  );
  return { onSaveAndPublish, ...utils };
};

describe('LandingPageCard — Lưu & xuất bản (chưa lưu)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('nút "Lưu & xuất bản" mở form, slug tự sinh từ tiêu đề', () => {
    renderCard();
    fireEvent.click(screen.getByText('landingPageCard.save.button'));

    const slugInput = screen.getByPlaceholderText('landingPageCard.save.slugPlaceholder');
    expect(slugInput.value).toBe('trang-test');
  });

  it('sửa tay slug thì không bị tự sinh lại đè lên khi đổi tiêu đề tiếp', () => {
    renderCard();
    fireEvent.click(screen.getByText('landingPageCard.save.button'));

    const slugInput = screen.getByPlaceholderText('landingPageCard.save.slugPlaceholder');
    fireEvent.change(slugInput, { target: { value: 'slug-tuy-chinh' } });

    const titleInput = screen.getByDisplayValue('Trang test');
    fireEvent.change(titleInput, { target: { value: 'Trang test đổi tên' } });

    expect(slugInput.value).toBe('slug-tuy-chinh');
  });

  it('submit gọi onSaveAndPublish đúng title/slug/isPublished + fullHtml đã bọc doctype', async () => {
    const { onSaveAndPublish } = renderCard();
    fireEvent.click(screen.getByText('landingPageCard.save.button'));

    fireEvent.click(screen.getByLabelText('landingPageCard.save.publishNow'));
    fireEvent.click(screen.getByText('landingPageCard.save.submit'));

    await waitFor(() => expect(onSaveAndPublish).toHaveBeenCalledTimes(1));
    const call = onSaveAndPublish.mock.calls[0][0];
    expect(call.formValues).toEqual({ title: 'Trang test', slug: 'trang-test', isPublished: true });
    expect(call.fullHtml).toContain('<!DOCTYPE html');
    expect(call.fullHtml).toContain(basePage.html);
    expect(call.page).toBe(basePage);
    expect(call.messageId).toBe(7);
    expect(call.messageIndex).toBe(0);
  });

  it('!canSave → không hiện nút "Lưu & xuất bản" (chỉ có quyền landing_pages mới thấy)', () => {
    renderCard({ canSave: false });
    expect(screen.queryByText('landingPageCard.save.button')).not.toBeInTheDocument();
  });

  it('409 (slug đã tồn tại) → báo trùng, form còn nguyên (KHÔNG đóng)', async () => {
    const err = new Error('conflict');
    err.response = { status: 409 };
    const onSaveAndPublish = vi.fn().mockRejectedValue(err);
    renderCard({ onSaveAndPublish });

    fireEvent.click(screen.getByText('landingPageCard.save.button'));
    fireEvent.click(screen.getByText('landingPageCard.save.submit'));

    await waitFor(() => {
      expect(screen.getByText('landingPageCard.save.slugTaken')).toBeInTheDocument();
    });
    // Form vẫn còn — input tiêu đề vẫn hiện.
    expect(screen.getByDisplayValue('Trang test')).toBeInTheDocument();
  });

  it('thiếu tiêu đề → báo lỗi tại chỗ, KHÔNG gọi onSaveAndPublish', async () => {
    const { onSaveAndPublish } = renderCard();
    fireEvent.click(screen.getByText('landingPageCard.save.button'));

    const titleInput = screen.getByDisplayValue('Trang test');
    fireEvent.change(titleInput, { target: { value: '   ' } });
    fireEvent.click(screen.getByText('landingPageCard.save.submit'));

    expect(screen.getByText('landingPageCard.save.titleRequired')).toBeInTheDocument();
    expect(onSaveAndPublish).not.toHaveBeenCalled();
  });
});

describe('LandingPageCard — đã lưu (page.landingPageId có sẵn)', () => {
  beforeEach(() => vi.clearAllMocks());

  const savedPage = { ...basePage, landingPageId: 42, slug: 'trang-test', isPublished: true };

  it('KHÔNG còn nút "Lưu & xuất bản" — hiện link công khai + Mở trang soạn thay vào đó', () => {
    renderCard({ page: savedPage });
    expect(screen.queryByText('landingPageCard.save.button')).not.toBeInTheDocument();
    expect(screen.getByText('landingPageCard.save.openEditor')).toBeInTheDocument();
    expect(screen.getByText(/trang-test\.founderai\.biz/)).toBeInTheDocument();
  });

  it('bấm "Ẩn trang" (đang published) → onSaveAndPublish với isPublished=false, giữ nguyên title/slug', async () => {
    const { onSaveAndPublish } = renderCard({ page: savedPage });
    fireEvent.click(screen.getByText('landingPageCard.save.unpublish'));

    await waitFor(() => expect(onSaveAndPublish).toHaveBeenCalledTimes(1));
    expect(onSaveAndPublish.mock.calls[0][0].formValues).toEqual({
      title: savedPage.title,
      slug: savedPage.slug,
      isPublished: false,
    });
  });

  it('bấm "Cập nhật trang đã lưu" → onSaveAndPublish với fullHtml hiện tại', async () => {
    const { onSaveAndPublish } = renderCard({ page: savedPage });
    fireEvent.click(screen.getByText('landingPageCard.save.updateButton'));

    await waitFor(() => expect(onSaveAndPublish).toHaveBeenCalledTimes(1));
    const call = onSaveAndPublish.mock.calls[0][0];
    expect(call.formValues.isPublished).toBe(true);
    expect(call.fullHtml).toContain(savedPage.html);
  });

  it('!canSave → ẩn nút Xuất bản/Ẩn và Cập nhật trang đã lưu, chỉ còn Mở trang soạn', () => {
    renderCard({ page: savedPage, canSave: false });
    expect(screen.queryByText('landingPageCard.save.unpublish')).not.toBeInTheDocument();
    expect(screen.queryByText('landingPageCard.save.updateButton')).not.toBeInTheDocument();
    expect(screen.getByText('landingPageCard.save.openEditor')).toBeInTheDocument();
  });
});
