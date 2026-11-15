import React from "react";
import { FileCode, FileText, Image as ImageIcon, Loader2, X } from "lucide-react";
import { ChatAttachment } from "@/types/chat";
import { getAttachmentContentUrl } from "@/lib/api";

interface AttachmentBadgesProps {
  attachments: ChatAttachment[];
  isUploading?: boolean;
  onRemove?: (attachmentId: string) => void;
  compact?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Displays uploaded chat attachments (images, PDFs, code/text files) with optional removal controls.
 */
export const AttachmentBadges: React.FC<AttachmentBadgesProps> = ({
  attachments,
  isUploading = false,
  onRemove,
  compact = false,
}) => {
  if (attachments.length === 0 && !isUploading) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {attachments.map((att) => (
        <div
          key={att.id}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-800 max-w-[240px]"
        >
          {att.is_image ? (
            <img
              src={getAttachmentContentUrl(att.id)}
              alt={att.filename}
              className={
                compact
                  ? "w-7 h-7 rounded object-cover border border-zinc-200 shrink-0"
                  : "w-8 h-8 rounded object-cover border border-zinc-200 shrink-0"
              }
            />
          ) : att.is_pdf ? (
            <FileText className="w-4 h-4 text-rose-600 shrink-0" />
          ) : att.mime_type.startsWith("image/") ? (
            <ImageIcon className="w-4 h-4 text-blue-600 shrink-0" />
          ) : (
            <FileCode className="w-4 h-4 text-zinc-600 shrink-0" />
          )}

          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-[11px] text-zinc-900">
              {att.filename}
            </div>
            <div className="text-[10px] text-zinc-500">
              {att.is_pdf ? "PDF" : att.is_image ? "Image" : "File"} · {formatBytes(att.size_bytes)}
            </div>
          </div>

          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(att.id)}
              aria-label={`Remove ${att.filename}`}
              className="p-0.5 text-zinc-400 hover:text-zinc-800 rounded transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}

      {isUploading && (
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-700" />
          <span>Uploading...</span>
        </div>
      )}
    </div>
  );
};
