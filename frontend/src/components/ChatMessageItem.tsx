'use client';

/**
 * ChatMessageItem component with light theme formatting.
 */

import React from 'react';
import { Message } from '@/types/chat';
import { Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatMessageItemProps {
  message: Message;
  isStreaming?: boolean;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
  message,
  isStreaming = false,
}) => {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'py-5 px-4 md:px-6 w-full flex justify-center border-b border-zinc-100',
        isUser ? 'bg-white' : 'bg-zinc-50/60'
      )}
    >
      <div className="max-w-3xl w-full flex gap-4 text-zinc-900">
        {/* Avatar Icon */}
        <div
          className={cn(
            'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold shadow-sm mt-0.5',
            isUser
              ? 'bg-zinc-100 text-zinc-700 border border-zinc-200'
              : 'bg-indigo-600 text-white'
          )}
        >
          {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
        </div>

        {/* Message Content */}
        <div className="flex-1 space-y-1 min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500">
            <span>{isUser ? 'You' : 'Assistant'}</span>
            {message.created_at && (
              <span className="text-[10px] text-zinc-400 font-normal">
                {new Date(message.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>

          <div className="text-sm leading-7 whitespace-pre-wrap break-words text-zinc-800 font-normal">
            {message.content}
            {isStreaming && (
              <span className="inline-block w-2 h-4 ml-1 bg-indigo-600 animate-pulse rounded-sm align-middle" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
