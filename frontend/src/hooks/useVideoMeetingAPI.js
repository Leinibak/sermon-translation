// frontend/src/hooks/useVideoMeetingAPI.js (완전 수정 버전)
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
    // ⭐⭐⭐ roomId 검증 강화
    if (!roomId || roomId === 'undefined' || roomId === 'null') {
      console.error('❌ 유효하지 않은 Room ID:', roomId);
      const error = new Error('유효하지 않은 Room ID');
      setError('유효하지 않은 Room ID');
      setLoading(false);
      throw error;
    }

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
  }, [roomId]); // ⭐ roomId를 의존성에 포함

  // =========================================================================
  // Pending Requests
  // =========================================================================
  
  const fetchPendingRequests = useCallback(async () => {
    if (!roomId || roomId === 'undefined' || roomId === 'null') {
      console.error('❌ 유효하지 않은 Room ID');
      return [];
    }

    try {
      const response = await axios.get(`/video-meetings/${roomId}/pending_requests/`);
      const pending = response.data;
      
      console.log(`📋 대기 요청: ${pending.length}개`);
      setPendingRequests(pending);
      return pending;
    } catch (error) {
      console.error('❌ 대기 요청 로딩 실패:', error);
      return [];
    }
  }, [roomId]);

  // =========================================================================
  // Approve / Reject
  // =========================================================================
  
  const approveParticipant = useCallback(async (participantId) => {
    if (!roomId || roomId === 'undefined' || roomId === 'null') {
      console.error('❌ 유효하지 않은 Room ID');
      throw new Error('유효하지 않은 Room ID');
    }

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
    if (!roomId || roomId === 'undefined' || roomId === 'null') {
      console.error('❌ 유효하지 않은 Room ID');
      throw new Error('유효하지 않은 Room ID');
    }

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
  // Leave / End Room
  // =========================================================================
  
  const leaveRoom = useCallback(async () => {
    if (!roomId || roomId === 'undefined' || roomId === 'null') {
      console.error('❌ 유효하지 않은 Room ID');
      throw new Error('유효하지 않은 Room ID');
    }

    try {
      await axios.post(`/video-meetings/${roomId}/leave/`);
      console.log('✅ 회의실 나가기 완료');
    } catch (error) {
      console.error('❌ 회의실 나가기 실패:', error);
      throw error;
    }
  }, [roomId]);

  const endMeeting = useCallback(async () => {
    if (!roomId || roomId === 'undefined' || roomId === 'null') {
      console.error('❌ 유효하지 않은 Room ID');
      throw new Error('유효하지 않은 Room ID');
    }

    try {
      await axios.post(`/video-meetings/${roomId}/end/`);
      console.log('✅ 회의 종료 완료');
    } catch (error) {
      console.error('❌ 회의 종료 실패:', error);
      throw error;
    }
  }, [roomId]);

  // =========================================================================
  // Chat Messages
  // =========================================================================
  
  const fetchChatMessages = useCallback(async () => {
    if (!roomId || roomId === 'undefined' || roomId === 'null') {
      console.error('❌ 유효하지 않은 Room ID');
      return [];
    }

    try {
      const response = await axios.get(`/video-meetings/${roomId}/chat/messages`);
      return response.data;
    } catch (error) {
      console.error('❌ 채팅 메시지 로딩 실패:', error);
      return [];
    }
  }, [roomId]);

  const sendChatMessage = useCallback(async (content) => {
    if (!roomId || roomId === 'undefined' || roomId === 'null') {
      console.error('❌ 유효하지 않은 Room ID');
      throw new Error('유효하지 않은 Room ID');
    }

    try {
      const response = await axios.post(
        `/video-meetings/${roomId}/chat/send`,
        { content }
      );
      return response.data;
    } catch (error) {
      console.error('❌ 채팅 메시지 전송 실패:', error);
      throw error;
    }
  }, [roomId]);

  // =========================================================================
  // Reactions
  // =========================================================================
  
  const sendReaction = useCallback(async (reactionType) => {
    if (!roomId || roomId === 'undefined' || roomId === 'null') {
      console.error('❌ 유효하지 않은 Room ID');
      throw new Error('유효하지 않은 Room ID');
    }

    try {
      const response = await axios.post(
        `/video-meetings/${roomId}/reactions/send`,
        { reaction_type: reactionType }
      );
      return response.data;
    } catch (error) {
      console.error('❌ 반응 전송 실패:', error);
      throw error;
    }
  }, [roomId]);

  // =========================================================================
  // Raise Hand
  // =========================================================================
  
  const raiseHand = useCallback(async () => {
    if (!roomId || roomId === 'undefined' || roomId === 'null') {
      console.error('❌ 유효하지 않은 Room ID');
      throw new Error('유효하지 않은 Room ID');
    }

    try {
      const response = await axios.post(`/video-meetings/${roomId}/raise-hand`);
      return response.data;
    } catch (error) {
      console.error('❌ 손들기 실패:', error);
      throw error;
    }
  }, [roomId]);

  const lowerHand = useCallback(async () => {
    if (!roomId || roomId === 'undefined' || roomId === 'null') {
      console.error('❌ 유효하지 않은 Room ID');
      throw new Error('유효하지 않은 Room ID');
    }

    try {
      const response = await axios.post(`/video-meetings/${roomId}/lower-hand`);
      return response.data;
    } catch (error) {
      console.error('❌ 손내리기 실패:', error);
      throw error;
    }
  }, [roomId]);

  const fetchRaisedHands = useCallback(async () => {
    if (!roomId || roomId === 'undefined' || roomId === 'null') {
      console.error('❌ 유효하지 않은 Room ID');
      return [];
    }

    try {
      const response = await axios.get(`/video-meetings/${roomId}/raised-hands`);
      return response.data;
    } catch (error) {
      console.error('❌ 손든 사용자 목록 로딩 실패:', error);
      return [];
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
    endMeeting,
    fetchChatMessages,
    sendChatMessage,
    sendReaction,
    raiseHand,
    lowerHand,
    fetchRaisedHands,
  };
}