// mediasoup/src/config.js
'use strict';

module.exports = {
  // HTTP API 서버
  http: {
    port: parseInt(process.env.MEDIASOUP_HTTP_PORT) || 3000,
    // Django 내부 네트워크에서만 접근 허용
    trustedOrigins: (process.env.TRUSTED_ORIGINS || 'http://backend:8000').split(','),
  },

  // mediasoup Worker 설정
  mediasoup: {
    numWorkers: parseInt(process.env.MEDIASOUP_NUM_WORKERS) || require('os').cpus().length,

    workerSettings: {
      logLevel: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
      logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
      rtcMinPort: parseInt(process.env.MEDIASOUP_RTP_MIN_PORT) || 40000,
      rtcMaxPort: parseInt(process.env.MEDIASOUP_RTP_MAX_PORT) || 40500,
    },

    // Router가 지원할 미디어 코덱
    routerOptions: {
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          parameters: { 'x-google-start-bitrate': 500 },
        },
        {
          kind: 'video',
          mimeType: 'video/VP9',
          clockRate: 90000,
          parameters: {
            'profile-id': 2,
            'x-google-start-bitrate': 500,
          },
        },
        {
          kind: 'video',
          mimeType: 'video/h264',
          clockRate: 90000,
          parameters: {
            'packetization-mode': 1,
            'profile-level-id': '4d0032',
            'level-asymmetry-allowed': 1,
            'x-google-start-bitrate': 500,
          },
        },
      ],
    },

    // WebRtcTransport 설정
    webRtcTransportOptions: {
      // OCI 공인 IP — 환경변수로 주입
      listenInfos: [
        {
          protocol: 'udp',
          ip: '0.0.0.0',
          announcedAddress: process.env.MEDIASOUP_ANNOUNCED_IP,
          portRange: {
            min: parseInt(process.env.MEDIASOUP_RTP_MIN_PORT) || 40000,
            max: parseInt(process.env.MEDIASOUP_RTP_MAX_PORT) || 40500,
          },
        },
        {
          protocol: 'tcp',
          ip: '0.0.0.0',
          announcedAddress: process.env.MEDIASOUP_ANNOUNCED_IP,
          portRange: {
            min: parseInt(process.env.MEDIASOUP_RTP_MIN_PORT) || 40000,
            max: parseInt(process.env.MEDIASOUP_RTP_MAX_PORT) || 49999,
          },
        },
      ],
      initialAvailableOutgoingBitrate: 800000,   // 800 kbps
      minimumAvailableOutgoingBitrate: 100000,   // 100 kbps
      maxSctpMessageSize: 262144,
    },
  },
};
