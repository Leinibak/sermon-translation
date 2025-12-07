// frontend/src/hooks/useChat.js
import { useState, useRef, useEffect, useCallback } from 'react';
import axios from '../api/axios';

export function useChat(roomId, currentUser) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef(null);

  /**
   * 채팅 메시지 목록 불러오기
   */
  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/video-meetings/${roomId}/chat/messages/`);
      setMessages(response.data);
      console.log(`✅ 채팅 메시지 ${response.data.length}개 로드`);
    } catch (error) {
      console.error('❌ 채팅 메시지 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  /**
   * 메시지 전송
   */
  const sendMessage = useCallback(async (content) => {
    if (!content.trim()) {
      return;
    }

    try {
      console.log('💬 메시지 전송:', content.substring(0, 30) + '...');
      
      const response = await axios.post(`/video-meetings/${roomId}/chat/send/`, {
        content: content.trim()
      });

      // 메시지 목록에 추가
      const newMessage = response.data;
      setMessages(prev => [...prev, newMessage]);

      // 스크롤 하단으로
      setTimeout(() => {
        scrollToBottom();
      }, 100);

      console.log('✅ 메시지 전송 완료');
    } catch (error) {
      console.error('❌ 메시지 전송 실패:', error);
      throw error;
    }
  }, [roomId]);

  /**
   * 실시간 메시지 수신 처리
   */
  const handleNewMessage = useCallback((message) => {
    console.log('📩 실시간 메시지 수신:', message.sender);

    setMessages(prev => {
      // 중복 확인
      const isDuplicate = prev.some(m => m.id === message.message_id);
      if (isDuplicate) {
        return prev;
      }

      return [...prev, {
        id: message.message_id,
        sender_username: message.sender,
        content: message.content,
        created_at: message.created_at,
        is_mine: message.sender === currentUser?.username
      }];
    });

    // 채팅창이 닫혀있고 내가 보낸 메시지가 아니면 미읽음 카운트 증가
    if (!isChatOpen && message.sender !== currentUser?.username) {
      setUnreadCount(prev => prev + 1);
    }

    // 스크롤 하단으로
    setTimeout(() => {
      scrollToBottom();
    }, 100);
  }, [currentUser, isChatOpen]);

  /**
   * 채팅 패널 토글
   */
  const toggleChat = useCallback(() => {
    setIsChatOpen(prev => !prev);
    
    // 채팅창 열 때 미읽음 카운트 초기화
    if (!isChatOpen) {
      setUnreadCount(0);
    }
  }, [isChatOpen]);

  /**
   * 스크롤 하단으로 이동
   */
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'end'
      });
    }
  }, []);

  /**
   * 초기 메시지 로드
   */
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  /**
   * 채팅창 열릴 때 스크롤 하단으로
   */
  useEffect(() => {
    if (isChatOpen) {
      scrollToBottom();
    }
  }, [isChatOpen, scrollToBottom]);

  return {
    messages,
    loading,
    isChatOpen,
    unreadCount,
    messagesEndRef,
    sendMessage,
    handleNewMessage,
    toggleChat,
    fetchMessages
  };
}