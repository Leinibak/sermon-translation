// frontend/src/components/Footer.jsx
import React from "react";
import { Link } from "react-router-dom";
import { Cross, Bird, Heart } from 'lucide-react'; // ✅ lucide-react 아이콘 사용
import logo from "@/assets/jounsori_logo.png";

// 성경 아이콘만 커스텀 (십자가가 있는 책 모양)
const BibleIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    <line x1="12" y1="6" x2="12" y2="14" />
    <line x1="8" y1="10" x2="16" y2="10" />
  </svg>
);

function Footer() {
  const faithSymbols = [
    { 
      icon: Cross, 
      label: '십자가',
      description: 'Faith',
      link: '/'
    },
    { 
      icon: BibleIcon, 
      label: '성경',
      description: 'Scripture',
      link: '/sermons'
    },
    { 
      icon: Bird, 
      label: '비둘기',
      description: 'Spirit',
      link: '/pastoral-letters'
    },
    { 
      icon: Heart, 
      label: '사랑',
      description: 'Love',
      link: '/blog'
    },
  ];

  return (
    <footer className="bg-gradient-to-b from-[#1a4d5d] to-[#0d2a36] text-white py-12">
      <div className="max-w-7xl mx-auto px-4">
        {/* Faith Symbols Icons */}
        <div className="flex justify-center space-x-4 sm:space-x-6 mb-12">
          {faithSymbols.map((symbol, index) => {
            const IconComponent = symbol.icon;
            return (
              <Link
                key={index}
                to={symbol.link}
                className="group relative w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-white/50 flex items-center justify-center hover:bg-white/10 hover:border-white transition-all"
                title={symbol.label}
              >
                <IconComponent className="w-5 h-5 sm:w-6 sm:h-6 group-hover:scale-110 transition-transform" />
                
                {/* 호버 시 나타나는 라벨 */}
                <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {symbol.description}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Navigation Links */}
        <div className="flex flex-col sm:flex-row justify-center items-center space-y-2 sm:space-y-0 sm:space-x-8 mb-12 text-sm uppercase tracking-wider">
          <Link to="/contact" className="hover:text-gray-300 transition">
            KONTAKT
          </Link>
          <Link to="/privacy" className="hover:text-gray-300 transition">
            DATENSCHUTZ
          </Link>
          <Link to="/impressum" className="hover:text-gray-300 transition">
            IMPRESSUM
          </Link>
          <Link to="/newsletter" className="hover:text-gray-300 transition">
            NEWSLETTER
          </Link>
        </div>

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img 
            src={logo} 
            alt="Jounsori Logo" 
            className="h-12 w-auto opacity-90 filter brightness-0 invert sm:h-14"
          />
        </div>

        {/* Copyright */}
        <div className="text-center text-sm text-white/70">
          © 2025 Jounsori 좋은소리
        </div>
      </div>
    </footer>
  );
}

export default Footer;