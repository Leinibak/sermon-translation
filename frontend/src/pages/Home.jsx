// ============================================
// frontend/src/pages/Home.jsx
// ============================================
import React from "react";
import HeroSection from "../components/HeroSection";
import SermonSection from "../components/SermonSection";
import { Link } from 'react-router-dom';

function Home() {
    const [currentSlide, setCurrentSlide] = React.useState(0);
  

  return (
    <div>
      <HeroSection />
      <SermonSection />
    </div>
  );
}

export default Home;

