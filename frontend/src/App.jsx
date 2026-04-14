// ============================================================
// frontend/src/App.jsx  (주님의 음성 라우팅 수정본)
//
// 변경사항 요약:
//   /sayings          → SayingsHomePage  (슬라이드 홈, 신규)
//   /sayings/list     → SayingListPage   (전체 말씀 목록, 경로 변경)
//   /sayings/books    → SayingListPage   (복음서별 = 목록 + book 필터)
//   /sayings/themes   → ThemePage        (기존 유지)
//   /sayings/parallels→ ParallelPage     (기존 유지)
//   /sayings/meditations→MeditationPage  (기존 유지)
//   /sayings/:id      → SayingDetailPage (개선됨)
// ============================================================

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import Navbar from "./components/Navbar";
import Home from "./pages/Home.jsx";
import PostList from './components/PostList';
import PostDetail from './components/PostDetail';
import PostForm from './components/PostForm';
import Login from './components/Login';
import Footer from "./components/Footer";
import Register from "./components/Register";
import SermonList from './components/SermonList';
import SermonDetail from './components/SermonDetail';
import SermonUpload from './components/SermonUpload';
import PastoralLetterList from './components/PastoralLetterList';
import PastoralLetterDetail from './components/PastoralLetterDetail';
import VideoMeetingList from './components/VideoMeetingList';
import VideoMeetingRoom from './components/VideoMeetingRoom';

// ── 주님의 음성 페이지들 ──────────────────────────────────
import SayingsHomePage  from './pages/SayingsHomePage';      // ★ 신규
import SayingListPage   from './pages/SayingListPage';
import SayingDetailPage from './pages/SayingDetailPage';
import BibleExplorerPage from './pages/BibleExplorerPage';
import { ThemePage, ParallelPage, MeditationPage } from './pages/SayingsSubPages';


function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  return isAuthenticated ? children : <Navigate to="/login" />;
}

function AppLayout({ children }) {
  const location = useLocation();
  const isVideoRoom = /^\/video-meetings\/[^/]+/.test(location.pathname);

  if (isVideoRoom) {
    return (
      <div className="min-h-screen flex flex-col">
        <main className="flex-grow">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-between">
      <main className="flex-grow">{children}</main>
      <Footer />
    </div>
  );
}

function AppContent() {
  const { user, logout, isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route path="/" element={<PostList />} />
        <Route path="/post/:id" element={<PostDetail />} />
        <Route path="/login" element={<Login />} />
        <Route path="/create" element={<PrivateRoute><PostForm /></PrivateRoute>} />
        <Route path="/edit/:id" element={<PrivateRoute><PostForm /></PrivateRoute>} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollToTop />
        <Navbar />
        <AppLayout>
          <Routes>
            <Route path="/" element={<Home />} />

            {/* Sermons */}
            <Route path="/sermons" element={<SermonList />} />
            <Route path="/sermons/:id" element={<SermonDetail />} />
            <Route path="/sermons/upload" element={<PrivateRoute><SermonUpload /></PrivateRoute>} />
            <Route path="/sermons/edit/:id" element={<PrivateRoute><SermonUpload /></PrivateRoute>} />

            {/* Pastoral Letters */}
            <Route path="/pastoral-letters" element={<PastoralLetterList />} />
            <Route path="/pastoral-letters/:id" element={<PastoralLetterDetail />} />

            {/* Blog */}
            <Route path="/blog" element={<PostList />} />
            <Route path="/post/:id" element={<PostDetail />} />
            <Route path="/edit/:id" element={<PrivateRoute><PostForm /></PrivateRoute>} />
            <Route path="/create" element={<PrivateRoute><PostForm /></PrivateRoute>} />

            {/* Video Meetings */}
            <Route path="/video-meetings" element={<PrivateRoute><VideoMeetingList /></PrivateRoute>} />
            <Route path="/video-meetings/:id" element={<PrivateRoute><VideoMeetingRoom /></PrivateRoute>} />

            {/* Auth */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* ── 주님의 음성 ── */}
            {/* /sayings → 슬라이드 홈 (SayingSlide 전면 배치) */}
            <Route path="/sayings"              element={<SayingsHomePage />} />
            {/* /sayings/list → 전체 말씀 목록 + 검색/필터 */}
            <Route path="/sayings/list"         element={<SayingListPage />} />
            {/* /sayings/books → 목록과 동일, book 파라미터로 필터 */}
            <Route path="/sayings/books"        element={<SayingListPage />} />
            {/* /sayings/themes → 14개 주제 카드 */}
            <Route path="/sayings/themes"       element={<ThemePage />} />
            {/* /sayings/parallels → 4복음서 병행구절 비교 */}
            <Route path="/sayings/parallels"    element={<ParallelPage />} />
            {/* /sayings/meditations → 내 묵상 노트 (로그인 필요) */}
            <Route path="/sayings/meditations"  element={<MeditationPage />} />
            <Route path="/sayings/bible-explorer" element={<BibleExplorerPage />} />
            {/* /sayings/:id → 말씀 상세 (반드시 맨 마지막에!) */}
            <Route path="/sayings/:id"          element={<SayingDetailPage />} />

          </Routes>
        </AppLayout>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;