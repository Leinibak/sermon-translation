// frontend/src/components/VideoMeeting/ControlBar.jsx
import React from 'react';
import { Video, VideoOff, Mic, MicOff, PhoneOff } from 'lucide-react';

export function ControlBar({ 
  isMicOn, 
  isVideoOn, 
  onToggleMic, 
  onToggleVideo, 
  onLeave 
}) {
  return (
    <div className="bg-gray-800 border-t border-gray-700 px-6 py-3 flex justify-center items-center gap-6">
      <button
        onClick={onToggleMic}
        className={`p-3 rounded-full transition ${
          isMicOn 
            ? 'bg-white text-gray-900 hover:bg-gray-200' 
            : 'bg-red-600 text-white hover:bg-red-700'
        }`}
      >
        {isMicOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
      </button>
      
      <button
        onClick={onToggleVideo}
        className={`p-3 rounded-full transition ${
          isVideoOn 
            ? 'bg-white text-gray-900 hover:bg-gray-200' 
            : 'bg-red-600 text-white hover:bg-red-700'
        }`}
      >
        {isVideoOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
      </button>
      
      <button
        onClick={onLeave}
        className="p-3 bg-red-800 text-white rounded-full hover:bg-red-900 transition"
      >
        <PhoneOff className="w-6 h-6" />
      </button>
    </div>
  );
}