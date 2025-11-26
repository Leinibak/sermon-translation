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
            <img src={logo} alt="Logo" className="h-12  w-auto object-contain select-none border-none outline-none focus:outline-none focus:ring-0" />
          </Link>

          {/* 데스크탑 메뉴 */}
          <div className="hidden md:flex space-x-8 items-center">
            <Link to="/" className="hover:text-blue-600 font-medium">
              HOME
            </Link>
            <Link to="/sermons" className="hover:text-blue-600 font-medium">
              SERMONS
            </Link>
            <Link to="/blog" className="hover:text-blue-600 font-medium">
              BLOG
            </Link>
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
                  className={`text-sm uppercase tracking-wider font-light hover:opacity-70 transition ${
                    isScrolled ? 'text-pink-500' : 'text-pink-700'
                  }`}
                >
                  Logout
                </button>
                
              </div>
            ) : (
              <Link
                to="/login"
                className={`text-sm uppercase tracking-wider font-light hover:opacity-70 transition ${
                  isScrolled ? 'text-blue-500' : 'text-blue-700'
                }`}
              >
                Log In
              </Link>
            )}
          </div>


          {/* 모바일 메뉴 버튼 */}
          <div className="md:hidden flex items-center">
            <button onClick={() => setIsOpen(!isOpen)}>
              {isOpen ? <X size={28} /> : <Menu size={28} />}
            </button>
          </div>
        </div>
      </div>

      {/* 모바일 메뉴 */}
      {isOpen && (
        <div className="md:hidden bg-white shadow-md px-4 pb-4 space-y-1 transition-all duration-300">

          <Link to="/" className="block font-medium py-1" onClick={() => setIsOpen(false)}>
            HOME
          </Link>

          <Link to="/sermons" className="block font-medium py-1" onClick={() => setIsOpen(false)}>
            SERMONS
          </Link>

          <Link to="/blog" className="block font-medium py-1" onClick={() => setIsOpen(false)}>
            BLOG
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
                  Logout
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="block text-sm uppercase tracking-wider font-light text-blue-700 hover:opacity-70 transition py-2"
                onClick={() => setIsOpen(false)}
              >
                Log In
              </Link>
            )}
          </div>
        </div>
      )}
      
    </nav>
  );
}

export default Navbar;