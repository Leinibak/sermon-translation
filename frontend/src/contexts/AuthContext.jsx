// ============================================
// frontend/src/contexts/AuthContext.jsx (수정)
// ============================================
import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from '../api/axios';
import API_ENDPOINTS from '../config/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const username = localStorage.getItem('username');
    
    if (token && username) {
      setUser({ username });
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    try {
      // ⭐ API_ENDPOINTS 사용
      const response = await axios.post(API_ENDPOINTS.auth.login, {
        username,
        password,
      });

      //       // 🔹 JWT 엔드포인트 변경
      // const response = await axios.post('/token/', {
      //   username,
      //   password,
      // });
      
      const { access, refresh } = response.data;
      
      localStorage.setItem('access_token', access);
      localStorage.setItem('refresh_token', refresh);
      localStorage.setItem('username', username);
      
      axios.defaults.headers.common['Authorization'] = `Bearer ${access}`;
      
      setUser({ username });
      
      return { success: true };
    } catch (error) {
      console.error('Login failed:', error);
      return { 
        success: false, 
        error: error.response?.data?.detail || '로그인에 실패했습니다.' 
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('username');
    
    delete axios.defaults.headers.common['Authorization'];
    
    setUser(null);
  };

  const value = {
    user,
    login,
    logout,
    loading,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};