// frontend/src/hooks/useScreenShare.js
import { useState, useRef, useCallback } from 'react';
import axios from '../api/axios';

export function useScreenShare(roomId, localStreamRef, peerConnections) {
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenSharingUser, setScreenSharingUser] = useState(null);
  const screenStreamRef = useRef(null);
  const originalSenders = useRef({});

  /**
   * 화면 공유 시작
   */
  const startScreenShare = useCallback(async () => {
    try {
      console.log('🖥️ 화면 공유 시작...');

      // 화면 캡처 요청
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          displaySurface: 'monitor',
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30, max: 30 }
        },
        audio: false
      });

      screenStreamRef.current = screenStream;
      
      // 화면 공유 중지 이벤트 처리 (사용자가 브라우저 UI로 중지)
      const videoTrack = screenStream.getVideoTracks()[0];
      videoTrack.onended = () => {
        console.log('🛑 화면 공유가 사용자에 의해 중지됨');
        stopScreenShare();
      };

      // 모든 Peer Connection의 비디오 트랙 교체
      Object.entries(peerConnections.current).forEach(([peerId, pc]) => {
        try {
          const senders = pc.getSenders();
          const videoSender = senders.find(sender => 
            sender.track && sender.track.kind === 'video'
          );

          if (videoSender) {
            // 원본 트랙 저장
            if (!originalSenders.current[peerId]) {
              originalSenders.current[peerId] = videoSender.track;
            }

            // 화면 공유 트랙으로 교체
            videoSender.replaceTrack(videoTrack);
            console.log(`✅ 화면 공유 트랙 전송: ${peerId}`);
          }
        } catch (error) {
          console.error(`❌ 트랙 교체 실패 (${peerId}):`, error);
        }
      });

      setIsScreenSharing(true);

      // 서버에 화면 공유 시작 알림
      try {
        await axios.post(`/video-meetings/${roomId}/send_signal/`, {
          message_type: 'screen_share_start',
          payload: JSON.stringify({ action: 'start' }),
          receiver_username: null // 모두에게 브로드캐스트
        });
        console.log('✅ 화면 공유 시작 알림 전송');
      } catch (error) {
        console.error('❌ 화면 공유 시작 알림 실패:', error);
      }

      console.log('✅ 화면 공유 시작 완료');
    } catch (error) {
      console.error('❌ 화면 공유 시작 실패:', error);
      
      if (error.name === 'NotAllowedError') {
        alert('화면 공유 권한이 거부되었습니다.');
      } else {
        alert('화면 공유를 시작할 수 없습니다.');
      }
    }
  }, [roomId, peerConnections]);

  /**
   * 화면 공유 중지
   */
  const stopScreenShare = useCallback(async () => {
    try {
      console.log('🛑 화면 공유 중지...');

      // 화면 공유 스트림 중지
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => {
          track.stop();
          console.log(`🛑 화면 공유 트랙 중지: ${track.kind}`);
        });
        screenStreamRef.current = null;
      }

      // 원본 카메라 트랙으로 복원
      Object.entries(peerConnections.current).forEach(([peerId, pc]) => {
        try {
          const senders = pc.getSenders();
          const videoSender = senders.find(sender => 
            sender.track && sender.track.kind === 'video'
          );

          if (videoSender && originalSenders.current[peerId]) {
            videoSender.replaceTrack(originalSenders.current[peerId]);
            console.log(`✅ 카메라 트랙 복원: ${peerId}`);
            delete originalSenders.current[peerId];
          }
        } catch (error) {
          console.error(`❌ 트랙 복원 실패 (${peerId}):`, error);
        }
      });

      setIsScreenSharing(false);

      // 서버에 화면 공유 중지 알림
      try {
        await axios.post(`/video-meetings/${roomId}/send_signal/`, {
          message_type: 'screen_share_stop',
          payload: JSON.stringify({ action: 'stop' }),
          receiver_username: null
        });
        console.log('✅ 화면 공유 중지 알림 전송');
      } catch (error) {
        console.error('❌ 화면 공유 중지 알림 실패:', error);
      }

      console.log('✅ 화면 공유 중지 완료');
    } catch (error) {
      console.error('❌ 화면 공유 중지 오류:', error);
    }
  }, [roomId, peerConnections]);

  /**
   * 화면 공유 알림 처리
   */
  const handleScreenShareNotification = useCallback((action, username) => {
    if (action === 'start') {
      setScreenSharingUser(username);
      console.log(`🖥️ ${username}님이 화면 공유 시작`);
    } else if (action === 'stop') {
      setScreenSharingUser(null);
      console.log(`🛑 ${username}님이 화면 공유 종료`);
    }
  }, []);

  /**
   * 정리 함수
   */
  const cleanup = useCallback(() => {
    if (isScreenSharing) {
      stopScreenShare();
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }

    originalSenders.current = {};
    setScreenSharingUser(null);
  }, [isScreenSharing, stopScreenShare]);

  return {
    isScreenSharing,
    screenSharingUser,
    startScreenShare,
    stopScreenShare,
    handleScreenShareNotification,
    cleanup
  };
}