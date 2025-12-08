// frontend/src/hooks/useRaiseHand.js
import { useState, useEffect, useCallback, useRef } from 'react';
import axios from '../api/axios';

export function useRaiseHand(roomId, currentUser) {
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState([]);
  
  const pollingIntervalRef = useRef(null);

  /**
   * 손든 사용자 목록 가져오기
   */
  const fetchRaisedHands = useCallback(async () => {
    if (!roomId) return;

    try {
      const response = await axios.get(`/video-meetings/${roomId}/raised-hands/`);
      
      setRaisedHands(response.data);
      
      // 내가 손을 들었는지 확인
      const myHandRaised = response.data.some(
        hand => hand.username === currentUser?.username && hand.is_active
      );
      setIsHandRaised(myHandRaised);
      
      console.log(`✋ 손든 사용자: ${response.data.length}명`);
    } catch (error) {
      console.error('❌ 손들기 목록 로드 실패:', error);
    }
  }, [roomId, currentUser]);

  /**
   * 손들기
   */
  const raiseHand = useCallback(async () => {
    if (!roomId || isHandRaised) {
      console.warn('⚠️ 이미 손을 들었거나 roomId 없음');
      return;
    }

    try {
      console.log('✋ 손들기...');
      
      await axios.post(`/video-meetings/${roomId}/raise-hand/`);
      
      setIsHandRaised(true);
      console.log('✅ 손들기 성공');
      
      // 목록 즉시 갱신
      await fetchRaisedHands();
    } catch (error) {
      console.error('❌ 손들기 실패:', error);
      
      if (error.response?.status === 400) {
        alert(error.response.data?.detail || '손들기에 실패했습니다.');
      }
    }
  }, [roomId, isHandRaised, fetchRaisedHands]);

  /**
   * 손내리기
   */
  const lowerHand = useCallback(async () => {
    if (!roomId || !isHandRaised) {
      console.warn('⚠️ 손을 들지 않았거나 roomId 없음');
      return;
    }

    try {
      console.log('🤚 손내리기...');
      
      await axios.post(`/video-meetings/${roomId}/lower-hand/`);
      
      setIsHandRaised(false);
      console.log('✅ 손내리기 성공');
      
      // 목록 즉시 갱신
      await fetchRaisedHands();
    } catch (error) {
      console.error('❌ 손내리기 실패:', error);
      
      if (error.response?.status === 400) {
        alert(error.response.data?.detail || '손내리기에 실패했습니다.');
      }
    }
  }, [roomId, isHandRaised, fetchRaisedHands]);

  /**
   * WebSocket 알림 처리
   */
  const handleHandRaiseNotification = useCallback((data) => {
    const { action, username } = data;

    console.log(`✋ 손들기 알림: ${username} - ${action}`);

    // 목록 갱신
    fetchRaisedHands();
  }, [fetchRaisedHands]);

  /**
   * 주기적으로 손든 사용자 목록 갱신
   */
  useEffect(() => {
    if (!roomId) return;

    // 초기 로드
    fetchRaisedHands();

    // 3초마다 갱신
    pollingIntervalRef.current = setInterval(fetchRaisedHands, 3000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [roomId, fetchRaisedHands]);

  return {
    isHandRaised,
    raisedHands,
    raiseHand,
    lowerHand,
    handleHandRaiseNotification,
    fetchRaisedHands
  };
}