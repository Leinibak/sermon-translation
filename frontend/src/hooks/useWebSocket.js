// frontend/src/hooks/useWebSocket.js (새로 추가)
import { useEffect, useRef, useCallback } from 'react';

/**
 * WebSocket 연결 및 메시지 처리 Hook
 */
export function useWebSocket(roomId, user, onMessage) {
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;

  const connect = useCallback(() => {
    if (!roomId || !user) {
      console.log('⏳ WebSocket 연결 대기: roomId 또는 user 없음');
      return;
    }

    // 기존 연결 정리
    if (wsRef.current) {
      wsRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/video-meeting/${roomId}/`;

    console.log(`🔌 WebSocket 연결 시도: ${wsUrl}`);

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('✅ WebSocket 연결 성공');
        reconnectAttemptsRef.current = 0;

        // 연결 성공 시 join 메시지 전송
        ws.send(JSON.stringify({
          type: 'join',
          username: user.username
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 WebSocket 메시지 수신:', data.type);

          if (onMessage) {
            onMessage(data);
          }
        } catch (error) {
          console.error('❌ WebSocket 메시지 파싱 실패:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket 오류:', error);
      };

      ws.onclose = (event) => {
        console.log(`❌ WebSocket 연결 종료 (코드: ${event.code})`);

        // 자동 재연결 (최대 시도 횟수 제한)
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current += 1;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
          
          console.log(`🔄 ${delay/1000}초 후 재연결 시도 (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          console.error('❌ 최대 재연결 시도 횟수 초과');
        }
      };

      wsRef.current = ws;

    } catch (error) {
      console.error('❌ WebSocket 생성 실패:', error);
    }
  }, [roomId, user, onMessage]);

  // 메시지 전송
  const sendMessage = useCallback((message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      console.log('📤 WebSocket 메시지 전송:', message.type);
    } else {
      console.warn('⚠️ WebSocket 연결되지 않음');
    }
  }, []);

  // 연결 및 정리
  useEffect(() => {
    connect();

    return () => {
      console.log('🔄 WebSocket 정리');
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return {
    sendMessage,
    isConnected: wsRef.current?.readyState === WebSocket.OPEN
  };
}