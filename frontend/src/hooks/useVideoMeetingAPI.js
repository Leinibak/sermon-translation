// frontend/src/hooks/useVideoMeetingAPI.js
import { useState, useCallback } from 'react';
import axios from '../api/axios';

export function useVideoMeetingAPI(roomId) {
  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // =========================================================================
  // Room Details
  // =========================================================================
  
  const fetchRoomDetails = useCallback(async () => {
    try {
      const response = await axios.get(`/video-meetings/${roomId}/`);
      const roomData = response.data;
      
      console.log(`📋 회의실 정보: ${roomData.title}`);
      
      setRoom(roomData);

      const approvedParticipants = roomData.participants.filter(
        p => p.status === 'approved'
      );
      setParticipants(approvedParticipants);
      
      return roomData;
    } catch (error) {
      console.error('❌ 회의실 정보 로딩 실패:', error);
      setError('회의실 정보를 가져올 수 없습니다.');
      throw error;
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  // =========================================================================
  // Pending Requests
  // =========================================================================
  
  const fetchPendingRequests = useCallback(async () => {
    try {
      const response = await axios.get(`/video-meetings/${roomId}/pending_requests/`);
      const pending = response.data;
      
      setPendingRequests(pending);
      return pending;
    } catch (error) {
      console.error('❌ 대기 요청 폴링 실패:', error);
      return [];
    }
  }, [roomId]);

  // =========================================================================
  // Approve / Reject
  // =========================================================================
  
  const approveParticipant = useCallback(async (participantId) => {
    try {
      const response = await axios.post(
        `/video-meetings/${roomId}/approve_participant/`, 
        { participant_id: participantId }
      );
      
      const approvedParticipant = response.data;
      console.log(`✅ 승인 완료:`, approvedParticipant.username);
      
      setPendingRequests(prev => prev.filter(p => p.id !== participantId));
      setParticipants(prev => [...prev, approvedParticipant]);
      
      await fetchRoomDetails();
      
      return approvedParticipant;
    } catch (error) {
      console.error('❌ 승인 실패:', error);
      throw error;
    }
  }, [roomId, fetchRoomDetails]);

  const rejectParticipant = useCallback(async (participantId) => {
    try {
      await axios.post(
        `/video-meetings/${roomId}/reject_participant/`, 
        { participant_id: participantId }
      );
      
      console.log(`✅ 거부 완료`);
      setPendingRequests(prev => prev.filter(p => p.id !== participantId));
    } catch (error) {
      console.error('❌ 거부 실패:', error);
      throw error;
    }
  }, [roomId]);

  // =========================================================================
  // Leave Room
  // =========================================================================
  
  const leaveRoom = useCallback(async () => {
    try {
      await axios.post(`/video-meetings/${roomId}/leave/`);
      console.log('✅ 회의실 나가기 완료');
    } catch (error) {
      console.error('❌ 회의실 나가기 실패:', error);
    }
  }, [roomId]);

  // =========================================================================
  // Signal Polling
  // =========================================================================
  
  const pollSignals = useCallback(async () => {
    try {
      const response = await axios.get(`/video-meetings/${roomId}/get_signals/`);
      const signals = response.data;
      
      if (signals && signals.length > 0) {
        // 시간순 정렬
        const sorted = signals.sort((a, b) => 
          new Date(a.created_at) - new Date(b.created_at)
        );
        return sorted;
      }
      return [];
    } catch (error) {
      if (error.response?.status !== 404 && error.response?.status !== 403) {
        console.error('❌ 시그널 폴링 실패:', error);
      }
      return null; // null이면 폴링 중단 신호
    }
  }, [roomId]);

  return {
    room,
    participants,
    pendingRequests,
    loading,
    error,
    fetchRoomDetails,
    fetchPendingRequests,
    approveParticipant,
    rejectParticipant,
    leaveRoom,
    pollSignals,
  };
}