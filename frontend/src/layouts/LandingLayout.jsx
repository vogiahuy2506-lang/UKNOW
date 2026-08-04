import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from '../components/layout/client/Navbar';
import Footer from '../components/layout/client/Footer';

/**
 * Landing Layout - Refactored với Impeccable design principles:
 * - Modern gradient backgrounds
 * - Smooth scroll behavior
 * - Clean visual hierarchy
 */
export default function LandingLayout() {
    const { pathname, hash } = useLocation();

    useEffect(() => {
        if (!hash) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [pathname, hash]);

    return (
        <div className="min-h-screen bg-white overflow-x-hidden">
            <Navbar />
            <main className="pt-[72px]">
                <Outlet />
            </main>
            <Footer />
        </div>
    );
}
