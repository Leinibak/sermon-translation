# backend/video_meetings/sfu_client.py
"""
mediasoup SFU REST API 클라이언트
Django consumer에서 호출하여 SFU 서버와 통신합니다.
"""
import os
import logging
import httpx

logger = logging.getLogger(__name__)

SFU_BASE_URL = os.environ.get('MEDIASOUP_API_URL', 'http://mediasoup:3000')
# 내부 서비스간 통신 — 짧은 타임아웃
_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


async def _get(path: str) -> dict:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.get(f"{SFU_BASE_URL}{path}")
        r.raise_for_status()
        return r.json()


async def _post(path: str, data: dict = None) -> dict:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.post(f"{SFU_BASE_URL}{path}", json=data or {})
        r.raise_for_status()
        return r.json()


async def _delete(path: str) -> dict:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.delete(f"{SFU_BASE_URL}{path}")
        r.raise_for_status()
        return r.json()


# ── Room / Peer ────────────────────────────────────────────────

async def get_rtp_capabilities(room_id: str) -> dict:
    """Router RTP Capabilities 조회 (Device.load에 사용)"""
    data = await _get(f"/rooms/{room_id}/rtp-capabilities")
    return data['rtpCapabilities']


async def join_room(room_id: str, peer_id: str) -> dict:
    """Peer 참가 — rtpCapabilities + 현재 producers 반환"""
    return await _post(f"/rooms/{room_id}/peers", {'peerId': peer_id})


async def leave_room(room_id: str, peer_id: str) -> None:
    """Peer 퇴장"""
    try:
        await _delete(f"/rooms/{room_id}/peers/{peer_id}")
    except Exception as e:
        logger.warning(f"SFU leave_room error (ignored): {e}")


# ── Transport ─────────────────────────────────────────────────

async def create_transport(room_id: str, peer_id: str) -> dict:
    """WebRtcTransport 생성"""
    return await _post(f"/rooms/{room_id}/peers/{peer_id}/transports")


async def connect_transport(room_id: str, peer_id: str,
                            transport_id: str, dtls_parameters: dict) -> None:
    await _post(
        f"/rooms/{room_id}/peers/{peer_id}/transports/{transport_id}/connect",
        {'dtlsParameters': dtls_parameters}
    )


# ── Producer ──────────────────────────────────────────────────

async def create_producer(room_id: str, peer_id: str,
                          transport_id: str, kind: str,
                          rtp_parameters: dict, app_data: dict = None) -> dict:
    return await _post(
        f"/rooms/{room_id}/peers/{peer_id}/producers",
        {
            'transportId': transport_id,
            'kind': kind,
            'rtpParameters': rtp_parameters,
            'appData': app_data or {},
        }
    )


async def pause_producer(room_id: str, peer_id: str, producer_id: str) -> None:
    await _post(f"/rooms/{room_id}/peers/{peer_id}/producers/{producer_id}/pause")


async def resume_producer(room_id: str, peer_id: str, producer_id: str) -> None:
    await _post(f"/rooms/{room_id}/peers/{peer_id}/producers/{producer_id}/resume")


# ── Consumer ──────────────────────────────────────────────────

async def create_consumer(room_id: str, consumer_peer_id: str,
                          producer_peer_id: str, producer_id: str,
                          transport_id: str, rtp_capabilities: dict) -> dict:
    return await _post(
        f"/rooms/{room_id}/peers/{consumer_peer_id}/consumers",
        {
            'producerPeerId': producer_peer_id,
            'producerId': producer_id,
            'transportId': transport_id,
            'rtpCapabilities': rtp_capabilities,
        }
    )


async def resume_consumer(room_id: str, peer_id: str, consumer_id: str) -> None:
    await _post(f"/rooms/{room_id}/peers/{peer_id}/consumers/{consumer_id}/resume")


# ── 목록 조회 ─────────────────────────────────────────────────

async def get_producers(room_id: str) -> list:
    """방 내 모든 Producer 목록"""
    data = await _get(f"/rooms/{room_id}/producers")
    return data.get('producers', [])
