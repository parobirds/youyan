import type { Message } from '@/types';
import { formatTime, formatDate } from '@/utils';
import { Lock } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showDate?: boolean;
}

export default function MessageBubble({ message, isOwn, showDate }: MessageBubbleProps) {
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
              }`}
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
                  className="max-w-[200px] rounded-lg"
                />
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
