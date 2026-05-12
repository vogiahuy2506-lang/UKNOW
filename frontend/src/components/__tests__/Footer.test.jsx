import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Footer from '../../components/layout/client/Footer';

function renderFooter() {
  return render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>
  );
}

describe('<Footer />', () => {
  it('render logo "Founder AI"', () => {
    renderFooter();
    expect(screen.getByText('Founder AI')).toBeInTheDocument();
  });

  it('có 3 link react-router: Trang chủ, Bảng giá, Liên hệ', () => {
    renderFooter();
    const trangChu = screen.getByRole('link', { name: /Trang chủ/i });
    const bangGia = screen.getByRole('link', { name: /Bảng giá/i });
    const lienHe = screen.getByRole('link', { name: /Liên hệ/i });

    expect(trangChu).toHaveAttribute('href', '/');
    expect(bangGia).toHaveAttribute('href', '/pricing');
    expect(lienHe).toHaveAttribute('href', '/contact');
  });

  it('có 2 link <a> thẳng: privacy-policy + login', () => {
    renderFooter();
    const privacy = screen.getByRole('link', { name: /Chính sách bảo mật/i });
    const login = screen.getByRole('link', { name: /Đăng nhập/i });
    expect(privacy).toHaveAttribute('href', '/privacy-policy');
    expect(login).toHaveAttribute('href', '/login');
  });

  it('copyright text 2026', () => {
    renderFooter();
    expect(
      screen.getByText(/© 2026 Founder AI Marketing Platform/i)
    ).toBeInTheDocument();
  });

  it('logo link "/" tới homepage', () => {
    renderFooter();
    const logoLink = screen.getAllByRole('link', { name: /Founder AI/i })[0];
    expect(logoLink).toHaveAttribute('href', '/');
  });
});
