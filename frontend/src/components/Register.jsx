import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from '../api/axios';
import API_ENDPOINTS from '../config/api';

function Register() {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    password2: '',
    email: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!formData.email.trim()) {
      setError('이메일은 필수 항목입니다.');
      return;
    }

    if (formData.password !== formData.password2) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    if (formData.password.length < 8) {
      setError('비밀번호는 최소 8자 이상이어야 합니다.');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        username: formData.username.trim(),
        email: formData.email.trim(),
        password: formData.password,
        password2: formData.password2,
      };
      
      const response = await axios.post(API_ENDPOINTS.auth.register, payload);
      
      setSuccessMessage(
        response.data.message || 
        '회원가입이 완료되었습니다. 관리자 승인 후 게시글 작성이 가능합니다.'
      );
      
      setTimeout(() => {
        navigate('/login');
      }, 3000);

    } catch (err) {
      console.error('Registration failed:', err);
      
      let errorMessage = '회원가입에 실패했습니다.';
      
      if (err.response?.data) {
        const errorData = err.response.data;
        
        if (errorData.username) {
          errorMessage = `사용자명: ${errorData.username.join(', ')}`;
        } else if (errorData.email) {
          errorMessage = `이메일: ${errorData.email.join(', ')}`;
        } else if (errorData.password) {
          errorMessage = `비밀번호: ${errorData.password.join(', ')}`;
        } else if (errorData.detail) {
          errorMessage = errorData.detail;
        } else if (errorData.non_field_errors) {
          errorMessage = errorData.non_field_errors.join(', ');
        } else {
          errorMessage = JSON.stringify(errorData);
        }
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-start justify-center bg-gray-50 px-4 pt-2">
      <div className="bg-white p-6 md:p-8 rounded-lg shadow-sm border border-gray-200 w-full max-w-md">
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 text-center">
          회원가입
        </h2>

        {/* 승인 안내 */}
        <div className="mb-4 bg-blue-50 border-l-4 border-blue-500 p-3 rounded">
          <p className="text-sm text-blue-700">
            ℹ️ 회원가입 후 관리자 승인이 필요합니다.<br/>
            승인 완료 후 게시글 작성이 가능합니다.
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-3 rounded">
            <p className="text-sm text-red-700 whitespace-pre-wrap">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 bg-green-50 border-l-4 border-green-500 p-3 rounded">
            <p className="text-sm text-green-700 whitespace-pre-wrap">{successMessage}</p>
            <p className="text-xs text-green-600 mt-2">잠시 후 로그인 페이지로 이동합니다...</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
              사용자명 *
            </label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              required
              disabled={loading || successMessage}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent disabled:bg-gray-100 text-sm"
              placeholder="사용자명을 입력하세요"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              이메일 *
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              disabled={loading || successMessage}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent disabled:bg-gray-100 text-sm"
              placeholder="example@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              비밀번호 *
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              disabled={loading || successMessage}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent disabled:bg-gray-100 text-sm"
              placeholder="8자 이상 입력하세요"
            />
          </div>

          <div>
            <label htmlFor="password2" className="block text-sm font-medium text-gray-700 mb-1">
              비밀번호 확인 *
            </label>
            <input
              type="password"
              id="password2"
              name="password2"
              value={formData.password2}
              onChange={handleChange}
              required
              disabled={loading || successMessage}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent disabled:bg-gray-100 text-sm"
              placeholder="비밀번호를 다시 입력하세요"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading || successMessage}
            className={`w-full py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-slate-700 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 ${
              (loading || successMessage) ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {loading ? '가입 중...' : successMessage ? '가입 완료!' : '회원가입'}
          </button>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            이미 계정이 있으신가요?{' '}
            <Link to="/login" className="text-slate-700 hover:text-slate-900 font-medium">
              로그인
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Register;