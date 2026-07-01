import { useState, useRef, useEffect } from 'react';
import type { Message } from '@/types';
import { formatTime, formatDate } from '@/utils';
import { Lock, FileText, Download, Play, Pause, Mic } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showDate?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function MessageBubble({ message, isOwn, showDate }: MessageBubbleProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handlePlayVoice = () => {
    if (!audioRef.current && message.type === 'voice') {
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
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = message.content;
    link.download = message.fileName || 'file';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col">
      {showDate && (
        <div className="text-center my-3">
          <span className="text-xs text-gray-400 bg-gray-200/60 px-3 py-1 rounded-full">
            {formatDate(message.timestamp)} {formatTime(message.timestamp)}
          </span>
        </div>
      )}

      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-3 px-4 animate-message-in`}>
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
            {isOwn && (
              <Lock className="w-3 h-3 text-green-500 flex-shrink-0 mb-2" />
            )}
            <div
              className={`relative px-4 py-2.5 rounded-2xl text-gray-800 break-words ${
                isOwn
                  ? 'bg-[#95EC69] rounded-tr-sm'
                  : 'bg-white rounded-tl-sm shadow-sm'
              } ${message.type === 'image' ? 'p-1' : ''} ${message.type === 'voice' ? 'min-w-[120px]' : ''}`}
            >
              {message.type === 'text' && (
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
                  {message.content}
                </p>
              )}

              {message.type === 'image' && (
                <img
                  src={message.content}
                  alt="图片"
                  className="max-w-[200px] max-h-[300px] rounded-lg object-cover"
                />
              )}

              {message.type === 'file' && (
                <div className="flex items-center gap-3 min-w-[200px]">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{message.fileName || '文件'}</p>
                    <p className="text-xs text-gray-500">{formatFileSize(message.fileSize || 0)}</p>
                  </div>
                  <button
                    onClick={handleDownload}
                    className="p-2 text-gray-400 hover:text-blue-500 transition-colors flex-shrink-0"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                </div>
              )}

              {message.type === 'voice' && (
                <div className="flex items-center gap-2 min-w-[120px] cursor-pointer" onClick={handlePlayVoice}>
                  <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                    {isPlaying ? (
                      <Pause className="w-5 h-5 text-gray-700" />
                    ) : (
                      <Play className="w-5 h-5 text-gray-700 ml-0.5" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="h-1 bg-gray-300 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isOwn ? 'bg-green-600' : 'bg-blue-500'}`}
                        style={{ width: `${message.duration ? (currentTime / message.duration) * 100 : 0}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatDuration(message.duration || 0)}
                    </p>
                  </div>
                  <Mic className="w-4 h-4 text-gray-500 flex-shrink-0" />
                </div>
              )}
            </div>
            {!isOwn && (
              <Lock className="w-3 h-3 text-green-500 flex-shrink-0 mb-2" />
            )}
          </div>
          <span className={`text-[11px] text-gray-400 mt-1 ${isOwn ? 'mr-1' : 'ml-1'}`}>
            {formatTime(message.timestamp)}
          </span>
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
