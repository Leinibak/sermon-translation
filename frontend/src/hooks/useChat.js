// frontend/src/hooks/useChat.js
import { useState, useEffect, useCallback, useRef } from 'react';
import axios from '../api/axios';

export function useChat(roomId, currentUser) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const messagesEndRef = useRef(null);

  /**
   * 채팅 메시지 불러오기
   */
  const fetchMessages = useCallback(async () => {
    try {
      const response = await axios.get(`/video-meetings/${roomId}/chat_messages/`);
      setMessages(response.data);
      setLoading(false);
    } catch (error) {
      console.error('❌ 채팅 메시지 로딩 실패:', error);
      setLoading(false);
    }
  }, [roomId]);

  /**
   * 메시지 전송
   */
  const sendMessage = useCallback(async (content) => {
    if (!content.trim()) return;

    try {
      const response = await axios.post(
        `/video-meetings/${roomId}/send_chat_message/`,
        { content: content.trim() }
      );

      console.log('✅ 메시지 전송 완료:', response.data);
      
      // 낙관적 업데이트 (이미 WebSocket으로 받을 예정)
      return response.data;
    } catch (error) {
      console.error('❌ 메시지 전송 실패:', error);
      alert('메시지 전송에 실패했습니다.');
      throw error;
    }
  }, [roomId]);

  /**
   * WebSocket 메시지 수신 처리
   */
  const handleChatMessage = useCallback((messageData) => {
    console.log('💬 실시간 메시지 수신:', messageData);

    const newMessage = {
      id: messageData.message_id,
      sender: messageData.sender,
      sender_username: messageData.sender,
      content: messageData.content,
      message_type: 'text',
      created_at: messageData.created_at,
      is_mine: messageData.sender === currentUser?.username
    };

    setMessages(prev => {
      // 중복 방지
      if (prev.some(msg => msg.id === newMessage.id)) {
        return prev;
      }
      return [...prev, newMessage];
    });

    // 채팅이 닫혀있으면 읽지 않음 카운트 증가
    if (!isChatOpen && newMessage.sender !== currentUser?.username) {
      setUnreadCount(prev => prev + 1);
    }

    // 자동 스크롤
    setTimeout(() => scrollToBottom(), 100);
  }, [currentUser, isChatOpen]);

  /**
   * 채팅 열기/닫기
   */
  const toggleChat = useCallback(() => {
    setIsChatOpen(prev => !prev);
    
    // 채팅을 열면 읽지 않음 카운트 초기화
    if (!isChatOpen) {
      setUnreadCount(0);
    }
  }, [isChatOpen]);

  /**
   * 스크롤을 최하단으로
   */
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  /**
   * 초기 메시지 로드
   */
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  /**
   * 채팅이 열려있을 때 자동 스크롤
   */
  useEffect(() => {
    if (isChatOpen && messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, isChatOpen, scrollToBottom]);

  return {
    messages,
    loading,
    unreadCount,
    isChatOpen,
    messagesEndRef,
    sendMessage,
    handleChatMessage,
    toggleChat,
    scrollToBottom
  };
}