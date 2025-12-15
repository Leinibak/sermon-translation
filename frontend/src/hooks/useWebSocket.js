// frontend/src/hooks/useWebSocket.js
import { useEffect, useRef, useCallback } from 'react';

export function useWebSocket(roomId, user, onMessage) {
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const onMessageRef = useRef(onMessage);

  // ⭐ onMessage를 ref로 저장하여 최신 버전 유지
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    if (!roomId || !user?.username) {
      console.warn('⚠️ WebSocket 연결 불가: roomId 또는 user 없음');
      return;
    }

    // 기존 연결 정리
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('🔌 기존 WebSocket 연결 유지');
      return;
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws/video-meeting/${roomId}/`;
      
      console.log(`\n${'='.repeat(60)}`);
      console.log('🔌 WebSocket 연결 시도');
      console.log(`   URL: ${wsUrl}`);
      console.log(`   User: ${user.username}`);
      console.log(`${'='.repeat(60)}\n`);

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('✅ WebSocket 연결 성공');
        reconnectAttemptsRef.current = 0;

        // 연결 확인용 ping
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 1000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 WebSocket 메시지:', data.type);
          
          // 최신 onMessage 핸들러 호출
          if (onMessageRef.current) {
            onMessageRef.current(data);
          }
        } catch (error) {
          console.error('❌ WebSocket 메시지 파싱 실패:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket 오류:', error);
      };

      ws.onclose = (event) => {
        console.log(`🔌 WebSocket 종료 (코드: ${event.code})`);
        wsRef.current = null;

        // 재연결 시도
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
          console.log(`🔄 재연결 시도 (${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts}) - ${delay}ms 후`);
          
          reconnectAttemptsRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          console.error('❌ 최대 재연결 시도 횟수 초과');
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('❌ WebSocket 연결 실패:', error);
    }
  }, [roomId, user]);

  // ⭐ WebSocket 메시지 전송 (일반 메시지)
  const sendMessage = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      console.log('📤 WebSocket 메시지 전송:', message.type);
    } else {
      console.warn('⚠️ WebSocket 연결 안됨 - 메시지 전송 불가');
    }
  }, []);

  // ⭐ WebRTC 시그널 전송 (즉시 전달)
  const sendWebRTCSignal = useCallback((toPeerId, signalType, data) => {
    const message = {
      type: signalType,
      to_user_id: toPeerId,
      from_user_id: user?.username,
      ...data
    };

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      console.log(`📡 WebRTC 시그널 전송: ${signalType} → ${toPeerId}`);
    } else {
      console.warn('⚠️ WebSocket 연결 안됨 - 시그널 전송 불가');
    }
  }, [user]);

  // ⭐ 연결 초기화
  useEffect(() => {
    connect();

    return () => {
      console.log('🧹 WebSocket 정리');
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  // ⭐ Heartbeat (연결 유지)
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // 30초마다

    return () => clearInterval(interval);
  }, []);

  return {
    sendMessage,
    sendWebRTCSignal,
    isConnected: wsRef.current?.readyState === WebSocket.OPEN
  };
}