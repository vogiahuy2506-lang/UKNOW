import { Outlet } from 'react-router-dom';
import Navbar from '../components/layout/client/Navbar';
import Footer from '../components/layout/client/Footer';


export default function LandingLayout() {
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