// frontend/src/hooks/useRaiseHand.js
import { useState, useCallback, useEffect } from 'react';
import axios from '../api/axios';

export function useRaiseHand(roomId, currentUser) {
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState([]);

  /**
   * 손든 사용자 목록 조회
   */
  const fetchRaisedHands = useCallback(async () => {
    try {
      const response = await axios.get(`/video-meetings/${roomId}/raised-hands/`);
      setRaisedHands(response.data);
      
      // 내가 손을 들었는지 확인
      const myHand = response.data.find(h => h.username === currentUser?.username);
      setIsHandRaised(!!myHand);
      
      console.log(`✋ 손든 사용자 ${response.data.length}명`);
    } catch (error) {
      console.error('❌ 손들기 목록 조회 실패:', error);
    }
  }, [roomId, currentUser]);

  /**
   * 손들기
   */
  const raiseHand = useCallback(async () => {
    try {
      console.log('✋ 손들기...');

      await axios.post(`/video-meetings/${roomId}/raise-hand/`);

      setIsHandRaised(true);
      console.log('✅ 손들기 완료');

      // 목록 갱신
      await fetchRaisedHands();
    } catch (error) {
      console.error('❌ 손들기 실패:', error);
      
      if (error.response?.data?.detail) {
        alert(error.response.data.detail);
      }
    }
  }, [roomId, fetchRaisedHands]);

  /**
   * 손내리기
   */
  const lowerHand = useCallback(async () => {
    try {
      console.log('👋 손내리기...');

      await axios.post(`/video-meetings/${roomId}/lower-hand/`);

      setIsHandRaised(false);
      console.log('✅ 손내리기 완료');

      // 목록 갱신
      await fetchRaisedHands();
    } catch (error) {
      console.error('❌ 손내리기 실패:', error);
      
      if (error.response?.data?.detail) {
        alert(error.response.data.detail);
      }
    }
  }, [roomId, fetchRaisedHands]);

  /**
   * 실시간 손들기 알림 처리
   */
  const handleHandRaiseNotification = useCallback((data) => {
    console.log(`✋ 손들기 알림: ${data.username} - ${data.action}`);

    if (data.action === 'raise') {
      // 손들기
      setRaisedHands(prev => {
        // 중복 확인
        const exists = prev.some(h => h.username === data.username);
        if (exists) {
          return prev;
        }

        return [
          ...prev,
          {
            username: data.username,
            raised_at: new Date().toISOString(),
            is_active: true
          }
        ];
      });

      // 내가 손을 들었으면
      if (data.username === currentUser?.username) {
        setIsHandRaised(true);
      }
    } else if (data.action === 'lower') {
      // 손내리기
      setRaisedHands(prev => prev.filter(h => h.username !== data.username));

      // 내가 손을 내렸으면
      if (data.username === currentUser?.username) {
        setIsHandRaised(false);
      }
    }
  }, [currentUser]);

  /**
   * 초기 데이터 로드
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