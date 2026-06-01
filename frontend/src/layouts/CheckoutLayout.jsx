const VIDEO_SRC = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260403_050628_c4e32401-fab4-4a27-b7a8-6e9291cd5959.mp4';

const CheckoutLayout = ({ children }) => (
  <div className="min-h-screen relative overflow-x-hidden font-sans selection:bg-orange-500 selection:text-white">
    <video
      className="fixed inset-0 w-full h-full object-cover pointer-events-none"
      style={{ zIndex: 0 }}
      src={VIDEO_SRC}
      autoPlay loop muted playsInline preload="auto"
    />
    <div className="relative z-10">
      {children}
    </div>
  </div>
);

export default CheckoutLayout;
