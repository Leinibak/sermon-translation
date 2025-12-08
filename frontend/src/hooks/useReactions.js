// frontend/src/hooks/useReactions.js
import { useState, useCallback } from 'react';
import axios from '../api/axios';

let globalReactionIdCounter = 0;

export function useReactions(roomId) {
  const [activeReactions, setActiveReactions] = useState([]);

  /**
   * 반응 전송
   */
  const sendReaction = useCallback(async (emoji) => {
    if (!roomId || !emoji) {
      console.warn('⚠️ roomId 또는 emoji 없음');
      return;
    }

    try {
      console.log(`👍 반응 전송: ${emoji}`);

      // 서버에 반응 전송
      await axios.post(`/video-meetings/${roomId}/reactions/send/`, {
        reaction_type: emoji
      });

      console.log('✅ 반응 전송 성공');
    } catch (error) {
      console.error('❌ 반응 전송 실패:', error);
    }
  }, [roomId]);

  /**
   * 반응 애니메이션 표시
   * (WebSocket 또는 폴링으로 수신한 반응을 화면에 표시)
   */
  const displayReaction = useCallback((emoji, username) => {
    const reactionId = `reaction_${globalReactionIdCounter++}`;

    const newReaction = {
      id: reactionId,
      emoji,
      username,
      timestamp: Date.now()
    };

    console.log(`🎉 반응 표시: ${emoji} from ${username}`);

    setActiveReactions(prev => [...prev, newReaction]);

    // 3초 후 자동 제거
    setTimeout(() => {
      setActiveReactions(prev => prev.filter(r => r.id !== reactionId));
    }, 3000);
  }, []);

  /**
   * WebSocket 메시지로부터 반응 수신 처리
   */
  const handleReactionNotification = useCallback((data) => {
    const { username, reaction } = data;

    if (username && reaction) {
      displayReaction(reaction, username);
    }
  }, [displayReaction]);

  return {
    activeReactions,
    sendReaction,
    displayReaction,
    handleReactionNotification
  };
}