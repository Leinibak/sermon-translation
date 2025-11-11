// ============================================
// frontend/src/components/HeroSection.jsx
// ============================================
import React from "react";
import { motion } from "framer-motion";
import { Link } from 'react-router-dom';

function HeroSection() {
    const [currentSlide, setCurrentSlide] = React.useState(0);
    const slides = [
    {
      title: 'The Truth Will Set You Free',
      subtitle: '진리가 너희를 자유롭게 하리라',
      image: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    },
    {
      title: 'Born Again in Christ',
      subtitle: '그리스도 안에서 새로운 피조물',
      image: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    },
  ];
  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);


  return (
    <div>
      {/* Hero Section with Carousel */}
      <section className="relative h-screen overflow-hidden">
        {slides.map((slide, index) => (
          <div
            key={index}
            className={`absolute inset-0 transition-opacity duration-1000 ${
              index === currentSlide ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ background: slide.image }}
          >
            <div className="absolute inset-0 bg-black bg-opacity-30" />
            <div className="relative h-full flex items-center justify-center text-center px-4">
              <div className="max-w-4xl">
                <h1 
                  className="text-5xl md:text-7xl font-light text-white mb-6 tracking-wide"
                  style={{ fontFamily: 'Georgia, serif' }}
                >
                  {slide.title}
                </h1>
                <p className="text-xl md:text-2xl text-white text-opacity-90 font-light">
                  {slide.subtitle}
                </p>
              </div>
            </div>
          </div>
        ))}

        {/* Navigation Arrows */}
        <button
          onClick={() => setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length)}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-opacity-70 transition"
        >
          <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={() => setCurrentSlide((prev) => (prev + 1) % slides.length)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-opacity-70 transition"
        >
          <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Dots */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex space-x-3">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`w-2 h-2 rounded-full transition ${
                index === currentSlide ? 'bg-white' : 'bg-white bg-opacity-50'
              }`}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export default HeroSection;
