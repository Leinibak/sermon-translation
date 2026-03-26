// frontend/src/components/Navbar.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Menu, X, ChevronDown } from "lucide-react";
import logo from '../assets/jounsori_logo.png';

function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const location = useLocation();

  // ── 화상회의 룸 여부 감지 ──────────────────────────────────
  // /video-meetings/:id 형태 (목록 페이지 /video-meetings 는 제외)
  const isVideoRoom = /^\/video-meetings\/[^/]+/.test(location.pathname);

  // ── Navbar 표시 상태 (화상회의 중에만 토글) ────────────────
  const [navVisible, setNavVisible] = useState(true);
  const hideTimerRef = useRef(null);

  // 화상회의 입장 시 → 3초 후 자동 숨김
  // 화상회의 나갈 때 → 즉시 복원
  useEffect(() => {
    if (isVideoRoom) {
      // 입장: 3초 후 숨김
      hideTimerRef.current = setTimeout(() => {
        setNavVisible(false);
      }, 3000);
    } else {
      // 퇴장: 즉시 표시, 타이머 취소
      clearTimeout(hideTimerRef.current);
      setNavVisible(true);
    }

    return () => clearTimeout(hideTimerRef.current);
  }, [isVideoRoom, location.pathname]);

  // 화상회의 중 상단 터치/클릭 → 3초간 다시 표시 후 숨김
  const handleShowNav = useCallback(() => {
    setNavVisible(true);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setNavVisible(false);
    }, 3000);
  }, []);

  // 스크롤 감지 (일반 페이지용)
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      {/* ── 화상회의 중 숨김 감지 영역 ─────────────────────────
          Navbar가 숨겨진 상태에서 상단을 탭/클릭하면 다시 표시
          항상 DOM에 존재하지만, 화상회의 + 숨김 상태일 때만 활성 */}
      {isVideoRoom && !navVisible && (
        <div
          className="fixed top-0 left-0 right-0 z-[60] h-10 cursor-pointer"
          onClick={handleShowNav}
          onTouchStart={handleShowNav}
          title="메뉴 표시"
          aria-label="메뉴 표시"
        >
          {/* 작은 힌트 화살표 — 중앙 하단 */}
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex flex-col items-center opacity-40">
            <ChevronDown className="w-4 h-4 text-white drop-shadow" />
          </div>
        </div>
      )}

      {/* ── Navbar 본체 ────────────────────────────────────────
          화상회의 중: 슬라이드 업/다운 + fixed 포지션
          일반 페이지:  sticky (기존 동작) */}
      <nav
        className={`
          bg-white shadow-md z-50
          ${isVideoRoom
            /* 화상회의: fixed + 슬라이드 트랜지션 */
            ? `fixed top-0 left-0 right-0 transition-transform duration-300 ease-in-out
               ${navVisible ? 'translate-y-0' : '-translate-y-full'}`
            /* 일반: 기존 sticky */
            : 'sticky top-0'
          }
        `}
        // 화상회의 중 Navbar 자체 클릭 → 타이머 재시작 (메뉴 이용 후 다시 숨김)
        onClick={isVideoRoom ? handleShowNav : undefined}
        onTouchStart={isVideoRoom ? handleShowNav : undefined}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">

            {/* 로고 */}
            <Link to="/" onClick={() => setIsOpen(false)}>
              <img
                src={logo}
                alt="Logo"
                className="h-12 w-auto object-contain select-none border-none outline-none focus:outline-none focus:ring-0"
              />
            </Link>

            {/* 데스크톱 메뉴 */}
            <div className="hidden md:flex space-x-8 items-center font-bold font-dodum text-lg">
              <Link to="/" className="hover:text-blue-600 font-medium">홈</Link>
              <Link to="/sermons" className="hover:text-blue-600 font-medium">설교</Link>
              <Link to="/pastoral-letters" className="hover:text-blue-600 font-medium">목회서신</Link>
              <Link to="/blog" className="hover:text-blue-600 font-medium">블로그</Link>

              {isAuthenticated && (
                <Link to="/video-meetings" className="hover:text-blue-600 font-medium">화상회의</Link>
              )}

              {isAuthenticated ? (
                <div className="flex items-center space-x-4">
                  <span className={`text-sm ${isScrolled ? 'text-blue-500' : 'text-blue-700'}`}>
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
                  }`}
                >
                  로그인
                </Link>
              )}
            </div>

            {/* 모바일 햄버거 버튼 */}
            <div className="md:hidden">
              <button
                onClick={(e) => {
                  e.stopPropagation(); // Navbar onClick 중복 방지
                  setIsOpen(!isOpen);
                }}
                className="text-gray-500 hover:text-gray-900 focus:outline-none focus:text-gray-900"
              >
                {isOpen ? <X size={28} /> : <Menu size={28} />}
              </button>
            </div>
          </div>
        </div>

        {/* 모바일 드롭다운 메뉴 */}
        {isOpen && (
          <div className="md:hidden bg-white shadow-md px-4 pb-4 space-y-1 transition-all font-dodum duration-300">
            <Link to="/" className="block font-medium py-1" onClick={() => setIsOpen(false)}>홈</Link>
            <Link to="/sermons" className="block font-medium py-1" onClick={() => setIsOpen(false)}>설교</Link>
            <Link to="/pastoral-letters" className="block font-medium py-1" onClick={() => setIsOpen(false)}>목회서신</Link>
            <Link to="/blog" className="block font-medium py-1" onClick={() => setIsOpen(false)}>블로그</Link>

            {isAuthenticated && (
              <Link to="/video-meetings" className="block font-medium py-1" onClick={() => setIsOpen(false)}>
                화상회의
              </Link>
            )}

            <div className="mt-4 pt-3 border-t border-gray-200">
              {isAuthenticated ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-blue-700">{user?.username}</span>
                  <button
                    onClick={() => { logout(); setIsOpen(false); }}
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
    </>
  );
}

export default Navbar;