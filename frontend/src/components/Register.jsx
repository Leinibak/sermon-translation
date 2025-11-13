// frontend/src/components/Register.jsx (디버깅 버전)
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

    // 비밀번호 확인
    if (formData.password !== formData.password2) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    // 비밀번호 길이 확인
    if (formData.password.length < 8) {
      setError('비밀번호는 최소 8자 이상이어야 합니다.');
      return;
    }

    setLoading(true);

    try {
      // 📤 전송할 데이터 준비 (빈 이메일 필드 제거)
      const payload = {
        username: formData.username.trim(),
        password: formData.password,
        password2: formData.password2,
      };
      
      // 이메일이 있을 때만 포함
      if (formData.email && formData.email.trim()) {
        payload.email = formData.email.trim();
      }
      
      console.log('📤 전송 데이터:', payload);
      console.log('📍 요청 URL:', API_ENDPOINTS.auth.register);

      const response = await axios.post(API_ENDPOINTS.auth.register, payload);
      
      console.log('✅ 회원가입 성공:', response.data);
      alert('회원가입이 완료되었습니다. 로그인해주세요.');
      navigate('/login');
    } catch (err) {
      console.error('❌ Registration failed:', err);
      console.error('❌ Response:', err.response);
      console.error('❌ Response data:', err.response?.data);
      
      // 🔍 상세한 에러 메시지 표시
      let errorMessage = '회원가입에 실패했습니다.';
      
      if (err.response?.data) {
        // Django에서 반환하는 에러 형식 처리
        const errorData = err.response.data;
        
        if (errorData.username) {
          errorMessage = `사용자명: ${errorData.username.join(', ')}`;
        } else if (errorData.password) {
          errorMessage = `비밀번호: ${errorData.password.join(', ')}`;
        } else if (errorData.email) {
          errorMessage = `이메일: ${errorData.email.join(', ')}`;
        } else if (errorData.detail) {
          errorMessage = errorData.detail;
        } else if (errorData.non_field_errors) {
          errorMessage = errorData.non_field_errors.join(', ');
        } else {
          errorMessage = JSON.stringify(errorData);
        }
      }
      
      setError(errorMessage);
      alert(`회원가입 실패: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          회원가입
        </h2>

        {error && (
          <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4 rounded">
            <p className="text-sm text-red-700 whitespace-pre-wrap">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="사용자명을 입력하세요"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              이메일
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="이메일을 입력하세요 (선택)"
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
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
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
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="비밀번호를 다시 입력하세요"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {loading ? '가입 중...' : '회원가입'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            이미 계정이 있으신가요?{' '}
            <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">
              로그인
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Register;