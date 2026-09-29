/**
 * PlaygroundHeader: nhãn Online/Offline theo replies_enabled (công tắc trả lời), không theo is_active (xoá mềm).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PlaygroundHeader from '../PlaygroundHeader';

describe('PlaygroundHeader — Online/Offline', () => {
  it('replies_enabled:false → Offline', () => {
    render(<PlaygroundHeader bot={{ id: 1, name: 'Bot', is_active: true, replies_enabled: false }} />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.queryByText('Online')).toBeNull();
  });

  it('replies_enabled:true hoặc thiếu → Online', () => {
    const { unmount } = render(<PlaygroundHeader bot={{ id: 1, name: 'Bot', replies_enabled: true }} />);
    expect(screen.getByText('Online')).toBeInTheDocument();
    unmount();
    render(<PlaygroundHeader bot={{ id: 1, name: 'Bot' }} />);
    expect(screen.getByText('Online')).toBeInTheDocument();
  });
});
