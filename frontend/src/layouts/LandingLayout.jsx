import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from '../components/layout/client/Navbar';
import Footer from '../components/layout/client/Footer';


export default function LandingLayout() {
    const { pathname, hash } = useLocation();

    // Khi đổi trang (không có hash), cuộn lên đầu để tránh trang mới load ở giữa.
    // Nếu URL có hash (#features) thì để trình duyệt tự xử lý cuộn tới anchor.
    useEffect(() => {
        if (!hash) {
            window.scrollTo({ top: 0, behavior: 'auto' });
        }
    }, [pathname, hash]);

    return (
        <div className="min-h-screen bg-white overflow-x-hidden">
            <Navbar />
            <main>
                <Outlet />
            </main>
            <Footer />
        </div>
    );
}