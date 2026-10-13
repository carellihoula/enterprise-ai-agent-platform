'use client';

/**
 * ChatMessageItem component with modern ChatGPT / Gemini styling.
 * Renders user messages as refined conversational bubbles and assistant messages
 * with rich Markdown, GitHub-flavored tables, code blocks with syntax highlighting, copy actions,
 * and React.memo optimization to ensure zero UI lag.
 */

import React, { useState, memo } from 'react';
import { Message } from '@/types/chat';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import {
  Bot,
  User,
  Sparkles,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, cleanSerializedContentBlocks } from '@/lib/utils';

interface ChatMessageItemProps {
  message: Message;
  isStreaming?: boolean;
  onRetry?: () => void;
}

const BaseChatMessageItem: React.FC<ChatMessageItemProps> = ({
  message,
  isStreaming = false,
  onRetry,
}) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'liked' | 'disliked' | null>(null);

  const handleCopyMessage = async () => {
    try {
      // [Clipboard] Normalize serialized blocks and convert raw <br> tags to standard newlines for external editors
      const cleanContent = cleanSerializedContentBlocks(message.content).replace(/<br\s*\/?>/gi, '\n');
      await navigator.clipboard.writeText(cleanContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  };

  return (
    <div className="w-full py-4 px-4 md:px-6 flex justify-center group transition-colors">
      {/* [Layout] Expanded container width to provide ample horizontal canvas for rich tables and code */}
      <div className="max-w-5xl w-full flex flex-col gap-2">
        {/* User Message Layout: Sleek Right-Aligned Bubble */}
        {isUser ? (
          <div className="flex flex-col items-end self-end max-w-[85%] sm:max-w-[75%] space-y-1">
            <div className="flex items-center gap-2 px-1">
              <span className="text-[11px] font-semibold text-zinc-400">You</span>
            </div>
            <div className="bg-zinc-100 text-zinc-900 rounded-3xl rounded-tr-md px-4 py-2.5 text-sm leading-relaxed shadow-2xs font-normal border border-zinc-200/60 break-words whitespace-pre-wrap">
              {message.content}
            </div>
            {/* Copy button for User Message (icon only, displayed on hover) */}
            <div
              className={cn(
                'flex items-center pr-1 pt-0.5 transition-opacity duration-150',
                copied ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              )}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopyMessage}
                title={copied ? 'Copied' : 'Copy'}
                className="h-6 w-6 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md"
              >
                {copied ? (
                  <Check className="w-3 h-3 text-zinc-700" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </Button>
            </div>
          </div>
        ) : (
          /* Assistant Message Layout: Left-Aligned Rich Canvas */
          <div className="flex items-start gap-3.5 w-full">
            {/* Assistant Avatar */}
            <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-indigo-500/20 mt-1">
              <Sparkles className="w-3.5 h-3.5" />
            </div>

            <div className="flex-1 space-y-1.5 min-w-0">
              {/* Header: Agent Identity */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-900">
                  Enterprise Agent
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {message.created_at
                    ? new Date(message.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Just now'}
                </span>
              </div>

              {/* Rich Markdown & Table Content */}
              <div className="min-w-0">
                <MarkdownRenderer content={message.content} isStreaming={isStreaming} />
                {isStreaming && (
                  <span className="inline-block w-2 h-4 ml-1 bg-indigo-600 animate-pulse rounded-2xs align-middle" />
                )}
              </div>

              {/* Bottom Action Toolbar (Always visible, even without hover) */}
              {!isStreaming && message.content && (
                <div className="flex items-center gap-1 pt-1 text-zinc-400">
                  {/* Copy Response Button (icon only, neutral check) */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCopyMessage}
                    title={copied ? 'Copied' : 'Copy response'}
                    className="h-7 w-7 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-zinc-700" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </Button>

                  {/* Feedback: Thumbs Up */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setFeedback(feedback === 'liked' ? null : 'liked')}
                    title="Good response"
                    className={cn(
                      'h-7 w-7 rounded-lg hover:bg-zinc-100',
                      feedback === 'liked' ? 'text-indigo-600 bg-indigo-50' : 'text-zinc-400 hover:text-zinc-700'
                    )}
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                  </Button>

                  {/* Feedback: Thumbs Down */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setFeedback(feedback === 'disliked' ? null : 'disliked')}
                    title="Poor response"
                    className={cn(
                      'h-7 w-7 rounded-lg hover:bg-zinc-100',
                      feedback === 'disliked' ? 'text-rose-600 bg-rose-50' : 'text-zinc-400 hover:text-zinc-700'
                    )}
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                  </Button>

                  {/* Retry / Regenerate */}
                  {onRetry && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onRetry}
                      title="Regenerate response"
                      className="h-7 w-7 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// [Performance] Memoize to avoid re-rendering entire conversation history on state changes
export const ChatMessageItem = memo(BaseChatMessageItem, (prev, next) => {
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.isStreaming === next.isStreaming
  );
});
