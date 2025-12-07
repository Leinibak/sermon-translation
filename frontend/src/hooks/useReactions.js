// frontend/src/hooks/useReactions.js
import { useState, useCallback, useRef } from 'react';
import axios from '../api/axios';

export function useReactions(roomId) {
  const [activeReactions, setActiveReactions] = useState([]);
  const reactionIdCounter = useRef(0);

  /**
   * 반응 전송
   */
  const sendReaction = useCallback(async (reactionType) => {
    try {
      console.log('👍 반응 전송:', reactionType);

      await axios.post(`/video-meetings/${roomId}/reactions/send/`, {
        reaction_type: reactionType
      });

      console.log('✅ 반응 전송 완료');
    } catch (error) {
      console.error('❌ 반응 전송 실패:', error);
    }
  }, [roomId]);

  /**
   * 실시간 반응 수신 처리
   */
  const handleReactionNotification = useCallback((reaction) => {
    console.log('🎉 반응 수신:', reaction.username, reaction.reaction);

    // 고유 ID 생성
    const id = `reaction-${Date.now()}-${reactionIdCounter.current++}`;

    // 반응을 활성 목록에 추가
    const newReaction = {
      id,
      emoji: reaction.reaction,
      username: reaction.username,
      timestamp: Date.now()
    };

    setActiveReactions(prev => [...prev, newReaction]);

    // 3초 후 자동 제거
    setTimeout(() => {
      setActiveReactions(prev => prev.filter(r => r.id !== id));
    }, 3000);
  }, []);

  /**
   * 반응 정리 (메모리 누수 방지)
   */
  const cleanupReactions = useCallback(() => {
    setActiveReactions([]);
  }, []);

  return {
    activeReactions,
    sendReaction,
    handleReactionNotification,
    cleanupReactions
  };
}