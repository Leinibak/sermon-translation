// frontend/src/hooks/useScreenShare.js
import { useState, useRef, useCallback } from 'react';
import axios from '../api/axios';

export function useScreenShare(roomId, localStreamRef, peerConnections) {
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenSharingUser, setScreenSharingUser] = useState(null);
  const screenStreamRef = useRef(null);
  const originalVideoTrackRef = useRef(null);

  /**
   * 화면 공유 시작
   */
  const startScreenShare = useCallback(async () => {
    try {
      console.log('🖥️ 화면 공유 시작 요청...');

      // 1. 백엔드에 화면 공유 시작 알림
      await axios.post(`/video-meetings/${roomId}/start_screen_share/`);
      console.log('✅ 백엔드 화면 공유 등록 완료');

      // 2. 화면 캡처 권한 요청
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          displaySurface: 'monitor',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48000
        }
      });

      screenStreamRef.current = screenStream;
      console.log('✅ 화면 스트림 획득 완료');

      // 3. 로컬 비디오 트랙 백업
      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        originalVideoTrackRef.current = videoTrack;
      }

      // 4. 화면 공유 트랙으로 교체
      const screenVideoTrack = screenStream.getVideoTracks()[0];

      // 모든 Peer Connection에 트랙 교체
      Object.values(peerConnections.current).forEach((pc) => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(screenVideoTrack)
            .then(() => console.log('✅ Peer 트랙 교체 완료'))
            .catch(e => console.error('❌ Peer 트랙 교체 실패:', e));
        }
      });

      // 5. 화면 공유 종료 이벤트 처리 (브라우저 중지 버튼)
      screenVideoTrack.onended = () => {
        console.log('🛑 사용자가 화면 공유를 중지함');
        stopScreenShare();
      };

      setIsScreenSharing(true);
      console.log('🎉 화면 공유 시작 완료!');

      return true;
    } catch (error) {
      console.error('❌ 화면 공유 시작 실패:', error);
      
      if (error.name === 'NotAllowedError') {
        alert('화면 공유 권한이 거부되었습니다.');
      } else if (error.name === 'NotFoundError') {
        alert('공유할 화면을 찾을 수 없습니다.');
      } else if (error.response?.status === 400) {
        alert(error.response.data.detail || '화면 공유를 시작할 수 없습니다.');
      } else {
        alert('화면 공유 중 오류가 발생했습니다.');
      }
      
      return false;
    }
  }, [roomId, localStreamRef, peerConnections]);

  /**
   * 화면 공유 종료
   */
  const stopScreenShare = useCallback(async () => {
    try {
      console.log('🛑 화면 공유 종료 시작...');

      // 1. 화면 스트림 정리
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => {
          track.stop();
          console.log(`🗑️ 화면 트랙 종료: ${track.kind}`);
        });
        screenStreamRef.current = null;
      }

      // 2. 원래 비디오 트랙으로 복구
      if (originalVideoTrackRef.current) {
        Object.values(peerConnections.current).forEach((pc) => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(originalVideoTrackRef.current)
              .then(() => console.log('✅ 원래 비디오 트랙 복구 완료'))
              .catch(e => console.error('❌ 트랙 복구 실패:', e));
          }
        });
        originalVideoTrackRef.current = null;
      }

      // 3. 백엔드에 화면 공유 종료 알림
      await axios.post(`/video-meetings/${roomId}/stop_screen_share/`);
      console.log('✅ 백엔드 화면 공유 해제 완료');

      setIsScreenSharing(false);
      console.log('✅ 화면 공유 종료 완료!');
    } catch (error) {
      console.error('❌ 화면 공유 종료 실패:', error);
      setIsScreenSharing(false);
    }
  }, [roomId, peerConnections]);

  /**
   * 다른 사용자의 화면 공유 상태 업데이트
   */
  const handleScreenShareNotification = useCallback((action, username) => {
    if (action === 'start') {
      setScreenSharingUser(username);
      console.log(`📺 ${username}님이 화면 공유 시작`);
    } else if (action === 'stop') {
      setScreenSharingUser(null);
      console.log(`📺 ${username}님이 화면 공유 종료`);
    }
  }, []);

  /**
   * 정리 (컴포넌트 언마운트 시)
   */
  const cleanup = useCallback(() => {
    if (isScreenSharing) {
      stopScreenShare();
    }
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