// frontend/src/components/HeroSection.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from '../api/axios';

function HeroSection() {
  const [verses, setVerses] = useState([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDailyVerses();
  }, []);

  useEffect(() => {
    if (verses.length > 0) {
      const timer = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % verses.length);
      }, 20000); // 20초마다 변경
      return () => clearInterval(timer);
    }
  }, [verses.length]);

  const fetchDailyVerses = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/bible-verses/daily/');
      setVerses(response.data);
    } catch (error) {
      console.error('성경 구절 로딩 실패:', error);
      // 기본 구절 (에러 시)
      setVerses([
        {
          id: 1,
          category_display: '진리',
          reference_kr: '요한복음 8:32',
          reference_de: 'Johannes 8:32',
          text_kr: '진리를 알지니 진리가 너희를 자유롭게 하리라',
          text_de: 'und ihr werdet die Wahrheit erkennen, und die Wahrheit wird euch frei machen!'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <section className="relative h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500">
        <div className="absolute inset-0 bg-black bg-opacity-20" />
        <div className="relative h-full flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
        </div>
      </section>
    );
  }

  const gradients = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  ];

  return (
    <section className="relative h-screen overflow-hidden">
      <AnimatePresence mode="wait">
        {verses.map((verse, index) => (
          index === currentSlide && (
            <motion.div
              key={verse.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1 }}
              className="absolute inset-0"
              style={{ background: gradients[index % gradients.length] }}
            >
              <div className="absolute inset-0 bg-black bg-opacity-30" />
              
              <div className="relative h-full flex items-center justify-center text-center px-4">
                <div className="max-w-5xl">
                  {/* 카테고리 배지 */}
                  <motion.div
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="mb-8"
                  >
                    <span className="inline-block px-6 py-2 bg-white/20 backdrop-blur-sm text-white rounded-full text-sm font-medium tracking-wider">
                      {verse.category_display}
                    </span>
                  </motion.div>

                  {/* 한글 구절 */}
                  <motion.h1
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="text-3xl md:text-5xl font-light text-white mb-4 leading-relaxed px-4"
                    style={{ fontFamily: "'Gowun Batang', serif" }}
                  >
                    {verse.text_kr}
                  </motion.h1>

                  {/* 한글 참조 */}
                  <motion.p
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="text-lg md:text-xl text-white/90 mb-8 font-light"
                    style={{ fontFamily: "'Gowun Batang', serif" }}
                  >
                    {verse.reference_kr}
                  </motion.p>

                  {/* 구분선 */}
                  <motion.div
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    className="w-24 h-px bg-white/50 mx-auto mb-8"
                  />

                  {/* 독일어 구절 */}
                  <motion.p
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 1 }}
                    className="text-xl md:text-3xl text-white/95 mb-3 font-light leading-relaxed px-4"
                    style={{ fontFamily: 'Georgia, serif' }}
                  >
                    {verse.text_de}
                  </motion.p>

                  {/* 독일어 참조 */}
                  <motion.p
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 1.2 }}
                    className="text-base md:text-lg text-white/80 font-light"
                    style={{ fontFamily: 'Georgia, serif' }}
                  >
                    {verse.reference_de}
                  </motion.p>
                </div>
              </div>
            </motion.div>
          )
        ))}
      </AnimatePresence>

      {/* 네비게이션 화살표 */}
      {verses.length > 1 && (
        <>
          <button
            onClick={() => setCurrentSlide((prev) => (prev - 1 + verses.length) % verses.length)}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-opacity-70 transition z-10 bg-black/20 hover:bg-black/30 rounded-full p-2"
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => setCurrentSlide((prev) => (prev + 1) % verses.length)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-opacity-70 transition z-10 bg-black/20 hover:bg-black/30 rounded-full p-2"
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* 인디케이터 도트 */}
      {verses.length > 1 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex space-x-3 z-10">
          {verses.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                index === currentSlide 
                  ? 'bg-white w-8' 
                  : 'bg-white/50 hover:bg-white/75'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default HeroSection;