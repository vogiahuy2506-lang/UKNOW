import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

/**
 * Layout cho các trang policy (Privacy Policy, Public DPA, Terms of Service)
 * Không có Navbar và Footer - các trang này có header/footer tự thiết kế riêng
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
        </div>
    );
}
