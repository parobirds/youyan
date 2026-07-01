import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Send,
  Shield,
  MoreVertical,
  Image as ImageIcon,
  Copy,
  Check,
  Paperclip,
  Mic,
  Phone,
  Video,
  X,
  Info,
  AlertCircle,
  Reply,
  Trash2,
  RotateCcw,
  Flame,
  LogOut,
  Monitor,
} from 'lucide-react';
import MessageBubble from '@/components/MessageBubble';
import CallModal from '@/components/CallModal';
import ScreenShareModal from '@/components/ScreenShareModal';
import { useChatStore } from '@/store/useChatStore';
import { useScreenShareStore } from '@/store/useScreenShareStore';
import { formatDate } from '@/utils';
import { loadRooms, saveRooms } from '@/storage';
import { signalChannel } from '@/signal/channel';
import type { Message, BurnMode } from '@/types';

const BURN_MODES: { value: BurnMode; label: string }[] = [
  { value: 0, label: '普通' },
  { value: 10, label: '10s' },
  { value: 30, label: '30s' },
  { value: 60, label: '60s' },
];

const RECALL_LIMIT = 2 * 60 * 1000;

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
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [actionMsg, setActionMsg] = useState<Message | null>(null);
  const [showDissolveConfirm, setShowDissolveConfirm] = useState(false);
  const [showScreenShare, setShowScreenShare] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const pressTimerRef = useRef<number | null>(null);

  const {
    messages,
    connectionStatus,
    myId,
    myName,
    room,
    joinRoom,
    sendMessage,
    leaveRoom,
    sharedKey,
    startCall,
    burnMode,
    setBurnMode,
    recallMessage,
    deleteMessage,
    dissolveRoom,
    handleScreenshot,
  } = useChatStore();

  useEffect(() => {
    if (roomId && room?.id !== roomId && connectionStatus === 'idle') {
      joinRoom(roomId);
      // 更新最近房间列表
      const rooms = loadRooms();
      const existingIndex = rooms.findIndex((r) => r.id === roomId);
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

  // 截屏检测：监听 PrintScreen 键
  useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key !== 'PrintScreen') return;
      if (!sharedKey || !room) return;
      try {
        signalChannel.send('screenshot', {}, myId, myName);
        handleScreenshot(myName);
      } catch (err) {
        console.error('Screenshot signal failed:', err);
      }
    };
    window.addEventListener('keyup', handleKeyUp);
    return () => window.removeEventListener('keyup', handleKeyUp);
  }, [sharedKey, room, myId, myName, handleScreenshot]);

  // 组件卸载清理定时器
  useEffect(() => {
    return () => {
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  // 监听屏幕共享状态变化，收到请求时自动打开弹窗
  const screenShareStatus = useScreenShareStore((state) => state.status);
  const screenStream = useScreenShareStore((state) => state.screenStream);

  useEffect(() => {
    if (screenShareStatus === 'requesting' && !screenStream) {
      setShowScreenShare(true);
    }
    if (screenShareStatus === 'idle') {
      setShowScreenShare(false);
    }
  }, [screenShareStatus, screenStream]);

  const buildReplyMeta = (): Partial<Message> => {
    if (!replyTo) return {};
    return {
      replyTo: {
        id: replyTo.id,
        content: replyTo.content,
        senderName: replyTo.senderName,
        type: replyTo.type,
      },
    };
  };

  const handleSend = () => {
    if (!inputText.trim() || !sharedKey) return;
    sendMessage(inputText.trim(), 'text', buildReplyMeta());
    setInputText('');
    setReplyTo(null);
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

  // 图片压缩后最大尺寸
  const MAX_IMAGE_WIDTH = 800;
  const MAX_IMAGE_HEIGHT = 1200;

  // 压缩图片
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // 按比例缩放
        if (width > MAX_IMAGE_WIDTH) {
          height = (height * MAX_IMAGE_WIDTH) / width;
          width = MAX_IMAGE_WIDTH;
        }
        if (height > MAX_IMAGE_HEIGHT) {
          width = (width * MAX_IMAGE_HEIGHT) / height;
          height = MAX_IMAGE_HEIGHT;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('无法创建 canvas'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        
        // 使用 0.8 质量压缩
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = URL.createObjectURL(file);
    });
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !sharedKey) return;
    
    try {
      // 压缩图片
      const compressedDataUrl = await compressImage(file);
      
      sendMessage(compressedDataUrl, 'image', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        ...buildReplyMeta(),
      });
      setReplyTo(null);
    } catch (err) {
      console.error('图片处理失败:', err);
      alert('图片处理失败，请重试');
    }
    e.target.value = '';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !sharedKey) return;
    
    const { sendFile } = useChatStore.getState();
    sendFile(file);
    
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
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
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
            ...buildReplyMeta(),
          });
          setReplyTo(null);
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
        setRecordingTime(0);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
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

  const handleDissolveRoom = () => {
    setShowMenu(false);
    setShowDissolveConfirm(true);
  };

  const confirmDissolve = () => {
    setShowDissolveConfirm(false);
    dissolveRoom();
    navigate('/');
  };

  // 长按消息处理
  const handleTouchStart = (_e: React.TouchEvent, message: Message) => {
    if (message.type === 'system' || message.recalled) return;
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    pressTimerRef.current = window.setTimeout(() => {
      setActionMsg(message);
      if (navigator.vibrate) navigator.vibrate(50);
    }, 500);
  };

  const clearPressTimer = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const handleContextMenu = (e: React.MouseEvent, message: Message) => {
    if (message.type === 'system' || message.recalled) return;
    e.preventDefault();
    setActionMsg(message);
  };

  const canRecall = (message: Message | null) => {
    if (!message) return false;
    return (
      message.senderId === myId &&
      !message.recalled &&
      message.type !== 'system' &&
      Date.now() - message.timestamp < RECALL_LIMIT
    );
  };

  const canReply = (message: Message | null) => {
    if (!message) return false;
    return !message.recalled && message.type !== 'system';
  };

  const canBurn = (message: Message | null) => {
    if (!message) return false;
    return message.senderId === myId && !message.recalled && message.type !== 'system';
  };

  const handleRecall = () => {
    if (actionMsg) recallMessage(actionMsg.id);
    setActionMsg(null);
  };

  const handleReplyAction = () => {
    if (actionMsg) setReplyTo(actionMsg);
    setActionMsg(null);
  };

  const handleDeleteAction = () => {
    if (actionMsg) deleteMessage(actionMsg.id);
    setActionMsg(null);
  };

  const handleBurnAction = () => {
    if (actionMsg) {
      const { burnMessage } = useChatStore.getState();
      burnMessage(actionMsg.id);
    }
    setActionMsg(null);
  };

  const getReplyPreviewText = (message: Message) => {
    switch (message.type) {
      case 'image':
        return '[图片]';
      case 'voice':
        return '[语音]';
      case 'file':
        return '[文件]';
      default:
        return message.content;
    }
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
          <div className="w-12 h-12 border-4 border-[#2C5E4E] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">正在进入房间...</p>
        </div>
      </div>
    );
  }

  // 房间已被对方解散
  if (room?.dissolved) {
    return (
      <div className="min-h-screen bg-[#EDEDED] flex items-center justify-center px-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <LogOut className="w-8 h-8 text-gray-500" />
          </div>
          <p className="text-gray-700 text-base mb-2">聊天室已解散</p>
          <p className="text-gray-400 text-sm mb-6">对方已解散该聊天室</p>
          <button
            onClick={handleBack}
            className="px-6 py-2 bg-[#2C5E4E] text-white rounded-lg text-sm font-medium hover:bg-[#1F4338]"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen chat-bg flex flex-col">
      <CallModal />
      {showScreenShare && (
        <ScreenShareModal
          onClose={() => setShowScreenShare(false)}
          myId={myId}
          myName={myName}
        />
      )}

      {showTip && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm shadow-lg animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>请等待对方加入并建立加密连接后再发送消息</span>
          </div>
        </div>
      )}

      {/* 顶部标题栏 */}
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
                <Shield className="w-3 h-3 text-[#2C5E4E]" />
                <span className="text-xs text-[#2C5E4E]">端对端加密</span>
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
                  setShowScreenShare(true);
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <Monitor className="w-4 h-4" />
                屏幕共享
              </button>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={handleDissolveRoom}
                className="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-red-50 flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                解散房间
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

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto py-4">
        {messages.length === 0 && (
          <div className="text-center py-12 px-6">
            {connectionStatus === 'connected' ? (
              <>
                <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-8 h-8 text-[#2C5E4E]" />
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
                    className="p-1.5 text-gray-400 hover:text-[#2C5E4E] transition-colors"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-[#2C5E4E]" />
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
                    className="w-full flex items-center justify-center gap-2 py-2 bg-[#2C5E4E]/10 text-[#2C5E4E] rounded-lg text-sm font-medium hover:bg-[#2C5E4E]/20 transition-colors"
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

        {messages.map((message, index) =>
          message.recalled ? (
            <div key={message.id} className="flex flex-col">
              {shouldShowDate(index) && (
                <div className="text-center my-3">
                  <span className="text-xs text-gray-400 bg-gray-200/60 px-3 py-1 rounded-full">
                    {formatDate(message.timestamp)}
                  </span>
                </div>
              )}
              <div className="text-center my-2 px-4">
                <span className="text-xs text-gray-400 bg-gray-200/60 px-3 py-1 rounded-full">
                  {message.senderId === myId ? '你' : message.senderName} 撤回了一条消息
                </span>
              </div>
            </div>
          ) : (
            <div
              key={message.id}
              onTouchStart={(e) => handleTouchStart(e, message)}
              onTouchEnd={clearPressTimer}
              onTouchMove={clearPressTimer}
              onContextMenu={(e) => handleContextMenu(e, message)}
              className={message.type === 'system' ? '' : 'select-none'}
            >
              <MessageBubble
                message={message}
                isOwn={message.senderId === myId}
                showDate={shouldShowDate(index)}
              />
            </div>
          )
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 底部输入区 */}
      <div className="bg-white border-t border-gray-100 px-4 py-3 sticky bottom-0 safe-area-bottom">
        {connectionStatus !== 'connected' && (
          <div className="mb-3 px-3 py-2 bg-orange-50 rounded-lg flex items-center gap-2">
            <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
            <span className="text-xs text-orange-600 flex-1">{getStatusText()}</span>
            <button
              onClick={handleCopyRoomId}
              className="text-xs text-[#2C5E4E] font-medium"
            >
              复制房间号
            </button>
          </div>
        )}

        {/* 阅后即焚模式选择器 */}
        {sharedKey && (
          <div className="mb-2 flex items-center gap-2">
            <Flame
              className={`w-4 h-4 flex-shrink-0 ${burnMode > 0 ? 'text-orange-500' : 'text-gray-400'}`}
            />
            <div className="flex items-center gap-1.5">
              {BURN_MODES.map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => setBurnMode(mode.value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    burnMode === mode.value
                      ? 'bg-[#2C5E4E] text-white'
                      : mode.value > 0
                        ? 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 引用回复预览条 */}
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
            <Reply className="w-4 h-4 text-[#2C5E4E] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500">回复 {replyTo.senderName}</p>
              <p className="text-sm text-gray-700 truncate">
                {getReplyPreviewText(replyTo)}
              </p>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              className="p-1 text-gray-400 hover:text-gray-600 flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 录音指示器 */}
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
                className="px-4 py-1.5 bg-[#2C5E4E] text-white rounded-lg text-sm font-medium hover:bg-[#1F4338]"
              >
                发送
              </button>
            </div>
          </div>
        )}

        {/* 输入行 */}
        <div className="flex items-end gap-2">
          <button
            className={`p-2 -ml-2 transition-colors ${
              sharedKey ? 'text-gray-500 hover:text-gray-700' : 'text-gray-300'
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
              sharedKey ? 'text-gray-500 hover:text-gray-700' : 'text-gray-300'
            }`}
            onClick={() => {
              if (sharedKey) imageInputRef.current?.click();
              else handleDisabledClick();
            }}
          >
            <ImageIcon className="w-6 h-6" />
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
              placeholder={sharedKey ? '输入消息...' : '加密连接建立后即可发送消息'}
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
              className="p-2 bg-[#2C5E4E] text-white rounded-full hover:bg-[#1F4338] active:scale-95 transition-all"
            >
              <Send className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* 消息长按操作菜单 */}
      {actionMsg && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setActionMsg(null)}
          />
          <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl p-4 z-50 animate-slide-up safe-area-bottom">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
            <div className="space-y-1">
              {canRecall(actionMsg) && (
                <button
                  onClick={handleRecall}
                  className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 rounded-lg flex items-center gap-3"
                >
                  <RotateCcw className="w-5 h-5 text-gray-500" />
                  撤回
                </button>
              )}
              {canReply(actionMsg) && (
                <button
                  onClick={handleReplyAction}
                  className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 rounded-lg flex items-center gap-3"
                >
                  <Reply className="w-5 h-5 text-gray-500" />
                  回复
                </button>
              )}
              {canBurn(actionMsg) && (
                <button
                  onClick={handleBurnAction}
                  className="w-full px-4 py-3 text-left text-sm text-orange-500 hover:bg-orange-50 rounded-lg flex items-center gap-3"
                >
                  <Flame className="w-5 h-5" />
                  焚毁
                </button>
              )}
              <button
                onClick={handleDeleteAction}
                className="w-full px-4 py-3 text-left text-sm text-red-500 hover:bg-red-50 rounded-lg flex items-center gap-3"
              >
                <Trash2 className="w-5 h-5" />
                删除
              </button>
            </div>
            <button
              onClick={() => setActionMsg(null)}
              className="w-full mt-3 py-3 text-center text-sm text-gray-600 bg-gray-100 rounded-lg font-medium"
            >
              取消
            </button>
          </div>
        </>
      )}

      {/* 解散房间确认弹窗 */}
      {showDissolveConfirm && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setShowDissolveConfirm(false)}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl p-6 z-50 w-[80%] max-w-sm animate-fade-in">
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <LogOut className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-base font-medium text-gray-800 mb-2">解散聊天室？</h3>
              <p className="text-sm text-gray-500">
                解散后双方都将退出该聊天室，聊天记录将无法恢复。
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDissolveConfirm(false)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
              >
                取消
              </button>
              <button
                onClick={confirmDissolve}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600"
              >
                解散
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
