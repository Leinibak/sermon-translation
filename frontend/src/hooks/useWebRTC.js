// frontend/src/hooks/useWebRTC.js
import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * ==============================
 * ICE 서버 설정 (iOS Safari 최적화 포함)
 * ==============================
 */
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }, // ⭐ 추가 iOS 안정화용
    { urls: 'stun:stun3.l.google.com:19302' }, // ⭐ 추가 iOS 안정화용
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',        // ⭐ iOS 필수
  rtcpMuxPolicy: 'require',          // ⭐ iOS 필수
  sdpSemantics: 'unified-plan'       // ⭐ iOS Safari는 Unified Plan만 지원
};

// ==============================
// 유틸리티: iOS 및 모바일 감지
// ==============================
const isIOS = () => {
  if (navigator.userAgentData) return navigator.userAgentData.platform === 'iOS';
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  if (ua.includes('Mac') && 'ontouchend' in document && navigator.maxTouchPoints > 0) return true;
  return false;
};

const isMobileDevice = () => {
  if (navigator.userAgentData && navigator.userAgentData.mobile !== undefined) {
    return navigator.userAgentData.mobile;
  }
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
};

export function useWebRTC(roomId, currentUser, isHost, sendWebRTCSignal) {
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState({});

  const localStreamRef = useRef(null);
  const peerConnections = useRef({});
  const pendingCandidates = useRef({});  // ⭐ RemoteDescription 없을 때 대기용
  const iceCandidateQueue = useRef({});   // ⭐ Local ICE 후보 큐 (iOS 안정화)
  const isCreatingConnection = useRef({});
  const processedSignals = useRef(new Set());

  // 항상 최신 sendWebRTCSignal 사용
  const sendSignalRef = useRef(sendWebRTCSignal);
  useEffect(() => { sendSignalRef.current = sendWebRTCSignal; }, [sendWebRTCSignal]);

  // =========================================================================
  // Local Media 가져오기
  // =========================================================================
  const getLocalMedia = useCallback(async () => {
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getTracks();
      if (tracks.every(track => track.readyState === 'live')) return localStreamRef.current;
      tracks.forEach(track => track.stop());
      localStreamRef.current = null;
    }

    try {
      const isiOS = isIOS();
      const isMobile = isMobileDevice();

      const constraints = {
        video: isMobile ? { width: { ideal: 640, max: 1280 }, height: { ideal: 480, max: 720 }, facingMode: 'user', frameRate: { ideal: isiOS ? 15 : 24, max: 30 } } 
                        : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: isiOS ? 16000 : (isMobile ? 16000 : 48000) }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      return stream;
    } catch (err) {
      console.error('❌ 미디어 접근 실패:', err);
      throw err;
    }
  }, []);

  // =========================================================================
  // PeerConnection 생성
  // =========================================================================
  const createPeerConnection = useCallback(async (peerId, isInitiator) => {
    if (isCreatingConnection.current[peerId]) {
      for (let i = 0; i < 50; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (!isCreatingConnection.current[peerId]) break;
      }
      return peerConnections.current[peerId];
    }

    isCreatingConnection.current[peerId] = true;

    try {
      const isiOS = isIOS();

      let existing = peerConnections.current[peerId];
      if (existing) {
        if (['connected', 'connecting'].includes(existing.connectionState)) return existing;
        existing.close();
        delete peerConnections.current[peerId];
      }

      if (!localStreamRef.current) throw new Error('Local Stream 없음');

      const pc = new RTCPeerConnection(ICE_SERVERS);

      // ⭐ iOS track 순서: video -> audio
      if (isiOS) {
        localStreamRef.current.getVideoTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
        localStreamRef.current.getAudioTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
      } else {
        localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
      }

      // =========================================================================
      // ontrack: remote stream 업데이트
      // =========================================================================
      pc.ontrack = (event) => {
        if (!event.streams.length) return;
        const remoteStream = event.streams[0];
        setRemoteStreams(prev => {
          const index = prev.findIndex(s => s.peerId === peerId);
          const streamData = { peerId, username: peerId, stream: remoteStream, isMuted: !remoteStream.getAudioTracks()[0]?.enabled, isVideoOff: !remoteStream.getVideoTracks()[0]?.enabled };
          if (index >= 0) { const copy = [...prev]; copy[index] = streamData; return copy; }
          return [...prev, streamData];
        });
      };

      // =========================================================================
      // onicecandidate: 후보를 local/remote 큐로 관리
      // =========================================================================
      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        if (pc.remoteDescription && pc.remoteDescription.type) {
          sendSignalRef.current?.(peerId, 'ice_candidate', { candidate: event.candidate });
        } else {
          if (!iceCandidateQueue.current[peerId]) iceCandidateQueue.current[peerId] = [];
          iceCandidateQueue.current[peerId].push(event.candidate);
        }
      };

      // =========================================================================
      // ICE 상태 변화 처리: restartIce + iOS offer 재협상
      // =========================================================================
      pc.oniceconnectionstatechange = async () => {
        const state = pc.iceConnectionState;
        setConnectionStatus(prev => ({ ...prev, [peerId]: state }));

        if ((state === 'failed' || state === 'disconnected') && isiOS) {
          if (pc.restartIce) {
            try { pc.restartIce(); } catch (e) { console.error('❌ restartIce 실패', e); }
          } else if (pc.signalingState === 'stable') {
            try {
              const offer = await pc.createOffer({ iceRestart: true });
              await pc.setLocalDescription(offer);
              sendSignalRef.current?.(peerId, 'offer', { sdp: pc.localDescription });
            } catch (e) { console.error('❌ ICE 재협상 실패', e); }
          }
        }
      };

      // =========================================================================
      // connection 상태 변화 처리
      // =========================================================================
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (['failed', 'closed'].includes(state)) {
          setRemoteStreams(prev => prev.filter(s => s.peerId !== peerId));
          delete peerConnections.current[peerId];
        }
      };

      peerConnections.current[peerId] = pc;

      // =========================================================================
      // Initiator일 경우 Offer 생성 (iOS는 딜레이 필요)
      // =========================================================================
      if (isInitiator) {
        setTimeout(async () => {
          if (pc.signalingState !== 'stable') return;
          try {
            const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true, iceRestart: false });
            await pc.setLocalDescription(offer);
            sendSignalRef.current?.(peerId, 'offer', { sdp: pc.localDescription });
          } catch (e) { console.error('❌ 초기 Offer 실패', e); }
        }, isiOS ? 2000 : 500); // ⭐ iOS 안정화용 지연
      }

      return pc;
    } catch (e) {
      console.error('❌ PeerConnection 생성 실패', e);
      return null;
    } finally {
      isCreatingConnection.current[peerId] = false;
    }
  }, []);

  // =========================================================================
  // Signal 처리
  // =========================================================================
  const handleWebSocketSignal = useCallback(async (data) => {
    const { type, from_username: peerId, to_username } = data;
    if (peerId === currentUser?.username) return;
    if (to_username && to_username !== currentUser?.username) return;

    let pc = peerConnections.current[peerId];
    if (!pc && type === 'offer') {
      pc = await createPeerConnection(peerId, false);
      if (!pc) return;
      await new Promise(r => setTimeout(r, 300));
    }
    if (!pc) {
      if (type === 'ice_candidate' && data.candidate) {
        if (!pendingCandidates.current[peerId]) pendingCandidates.current[peerId] = [];
        pendingCandidates.current[peerId].push(data.candidate);
      }
      return;
    }

    try {
      switch (type) {
        case 'offer':
          if (pc.signalingState === 'have-local-offer') await pc.setLocalDescription({ type: 'rollback' });
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignalRef.current?.(peerId, 'answer', { sdp: pc.localDescription });

          // ⭐ Pending ICE 적용
          if (pendingCandidates.current[peerId]) {
            for (const c of pendingCandidates.current[peerId]) await pc.addIceCandidate(new RTCIceCandidate(c));
            delete pendingCandidates.current[peerId];
          }

          // ⭐ Local ICE Queue 전송
          if (iceCandidateQueue.current[peerId]) {
            for (const c of iceCandidateQueue.current[peerId]) sendSignalRef.current?.(peerId, 'ice_candidate', { candidate: c });
            delete iceCandidateQueue.current[peerId];
          }
          break;

        case 'answer':
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            if (pendingCandidates.current[peerId]) {
              for (const c of pendingCandidates.current[peerId]) await pc.addIceCandidate(new RTCIceCandidate(c));
              delete pendingCandidates.current[peerId];
            }
          }
          break;

        case 'ice_candidate':
          if (data.candidate) {
            if (pc.remoteDescription && pc.remoteDescription.type) {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } else {
              if (!pendingCandidates.current[peerId]) pendingCandidates.current[peerId] = [];
              pendingCandidates.current[peerId].push(data.candidate);
            }
          }
          break;
      }
    } catch (e) { console.error('❌ Signal 처리 실패', e); }
  }, [currentUser, createPeerConnection]);

  // =========================================================================
  // Cleanup
  // =========================================================================
  const cleanup = useCallback(() => {
    Object.values(peerConnections.current).forEach(pc => pc.close());
    peerConnections.current = {};
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    pendingCandidates.current = {};
    iceCandidateQueue.current = {};
    isCreatingConnection.current = {};
    processedSignals.current.clear();
    setRemoteStreams([]);
    setConnectionStatus({});
  }, []);

  const removeRemoteStream = useCallback((peerId) => {
    setRemoteStreams(prev => prev.filter(s => s.peerId !== peerId));
    if (peerConnections.current[peerId]) {
      peerConnections.current[peerId].close();
      delete peerConnections.current[peerId];
    }
  }, []);

  return {
    localStreamRef,
    peerConnections,
    remoteStreams,
    connectionStatus,
    getLocalMedia,
    createPeerConnection,
    handleWebSocketSignal,
    removeRemoteStream,
    cleanup,
  };
}
