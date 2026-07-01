import { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';

interface CallModalProps {
  onClose?: () => void;
}

export default function CallModal({ onClose }: CallModalProps) {
  const {
    callType,
    callStatus,
    localStream,
    remoteStream,
    acceptCall,
    rejectCall,
    endCall,
    myName,
    room,
  } = useChatStore();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream && callType === 'video') {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  const peerName = room?.members.find(m => m.name !== '我')?.name || '对方';

  if (callStatus === 'idle' || !callType) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
      <div className="w-full h-full flex flex-col">
        {callType === 'video' ? (
          <div className="flex-1 relative bg-gray-900">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute top-4 right-4 w-32 h-48 bg-black rounded-lg overflow-hidden border-2 border-white/20 shadow-xl">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-b from-gray-800 to-gray-900">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-3xl font-medium mb-6">
              {peerName.charAt(0)}
            </div>
            <h2 className="text-white text-xl font-medium mb-2">{peerName}</h2>
            <p className="text-gray-400 text-sm">
              {callStatus === 'calling' && '正在呼叫...'}
              {callStatus === 'ringing' && '来电...'}
              {callStatus === 'connected' && '通话中'}
            </p>
            {callStatus === 'connected' && (
              <div className="mt-4 text-gray-400 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  语音通话已连接
                </div>
              </div>
            )}
          </div>
        )}

        <div className="bg-gray-900/90 backdrop-blur-sm py-8 px-6">
          <div className="flex items-center justify-center gap-8">
            <button
              onClick={toggleMute}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                isMuted ? 'bg-red-500 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'
              }`}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>

            {callType === 'video' && (
              <button
                onClick={toggleVideo}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                  isVideoOff ? 'bg-red-500 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'
                }`}
              >
                {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
              </button>
            )}

            {callStatus === 'ringing' && (
              <>
                <button
                  onClick={rejectCall}
                  className="w-14 h-14 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-all"
                >
                  <PhoneOff className="w-6 h-6" />
                </button>
                <button
                  onClick={acceptCall}
                  className="w-14 h-14 rounded-full bg-green-500 text-white flex items-center justify-center hover:bg-green-600 transition-all animate-pulse"
                >
                  <Phone className="w-6 h-6" />
                </button>
              </>
            )}

            {(callStatus === 'calling' || callStatus === 'connected') && (
              <button
                onClick={endCall}
                className="w-14 h-14 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-all"
              >
                <PhoneOff className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
