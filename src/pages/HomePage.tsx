import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, MessageCircle, Plus, LogIn, Lock, Settings } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';

export default function HomePage() {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState('');
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const createRoom = useChatStore((state) => state.createRoom);

  const handleCreateRoom = async () => {
    setIsCreating(true);
    try {
      const roomId = await createRoom(2);
      navigate(`/chat/${encodeURIComponent(roomId)}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = () => {
    if (roomCode.trim()) {
      const normalizedCode = roomCode.trim().toUpperCase();
      navigate(`/chat/${encodeURIComponent(normalizedCode)}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#EDEDED] flex flex-col">
      <div className="bg-white/80 backdrop-blur-sm px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="w-10" />
        <h1 className="text-lg font-medium text-gray-800">有言</h1>
        <button
          onClick={() => navigate('/settings')}
          className="p-2 -mr-2 text-gray-500 hover:text-gray-700 active:opacity-70"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="mb-10 text-center">
          <div className="w-20 h-20 bg-[#07C160] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <MessageCircle className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">有言</h1>
          <p className="text-gray-500 text-sm">端对端加密，安全无忧</p>
        </div>

        <div className="w-full max-w-sm space-y-4">
          <button
            onClick={handleCreateRoom}
            disabled={isCreating}
            className="w-full bg-[#07C160] text-white py-4 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#06AD56] active:scale-[0.98] transition-all shadow-md disabled:opacity-50"
          >
            <Plus className="w-5 h-5" />
            创建加密房间
          </button>

          {!showJoinInput ? (
            <button
              onClick={() => setShowJoinInput(true)}
              className="w-full bg-white text-gray-700 py-4 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-gray-50 active:scale-[0.98] transition-all shadow-md border border-gray-100"
            >
              <LogIn className="w-5 h-5" />
              加入房间
            </button>
          ) : (
            <div className="bg-white rounded-xl p-4 shadow-md border border-gray-100">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  placeholder="输入房间号"
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[#07C160] focus:ring-1 focus:ring-[#07C160] text-gray-700 uppercase"
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                  autoFocus
                />
                <button
                  onClick={handleJoinRoom}
                  disabled={!roomCode.trim()}
                  className="px-6 py-3 bg-[#07C160] text-white rounded-lg font-medium hover:bg-[#06AD56] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  加入
                </button>
              </div>
              <button
                onClick={() => setShowJoinInput(false)}
                className="mt-3 text-sm text-gray-400 hover:text-gray-600"
              >
                取消
              </button>
            </div>
          )}
        </div>

        <div className="mt-12 text-center">
          <div className="flex items-center justify-center gap-2 text-gray-400 text-sm mb-3">
            <Shield className="w-4 h-4" />
            端对端加密保护
          </div>
          <p className="text-gray-400 text-xs max-w-xs leading-relaxed">
            所有消息均采用 AES-256-GCM 加密，仅收发双方可解密。
            服务器仅传输密文，无法读取任何消息内容。
          </p>
        </div>
      </div>

      <div className="py-6 text-center">
        <div className="flex items-center justify-center gap-1 text-gray-400 text-xs">
          <Lock className="w-3 h-3" />
          <span>E2EE · P-256 · AES-256-GCM</span>
        </div>
      </div>
    </div>
  );
}
