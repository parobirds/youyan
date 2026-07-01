import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Send,
  Shield,
  MoreVertical,
  Image,
  Smile,
  Copy,
  Check,
  QrCode,
  Paperclip,
  Mic,
  Phone,
  Video,
  X,
  Info,
  AlertCircle,
} from 'lucide-react';
import MessageBubble from '@/components/MessageBubble';
import CallModal from '@/components/CallModal';
import { useChatStore } from '@/store/useChatStore';
import { formatDate } from '@/utils';
import { loadRooms, saveRooms } from '@/storage';

export default function ChatPage() {
  const { roomId = '' } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [inputText, setInputText] = useState('');
  const [isJoining, setIsJoining] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showTip, setShowTip] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    connectionStatus,
    myId,
    room,
    joinRoom,
    sendMessage,
    leaveRoom,
    sharedKey,
    startCall,
    callStatus,
  } = useChatStore();

  useEffect(() => {
    if (roomId && room?.id !== roomId && connectionStatus === 'idle') {
      joinRoom(roomId);
      // 更新最近房间列表
      const rooms = loadRooms();
      const existingIndex = rooms.findIndex(r => r.id === roomId);
      if (existingIndex !== -1) {
        rooms[existingIndex].createdAt = Date.now();
        saveRooms(rooms);
      }
    }
    const timer = setTimeout(() => setIsJoining(false), 500);
    return () => clearTimeout(timer);
  }, [roomId, room?.id, connectionStatus, joinRoom]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const handleDisabledClick = () => {
    if (!sharedKey) {
      setShowTip(true);
      setTimeout(() => setShowTip(false), 2000);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !sharedKey) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      sendMessage(result, 'image', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !sharedKey) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      sendMessage(result, 'file', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const startRecording = async () => {
    if (!sharedKey) {
      handleDisabledClick();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = (event) => {
          const result = event.target?.result as string;
          sendMessage(result, 'voice', {
            duration: recordingTime,
            fileName: '语音.webm',
            fileSize: audioBlob.size,
            fileType: 'audio/webm',
          });
        };
        reader.readAsDataURL(audioBlob);

        stream.getTracks().forEach(track => track.stop());
        setRecordingTime(0);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      recordingTimerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (e) {
      console.error('Failed to start recording:', e);
      alert('无法访问麦克风，请检查权限设置');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };

  const handleStartVoiceCall = async () => {
    if (!sharedKey) {
      handleDisabledClick();
      setShowMenu(false);
      return;
    }
    setShowMenu(false);
    startCall('voice');
  };

  const handleStartVideoCall = async () => {
    if (!sharedKey) {
      handleDisabledClick();
      setShowMenu(false);
      return;
    }
    setShowMenu(false);
    startCall('video');
  };

  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const shouldShowDate = (index: number) => {
    if (index === 0) return true;
    const currentDate = formatDate(messages[index].timestamp);
    const prevDate = formatDate(messages[index - 1].timestamp);
    return currentDate !== prevDate;
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'waiting':
        return '等待对方加入...';
      case 'connecting':
        return '正在建立安全连接...';
      case 'connected':
        return '加密连接已建立';
      default:
        return '连接中...';
    }
  };

  if (isJoining) {
    return (
      <div className="min-h-screen bg-[#EDEDED] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#07C160] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">正在进入房间...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen chat-bg flex flex-col">
      <CallModal />

      {showTip && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm shadow-lg animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>请等待对方加入并建立加密连接后再发送消息</span>
          </div>
        </div>
      )}

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
            {connectionStatus === 'connected' ? (
              <>
                <Shield className="w-3 h-3 text-[#07C160]" />
                <span className="text-xs text-[#07C160]">端对端加密</span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
                <span className="text-xs text-orange-500">{getStatusText()}</span>
              </>
            )}
          </div>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 -mr-2 text-gray-600 hover:text-gray-800 active:opacity-70"
          >
            <MoreVertical className="w-6 h-6" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-100 py-1 min-w-[140px] z-20">
              <button
                onClick={handleStartVoiceCall}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <Phone className="w-4 h-4" />
                语音通话
              </button>
              <button
                onClick={handleStartVideoCall}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <Video className="w-4 h-4" />
                视频通话
              </button>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={() => {
                  setShowMenu(false);
                  navigate('/settings');
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <Info className="w-4 h-4" />
                关于
              </button>
            </div>
          )}
        </div>
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
                  <div className="w-3 h-3 bg-orange-400 rounded-full animate-pulse" />
                </div>
              </div>
              <p className="text-gray-700 text-sm mb-2">
                {connectionStatus === 'waiting' ? '等待对方加入房间' : '正在建立安全连接'}
              </p>
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
                  {connectionStatus === 'waiting'
                    ? '将房间号分享给对方，对方加入后将自动建立端对端加密连接。'
                    : '正在与对方进行密钥交换，请稍候...'}
                </p>
                <button
                  onClick={handleCopyRoomId}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-[#07C160]/10 text-[#07C160] rounded-lg text-sm font-medium hover:bg-[#07C160]/20 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      已复制房间号
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      复制房间号
                    </>
                  )}
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

      <div className="bg-white border-t border-gray-100 px-4 py-3 sticky bottom-0 safe-area-bottom">
        {connectionStatus !== 'connected' && (
          <div className="mb-3 px-3 py-2 bg-orange-50 rounded-lg flex items-center gap-2">
            <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
            <span className="text-xs text-orange-600 flex-1">
              {getStatusText()}
            </span>
            <button
              onClick={handleCopyRoomId}
              className="text-xs text-[#07C160] font-medium"
            >
              复制房间号
            </button>
          </div>
        )}

        {isRecording && (
          <div className="mb-3 px-4 py-3 bg-red-50 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm text-red-600">正在录音</span>
              <span className="text-sm text-red-500 font-mono">
                {formatRecordingTime(recordingTime)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  stopRecording();
                  setRecordingTime(0);
                }}
                className="p-2 text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
              <button
                onClick={stopRecording}
                className="px-4 py-1.5 bg-[#07C160] text-white rounded-lg text-sm font-medium hover:bg-[#06AD56]"
              >
                发送
              </button>
            </div>
          </div>
        )}

        <div className="flex items-end gap-2">
          <button
            className={`p-2 -ml-2 transition-colors ${
              sharedKey
                ? 'text-gray-500 hover:text-gray-700'
                : 'text-gray-300'
            }`}
            onClick={() => {
              if (sharedKey) fileInputRef.current?.click();
              else handleDisabledClick();
            }}
          >
            <Paperclip className="w-6 h-6" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
          />

          <button
            className={`p-2 transition-colors ${
              sharedKey
                ? 'text-gray-500 hover:text-gray-700'
                : 'text-gray-300'
            }`}
            onClick={() => {
              if (sharedKey) imageInputRef.current?.click();
              else handleDisabledClick();
            }}
          >
            <Image className="w-6 h-6" />
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />

          <div className="flex-1 bg-gray-100 rounded-2xl px-4 py-2">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={sharedKey ? "输入消息..." : "加密连接建立后即可发送消息"}
              rows={1}
              disabled={!sharedKey || isRecording}
              className="w-full bg-transparent resize-none outline-none text-gray-800 text-[15px] placeholder-gray-400 max-h-32 disabled:cursor-not-allowed"
              style={{ minHeight: '24px' }}
            />
          </div>

          {!inputText.trim() && (
            <button
              className={`p-2 -mr-2 transition-colors ${
                sharedKey
                  ? 'text-gray-500 hover:text-gray-700'
                  : 'text-gray-300 cursor-not-allowed'
              } ${isRecording ? 'text-red-500' : ''}`}
              onClick={() => {
                if (sharedKey) {
                  if (isRecording) stopRecording();
                  else startRecording();
                } else {
                  handleDisabledClick();
                }
              }}
            >
              <Mic className="w-6 h-6" />
            </button>
          )}

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
