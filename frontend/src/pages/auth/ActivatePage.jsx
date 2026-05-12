import { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../../services/api';

const ActivatePage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState('loading'); // loading | success | error
  const [errorMessage, setErrorMessage] = useState('');
  const [tokenInfo, setTokenInfo] = useState({ username: '' });
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    if (!token) {
      setState('error');
      setErrorMessage('Link kích hoạt không hợp lệ.');
      return;
    }

    api.post('/auth/activate', { token })
      .then((res) => {
        setTokenInfo({ username: res.data.data?.username || '' });
        setState('success');
      })
      .catch((err) => {
        const code = err?.response?.data?.code;
        if (code === 'ALREADY_ACTIVATED') {
          setState('success');
        } else {
          setState('error');
          setErrorMessage(err?.response?.data?.message || 'Link kích hoạt không hợp lệ hoặc đã hết hạn.');
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ activate 1 lần (guard bằng called.current)
  }, []);

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <div className="spinner w-10 h-10 mx-auto" />
          <p className="text-gray-500">Đang kích hoạt tài khoản...</p>
        </div>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">Tài khoản đã được kích hoạt!</h2>
          {tokenInfo.username && (
            <p className="text-gray-500 text-sm">
              Đăng nhập với tên đăng nhập <strong>{tokenInfo.username}</strong> và mật khẩu mặc định: <strong>digiso@2026</strong>
            </p>
          )}
          <Link
            to="/login"
            className="btn btn-primary block w-full"
          >
            Đăng nhập ngay
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900">Kích hoạt thất bại</h2>
        <p className="text-gray-500 text-sm">{errorMessage}</p>
        <p className="text-gray-400 text-sm">Vui lòng liên hệ người quản lý để gửi lại lời mời.</p>
        <Link to="/login" className="btn btn-primary block w-full">Về trang đăng nhập</Link>
      </div>
    </div>
  );
};

export default ActivatePage;
