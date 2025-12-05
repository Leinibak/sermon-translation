// frontend/src/hooks/useReactions.js
import { useState, useCallback, useRef } from 'react';
import axios from '../api/axios';

export function useReactions(roomId) {
  const [activeReactions, setActiveReactions] = useState([]);
  const reactionIdCounter = useRef(0);

  /**
   * 반응 전송
   */
  const sendReaction = useCallback(async (emoji) => {
    try {
      await axios.post(`/video-meetings/${roomId}/send_reaction/`, {
        reaction_type: emoji
      });

      console.log('✅ 반응 전송 완료:', emoji);
    } catch (error) {
      console.error('❌ 반응 전송 실패:', error);
    }
  }, [roomId]);

  /**
   * WebSocket으로 받은 반응 처리
   */
  const handleReactionNotification = useCallback((username, emoji) => {
    console.log('👍 반응 수신:', username, emoji);

    const reactionId = reactionIdCounter.current++;

    const newReaction = {
      id: reactionId,
      username,
      emoji,
      timestamp: Date.now()
    };

    setActiveReactions(prev => [...prev, newReaction]);

    // 3초 후 애니메이션과 함께 제거
    setTimeout(() => {
      setActiveReactions(prev => prev.filter(r => r.id !== reactionId));
    }, 3000);
  }, []);

  return {
    activeReactions,
    sendReaction,
    handleReactionNotification
  };
}