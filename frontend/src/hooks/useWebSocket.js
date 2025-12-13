// frontend/src/hooks/useWebSocket.js (완전 개선 버전)
import { useEffect, useRef, useCallback } from 'react';

/**
 * 통합 WebSocket Hook
 * - 채팅, 승인 알림, WebRTC 시그널링 모두 처리
 * - 자동 재연결
 * - Heartbeat (연결 유지)
 */
export function useWebSocket(roomId, user, onMessage) {
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const messageQueue = useRef([]);
  const isConnectedRef = useRef(false);
  const heartbeatIntervalRef = useRef(null);
  const lastPongRef = useRef(Date.now());

  // WebSocket 연결
  const connect = useCallback(() => {
    if (!roomId || !user) {
      console.warn('⚠️ roomId 또는 user 없음');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/video-meeting/${roomId}/`;

    console.log('🔌 WebSocket 연결 시도:', wsUrl);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ WebSocket 연결 성공');
        isConnectedRef.current = true;
        reconnectAttempts.current = 0;
        lastPongRef.current = Date.now();

        // Join 메시지 전송
        ws.send(JSON.stringify({
          type: 'join',
          username: user.username
        }));

        // 대기 중인 메시지 전송
        while (messageQueue.current.length > 0) {
          const msg = messageQueue.current.shift();
          ws.send(JSON.stringify(msg));
          console.log('📤 대기 메시지 전송:', msg.type);
        }

        // Heartbeat 시작 (30초마다)
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
            
            // Pong 응답 확인 (60초 이내)
            if (Date.now() - lastPongRef.current > 60000) {
              console.warn('⚠️ Pong 응답 없음 - 재연결 시도');
              ws.close();
            }
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Pong 응답 처리
          if (data.type === 'pong') {
            lastPongRef.current = Date.now();
            return;
          }
          
          console.log('📨 WebSocket 메시지:', data.type);

          // 메시지 콜백 호출
          if (onMessage) {
            onMessage(data);
          }
        } catch (error) {
          console.error('❌ 메시지 파싱 실패:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket 오류:', error);
      };

      ws.onclose = (event) => {
        console.log('🔌 WebSocket 연결 종료:', event.code, event.reason);
        isConnectedRef.current = false;

        // Heartbeat 중지
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }

        // 정상 종료가 아니면 자동 재연결 (최대 5회)
        if (event.code !== 1000 && reconnectAttempts.current < 5) {
          reconnectAttempts.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          
          console.log(`🔄 재연결 시도 ${reconnectAttempts.current}/5 (${delay}ms 후)`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else if (reconnectAttempts.current >= 5) {
          console.error('❌ 최대 재연결 횟수 초과');
          alert('서버 연결이 끊어졌습니다. 페이지를 새로고침해주세요.');
        }
      };
    } catch (error) {
      console.error('❌ WebSocket 연결 실패:', error);
    }
  }, [roomId, user, onMessage]);

  // 메시지 전송
  const sendMessage = useCallback((message) => {
    const ws = wsRef.current;

    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log('📤 메시지 전송:', message.type);
      ws.send(JSON.stringify(message));
    } else {
      console.warn('⚠️ WebSocket 연결 안됨 - 큐에 추가');
      messageQueue.current.push(message);
    }
  }, []);

  // WebRTC 시그널 전송 (HTTP 대신 WebSocket 사용)
  const sendWebRTCSignal = useCallback((toUserId, type, payload) => {
    sendMessage({
      type: type, // 'offer', 'answer', 'ice_candidate'
      to_user_id: toUserId,
      ...payload
    });
  }, [sendMessage]);

  // 연결
  useEffect(() => {
    connect();

    return () => {
      console.log('🧹 WebSocket 정리');
      
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
      }
    };
  }, [connect]);

  return { 
    sendMessage, 
    sendWebRTCSignal,
    isConnected: isConnectedRef.current 
  };
}