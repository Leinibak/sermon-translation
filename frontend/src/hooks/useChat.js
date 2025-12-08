// frontend/src/hooks/useChat.js
import { useState, useRef, useEffect, useCallback } from 'react';
import axios from '../api/axios';

export function useChat(roomId, currentUser) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  
  const messagesEndRef = useRef(null);
  const lastFetchTimeRef = useRef(Date.now());
  const pollingIntervalRef = useRef(null);

  /**
   * 채팅 메시지 목록 로드
   */
  const fetchMessages = useCallback(async () => {
    if (!roomId) return;

    try {
      setLoading(true);
      const response = await axios.get(`/video-meetings/${roomId}/chat/messages/`);
      
      setMessages(response.data);
      lastFetchTimeRef.current = Date.now();
      
      console.log(`💬 채팅 메시지 로드: ${response.data.length}개`);
    } catch (error) {
      console.error('❌ 채팅 메시지 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  /**
   * 새 메시지 폴링
   */
  const pollNewMessages = useCallback(async () => {
    if (!roomId) return;

    try {
      const response = await axios.get(`/video-meetings/${roomId}/chat/messages/`);
      const newMessages = response.data;

      setMessages(prevMessages => {
        // 기존 메시지 ID 추출
        const existingIds = new Set(prevMessages.map(m => m.id));
        
        // 새로운 메시지만 필터링
        const trulyNewMessages = newMessages.filter(m => !existingIds.has(m.id));
        
        if (trulyNewMessages.length > 0) {
          console.log(`💬 새 메시지 ${trulyNewMessages.length}개 수신`);
          
          // 채팅창이 닫혀있으면 읽지 않은 메시지 카운트 증가
          if (!isChatOpen) {
            setUnreadCount(prev => prev + trulyNewMessages.length);
          }
          
          return [...prevMessages, ...trulyNewMessages];
        }
        
        return prevMessages;
      });
    } catch (error) {
      console.error('❌ 새 메시지 폴링 실패:', error);
    }
  }, [roomId, isChatOpen]);

  /**
   * 메시지 전송
   */
  const sendMessage = useCallback(async (content) => {
    if (!content.trim() || !roomId) {
      console.warn('⚠️ 메시지 내용 없음');
      return;
    }

    try {
      const response = await axios.post(`/video-meetings/${roomId}/chat/send/`, {
        content: content.trim()
      });

      console.log('✅ 메시지 전송 성공:', response.data.id);

      // 즉시 메시지 목록에 추가
      setMessages(prev => [...prev, response.data]);

      // 스크롤을 맨 아래로
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);

      return response.data;
    } catch (error) {
      console.error('❌ 메시지 전송 실패:', error);
      throw error;
    }
  }, [roomId]);

  /**
   * 채팅 패널 토글
   */
  const toggleChat = useCallback(() => {
    setIsChatOpen(prev => {
      const newState = !prev;
      
      // 채팅창을 열면 읽지 않은 메시지 카운트 초기화
      if (newState) {
        setUnreadCount(0);
      }
      
      return newState;
    });
  }, []);

  /**
   * 초기 로드 및 폴링 시작
   */
  useEffect(() => {
    if (!roomId) return;

    // 초기 메시지 로드
    fetchMessages();

    // 3초마다 새 메시지 확인
    pollingIntervalRef.current = setInterval(pollNewMessages, 3000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [roomId, fetchMessages, pollNewMessages]);

  /**
   * 자동 스크롤
   */
  useEffect(() => {
    if (messages.length > 0 && isChatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isChatOpen]);

  return {
    messages,
    loading,
    isChatOpen,
    unreadCount,
    messagesEndRef,
    sendMessage,
    toggleChat,
    fetchMessages
  };
}