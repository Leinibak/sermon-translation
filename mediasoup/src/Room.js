// mediasoup/src/Room.js
'use strict';

const config = require('./config');
const logger = require('./logger');

/**
 * Room: 하나의 화상회의방 = 하나의 mediasoup Router
 * 참가자(Peer)마다 WebRtcTransport (send 1개 + recv 1개) 생성
 */
class Room {
  constructor(roomId, router) {
    this.id = roomId;
    this.router = router;
    // peerId → { transports: Map, producers: Map, consumers: Map }
    this.peers = new Map();
    this.createdAt = Date.now();

    logger.info(`Room created: ${roomId}`);
  }

  // ─── Peer 관리 ────────────────────────────────────────────

  hasPeer(peerId) {
    return this.peers.has(peerId);
  }

  addPeer(peerId) {
    if (!this.peers.has(peerId)) {
      this.peers.set(peerId, {
        transports: new Map(),
        producers: new Map(),
        consumers: new Map(),
      });
      logger.info(`Peer joined room ${this.id}: ${peerId}`);
    }
  }

  removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    // 모든 transport 닫기 (producer/consumer 자동 종료됨)
    for (const transport of peer.transports.values()) {
      try { transport.close(); } catch (_) {}
    }
    this.peers.delete(peerId);
    logger.info(`Peer left room ${this.id}: ${peerId}`);
  }

  // ─── Transport ────────────────────────────────────────────

  async createWebRtcTransport(peerId) {
    const transport = await this.router.createWebRtcTransport(
      config.mediasoup.webRtcTransportOptions
    );

    const peer = this.peers.get(peerId);
    if (!peer) throw new Error(`Peer not found: ${peerId}`);

    peer.transports.set(transport.id, transport);

    transport.on('dtlsstatechange', (state) => {
      if (state === 'closed') {
        peer.transports.delete(transport.id);
      }
    });

    logger.debug(`Transport created for peer ${peerId}: ${transport.id}`);

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connectTransport(peerId, transportId, dtlsParameters) {
    const peer = this.peers.get(peerId);
    if (!peer) throw new Error(`Peer not found: ${peerId}`);

    const transport = peer.transports.get(transportId);
    if (!transport) throw new Error(`Transport not found: ${transportId}`);

    await transport.connect({ dtlsParameters });
    logger.debug(`Transport connected: ${transportId}`);
  }

  // ─── Producer (송신) ──────────────────────────────────────

  async produce(peerId, transportId, kind, rtpParameters, appData) {
    const peer = this.peers.get(peerId);
    if (!peer) throw new Error(`Peer not found: ${peerId}`);

    const transport = peer.transports.get(transportId);
    if (!transport) throw new Error(`Transport not found: ${transportId}`);

    const producer = await transport.produce({ kind, rtpParameters, appData });
    peer.producers.set(producer.id, producer);

    producer.on('transportclose', () => {
      peer.producers.delete(producer.id);
    });

    logger.info(`Producer created [${kind}] for peer ${peerId}: ${producer.id}`);
    return { id: producer.id };
  }

  async pauseProducer(peerId, producerId) {
    const producer = this._getProducer(peerId, producerId);
    await producer.pause();
  }

  async resumeProducer(peerId, producerId) {
    const producer = this._getProducer(peerId, producerId);
    await producer.resume();
  }

  async closeProducer(peerId, producerId) {
    const producer = this._getProducer(peerId, producerId);
    producer.close();
    this.peers.get(peerId)?.producers.delete(producerId);
  }

  // ─── Consumer (수신) ──────────────────────────────────────

  async consume(consumerPeerId, producerPeerId, producerId, transportId, rtpCapabilities) {
    if (!this.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error(`Cannot consume producer ${producerId}`);
    }

    const peer = this.peers.get(consumerPeerId);
    if (!peer) throw new Error(`Consumer peer not found: ${consumerPeerId}`);

    const transport = peer.transports.get(transportId);
    if (!transport) throw new Error(`Transport not found: ${transportId}`);

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: true, // 클라이언트 준비 완료 후 resume
    });

    peer.consumers.set(consumer.id, consumer);

    consumer.on('transportclose', () => {
      peer.consumers.delete(consumer.id);
    });
    consumer.on('producerclose', () => {
      peer.consumers.delete(consumer.id);
    });

    logger.debug(`Consumer created for peer ${consumerPeerId}: ${consumer.id}`);

    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      producerPeerId,
    };
  }

  async resumeConsumer(peerId, consumerId) {
    const peer = this.peers.get(peerId);
    const consumer = peer?.consumers.get(consumerId);
    if (!consumer) throw new Error(`Consumer not found: ${consumerId}`);
    await consumer.resume();
  }

  // ─── 방 상태 조회 ─────────────────────────────────────────

  getProducerList() {
    const list = [];
    for (const [peerId, peer] of this.peers) {
      for (const [producerId, producer] of peer.producers) {
        list.push({ peerId, producerId, kind: producer.kind, paused: producer.paused });
      }
    }
    return list;
  }

  getRtpCapabilities() {
    return this.router.rtpCapabilities;
  }

  isEmpty() {
    return this.peers.size === 0;
  }

  // ─── 내부 헬퍼 ───────────────────────────────────────────

  _getProducer(peerId, producerId) {
    const producer = this.peers.get(peerId)?.producers.get(producerId);
    if (!producer) throw new Error(`Producer not found: ${producerId}`);
    return producer;
  }

  close() {
    this.router.close();
    logger.info(`Room closed: ${this.id}`);
  }
}

module.exports = Room;
