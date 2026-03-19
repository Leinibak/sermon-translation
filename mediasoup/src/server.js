// mediasoup/src/server.js
'use strict';

const mediasoup = require('mediasoup');
const express = require('express');
const cors = require('cors');
const config = require('./config');
const Room = require('./Room');
const logger = require('./logger');

const app = express();
app.use(express.json());

// Django 백엔드 내부 네트워크만 허용
app.use(cors({
  origin: config.http.trustedOrigins,
  methods: ['GET', 'POST', 'DELETE'],
}));

// ─── Worker Pool ──────────────────────────────────────────────
const workers = [];
let nextWorkerIdx = 0;

async function createWorkers() {
  const { numWorkers, workerSettings } = config.mediasoup;
  logger.info(`Creating ${numWorkers} mediasoup workers...`);

  for (let i = 0; i < numWorkers; i++) {
    const worker = await mediasoup.createWorker(workerSettings);

    worker.on('died', (error) => {
      logger.error(`Worker ${worker.pid} died: ${error.message}`);
      // 5초 후 프로세스 재시작 (Docker가 재시작해줌)
      setTimeout(() => process.exit(1), 5000);
    });

    workers.push(worker);
    logger.info(`Worker ${i + 1}/${numWorkers} created (PID: ${worker.pid})`);
  }
}

function getNextWorker() {
  const worker = workers[nextWorkerIdx];
  nextWorkerIdx = (nextWorkerIdx + 1) % workers.length;
  return worker;
}

// ─── Room 관리 ────────────────────────────────────────────────
const rooms = new Map(); // roomId → Room

async function getOrCreateRoom(roomId) {
  if (rooms.has(roomId)) return rooms.get(roomId);

  const worker = getNextWorker();
  const router = await worker.createRouter(config.mediasoup.routerOptions);
  const room = new Room(roomId, router);
  rooms.set(roomId, room);

  logger.info(`Room created: ${roomId}`);
  return room;
}

function cleanupEmptyRooms() {
  for (const [roomId, room] of rooms) {
    if (room.isEmpty()) {
      room.close();
      rooms.delete(roomId);
      logger.info(`Empty room cleaned up: ${roomId}`);
    }
  }
}
// 5분마다 빈 방 정리
setInterval(cleanupEmptyRooms, 5 * 60 * 1000);

// ─── REST API ─────────────────────────────────────────────────

// 헬스체크
app.get('/health', (req, res) => {
  res.json({ status: 'ok', workers: workers.length, rooms: rooms.size });
});

// 방 RTP Capabilities 조회 (클라이언트 Device.load()에 사용)
app.get('/rooms/:roomId/rtp-capabilities', async (req, res) => {
  try {
    const room = await getOrCreateRoom(req.params.roomId);
    res.json({ rtpCapabilities: room.getRtpCapabilities() });
  } catch (e) {
    logger.error(`GET rtp-capabilities: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// Peer 참가
app.post('/rooms/:roomId/peers', async (req, res) => {
  try {
    const { peerId } = req.body;
    if (!peerId) return res.status(400).json({ error: 'peerId required' });

    const room = await getOrCreateRoom(req.params.roomId);
    room.addPeer(peerId);

    res.json({
      rtpCapabilities: room.getRtpCapabilities(),
      producers: room.getProducerList(),
    });
  } catch (e) {
    logger.error(`POST peers: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// Peer 퇴장
app.delete('/rooms/:roomId/peers/:peerId', (req, res) => {
  try {
    const room = rooms.get(req.params.roomId);
    if (room) room.removePeer(req.params.peerId);
    res.json({ ok: true });
  } catch (e) {
    logger.error(`DELETE peer: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// Transport 생성 (send 또는 recv)
app.post('/rooms/:roomId/peers/:peerId/transports', async (req, res) => {
  try {
    const room = rooms.get(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const transportParams = await room.createWebRtcTransport(req.params.peerId);
    res.json(transportParams);
  } catch (e) {
    logger.error(`POST transport: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// Transport connect (DTLS 핸드셰이크)
app.post('/rooms/:roomId/peers/:peerId/transports/:transportId/connect', async (req, res) => {
  try {
    const room = rooms.get(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    await room.connectTransport(
      req.params.peerId,
      req.params.transportId,
      req.body.dtlsParameters
    );
    res.json({ ok: true });
  } catch (e) {
    logger.error(`POST transport connect: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// Producer 생성 (미디어 송신 시작)
app.post('/rooms/:roomId/peers/:peerId/producers', async (req, res) => {
  try {
    const room = rooms.get(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const { transportId, kind, rtpParameters, appData } = req.body;
    const result = await room.produce(
      req.params.peerId, transportId, kind, rtpParameters, appData || {}
    );

    // 다른 참가자들에게 알려야 함 — Django가 WebSocket으로 브로드캐스트
    res.json(result);
  } catch (e) {
    logger.error(`POST producer: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// Producer pause/resume
app.post('/rooms/:roomId/peers/:peerId/producers/:producerId/pause', async (req, res) => {
  try {
    const room = rooms.get(req.params.roomId);
    await room.pauseProducer(req.params.peerId, req.params.producerId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/rooms/:roomId/peers/:peerId/producers/:producerId/resume', async (req, res) => {
  try {
    const room = rooms.get(req.params.roomId);
    await room.resumeProducer(req.params.peerId, req.params.producerId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Consumer 생성 (타 참가자 미디어 수신)
app.post('/rooms/:roomId/peers/:peerId/consumers', async (req, res) => {
  try {
    const room = rooms.get(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const { producerPeerId, producerId, transportId, rtpCapabilities } = req.body;
    const result = await room.consume(
      req.params.peerId, producerPeerId, producerId, transportId, rtpCapabilities
    );
    res.json(result);
  } catch (e) {
    logger.error(`POST consumer: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// Consumer resume (클라이언트 준비 완료 후 호출)
app.post('/rooms/:roomId/peers/:peerId/consumers/:consumerId/resume', async (req, res) => {
  try {
    const room = rooms.get(req.params.roomId);
    await room.resumeConsumer(req.params.peerId, req.params.consumerId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 방 내 Producer 목록 조회
app.get('/rooms/:roomId/producers', (req, res) => {
  try {
    const room = rooms.get(req.params.roomId);
    if (!room) return res.json({ producers: [] });
    res.json({ producers: room.getProducerList() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── 서버 시작 ────────────────────────────────────────────────
async function main() {
  await createWorkers();

  const port = config.http.port;
  app.listen(port, '0.0.0.0', () => {
    logger.info(`mediasoup SFU listening on port ${port}`);
    logger.info(`Announced IP: ${process.env.MEDIASOUP_ANNOUNCED_IP}`);
    logger.info(`RTP port range: ${process.env.MEDIASOUP_RTP_MIN_PORT || 40000}-${process.env.MEDIASOUP_RTP_MAX_PORT || 49999}`);
  });
}

main().catch((err) => {
  logger.error(`Fatal: ${err.message}`, err);
  process.exit(1);
});
