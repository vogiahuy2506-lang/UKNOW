/**
 * F2.5 (B-1) — xem trước bản cũ của landing (lịch sử phiên bản) không được cùng nguồn với app.
 * Bản cũ của một trang có thể chứa script (do nhân viên sửa / landing Marketplace / AI sinh từ tài liệu độc), nên khung xem
 * trước chạy với origin "null" — script không đọc được token trong localStorage của app.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const fetchLandingPageVersions = vi.fn();
const previewLandingPageVersion = vi.fn();
const deleteLandingPageVersion = vi.fn();

vi.mock('../../services/landingPagesAdminApi.service.js', () => ({
  fetchLandingPageVersions: (...args) => fetchLandingPageVersions(...args),
  previewLandingPageVersion: (...args) => previewLandingPageVersion(...args),
  deleteLandingPageVersion: (...args) => deleteLandingPageVersion(...args),
}));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

import LandingVersionModal from '../LandingVersionModal.jsx';

describe('LandingVersionModal — sandbox của khung xem trước phiên bản', () => {
  beforeEach(() => {
    fetchLandingPageVersions.mockReset();
    previewLandingPageVersion.mockReset();
    fetchLandingPageVersions.mockResolvedValue({
      versions: [{ id: 11, createdAt: '2026-10-01T03:00:00Z', sizeBytes: 2048, source: 'manual' }],
      totalSizeBytes: 2048,
      maxVersions: 5,
    });
    previewLandingPageVersion.mockResolvedValue({
      version: { id: 11, created_at: '2026-10-01T03:00:00Z', sizeBytes: 2048 },
      htmlContent: '<!DOCTYPE html><html><body><script>parent.localStorage.getItem("accessToken")</script></body></html>',
    });
  });

  it('iframe xem trước phiên bản có allow-scripts nhưng KHÔNG có allow-same-origin', async () => {
    render(<LandingVersionModal open onClose={() => {}} landingPageId={5} onRestoreVersion={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: /Xem trước/ }));

    const iframe = await waitFor(() => {
      const found = document.querySelector('iframe[title="Landing Version Preview"]');
      expect(found).not.toBeNull();
      return found;
    });
    const tokens = (iframe.getAttribute('sandbox') || '').split(/\s+/).filter(Boolean);

    expect(tokens).toContain('allow-scripts');
    expect(tokens).not.toContain('allow-same-origin');
    // Nội dung bản cũ vẫn được nạp vào khung (xem trước còn chạy).
    expect(iframe.getAttribute('srcdoc')).toContain('<script>');
  });
});
