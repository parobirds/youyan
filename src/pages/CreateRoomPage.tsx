import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Copy, Check, Shield, Users, MessageCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useChatStore } from '@/store/useChatStore';

export default function CreateRoomPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('roomId') || '';
  const [copied, setCopied] = useState(false);
  const [maxMembers, setMaxMembers] = useState(2);
  const [isCreating, setIsCreating] = useState(false);
  const connectionStatus = useChatStore((state) => state.connectionStatus);
  const leaveRoom = useChatStore((state) => state.leaveRoom);
  const createRoom = useChatStore((state) => state.createRoom);
  const room = useChatStore((state) => state.room);

  const memberOptions = [2, 3, 4, 5, 10];

  useEffect(() => {
    if (!roomId && !isCreating) {
      setIsCreating(true);
      createRoom(maxMembers).then(() => {
        setIsCreating(false);
      });
    }
  }, [roomId, isCreating, createRoom, maxMembers]);

  useEffect(() => {
    if (connectionStatus === 'connected' && room) {
      navigate(`/chat/${encodeURIComponent(room.id)}`);
    }
  }, [connectionStatus, room, navigate]);

  const displayRoomId = room?.id || roomId;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayRoomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  const handleEnterChat = () => {
    if (room) {
      navigate(`/chat/${encodeURIComponent(room.id)}`);
    }
  };

  const handleBack = () => {
    if (room) {
      navigate(`/chat/${encodeURIComponent(room.id)}`);
    } else {
      leaveRoom();
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-[#EDEDED] flex flex-col">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center sticky top-0 z-10">
        <button
          onClick={handleBack}
          className="p-2 -ml-2 text-gray-600 hover:text-gray-800 active:opacity-70"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="flex-1 text-center text-lg font-medium text-gray-800 pr-8">
          创建加密房间
        </h1>
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          <div className="flex items-center gap-1 bg-green-50 px-2 py-1 rounded-full">
            <Shield className="w-3.5 h-3.5 text-[#07C160]" />
            <span className="text-xs text-[#07C160] font-medium">端对端加密</span>
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 py-8 flex flex-col items-center">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
            <p className="text-sm text-gray-500 mb-2 text-center">房间号</p>
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="text-2xl font-mono font-bold text-gray-800 tracking-wider">
                {displayRoomId || '生成中...'}
              </span>
            </div>
            <button
              onClick={handleCopy}
              className="w-full flex items-center justify-center gap-2 py-3 bg-gray-50 rounded-xl text-gray-600 hover:bg-gray-100 active:scale-[0.98] transition-all"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-[#07C160]" />
                  <span className="text-[#07C160]">已复制</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>复制房间号</span>
                </>
              )}
            </button>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
            <p className="text-sm text-gray-500 mb-4 text-center">扫描二维码加入</p>
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-white rounded-xl border border-gray-100 shadow-inner">
                {displayRoomId ? (
                  <QRCodeSVG
                    value={displayRoomId}
                    size={180}
                    level="H"
                    fgColor="#1a1a1a"
                    bgColor="#ffffff"
                  />
                ) : (
                  <div className="w-[180px] h-[180px] bg-gray-100 rounded-lg flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-gray-300 border-t-[#07C160] rounded-full animate-spin" />
                  </div>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-400 text-center">
              对方使用手机扫码即可加入
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600">成员上限</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {memberOptions.map((num) => (
                <button
                  key={num}
                  onClick={() => setMaxMembers(num)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    maxMembers === num
                      ? 'bg-[#07C160] text-white shadow-md'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {num}人
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
            <div className="flex items-center justify-center gap-3">
              <div className="relative">
                <div className="w-3 h-3 bg-[#07C160] rounded-full animate-pulse" />
                <div className="absolute inset-0 w-3 h-3 bg-[#07C160] rounded-full animate-ping opacity-30" />
              </div>
              <span className="text-gray-600">等待对方加入...</span>
            </div>
            <p className="text-xs text-gray-400 text-center mt-3">
              请将房间号或二维码分享给对方
            </p>
          </div>

          <button
            onClick={handleEnterChat}
            disabled={!room}
            className="w-full bg-white text-[#07C160] py-4 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-gray-50 active:scale-[0.98] transition-all shadow-md border border-green-100 disabled:opacity-50"
          >
            <MessageCircle className="w-5 h-5" />
            进入聊天室
          </button>
        </div>
      </div>

      <div className="py-6 text-center">
        <div className="flex items-center justify-center gap-1 text-gray-400 text-xs">
          <Shield className="w-3 h-3" />
          <span>消息端对端加密，仅双方可见</span>
        </div>
      </div>
    </div>
  );
}
