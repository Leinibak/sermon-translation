# backend/video_meetings/sfu_client.py
"""
mediasoup SFU REST API 비동기 클라이언트

Django Channels Consumer(async)에서 호출하므로 전부 async/await.
httpx를 사용해 Django의 이벤트 루프 안에서 논블로킹 HTTP 요청을 보냄.

[설계 원칙]
- 모든 함수는 await 가능한 코루틴
- HTTP 오류(4xx/5xx)는 SFUError 예외로 변환 → Consumer에서 sfu_error 응답
- 키 이름은 mediasoup REST 서버(server.js/Room.js)가 반환하는 camelCase 그대로 유지
  (consumers.py에서 'peerId', 'producerId' 등으로 참조)
- 연결 풀(limits)을 모듈 수준에서 하나만 생성 → 재사용으로 성능 향상
"""

import json
import logging
import os

import httpx

logger = logging.getLogger(__name__)

# ── 설정 ─────────────────────────────────────────────────────────────────────
SFU_BASE_URL = os.environ.get('MEDIASOUP_URL', 'http://mediasoup:3000').rstrip('/')

# 연결 풀: Django 프로세스 당 하나 (재사용)
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    """모듈 수준 httpx 클라이언트 반환 (없으면 생성)."""
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            base_url=SFU_BASE_URL,
            timeout=httpx.Timeout(connect=5.0, read=15.0, write=10.0, pool=5.0),
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
        )
    return _client


class SFUError(Exception):
    """mediasoup REST 호출 실패 시 발생하는 예외."""
    def __init__(self, status: int, detail: str):
        self.status = status
        super().__init__(f"SFU {status}: {detail}")


# ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

async def _request(method: str, path: str, **kwargs) -> dict:
    """
    HTTP 요청 공통 처리.
    - 4xx/5xx → SFUError
    - JSON 파싱 실패 → SFUError
    """
    client = _get_client()
    url = path  # base_url이 이미 클라이언트에 설정돼 있음

    try:
        resp = await client.request(method, url, **kwargs)
    except httpx.TransportError as e:
        logger.error(f"SFU transport error [{method} {path}]: {e}")
        raise SFUError(503, f"Connection failed: {e}") from e

    if resp.status_code >= 400:
        try:
            body = resp.json()
            detail = body.get('error', resp.text)
        except Exception:
            detail = resp.text
        logger.error(f"SFU error [{method} {path}] {resp.status_code}: {detail}")
        raise SFUError(resp.status_code, detail)

    try:
        return resp.json()
    except Exception as e:
        raise SFUError(500, f"JSON parse error: {e}") from e


# ── Public API ────────────────────────────────────────────────────────────────

async def get_rtp_capabilities(room_id: str) -> dict:
    """
    Router RTP Capabilities 조회.
    클라이언트의 mediasoup Device.load() 에 전달할 값.

    Returns:
        dict  (mediasoup RouterRtpCapabilities 형식)
    """
    data = await _request('GET', f'/rooms/{room_id}/rtp-capabilities')
    # server.js: res.json({ rtpCapabilities: room.getRtpCapabilities() })
    return data['rtpCapabilities']


async def join_room(room_id: str, peer_id: str) -> dict:
    """
    SFU 방에 Peer 등록 + 현재 Producer 목록 반환.

    Returns:
        {
            'rtpCapabilities': dict,
            'producers': [
                {
                    'peerId':     str,   # 'user_N' 형식
                    'producerId': str,
                    'kind':       'audio' | 'video',
                    'paused':     bool,
                },
                ...
            ]
        }

    Notes:
        server.js POST /rooms/:roomId/peers 응답:
            { rtpCapabilities, producers: [{ peerId, producerId, kind, paused }] }
        Room.js getProducerList()는 camelCase peerId / producerId 사용.
        consumers.py handle_sfu_join에서 p.get('peerId', '') 로 접근하므로
        키 이름을 camelCase로 그대로 반환.
    """
    data = await _request(
        'POST',
        f'/rooms/{room_id}/peers',
        json={'peerId': peer_id},
    )
    # 방어: producers 없으면 빈 리스트
    producers = data.get('producers', [])

    # camelCase 정규화 (서버가 snake_case로 내려올 경우 대비)
    normalized = []
    for p in producers:
        normalized.append({
            'peerId':     p.get('peerId') or p.get('peer_id', ''),
            'producerId': p.get('producerId') or p.get('producer_id', ''),
            'kind':       p.get('kind', ''),
            'paused':     p.get('paused', False),
        })

    return {
        'rtpCapabilities': data['rtpCapabilities'],
        'producers': normalized,
    }


async def leave_room(room_id: str, peer_id: str) -> None:
    """
    SFU에서 Peer 제거.
    Transport/Producer/Consumer 모두 Room.js removePeer()가 정리함.
    """
    try:
        await _request('DELETE', f'/rooms/{room_id}/peers/{peer_id}')
    except SFUError as e:
        # 이미 없는 peer 제거 시도(404)는 무시
        if e.status == 404:
            logger.debug(f"leave_room: peer {peer_id} already gone")
        else:
            raise


async def create_transport(room_id: str, peer_id: str) -> dict:
    """
    WebRtcTransport 생성 (send / recv 모두 이 API 사용).

    Returns:
        {
            'id':             str,
            'iceParameters':  dict,
            'iceCandidates':  list,
            'dtlsParameters': dict,
        }

    Notes:
        server.js POST /rooms/:roomId/peers/:peerId/transports
        Room.js createWebRtcTransport() 가 동일 구조 반환.
    """
    data = await _request(
        'POST',
        f'/rooms/{room_id}/peers/{peer_id}/transports',
    )
    return {
        'id':             data['id'],
        'iceParameters':  data['iceParameters'],
        'iceCandidates':  data['iceCandidates'],
        'dtlsParameters': data['dtlsParameters'],
    }


async def connect_transport(
    room_id: str,
    peer_id: str,
    transport_id: str,
    dtls_parameters: dict,
) -> None:
    """
    DTLS 파라미터로 Transport 연결 (ICE/DTLS 핸드셰이크 완료).

    Notes:
        server.js POST /rooms/:roomId/peers/:peerId/transports/:transportId/connect
    """
    await _request(
        'POST',
        f'/rooms/{room_id}/peers/{peer_id}/transports/{transport_id}/connect',
        json={'dtlsParameters': dtls_parameters},
    )


async def create_producer(
    room_id: str,
    peer_id: str,
    transport_id: str,
    kind: str,
    rtp_parameters: dict,
    app_data: dict | None = None,
) -> dict:
    """
    Producer 생성 (클라이언트가 미디어 송신 시작).

    Returns:
        {'id': str}  ← producer ID

    Notes:
        server.js POST /rooms/:roomId/peers/:peerId/producers
    """
    data = await _request(
        'POST',
        f'/rooms/{room_id}/peers/{peer_id}/producers',
        json={
            'transportId':    transport_id,
            'kind':           kind,
            'rtpParameters':  rtp_parameters,
            'appData':        app_data or {},
        },
    )
    return {'id': data['id']}


async def pause_producer(room_id: str, peer_id: str, producer_id: str) -> None:
    """
    Producer 일시 정지 (mute).

    Notes:
        server.js POST /rooms/:roomId/peers/:peerId/producers/:producerId/pause
    """
    await _request(
        'POST',
        f'/rooms/{room_id}/peers/{peer_id}/producers/{producer_id}/pause',
    )


async def resume_producer(room_id: str, peer_id: str, producer_id: str) -> None:
    """
    Producer 재개 (unmute).

    Notes:
        server.js POST /rooms/:roomId/peers/:peerId/producers/:producerId/resume
    """
    await _request(
        'POST',
        f'/rooms/{room_id}/peers/{peer_id}/producers/{producer_id}/resume',
    )


async def create_consumer(
    room_id: str,
    consumer_peer_id: str,
    producer_peer_id: str,
    producer_id: str,
    transport_id: str,
    rtp_capabilities: dict,
) -> dict:
    """
    Consumer 생성 (타 참가자의 미디어 수신).

    Args:
        room_id:           방 ID
        consumer_peer_id:  수신하는 쪽 Peer ID  (자신)
        producer_peer_id:  송신하는 쪽 Peer ID  (상대방)
        producer_id:       consume 대상 Producer ID
        transport_id:      자신의 recv Transport ID
        rtp_capabilities:  자신의 Device.rtpCapabilities

    Returns:
        {
            'id':            str,   ← consumer ID
            'producerId':    str,
            'kind':          'audio' | 'video',
            'rtpParameters': dict,
            'producerPeerId': str,
        }

    Notes:
        server.js POST /rooms/:roomId/peers/:peerId/consumers
        Room.js consume() 가 paused=True 로 생성 → 클라이언트가 resume 호출 필요.

    중요:
        consumer_peer_id != producer_peer_id 검증은 mediasoup 서버(Room.js)가 처리.
        이 함수는 서버 응답을 그대로 전달.
    """
    data = await _request(
        'POST',
        f'/rooms/{room_id}/peers/{consumer_peer_id}/consumers',
        json={
            'producerPeerId':  producer_peer_id,
            'producerId':      producer_id,
            'transportId':     transport_id,
            'rtpCapabilities': rtp_capabilities,
        },
    )
    # Room.js consume() 반환:
    # { id, producerId, kind, rtpParameters, producerPeerId }
    return {
        'id':             data['id'],
        'producerId':     data['producerId'],
        'kind':           data['kind'],
        'rtpParameters':  data['rtpParameters'],
        'producerPeerId': data.get('producerPeerId', producer_peer_id),
    }


async def resume_consumer(room_id: str, peer_id: str, consumer_id: str) -> None:
    """
    Consumer resume — 클라이언트가 렌더링 준비 완료 후 호출.
    mediasoup는 Consumer를 paused=True 로 생성하므로 이 호출 전까지 RTP 미전송.

    Notes:
        server.js POST /rooms/:roomId/peers/:peerId/consumers/:consumerId/resume
    """
    await _request(
        'POST',
        f'/rooms/{room_id}/peers/{peer_id}/consumers/{consumer_id}/resume',
    )


async def get_producers(room_id: str) -> list:
    """
    방 전체 Producer 목록 조회 (디버그/복구용).

    Returns:
        [{'peerId': str, 'producerId': str, 'kind': str, 'paused': bool}, ...]
    """
    data = await _request('GET', f'/rooms/{room_id}/producers')
    producers = data.get('producers', [])
    return [
        {
            'peerId':     p.get('peerId') or p.get('peer_id', ''),
            'producerId': p.get('producerId') or p.get('producer_id', ''),
            'kind':       p.get('kind', ''),
            'paused':     p.get('paused', False),
        }
        for p in producers
    ]