// frontend/src/hooks/useWebSocket.js (완전한 버전)
import { useEffect, useRef, useCallback } from 'react';

const WS_RECONNECT_DELAY = 3000;
const WS_HEARTBEAT_INTERVAL = 30000;

export function useWebSocket(roomId, currentUser, onMessage) {
  const ws = useRef(null);
  const reconnectTimeout = useRef(null);
  const heartbeatInterval = useRef(null);
  const isIntentionalClose = useRef(false);
  const messageHandlerRef = useRef(onMessage);

  // 메시지 핸들러 업데이트
  useEffect(() => {
    messageHandlerRef.current = onMessage;
  }, [onMessage]);

  // WebSocket 연결
  const connect = useCallback(() => {
    if (!roomId || !currentUser?.username) {
      console.log('⚠️ WebSocket 연결 조건 미충족');
      return;
    }

    if (ws.current?.readyState === WebSocket.OPEN) {
      console.log('✅ WebSocket 이미 연결됨');
      return;
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/video-meeting/${roomId}/`;
      
      console.log(`🔌 WebSocket 연결 시도: ${wsUrl}`);
      
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log('✅ WebSocket 연결 성공');
        
        // Heartbeat 시작
        if (heartbeatInterval.current) {
          clearInterval(heartbeatInterval.current);
        }
        
        heartbeatInterval.current = setInterval(() => {
          if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'ping' }));
          }
        }, WS_HEARTBEAT_INTERVAL);
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (messageHandlerRef.current) {
            messageHandlerRef.current(data);
          }
        } catch (error) {
          console.error('❌ WebSocket 메시지 파싱 실패:', error);
        }
      };

      ws.current.onerror = (error) => {
        console.error('❌ WebSocket 에러:', error);
      };

      ws.current.onclose = (event) => {
        console.log('🔌 WebSocket 연결 종료:', event.code, event.reason);
        
        if (heartbeatInterval.current) {
          clearInterval(heartbeatInterval.current);
          heartbeatInterval.current = null;
        }

        // 의도적 종료가 아니면 재연결
        if (!isIntentionalClose.current) {
          console.log(`🔄 ${WS_RECONNECT_DELAY / 1000}초 후 재연결 시도...`);
          
          reconnectTimeout.current = setTimeout(() => {
            connect();
          }, WS_RECONNECT_DELAY);
        }
      };
    } catch (error) {
      console.error('❌ WebSocket 연결 실패:', error);
    }
  }, [roomId, currentUser]);

  // 메시지 전송
  const sendMessage = useCallback((message) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      try {
        ws.current.send(JSON.stringify(message));
        console.log('📤 WebSocket 메시지 전송:', message.type);
      } catch (error) {
        console.error('❌ 메시지 전송 실패:', error);
      }
    } else {
      console.warn('⚠️ WebSocket이 연결되지 않음');
    }
  }, []);

  // ⭐ WebRTC 시그널 전송 (Offer, Answer, ICE Candidate)
  const sendWebRTCSignal = useCallback((toPeerId, type, data) => {
    const message = {
      type,
      to_user_id: toPeerId,
      from_user_id: currentUser?.username,
      ...data
    };

    sendMessage(message);
  }, [currentUser, sendMessage]);

  // WebSocket 연결 시작
  useEffect(() => {
    connect();

    return () => {
      console.log('🧹 WebSocket 정리...');
      
      isIntentionalClose.current = true;
      
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      
      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
      }
      
      if (ws.current) {
        ws.current.close(1000, 'Component unmounting');
        ws.current = null;
      }
    };
  }, [connect]);

  return {
    ws: ws.current,
    sendMessage,
    sendWebRTCSignal,
    isConnected: ws.current?.readyState === WebSocket.OPEN
  };
}