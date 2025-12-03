// frontend/src/components/Navbar.jsx
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Menu, X } from "lucide-react";
import logo from "@/assets/jounsori_logo.png";

function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav className="bg-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* 로고 */}
          <Link to="/">
            <img 
              src={logo} 
              alt="Logo" 
              className="h-12 w-auto object-contain select-none border-none outline-none focus:outline-none focus:ring-0" 
            />
          </Link>

          {/* 데스크톱 메뉴 */}
          <div className="hidden md:flex space-x-8 items-center font-bold font-dodum text-lg" 
          // style={{ fontFamily: "'Gowun Batang', sans-serif" }}
>
            <Link to="/" className="hover:text-blue-600 font-medium">
              홈
            </Link>
            <Link to="/sermons" className="hover:text-blue-600 font-medium">
              설교
            </Link>
            {/* ✅ 목회서신 메뉴 추가 */}
            <Link to="/pastoral-letters" className="hover:text-blue-600 font-medium">
              목회서신
            </Link>
            <Link to="/blog" className="hover:text-blue-600 font-medium">
              블로그
            </Link>

            {/* <Link to="/video-meetings" className="hover:text-blue-600 font-medium">
              화상회의
            </Link> */}
            
            {/* User Menu */}
            {isAuthenticated ? (
              <div className="flex items-center space-x-4">
                <span 
                  className={`text-sm ${
                    isScrolled ? 'text-blue-500' : 'text-blue-700'
                  }`}
                >
                  {user?.username}
                </span>
                <button
                  onClick={logout}
                  className={`text-lg uppercase tracking-wider font-light hover:opacity-70 transition ${
                    isScrolled ? 'text-pink-500' : 'text-pink-700'
                  }`}
                >
                  로그아웃
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className={`text-lg uppercase tracking-wider font-light hover:opacity-70 transition ${
                  isScrolled ? 'text-blue-500' : 'text-blue-700'
                }`} // 👈 text-xl로 변경
              >
                로그인
              </Link>
            )}
          </div>

          {/* 🌟🌟🌟 수정된 부분: 모바일 메뉴 버튼은 MD 이상에서 숨겨져야 합니다. 🌟🌟🌟 */}
          <div className="md:hidden"> 
            <button 
              onClick={() => setIsOpen(!isOpen)}
              className="text-gray-500 hover:text-gray-900 focus:outline-none focus:text-gray-900"
            >
              {isOpen ? <X size={28} /> : <Menu size={28} />}
            </button>
          </div>
        </div>
      </div>

      {/* 모바일 메뉴 (MD 미만에서만 표시) */}
      {isOpen && (
        <div className="md:hidden bg-white shadow-md px-4 pb-4 space-y-1 transition-all font-dodum duration-300">
          <Link to="/" className="block font-medium py-1" onClick={() => setIsOpen(false)}>
            홈
          </Link>
          <Link to="/sermons" className="block font-medium py-1" onClick={() => setIsOpen(false)}>
            설교
          </Link>
          {/* ✅ 목회서신 메뉴 추가 */}
          <Link to="/pastoral-letters" className="block font-medium py-1" onClick={() => setIsOpen(false)}>
            목회서신
          </Link>
          <Link to="/blog" className="block font-medium py-1" onClick={() => setIsOpen(false)}>
            블로그
          </Link>

          <div className="mt-4 pt-3 border-t border-gray-200">
            {isAuthenticated ? (
              <div className="flex items-center justify-between">
                <span className="text-sm text-blue-700">
                  {user?.username}
                </span>
                <button
                  onClick={() => {
                    logout();
                    setIsOpen(false);
                  }}
                  className="text-sm uppercase tracking-wider font-light text-pink-700 hover:opacity-70 transition"
                >
                  로그아웃
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="block text-sm uppercase tracking-wider font-light text-blue-700 hover:opacity-70 transition py-2"
                onClick={() => setIsOpen(false)}
              >
                로그인
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

export default Navbar;