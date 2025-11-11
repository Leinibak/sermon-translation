// ============================================
// frontend/src/components/SermonSection.jsx
// ============================================
import React from "react";
import { Link } from "react-router-dom";

function SermonSection() {
  return (
    <div>
      {/* Latest Sermon Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 
              className="text-4xl font-light mb-4"
              style={{ fontFamily: 'Georgia, serif' }}
            >
              Latest Sermon
            </h2>
            <div className="w-16 h-px bg-gray-400 mx-auto mb-6" />
            <p className="text-gray-600 max-w-2xl mx-auto leading-relaxed">
              Lorem ipsum dolor sit amet consectetur adipisicing elit. Possimus molestiae repudiandae voluptatum dicta neque.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <Link 
              to="/sermons"
              className="group relative overflow-hidden rounded-lg shadow-lg hover:shadow-2xl transition duration-300"
            >
              <div 
                className="h-80 bg-gradient-to-br from-purple-400 to-pink-400"
                style={{ backgroundImage: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
              >
                <div className="absolute inset-0 bg-black bg-opacity-30 group-hover:bg-opacity-40 transition" />
                <div className="absolute inset-0 flex items-end p-8">
                  <div className="text-white">
                    <p className="text-sm uppercase tracking-wider mb-2">Latest Message</p>
                    <h3 className="text-2xl font-light mb-2">은혜의 복음</h3>
                    <p className="text-sm text-white text-opacity-90">2025.01.15 · 김목사</p>
                  </div>
                </div>
              </div>
            </Link>

            <Link 
              to="/sermons"
              className="group relative overflow-hidden rounded-lg shadow-lg hover:shadow-2xl transition duration-300"
            >
              <div 
                className="h-80 bg-gradient-to-br from-blue-400 to-purple-400"
                style={{ backgroundImage: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}
              >
                <div className="absolute inset-0 bg-black bg-opacity-30 group-hover:bg-opacity-40 transition" />
                <div className="absolute inset-0 flex items-end p-8">
                  <div className="text-white">
                    <p className="text-sm uppercase tracking-wider mb-2">Previous Message</p>
                    <h3 className="text-2xl font-light mb-2">사랑의 실천</h3>
                    <p className="text-sm text-white text-opacity-90">2025.01.08 · 이목사</p>
                  </div>
                </div>
              </div>
            </Link>
          </div>

          <div className="text-center mt-12">
            <Link
              to="/sermons"
              className="inline-block px-8 py-3 border border-gray-300 text-gray-700 text-sm uppercase tracking-wider hover:bg-gray-50 transition"
            >
              View All Sermons
            </Link>
          </div>
        </div>
      </section>

      {/* Quote Section */}
      <section 
        className="py-32 relative"
        style={{ 
          backgroundImage: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)',
        }}
      >
        <div className="max-w-4xl mx-auto px-4 text-center">
          <blockquote>
            <p 
              className="text-3xl md:text-4xl font-light text-gray-800 mb-8 leading-relaxed"
              style={{ fontFamily: 'Georgia, serif' }}
            >
              "진리를 알지니 진리가 너희를 자유롭게 하리라"
            </p>
            <footer className="text-gray-600 text-sm uppercase tracking-wider">
              — 요한복음 8:32
            </footer>
          </blockquote>
        </div>
      </section>

      {/* Blog Preview */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center mb-12">
            <h2 
              className="text-4xl font-light"
              style={{ fontFamily: 'Georgia, serif' }}
            >
              From the Blog
            </h2>
            <Link
              to="/blog"
              className="text-sm uppercase tracking-wider text-gray-600 hover:text-gray-900 transition"
            >
              View All →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[1, 2, 3].map((i) => (
              <Link
                key={i}
                to="/blog"
                className="group bg-white overflow-hidden hover:shadow-lg transition duration-300"
              >
                <div className="h-48 bg-gradient-to-br from-gray-200 to-gray-300" />
                <div className="p-6">
                  <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">
                    January {15 - i}, 2025
                  </p>
                  <h3 className="text-xl font-light mb-2 group-hover:text-gray-600 transition">
                    Blog Post Title {i}
                  </h3>
                  <p className="text-gray-600 text-sm leading-relaxed line-clamp-3">
                    Lorem ipsum dolor sit amet consectetur adipisicing elit. Quidem, voluptatum.
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default SermonSection;
