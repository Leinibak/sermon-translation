// ============================================
// frontend/src/App.jsx (수정)
// ============================================
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import "./pdfConfig";
import VideoMeetingList from './components/VideoMeetingList'; 
import VideoMeetingRoom from './components/VideoMeetingRoom';


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

function AppContent() {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const handleSelectPost = (id) => {
    navigate(`/post/${id}`);
  };

  const handleCreatePost = () => {
    navigate('/create');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-blue-800 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <Link to="/" className="flex items-center">
              <h1 className="text-3xl font-bold text-white">📝 Simple Web Board</h1>
            </Link>
            <nav className="flex items-center space-x-4">
              <Link
                to="/"
                className="px-4 py-2 text-white hover:bg-blue-700 rounded-lg transition duration-200"
              >
                게시글 목록
              </Link>
              {isAuthenticated ? (
                <>
                  <span className="text-white">{user?.username}님</span>
                  <button
                    onClick={logout}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition duration-200"
                  >
                    로그아웃
                  </button>
                </>
              ) : (
                <Link
                  to="/login"
                  className="px-4 py-2 bg-white text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition duration-200"
                >
                  로그인
                </Link>
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Routes>
          <Route
            path="/"
            element={<PostList onSelect={handleSelectPost} onCreate={handleCreatePost} />}
          />
          <Route path="/post/:id" element={<PostDetail />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/create"
            element={
              <PrivateRoute>
                <PostForm />
              </PrivateRoute>
            }
          />
          <Route
            path="/edit/:id"
            element={
              <PrivateRoute>
                <PostForm />
              </PrivateRoute>
            }
          />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-white mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-sm">© 2025 Simple Web Board. Powered by Django & React.</p>
        </div>
      </footer>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollToTop />
        <Navbar />
        <div className="pt-8 min-h-screen flex flex-col justify-between">
          <main className="flex-grow">
            <Routes>
              <Route path="/" element={<Home />} />
              
              {/* Sermons 라우팅 */}
              <Route path="/sermons" element={<SermonList />} />
              <Route path="/sermons/:id" element={<SermonDetail />} />
              <Route path="/sermons/upload" element={
                <PrivateRoute>
                  <SermonUpload />
                </PrivateRoute>
              } />
              <Route path="/sermons/edit/:id" element={
                <PrivateRoute>
                  <SermonUpload />
                </PrivateRoute>
              } />
              
              {/* ✅ Pastoral Letters 라우팅 */}
              <Route path="/pastoral-letters" element={
                <PrivateRoute>
                  <PastoralLetterList />
                </PrivateRoute>
              } />
              <Route path="/pastoral-letters/:id" element={
                <PrivateRoute>
                  <PastoralLetterDetail />
                </PrivateRoute>
              } />
              
              {/* Blog 라우팅 */}
              <Route path="/blog" element={<PostList />} />
              <Route path="/post/:id" element={<PostDetail />} />
              <Route path="/edit/:id" element={
                <PrivateRoute>
                  <PostForm />
                </PrivateRoute>
              } />
              <Route path="/create" element={
                <PrivateRoute>
                  <PostForm />
                </PrivateRoute>
              } />


              {/* Video Meetings 라우팅 */}
              <Route path="/video-meetings" element={
                <PrivateRoute>
                  <VideoMeetingList />
                </PrivateRoute>
              } />
              <Route path="/video-meetings/:id" element={
                <PrivateRoute>
                  <VideoMeetingRoom />
                </PrivateRoute>
              } />

              {/* Auth 라우팅 */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
            </Routes> 
          </main>
          <Footer />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
