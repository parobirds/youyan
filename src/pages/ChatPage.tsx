import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Shield, MoreVertical, Image, Smile, Copy, Check, QrCode } from 'lucide-react';
import MessageBubble from '@/components/MessageBubble';
import { useChatStore } from '@/store/useChatStore';
import { formatDate } from '@/utils';

export default function ChatPage() {
  const { roomId = '' } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [inputText, setInputText] = useState('');
  const [isJoining, setIsJoining] = useState(true);
  const [copied, setCopied] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    connectionStatus,
    myId,
    room,
    joinRoom,
    sendMessage,
    leaveRoom,
    sharedKey,
  } = useChatStore();

  useEffect(() => {
    if (roomId && room?.id !== roomId && connectionStatus === 'idle') {
      joinRoom(roomId);
    }
    setIsJoining(false);
  }, [roomId, room?.id, connectionStatus, joinRoom]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!inputText.trim() || !sharedKey) return;
    sendMessage(inputText.trim(), 'text');
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleBack = () => {
    leaveRoom();
    navigate('/');
  };

  const handleCopyRoomId = async () => {
    const id = room?.id || roomId;
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  const shouldShowDate = (index: number) => {
    if (index === 0) return true;
    const currentDate = formatDate(messages[index].timestamp);
    const prevDate = formatDate(messages[index - 1].timestamp);
    return currentDate !== prevDate;
  };

  if (isJoining || (!room && connectionStatus === 'connecting')) {
    return (
      <div className="min-h-screen bg-[#EDEDED] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#07C160] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">正在建立安全连接...</p>
          <p className="text-xs text-gray-400 mt-2">密钥交换中</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen chat-bg flex flex-col">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center sticky top-0 z-10">
        <button
          onClick={handleBack}
          className="p-2 -ml-2 text-gray-600 hover:text-gray-800 active:opacity-70"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="flex-1 text-center pr-8">
          <h1 className="text-lg font-medium text-gray-800">
            {room?.name || '有言聊天室'}
          </h1>
          <div className="flex items-center justify-center gap-1 mt-0.5">
            <Shield className="w-3 h-3 text-[#07C160]" />
            <span className="text-xs text-[#07C160]">端对端加密</span>
          </div>
        </div>
        <button
          onClick={() => navigate('/settings')}
          className="p-2 -mr-2 text-gray-600 hover:text-gray-800 active:opacity-70"
        >
          <MoreVertical className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        {messages.length === 0 && (
          <div className="text-center py-12 px-6">
          {connectionStatus === 'connected' ? (
            <>
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-[#07C160]" />
              </div>
              <p className="text-gray-600 text-sm mb-2">加密通道已建立</p>
              <p className="text-gray-400 text-xs">
                所有消息均采用 AES-256-GCM 加密
              </p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 relative">
                <Shield className="w-8 h-8 text-blue-500" />
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center">
                  <div className="w-3 h-3 bg-[#07C160] rounded-full animate-pulse" />
                </div>
              </div>
              <p className="text-gray-700 text-sm mb-2">等待对方加入房间</p>
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className="font-mono text-gray-600 text-sm bg-gray-100 px-3 py-1 rounded-lg">
                  {room?.id || roomId}
                </span>
                <button
                  onClick={handleCopyRoomId}
                  className="p-1.5 text-gray-400 hover:text-[#07C160] transition-colors"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-[#07C160]" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 max-w-xs mx-auto">
                <p className="text-xs text-gray-500 leading-relaxed mb-3">
                  将房间号分享给对方，对方加入后将自动建立端对端加密连接。
                </p>
                <button
                  onClick={() => navigate('/create')}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-[#07C160]/10 text-[#07C160] rounded-lg text-sm font-medium hover:bg-[#07C160]/20 transition-colors"
                >
                  <QrCode className="w-4 h-4" />
                  查看二维码
                </button>
              </div>
            </>
          )}
        </div>
        )}

        {messages.map((message, index) => (
          <MessageBubble
            key={message.id}
            message={message}
            isOwn={message.senderId === myId}
            showDate={shouldShowDate(index)}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="bg-white border-t border-gray-100 px-4 py-3 sticky bottom-0">
        {connectionStatus !== 'connected' && (
          <div className="mb-3 px-3 py-2 bg-orange-50 rounded-lg flex items-center gap-2">
            <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
            <span className="text-xs text-orange-600">
              等待对方加入以建立加密连接...
            </span>
          </div>
        )}
        <div className="flex items-end gap-2">
          <button className="p-2 text-gray-500 hover:text-gray-700 -ml-2" disabled={!sharedKey}>
            <Smile className="w-6 h-6" />
          </button>
          <div className="flex-1 bg-gray-100 rounded-2xl px-4 py-2">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={sharedKey ? "输入消息..." : "加密连接建立后即可发送消息"}
              rows={1}
              disabled={!sharedKey}
              className="w-full bg-transparent resize-none outline-none text-gray-800 text-[15px] placeholder-gray-400 max-h-32 disabled:cursor-not-allowed disabled:text-gray-400"
              style={{ minHeight: '24px' }}
            />
          </div>
          <button className="p-2 text-gray-500 hover:text-gray-700 -mr-2" disabled={!sharedKey}>
            <Image className="w-6 h-6" />
          </button>
          {inputText.trim() && sharedKey && (
            <button
              onClick={handleSend}
              className="p-2 bg-[#07C160] text-white rounded-full hover:bg-[#06AD56] active:scale-95 transition-all"
            >
              <Send className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
