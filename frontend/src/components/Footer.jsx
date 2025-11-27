// ============================================
// frontend/src/components/Footer.jsx
// ============================================
import React from "react";
import { Link } from "react-router-dom";
import { Facebook, Instagram, Youtube, Music } from 'lucide-react';
import logo from "@/assets/jounsori_logo.png";

function Footer() {
  return (
    <footer className="bg-gradient-to-b from-[#1a4d5d] to-[#0d2a36] text-white py-12">
      <div className="max-w-7xl mx-auto px-4">
        {/* Social Media Icons */}
        <div className="flex justify-center space-x-4 sm:space-x-6 mb-12"> {/* space-x-4를 추가하여 작은 화면에서 간격을 약간 줄임 */}
          <a 
            href="https://facebook.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-white/50 flex items-center justify-center hover:bg-white/10 hover:border-white transition-all" // 아이콘 크기를 작게 조정
          >
            <Facebook className="w-5 h-5 sm:w-6 sm:h-6" />
          </a>
          <a 
            href="https://instagram.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-white/50 flex items-center justify-center hover:bg-white/10 hover:border-white transition-all"
          >
            <Instagram className="w-5 h-5 sm:w-6 sm:h-6" />
          </a>
          <a 
            href="https://youtube.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-white/50 flex items-center justify-center hover:bg-white/10 hover:border-white transition-all"
          >
            <Youtube className="w-5 h-5 sm:w-6 sm:h-6" />
          </a>
          <a 
            href="https://spotify.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-white/50 flex items-center justify-center hover:bg-white/10 hover:border-white transition-all"
          >
            <Music className="w-5 h-5 sm:w-6 sm:h-6" />
          </a>
        </div>

        {/* 🌟🌟🌟 Navigation Links - 모바일에서 세로 정렬 및 간격 조정 🌟🌟🌟 */}
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
            className="h-12 w-auto opacity-90 filter brightness-0 invert sm:h-14" // 로고 크기 살짝 줄임
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