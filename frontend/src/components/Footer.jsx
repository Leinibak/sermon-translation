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
        <div className="flex justify-center space-x-6 mb-12">
          <a 
            href="https://facebook.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-14 h-14 rounded-full border-2 border-white/50 flex items-center justify-center hover:bg-white/10 hover:border-white transition-all"
          >
            <Facebook className="w-6 h-6" />
          </a>
          <a 
            href="https://instagram.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-14 h-14 rounded-full border-2 border-white/50 flex items-center justify-center hover:bg-white/10 hover:border-white transition-all"
          >
            <Instagram className="w-6 h-6" />
          </a>
          <a 
            href="https://youtube.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-14 h-14 rounded-full border-2 border-white/50 flex items-center justify-center hover:bg-white/10 hover:border-white transition-all"
          >
            <Youtube className="w-6 h-6" />
          </a>
          <a 
            href="https://spotify.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-14 h-14 rounded-full border-2 border-white/50 flex items-center justify-center hover:bg-white/10 hover:border-white transition-all"
          >
            <Music className="w-6 h-6" />
          </a>
        </div>

        {/* Navigation Links */}
        <div className="flex justify-center space-x-8 mb-12 text-sm uppercase tracking-wider">
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
            className="h-14 w-auto opacity-90 filter brightness-0 invert"
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