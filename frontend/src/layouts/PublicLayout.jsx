import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import HeroNavbar from '../pages/public/components/HeroNavbar';
import Footer from '../components/layout/client/Footer';

export default function PublicLayout() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname, hash]);

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif' }} className="relative min-h-screen">
      <video
        className="fixed inset-0 w-full h-full object-cover pointer-events-none"
        style={{ zIndex: -1 }}
        src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260403_050628_c4e32401-fab4-4a27-b7a8-6e9291cd5959.mp4"
        autoPlay loop muted playsInline preload="auto"
      />

      <HeroNavbar />

      <main>
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
