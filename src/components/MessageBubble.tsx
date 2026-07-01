import { useState, useRef, useEffect } from 'react';
import type { Message } from '@/types';
import { formatTime, formatDate } from '@/utils';
import {
  Lock,
  FileText,
  Download,
  Play,
  Pause,
  Mic,
  Flame,
  Check,
  CheckCheck,
  Phone,
  Video,
  CornerUpLeft,
  Shield,
} from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showDate?: boolean;
  onLongPress?: (message: Message) => void;
  onReply?: (message: Message) => void;
  onImageClick?: (src: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// 发送方气泡主题色：深森林绿
const OWN_BUBBLE_BG = '#2C5E4E';
const OWN_TEXT_COLOR = '#FFFFFF';

export default function MessageBubble({
  message,
  isOwn,
  showDate,
  onLongPress,
  onReply,
  onImageClick,
}: MessageBubbleProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [burnCountdown, setBurnCountdown] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const longPressTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (longPressTimer.current) {
        window.clearTimeout(longPressTimer.current);
      }
    };
  }, []);

  // 阅后即焚倒计时：自己发的消息在对方已读后开始，接收到的消息阅读后开始
  useEffect(() => {
    if (message.recalled || message.type === 'system') return;
    const burn = message.burnAfterRead;
    if (!burn || burn <= 0) return;
    const shouldStart = isOwn ? !!message.read : true;
    if (shouldStart) setBurnCountdown(burn);
  }, [message.burnAfterRead, message.read, message.recalled, message.type, isOwn]);

  useEffect(() => {
    if (burnCountdown === null || burnCountdown <= 0) return;
    const timer = window.setInterval(() => {
      setBurnCountdown((prev) => (prev === null ? null : prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [burnCountdown]);

  const handlePlayVoice = () => {
    if (message.type !== 'voice') return;
    if (!audioRef.current) {
      const audio = new Audio(message.content);
      audioRef.current = audio;
      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        setCurrentTime(0);
      });
      audio.addEventListener('timeupdate', () => {
        setCurrentTime(audio.currentTime);
      });
    }
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    }
  };

  const handleDownload = async () => {
    if (message.type !== 'file') return;
    
    const content = message.content;
    const getFileUrl = useChatStore.getState().getFileUrl;
    
    if (content.startsWith('data:') || content.startsWith('blob:')) {
      const link = document.createElement('a');
      link.href = content;
      link.download = message.fileName || 'file';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const url = await getFileUrl(content);
      if (url) {
        const link = document.createElement('a');
        link.href = url;
        link.download = message.fileName || 'file';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        alert('文件未找到，可能已被清理');
      }
    }
  };

  const handleImageClick = () => {
    if (message.type === 'image' && onImageClick) {
      onImageClick(message.content);
    }
  };

  const startLongPress = () => {
    if (!onLongPress) return;
    longPressTimer.current = window.setTimeout(() => {
      onLongPress(message);
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!onLongPress) return;
    e.preventDefault();
    onLongPress(message);
  };

  const renderDateDivider = () => (
    <div className="text-center my-3">
      <span className="text-xs text-gray-400 bg-gray-200/60 px-3 py-1 rounded-full">
        {formatDate(message.timestamp)} {formatTime(message.timestamp)}
      </span>
    </div>
  );

  // 系统消息：居中灰色标签
  if (message.type === 'system') {
    return (
      <div className="flex flex-col">
        {showDate && renderDateDivider()}
        <div className="flex justify-center my-2 px-4">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-200/70 px-3 py-1.5 rounded-md max-w-[80%]">
            <Shield className="w-3 h-3 text-gray-400 flex-shrink-0" />
            <span className="break-all">{message.content}</span>
          </div>
        </div>
      </div>
    );
  }

  // 撤回消息：灰色提示
  if (message.recalled) {
    return (
      <div className="flex flex-col">
        {showDate && renderDateDivider()}
        <div className="flex justify-center my-2 px-4">
          <span className="text-xs text-gray-400">
            {isOwn ? '你撤回了一条消息' : `${message.senderName}撤回了一条消息`}
          </span>
        </div>
      </div>
    );
  }

  const burnActive = burnCountdown !== null && burnCountdown > 0;

  // 引用回复预览条
  const renderReplyPreview = () => {
    if (!message.replyTo) return null;
    return (
      <div
        className={`flex items-center gap-1.5 mb-1.5 px-2 py-1 rounded-md text-xs ${
          isOwn ? 'bg-black/15' : 'bg-gray-100'
        }`}
      >
        <CornerUpLeft className="w-3 h-3 flex-shrink-0 opacity-60" />
        <div className="flex-1 min-w-0">
          <span className={`font-medium ${isOwn ? 'opacity-90' : 'text-gray-500'}`}>
            {message.replyTo.senderName}:
          </span>
          <span className={`ml-1 truncate ${isOwn ? 'opacity-80' : 'text-gray-600'}`}>
            {message.replyTo.type === 'image'
              ? '[图片]'
              : message.replyTo.type === 'file'
                ? '[文件]'
                : message.replyTo.type === 'voice'
                  ? '[语音]'
                  : message.replyTo.type === 'call_record'
                    ? '[通话]'
                    : message.replyTo.content}
          </span>
        </div>
      </div>
    );
  };

  // 通话记录消息
  const renderCallRecord = () => {
    const isVideo = message.callType === 'video';
    const missed = message.callStatus === 'missed';
    const statusText =
      message.callStatus === 'incoming'
        ? '已接听'
        : message.callStatus === 'outgoing'
          ? '已拨出'
          : message.callStatus === 'missed'
            ? '未接听'
            : '已接听';
    return (
      <div className="flex items-center gap-3 min-w-[180px]">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
            missed ? 'bg-red-100' : isOwn ? 'bg-white/20' : 'bg-green-100'
          }`}
        >
          {isVideo ? (
            <Video className={`w-5 h-5 ${isOwn ? 'text-white' : missed ? 'text-red-500' : 'text-green-600'}`} />
          ) : (
            <Phone className={`w-5 h-5 ${isOwn ? 'text-white' : missed ? 'text-red-500' : 'text-green-600'}`} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${isOwn ? 'text-white' : 'text-gray-800'}`}>
            {isVideo ? '视频通话' : '语音通话'}
          </p>
          <p className={`text-xs ${isOwn ? 'text-white/70' : missed ? 'text-red-500' : 'text-gray-500'}`}>
            {statusText}
            {message.callDuration ? ` · ${formatDuration(message.callDuration)}` : ''}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col">
      {showDate && renderDateDivider()}

      <div
        className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-3 px-4 animate-message-in`}
      >
        {!isOwn && (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-medium mr-2 flex-shrink-0">
            {message.senderName.charAt(0)}
          </div>
        )}

        <div className={`flex flex-col max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
          {!isOwn && (
            <span className="text-xs text-gray-400 mb-1 ml-1">{message.senderName}</span>
          )}

          <div className="flex items-end gap-1">
            {isOwn && <Lock className="w-3 h-3 text-green-500 flex-shrink-0 mb-2" />}

            <div
              className="flex flex-col"
              onTouchStart={startLongPress}
              onTouchEnd={cancelLongPress}
              onTouchMove={cancelLongPress}
              onContextMenu={handleContextMenu}
            >
              {/* 引用回复预览条 */}
              {renderReplyPreview()}

              <div
                className={`relative px-4 py-2.5 rounded-2xl break-words ${
                  isOwn ? 'rounded-tr-sm' : 'bg-white rounded-tl-sm shadow-sm text-gray-800'
                } ${message.type === 'image' ? 'p-1' : ''} ${message.type === 'voice' ? 'min-w-[140px]' : ''}`}
                style={
                  isOwn
                    ? { backgroundColor: OWN_BUBBLE_BG, color: OWN_TEXT_COLOR }
                    : undefined
                }
              >
                {message.type === 'text' && (
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{message.content}</p>
                )}

                {message.type === 'image' && (
                  <img
                    src={message.content}
                    alt="图片"
                    className="max-w-[200px] max-h-[300px] rounded-lg object-cover cursor-pointer"
                    onClick={handleImageClick}
                  />
                )}

                {message.type === 'file' && (
                  <div className="flex items-center gap-3 min-w-[200px]">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isOwn ? 'bg-white/20' : 'bg-blue-100'
                      }`}
                    >
                      <FileText className={`w-5 h-5 ${isOwn ? 'text-white' : 'text-blue-500'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isOwn ? 'text-white' : 'text-gray-800'}`}>
                        {message.fileName || '文件'}
                      </p>
                      <p className={`text-xs ${isOwn ? 'text-white/70' : 'text-gray-500'}`}>
                        {formatFileSize(message.fileSize || 0)}
                      </p>
                    </div>
                    <button
                      onClick={handleDownload}
                      className={`p-2 transition-colors flex-shrink-0 ${
                        isOwn ? 'text-white/80 hover:text-white' : 'text-gray-400 hover:text-blue-500'
                      }`}
                    >
                      <Download className="w-5 h-5" />
                    </button>
                  </div>
                )}

                {message.type === 'voice' && (
                  <div
                    className="flex items-center gap-2 min-w-[140px] cursor-pointer"
                    onClick={handlePlayVoice}
                  >
                    <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                      {isPlaying ? (
                        <Pause className={`w-5 h-5 ${isOwn ? 'text-white' : 'text-gray-700'}`} />
                      ) : (
                        <Play className={`w-5 h-5 ml-0.5 ${isOwn ? 'text-white' : 'text-gray-700'}`} />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className={`h-1 rounded-full overflow-hidden ${isOwn ? 'bg-white/30' : 'bg-gray-300'}`}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${message.duration ? (currentTime / message.duration) * 100 : 0}%`,
                            backgroundColor: isOwn ? '#FFFFFF' : '#2C5E4E',
                          }}
                        />
                      </div>
                      <p className={`text-xs mt-1 ${isOwn ? 'text-white/70' : 'text-gray-500'}`}>
                        {formatDuration(message.duration || 0)}
                      </p>
                    </div>
                    <Mic className={`w-4 h-4 flex-shrink-0 ${isOwn ? 'text-white/70' : 'text-gray-500'}`} />
                  </div>
                )}

                {message.type === 'call_record' && renderCallRecord()}
              </div>
            </div>

            {!isOwn && <Lock className="w-3 h-3 text-green-500 flex-shrink-0 mb-2" />}
          </div>

          {/* 底部元信息：时间、已读状态、阅后即焚标识 */}
          <div className={`flex items-center gap-1 mt-1 ${isOwn ? 'mr-1 flex-row-reverse' : 'ml-1'}`}>
            <span className="text-[11px] text-gray-400">{formatTime(message.timestamp)}</span>

            {isOwn && (
              <span className="flex items-center">
                {message.read ? (
                  <CheckCheck className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <Check className="w-3.5 h-3.5 text-gray-400" />
                )}
                <span className="text-[11px] text-gray-400 ml-0.5">
                  {message.read ? '已读' : '未读'}
                </span>
              </span>
            )}

            {burnActive && (
              <span className="flex items-center text-orange-500">
                <Flame className="w-3.5 h-3.5" />
                <span className="text-[11px] ml-0.5">{burnCountdown}s</span>
              </span>
            )}

            {onReply && (
              <button
                onClick={() => onReply(message)}
                className="p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
                title="回复"
              >
                <CornerUpLeft className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {isOwn && (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-sm font-medium ml-2 flex-shrink-0">
            我
          </div>
        )}
      </div>
    </div>
  );
}
