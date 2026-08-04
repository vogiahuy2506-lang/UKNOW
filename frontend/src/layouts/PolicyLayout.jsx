import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Footer from '../components/layout/client/Footer';

/**
 * Layout cho các trang policy (Privacy Policy, Public DPA, Terms of Service)
 * Không có Navbar - các trang này có header tự thiết kế riêng
 */
export default function PolicyLayout() {
    const { pathname, hash } = useLocation();

    useEffect(() => {
        if (!hash) {
            window.scrollTo({ top: 0, behavior: 'auto' });
        }
    }, [pathname, hash]);

    return (
        <div className="min-h-screen bg-white overflow-x-hidden">
            <main>
                <Outlet />
            </main>
            <Footer />
        </div>
    );
}
