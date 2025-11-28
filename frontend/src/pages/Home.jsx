// frontend/src/pages/Home.jsx
import React, { useState, useEffect } from "react";
import HeroSection from "../components/HeroSection";
import { Link } from 'react-router-dom';
import axios from '../api/axios';
import { Calendar, User, BookOpen, Play, FileText } from 'lucide-react';
import predigerImage from '../assets/prediger.png'; // ✅ 이미지 import

function Home() {
  const [latestSermons, setLatestSermons] = useState([]);
  const [latestPosts, setLatestPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const sermonsResponse = await axios.get('/sermons/', {
        params: { ordering: '-sermon_date', limit: 2 }
      });
      setLatestSermons(sermonsResponse.data.results?.slice(0, 2) || sermonsResponse.data.slice(0, 2) || []);
      
      const postsResponse = await axios.get('/board/posts/', {
        params: { ordering: '-created_at', limit: 3 }
      });
      setLatestPosts(postsResponse.data.results?.slice(0, 3) || postsResponse.data.slice(0, 3) || []);
      
    } catch (error) {
      console.error('데이터 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <HeroSection />
      
      {/* Latest Sermon Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-light mb-4 font-dodum">
              최근설교
            </h2>
            <div className="w-16 h-px bg-gray-400 mx-auto mb-6" />
            <p className="text-gray-600 max-w-2xl mx-auto leading-relaxed">
              독일 함부르크 Arche 교회의 설교를 한국어로 통역·번역하여 제공합니다
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-600"></div>
            </div>
          ) : latestSermons.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
              {latestSermons.map((sermon, index) => (
                <Link 
                  key={sermon.id}
                  to={`/sermons/${sermon.id}`}
                  className="group relative overflow-hidden rounded-xl shadow-xl hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-1"
                >
                  {/* 배경 이미지 + 그라데이션 오버레이 */}
                  <div className="relative h-96 overflow-hidden rounded-xl">
                    {/* 배경 이미지 */}
                    <div 
                      className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                      style={{ 
                        backgroundImage: `url(${predigerImage})`,
                      }}
                    />
                    
                    {/* 그라데이션 오버레이 */}
                    <div 
                      className="absolute inset-0 transition-opacity duration-300"
                      style={{ 
                        background: index === 0 
                          ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.85) 0%, rgba(118, 75, 162, 0.90) 100%)' 
                          : 'linear-gradient(135deg, rgba(59, 130, 246, 0.85) 0%, rgba(37, 99, 235, 0.90) 100%)'
                      }}
                    />
                    
                    {/* 호버 시 어두워지는 효과 */}
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-300" />
                    
                    {/* 콘텐츠 */}
                    <div className="absolute inset-0 flex flex-col justify-between p-8">
                      {/* 상단 레이블 */}
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full text-white text-xs uppercase tracking-wider font-semibold border border-white/30">
                          <Play className="w-3 h-3 mr-2" />
                          {index === 0 ? 'Latest Message' : 'Previous Message'}
                        </span>
                      </div>
                      
                      {/* 하단 정보 */}
                      <div className="text-white space-y-4">
                        <h3 className="text-3xl font-bold leading-tight line-clamp-2 drop-shadow-lg">
                          {sermon.title}
                        </h3>
                        
                        <div className="space-y-2">
                          <div className="flex items-center text-sm">
                            <Calendar className="w-4 h-4 mr-2 opacity-90" />
                            <span className="font-medium">
                              {new Date(sermon.sermon_date).toLocaleDateString('ko-KR', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}
                            </span>
                          </div>
                          
                          <div className="flex items-center text-sm">
                            <User className="w-4 h-4 mr-2 opacity-90" />
                            <span className="font-medium">{sermon.preacher}</span>
                          </div>
                          
                          <div className="flex items-center text-sm">
                            <BookOpen className="w-4 h-4 mr-2 opacity-90" />
                            <span className="font-bold text-base">{sermon.bible_reference}</span>
                          </div>
                        </div>
                        
                        {/* 재생 버튼 */}
                        <div className="pt-4">
                          <span className="inline-flex items-center px-6 py-2 bg-white/90 text-gray-800 rounded-full text-sm font-semibold group-hover:bg-white transition-all duration-300 shadow-lg">
                            <Play className="w-4 h-4 mr-2" />
                            설교 듣기
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">등록된 설교가 없습니다</p>
            </div>
          )}

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
              style={{ fontFamily: "'Gowun Batang', serif" }}
            >
              "진리를 알지니 진리가 너희를 자유롭게 하리라"
            </p>
            <footer className="text-gray-600 text-sm uppercase tracking-wider">
              요한복음 8:32
            </footer>
          </blockquote>
        </div>
      </section>

      {/* Blog Preview - 기존 코드 유지 */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center mb-12">
            <h2 className="text-4xl font-light font-dodum">
              블로그 소식
            </h2>
            <Link
              to="/blog"
              className="text-sm uppercase tracking-wider text-gray-600 hover:text-gray-900 transition"
            >
              View All →
            </Link>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-600"></div>
            </div>
          ) : latestPosts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {latestPosts.map((post) => (
                <Link
                  key={post.id}
                  to={`/post/${post.id}`}
                  className="group bg-white overflow-hidden hover:shadow-lg transition duration-300"
                >
                  <div className="h-48 bg-gradient-to-br from-gray-200 to-gray-300 overflow-hidden">
                    {post.image_url ? (
                      <img 
                        src={post.image_url} 
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-gray-400 text-center">
                          <BookOpen className="w-12 h-12 mx-auto mb-2 opacity-40" />
                          <p className="text-sm font-medium">Blog Post</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-6">
                    <p className="text-xs uppercase tracking-wider text-gray-500 mb-2 flex items-center">
                      <Calendar className="w-3 h-3 mr-1" />
                      {new Date(post.created_at).toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                    <h3 className="text-xl font-light mb-2 group-hover:text-gray-600 transition line-clamp-2">
                      {post.title}
                    </h3>
                    <p className="text-gray-600 text-sm leading-relaxed line-clamp-3">
                      {post.content || '내용 없음'}
                    </p>
                    <div className="mt-3 flex items-center text-xs text-gray-500">
                      <User className="w-3 h-3 mr-1" />
                      {post.author}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">등록된 블로그 포스트가 없습니다</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default Home;