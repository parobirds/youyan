import { useEffect, useRef, useState } from 'react';
import { useScreenShareStore } from '@/store/useScreenShareStore';
import { X, Mic, MicOff, Monitor, PhoneOff } from 'lucide-react';

interface ScreenShareModalProps {
  onClose: () => void;
  myId: string;
  myName: string;
}

export default function ScreenShareModal({ onClose, myId, myName }: ScreenShareModalProps) {
  const {
    status,
    screenStream,
    remoteScreenStream,
    sharerId,
    sharerName,
    audioEnabled,
    startScreenShare,
    acceptScreenShare,
    rejectScreenShare,
    stopScreenShare,
    toggleAudio,
  } = useScreenShareStore();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && screenStream) {
      localVideoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteScreenStream) {
      remoteVideoRef.current.srcObject = remoteScreenStream;
    }
  }, [remoteScreenStream]);

  const handleStart = async () => {
    await startScreenShare(myId, myName);
  };

  const handleAccept = () => {
    acceptScreenShare(myId);
  };

  const handleReject = () => {
    rejectScreenShare(myId);
    onClose();
  };

  const handleStop = () => {
    stopScreenShare(myId);
    onClose();
  };

  const isSharer = status === 'sharing';
  const isViewer = status === 'watching';
  const isIncoming = status === 'requesting' && !screenStream;
  const isOutgoing = status === 'requesting' && !!screenStream;

  if (status === 'idle') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl w-full max-w-md p-6 animate-scale-in">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">屏幕共享</h3>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-[#2C5E4E]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Monitor className="w-8 h-8 text-[#2C5E4E]" />
            </div>
            <p className="text-gray-600 mb-6">分享你的屏幕给对方观看</p>
            
            <button
              onClick={handleStart}
              className="w-full py-3 bg-[#2C5E4E] text-white rounded-lg font-medium hover:bg-[#1F4337] transition-colors"
            >
              开始共享屏幕
            </button>
          </div>
          
          <p className="text-xs text-gray-400 text-center mt-4">
            提示：屏幕共享通过 WebRTC 点对点直连，视频流不经过服务器
          </p>
        </div>
      </div>
    );
  }

  if (isIncoming) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl w-full max-w-md p-6 animate-scale-in">
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-[#2C5E4E]/10 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
              <Monitor className="w-8 h-8 text-[#2C5E4E]" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              {sharerName || '对方'} 请求共享屏幕
            </h3>
            <p className="text-gray-500 text-sm mb-6">
              对方想和你分享屏幕，是否接受？
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={handleReject}
                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                拒绝
              </button>
              <button
                onClick={handleAccept}
                className="flex-1 py-3 bg-[#2C5E4E] text-white rounded-lg font-medium hover:bg-[#1F4337] transition-colors"
              >
                接受
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isSharer || isViewer) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <video
          ref={isSharer ? localVideoRef : remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-contain"
          style={{ background: '#000' }}
        />
        
        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/50 to-transparent">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Monitor className="w-5 h-5 text-white" />
              <span className="text-white font-medium">
                {isSharer ? '正在共享屏幕' : `正在观看 ${sharerName || '对方'} 的屏幕`}
              </span>
            </div>
            <button
              onClick={handleStop}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
        
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/50 to-transparent">
          <div className="flex justify-center items-center gap-4">
            {isSharer && (
              <button
                onClick={toggleAudio}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                  audioEnabled ? 'bg-[#2C5E4E]' : 'bg-white/20'
                }`}
              >
                {audioEnabled ? (
                  <Mic className="w-6 h-6 text-white" />
                ) : (
                  <MicOff className="w-6 h-6 text-white" />
                )}
              </button>
            )}
            
            <button
              onClick={handleStop}
              className="w-16 h-16 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors"
            >
              <PhoneOff className="w-7 h-7 text-white" />
            </button>
          </div>
          
          <p className="text-center text-white/60 text-xs mt-3">
            {isSharer ? '点击按钮结束屏幕共享' : '对方正在共享屏幕'}
          </p>
        </div>
        
        {isSharer && (
          <div className="absolute bottom-24 right-4 w-32 h-24 rounded-lg overflow-hidden border-2 border-white/30 shadow-lg">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>
        )}
      </div>
    );
  }

  if (isOutgoing) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div className="text-center">
          <div className="w-24 h-24 bg-[#2C5E4E]/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Monitor className="w-12 h-12 text-[#2C5E4E]" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">等待对方接受</h3>
          <p className="text-white/60 mb-6">正在请求共享屏幕...</p>
          
          <button
            onClick={handleStop}
            className="px-8 py-3 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    );
  }

  return null;
}
