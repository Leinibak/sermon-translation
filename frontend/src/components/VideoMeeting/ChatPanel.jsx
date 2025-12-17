// frontend/src/components/VideoMeeting/ChatPanel.jsx (모바일 최적화 버전)
import React, { useState, useEffect } from 'react';
import { X, Send, MessageCircle, Loader } from 'lucide-react';

export function ChatPanel({ 
  isOpen, 
  messages, 
  loading,
  currentUser,
  messagesEndRef,
  onSendMessage, 
  onClose 
}) {
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!inputValue.trim() || sending) return;

    try {
      setSending(true);
      await onSendMessage(inputValue.trim());
      setInputValue('');
    } catch (error) {
      console.error('메시지 전송 실패:', error);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (!isOpen) return null;

  // 모바일: 전체 화면 오버레이
  if (isMobile) {
    return (
      <>
        {/* 배경 오버레이 */}
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={onClose}
        />
        
        {/* 채팅 패널 */}
        <div className="fixed inset-x-0 bottom-0 h-[85vh] bg-gray-800 rounded-t-2xl flex flex-col z-50 animate-slide-up">
          
          {/* 헤더 */}
          <div className="bg-gray-900 p-4 flex justify-between items-center border-b border-gray-700 rounded-t-2xl">
            <div className="flex items-center">
              <MessageCircle className="w-5 h-5 text-blue-400 mr-2" />
              <h3 className="text-white font-semibold">채팅</h3>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition p-2"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* 메시지 목록 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading ? (
              <div className="flex justify-center items-center h-full">
                <Loader className="w-6 h-6 text-gray-400 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center text-gray-400 mt-10">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>아직 메시지가 없습니다</p>
                <p className="text-sm mt-1">첫 메시지를 보내보세요!</p>
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <ChatMessage 
                    key={message.id} 
                    message={message}
                    isMe={message.is_mine || message.sender_username === currentUser?.username}
                    isMobile={true}
                  />
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* 입력 영역 */}
          <form 
            onSubmit={handleSubmit}
            className="p-4 bg-gray-900 border-t border-gray-700"
          >
            <div className="flex items-end gap-2">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="메시지를 입력하세요..."
                rows={2}
                className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-base"
                disabled={sending}
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || sending}
                className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {sending ? (
                  <Loader className="w-6 h-6 animate-spin" />
                ) : (
                  <Send className="w-6 h-6" />
                )}
              </button>
            </div>
          </form>
        </div>
      </>
    );
  }

  // 데스크톱: 우측 사이드바
  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-gray-800 border-l border-gray-700 flex flex-col z-40">
      
      {/* 헤더 */}
      <div className="bg-gray-900 p-4 flex justify-between items-center border-b border-gray-700">
        <div className="flex items-center">
          <MessageCircle className="w-5 h-5 text-blue-400 mr-2" />
          <h3 className="text-white font-semibold">채팅</h3>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 메시지 목록 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <Loader className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-400 mt-10">
            <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>아직 메시지가 없습니다</p>
            <p className="text-sm mt-1">첫 메시지를 보내보세요!</p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessage 
                key={message.id} 
                message={message}
                isMe={message.is_mine || message.sender_username === currentUser?.username}
                isMobile={false}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* 입력 영역 */}
      <form 
        onSubmit={handleSubmit}
        className="p-4 bg-gray-900 border-t border-gray-700"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="메시지를 입력하세요..."
            rows={2}
            className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || sending}
            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {sending ? (
              <Loader className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Enter: 전송 | Shift + Enter: 줄바꿈
        </p>
      </form>
    </div>
  );
}

/**
 * 개별 채팅 메시지 컴포넌트
 */
function ChatMessage({ message, isMe, isMobile }) {
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
      <div className={`${isMobile ? 'max-w-[80%]' : 'max-w-[70%]'} ${isMe ? 'order-2' : 'order-1'}`}>
        
        {/* 발신자 이름 (내가 보낸 메시지가 아닐 때만) */}
        {!isMe && (
          <p className={`text-gray-400 mb-1 px-1 ${isMobile ? 'text-xs' : 'text-xs'}`}>
            {message.sender_username}
          </p>
        )}
        
        {/* 메시지 버블 */}
        <div
          className={`rounded-lg px-3 py-2 ${
            isMe
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-white'
          } ${isMobile ? 'text-base' : 'text-sm'}`}
        >
          <p className="whitespace-pre-wrap break-words">
            {message.content}
          </p>
        </div>
        
        {/* 시간 */}
        <p className={`text-gray-500 mt-1 px-1 ${isMobile ? 'text-xs' : 'text-xs'} ${isMe ? 'text-right' : 'text-left'}`}>
          {formatTime(message.created_at)}
        </p>
      </div>
    </div>
  );
}

/**
 * 채팅 토글 버튼 (ControlBar에 추가용) - 읽지 않은 메시지 표시
 */
export function ChatToggleButton({ onClick, unreadCount = 0 }) {
  return (
    <button
      onClick={onClick}
      className="relative p-2 md:p-3 bg-white text-gray-900 rounded-full hover:bg-gray-200 transition"
      title="채팅 열기"
    >
      <MessageCircle className="w-5 h-5 md:w-6 md:h-6" />
      
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform bg-red-600 rounded-full min-w-[20px] animate-pulse">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}