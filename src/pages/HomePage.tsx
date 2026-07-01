import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, MessageCircle, Plus, LogIn, Lock, Settings, Clock, Trash2, ChevronRight } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { loadRooms, saveRooms } from '@/storage';
import type { Room } from '@/types';

export default function HomePage() {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState('');
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [recentRooms, setRecentRooms] = useState<Room[]>([]);
  const createRoom = useChatStore((state) => state.createRoom);

  useEffect(() => {
    const rooms = loadRooms();
    // 按创建时间倒序排列，最多显示10个
    const sortedRooms = rooms
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10);
    setRecentRooms(sortedRooms);
  }, []);

  const handleCreateRoom = async () => {
    setIsCreating(true);
    try {
      const roomId = await createRoom(2);
      // 保存到最近房间列表
      const rooms = loadRooms();
      const existingIndex = rooms.findIndex(r => r.id === roomId);
      if (existingIndex === -1) {
        rooms.push({
          id: roomId,
          name: '有言聊天室',
          maxMembers: 2,
          createdAt: Date.now(),
          members: [],
        });
      } else {
        rooms[existingIndex].createdAt = Date.now();
      }
      saveRooms(rooms);
      navigate(`/chat/${encodeURIComponent(roomId)}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = () => {
    if (roomCode.trim()) {
      const roomId = roomCode.trim(); // 保留用户输入的原始格式
      // 保存到最近房间列表
      const rooms = loadRooms();
      const existingIndex = rooms.findIndex(r => r.id === roomId);
      if (existingIndex === -1) {
        rooms.push({
          id: roomId,
          name: '有言聊天室',
          maxMembers: 2,
          createdAt: Date.now(),
          members: [],
        });
      } else {
        rooms[existingIndex].createdAt = Date.now();
      }
      saveRooms(rooms);
      navigate(`/chat/${encodeURIComponent(roomId)}`);
    }
  };

  const handleEnterRoom = (roomId: string) => {
    navigate(`/chat/${encodeURIComponent(roomId)}`);
  };

  const handleDeleteRoom = (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const rooms = loadRooms().filter(r => r.id !== roomId);
    saveRooms(rooms);
    setRecentRooms(rooms.sort((a, b) => b.createdAt - a.createdAt).slice(0, 10));
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
    return new Date(timestamp).toLocaleDateString('zh-CN');
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

      {/* 聊天室列表 */}
      {recentRooms.length > 0 && (
        <div className="bg-white mb-2">
          <div className="px-4 py-2 text-xs text-gray-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            最近聊天
          </div>
          {recentRooms.map((room) => (
            <div
              key={room.id}
              onClick={() => handleEnterRoom(room.id)}
              className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 active:bg-gray-100 cursor-pointer border-b border-gray-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-sm font-medium">
                  有
                </div>
                <div>
                  <p className="text-gray-800 font-medium">{room.name || '有言聊天室'}</p>
                  <p className="text-gray-400 text-xs">{formatTime(room.createdAt)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 font-mono">
                  {room.id.slice(0, 12)}...
                </span>
                <button
                  onClick={(e) => handleDeleteRoom(room.id, e)}
                  className="p-1 text-gray-300 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        {recentRooms.length === 0 && (
          <div className="mb-8 text-center">
            <div className="w-16 h-16 bg-[#2C5E4E] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <MessageCircle className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">有言</h1>
            <p className="text-gray-500 text-sm">端对端加密，安全无忧</p>
          </div>
        )}

        <div className="w-full max-w-sm space-y-4">
          <button
            onClick={handleCreateRoom}
            disabled={isCreating}
            className="w-full bg-[#2C5E4E] text-white py-4 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#1F4337] active:scale-[0.98] transition-all shadow-md disabled:opacity-50"
          >
            <Plus className="w-5 h-5" />
            {isCreating ? '创建中...' : '创建加密房间'}
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
            <div className="bg-white rounded-xl p-4 shadow-md border border-gray-100 animate-slide-up">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  placeholder="输入任意房间名或房间号"
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[#2C5E4E] focus:ring-1 focus:ring-[#2C5E4E] text-gray-700 text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                  autoFocus
                />
                <button
                  onClick={handleJoinRoom}
                  disabled={!roomCode.trim()}
                  className="px-6 py-3 bg-[#2C5E4E] text-white rounded-lg font-medium hover:bg-[#1F4337] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  加入
                </button>
              </div>
              <button
                onClick={() => {
                  setShowJoinInput(false);
                  setRoomCode('');
                }}
                className="mt-3 text-sm text-gray-400 hover:text-gray-600"
              >
                取消
              </button>
            </div>
          )}
        </div>

        <div className="mt-8 text-center">
          <div className="flex items-center justify-center gap-2 text-gray-400 text-sm mb-2">
            <Shield className="w-4 h-4" />
            端对端加密保护
          </div>
          <p className="text-gray-400 text-xs max-w-xs leading-relaxed">
            所有消息均采用 AES-256-GCM 加密，仅收发双方可解密。
          </p>
        </div>
      </div>

      <div className="py-4 text-center safe-area-bottom">
        <div className="flex items-center justify-center gap-1 text-gray-400 text-xs">
          <Lock className="w-3 h-3" />
          <span>E2EE · P-256 · AES-256-GCM</span>
        </div>
      </div>
    </div>
  );
}