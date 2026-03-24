// frontend/src/hooks/useScreenShare.js
// [수정 패치]
// FIX-8: SFU 완전 호환으로 재작성
//   기존 코드는 peerConnections(WebRTC mesh) 기반으로, SFU 환경에서는
//   peerConnections.current가 항상 빈 객체이므로 화면 트랙 교체가 아무것도 하지 않음.
//   SFU 환경에서는 mediasoup producer의 replaceTrack() 을 써야 함.
//
//   변경 사항:
//   - 파라미터: peerConnections → sfuProducersRef (useSFU 내 producersRef)
//   - 트랙 교체: pc.getSenders() → producer.replaceTrack()
//   - 서버 통보: WebSocket 메시지로 변경 (axios 폴링 제거)
//
//   사용법 변경:
//   기존: useScreenShare(roomId, localStreamRef, peerConnections)
//   신규: useScreenShare(roomId, localStreamRef, sfuProducersRef, wsRef)
//
//   VideoMeetingRoom에서 useSFU의 producersRef를 노출해야 하므로
//   useSFU 반환값에 producersRef 를 추가했습니다 (하단 참고).

import { useState, useRef, useCallback } from 'react';

export function useScreenShare(roomId, localStreamRef, sfuProducersRef, wsRef) {
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenSharingUser, setScreenSharingUser] = useState(null);
  const screenStreamRef = useRef(null);
  const originalVideoTrackRef = useRef(null);

  // WebSocket 전송 헬퍼
  const wsSend = useCallback((msg) => {
    const ws = wsRef?.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, [wsRef]);

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

      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always', displaySurface: 'monitor' },
        audio: false,
      });

      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];

      // 사용자가 브라우저 '공유 중지' 버튼 클릭 시 자동 중지
      screenTrack.onended = () => {
        console.log('🛑 화면 공유 중단됨 (사용자 액션)');
        stopScreenShare();
      };

      // 기존 카메라 비디오 트랙 저장
      const videoProducer = sfuProducersRef?.current?.get('video');
      if (videoProducer) {
        originalVideoTrackRef.current = videoProducer.track;
        // FIX-8: SFU producer replaceTrack
        await videoProducer.replaceTrack({ track: screenTrack });
        console.log('✅ SFU video producer 트랙 → 화면 공유 트랙으로 교체');
      } else {
        console.warn('⚠️ SFU video producer 없음 — 카메라 트랙 교체 생략');
      }

      // 로컬 비디오 미리보기도 화면으로 교체
      if (localStreamRef.current) {
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        const tracks = audioTrack ? [screenTrack, audioTrack] : [screenTrack];
        localStreamRef.current = new MediaStream(tracks);
      }

      setIsScreenSharing(true);

      // WebSocket으로 다른 참가자에게 알림
      wsSend({ type: 'screen_share_start' });
      console.log('✅ 화면 공유 활성화');

    } catch (error) {
      console.error('❌ 화면 공유 시작 실패:', error);
      if (error.name === 'NotAllowedError') {
        alert('화면 공유 권한이 거부되었습니다.');
      } else if (error.name !== 'AbortError') {
        alert('화면 공유를 시작할 수 없습니다.');
      }
    }
  }, [isScreenSharing, localStreamRef, sfuProducersRef, wsSend]);

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
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }

      // 원래 카메라 트랙으로 복원
      const videoProducer = sfuProducersRef?.current?.get('video');
      if (videoProducer && originalVideoTrackRef.current) {
        await videoProducer.replaceTrack({ track: originalVideoTrackRef.current });
        console.log('✅ SFU video producer 트랙 → 카메라 트랙으로 복원');

        if (localStreamRef.current) {
          const audioTrack = localStreamRef.current.getAudioTracks()[0];
          const tracks = audioTrack
            ? [originalVideoTrackRef.current, audioTrack]
            : [originalVideoTrackRef.current];
          localStreamRef.current = new MediaStream(tracks);
        }
      }

      originalVideoTrackRef.current = null;
      setIsScreenSharing(false);

      // WebSocket으로 다른 참가자에게 알림
      wsSend({ type: 'screen_share_stop' });
      console.log('✅ 화면 공유 비활성화');

    } catch (error) {
      console.error('❌ 화면 공유 중지 실패:', error);
      // 실패해도 상태는 리셋
      setIsScreenSharing(false);
    }
  }, [isScreenSharing, localStreamRef, sfuProducersRef, wsSend]);

  /**
   * 다른 사용자의 화면 공유 알림 처리 (WebSocket 수신)
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
      screenStreamRef.current.getTracks().forEach(t => t.stop());
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
    cleanup,
  };
}

/*
 * ─── useSFU 수정 안내 ────────────────────────────────────────────────────────
 * useScreenShare 에서 sfuProducersRef 를 사용하려면 useSFU 반환값에
 * producersRef 를 추가해야 합니다.
 *
 * useSFU.js 의 return 블록에 아래 한 줄을 추가하세요:
 *
 *   return {
 *     ...
 *     producersRef,   // ← 추가
 *   };
 *
 * VideoMeetingRoom.jsx 사용 예:
 *
 *   const { ..., producersRef } = useSFU({ wsRef, roomId });
 *
 *   const { isScreenSharing, startScreenShare, stopScreenShare } =
 *     useScreenShare(roomId, localStreamRef, producersRef, wsRef);
 * ─────────────────────────────────────────────────────────────────────────────
 */
