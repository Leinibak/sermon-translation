// frontend/src/hooks/useChat.js (수정 버전)
import { useState, useEffect, useRef, useCallback } from 'react';
import axios from '../api/axios';

export function useChat(roomId, currentUser) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  
  const messagesEndRef = useRef(null);
  const lastMessageIdRef = useRef(null); // ⭐ 추가 (누락되어 있던 부분)
  const pollingIntervalRef = useRef(null);
  const isMountedRef = useRef(true);

  // 스크롤 하단으로 이동
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // 채팅 메시지 조회
  const fetchMessages = useCallback(async () => {
    if (!roomId) return;
    
    try {
      setLoading(true);
      
      const response = await axios.get(
        `/video-meetings/${roomId}/chat/messages/`
      );
      
      const newMessages = response.data;
      
      if (!isMountedRef.current) return;
      
      setMessages(newMessages);
      
      // 마지막 메시지 ID 저장
      if (newMessages.length > 0) {
        lastMessageIdRef.current = newMessages[newMessages.length - 1].id;
      }
      
      // 읽지 않은 메시지 카운트 (채팅창이 닫혀있을 때만)
      if (!isChatOpen) {
        const unreadMessages = newMessages.filter(
          msg => !msg.is_mine && msg.sender_username !== currentUser?.username
        );
        setUnreadCount(unreadMessages.length);
      } else {
        setUnreadCount(0);
      }
      
      // 새 메시지가 있으면 스크롤
      setTimeout(scrollToBottom, 100);
      
      console.log(`💬 채팅 메시지: ${newMessages.length}개`);
    } catch (error) {
      console.error('❌ 채팅 메시지 로딩 실패:', error);
      
      // 에러 상세 로그
      if (error.response) {
        console.error('Response data:', error.response.data);
        console.error('Response status:', error.response.status);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [roomId, isChatOpen, currentUser, scrollToBottom]);

  // 메시지 전송
  const sendMessage = useCallback(async (content) => {
    if (!content.trim() || !roomId) {
      console.warn('⚠️ 메시지가 비어있거나 roomId가 없습니다');
      return;
    }

    try {
      console.log('📤 메시지 전송:', content);
      
      const response = await axios.post(
        `/video-meetings/${roomId}/chat/send/`,
        { content: content.trim() }
      );
      
      console.log('✅ 메시지 전송 완료:', response.data);
      
      // 즉시 메시지 목록에 추가 (낙관적 업데이트)
      const newMessage = response.data;
      setMessages(prev => [...prev, newMessage]);
      lastMessageIdRef.current = newMessage.id;
      
      // 스크롤
      setTimeout(scrollToBottom, 100);
      
      // 서버에서 최신 메시지 다시 가져오기 (동기화)
      setTimeout(fetchMessages, 500);
      
    } catch (error) {
      console.error('❌ 메시지 전송 실패:', error);
      
      if (error.response) {
        alert(`메시지 전송 실패: ${error.response.data?.detail || '알 수 없는 오류'}`);
      } else {
        alert('메시지 전송 실패: 네트워크 오류');
      }
      
      throw error;
    }
  }, [roomId, scrollToBottom, fetchMessages]);

  // 채팅 토글
  const toggleChat = useCallback(() => {
    setIsChatOpen(prev => {
      const newState = !prev;
      
      // 채팅을 열 때 읽지 않은 메시지 카운트 초기화
      if (newState) {
        setUnreadCount(0);
        setTimeout(scrollToBottom, 100);
      }
      
      return newState;
    });
  }, [scrollToBottom]);

  // 초기 메시지 로드
  useEffect(() => {
    fetchMessages();
    
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchMessages]);

  // 주기적 폴링 (5초마다)
  useEffect(() => {
    if (!roomId) return;
    
    pollingIntervalRef.current = setInterval(() => {
      fetchMessages();
    }, 5000);
    
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [roomId, fetchMessages]);

  // 채팅 열림 상태 변경 시 읽지 않은 메시지 초기화
  useEffect(() => {
    if (isChatOpen) {
      setUnreadCount(0);
    }
  }, [isChatOpen]);

  return {
    messages,
    loading,
    isChatOpen,
    unreadCount,
    messagesEndRef,
    sendMessage,
    toggleChat,
    fetchMessages,
  };
}