// ==============================
// sermon-translation\frontend\src\components\Login.jsx
// ==============================

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(username, password);
    
    if (result.success) {
      navigate('/');
    } else {
      setError(result.error);
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-start justify-center bg-gray-50 px-4 pt-2">
      <div className="bg-white p-6 md:p-8 rounded-lg shadow-sm border border-gray-200 w-full max-w-md">
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 text-center">
          로그인
        </h2>

        {error && (
          <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-3 rounded">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
              사용자명
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm"
              placeholder="사용자명을 입력하세요"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              비밀번호
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm"
              placeholder="비밀번호를 입력하세요"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className={`w-full py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-slate-700 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            계정이 없으신가요?{' '}
            <Link to="/register" className="text-slate-700 hover:text-slate-900 font-medium">
              회원가입
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;