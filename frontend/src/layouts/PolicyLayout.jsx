import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import ThemeToggleButton from '../components/common/ThemeToggleButton';

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
        <div className="min-h-screen bg-white dark:bg-dk-bg dark:text-dk-text overflow-x-hidden">
            {/* Trang chính sách không có thanh điều hướng — nút đổi sáng/tối nổi ở góc, nền tối cố định để đọc được
                cả trên phần đầu trang (luôn tối) lẫn phần thân (sáng hoặc tối). */}
            <div className="fixed top-3 right-3 z-40 rounded-xl bg-slate-900/80 ring-1 ring-white/10 shadow-lg backdrop-blur">
                <ThemeToggleButton variant="onDark" />
            </div>
            <main>
                <Outlet />
            </main>
        </div>
    );
}
