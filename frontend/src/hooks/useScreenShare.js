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
    if (isScreenSharing) {
      console.warn('⚠️ 이미 화면 공유 중');
      return;
    }

    try {
      console.log('🖥️ 화면 공유 시작...');

      // 화면 스트림 요청
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          displaySurface: 'monitor'
        },
        audio: false
      });

      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];

      // 화면 공유 중단 이벤트 (사용자가 '공유 중지' 버튼 클릭)
      screenTrack.onended = () => {
        console.log('🛑 화면 공유 중단됨 (사용자 액션)');
        stopScreenShare();
      };

      // 기존 카메라 트랙 저장
      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          originalVideoTrackRef.current = videoTrack;
        }
      }

      // 모든 Peer Connection에 화면 트랙 교체
      Object.values(peerConnections.current).forEach(pc => {
        const senders = pc.getSenders();
        const videoSender = senders.find(s => s.track?.kind === 'video');

        if (videoSender) {
          videoSender.replaceTrack(screenTrack)
            .then(() => console.log('✅ 화면 트랙 교체 완료'))
            .catch(e => console.error('❌ 트랙 교체 실패:', e));
        }
      });

      // Local 비디오 요소에도 화면 표시
      if (localStreamRef.current) {
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        localStreamRef.current = new MediaStream([screenTrack, audioTrack]);
      }

      setIsScreenSharing(true);

      // 서버에 화면 공유 시작 알림
      try {
        await axios.post(`/video-meetings/${roomId}/send_signal/`, {
          message_type: 'screen_share_start',
          payload: JSON.stringify({ timestamp: Date.now() })
        });
        console.log('✅ 화면 공유 시작 신호 전송');
      } catch (error) {
        console.error('❌ 화면 공유 신호 전송 실패:', error);
      }

      console.log('✅ 화면 공유 활성화');
    } catch (error) {
      console.error('❌ 화면 공유 시작 실패:', error);

      if (error.name === 'NotAllowedError') {
        alert('화면 공유 권한이 거부되었습니다.');
      } else {
        alert('화면 공유를 시작할 수 없습니다.');
      }
    }
  }, [isScreenSharing, roomId, localStreamRef, peerConnections]);

  /**
   * 화면 공유 중지
   */
  const stopScreenShare = useCallback(async () => {
    if (!isScreenSharing) {
      console.warn('⚠️ 화면 공유 중이 아님');
      return;
    }

    try {
      console.log('🛑 화면 공유 중지...');

      // 화면 스트림 중지
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }

      // 원래 카메라 트랙으로 복원
      if (originalVideoTrackRef.current) {
        Object.values(peerConnections.current).forEach(pc => {
          const senders = pc.getSenders();
          const videoSender = senders.find(s => s.track?.kind === 'video');

          if (videoSender) {
            videoSender.replaceTrack(originalVideoTrackRef.current)
              .then(() => console.log('✅ 카메라 트랙 복원 완료'))
              .catch(e => console.error('❌ 트랙 복원 실패:', e));
          }
        });

        // Local 비디오 요소도 복원
        if (localStreamRef.current) {
          const audioTrack = localStreamRef.current.getAudioTracks()[0];
          localStreamRef.current = new MediaStream([
            originalVideoTrackRef.current,
            audioTrack
          ]);
        }
      }

      setIsScreenSharing(false);
      originalVideoTrackRef.current = null;

      // 서버에 화면 공유 종료 알림
      try {
        await axios.post(`/video-meetings/${roomId}/send_signal/`, {
          message_type: 'screen_share_stop',
          payload: JSON.stringify({ timestamp: Date.now() })
        });
        console.log('✅ 화면 공유 종료 신호 전송');
      } catch (error) {
        console.error('❌ 화면 공유 종료 신호 전송 실패:', error);
      }

      console.log('✅ 화면 공유 비활성화');
    } catch (error) {
      console.error('❌ 화면 공유 중지 실패:', error);
    }
  }, [isScreenSharing, roomId, localStreamRef, peerConnections]);

  /**
   * 다른 사용자의 화면 공유 알림 처리
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
   * Cleanup
   */
  const cleanup = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    originalVideoTrackRef.current = null;
    setIsScreenSharing(false);
    setScreenSharingUser(null);
  }, []);

  return {
    isScreenSharing,
    screenSharingUser,
    startScreenShare,
    stopScreenShare,
    handleScreenShareNotification,
    cleanup
  };
}