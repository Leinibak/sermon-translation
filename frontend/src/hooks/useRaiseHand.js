// frontend/src/hooks/useRaiseHand.js
import { useState, useCallback, useEffect } from 'react';
import axios from '../api/axios';

export function useRaiseHand(roomId, currentUser) {
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState([]);

  /**
   * 손들기
   */
  const raiseHand = useCallback(async () => {
    try {
      await axios.post(`/video-meetings/${roomId}/raise_hand/`);
      setIsHandRaised(true);
      console.log('✋ 손들기 완료');
    } catch (error) {
      console.error('❌ 손들기 실패:', error);
      alert('손들기에 실패했습니다.');
    }
  }, [roomId]);

  /**
   * 손내리기
   */
  const lowerHand = useCallback(async () => {
    try {
      await axios.post(`/video-meetings/${roomId}/lower_hand/`);
      setIsHandRaised(false);
      console.log('✋ 손내리기 완료');
    } catch (error) {
      console.error('❌ 손내리기 실패:', error);
    }
  }, [roomId]);

  /**
   * 손든 사용자 목록 가져오기
   */
  const fetchRaisedHands = useCallback(async () => {
    try {
      const response = await axios.get(`/video-meetings/${roomId}/raised_hands/`);
      setRaisedHands(response.data);
      
      // 내가 손들었는지 확인
      const myHand = response.data.find(
        hand => hand.username === currentUser?.username
      );
      setIsHandRaised(!!myHand);
    } catch (error) {
      console.error('❌ 손든 사용자 목록 로딩 실패:', error);
    }
  }, [roomId, currentUser]);

  /**
   * WebSocket 손들기 알림 처리
   */
  const handleHandRaiseNotification = useCallback((action, username) => {
    console.log('✋ 손들기 알림:', action, username);

    if (action === 'raise') {
      setRaisedHands(prev => {
        // 중복 방지
        if (prev.some(hand => hand.username === username)) {
          return prev;
        }
        return [...prev, {
          username,
          raised_at: new Date().toISOString(),
          is_active: true
        }];
      });

      // 내가 손든 경우
      if (username === currentUser?.username) {
        setIsHandRaised(true);
      }
    } else if (action === 'lower') {
      setRaisedHands(prev => prev.filter(hand => hand.username !== username));

      // 내가 손내린 경우
      if (username === currentUser?.username) {
        setIsHandRaised(false);
      }
    }
  }, [currentUser]);

  /**
   * 초기 손든 사용자 목록 로드
   */
  useEffect(() => {
    fetchRaisedHands();
  }, [fetchRaisedHands]);

  return {
    isHandRaised,
    raisedHands,
    raiseHand,
    lowerHand,
    handleHandRaiseNotification,
    fetchRaisedHands
  };
}