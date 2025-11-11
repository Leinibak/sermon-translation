// ============================================
// frontend/src/components/Footer.jsx
// ============================================
import React from "react";
import { Link } from "react-router-dom";

function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300 py-8 mt-16">
      <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left">
        <div>
          <h3 className="text-lg font-semibold mb-2 text-white">Archesosik</h3>
          <p className="text-sm">The Truth Will Set You Free</p>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-2 text-white">Quick Links</h3>
          <div className="flex flex-col space-y-1">
            <Link to="/" className="hover:text-white">Home</Link>
            <Link to="/sermons" className="hover:text-white">Sermons</Link>
            <Link to="/blog" className="hover:text-white">Blog</Link>
            <Link to="/login" className="hover:text-white">Login</Link>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-2 text-white">Contact</h3>
          <p>Email: contact@archesosik</p>
          <p>Phone: +49 10-1234-5678</p>
        </div>
      </div>
      <div className="text-center text-sm text-gray-500 mt-6 border-t border-gray-700 pt-4">
        © 2025 Archesosik. All rights reserved.
      </div>
    </footer>
  );
}

export default Footer;
